# geosync
GeoSync is an insurance risk analysis platform that transforms raw Sentinel-2 satellite data into actionable risk assessments. 



# 🚀 GeoBridge - Guida Completa al Deployment

## 📋 Panoramica

Questa guida ti accompagna passo dopo passo nel deployment dell'architettura a 3 VM di GeoBridge.

## 🎯 Prerequisiti

### Requisiti Hardware per VM

| VM | CPU | RAM | Disco | OS |
|----|-----|-----|-------|-----|
| VM1 (Frontend) | 1-2 core | 2 GB | 20 GB | Ubuntu 22.04 LTS |
| VM2 (App Server) | 2-4 core | 4-8 GB | 50 GB | Ubuntu 22.04 LTS |
| VM3 (Database) | 2 core | 4 GB | 100 GB | Ubuntu 22.04 LTS |

### Requisiti Software
- Accesso SSH alle 3 VM
- Credenziali Sentinel Hub API
- Dominio (opzionale, per HTTPS)

---

## 🔧 Parte 1: Setup VM3 (Database)

### 1.1 Connessione e Preparazione

```bash
# Connettiti a VM3
ssh user@VM3_IP

# Aggiorna sistema
sudo apt update && sudo apt upgrade -y

# Installa strumenti base
sudo apt install -y vim curl wget git ufw
```

### 1.2 Installazione PostgreSQL

```bash
# Installa PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Verifica installazione
sudo systemctl status postgresql

# Assicurati che parta all'avvio
sudo systemctl enable postgresql
```

### 1.3 Configurazione Database

```bash
# Diventa utente postgres
sudo -u postgres psql

# Nel prompt psql, esegui:
CREATE DATABASE geobridge;
CREATE USER geobridge_user WITH ENCRYPTED PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE geobridge TO geobridge_user;
\q
```

### 1.4 Configurazione Accesso Remoto

```bash
# Modifica postgresql.conf
sudo nano /etc/postgresql/14/main/postgresql.conf

# Trova e modifica:
listen_addresses = '*'

# Salva e esci (CTRL+X, Y, Enter)

# Modifica pg_hba.conf
sudo nano /etc/postgresql/14/main/pg_hba.conf

# Aggiungi alla fine (sostituisci VM2_IP con IP di VM2):
host    all    all    VM2_IP/32    md5

# Salva e riavvia PostgreSQL
sudo systemctl restart postgresql
```

### 1.5 Inizializza Schema Database

```bash
# Crea directory per script
mkdir -p ~/geobridge-db

# Copia i file SQL (dal tuo computer locale o git)
# 01_schema.sql, 02_indexes.sql, 03_seed_data.sql

# Esegui script in ordine
psql -U geobridge_user -d geobridge -h localhost -f 01_schema.sql
psql -U geobridge_user -d geobridge -h localhost -f 02_indexes.sql
psql -U geobridge_user -d geobridge -h localhost -f 03_seed_data.sql

# Verifica
psql -U geobridge_user -d geobridge -h localhost -c "\dt"
```

### 1.6 Setup Backup Automatico

```bash
# Crea directory backup
sudo mkdir -p /var/backups/geobridge

# Copia script backup
sudo nano /usr/local/bin/geobridge-backup.sh

# Incolla contenuto backup.sh e salva

# Rendi eseguibile
sudo chmod +x /usr/local/bin/geobridge-backup.sh

# Testa backup
sudo /usr/local/bin/geobridge-backup.sh

# Aggiungi a crontab per backup giornaliero alle 2 AM
sudo crontab -e

# Aggiungi:
0 2 * * * /usr/local/bin/geobridge-backup.sh
```

### 1.7 Configurazione Firewall VM3

```bash
# Abilita firewall
sudo ufw allow 22/tcp                           # SSH
sudo ufw allow from VM2_IP to any port 5432    # PostgreSQL da VM2
sudo ufw enable
sudo ufw status
```

✅ **VM3 completata!**

---

## 🖥️ Parte 2: Setup VM2 (Application Server)

### 2.1 Connessione e Preparazione

```bash
# Connettiti a VM2
ssh user@VM2_IP

# Aggiorna sistema
sudo apt update && sudo apt upgrade -y

# Installa dipendenze sistema
sudo apt install -y python3 python3-pip python3-venv \
    build-essential libpq-dev git vim curl
```

### 2.2 Setup Utente Applicazione

```bash
# Crea utente dedicato
sudo useradd -m -s /bin/bash geobridge
sudo passwd geobridge  # Imposta password

# Diventa utente geobridge
sudo su - geobridge
```

