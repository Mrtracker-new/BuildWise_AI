/**
 * e2e_selection_policy.cjs — selection-path browser pass.
 * ======================================================
 * One fresh 8 x 40 m T1 G+2 site through the REAL UI:
 *
 *   natural programme: the deficit/squeeze banner and the L16 ALL-room table
 *     are captured in light and dark (screenshots under
 *     docs_ignore/space-engine/).
 *   10-room selection: the selected partition overlaps, so the response must
 *     DRAW the plate's legal programme with ROOM-OVERLAP + PROGRAMME-DEFICIT,
 *     a FAIL gate, the red banner and the NOT CERTIFIED chip — never an empty
 *     floor or a raw 422.
 *
 * Usage (backend :8000 and frontend :5173 must be running):
 *   node scripts/e2e_selection_policy.cjs
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const URL = process.env.E2E_URL || 'http://localhost:5173/app';
const SHOTS = path.resolve(__dirname, '../../docs_ignore/space-engine');
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function resolveChrome() {
  for (const p of CHROME_CANDIDATES) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
  }
  throw new Error('Chrome not found. Set CHROME_PATH.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function clickByLabel(page, label) {
  return page.evaluate((needle) => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes(needle) && !b.disabled);
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
}

async function clickCardRoom(page, label) {
  return page.evaluate((needle) => {
    const root = document.querySelector('[data-testid="floorplan-generator-card"]');
    if (!root) return false;
    const btn = Array.from(root.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes(needle));
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
}

async function generateAndRead(page) {
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/generate-floorplan') && res.request().method() === 'POST',
    { timeout: 120000 },
  );
  const clicked = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="floorplan-generator-card"]');
    const btn = root && Array.from(root.querySelectorAll('button'))
      .find((b) => /Generate .*(Blueprint|Floor Plan)|Regenerate Blueprint/.test(b.textContent || ''));
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('generate button not found/disabled');
  const res = await responsePromise;
  const body = await res.json();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="plan-warnings-banner"]'),
    { timeout: 30000 },
  );
  await sleep(1200);
  return { status: res.status(), body };
}

async function main() {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: resolveChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1200'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e.message || e)));

  try {
    console.log(`- loading ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1800);

    // ---- capture: an 8 x 40 m rectangle through the wizard --------------
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button'))
      .some((b) => /Select Location on Map to Begin|Run Site Feasibility Analysis/.test(b.textContent || '') && !b.disabled),
      { timeout: 30000 });
    await sleep(800);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find((b) => /Run Site Feasibility Analysis|Select Location on Map to Begin/.test(b.textContent || ''));
      if (btn) btn.click();
    });
    await page.waitForFunction(() => /Locate the site/.test(document.body.innerText || ''), { timeout: 30000 });
    await clickByLabel(page, 'Trace boundary');
    // The label renders uppercase via CSS (text-transform), so innerText reads
    // "PRESET DIMENSIONS"; anchor on the testid instead of the visible text.
    await page.waitForSelector('[data-testid="preset-dims"]', { timeout: 15000 });

    const dimsSet = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="preset-dims"]');
      const inputs = box ? Array.from(box.querySelectorAll('input[type="number"]')) : [];
      if (inputs.length < 2) return false;
      const set = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, String(v));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set(inputs[0], 8);
      set(inputs[1], 40);
      return true;
    });
    check(dimsSet, 'capture preset dimensions set to 8 x 40 m');

    await page.click('[data-testid="trace-toolbar-presets"]');
    await page.waitForSelector('[data-testid="preset-menu"]', { timeout: 8000 });
    await page.click('[data-testid="preset-item-rect"]');
    await sleep(900);
    await clickByLabel(page, 'Finish');
    await page.waitForFunction(() => /Confirm the frontage/.test(document.body.innerText || ''), { timeout: 40000 });
    if (!/PICKED/.test(await page.evaluate(() => document.body.innerText || ''))) {
      // FRONTAGE has no Accept: a picked edge (row click is deterministic)
      // enables Review, which is the wizard's own commit control.
      await page.evaluate(() => {
        const row = document.querySelector('[data-testid="edge-row-0"]');
        if (row) row.click();
      });
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll('[data-testid^="edge-row-"]'))
          .some((el) => /PICKED/.test(el.textContent || '')),
      { timeout: 20000 });
    }
    await page.waitForFunction(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === 'Review');
      return Boolean(b) && !b.disabled;
    }, { timeout: 15000 });
    await clickByLabel(page, 'Review');
    await page.waitForFunction(() => /Review boundary/.test(document.body.innerText || ''), { timeout: 15000 });
    await clickByLabel(page, 'Use this boundary');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button'))
      .some((b) => (b.textContent || '').includes('Run Site Feasibility Analysis')), { timeout: 15000 });

    // ---- G+2 before analysis (the card inherits the storeys) -----------
    await page.evaluate(() => {
      const combo = document.querySelector('[aria-label="Storeys (Levels)"]');
      if (combo) combo.click();
    });
    await page.waitForSelector('[role="option"]', { timeout: 8000 });
    const storeyPicked = await page.evaluate(() => {
      const opt = Array.from(document.querySelectorAll('[role="option"]'))
        .find((o) => /G \+ 2/.test(o.textContent || ''));
      if (!opt || opt.disabled) return false;
      opt.click();
      return true;
    });
    check(storeyPicked, 'T1 storeys set to G+2 (3 levels)');

    await clickByLabel(page, 'Run Site Feasibility Analysis');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button'))
      .some((b) => (b.textContent || '').includes('Cost & Plan')), { timeout: 90000 });
    await sleep(1200);
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('button'))
        .find((b) => (b.textContent || '').includes('Cost & Plan'));
      if (tab) tab.click();
    });
    await page.waitForSelector('[data-testid="floorplan-generator-card"]', { timeout: 20000 });
    await sleep(1200);

    const selectedCount = await page.evaluate(() => {
      const m = (document.querySelector('[data-testid="floorplan-generator-card"]').innerText || '')
        .match(/\((\d+) selected\)/);
      return m ? Number(m[1]) : null;
    });
    check(selectedCount === 5, 'T1 G+2 default selection is 4 rooms + core', `selected ${selectedCount}`);

    // ---- natural programme on the 8x40 plate ----------------------
    console.log('- natural T1 G+2 8x40 programme');
    const natural = await generateAndRead(page);
    const nb = natural.body;
    check(natural.status === 200 && nb.status !== 'failed', 'natural programme draws (HTTP 200)', nb.status);
    check(Boolean(nb.multi_storey && nb.multi_storey.floors.length === 3),
      'natural plan has three floors', nb.multi_storey ? nb.multi_storey.floors.length : 'none');
    const nwarn = nb.warnings || [];
    check(nwarn.some((w) => /^PROGRAMME-(DEFICIT|SQUEEZE)/.test(w)) ||
      nwarn.some((w) => /^ROOM-MIN:/.test(w)) ||
      nwarn.some((w) => /^PROP-/.test(w)),
      'natural plan discloses a deficit/squeeze/proportion line', nwarn[0] || 'none');
    const l16 = (nb.multi_storey.validation_gate.layers || []).find((l) => l.layer_id === 'L16');
    check(Boolean(l16 && l16.details && l16.details.rooms), 'L16 carries the ALL-room band table');
    check(l16 && l16.details.rooms.length >= 10, 'L16 lists every room', `${l16 && l16.details.rooms.length} rows`);

    // Open the L16 details in the card, then capture light + dark.
    await page.evaluate(() => {
      const root = document.querySelector('[data-testid="floorplan-generator-card"]');
      const details = root && root.querySelector('[data-testid="proportion-layer"]');
      if (details) details.open = true;
    });
    await page.evaluate(() => {
      const banner = document.querySelector('[data-testid="plan-warnings-banner"]');
      if (banner) banner.scrollIntoView({ block: 'center' });
    });
    await sleep(600);

    const setTheme = async (theme) => {
      for (let i = 0; i < 2; i++) {
        const current = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        if (current === theme) return true;
        await page.evaluate(() => {
          const btn = document.querySelector('[aria-label="Toggle light / dark theme"]');
          if (btn) btn.click();
        });
        await sleep(600);
      }
      return (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === theme;
    };
    // The report body is its own scroll container, so an element screenshot of
    // the card captures clipped white space.  A tall viewport makes BOTH the
    // banner and the expanded L16 table visible at once; the shot is then the
    // union of their on-screen boxes (viewport clip, no beyond-viewport stitch).
    await page.setViewport({ width: 1600, height: 2400 });
    await sleep(500);
    const shotOf = async (selector, file) => {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        // A theme switch remounts the panel; the L16 <details> must be open to
        // photograph the ALL-room table, so open it again before measuring.
        if (el.tagName === 'DETAILS') el.open = true;
        el.scrollIntoView({ block: 'start' });
      }, selector);
      await sleep(700);
      const m = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        const left = Math.round(Math.max(0, r.left - 12));
        const top = Math.round(Math.max(0, r.top - 12));
        return {
          x: left,
          y: top,
          width: Math.round(Math.max(320, Math.min(window.innerWidth, r.right + 12) - left)),
          height: Math.round(Math.max(160, Math.min(window.innerHeight, r.bottom + 12) - top)),
          dbg: {
            open: el.tagName === 'DETAILS' ? el.open : null,
            h: Math.round(r.height),
            top: Math.round(r.top),
            docTop: Math.round(r.top + window.scrollY),
            scrollY: Math.round(window.scrollY),
          },
        };
      }, selector);
      const { dbg, ...clip } = m;
      console.log(`  (shot ${file}: ${JSON.stringify(dbg)} clip=${JSON.stringify(clip)})`);
      const target = path.join(SHOTS, file);
      await page.screenshot({ path: target, clip });
      const size = fs.existsSync(target) ? fs.statSync(target).size : 0;
      check(size > 500, `${file} saved`, `${size} bytes`);
    };

    for (const theme of ['light', 'dark']) {
      await setTheme(theme);
      await sleep(600);
      await shotOf('[data-testid="plan-warnings-banner"]', `plan-closeout-t1-8x40-banner-${theme}.png`);
      await shotOf('[data-testid="proportion-layer"]', `plan-closeout-t1-8x40-l16-${theme}.png`);
    }
    await setTheme('light');
    await page.setViewport({ width: 1600, height: 1200 });
    await sleep(400);

    // ---- 10-room selection must draw with a named conflict --------
    // The 422 repro is the SINGLE-storey 10-room partition (bath_1/bed_2), so
    // drop the card back to G first.  Changing storeys does not clear results;
    // the card re-initialises its selection to the four required rooms.
    console.log('- 10-room selection on the same plate');
    await page.evaluate(() => {
      const combo = document.querySelector('[aria-label="Storeys (Levels)"]');
      if (combo) combo.click();
    });
    await page.waitForSelector('[role="option"]', { timeout: 8000 });
    const singlePicked = await page.evaluate(() => {
      const opt = Array.from(document.querySelectorAll('[role="option"]'))
        .find((o) => /^G \(1 Level\)/.test((o.textContent || '').trim()));
      if (!opt || opt.disabled) return false;
      opt.click();
      return true;
    });
    check(singlePicked, 'storeys returned to G (the 422 repro)');
    await sleep(900);

    for (const label of ['Common Bath', 'Bedroom 2', 'Dining Area', 'Puja Room', 'Study / Office', 'Private Staircase Core']) {
      const ok = await clickCardRoom(page, label);
      if (!ok) console.log(`  (room button not found: ${label})`);
      await sleep(150);
    }
    const tenCount = await page.evaluate(() => {
      const m = (document.querySelector('[data-testid="floorplan-generator-card"]').innerText || '')
        .match(/\((\d+) selected\)/);
      return m ? Number(m[1]) : null;
    });
    check(tenCount === 10, '10 rooms selected', `selected ${tenCount}`);

    const ten = await generateAndRead(page);
    const tb = ten.body;
    const twarn = tb.warnings || [];
    check(ten.status === 200 && tb.status !== 'failed', '10-room selection is HTTP 200 (not 422)', tb.status);
    check(Boolean(tb.multi_storey && tb.multi_storey.floors.some((f) => (f.rooms || []).length > 0)),
      '10-room selection still draws a floor');
    const overlap = twarn.find((w) => /^ROOM-OVERLAP/.test(w));
    check(Boolean(overlap) && overlap.includes('bath_1') && overlap.includes('bed_2') &&
      overlap.includes('5.02'), 'ROOM-OVERLAP names the id pair and 5.02 m²', overlap || 'missing');
    check(twarn.some((w) => /^PROGRAMME-DEFICIT/.test(w)), 'PROGRAMME-DEFICIT banner present');
    check(tb.multi_storey.validation_gate.overall_status === 'FAIL', 'gate FAILs the drawn plan',
      tb.multi_storey.validation_gate.overall_status);

    // The fallback copy must say the drawn plate is the LEGAL programme and
    // explicitly NOT the selection - a reader must never think their 10 rooms
    // were placed because the request returned 200.
    const fallbackLine = twarn.find((w) => /^SELECTION-FALLBACK/.test(w)) || '';
    check(/legal programme/i.test(fallbackLine),
      'SELECTION-FALLBACK names the drawn plate as the legal programme', fallbackLine || 'missing');
    check(tb.multi_storey.params_snapshot?.selection_path === 'fallback_legal_programme' ||
      tb.params_snapshot?.selection_path === 'fallback_legal_programme',
      'provenance records selection_path=fallback_legal_programme');
    const selectionNote = twarn.find((w) => /^PROGRAMME-DEFICIT/.test(w)) || '';
    check(/not the selected layout|not drawn/i.test(selectionNote),
      'the deficit banner states plainly that the selection is not the drawn layout',
      selectionNote.slice(0, 120));

    // Every unplaced room the server names is on the UI ledger WITH a reason.
    const unmet = tb.unmet_requirements || [];
    const ledger = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="unmet-ledger"]');
      if (!root) return { rows: [], present: false };
      return {
        present: true,
        rows: Array.from(root.querySelectorAll('li')).map((li) => ({
          id: (li.getAttribute('data-testid') || '').replace('unmet-room-', ''),
          text: li.innerText || '',
          reason: li.getAttribute('data-reason') || '',
        })),
      };
    });
    check(ledger.present, 'unplaced-room ledger rendered on the card');
    const missingRows = unmet
      .map((u) => u.room_id)
      .filter((rid) => !ledger.rows.some((r) => r.id === rid));
    check(missingRows.length === 0,
      'the ledger lists every unplaced room id', missingRows.join(', ') || 'all present');
    const noReason = ledger.rows.filter((r) => !String(r.reason).trim());
    check(noReason.length === 0,
      'every unplaced row carries its reason', noReason.map((r) => r.id).join(', ') || 'all reasoned');

    // The card states the substitution in its own block (not only inside the
    // warning list), and the selection ledger it prints matches the snapshot.
    const fallbackUi = await page.evaluate(() => {
      const notice = document.querySelector('[data-testid="selection-fallback-notice"]');
      const ledgerBox = document.querySelector('[data-testid="selection-unplaced-ledger"]');
      return {
        present: Boolean(notice),
        text: notice ? notice.innerText : '',
        ledger: ledgerBox ? ledgerBox.innerText : '',
      };
    });
    check(fallbackUi.present, 'card shows the selection-fallback notice');
    check(/legal programme/i.test(fallbackUi.text) && /not the layout/i.test(fallbackUi.text),
      'the notice says the drawn plate is the legal programme, not the selection',
      fallbackUi.text.slice(0, 120));
    const snapshotUnplaced =
      tb.params_snapshot?.selection_unplaced_rooms ??
      tb.multi_storey?.params_snapshot?.selection_unplaced_rooms ?? [];
    const ledgerMissing = snapshotUnplaced
      .map((r) => String(r))
      .filter((rid) => !fallbackUi.ledger.toLowerCase().includes(rid.replace(/_/g, ' ').toLowerCase()));
    check(ledgerMissing.length === 0,
      'the selection ledger names every unplaced room from the snapshot',
      ledgerMissing.join(', ') || 'all present');

    const dom = await page.evaluate(() => {
      const banner = document.querySelector('[data-testid="plan-warnings-banner"]');
      return {
        critical: banner ? banner.getAttribute('data-critical') : null,
        text: banner ? banner.innerText : '',
        chip: Boolean(document.querySelector('[data-testid="viewer-not-certified-chip"]')),
        bannerStamp: banner ? /FAIL stamp/.test(banner.innerText) : false,
      };
    });
    check(dom.critical === 'true', 'card banner switches to the critical treatment', String(dom.critical));
    check(/ROOM-OVERLAP/.test(dom.text), 'card banner prints ROOM-OVERLAP');
    check(dom.bannerStamp, 'card banner shows the FAIL stamp');
    check(dom.chip, 'viewer shows NOT CERTIFIED');

    check(consoleErrors.length === 0, 'no browser console/page errors', consoleErrors.slice(0, 2).join(' | '));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.label}${f.detail ? ` — ${f.detail}` : ''}`));
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
