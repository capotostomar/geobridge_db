# GeoBridge

A geospatial risk assessment platform for environmental monitoring using satellite imagery analysis.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)

## Overview

GeoBridge is a web-based platform that enables users to perform multi-temporal environmental risk assessments on any geographic area. The platform integrates satellite imagery analysis, spectral index computation, and machine learning-based risk predictions to provide comprehensive risk scoring for insurance, agriculture, and urban planning applications.

### Key Features

- **Interactive Map Interface**: Draw and analyze custom geographic areas with multiple tools (lasso, rectangle, polygon)
- **Multi-layer Mapping**: Switch between street, satellite, and topographic views
- **Spectral Index Analysis**: NDVI, NDMI, NBR, NDBI, BREI, and DOPI computation (simulated data)
- **Temporal Analysis**: Historical trend tracking with configurable date ranges
- **Composite Risk Scoring**: Weighted risk assessment across multiple categories
- **ML-Powered Risk Prediction**: Specific risk type analysis (flood, fire, landslide, drought)
- **Policy Profile Integration**: Agricultural, property, and crop-specific risk parameters
- **Export Capabilities**: PDF reports and JSON data export
- **Real-time Updates**: WebSocket-based live status monitoring
- **Push Notifications**: Browser-based geo-fenced alerts

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                │
├─────────────────────────────────────────────────────────────────────────┤
│  Next.js 16 (App Router)                                                 │
│  ├── React 19 with Server Components                                    │
│  ├── TypeScript (strict mode)                                           │
│  └── Tailwind CSS 4 + Shadcn/ui                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Service Layer                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │  Auth Service   │  │  Analysis Engine │  │  Realtime Service       │ │
│  │  (NextAuth.js) │  │  (Mock/Sentinel) │  │  (WebSocket/Supabase)   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Data Layer                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │  Supabase Auth  │  │  PostgreSQL DB   │  │  Supabase Storage       │ │
│  │  (User Auth)    │  │  (Prisma ORM)   │  │  (Files/Exports)        │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| **Framework** | Next.js | 16.1.x |
| **Language** | TypeScript | 5.x |
| **Database** | PostgreSQL (Supabase) | 15.x |
| **ORM** | Prisma | 6.11.x |
| **UI Components** | Shadcn/ui + Radix UI | Latest |
| **Styling** | Tailwind CSS | 4.x |
| **Maps** | Leaflet + React-Leaflet | 1.9.x / 5.x |
| **Charts** | Recharts | 2.15.x |
| **Animation** | Framer Motion | 12.x |
| **Forms** | React Hook Form + Zod | 7.x / 4.x |
| **State** | Zustand | 5.x |
| **HTTP Client** | TanStack Query | 5.x |
| **Auth** | NextAuth.js + Supabase SSR | 4.x / 0.9.x |
| **PDF Generation** | jsPDF + html2canvas | 2.x / 1.x |

### Directory Structure

```
geobridge_db/
├── prisma/
│   └── schema.prisma          # Database schema definitions
├── src/
│   ├── app/                   # Next.js App Router pages
│   │   ├── api/               # API routes
│   │   │   ├── v1/             # Versioned API endpoints
│   │   │   ├── keys/           # API key management
│   │   │   └── route.ts        # Root API handler
│   │   ├── analysis/           # Analysis detail page
│   │   ├── page.tsx           # Dashboard (map interface)
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   │   ├── analysis/          # Analysis page components
│   │   ├── auth/              # Authentication components
│   │   ├── comparison/        # Comparison features
│   │   ├── dashboard/         # Main dashboard UI
│   │   ├── map/               # Map components
│   │   ├── shell/             # App shell/navigation
│   │   ├── ui/                # Shadcn/ui components
│   │   └── user/              # User settings & panels
│   └── lib/                   # Utility functions
│       ├── analysis-engine.ts # Mock analysis computation
│       ├── analysis-store.ts  # Data persistence
│       ├── auth-context.tsx   # Auth state management
│       ├── pdf-generator.ts   # PDF export logic
│       ├── realtime.ts        # WebSocket client
│       └── types.ts           # TypeScript definitions
├── examples/
│   └── websocket/             # WebSocket integration examples
├── geosync/                   # GeoSync synchronization module
├── skills/                    # AI/ML skill modules
├── public/                    # Static assets
└── package.json              # Dependencies
```

### Data Models

#### Core Entities