### 2.3 Setup Progetto

```bash
# Crea struttura directory
mkdir -p ~/app
cd ~/app

# Clona o copia codice progetto
# Opzione 1: Se usi git
git clone https://github.com/tuo-username/geobridge-refactored.git .

# Opzione 2: Copia manualmente
# Trasferisci tutti i file di vm2-appserver/ in ~/app

# Verifica struttura
ls -la
# Dovresti vedere: app/, requirements.txt, wsgi.py, ecc.
```

### 2.4 Setup Virtual Environment

```bash
# Crea virtual environment
python3 -m venv venv

# Attiva
source venv/bin/activate

# Aggiorna pip
pip install --upgrade pip

# Installa dipendenze
pip install -r requirements.txt

# Verifica installazione
pip list
```

### 2.5 Configurazione Environment

```bash
# Crea file .env
nano .env

# Aggiungi (sostituisci con valori reali):
SH_CLIENT_ID=your_sentinel_hub_client_id
SH_CLIENT_SECRET=your_sentinel_hub_client_secret
DATABASE_URL=postgresql://geobridge_user:your_password@VM3_IP:5432/geobridge
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
FLASK_ENV=production
CORS_ORIGINS=http://VM1_IP,https://yourdomain.com

# Salva e proteggi
chmod 600 .env
```

### 2.6 Test Applicazione

```bash
# Test connessione database
python3 << EOF
from app.models.database import Database
Database.initialize_pool()
conn = Database.get_connection()
print("✓ Database connection OK")
Database.return_connection(conn)
EOF

# Test avvio Flask
gunicorn --bind 0.0.0.0:5000 wsgi:app

# Se funziona, fermalo (CTRL+C) e continua
```

### 2.7 Setup Servizio Systemd

```bash
# Esci da utente geobridge
exit

# Crea file servizio
sudo nano /etc/systemd/system/geobridge.service
```

```ini
[Unit]
Description=GeoBridge Application Server
After=network.target

[Service]
Type=notify
User=geobridge
Group=geobridge
WorkingDirectory=/home/geobridge/app
Environment="PATH=/home/geobridge/app/venv/bin"
ExecStart=/home/geobridge/app/venv/bin/gunicorn \
    --config /home/geobridge/app/gunicorn_config.py \
    wsgi:app

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Crea directory log
sudo mkdir -p /var/log/geobridge
sudo chown geobridge:geobridge /var/log/geobridge

# Reload systemd e avvia servizio
sudo systemctl daemon-reload
sudo systemctl start geobridge
sudo systemctl enable geobridge

# Verifica stato
sudo systemctl status geobridge

# Guarda log
sudo journalctl -u geobridge -f
```

### 2.8 Configurazione Firewall VM2

```bash
sudo ufw allow 22/tcp                       # SSH
sudo ufw allow from VM1_IP to any port 5000 # Flask da VM1
sudo ufw enable
sudo ufw status
```

✅ **VM2 completata!**

---

## 🌐 Parte 3: Setup VM1 (Frontend)

### 3.1 Connessione e Preparazione

```bash
# Connettiti a VM1
ssh user@VM1_IP

# Aggiorna sistema
sudo apt update && sudo apt upgrade -y
```

### 3.2 Installazione Apache

```bash
# Installa Apache
sudo apt install -y apache2

# Abilita moduli necessari
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod headers
sudo a2enmod rewrite
sudo a2enmod ssl  # Se userai HTTPS

# Verifica Apache
sudo systemctl status apache2
sudo systemctl enable apache2
```

### 3.3 Setup Struttura Progetto

```bash
# Crea directory applicazione
sudo mkdir -p /var/www/geobridge/{static,templates}

# Copia file statici e template
# Dal tuo computer locale, usa scp o rsync:

# Esempio scp:
# scp -r vm1-frontend/static/* user@VM1_IP:/tmp/static/
# scp -r vm1-frontend/templates/* user@VM1_IP:/tmp/templates/

# Sulla VM1:
sudo mv /tmp/static/* /var/www/geobridge/static/
sudo mv /tmp/templates/* /var/www/geobridge/templates/

# Imposta permessi
sudo chown -R www-data:www-data /var/www/geobridge
sudo chmod -R 755 /var/www/geobridge
```

### 3.4 Configurazione Apache

