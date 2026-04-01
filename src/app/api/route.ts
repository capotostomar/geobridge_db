import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "chrome-aws-lambda";

export async function POST(req: NextRequest) {
  try {
    const { analysisId, mapImage, svgChart } = await req.json();

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: true,
    });

    const page = await browser.newPage();

    const html = buildHtml({
      analysisId,
      mapImage,
      svgChart,
    });

    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=report-${analysisId}.pdf`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "PDF error" }, { status: 500 });
  }
}

// ----------------------------
// 🎨 TEMPLATE PROFESSIONALE
// ----------------------------
function buildHtml({ analysisId, mapImage, svgChart }: any) {
  return `
  <html>
  <head>
    <style>
      body {
        font-family: Arial;
        padding: 40px;
        color: #1a1a1a;
      }

      h1 {
        font-size: 28px;
        margin-bottom: 10px;
      }

      h2 {
        margin-top: 40px;
        border-bottom: 2px solid #eee;
        padding-bottom: 5px;
      }

      .cover {
        text-align: center;
        margin-top: 200px;
        page-break-after: always;
      }

      .section {
        margin-top: 30px;
      }

      img {
        width: 100%;
        border-radius: 8px;
      }

      .footer {
        position: fixed;
        bottom: 10px;
        font-size: 10px;
        width: 100%;
        text-align: center;
      }
    </style>
  </head>

  <body>

    <!-- COVER -->
    <div class="cover">
      <h1>GeoBridge Engineering Report</h1>
      <p>ID: ${analysisId}</p>
      <p>${new Date().toLocaleDateString()}</p>
    </div>

    <!-- MAP -->
    <div class="section">
      <h2>Area Analizzata</h2>
      <img src="${mapImage}" />
    </div>

    <!-- CHART -->
    <div class="section">
      <h2>Analisi Grafica</h2>
      ${svgChart}
    </div>

    <!-- DISCLAIMER -->
    <div class="section">
      <h2>Disclaimer</h2>
      <p>
        Documento tecnico generato automaticamente. Non costituisce certificazione ufficiale.
      </p>
    </div>

    <div class="footer">
      GeoBridge © ${new Date().getFullYear()}
    </div>

  </body>
  </html>
  `;
}
