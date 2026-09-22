const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

function getChromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const defaultPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const p of defaultPaths) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('Chrome executable not found. Set CHROME_PATH environment variable.');
}

const ARTIFACT_DIR = 'C:\\Users\\rolan\\.gemini\\antigravity-ide\\brain\\a692c916-81f6-44e3-b1c3-ea28ff88c6bc';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Helper to ensure analysis results are loaded
  async function ensureAnalysisLoaded() {
    const isLoaded = await page.evaluate(() => document.body.innerText.includes('Land Suitability Assessment'));
    if (!isLoaded) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const runBtn = buttons.find(b => b.textContent && (b.textContent.includes('Run Site Feasibility Analysis') || b.textContent.includes('Run Feasibility')));
        if (runBtn) runBtn.click();
      });
      await page.waitForFunction(() => document.body.innerText.includes('Land Suitability Assessment'), { timeout: 15000 });
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // 1. Screenshot 1920x1080 loaded
  console.log('Capturing 1920x1080 loaded...');
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await ensureAnalysisLoaded();
  const path1 = path.join(ARTIFACT_DIR, 'screenshot_1920x1080_loaded.png');
  await page.screenshot({ path: path1, fullPage: false });
  console.log(`Saved: ${path1}`);

  // 2. Screenshot 1366x768 loaded with drawer open
  console.log('Capturing 1366x768 drawer open...');
  await page.setViewport({ width: 1366, height: 768 });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const toggleBtn = document.querySelector('button[aria-controls="results-drawer"]');
    if (toggleBtn && toggleBtn.getAttribute('aria-expanded') !== 'true') {
      toggleBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 600)); // allow drawer slide transition to complete
  const path2 = path.join(ARTIFACT_DIR, 'screenshot_1366x768_drawer_open.png');
  await page.screenshot({ path: path2, fullPage: false });
  console.log(`Saved: ${path2}`);

  // 3. Screenshot 390x844 loaded (mobile)
  console.log('Capturing 390x844 loaded...');
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 600));
  const path3 = path.join(ARTIFACT_DIR, 'screenshot_390x844_loaded.png');
  await page.screenshot({ path: path3, fullPage: false });
  console.log(`Saved: ${path3}`);

  await browser.close();
  console.log('All screenshots captured successfully.');
})();