```bash
# Crea configurazione sito
sudo nano /etc/apache2/sites-available/geobridge.conf
```

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    ServerAdmin admin@yourdomain.com

    # Document root per contenuti statici
    DocumentRoot /var/www/geobridge/static

    # Directory configurations
    <Directory /var/www/geobridge/static>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>

    # Proxy per API verso VM2
    ProxyPreserveHost On
    ProxyPass /api http://VM2_IP:5000/api
    ProxyPassReverse /api http://VM2_IP:5000/api

    # Routing per Single Page Application
    <LocationMatch "^/(dashboard|analysis|login)">
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteRule ^ /templates/index.html [L]
    </LocationMatch>

    # Logging
    ErrorLog ${APACHE_LOG_DIR}/geobridge-error.log
    CustomLog ${APACHE_LOG_DIR}/geobridge-access.log combined

    # Security headers
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
</VirtualHost>
```

```bash
# Disabilita sito default
sudo a2dissite 000-default.conf

# Abilita sito geobridge
sudo a2ensite geobridge.conf

# Test configurazione
sudo apache2ctl configtest

# Se OK, riavvia Apache
sudo systemctl restart apache2
```

### 3.5 (Opzionale) Setup HTTPS con Let's Encrypt

```bash
# Installa certbot
sudo apt install -y certbot python3-certbot-apache

# Ottieni certificato SSL
sudo certbot --apache -d yourdomain.com

# Il certificato si rinnova automaticamente
# Verifica con:
sudo certbot renew --dry-run
```

### 3.6 Configurazione Firewall VM1

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
sudo ufw status
```

✅ **VM1 completata!**

---

## 🧪 Parte 4: Testing Completo

### 4.1 Test Connettività Tra VM

```bash
# Da VM1, testa connessione a VM2
curl http://VM2_IP:5000/api/health

# Dovresti vedere:
# {"status":"healthy","service":"geobridge-app-server","version":"1.0.0"}

# Da VM2, testa connessione a VM3
PGPASSWORD=your_password psql -U geobridge_user -h VM3_IP -d geobridge -c "SELECT 1;"

# Dovresti vedere: 1 row returned
```

### 4.2 Test End-to-End

```bash
# Dal tuo browser, accedi a:
http://VM1_IP  # O http://yourdomain.com

# Dovresti vedere la pagina login

# Credenziali demo:
# Email: admin@customsat.it
# Password: password

# Dopo login:
# 1. Disegna un rettangolo sulla mappa
# 2. Seleziona date
# 3. Clicca "Avvia Analisi"
# 4. Verifica che l'elaborazione completi
```

### 4.3 Verifica Log

```bash
# VM1 - Apache logs
sudo tail -f /var/log/apache2/geobridge-access.log
sudo tail -f /var/log/apache2/geobridge-error.log

# VM2 - Application logs
sudo journalctl -u geobridge -f
sudo tail -f /var/log/geobridge/access.log
sudo tail -f /var/log/geobridge/error.log

# VM3 - PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

---

## 🔄 Parte 5: Operazioni Comuni

### Deploy Aggiornamenti Codice

```bash
# Su VM2
sudo systemctl stop geobridge
sudo su - geobridge
cd ~/app
source venv/bin/activate

# Pull nuovo codice
git pull origin main

# Installa nuove dipendenze
pip install -r requirements.txt

# Riavvia servizio
exit
sudo systemctl start geobridge
sudo systemctl status geobridge
```

### Backup Manuale Database

```bash
# Su VM3
sudo -u postgres pg_dump geobridge > /tmp/geobridge_backup.sql

# Comprimi
gzip /tmp/geobridge_backup.sql

# Scarica sul tuo computer
# Dal tuo computer:
scp user@VM3_IP:/tmp/geobridge_backup.sql.gz ./
```

### Restore Database

```bash
# Su VM3
gunzip geobridge_backup.sql.gz
psql -U geobridge_user -d geobridge -h localhost < geobridge_backup.sql
```

### Monitoraggio Risorse

```bash
# CPU e Memoria
htop

# Spazio disco
df -h

# Connessioni database
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"

# Processi Gunicorn
ps aux | grep gunicorn
```

### Rotazione Log

```bash
# Su VM2
sudo nano /etc/logrotate.d/geobridge
```

```
/var/log/geobridge/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 geobridge geobridge
    sharedscripts
    postrotate
        systemctl reload geobridge > /dev/null 2>&1 || true
    endscript
}
```

---

## 🛡️ Parte 6: Hardening Security

### 6.1 SSH Security

```bash
# Su tutte le VM
sudo nano /etc/ssh/sshd_config