```prisma
model Profile {
  id          String   @id @default(uuid())
  email       String   @unique
  full_name   String?
  avatar_url  String?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  searches    Search[]
}

model Search {
  id           String   @id @default(uuid())
  user_id      String
  title        String
  description  String?
  address      String?
  latitude     Float?
  longitude    Float?
  area_geojson String?  // GeoJSON polygon
  filters      String?   // JSON filters
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  user         Profile  @relation(fields: [user_id], references: [id])
}

model Analysis {
  id             String    @id @default(uuid())
  search_id      String?
  user_id        String
  area_name      String?
  bbox           String    // {minLon, minLat, maxLon, maxLat}
  start_date     DateTime
  end_date       DateTime
  interval_months Int      @default(6)
  status         String    @default("pending")
  results        String?   // JSON results
  risk_score     Float?
  created_at     DateTime  @default(now())
  completed_at   DateTime?
}

model ApiKey {
  id            String    @id @default(uuid())
  key           String    @unique  // SHA-256 hash
  name          String
  permissions   String    @default("read")
  active        Boolean   @default(true)
  lastUsedAt    DateTime?
  requestCount  Int       @default(0)
  createdAt     DateTime  @default(now())
}
```

### API Endpoints

#### Analysis API (v1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/analyses` | List all analyses for user |
| `POST` | `/api/v1/analyses` | Create new analysis |
| `GET` | `/api/v1/analyses/[id]` | Get analysis by ID |
| `DELETE` | `/api/v1/analyses/[id]` | Delete analysis |
| `GET` | `/api/v1/indices/[lat]/[lon]` | Get indices for coordinates |

#### Response Format

```typescript
interface AnalysisResponse {
  id: string
  title: string
  address?: string
  createdAt: string
  completedAt?: string
  area: {
    km2: number
    type: 'rectangle' | 'lasso' | 'polygon'
    coordinates: [number, number][]
  }
  compositeRisk: {
    score: number
    level: 'basso' | 'medio' | 'alto' | 'critico'
    summary: string
  }
  categories: RiskCategory[]
  spectralIndices: IndexResult[]
  temporalSeries: PeriodResult[]
  specificRisks?: SpecificRisk[]
  recommendations: string[]
}
```

---

## Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **npm**, **yarn**, or **bun**
- **Supabase** account and project
- **Git**

### Environment Setup

1. **Clone the repository**

```bash
git clone https://github.com/capotostomar/geobridge_db.git
cd geobridge_db
```

2. **Install dependencies**

```bash
npm install
# or
bun install
```

3. **Configure environment variables**

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT_REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-key"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-min-32-chars"

# Optional: Sentinel Hub (for real data)
SENTINEL_CLIENT_ID="your-client-id"
SENTINEL_CLIENT_SECRET="your-client-secret"
```

4. **Initialize the database**

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# (Optional) Run migrations
npm run db:migrate
```

5. **Start the development server**

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Demo Mode

When Supabase credentials are not configured, the application runs in **demo mode** with:

- LocalStorage-based data persistence
- Mock analysis engine (simulated satellite data)
- Limited features (no real-time sync, no push notifications)
- Demo user authentication

---

## Usage Guide

### Drawing Areas on the Map

1. **Select a drawing tool** from the left toolbar:
   - **Lasso** (desktop): Click and drag to freehand draw
   - **Rectangle**: Click and drag to create a rectangular area
   - **Polygon**: Click to add vertices, double-click to close
   - **Touch Rectangle** (mobile): Tap two opposite corners

2. **View area details** in the right panel (area in km²)

3. **Clear or modify** the drawn area using the trash icon

### Performing Analysis

1. **Configure analysis** in the modal:
   - **Analysis Name**: Descriptive title for your analysis
   - **Type**: Snapshot (current state) or Time Series (historical trends)
   - **Date Range** (for time series): Start and end dates

2. **Start analysis** by clicking the "Avvia Analisi" button

3. **Monitor progress** via the processing overlay showing:
   - Image retrieval
   - Index computation
   - Risk assessment
   - Report generation

4. **View results** on the analysis detail page

### Analysis Results

The analysis page provides multiple views:

| Tab | Description |
|-----|-------------|
| **Overview** | Risk categories breakdown with scores and factors |
| **Spectral Indices** | NDVI, NDMI, NBR, NDBI, BREI, DOPI values and interpretations |
| **Timeline** | Historical risk trends over selected periods |
| **Risk × Policy** | Weighted composite risk with policy profile customization |
| **ML Risks** | Specific risk predictions (flood, fire, landslide, etc.) |
| **Recommendations** | Actionable suggestions based on analysis results |

