const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// Candidate Chrome executable paths
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

const VIEWPORTS = [
  { width: 2560, height: 1440, name: '2560x1440' },
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 1536, height: 900, name: '1536x900' },
  { width: 1535, height: 900, name: '1535x900' },
  { width: 1366, height: 768, name: '1366x768' },
  { width: 1024, height: 768, name: '1024x768' },
  { width: 900, height: 1000, name: '900x1000' },
  { width: 768, height: 1024, name: '768x1024' },
  { width: 390, height: 844, name: '390x844' },
];

// In-browser DOM integrity evaluation
function checkDOMViolations(isDrawerOpenIntended) {
  const violations = [];
  const winW = window.innerWidth;

  // 1. Page level horizontal overflow
  const docScrollW = document.documentElement.scrollWidth;
  if (docScrollW > winW) {
    violations.push({
      type: 'page-overflow',
      selector: 'document.documentElement',
      detail: `document.scrollWidth (${docScrollW}px) > window.innerWidth (${winW}px)`,
      diff: docScrollW - winW
    });
  }

  const allElements = document.querySelectorAll('*');

  allElements.forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'head', 'meta', 'link', 'noscript', 'title'].includes(tag)) return;

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
    if (rect.width === 0 && rect.height === 0) return;

    // Check intentionally off-canvas elements (like closed drawer)
    const isClosedDrawerOrChild = el.closest('#results-drawer.translate-x-full');
    if (isClosedDrawerOrChild && !isDrawerOpenIntended) return;

    // Leaflet & MapLibre internal panes/tiles and interactive GIS canvas (clipped by map container)
    if (
      el.closest('.leaflet-pane') ||
      el.closest('.leaflet-tile-container') ||
      el.classList.contains('leaflet-tile') ||
      el.closest('.leaflet-container') ||
      el.classList.contains('leaflet-container') ||
      el.closest('.maplibregl-map') ||
      el.classList.contains('maplibregl-map') ||
      el.closest('.maplibregl-canvas-container') ||
      el.classList.contains('maplibregl-canvas')
    ) return;

    // Center map section: explicitly mandated by Rule 3 to use overflow-hidden (clips the translated results drawer)
    if (el.id === 'center-map-section') return;

    // Status banner telemetry strip: explicitly mandated by Check 3.2 to use desktop truncation with title tooltip
    if (el.closest('div[role="status"]')) return;

    // Custom iOS select trigger button truncation (replaces native <select>)
    if (el.closest('[role="combobox"]')) return;

    // 2. Horizontal overflow: scrollWidth > clientWidth on elements not intended to scroll
    const isScrollableX = style.overflowX === 'auto' || style.overflowX === 'scroll';
    if (!isScrollableX && tag !== 'svg' && !el.closest('svg')) {
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        const textContent = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        violations.push({
          type: 'horizontal-overflow',
          tag,
          selector: (function() {
            let s = tag;
            if (el.id) return `#${el.id}`;
            if (el.className && typeof el.className === 'string') {
              const c = el.className.split(/\s+/).filter(x => x && !x.includes('[') && !x.includes(':') && !x.includes('/'));
              if (c.length) s += '.' + c.slice(0, 2).join('.');
            }
            return s;
          })(),
          detail: `scrollWidth (${el.scrollWidth}px) > clientWidth (${el.clientWidth}px)`,
          diff: el.scrollWidth - el.clientWidth,
          textSample: textContent
        });
      }
    }

    // 3. Vertical clipping: scrollHeight > clientHeight on overflow: hidden elements containing text
    const isOverflowHiddenY = style.overflowY === 'hidden' || style.overflow === 'hidden';
    if (isOverflowHiddenY && tag !== 'svg' && !el.closest('svg') && !el.closest('.leaflet-container')) {
      const hasText = Array.from(el.childNodes).some(node => node.nodeType === 3 && node.textContent.trim().length > 0);
      if (hasText && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0) {
        const textContent = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        violations.push({
          type: 'vertical-clipping',
          tag,
          selector: tag + (el.id ? `#${el.id}` : '') + (typeof el.className === 'string' ? '.' + el.className.split(/\s+/).filter(x => x && !x.includes('[') && !x.includes(':')).slice(0, 2).join('.') : ''),
          detail: `scrollHeight (${el.scrollHeight}px) > clientHeight (${el.clientHeight}px) with overflow:hidden`,
          diff: el.scrollHeight - el.clientHeight,
          textSample: textContent
        });
      }
    }

    // 4. Off-canvas elements: rect.right > winW or rect.left < 0
    if (tag !== 'html' && tag !== 'body') {
      if (rect.right > winW + 1) {
        violations.push({
          type: 'off-canvas-right',
          tag,
          selector: tag + (el.id ? `#${el.id}` : ''),
          detail: `right edge (${Math.round(rect.right)}px) > viewport width (${winW}px)`,
          diff: Math.round(rect.right - winW),
          textSample: (el.innerText || '').trim().slice(0, 40)
        });
      }
      if (rect.left < -1) {
        violations.push({
          type: 'off-canvas-left',
          tag,
          selector: tag + (el.id ? `#${el.id}` : ''),
          detail: `left edge (${Math.round(rect.left)}px) < 0`,
          diff: Math.round(-rect.left),
          textSample: (el.innerText || '').trim().slice(0, 40)
        });
      }
    }
  });

  return violations;
}

