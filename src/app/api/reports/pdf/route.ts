import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "chrome-aws-lambda";

export async function POST(req: NextRequest) {
  try {
    const { analysisId } = await req.json();

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: true,
    });

    const page = await browser.newPage();

    const html = `
      <html>
      <body style="font-family: Arial; padding: 40px;">
        <h1>GeoBridge Report</h1>
        <p>ID: ${analysisId}</p>
        <p>${new Date().toLocaleDateString()}</p>

        <h2>Dati</h2>
        <p>Report generato correttamente.</p>
      </body>
      </html>
    `;

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