### Exporting Data

- **PDF Report**: Click the download button to generate a formatted report
- **JSON Export**: Export raw data for integration with external systems

### Settings & Preferences

Access settings via the menu (hamburger icon):

- **Default Map Style**: Street, Satellite, or Topographic
- **Unit Preference**: km² or hectares
- **Alert Thresholds**: Configure notification triggers
- **Policy Profile**: Agricultural, Property, Crop, or Custom weighting

---

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server

# Build
npm run build            # Build for production
npm run start            # Start production server

# Database
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema changes
npm run db:migrate       # Run migrations
npm run db:reset         # Reset database

# Code Quality
npm run lint             # Run ESLint
```

### Adding Components

This project uses [Shadcn/ui](https://ui.shadcn.com/) for UI components. To add a new component:

```bash
npx shadcn@latest add [component-name]
```

Available components include: button, dialog, dropdown-menu, form, input, select, slider, switch, tabs, toast, and many more.

### Adding Spectral Indices

To add a new spectral index, update `src/lib/analysis-engine.ts`:

```typescript
// Add index configuration
const INDICES = {
  // ... existing indices
  NEW_INDEX: {
    name: 'NDX',
    fullName: 'New Derived Index',
    range: { min: -1, max: 1 },
    highRisk: false,  // true if high value = high risk
    compute: (bands) => { /* calculation */ }
  }
}
```

### Database Migrations

```bash
# Create a new migration
npx prisma migrate dev --name add_new_table

# Apply migrations in production
npx prisma migrate deploy
```

---

## Production Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Docker

Build and run with Docker:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Self-Hosted

For self-hosted deployment:

```bash
# Build
npm run build

# Copy static assets
cp -r .next/static .next/standalone/
cp -r public .next/standalone/

# Run with Node
NODE_ENV=production node .next/standalone/server.js
```

---

## Configuration Reference

### Policy Weight Profiles

Customize risk weighting based on use case:

```typescript
const POLICY_PRESETS = {
  agricultural: {
    profile: 'agricultural',
    flood: 35,
    fire: 25,
    drought: 30,
    urbanHeat: 10
  },
  property: {
    profile: 'property',
    flood: 30,
    fire: 30,
    drought: 15,
    urbanHeat: 25
  },
  crop: {
    profile: 'crop',
    flood: 25,
    fire: 20,
    drought: 40,
    urbanHeat: 15
  }
}
```

### Alert Thresholds

Configure notification triggers:

```typescript
interface AlertThresholds {
  enabled: boolean
  composite: number      // Composite score threshold
  fire: number          // Fire risk threshold
  flood: number         // Flood risk threshold
}
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Map not loading | Ensure Leaflet CSS is imported in the component |
| Auth redirect loops | Check Supabase URL and anon key configuration |
| Database connection fails | Verify DATABASE_URL format and network access |
| Build fails | Clear `.next` cache and reinstall dependencies |

### Debug Mode

Enable verbose logging:

```typescript
// In your environment
DEBUG=geobridge:* npm run dev
```

---

## Contributing

Contributions are welcome! Please read our guidelines before submitting:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Standards

- Use TypeScript strict mode
- Follow ESLint configuration
- Write unit tests for utility functions
- Document complex logic with comments

---

## Roadmap

- [ ] **Sentinel Hub Integration**: Replace mock data with real satellite imagery
- [ ] **PostGIS Integration**: Native geospatial queries
- [ ] **Team Collaboration**: Share analyses with team members
- [ ] **Scheduled Monitoring**: Automated periodic analysis
- [ ] **Webhooks**: External system notifications
- [ ] **PWA Support**: Offline capability
- [ ] **GraphQL API**: Alternative to REST endpoints
- [ ] **Multi-language**: i18n support (EN, IT, ES, FR)

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## Acknowledgments

- [Sentinel Hub](https://www.sentinel-hub.com/) - Satellite imagery provider
- [Copernicus](https://copernicus.eu/) - Open Earth observation data
- [OpenStreetMap](https://www.openstreetmap.org/) - Base map tiles
- [Shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Supabase](https://supabase.com/) - Backend infrastructure

---

## Support

For questions and support:

- **Issues**: [GitHub Issues](https://github.com/capotostomar/geobridge_db/issues)
- **Discussions**: [GitHub Discussions](https://github.com/capotostomar/geobridge_db/discussions)

---

*Built with precision for environmental risk assessment.*
<!-- trigger fresh build -->
