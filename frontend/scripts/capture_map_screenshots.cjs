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
  ];
  for (const p of defaultPaths) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('Chrome executable not found.');
}

const ARTIFACT_DIR = 'C:\\Users\\rolan\\.gemini\\antigravity-ide\\brain\\a692c916-81f6-44e3-b1c3-ea28ff88c6bc';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  console.log('Triggering Feasibility Analysis...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const runBtn = buttons.find(b => b.textContent && (b.textContent.includes('Run Site Feasibility Analysis') || b.textContent.includes('Run Feasibility')));
    if (runBtn) runBtn.click();
  });

  await page.waitForFunction(() => {
    return window.__leafletMap && window.__leafletMarker && window.__leafletFootprint && document.body.innerText.includes('Land Suitability Assessment');
  }, { timeout: 15000 });

  console.log('Feasibility results ready.');
  const zoomLevels = [14, 16, 18];

  for (const z of zoomLevels) {
    console.log(`Setting map zoom to ${z}...`);
    await page.evaluate((zoom) => {
      const map = window.__leafletMap;
      const marker = window.__leafletMarker;
      if (map && marker) {
        map.setView(marker.getLatLng(), zoom, { animate: false });
      }
    }, z);

    // Wait for tiles to settle
    await new Promise(r => setTimeout(r, 2000));

    // Full screen capture
    const fullOutPath = path.join(ARTIFACT_DIR, `map_zoom_${z}.png`);
    await page.screenshot({ path: fullOutPath });
    console.log(`Saved screenshot: ${fullOutPath}`);

    // Map container capture
    const mapElement = await page.$('#center-map-section');
    if (mapElement) {
      const mapOutPath = path.join(ARTIFACT_DIR, `map_only_zoom_${z}.png`);
      await mapElement.screenshot({ path: mapOutPath });
      console.log(`Saved map-only screenshot: ${mapOutPath}`);
    }
  }

  await browser.close();
  console.log('All screenshots captured successfully.');
})();
