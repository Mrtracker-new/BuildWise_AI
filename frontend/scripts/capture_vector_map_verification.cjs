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

const ARTIFACT_DIR = 'C:\\Users\\rolan\\.gemini\\antigravity-ide\\brain\\a4ddcb5f-d04f-452d-9925-044d39bf4848';

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
  await new Promise(r => setTimeout(r, 1000));

  // 1. Initial Standard Map View
  console.log('Capturing Initial Standard View...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_standard_initial.png') });

  // 2. Trigger Feasibility Analysis
  console.log('Triggering Feasibility Analysis...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const runBtn = buttons.find(b => b.textContent && (b.textContent.includes('Run Site Feasibility Analysis') || b.textContent.includes('Run Feasibility')));
    if (runBtn) runBtn.click();
  });

  await page.waitForFunction(() => {
    return window.__maplibreMap && window.__leafletMarker && window.__leafletFootprint && document.body.innerText.includes('Land Suitability Assessment');
  }, { timeout: 15000 });

  // Set zoom to 16 for 3D buildings & footprint
  await page.evaluate(() => {
    const map = window.__maplibreMap;
    const marker = window.__leafletMarker;
    if (map && marker) {
      const ll = marker.getLatLng();
      map.jumpTo({ center: [ll.lng, ll.lat], zoom: 16.5, pitch: 45, bearing: -20 });
    }
  });

  await new Promise(r => setTimeout(r, 2500));
  console.log('Capturing Standard Mode with 3D Buildings & Footprint at Zoom 16.5 (Pitched)...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_standard_3d_pitched.png') });

  // 3. Open Map Details Popover
  console.log('Opening Map Details popover...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label*="Map Details"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_map_details_popover.png') });

  // 4. Select Satellite Mode
  console.log('Switching to Satellite Mode...');
  await page.evaluate(() => {
    const radioButtons = Array.from(document.querySelectorAll('[role="radio"]'));
    const satBtn = radioButtons.find(b => b.textContent && b.textContent.includes('Satellite'));
    if (satBtn) satBtn.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  console.log('Capturing Satellite Hybrid View...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_satellite_hybrid.png') });

  // 5. Select Terrain Mode
  console.log('Switching to Terrain Mode...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label*="Map Details"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => {
    const radioButtons = Array.from(document.querySelectorAll('[role="radio"]'));
    const terrainBtn = radioButtons.find(b => b.textContent && b.textContent.includes('Terrain'));
    if (terrainBtn) terrainBtn.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  console.log('Capturing Terrain View...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_terrain_mode.png') });

  // 6. Switch back to Standard & Toggle Dark Theme
  console.log('Switching back to Standard and Toggling Dark Theme...');
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label*="Map Details"]');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => {
    const radioButtons = Array.from(document.querySelectorAll('[role="radio"]'));
    const stdBtn = radioButtons.find(b => b.textContent && b.textContent.includes('Standard'));
    if (stdBtn) stdBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Toggle Dark Theme
  await page.evaluate(() => {
    const themeBtn = document.querySelector('button[aria-label*="theme" i], button[title*="theme" i]');
    if (themeBtn) themeBtn.click();
  });
  await new Promise(r => setTimeout(r, 3000));
  console.log('Capturing Dark Theme Standard 3D View...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '06_dark_theme_standard.png') });

  await browser.close();
  console.log('All verification screenshots captured successfully!');
})();