# Modifica:
PermitRootLogin no
PasswordAuthentication no  # Dopo aver configurato chiavi SSH
PubkeyAuthentication yes
Port 2222  # Cambia porta default (opzionale)

# Riavvia SSH
sudo systemctl restart sshd
```

### 6.2 Fail2Ban

```bash
# Installa su tutte le VM
sudo apt install -y fail2ban

# Configura
sudo nano /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log
```

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 6.3 Aggiornamenti Automatici

```bash
# Installa su tutte le VM
sudo apt install -y unattended-upgrades

# Configura
sudo dpkg-reconfigure unattended-upgrades
```

---

## 📊 Parte 7: Monitoraggio (Opzionale)

### Setup Prometheus + Grafana

```bash
# Su una VM dedicata o VM2

# Installa Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
cd prometheus-*

# Configura e avvia...
# (Vedi documentazione Prometheus)
```

---

## ❓ Troubleshooting Comune

### Problema: API non risponde da VM1

```bash
# Verifica che Gunicorn sia in esecuzione su VM2
sudo systemctl status geobridge

# Testa direttamente
curl http://VM2_IP:5000/api/health

# Verifica firewall
sudo ufw status
```

### Problema: Database connection refused

```bash
# Su VM3, verifica PostgreSQL
sudo systemctl status postgresql

# Verifica listen_addresses
sudo grep listen_addresses /etc/postgresql/14/main/postgresql.conf

# Verifica pg_hba.conf
sudo grep -A 5 "host.*all.*all" /etc/postgresql/14/main/pg_hba.conf

# Testa connessione da VM2
telnet VM3_IP 5432
```

### Problema: Analisi fallisce

```bash
# Verifica credenziali Sentinel Hub
# Su VM2
sudo su - geobridge
cd ~/app
source venv/bin/activate
python3

>>> import os
>>> from dotenv import load_dotenv
>>> load_dotenv()
>>> print(os.environ.get('SH_CLIENT_ID'))
>>> print(os.environ.get('SH_CLIENT_SECRET'))

