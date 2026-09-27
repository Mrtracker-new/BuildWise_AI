const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\rolan\\.gemini\\antigravity-ide\\brain\\626e3945-1417-402b-849e-d8673f56bac4';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('--- Starting Terrace Band UI Proof Verification ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  let capturedRequestPayload = null;
  let capturedResponseData = null;

  page.on('request', req => {
    if (req.url().includes('/api/generate-floorplan') && req.method() === 'POST') {
      try {
        capturedRequestPayload = JSON.parse(req.postData());
        console.log('[DevTools] Captured /api/generate-floorplan payload:\n', JSON.stringify(capturedRequestPayload, null, 2));
      } catch (e) {}
    }
  });

  page.on('response', async res => {
    if (res.url().includes('/api/generate-floorplan') && res.request().method() === 'POST') {
      try {
        capturedResponseData = await res.json();
        console.log('[DevTools] Captured response status:', res.status());
      } catch (e) {}
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('[Browser Console Error]', msg.text());
    }
  });

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // 1. Click 'Update Pin' to activate coordinates
  console.log('Clicking "Update Pin" to activate coordinates...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Update Pin'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. In Sidebar, select Storeys: G + 2 (3 Levels)
  console.log('Selecting Storeys: G + 2 (3 Levels) in sidebar...');
  const floorsBtn = await page.$('#floors-select');
  if (floorsBtn) {
    await floorsBtn.click();
    await new Promise(r => setTimeout(r, 500));
    // Click option containing 'G + 2'
    await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('[role="option"], button, li'));
      const opt = opts.find(o => o.textContent && o.textContent.includes('G + 2'));
      if (opt) opt.click();
    });
    await new Promise(r => setTimeout(r, 500));
  }

  // 3. Click 'Run Site Feasibility Analysis'
  console.log('Clicking "Run Site Feasibility Analysis"...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Run Site Feasibility Analysis'));
    if (btn) btn.click();
  });

  // Wait for the modal and feasibility analysis to synthesize
  console.log('Waiting for Feasibility Report modal to open...');
  await page.waitForFunction(() => {
    return Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Cost & Plan'));
  }, { timeout: 35000 });
  await new Promise(r => setTimeout(r, 2000));

  // 3. Click 'Cost & Plan' tab
  console.log('Clicking "Cost & Plan" tab in report modal...');
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Cost & Plan'));
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // 4. In FloorPlanGeneratorCard, set Plot Width 12.0 and Plot Depth 15.0
  console.log('Setting Plot Width 12.0 and Depth 15.0 via native setter...');
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
    const wInput = inputs.find(i => i.previousElementSibling && i.previousElementSibling.textContent.includes('Width'));
    const dInput = inputs.find(i => i.previousElementSibling && i.previousElementSibling.textContent.includes('Depth'));
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    if (wInput) {
      nativeSetter.call(wInput, '12');
      wInput.dispatchEvent(new Event('input', { bubbles: true }));
      wInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (dInput) {
      nativeSetter.call(dInput, '15');
      dInput.dispatchEvent(new Event('input', { bubbles: true }));
      dInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // 5. Inspect 'Per-Floor Terrace Bands (Rectangular)' section
  console.log('Checking Per-Floor Terrace Bands UI controls...');
  const cardChecks = await page.evaluate(() => {
    const groundRow = Array.from(document.querySelectorAll('span, div')).find(s => s.textContent && s.textContent.includes('Full Plate Only (Entry/Parking - RULE-FP-01)'));
    const edgeSelectF2 = document.querySelector('[data-testid="terrace-edge-f2"]');
    let westOptDisabled = false;
    let westOptTitle = '';
    if (edgeSelectF2) {
      const westOpt = Array.from(edgeSelectF2.options).find(o => o.value === 'W');
      if (westOpt) {
        westOptDisabled = westOpt.disabled;
        westOptTitle = westOpt.title;
      }
    }
    return {
      hasGroundRow: Boolean(groundRow),
      groundText: groundRow ? groundRow.textContent.trim() : null,
      hasEdgeSelectF2: Boolean(edgeSelectF2),
      westOptDisabled,
      westOptTitle
    };
  });
  console.log('Card checks result:', JSON.stringify(cardChecks, null, 2));

  // 6. On G+2, select North Edge (Front Terrace)
  console.log('Selecting North Edge (Front Terrace) on G+2...');
  await page.evaluate(() => {
    const select = document.querySelector('[data-testid="terrace-edge-f2"]');
    if (select) {
      select.value = 'N';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // 7. Verify depth slider on G+2
  const sliderChecks = await page.evaluate(() => {
    const slider = document.querySelector('[data-testid="terrace-depth-f2"]');
    if (!slider) return null;
    return {
      value: slider.value,
      min: slider.min,
      max: slider.max,
      title: slider.title
    };
  });
  console.log('G+2 Depth Slider checks:', JSON.stringify(sliderChecks, null, 2));

  // Screenshot 1: Configured card
  const screenshot1Path = path.join(ARTIFACTS_DIR, 'evidence_1_card_configured.png');
  await page.screenshot({ path: screenshot1Path, fullPage: false });
  console.log('Saved screenshot 1 to:', screenshot1Path);

  // 8. Click 'Generate 3-Storey Architectural Blueprint' button
  console.log('Clicking Generate 3-Storey Architectural Blueprint button...');
  await page.evaluate(() => {
    const genBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Generate 3-Storey Architectural Blueprint') || b.textContent.includes('Generate Floor Plan') || b.textContent.includes('Regenerate Blueprint')));
    if (genBtn) genBtn.click();
  });

  // Wait for network response and blueprint rendering
  console.log('Waiting for blueprint generation to complete...');
  await page.waitForResponse(res => res.url().includes('/api/generate-floorplan') && res.request().method() === 'POST', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 4000));

  // 9. Check BlueprintViewer state
  const viewerState = await page.evaluate(() => {
    const g2Tab = document.querySelector('[data-testid="tab-floor-2"]');
    const allTabs = Array.from(document.querySelectorAll('[data-testid^="tab-floor-"]')).map(t => t.textContent.trim());
    const freshnessEl = Array.from(document.querySelectorAll('div, span')).find(el => el.textContent && el.textContent.includes('GEN-') && el.textContent.includes('12.0x15.0m'));
    const genToken = freshnessEl ? freshnessEl.textContent.trim() : null;

    // Check certificate
    const certRulesSpan = Array.from(document.querySelectorAll('span')).find(s => s.previousElementSibling && s.previousElementSibling.textContent && s.previousElementSibling.textContent.includes('Certified Rule IDs'));

    return {
      allTabs,
      g2TabLabel: g2Tab ? g2Tab.textContent.trim() : null,
      genToken,
      certRules: certRulesSpan ? certRulesSpan.textContent.trim() : null
    };
  });

  console.log('Viewer state after generation:\n', JSON.stringify(viewerState, null, 2));

  // 10. Click G+2 tab to activate Level 2 view
  console.log('Activating G+2 tab in BlueprintViewer...');
  await page.evaluate(() => {
    const g2Tab = document.querySelector('[data-testid="tab-floor-2"]');
    if (g2Tab) g2Tab.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Screenshot 2: Blueprint & tabs on G+2
  const screenshot2Path = path.join(ARTIFACTS_DIR, 'evidence_2_g2_blueprint.png');
  await page.screenshot({ path: screenshot2Path, fullPage: false });
  console.log('Saved screenshot 2 to:', screenshot2Path);

  // 11. Check G+2 legend specifically
  const g2Legend = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('.rounded-full')).map(el => ({
      text: el.textContent.trim(),
      className: el.className
    })).filter(c => c.text.includes('m²') || c.text.includes('Terrace') || c.text.includes('Balcony'));
    return chips;
  });
  console.log('G+2 Legend items:\n', JSON.stringify(g2Legend, null, 2));

  // 12. Test Stale Guard: change slider to 3.5m
  console.log('Testing Stale Guard: changing depth to 3.5m...');
  await page.evaluate(() => {
    const slider = document.querySelector('[data-testid="terrace-depth-f2"]');
    if (slider) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(slider, '3.5');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  const staleStatus = await page.evaluate(() => {
    const staleChip = document.querySelector('[data-testid="stale-plan-chip"]') || document.querySelector('[data-testid="modal-stale-plan-chip"]') || Array.from(document.querySelectorAll('span, div')).find(el => el.textContent && el.textContent.includes('Parameters changed — regenerate'));
    return {
      isStaleVisible: Boolean(staleChip),
      staleText: staleChip ? staleChip.textContent.trim() : null
    };
  });
  console.log('Stale status after slider change:', JSON.stringify(staleStatus, null, 2));

  // Screenshot 3: Stale guard active
  const screenshot3Path = path.join(ARTIFACTS_DIR, 'evidence_3_stale_guard_active.png');
  await page.screenshot({ path: screenshot3Path, fullPage: false });
  console.log('Saved screenshot 3 to:', screenshot3Path);

  // Write summary results to a json file
  const results = {
    capturedRequestPayload,
    cardChecks,
    sliderChecks,
    viewerState,
    g2Legend,
    staleStatus,
    multiStoreyResponse: {
      total_built_up_area_sqm: capturedResponseData?.multi_storey?.total_built_up_area_sqm,
      floors: capturedResponseData?.multi_storey?.floors?.map(f => ({
        floor_index: f.floor_index,
        floor_name: f.floor_name,
        plate_composition: f.plate_composition,
        built_up_area_sqm: f.built_up_area_sqm,
        terrace_band: f.terrace_band,
      })),
      certified_rules: capturedResponseData?.mathematical_certificate?.certified_rules
    }
  };

  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'ui_proof_results.json'), JSON.stringify(results, null, 2));
  console.log('Wrote results to ui_proof_results.json');

  await browser.close();
  console.log('--- Terrace Band UI Proof Complete ---');
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
