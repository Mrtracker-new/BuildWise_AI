const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const http = require('http');

// The full-screen analysis tool lives at /app ("/" is the marketing landing page).
const APP_URL = process.env.APP_URL || 'http://localhost:5173/app';
// The feasibility analysis is a backend call; STEP 2 cannot complete without it.
const API_URL = process.env.API_URL || 'http://localhost:8000';

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

// Tier boundaries mirror src/design/breakpoints.ts: FULL >= 1024 keeps the
// persistent floating asides; below that, panels live in Drawers.
const isFullTierWidth = (w) => w >= 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cheap node-side health probe so a down backend fails with a clear message. */
function checkApiHealth() {
  return new Promise((resolve) => {
    const req = http.get(`${API_URL}/api/status`, { timeout: 5000 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/** Click the first button whose text matches `re` (real DOM click). */
async function clickButtonByText(page, re) {
  return page.evaluate((pattern) => {
    const rx = new RegExp(pattern);
    const btn = Array.from(document.querySelectorAll('button')).find((b) => rx.test(b.textContent || ''));
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }, re.source);
}

/** Wait until a button matching `re` exists AND is enabled. */
async function waitForButtonEnabled(page, re, timeout) {
  await page.waitForFunction((pattern) => {
    const rx = new RegExp(pattern);
    const btn = Array.from(document.querySelectorAll('button')).find((b) => rx.test(b.textContent || ''));
    return Boolean(btn) && !btn.disabled;
  }, { timeout }, re.source);
}

const dialogPresent = (page) =>
  page.evaluate(() => Boolean(document.querySelector('div[role="dialog"]')));

/**
 * Open/close the results panel through the REAL tier-appropriate toggle:
 * the header results toggle (compact tiers, opens the Drawer) or the desktop
 * "View/Hide Results" toggle (FULL tier, slides the floating aside).
 */
async function setResultsPanel(page, wantOpen) {
  return page.evaluate(async (want) => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const headerToggle = document.getElementById('results-toggle');
    const desktopToggle = Array.from(document.querySelectorAll('button[aria-controls="results-drawer"]'))
      .find((b) => b.id !== 'results-toggle');
    const btn = headerToggle && headerToggle.offsetParent !== null ? headerToggle : desktopToggle;
    if (!btn) return { ok: false, reason: 'no visible results toggle' };
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    if (isOpen === want) return { ok: true, isOpen, changed: false };
    btn.click();
    await s(450);
    return { ok: true, isOpen: btn.getAttribute('aria-expanded') === 'true', changed: true };
  }, wantOpen);
}

/** Intended open-state of the results panel for the audit's skip logic. */
function resultsOpenIntended(page, fullTier) {
  if (!fullTier) return Promise.resolve(false);
  return page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('button[aria-controls="results-drawer"]'))
      .find((b) => b.id !== 'results-toggle');
    return t ? t.getAttribute('aria-expanded') === 'true' : false;
  });
}

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

    // Intentionally truncated text with ellipsis or multi-line clamp
    if (style.textOverflow === 'ellipsis' || el.classList.contains('truncate') || el.classList.contains('line-clamp-2') || style.webkitLineClamp) return;

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
    if (isOverflowHiddenY && tag !== 'svg' && !el.closest('svg') && !el.closest('.leaflet-container') && !el.classList.contains('line-clamp-2') && !style.webkitLineClamp) {
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
  page.on('console', msg => {
    const t = msg.text();
    if (msg.type() === 'error') console.log('PAGE ERROR LOG:', t.slice(0, 300));
  });
  page.on('pageerror', err => console.log('PAGE EXCEPTION:', err.toString().slice(0, 300)));
  const allResults = [];
  const checks = [];

  console.log('=====================================================');
  console.log('  BUILDWISE UI INTEGRITY & RESPONSIVE AUDIT SUITE    ');
  console.log('=====================================================');

  // STEP 0: backend health (loaded-state seeding performs a real analysis call)
  const apiUp = await checkApiHealth();
  console.log(`\n[PRE-FLIGHT] Backend ${API_URL} ${apiUp ? 'reachable' : 'UNREACHABLE'}`);
  if (!apiUp) {
    await browser.close();
    console.error('Audit cannot seed the loaded state: backend /api/status unreachable.');
    console.error('Start the backend (python backend/run_backend.py) and re-run this audit.');
    process.exit(2);
  }

  // STEP 1: Audit Empty State across all viewports
  console.log('\n--- 1. AUDITING EMPTY STATE ---');
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));

    // Clear location to ensure clean empty state
    await page.evaluate(() => {
      const clearBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Clear'));
      if (clearBtn) clearBtn.click();
    });
    await new Promise(r => setTimeout(r, 200));

    const fullTier = isFullTierWidth(vp.width);
    const intended = await resultsOpenIntended(page, fullTier);
    const violations = await page.evaluate(checkDOMViolations, intended);
    allResults.push({
      viewport: vp.name,
      state: 'empty',
      drawer: intended ? 'open' : 'closed',
      violations
    });
    console.log(`[EMPTY]  ${vp.name.padEnd(10)} (results: ${intended ? 'open  ' : 'closed'}) -> ${violations.length} violations`);
  }

  // STEP 2: Audit Loaded State with Full Feasibility Analysis
  // Seeded through the REAL user flow: the pre-boundary CTA opens the capture
  // wizard (STEP ZERO), a rectangular boundary is traced and committed, and
  // only then does the "Run Site Feasibility Analysis" CTA exist. The old
  // expectation of finding the Run CTA on fresh load was stale.
  console.log('\n--- 2. AUDITING LOADED STATE (FULL FEASIBILITY DATA) ---');
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));

  console.log('Seeding: opening capture wizard from the pre-boundary CTA (STEP ZERO)...');
  const preCtaClicked = await clickButtonByText(page, /Select Location on Map to Begin|Run Site Feasibility Analysis/);
  if (!preCtaClicked) {
    await browser.close();
    throw new Error('Pre-boundary CTA not found (expected "Select Location on Map to Begin").');
  }
  await page.waitForFunction(() => /Locate the site/.test(document.body.innerText || ''), { timeout: 20000 });

  console.log('Seeding: tracing a rectangular boundary...');
  if (!(await clickButtonByText(page, /Trace boundary/))) {
    await browser.close();
    throw new Error('"Trace boundary" not found in the capture wizard.');
  }
  await sleep(800);
  if (!(await clickButtonByText(page, /\bRect\b/))) {
    await browser.close();
    throw new Error('"Rect" trace tool not found in the capture wizard.');
  }
  // Rect trace auto-advances to FRONTAGE, where the user picks the frontage
  // edge by clicking it on the map or its row in the sheet (there is no
  // separate Accept button in the current UI); picking enables Review.
  await page.waitForFunction(() => /Confirm the frontage/.test(document.body.innerText || ''), { timeout: 40000 });
  await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="edge-row-2"]')), { timeout: 20000 });
  await page.evaluate(() => {
    const row = document.querySelector('[data-testid="edge-row-2"]');
    if (row) row.click();
  });
  console.log('Frontage edge picked via its sheet row.');
  try {
    await waitForButtonEnabled(page, /\bReview\b/, 20000);
  } catch (e) {
    const snap = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .map((b) => `${(b.textContent || '').trim()}${b.disabled ? ' [disabled]' : ''}`)
        .filter(Boolean)
    );
    console.log('CaptureSheet buttons at FRONTAGE after pick:', JSON.stringify(snap));
    throw e;
  }
  await clickButtonByText(page, /\bReview\b/);
  await page.waitForFunction(() => /Review boundary/.test(document.body.innerText || ''), { timeout: 20000 });
  await waitForButtonEnabled(page, /Use this boundary/, 20000);
  await clickButtonByText(page, /Use this boundary/);
  await waitForButtonEnabled(page, /Run Site Feasibility Analysis/, 20000);
  console.log('Boundary committed; running feasibility analysis...');

  await clickButtonByText(page, /Run Site Feasibility Analysis/);
  await page.waitForFunction(() => {
    return document.body.innerText.includes('Land Suitability Assessment');
  }, { timeout: 90000 });
  console.log('Feasibility results successfully rendered.');

  // Audit loaded state at every viewport, including BOTH drawer states via the
  // real tier-appropriate toggle (header toggle on compact tiers, desktop
  // toggle on FULL tier).
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height });
    await new Promise(r => setTimeout(r, 400));
    const fullTier = isFullTierWidth(vp.width);

    let intended = await resultsOpenIntended(page, fullTier);
    const v1 = await page.evaluate(checkDOMViolations, intended);
    allResults.push({
      viewport: vp.name,
      state: 'loaded',
      drawer: intended ? 'open' : 'closed',
      violations: v1
    });
    console.log(`[LOADED] ${vp.name.padEnd(10)} (drawer: ${intended ? 'open  ' : 'closed'}) -> ${v1.length} violations`);

    const audited = new Set([intended]);
    for (const want of [true, false]) {
      const r = await setResultsPanel(page, want);
      if (!r.ok) {
        console.log(`[LOADED] ${vp.name.padEnd(10)} results toggle unavailable: ${r.reason}`);
        continue;
      }
      if (!audited.has(want)) {
        await new Promise(res => setTimeout(res, 400));
        const v2 = await page.evaluate(checkDOMViolations, want);
        allResults.push({
          viewport: vp.name,
          state: 'loaded',
          drawer: want ? 'open' : 'closed',
          violations: v2
        });
        console.log(`[LOADED] ${vp.name.padEnd(10)} (drawer: ${want ? 'open  ' : 'closed'}) -> ${v2.length} violations`);
        audited.add(want);
      }
    }
  }

  // STEP 3: Targeted Post-Fix Integrity Checks
  console.log('\n--- 3. TARGETED POST-FIX INTEGRITY CHECKS ---');

  // Make the results panel visible for the gauge check (real toggle).
  const gaugeOpen = await setResultsPanel(page, true);
  if (gaugeOpen.ok) await sleep(400);

  // Check 3.1: Score Gauge SVG width >= 84px
  await page.setViewport({ width: 1920, height: 1080 });
  await new Promise(r => setTimeout(r, 200));
  const gaugeCheck = await page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll('[data-testid="score-gauge-svg"], svg[aria-label*="score visual ring gauge"]'));
    const visibleSvg = svgs.find(s => s.getBoundingClientRect().width > 0);
    if (!visibleSvg) return { pass: false, message: 'No visible Score gauge SVG found' };
    const rect = visibleSvg.getBoundingClientRect();
    return {
      pass: rect.width >= 84,
      width: rect.width,
      height: rect.height,
      message: `Score gauge SVG renders at ${Math.round(rect.width)}x${Math.round(rect.height)}px (>= 84px requirement)`
    };
  });
  checks.push({ name: 'Score Gauge SVG Dimensions', ...gaugeCheck });
  console.log(`[CHECK] Score Gauge SVG (>=84px): ${gaugeCheck.pass ? 'PASS' : 'FAIL'} (${gaugeCheck.message})`);

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

  // Check 3.2: StatusBanner Telemetry strip truncate rule (desktop >= 1024px).
  // Multiple role="status" elements can exist (SitePreviewHUD, AnalysisHUD), so
  // scope to the real telemetry banner: the one led by the "Notice:" label.
  const bannerDesktop = await page.evaluate(() => {
    const banner = Array.from(document.querySelectorAll('div[role="status"]'))
      .find((b) => (b.textContent || '').includes('Notice:'));
    if (!banner) return { pass: false, message: 'Telemetry status banner ("Notice:") not found' };
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
    const banner = Array.from(document.querySelectorAll('div[role="status"]'))
      .find((b) => (b.textContent || '').includes('Notice:'));
    if (!banner) return { pass: false, message: 'Telemetry status banner ("Notice:") not found' };
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

  // Check 3.4: Telemetry popover reachable by Mouse and Keyboard.
  // Uses REAL input (page-level click + keyboard) — dispatched synthetic
  // KeyboardEvents never reach window keydown handlers.
  await page.setViewport({ width: 1920, height: 1080 });
  await new Promise(r => setTimeout(r, 300));
  let popoverCheck;
  {
    const noticeBtn = await page.$('button[aria-haspopup="dialog"]');
    if (!noticeBtn) {
      popoverCheck = { pass: false, message: 'Notice button with aria-haspopup="dialog" not found' };
    } else {
      try {
        await noticeBtn.click();
        await sleep(250);
        const mouseOpened = await dialogPresent(page);
        await page.keyboard.press('Escape');
        await sleep(250);
        const escClosed = !(await dialogPresent(page));
        await noticeBtn.focus();
        await page.keyboard.press('Enter');
        await sleep(250);
        const keyboardOpened = await dialogPresent(page);
        await page.keyboard.press('Escape');
        await sleep(250);
        const escClosed2 = !(await dialogPresent(page));
        popoverCheck = {
          pass: mouseOpened && escClosed && keyboardOpened && escClosed2,
          mouseOpened, escClosed, keyboardOpened,
          message: `Mouse open: ${mouseOpened}, Esc close: ${escClosed}, Keyboard open: ${keyboardOpened}, Esc close: ${escClosed2}`
        };
      } catch (e) {
        popoverCheck = { pass: false, message: `Popover interaction failed: ${e.message}` };
      }
    }
  }
  await page.evaluate(() => { if (window.__setTestWarnings) window.__setTestWarnings(null); });
  checks.push({ name: 'Telemetry Popover Mouse & Keyboard Accessibility', ...popoverCheck });
  console.log(`[CHECK] Telemetry Popover Accessible: ${popoverCheck.pass ? 'PASS' : 'FAIL'} (${popoverCheck.message})`);

  // Check 3.5: MethodologyModal Formula Wrapping, Scrollbar & real close
  const methodologyClicked = await clickButtonByText(page, /Methodology/);
  await sleep(400);
  const modalCheck = await page.evaluate(() => {
    const formulaEl = document.querySelector('#mcda-formula');
    if (!formulaEl) return { pass: false, message: 'Formula element (#mcda-formula) not found in modal' };
    const style = window.getComputedStyle(formulaEl);
    const hasScrollX = style.overflowX === 'auto' || style.overflowX === 'scroll';
    const hasWbr = formulaEl.querySelectorAll('wbr').length > 0;
    return {
      pass: hasScrollX && hasWbr,
      hasScrollX,
      wbrCount: formulaEl.querySelectorAll('wbr').length,
      message: `Formula has overflow-x: ${style.overflowX} and contains ${formulaEl.querySelectorAll('wbr').length} <wbr> break opportunities`
    };
  });
  // Close via the modal's real Close button (the old window-dispatched Escape
  // never reached the handler).
  await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Close modal"]');
    if (b) b.click();
  });
  await sleep(250);
  const modalClosed = await page.evaluate(() => !document.querySelector('#mcda-formula'));
  if (!methodologyClicked) modalCheck.pass = false;
  modalCheck.message += methodologyClicked
    ? (modalClosed ? '; modal closed via Close button' : '; MODAL DID NOT CLOSE')
    : '; Methodology button not found';
  if (!modalClosed && methodologyClicked) modalCheck.pass = false;
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

  // Check 3.7: Site-estimate geometry stands down when a plot is captured.
  // The old zoom-sweep / east-west orientation checks asserted the PIN-ANCHORED
  // footprint overlay, which is unreachable by design today: the analysis (and
  // therefore the orientation) only exists AFTER a boundary is committed, and
  // every boundary-clearing site move invalidates the analysis (STALE-STATE
  // RULE). The current invariant is the reverse: while a plot is captured, the
  // pin-anchored estimate (footprint + entrance) MUST NOT render, so the map
  // never describes two different sites at once. (Same guard the e2e asserts.)
  await page.setViewport({ width: 1920, height: 1080 });
  await sleep(300);
  const estimateStandDown = await page.evaluate(() => {
    const featuresOf = (id) => {
      const m = window.__maplibreMap;
      if (!m) return -1;
      const s = m.getSource(id);
      if (!s) return -1;
      const d = s.serialize().data;
      if (d && d.features) return d.features.length;
      if (d && d.geometry) {
        return d.geometry.type === 'Polygon' ? (d.geometry.coordinates[0] || []).length : (d.geometry.coordinates || []).length;
      }
      return 0;
    };
    return {
      mapReady: Boolean(window.__maplibreMap),
      plotCaptured: Boolean(document.querySelector('div[role="status"]')),
      footprintFeatures: featuresOf('footprint-source'),
      entranceFeatures: featuresOf('entrance-shaft-source'),
    };
  });
  const estimateOk =
    estimateStandDown.mapReady &&
    estimateStandDown.footprintFeatures === 0 &&
    estimateStandDown.entranceFeatures === 0;
  checks.push({
    name: 'Pin-Anchored Site Estimate Stands Down While a Plot Is Captured',
    pass: estimateOk,
    ...estimateStandDown,
    message: estimateOk
      ? 'No pin-anchored footprint or entrance overlay renders while the captured plot owns the site'
      : `mapReady: ${estimateStandDown.mapReady}, footprint features: ${estimateStandDown.footprintFeatures}, entrance features: ${estimateStandDown.entranceFeatures}`
  });
  console.log(`[CHECK] Site Estimate Stand-Down (plot captured): ${estimateOk ? 'PASS' : 'FAIL'} (${checks[checks.length - 1].message})`);

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