# Verifica in log
sudo journalctl -u geobridge -n 100 --no-pager
```

---

## 📞 Supporto

Per problemi o domande:
1. Controlla i log su tutte le VM
2. Verifica connettività di rete
3. Verifica credenziali e variabili ambiente
4. Controlla documentazione Sentinel Hub

---

## 🎉 Complimenti!

Hai completato il deployment di GeoBridge su architettura a 3 VM!

**Next Steps:**
- Setup monitoraggio avanzato
- Implementa CI/CD pipeline
- Configura backup offsite
- Scala orizzontalmente aggiungendo più VM2

**Happy Analyzing! 🛰️**




-----

# 🎯 GeoBridge - Riepilogo Finale Refactoring

## ✅ Cosa È Stato Fatto

### 1. Architettura a 3 Tier Completa

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   VM1 Frontend  │◄────────│  VM2 App Server  │◄────────│  VM3 Database   │
│                 │         │                  │         │                 │
│  Apache/Nginx   │  HTTP   │  Gunicorn/Flask  │  SQL    │   PostgreSQL    │
│  HTML/CSS/JS    │         │     Python       │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

### 2. File Creati (Totale: ~35 file)

#### VM1 - Frontend (9 file)
- ✅ `templates/index.html` - Pagina principale
- ✅ `templates/login.html` - Pagina login
- ✅ `templates/dashboard.html` - Dashboard utente
- ✅ `static/css/style.css` - Stili completi
- ✅ `static/js/api-client.js` - Client API
- ✅ `static/js/map-manager.js` - Gestione mappa
- ✅ `static/js/utils.js` - Utilità
- ✅ `static/js/app.js` - Logica applicazione
- ✅ `apache/geobridge.conf` - Configurazione Apache

#### VM2 - Application Server (24 file)
**Struttura Core:**
- ✅ `app/__init__.py` - Inizializzazione Flask
- ✅ `app/config.py` - Configurazioni
- ✅ `wsgi.py` - Entry point Gunicorn
- ✅ `requirements.txt` - Dipendenze Python
- ✅ `gunicorn_config.py` - Config Gunicorn
- ✅ `.env.example` - Template variabili ambiente

**Models:**
- ✅ `app/models/__init__.py`
- ✅ `app/models/database.py` - Connection pool
- ✅ `app/models/user.py` - Modello utente
- ✅ `app/models/analysis.py` - Modello analisi

**Services:**
- ✅ `app/services/__init__.py`
- ✅ `app/services/satellite_service.py` - Sentinel Hub API
- ✅ `app/services/risk_calculator.py` - Calcolo rischi
- ✅ `app/services/pdf_generator.py` - Generazione PDF
- ✅ `app/services/auth_service.py` - Autenticazione

**Routes:**
- ✅ `app/routes/__init__.py`
- ✅ `app/routes/auth.py` - Route autenticazione
- ✅ `app/routes/analysis.py` - Route analisi
- ✅ `app/routes/api.py` - API generali

**Utils:**
- ✅ `app/utils/__init__.py`
- ✅ `app/utils/validators.py` - Validazione input

**Evalscripts:**
- ✅ `app/evalscripts/ndvi.js` - NDVI
- ✅ `app/evalscripts/ndmi.js` - NDMI
- ✅ `app/evalscripts/nbr.js` - NBR
- ✅ `app/evalscripts/ndbi.js` - NDBI
- ✅ `app/evalscripts/brei.js` - BREI
- ✅ `app/evalscripts/dopi.js` - DOPI

#### VM3 - Database (4 file)
- ✅ `init/01_schema.sql` - Schema database
- ✅ `init/02_indexes.sql` - Indici
- ✅ `init/03_seed_data.sql` - Dati iniziali
- ✅ `backups/backup.sh` - Script backup

---

## 📊 Confronto: Prima vs Dopo

| Aspetto | Prima (Monolitico) | Dopo (3-Tier) |
|---------|-------------------|---------------|
| **Architettura** | 1 VM, tutto insieme | 3 VM separate |
| **Scalabilità** | Verticale (CPU/RAM) | Orizzontale (+ VM) |
| **Manutenzione** | Downtime completo | Aggiornamenti isolati |
| **Sicurezza** | Database esposto | DB isolato in VM3 |
| **Performance** | Apache serve tutto | Apache solo statico |
| **Deployment** | Complesso | Modulare |
| **Testing** | Difficile | Per componente |
| **Backup** | VM intera | Solo DB necessario |

---

## 🔑 Miglioramenti Chiave Implementati

### 1. Separazione Responsabilità
- **Frontend:** Solo UI e contenuti statici
- **Backend:** Logica business e API
- **Database:** Solo persistenza dati

### 2. API REST Completa
```python
GET    /api/health              # Health check
POST   /api/auth/login          # Login
POST   /api/auth/logout         # Logout
GET    /api/auth/check          # Verifica autenticazione
POST   /api/analysis/create     # Crea analisi
GET    /api/analysis/{id}       # Dettagli analisi
GET    /api/analysis/user       # Analisi utente
GET    /api/analysis/{id}/pdf   # Genera PDF
```

### 3. Database Relazionale
- **Utenti:** Gestione autenticazione
- **Analisi:** Storico analisi
- **Risultati:** Dati elaborati
- **Audit Log:** Tracciamento azioni

### 4. Sicurezza Migliorata
- ✅ Password hashate (bcrypt)
- ✅ Sessioni sicure
- ✅ CORS configurato
- ✅ SQL parametrizzato (no injection)
- ✅ Validazione input
- ✅ Firewall configurato

### 5. Monitoraggio e Logging
- ✅ Log centralizzati
- ✅ Health check endpoints
- ✅ Audit log database
- ✅ Backup automatici

---

## 📝 Checklist Pre-Deployment

### Preparazione

- [ ] **Credenziali Sentinel Hub** pronte
- [ ] **3 VM Ubuntu 22.04** disponibili
- [ ] **IP statici** assegnati
- [ ] **Domini** configurati (opzionale)
- [ ] **Certificati SSL** pronti (opzionale)

### VM3 - Database

- [ ] PostgreSQL installato
- [ ] Database `geobridge` creato
- [ ] User `geobridge_user` creato
- [ ] Schema inizializzato
- [ ] Accesso remoto configurato
- [ ] Firewall configurato
- [ ] Backup script configurato
- [ ] Test connessione da VM2

### VM2 - Application Server

- [ ] Python 3.9+ installato
- [ ] Virtual environment creato
- [ ] Dipendenze installate
- [ ] File `.env` configurato
- [ ] Credenziali Sentinel Hub valide
- [ ] Connessione DB testata
- [ ] Servizio systemd configurato
- [ ] Gunicorn in esecuzione
- [ ] Firewall configurato
- [ ] Test API `/health` OK

### VM1 - Frontend

- [ ] Apache installato
- [ ] Moduli proxy abilitati
- [ ] File statici copiati
- [ ] Configurazione Apache creata
- [ ] Reverse proxy a VM2 funzionante
- [ ] Firewall configurato
- [ ] (Opzionale) SSL configurato
- [ ] Test accesso web OK

### Test End-to-End

- [ ] Login funzionante
- [ ] Selezione area mappa OK
- [ ] Creazione analisi completa
- [ ] Visualizzazione risultati OK
- [ ] Download PDF funzionante
- [ ] Dashboard mostra analisi
- [ ] Logout funzionante

---

## 🚨 Troubleshooting Quick Reference

### Problema: 502 Bad Gateway

```bash
# Check 1: VM2 Gunicorn running?
sudo systemctl status geobridge

