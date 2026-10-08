// Prints the HTML report to PDF with headless Chrome (puppeteer-core).
// The browser is launched lazily and reused; CHROME_PATH (from .env)
// points at the Chrome/Chromium executable.
import puppeteer from 'puppeteer-core';

let browser = null;

async function getBrowser() {
  if (browser && browser.connected) return browser;
  const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
  browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  return browser;
}

export async function renderPdf(html) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' }
    });
  } finally {
    await page.close().catch(() => {});
  }
}
