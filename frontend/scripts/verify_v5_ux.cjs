const puppeteer = require('puppeteer-core');
const fs = require('fs');

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

async function runVerification() {
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  const errors = [];
  const results = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('[Browser Error]', msg.text());
    }
  });

  try {
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 600));

    // 1. Run analysis
    console.log('Clicking Run Site Feasibility Analysis button...');
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent && b.textContent.includes('Run Site Feasibility Analysis'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!clicked) throw new Error('Run button not found');

    await page.waitForFunction(() => {
      return document.body.innerText.includes('Land Suitability Assessment');
    }, { timeout: 30000 });
    console.log('Results loaded successfully.');

    // 2. Test 360px and 420px panel widths
    for (const testWidth of [360, 420]) {
      console.log(`\n--- Testing at panel width ${testWidth}px ---`);
      await page.setViewport({ width: 1440, height: 900 });
      await page.evaluate((w) => {
        const drawer = document.getElementById('results-drawer');
        if (drawer) {
          drawer.style.width = `${w}px`;
        }
      }, testWidth);
      await new Promise(r => setTimeout(r, 300));

      // Test tabs
      const tabs = ['overview', 'hazards', 'ecology', 'cost_plan'];
      const tabLabels = ['Overview', 'Hazards', 'Ecology', 'Cost & Plan'];

      for (let i = 0; i < tabs.length; i++) {
        const tabId = tabs[i];
        const tabLabel = tabLabels[i];
        console.log(`Testing Tab: ${tabLabel}...`);

        // Click tab
        await page.evaluate((label) => {
          const btns = Array.from(document.querySelectorAll('#results-drawer button'));
          const target = btns.find(b => b.textContent && b.textContent.trim() === label);
          if (target) target.click();
        }, tabLabel);
        await new Promise(r => setTimeout(r, 300));

        // Check for zero 10px all-caps micro-labels
        const microCapsCheck = await page.evaluate(() => {
          const drawer = document.getElementById('results-drawer');
          if (!drawer) return { count: 0, bad: [] };

          const elements = Array.from(drawer.querySelectorAll('*'));
          const bad = [];
          for (const el of elements) {
            // Check computed styles
            const style = window.getComputedStyle(el);
            const text = (el.innerText || '').trim();
            if (!text || el.children.length > 0) continue; // leaf text only
            const isUpper = style.textTransform === 'uppercase' || (text === text.toUpperCase() && text.length > 3 && /[A-Z]/.test(text));
            const fontSize = parseFloat(style.fontSize);

            // Ignore acronyms like "WGS84", "AMSL", "NDMA", "MCDA", "CPWD", "PAR", "NDVI"
            const allowedAcronyms = ['WGS84', 'AMSL', 'NDMA', 'MCDA', 'CPWD', 'PAR', 'NDVI', 'NDWI', 'USGS', 'ECMWF', 'ERA5', 'STAC'];
            const isAcronym = allowedAcronyms.includes(text) || /^Z\s*=/.test(text);

            if (isUpper && !isAcronym && (fontSize <= 11 || style.textTransform === 'uppercase')) {
              bad.push({ text, fontSize: style.fontSize, transform: style.textTransform });
            }
          }
          return { count: bad.length, bad };
        });

        console.log(`  Tab ${tabLabel} micro-caps check: ${microCapsCheck.count === 0 ? 'PASS (0 micro-caps)' : 'FAIL (' + JSON.stringify(microCapsCheck.bad) + ')'}`);
        if (microCapsCheck.count > 0) {
          errors.push(`Tab ${tabLabel} at ${testWidth}px has micro-caps: ${JSON.stringify(microCapsCheck.bad)}`);
        }

        // Check for wrapping in key-value row values
        const rowWrapCheck = await page.evaluate(() => {
          const drawer = document.getElementById('results-drawer');
          if (!drawer) return { pass: true };
          // Find all values in key-value rows
          const values = Array.from(drawer.querySelectorAll('.whitespace-nowrap, .tabular-nums'));
          let wrappedCount = 0;
          for (const val of values) {
            if (val.scrollWidth > val.clientWidth + 1) {
              wrappedCount++;
            }
          }
          return { pass: wrappedCount === 0, wrappedCount };
        });

        console.log(`  Tab ${tabLabel} value wrap check: ${rowWrapCheck.pass ? 'PASS (0 wrapped values)' : 'FAIL (' + rowWrapCheck.wrappedCount + ' wrapped)'}`);
        if (!rowWrapCheck.pass) {
          errors.push(`Tab ${tabLabel} at ${testWidth}px has wrapped values`);
        }
      }
    }

    // 3. Test Collapsible Hazard Cards
    console.log('\n--- Testing Collapsible Hazard Cards ---');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#results-drawer button'));
      const target = btns.find(b => b.textContent && b.textContent.trim() === 'Hazards');
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 300));

    const hazardExpansion = await page.evaluate(() => {
      const drawer = document.getElementById('results-drawer');
      const buttons = Array.from(drawer.querySelectorAll('button[aria-expanded]'));
      const initialStates = buttons.map(b => ({
        title: b.textContent.trim(),
        expanded: b.getAttribute('aria-expanded') === 'true'
      }));

      // Click each to toggle
      for (const b of buttons) {
        b.click();
      }

      return { initialStates };
    });
    console.log('Hazard initial expansion states:', hazardExpansion.initialStates);
    // Worst hazard (Hydrological) should be expanded by default
    const floodExpanded = hazardExpansion.initialStates.some(h => h.title.includes('Hydrological') && h.expanded);
    console.log('Hydrological worst hazard expanded by default:', floodExpanded ? 'PASS' : 'FAIL');
    if (!floodExpanded) errors.push('Hydrological hazard was not expanded by default');

    // 4. Test Copy to Clipboard Pill
    console.log('\n--- Testing Ref Copy-to-Clipboard Pill ---');
    const copyPillResult = await page.evaluate(async () => {
      const copyBtn = document.querySelector('button[title*="copy analysis reference ID"]');
      if (!copyBtn) return { pass: false, message: 'Copy button not found' };
      const initialText = copyBtn.textContent.trim();
      copyBtn.click();
      await new Promise(r => setTimeout(r, 200));
      const afterClickText = copyBtn.textContent.trim();
      return {
        pass: afterClickText.includes('Copied') && initialText.includes('Ref:'),
        initialText,
        afterClickText
      };
    });
    console.log('Copy pill test:', copyPillResult.pass ? 'PASS' : 'FAIL', copyPillResult);
    if (!copyPillResult.pass) errors.push('Copy to clipboard pill failed');

    // 5. Test Tab Switching Preserves Analysis Data
    console.log('\n--- Testing Tab Switching Preserves Data ---');
    // First switch to Overview tab to capture baseline
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#results-drawer button'));
      const target = btns.find(b => b.textContent && b.textContent.trim() === 'Overview');
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 300));

    const scoreBefore = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="score-gauge-svg"]');
      return el ? el.getAttribute('aria-label') : null;
    });

    // Switch through other tabs
    for (const tabName of ['Hazards', 'Ecology', 'Cost & Plan', 'Overview']) {
      await page.evaluate((label) => {
        const btns = Array.from(document.querySelectorAll('#results-drawer button'));
        const target = btns.find(b => b.textContent && b.textContent.trim() === label);
        if (target) target.click();
      }, tabName);
      await new Promise(r => setTimeout(r, 200));
    }

    const scoreAfter = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="score-gauge-svg"]');
      return el ? el.getAttribute('aria-label') : null;
    });

    const dataPreserved = scoreBefore && scoreBefore === scoreAfter;
    console.log('Data preserved across tab switches:', dataPreserved ? 'PASS' : 'FAIL', `("${scoreBefore}")`);
    if (!dataPreserved) errors.push('Data was not preserved across tab switches');

    // 5.1 Test re-running analysis resets to Overview tab
    console.log('\n--- Testing Re-running Analysis Resets to Overview Tab ---');
    // Switch to Hazards tab first
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#results-drawer button'));
      const target = btns.find(b => b.textContent && b.textContent.trim() === 'Hazards');
      if (target) target.click();
    });
    await new Promise(r => setTimeout(r, 200));

    // Click Run Feasibility Analysis button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent && b.textContent.includes('Run Site Feasibility Analysis'));
      if (btn) btn.click();
    });
    // Wait for analysis to complete and results to render on Overview
    await page.waitForFunction(() => {
      return document.querySelector('[data-testid="score-gauge-svg"]') !== null;
    }, { timeout: 30000 });
    await new Promise(r => setTimeout(r, 400));

    const activeTabAfterRun = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#results-drawer button'));
      // Find the tab button that has the active background
      const activeBtn = btns.find(b => b.className.includes('bg-[var(--segmented-active-bg)]'));
      return activeBtn ? activeBtn.textContent.trim() : null;
    });
    console.log('Active tab after re-running analysis:', activeTabAfterRun);
    const resetToOverview = activeTabAfterRun === 'Overview';
    console.log('Re-running analysis resets to Overview tab:', resetToOverview ? 'PASS' : 'FAIL');
    if (!resetToOverview) errors.push('Re-running analysis did not reset to Overview tab');

    // 6. Test Score Gauge Geometry
    console.log('\n--- Testing Score Gauge Geometry ---');
    const gaugeMetrics = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="score-gauge-svg"]');
      if (!svg) return { pass: false, message: 'Gauge SVG not found' };
      const rect = svg.getBoundingClientRect();
      return {
        pass: Math.round(rect.width) === 84 && Math.round(rect.height) === 84,
        width: rect.width,
        height: rect.height,
        message: `${Math.round(rect.width)}x${Math.round(rect.height)}px`
      };
    });
    console.log('Score gauge 84px:', gaugeMetrics.pass ? 'PASS' : 'FAIL', `(${gaugeMetrics.message})`);
    if (!gaugeMetrics.pass) errors.push(`Score gauge is not 84px: ${gaugeMetrics.message}`);

    // 7. Test Theme Toggle (Dark & Light Contrast)
    console.log('\n--- Testing Theme Toggle ---');
    await page.evaluate(() => {
      const themeBtn = document.querySelector('button[title*="theme"], button[aria-label*="theme"]');
      if (themeBtn) themeBtn.click();
    });
    await new Promise(r => setTimeout(r, 400));
    const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    console.log('Switched theme to:', currentTheme);

    // Switch back to light
    await page.evaluate(() => {
      const themeBtn = document.querySelector('button[title*="theme"], button[aria-label*="theme"]');
      if (themeBtn) themeBtn.click();
    });
    await new Promise(r => setTimeout(r, 400));

    console.log('\n=======================================');
    console.log(`TOTAL VERIFICATION ERRORS: ${errors.length}`);
    if (errors.length > 0) {
      console.log('Errors:', errors);
      process.exit(1);
    } else {
      console.log('ALL V5 UX VERIFICATION CHECKS PASSED!');
    }
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runVerification();