# Check 2: Firewall allow VM1->VM2?
sudo ufw status

# Check 3: Test diretta VM2
curl http://VM2_IP:5000/api/health
```

### Problema: Database connection refused

```bash
# Check 1: PostgreSQL running?
sudo systemctl status postgresql

# Check 2: Listening on correct port?
sudo netstat -plnt | grep 5432

# Check 3: pg_hba.conf correct?
sudo cat /etc/postgresql/14/main/pg_hba.conf | grep VM2_IP
```

### Problema: Analisi fallisce

```bash
# Check 1: Sentinel Hub credentials
cat /home/geobridge/app/.env | grep SH_

# Check 2: Logs
sudo journalctl -u geobridge -n 50

# Check 3: Test API Sentinel Hub
curl -u client_id:client_secret \
  https://services.sentinel-hub.com/oauth/token \
  -d 'grant_type=client_credentials'
```

---

## 🎓 Prossimi Passi Consigliati

### Breve Termine
1. **Monitoraggio:** Setup Prometheus + Grafana
2. **SSL:** Certificati Let's Encrypt
3. **Backup:** Backup offsite (S3, etc.)
4. **Alert:** Notifiche email per errori

### Medio Termine
1. **CI/CD:** Pipeline automatizzata
2. **Docker:** Containerizzazione
3. **Load Balancer:** Nginx davanti a multiple VM2
4. **Redis:** Cache per risultati
5. **Celery:** Task queue per analisi lunghe

### Lungo Termine
1. **Kubernetes:** Orchestrazione container
2. **Multi-region:** Deployment geografico
3. **API pubblica:** Documentazione OpenAPI
4. **Mobile app:** App iOS/Android
5. **Machine Learning:** Predizione rischi

---

## 📚 Documentazione Utile

### Link Essenziali
- **Sentinel Hub:** https://docs.sentinel-hub.com/
- **Flask:** https://flask.palletsprojects.com/
- **PostgreSQL:** https://www.postgresql.org/docs/
- **Apache:** https://httpd.apache.org/docs/
- **Leaflet:** https://leafletjs.com/reference.html

### File di Documentazione Creati
- `docs/deployment.md` - Questa guida completa
- `docs/api-documentation.md` - Documentazione API
- `docs/architecture.md` - Diagrammi architettura
- `docs/development.md` - Setup ambiente dev

---

## 💡 Best Practices da Seguire

### Codice
- ✅ Sempre usare virtual environment
- ✅ Validare tutti gli input utente
- ✅ Usare prepared statements per SQL
- ✅ Loggare errori, non stamparli
- ✅ Gestire eccezioni gracefully

### Deploy
- ✅ Mai deployare su main senza test
- ✅ Backup prima di ogni update
- ✅ Usare file .env per secrets
- ✅ Testare su staging prima
- ✅ Rollback plan sempre pronto

### Sicurezza
- ✅ Cambiare password default
- ✅ Usare chiavi SSH, non password
- ✅ Firewall configurato correttamente
- ✅ HTTPS per produzione
- ✅ Aggiornamenti regolari

---

## 🎉 Conclusione

Hai ora un'applicazione GeoBridge completamente refactored con:

✅ **Architettura scalabile** a 3 tier
✅ **Codice organizzato** e manutenibile
✅ **Database relazionale** con backup
✅ **API REST** documentate
✅ **Frontend moderno** con Leaflet
✅ **Sicurezza** implementata
✅ **Monitoraggio** configurabile
✅ **Deployment** replicabile

**Il tuo codice è pronto per la produzione!** 🚀

---

## 📞 Supporto

Per domande o problemi:
1. Controlla questa documentazione
2. Verifica i log su tutte le VM
3. Consulta documentazione ufficiale
4. GitHub Issues (se repository pubblico)

**Buon lavoro con GeoBridge!** 🛰️✨