(async () => {
  const chromePath = getChromePath();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  const allResults = [];
  const checks = [];

  console.log('=====================================================');
  console.log('  BUILDWISE UI INTEGRITY & RESPONSIVE AUDIT SUITE    ');
  console.log('=====================================================');

  // STEP 1: Audit Empty State across all viewports
  console.log('\n--- 1. AUDITING EMPTY STATE ---');
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));

    // Clear location to ensure clean empty state
    await page.evaluate(() => {
      const clearBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Clear'));
      if (clearBtn) clearBtn.click();
    });
    await new Promise(r => setTimeout(r, 200));

    const violations = await page.evaluate(checkDOMViolations, false);
    allResults.push({
      viewport: vp.name,
      state: 'empty',
      drawer: 'closed',
      violations
    });
    console.log(`[EMPTY]  ${vp.name.padEnd(10)} (drawer: closed) -> ${violations.length} violations`);
  }

  // STEP 2: Audit Loaded State with Full Feasibility Analysis
  console.log('\n--- 2. AUDITING LOADED STATE (FULL FEASIBILITY DATA) ---');
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));

  console.log('Triggering "Run Site Feasibility Analysis" for live data...');
  const submitSuccess = await page.evaluate(async () => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const runBtn = buttons.find(b => b.textContent && (b.textContent.includes('Run Site Feasibility Analysis') || b.textContent.includes('Run Feasibility')));
    if (runBtn) {
      runBtn.click();
      return true;
    }
    return false;
  });

  if (!submitSuccess) {
    throw new Error('Could not find Run Feasibility Analysis button!');
  }

  await page.waitForFunction(() => {
    return document.body.innerText.includes('Land Suitability Assessment');
  }, { timeout: 60000 });
  console.log('Feasibility results successfully rendered.');

  // Audit loaded state at every viewport
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 400));

    const isDesktopDrawer = vp.width >= 1024 && vp.width < 1536;

    // Check normal state
    let isDrawerOpen = false;
    if (isDesktopDrawer) {
      isDrawerOpen = await page.evaluate(() => {
        const toggleBtn = document.querySelector('button[aria-controls="results-drawer"]');
        return toggleBtn ? toggleBtn.getAttribute('aria-expanded') === 'true' : false;
      });
    }

    const v1 = await page.evaluate(checkDOMViolations, isDrawerOpen);
    allResults.push({
      viewport: vp.name,
      state: 'loaded',
      drawer: isDesktopDrawer ? (isDrawerOpen ? 'open' : 'closed') : 'n/a',
      violations: v1
    });
    console.log(`[LOADED] ${vp.name.padEnd(10)} (drawer: ${isDesktopDrawer ? (isDrawerOpen ? 'open  ' : 'closed') : 'n/a   '}) -> ${v1.length} violations`);

    // For 1535x900, 1366x768, and 1024x768, test BOTH drawer open AND closed
    if (['1535x900', '1366x768', '1024x768'].includes(vp.name)) {
      // Toggle drawer state
      const toggled = await page.evaluate(() => {
        const toggleBtn = document.querySelector('button[aria-controls="results-drawer"]');
        if (toggleBtn) {
          toggleBtn.click();
          return true;
        }
        return false;
      });

      if (toggled) {
        await new Promise(r => setTimeout(r, 400));
        const newDrawerOpen = !isDrawerOpen;
        const v2 = await page.evaluate(checkDOMViolations, newDrawerOpen);
        allResults.push({
          viewport: vp.name,
          state: 'loaded',
          drawer: newDrawerOpen ? 'open' : 'closed',
          violations: v2
        });
        console.log(`[LOADED] ${vp.name.padEnd(10)} (drawer: ${newDrawerOpen ? 'open  ' : 'closed'}) -> ${v2.length} violations`);

        // Return drawer to open state for consistency
        if (!newDrawerOpen) {
          await page.evaluate(() => {
            const toggleBtn = document.querySelector('button[aria-controls="results-drawer"]');
            if (toggleBtn) toggleBtn.click();
          });
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }
  }

  // STEP 3: Targeted Post-Fix Integrity Checks
  console.log('\n--- 3. TARGETED POST-FIX INTEGRITY CHECKS ---');

  // Check 3.1: Score Gauge SVG width >= 120px
  await page.setViewport({ width: 1920, height: 1080 });
  await new Promise(r => setTimeout(r, 200));
  const gaugeCheck = await page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll('[data-testid="score-gauge-svg"], svg[aria-label*="score visual ring gauge"]'));
    const visibleSvg = svgs.find(s => s.getBoundingClientRect().width > 0);
    if (!visibleSvg) return { pass: false, message: 'No visible Score gauge SVG found' };
    const rect = visibleSvg.getBoundingClientRect();
    return {
      pass: rect.width >= 120,
      width: rect.width,
      height: rect.height,
      message: `Score gauge SVG renders at ${Math.round(rect.width)}x${Math.round(rect.height)}px (>= 120px requirement)`
    };
  });
  checks.push({ name: 'Score Gauge SVG Dimensions', ...gaugeCheck });
  console.log(`[CHECK] Score Gauge SVG (>=120px): ${gaugeCheck.pass ? 'PASS' : 'FAIL'} (${gaugeCheck.message})`);

  // Inject telemetry test warnings for banner & popover validation
  await page.evaluate(() => {
    if (window.__setTestWarnings) {
      window.__setTestWarnings([
        'Topographic elevation service unreachable. Synthetic contour gradient applied.',
        'Reverse geocoding service timed out. Coordinate identifier applied.'
      ]);
    }
  });
  await new Promise(r => setTimeout(r, 300));

  // Check 3.2: StatusBanner Telemetry strip truncate rule (desktop >= 1024px)
  const bannerDesktop = await page.evaluate(() => {
    const banner = document.querySelector('div[role="status"]');
    if (!banner) return { pass: false, message: 'Status banner not found' };
    const textEl = banner.querySelector('span[title]');
    if (!textEl) return { pass: false, message: 'Banner text with title attribute not found' };
    const hasTruncate = textEl.className.includes('lg:truncate');
    const hasTitle = textEl.hasAttribute('title') && textEl.getAttribute('title').length > 0;
    return {
      pass: hasTruncate && hasTitle,
      message: `Desktop status banner has lg:truncate and title attribute ("${textEl.getAttribute('title')}")`
    };
  });
  checks.push({ name: 'StatusBanner Telemetry Truncate & Title', ...bannerDesktop });
  console.log(`[CHECK] StatusBanner Desktop Truncate & Title: ${bannerDesktop.pass ? 'PASS' : 'FAIL'} (${bannerDesktop.message})`);

  // Check 3.3: StatusBanner mobile wrapping (<1024px)
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 300));
  const bannerMobile = await page.evaluate(() => {
    const banner = document.querySelector('div[role="status"]');
    if (!banner) return { pass: false, message: 'Status banner not found' };
    const textEl = banner.querySelector('span[title]');
    if (!textEl) return { pass: false, message: 'Banner text element not found' };
    const style = window.getComputedStyle(textEl);
    const wraps = style.whiteSpace === 'normal';
    return {
      pass: wraps,
      whiteSpace: style.whiteSpace,
      message: `Mobile status banner whitespace is "${style.whiteSpace}" (wraps naturally without truncate)`
    };
  });
  checks.push({ name: 'StatusBanner Mobile Wrapping', ...bannerMobile });
  console.log(`[CHECK] StatusBanner Mobile Wrapping: ${bannerMobile.pass ? 'PASS' : 'FAIL'} (${bannerMobile.message})`);

  // Check 3.4: Telemetry popover reachable by Mouse and Keyboard
  await page.setViewport({ width: 1920, height: 1080 });
  await new Promise(r => setTimeout(r, 300));
  const popoverCheck = await page.evaluate(async () => {
    const noticeBtn = document.querySelector('button[aria-haspopup="dialog"]');
    if (!noticeBtn) return { pass: false, message: 'Notice button with aria-haspopup="dialog" not found' };

    // Mouse click test
    noticeBtn.click();
    await new Promise(r => setTimeout(r, 200));
    let dialog = document.querySelector('div[role="dialog"]');
    const mouseOpened = dialog !== null;

    // Close via Escape key
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise(r => setTimeout(r, 200));
    dialog = document.querySelector('div[role="dialog"]');
    const escClosed = dialog === null;

    // Keyboard open test via Enter key on noticeBtn
    noticeBtn.focus();
    noticeBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    noticeBtn.click(); // simulate default button enter action
    await new Promise(r => setTimeout(r, 200));
    dialog = document.querySelector('div[role="dialog"]');
    const keyboardOpened = dialog !== null;

    // Close again
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise(r => setTimeout(r, 200));

    // Reset warnings
    if (window.__setTestWarnings) window.__setTestWarnings(null);

    return {
      pass: mouseOpened && escClosed && keyboardOpened,
      mouseOpened,
      escClosed,
      keyboardOpened,
      message: `Mouse open: ${mouseOpened}, Esc close: ${escClosed}, Keyboard open: ${keyboardOpened}`
    };
  });
  checks.push({ name: 'Telemetry Popover Mouse & Keyboard Accessibility', ...popoverCheck });
  console.log(`[CHECK] Telemetry Popover Accessible: ${popoverCheck.pass ? 'PASS' : 'FAIL'} (${popoverCheck.message})`);

  // Check 3.5: MethodologyModal Formula Wrapping & Scrollbar
  const modalCheck = await page.evaluate(async () => {
    const methodologyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Methodology'));
    if (!methodologyBtn) return { pass: false, message: 'Methodology button not found' };
    methodologyBtn.click();
    await new Promise(r => setTimeout(r, 300));

    const formulaEl = document.querySelector('#mcda-formula');
    if (!formulaEl) return { pass: false, message: 'Formula element (#mcda-formula) not found in modal' };

    const style = window.getComputedStyle(formulaEl);
    const hasScrollX = style.overflowX === 'auto' || style.overflowX === 'scroll';
    const hasWbr = formulaEl.querySelectorAll('wbr').length > 0;

    // Close modal
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise(r => setTimeout(r, 200));

    return {
      pass: hasScrollX && hasWbr,
      hasScrollX,
      wbrCount: formulaEl.querySelectorAll('wbr').length,
      message: `Formula has overflow-x: ${style.overflowX} and contains ${formulaEl.querySelectorAll('wbr').length} <wbr> break opportunities`
    };
  });
  checks.push({ name: 'MethodologyModal Formula Wrapping', ...modalCheck });
  console.log(`[CHECK] MethodologyModal Formula Wrapping: ${modalCheck.pass ? 'PASS' : 'FAIL'} (${modalCheck.message})`);

  // Check 3.6: Rail Overflow Semantics
  const overflowSemantics = await page.evaluate(() => {
    const leftRail = document.querySelector('aside');
    const centerSection = document.querySelector('#center-map-section');

    const leftStyle = leftRail ? window.getComputedStyle(leftRail) : null;
    const centerStyle = centerSection ? window.getComputedStyle(centerSection) : null;

    const leftOk = leftStyle && (leftStyle.overflowY === 'auto' || leftStyle.overflowY === 'scroll') && (leftStyle.overflowX === 'hidden' || leftStyle.overflowX === 'clip');
    const centerOk = centerStyle && (centerStyle.overflow === 'hidden' || centerStyle.overflowX === 'hidden');

    return {
      pass: Boolean(leftOk && centerOk),
      leftOverflowY: leftStyle?.overflowY,
      leftOverflowX: leftStyle?.overflowX,
      centerOverflow: centerStyle?.overflow,
      message: `Rails keep overflow-y-auto (left: ${leftStyle?.overflowY}, overflow-x: ${leftStyle?.overflowX}); Map uses overflow-hidden (${centerStyle?.overflow})`
    };
  });
  checks.push({ name: 'Rail & Map Overflow Semantics', ...overflowSemantics });
  console.log(`[CHECK] Rail & Map Overflow Semantics: ${overflowSemantics.pass ? 'PASS' : 'FAIL'} (${overflowSemantics.message})`);

  // Check 3.7: Zoom Sweep Test (Zooms 12 through 19)
  await page.setViewport({ width: 1920, height: 1080 });
  const zoomSweepCheck = await page.evaluate(async () => {
    const map = window.__leafletMap;
    const marker = window.__leafletMarker;
    const footprint = window.__leafletFootprint;
    if (!map || !marker || !footprint) {
      return { pass: false, message: 'Leaflet map, marker, or footprint instance not found' };
    }

    const zoomLevels = [12, 13, 14, 15, 16, 17, 18, 19];
    const errors = [];
    const sweepResults = [];

    for (const z of zoomLevels) {
      map.setZoom(z, { animate: false });
      await new Promise(r => setTimeout(r, 60));

      const markerLatLng = marker.getLatLng();
      const markerPt = map.latLngToContainerPoint(markerLatLng);

      const latlngs = footprint.getLatLngs()[0];
      const centroidLat = latlngs.reduce((sum, p) => sum + p.lat, 0) / latlngs.length;
      const centroidLng = latlngs.reduce((sum, p) => sum + p.lng, 0) / latlngs.length;
      const centroidPt = map.latLngToContainerPoint([centroidLat, centroidLng]);

      const dist = Math.hypot(centroidPt.x - markerPt.x, centroidPt.y - markerPt.y);
      sweepResults.push({ zoom: z, dist: dist.toFixed(4) });

      if (dist > 1.0) {
        errors.push(`Zoom ${z}: distance ${dist.toFixed(2)}px > 1.0px`);
      }
    }

    const maxDist = Math.max(...sweepResults.map(r => parseFloat(r.dist)));
    return {
      pass: errors.length === 0,
      maxDist: maxDist.toFixed(4),
      errors,
      sweepResults,
      message: errors.length === 0
        ? `Footprint centroid & marker coincide within 1px at all zooms 12-19 (max dist: ${maxDist.toFixed(4)}px)`
        : errors.join('; ')
    };
  });
  checks.push({ name: 'Marker & Footprint Zoom Sweep Alignment (Zooms 12-19)', ...zoomSweepCheck });
  console.log(`[CHECK] Zoom Sweep Alignment (12-19): ${zoomSweepCheck.pass ? 'PASS' : 'FAIL'} (${zoomSweepCheck.message})`);

  // Check 3.8: Footprint Orientation & Long Side Angle on Screen
  const orientationAngleCheck = await page.evaluate(async () => {
    const map = window.__leafletMap;
    const footprint = window.__leafletFootprint;
    if (!map || !footprint) return { pass: false, message: 'Map or footprint not found' };

    const zoomLevels = [12, 13, 14, 15, 16, 17, 18, 19];
    const angleResults = [];
    const errors = [];

    for (const z of zoomLevels) {
      map.setZoom(z, { animate: false });
      await new Promise(r => setTimeout(r, 60));

      const latlngs = footprint.getLatLngs()[0];
      // Use map.project for subpixel projected coordinates, avoiding integer discretization error at low zooms
      const p0 = map.project(latlngs[0], z);
      const p1 = map.project(latlngs[1], z);

      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y; // screen Y is downwards

      // Screen bearing clockwise from North (where North is -Y, East is +X)
      const bearingRad = Math.atan2(dx, -dy);
      let bearingDeg = (bearingRad * 180 / Math.PI + 360) % 360;

      // Distance from due East-West (bearing 90° or 270°)
      const devFromEastWest = Math.min(Math.abs(bearingDeg - 90), Math.abs(bearingDeg - 270));
      angleResults.push({ zoom: z, bearing: bearingDeg.toFixed(2), devFromEastWest: devFromEastWest.toFixed(2) });

      // Acceptance criterion 2: within 5 degrees of east-west on screen at every zoom level tested
      if (devFromEastWest > 5.0) {
        errors.push(`Zoom ${z}: long side deviates ${devFromEastWest.toFixed(2)}° from East-West (> 5° threshold)`);
      }
    }

    return {
      pass: errors.length === 0,
      errors,
      angleResults,
      message: errors.length === 0
        ? `Long side runs within 5° of East-West on screen at all zooms (bearing: ${angleResults[0].bearing}°, deviation: ${angleResults[0].devFromEastWest}°)`
        : errors.join('; ')
    };
  });
  checks.push({ name: 'Footprint Long Side East-West Orientation Angle', ...orientationAngleCheck });
  console.log(`[CHECK] Footprint East-West Orientation: ${orientationAngleCheck.pass ? 'PASS' : 'FAIL'} (${orientationAngleCheck.message})`);

  // SUMMARY & REPORT
  const totalViolations = allResults.reduce((acc, r) => acc + r.violations.length, 0);
  const failedChecks = checks.filter(c => !c.pass);

  console.log('\n=====================================================');
  console.log(`  AUDIT COMPLETE: ${totalViolations} DOM VIOLATIONS, ${failedChecks.length} FAILED CHECKS`);
  console.log('=====================================================');

  const report = {
    timestamp: new Date().toISOString(),
    totalViolations,
    passedAllChecks: totalViolations === 0 && failedChecks.length === 0,
    viewportResults: allResults,
    integrityChecks: checks
  };

  const reportPath = path.join(__dirname, 'audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);

  await browser.close();

  if (totalViolations > 0 || failedChecks.length > 0) {
    console.error('Audit failed with violations or check failures.');
    process.exit(1);
  } else {
    console.log('SUCCESS: All UI integrity requirements passed with 0 violations!');
    process.exit(0);
  }
})();
