import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "chrome-aws-lambda";

// Se usi Prisma o Supabase, importa qui
// import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { analysisId } = await req.json();

    if (!analysisId) {
      return NextResponse.json(
        { error: "analysisId is required" },
        { status: 400 }
      );
    }

    // 🔴 TODO: sostituisci con DB reale
    const data = await getAnalysisData(analysisId);

    const html = buildHtml(data);

    // 🚀 Puppeteer compatibile con Vercel
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: true,
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        bottom: "20mm",
        left: "15mm",
        right: "15mm",
      },
    });

    await browser.close();

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=report-${analysisId}.pdf`,
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);

    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}

// -----------------------------
// 📊 DATA FETCH (DA SOSTITUIRE)
// -----------------------------
async function getAnalysisData(analysisId: string) {
  // 👉 Esempio con Prisma:
  /*
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
  });
  */

  return {
    id: analysisId,
    date: new Date().toLocaleDateString(),

    // 🗺️ puoi mettere base64 o URL static map
    mapImage:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Map_example.png/800px-Map_example.png",

    rows: [
      { label: "Area", value: "1200 m²" },
      { label: "Rischio", value: "Medio" },
      { label: "Indice idrogeologico", value: "0.67" },
    ],

    // opzionale
    svgCharts: `
      <svg width="400" height="200">
        <rect x="10" y="50" width="50" height="100" fill="#0070f3"/>
        <rect x="80" y="80" width="50" height="70" fill="#00c853"/>
        <rect x="150" y="30" width="50" height="120" fill="#ff5252"/>
      </svg>
    `,
  };
}

// -----------------------------
// 🎨 HTML TEMPLATE
// -----------------------------
function buildHtml(data: any) {
  return `
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        font-family: Arial, sans-serif;
        padding: 20px;
        color: #333;
      }

      h1, h2 {
        color: #0A2540;
      }

      .cover {
        text-align: center;
        margin-top: 200px;
        page-break-after: always;
      }

      .section {
        margin-bottom: 40px;
      }

      img {
        border-radius: 8px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }

      th {
        background: #f5f5f5;
      }

      td, th {
        border: 1px solid #ddd;
        padding: 10px;
        text-align: left;
      }

      .footer {
        position: fixed;
        bottom: 10px;
        font-size: 10px;
        width: 100%;
        text-align: center;
        color: #999;
      }

      .signature {
        margin-top: 60px;
      }
    </style>
  </head>

  <body>

    <!-- COVER -->
    <div class="cover">
      <h1>GeoBridge Report</h1>
      <p><strong>ID Analisi:</strong> ${data.id}</p>
      <p><strong>Data:</strong> ${data.date}</p>
    </div>

    <!-- MAPPA -->
    <div class="section">
      <h2>Area Analizzata</h2>
      <img src="${data.mapImage}" style="width:100%" />
    </div>

    <!-- GRAFICI -->
    ${
      data.svgCharts
        ? `
      <div class="section">
        <h2>Analisi Grafica</h2>
        ${data.svgCharts}
      </div>
    `
        : ""
    }

    <!-- TABELLA -->
    <div class="section">
      <h2>Dati Tecnici</h2>
      <table>
        <tr>
          <th>Parametro</th>
          <th>Valore</th>
        </tr>
        ${data.rows
          .map(
            (r: any) => `
          <tr>
            <td>${r.label}</td>
            <td>${r.value}</td>
          </tr>
        `
          )
          .join("")}
      </table>
    </div>

    <!-- DISCLAIMER -->
    <div class="section">
      <h2>Disclaimer</h2>
      <p>
        Questo report ha valore puramente informativo e non costituisce
        certificazione ufficiale. GeoBridge non è responsabile per eventuali
        decisioni prese sulla base dei dati qui riportati.
      </p>
    </div>

    <!-- FIRMA -->
    <div class="section signature">
      <p><strong>GeoBridge System</strong></p>
      <p>Hash documento: ${generateHash(data.id)}</p>
    </div>

    <div class="footer">
      GeoBridge © ${new Date().getFullYear()} — Report automatico
    </div>

  </body>
  </html>
  `;
}

// -----------------------------
// 🔐 HASH (mock)
// -----------------------------
function generateHash(input: string) {
  return Buffer.from(input).toString("base64");
}
