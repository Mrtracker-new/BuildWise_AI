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

(async () => {
  const chromePath = getChromePath();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  // 1. Click "Run Site Feasibility Analysis" to load the main analysis dashboard
  console.log('Clicking Run Site Feasibility Analysis...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const runBtn = buttons.find(b => b.textContent && (b.textContent.includes('Run Site Feasibility Analysis') || b.textContent.includes('Run Feasibility')) && b.offsetParent !== null);
    if (runBtn) runBtn.click();
  });

  await page.waitForFunction(() => {
    return document.body.innerText.includes('Land Suitability Assessment');
  }, { timeout: 30000 });
  console.log('Feasibility dashboard rendered.');

  await new Promise(r => setTimeout(r, 1000));

  // 2. Find and click visible "Generate Architectural Blueprint"
  console.log('Finding and clicking visible Generate Architectural Blueprint button...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const genBtn = buttons.find(b => b.textContent && b.textContent.includes('Generate Architectural Blueprint') && b.offsetParent !== null);
    if (genBtn) {
      genBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
      genBtn.click();
    }
  });

  console.log('Waiting for visible blueprint rendering...');
  await page.waitForFunction(() => {
    const viewers = Array.from(document.querySelectorAll('#blueprint-viewer-container'));
    return viewers.some(v => v.offsetParent !== null && v.querySelector('svg[viewBox]'));
  }, { timeout: 15000 });
  console.log('Blueprint SVG successfully rendered!');

  await new Promise(r => setTimeout(r, 1000));

  const artifactDir = path.resolve('C:/Users/rolan/.gemini/antigravity-ide/brain/d9257cc6-0463-483b-a8c2-76489a5896a9');

  // 1. Capture CAD Dark Sheet Mode
  console.log('Capturing CAD Dark Sheet mode screenshot...');
  const cadHandle = await page.evaluateHandle(() => {
    const viewers = Array.from(document.querySelectorAll('#blueprint-viewer-container'));
    const visibleViewer = viewers.find(v => v.offsetParent !== null);
    if (visibleViewer) visibleViewer.scrollIntoView({ behavior: 'instant', block: 'center' });
    return visibleViewer;
  });
  await new Promise(r => setTimeout(r, 600));

  const cadPath = path.join(artifactDir, 'blueprint_cad_dark.png');
  await cadHandle.asElement().screenshot({ path: cadPath });
  console.log(`Saved CAD mode screenshot to ${cadPath}`);

  // 2. Switch to Paper Mode
  console.log('Switching to Paper Mode...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const paperBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'PAPER' && b.offsetParent !== null);
    if (paperBtn) paperBtn.click();
  });

  await new Promise(r => setTimeout(r, 800));

  // 3. Capture Paper Mode
  console.log('Capturing Paper Mode screenshot...');
  const paperHandle = await page.evaluateHandle(() => {
    const viewers = Array.from(document.querySelectorAll('#blueprint-viewer-container'));
    const visibleViewer = viewers.find(v => v.offsetParent !== null);
    if (visibleViewer) visibleViewer.scrollIntoView({ behavior: 'instant', block: 'center' });
    return visibleViewer;
  });
  await new Promise(r => setTimeout(r, 600));

  const paperPath = path.join(artifactDir, 'blueprint_paper_mode.png');
  await paperHandle.asElement().screenshot({ path: paperPath });
  console.log(`Saved Paper mode screenshot to ${paperPath}`);

  await browser.close();
  console.log('All screenshots captured successfully!');
})();
