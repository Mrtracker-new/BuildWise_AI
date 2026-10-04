/**
 * e2e_full_funnel.cjs — browser E2E for the full funnel.
 * ============================================================================
 * Walks the real UI end-to-end against local dev servers and fails on any
 * browser console error / page error:
 *
 *   capture (Update Pin) -> site feasibility -> Cost & Plan -> generate
 *   blueprint -> viewer assertions:
 *     - the viewer's GEN token equals the SERVER generation_id
 *       (no client-side random token anywhere);
 *     - the QA panel lists all 14 gate layers (L1..L14) and the
 *       overall status chip, never silently fewer rows;
 *     - the sheet-truth chips carry FRTG (frontage) + POLYHASH.
 *
 * Usage:
 *   node scripts/e2e_full_funnel.cjs
 * Env:
 *   E2E_URL        app URL (default http://localhost:5173)
 *   CHROME_PATH    Chrome executable (defaults to the known local install)
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const URL = process.env.E2E_URL || 'http://localhost:5173/app';
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
  throw new Error('Chrome not found. Set CHROME_PATH to the Chrome executable.');
}

const results = [];
function check(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click the first button whose text contains `label` (real DOM click). */
async function clickByLabel(page, label) {
  return page.evaluate((needle) => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes(needle));
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  }, label);
}

async function main() {
  console.log('=== E2E: full funnel ===');
  const browser = await puppeteer.launch({
    executablePath: resolveChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1000'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log('[console error]', msg.text().slice(0, 200));
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err && err.message || err));
    console.log('[page error]', String(err && err.message || err).slice(0, 200));
  });
  const apiFailures = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400) {
      apiFailures.push(`${res.status()} ${res.url()}`);
      console.log('[api failure]', res.status(), res.url());
    }
  });

  let serverGenerationId = null;
  page.on('response', async (res) => {
    if (res.url().includes('/api/generate-floorplan') && res.request().method() === 'POST') {
      try {
        const body = await res.json();
        serverGenerationId = body && body.generation_id ? String(body.generation_id) : null;
      } catch (e) { /* non-JSON response surfaces via console/page errors */ }
    }
  });

  try {
    console.log(`- loading ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);
    check(true, 'app loaded');

    // 1. capture: the pre-boundary CTA opens the capture wizard (STEP ZERO).
    console.log('- capture: opening the capture wizard');
    const ctaLabel = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find((b) => b.textContent && /Run Site Feasibility Analysis|Select Location on Map to Begin/.test(b.textContent));
      if (!btn) return null;
      if (btn.disabled) return `disabled:${btn.textContent.trim()}`;
      btn.click();
      return btn.textContent.trim();
    });
    check(ctaLabel && !ctaLabel.startsWith('disabled:'), 'pre-boundary CTA is enabled (not a dead end)', ctaLabel || 'not found');
    await page.waitForFunction(
      () => /Locate the site/.test(document.body.innerText || ''),
      { timeout: 15000 },
    );
    check(true, 'capture wizard opened on LOCATE');

    // 2. trace a rectangle from the pin (quick path), then commit the boundary.
    console.log('- tracing a rectangular boundary');
    await clickByLabel(page, 'Trace boundary');
    await sleep(800);
    await clickByLabel(page, 'Rect');
    await page.waitForFunction(
      () => /Confirm the frontage/.test(document.body.innerText || ''),
      { timeout: 40000 },
    );
    // Stray-geometry guard: on FRONTAGE the dashed live-edge must be empty even
    // as the pointer moves (it is a TRACE-only affordance).
    const frontageLine = await page.evaluate(() => {
      const m = window.__maplibreMap;
      if (!m) return { available: false };
      const canvas = m.getCanvas();
      const r = canvas.getBoundingClientRect();
      for (const [x, y] of [[500, 300], [700, 500], [420, 700]]) {
        canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + x, clientY: r.top + y }));
      }
      return new Promise((resolve) => setTimeout(() => {
        const live = m.getSource('bw-capture-live').serialize().data;
        resolve({
          available: true,
          liveCoords: (live.geometry && live.geometry.coordinates || []).length,
          massing: m.getLayer('3d-buildings') ? m.getLayoutProperty('3d-buildings', 'visibility') : 'absent',
        });
      }, 400));
    });
    check(frontageLine.available && frontageLine.liveCoords === 0, 'no stray dashed live edge on the FRONTAGE step', JSON.stringify(frontageLine));
    check(frontageLine.massing === 'none', 'basemap 3D massing suppressed over the site (no square on the pin)', JSON.stringify(frontageLine));

    // Per-edge callouts: the sheet lists every edge with its length + bearing.
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="edge-row-"]')).map((el) => el.textContent.trim())
    );
    const measured = rows.filter((t) => /\d+\.\d{2} m · [NSEW] \d{2}°\d{2}′ [NSEW]/.test(t));
    check(rows.length >= 3, `per-edge callout rows rendered (${rows.length})`, rows.join(' | '));
    check(measured.length === rows.length && rows.length > 0, 'every edge row reports length + bearing');

    // Precision pick: hover, then click THAT edge, and assert the same edge is taken.
    const pick = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const m = window.__maplibreMap;
      // Wait for the camera fit to settle before computing pixels.
      for (let i = 0; i < 40 && m.isMoving(); i++) await sleep(100);
      const canvas = m.getCanvas();
      const rect = canvas.getBoundingClientRect();
      const ring = m.getSource('bw-capture-boundary').serialize().data.geometry.coordinates[0];
      const midOf = (i) => [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2];
      const at = (lngLat) => { const p = m.project(lngLat); return { clientX: rect.left + p.x, clientY: rect.top + p.y, p }; };
      const pickIndexOf = () => {
        const r = Array.from(document.querySelectorAll('[data-testid^="edge-row-"]'));
        return r.findIndex((el) => /PICKED/.test(el.textContent || ''));
      };
      const target = 1;
      const t = at(midOf(target));
      canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: t.clientX, clientY: t.clientY }));
      await sleep(350);
      const hover = m.getSource('bw-capture-hover-edge').serialize().data;
      const readout = document.querySelector('[data-testid="frontage-hover-readout"]');
      const badge = document.querySelector('[data-testid="frontage-hover-badge"]');
      const hovered = {
        coords: (hover.geometry && hover.geometry.coordinates || []).length,
        readout: readout ? readout.textContent.trim() : null,
        badge: badge ? badge.textContent.trim() : null,
        zoom: Number(m.getZoom().toFixed(2)),
      };
      canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: t.clientX, clientY: t.clientY }));
      await sleep(350);
      const pickedIdx = pickIndexOf();

      // Table pick: clicking a row picks that exact edge too.
      const rowTwo = document.querySelector('[data-testid="edge-row-2"]');
      if (rowTwo) rowTwo.click();
      await sleep(300);
      const pickedViaRow = pickIndexOf();

      // Off-edge click on empty map: the pick must NOT silently move elsewhere.
      canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: rect.left + 60, clientY: rect.top + rect.height - 60 }));
      await sleep(250);
      canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + 60, clientY: rect.top + rect.height - 60 }));
      await sleep(350);
      return {
        hovered,
        pickedIdx,
        pickedViaRow,
        afterMissIdx: pickIndexOf(),
        missHint: Boolean(document.querySelector('[data-testid="frontage-miss-hint"]')),
      };
    });
    check(pick.hovered.coords === 2, 'hovering an edge highlights exactly that edge', JSON.stringify(pick.hovered));
    check(Boolean(pick.hovered.readout), 'hover readout names the edge with its measurement', pick.hovered.readout || 'none');
    check(Boolean(pick.hovered.badge), 'pointer badge shows the hovered edge measurement', pick.hovered.badge || 'none');
    check(pick.hovered.zoom >= 19, 'camera frames the plot for precise picking', `zoom ${pick.hovered.zoom}`);
    check(pick.pickedIdx === 1, 'clicking the hovered edge picks THAT edge', `picked index ${pick.pickedIdx}`);
    check(pick.pickedViaRow === 2, 'clicking an edge row picks THAT edge', `row pick index ${pick.pickedViaRow}`);
    check(pick.afterMissIdx === pick.pickedViaRow, 'an off-edge click never re-picks a random edge', `after miss ${pick.afterMissIdx}`);
    check(pick.missHint, 'an off-edge click surfaces the pick hint instead of guessing');

    // If the suggestion still stands (no manual pick), accept it as ASSUMED -> VERIFIED.
    const alreadyConfirmed = await page.evaluate(() => /PICKED/.test(document.body.innerText));
    if (!alreadyConfirmed) {
      await page.waitForFunction(
        () => {
          const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'Accept');
          return Boolean(btn) && !btn.disabled;
        },
        { timeout: 40000 },
      );
      const accepted = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'Accept');
        if (btn) { btn.click(); return true; }
        return false;
      });
      check(accepted, 'frontage suggestion accepted (ASSUMED -> VERIFIED)');
    }
    check(true, 'frontage confirmed (VERIFIED)');
    await page.waitForFunction(
      () => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'Review');
        return Boolean(btn) && !btn.disabled;
      },
      { timeout: 15000 },
    );
    await clickByLabel(page, 'Review');
    await page.waitForFunction(
      () => /Review boundary/.test(document.body.innerText || ''),
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Use this boundary'));
        return Boolean(btn) && !btn.disabled;
      },
      { timeout: 15000 },
    );
    await clickByLabel(page, 'Use this boundary');
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button'))
        .some((b) => (b.textContent || '').includes('Run Site Feasibility Analysis')),
      { timeout: 15000 },
    );
    check(true, 'boundary committed; CTA enabled for analysis');

    // 3. site feasibility
    console.log('- running site feasibility analysis');
    await clickByLabel(page, 'Run Site Feasibility Analysis');
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('button'))
        .some((b) => b.textContent && b.textContent.includes('Cost & Plan')),
      { timeout: 90000 },
    );
    await sleep(1500);
    check(true, 'site feasibility report opened (Cost & Plan reachable)');

    // 3.5 Gestalt guard: a captured plot renders as ONE plot with ONE
    // buildable envelope and ONE building outline, all ON the plot - and the
    // analysis-derived, pin-anchored estimate stands down so the marker never
    // drags a second boundary along with it. The server geometry engine used to
    // emit the buildable/footprint in a corner-based frame, displacing them off
    // the plot by half its size ("several other boundaries" beside the pin).
    await sleep(900);
    const gestalt = await page.evaluate(() => {
      const m = window.__maplibreMap;
      const coordsOf = (id) => {
        const s = m.getSource(id);
        if (!s) return null;
        const d = s.serialize().data;
        const f = d.features ? d.features[0] : d;
        const g = f && f.geometry;
        if (!g || !g.coordinates || !g.coordinates.length) return null;
        if (g.type === 'Point') return g.coordinates;
        if (g.type === 'LineString') return g.coordinates;
        return g.coordinates[0].length ? g.coordinates[0] : null;
      };
      const featuresOf = (id) => {
        const s = m.getSource(id);
        return s ? (s.serialize().data.features || []).length : -1;
      };
      return {
        plot: coordsOf('bw-preview-setback'),
        buildable: coordsOf('bw-preview-buildable'),
        previewFootprint: coordsOf('bw-preview-footprint'),
        appFootprintFeatures: featuresOf('footprint-source'),
        appEntranceFeatures: featuresOf('entrance-shaft-source'),
      };
    });
    const centroidOf = (ring) => {
      const s = ring.reduce((a, c) => [a[0] + c[0], a[1] + c[1]], [0, 0]);
      return [s[0] / ring.length, s[1] / ring.length];
    };
    const insideRing = (p, ring) => {
      if (!ring || ring.length < 3) return false;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (
          yi > p[1] !== yj > p[1] &&
          p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
        ) {
          inside = !inside;
        }
      }
      return inside;
    };
    check(Boolean(gestalt.plot && gestalt.plot.length >= 4), 'the captured plot is drawn as its own ring');
    check(
      Boolean(gestalt.buildable && insideRing(centroidOf(gestalt.buildable), gestalt.plot)),
      'preview buildable envelope sits ON its plot (not offset beside it)',
      JSON.stringify(gestalt.buildable),
    );
    check(
      Boolean(gestalt.previewFootprint && insideRing(centroidOf(gestalt.previewFootprint), gestalt.plot)),
      'preview building footprint sits ON its plot (not offset beside it)',
      JSON.stringify(gestalt.previewFootprint),
    );
    check(
      gestalt.appFootprintFeatures === 0,
      'no pin-anchored estimate rectangle while a plot is captured',
      `features ${gestalt.appFootprintFeatures}`,
    );
    check(
      gestalt.appEntranceFeatures === 0,
      'no pin-anchored entrance arrow while a plot is captured',
      `features ${gestalt.appEntranceFeatures}`,
    );

    // 3. Cost & Plan tab hosts the generator card.
    await page.evaluate(() => {
      const tab = Array.from(document.querySelectorAll('button'))
        .find((b) => b.textContent && b.textContent.includes('Cost & Plan'));
      if (tab) tab.click();
    });
    await sleep(1500);

    // 4. generate the blueprint
    console.log('- generating blueprint');
    const genClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find((b) => b.textContent && /Generate .*(Blueprint|Floor Plan)|Regenerate Blueprint/.test(b.textContent));
      if (btn) { btn.click(); return btn.textContent.trim(); }
      return null;
    });
    check(Boolean(genClicked), 'generate button found', genClicked || 'none');
    await page.waitForResponse(
      (res) => res.url().includes('/api/generate-floorplan') && res.request().method() === 'POST',
      { timeout: 60000 },
    );
    await sleep(4000);
    check(Boolean(serverGenerationId), 'server returned a generation_id', serverGenerationId || 'none');

    // 5. viewer assertions
    const ui = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const layerIds = Array.from({ length: 14 }, (_, i) => `L${i + 1}`);
      const missingLayers = layerIds.filter((lid) => !new RegExp(`\\b${lid}\\b`).test(text));
      return {
        hasGenToken: /GEN-/.test(text),
        genTokens: Array.from(new Set((text.match(/GEN-[A-Za-z0-9-]+/g) || []))),
        missingLayers,
        hasOverall: /OVERALL/.test(text),
        hasFrtg: /\bFRTG\b/.test(text),
        hasPolyHash: /\bPOLYHASH\b/.test(text),
        hasRandomishGen: /GEN-\d+\.\d+/.test(text),
      };
    });

    check(ui.hasGenToken, 'viewer shows a GEN token');
    check(
      Boolean(serverGenerationId) && ui.genTokens.includes(serverGenerationId),
      'viewer GEN token equals the server generation_id',
      `server=${serverGenerationId} ui=${ui.genTokens.join(',')}`,
    );
    check(!ui.hasRandomishGen, 'no float/random GEN token in the DOM');
    check(
      ui.missingLayers.length === 0,
      'QA panel lists all 14 gate layers (no silent rows)',
      ui.missingLayers.length ? `missing ${ui.missingLayers.join(',')}` : '',
    );
    check(ui.hasOverall, 'QA panel shows the overall status');
    check(ui.hasFrtg, 'sheet-truth frontage chip present (FRTG)');
    check(ui.hasPolyHash, 'sheet-truth polygon hash chip present (POLYHASH)');

    // 5b. Sheet fit guard: the sheet the viewer is showing must be displayed WHOLE
    // inside its box. A tall site plan (10.SP) used to be rendered at native size and
    // cut off at the bottom, so the plate appeared to be "out of the view".
    const sheetFit = await page.evaluate(() => {
      const sheets = Array.from(document.querySelectorAll('svg.bw-sheet-fit'))
        .filter((s) => s.getBoundingClientRect().width > 0 && s.getBoundingClientRect().height > 0);
      if (!sheets.length) return { found: false };
      const svg = sheets[0];
      const r = svg.getBoundingClientRect();
      let box = svg.parentElement;
      while (box && box !== document.body && box.getBoundingClientRect().height < 50) {
        box = box.parentElement;
      }
      const b = (box || document.body).getBoundingClientRect();
      const vb = (svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
      return {
        found: true,
        sheet: [Math.round(r.width), Math.round(r.height)],
        box: [Math.round(b.width), Math.round(b.height)],
        fits: r.width <= b.width + 1 && r.height <= b.height + 1,
        sheetRatio: vb.length === 4 && vb[3] > 0 ? vb[2] / vb[3] : 0,
        renderedRatio: r.height > 0 ? r.width / r.height : 0,
      };
    });
    check(sheetFit.found, 'viewer renders a fitted sheet (bw-sheet-fit host present)');
    check(
      sheetFit.found && sheetFit.fits,
      'the whole sheet is on screen (no clipping in the viewer box)',
      sheetFit.found ? `sheet ${sheetFit.sheet.join('x')} in box ${sheetFit.box.join('x')}` : 'no sheet',
    );
    check(
      sheetFit.found && sheetFit.sheetRatio > 0 && Math.abs(sheetFit.renderedRatio - sheetFit.sheetRatio) < 0.02,
      'the fitted sheet keeps its drawing aspect ratio',
      sheetFit.found ? `sheet ${sheetFit.sheetRatio.toFixed(3)} vs rendered ${sheetFit.renderedRatio.toFixed(3)}` : 'no sheet',
    );

    // 6. Moving the site after generation ASKS FIRST: with a plot captured, the
    // move is not applied until the user chooses, and whichever choice is made
    // must never leave geometry describing two different sites at once.
    const siteMove = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const m = window.__maplibreMap;
      const srcLen = (id) => {
        const s = m.getSource(id);
        if (!s) return -1;
        const d = s.serialize().data;
        if (d && d.features) return d.features.length;
        if (d && d.geometry) {
          return d.geometry.type === 'Polygon' ? (d.geometry.coordinates[0] || []).length : (d.geometry.coordinates || []).length;
        }
        return 0;
      };
      const previewAnchor = () => {
        const s = m.getSource('bw-preview-footprint');
        const d = s && s.serialize().data;
        const ring = d && d.geometry && d.geometry.coordinates && d.geometry.coordinates[0];
        return ring && ring.length ? [Number(ring[0][0].toFixed(5)), Number(ring[0][1].toFixed(5))] : null;
      };
      const inputs = () => Array.from(document.querySelectorAll('input[type="text"]'));
      const typeCoords = async (lat, lon) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const latEl = inputs().find((i) => i.id === 'lat-input') || inputs()[0];
        const lonEl = inputs().find((i) => i.id === 'lon-input') || inputs()[1];
        if (!latEl || !lonEl) return null;
        setter.call(latEl, String(lat));
        latEl.dispatchEvent(new Event('input', { bubbles: true }));
        setter.call(lonEl, String(lon));
        lonEl.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(300);
        return { latEl, lonEl, previous: null };
      };
      const pressUpdatePin = async () => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Update Pin'));
        if (!btn) return false;
        btn.click();
        await sleep(1100);
        return true;
      };
      const latEl = inputs().find((i) => i.id === 'lat-input') || inputs()[0];
      if (!latEl) return { ok: false, reason: 'coordinate inputs missing' };
      const originLat = latEl.value;
      const nextLat = (Number(originLat) + 0.002).toFixed(5);
      const nextLon = (Number(inputs().find((i) => i.id === 'lon-input').value) + 0.002).toFixed(5);

      const start = { preview: previewAnchor(), chip: /m²/.test(document.body.innerText), latInput: originLat };

      // (a) Asking: the dialog appears and NOTHING has moved yet.
      await typeCoords(nextLat, nextLon);
      await pressUpdatePin();
      const asked = {
        dialog: Boolean(document.querySelector('[data-testid="site-move-dialog"]')),
        options: Array.from(document.querySelectorAll('[data-testid="site-move-dialog"] button')).map((b) => b.textContent.trim()),
        preview: previewAnchor(),
        chip: /m²/.test(document.body.innerText),
        typedLat: (inputs().find((i) => i.id === 'lat-input') || {}).value,
      };

      // (b) Keep the current plot: nothing changes and the inputs resync.
      const cancelBtn = document.querySelector('[data-testid="site-move-cancel"]');
      if (cancelBtn) cancelBtn.click();
      await sleep(1200);
      const afterCancel = {
        dialog: Boolean(document.querySelector('[data-testid="site-move-dialog"]')),
        preview: previewAnchor(),
        latInput: (inputs().find((i) => i.id === 'lat-input') || {}).value,
      };

      // (c) Take the plot to the new site: the plot (and its preview) move.
      await typeCoords(nextLat, nextLon);
      await pressUpdatePin();
      const applyBtn = document.querySelector('[data-testid="site-move-apply"]');
      if (applyBtn) applyBtn.click();
      await sleep(2500);
      const afterApply = {
        preview: previewAnchor(),
        footprint: srcLen('footprint-source'),
        entrance: srcLen('entrance-shaft-source'),
        captureRing: srcLen('bw-capture-boundary'),
        plotStillCaptured: /m²/.test(document.body.innerText),
        notice: Boolean(document.querySelector('[data-testid="site-moved-notice"]')),
      };

      // (d) Drop it and re-capture: the plot clears and the wizard opens.
      await typeCoords((Number(nextLat) + 0.002).toFixed(5), (Number(nextLon) + 0.002).toFixed(5));
      await pressUpdatePin();
      const recaptureBtn = document.querySelector('[data-testid="site-move-recapture"]');
      if (recaptureBtn) recaptureBtn.click();
      await sleep(1400);
      const afterRecapture = {
        plotCleared: !/m²/.test(document.body.innerText),
        wizardOpen: /Locate the site/.test(document.body.innerText),
        dialog: Boolean(document.querySelector('[data-testid="site-move-dialog"]')),
      };

      return { ok: true, start, asked, afterCancel, afterApply, afterRecapture };
    });

    check(siteMove.ok, 'site move driven through the sidebar', siteMove.reason || '');
    if (siteMove.ok) {
      check(siteMove.asked.dialog, 'moving the site with a captured plot asks first');
      check(
        siteMove.asked.options.length === 3,
        'the dialog offers take / re-capture / keep',
        siteMove.asked.options.join(' | ')
      );
      check(
        JSON.stringify(siteMove.asked.preview) === JSON.stringify(siteMove.start.preview) && siteMove.asked.chip,
        'nothing changes while the question is open',
        `${JSON.stringify(siteMove.start.preview)} -> ${JSON.stringify(siteMove.asked.preview)}`
      );
      check(
        !siteMove.afterCancel.dialog &&
          JSON.stringify(siteMove.afterCancel.preview) === JSON.stringify(siteMove.start.preview) &&
          siteMove.afterCancel.latInput === siteMove.start.latInput,
        'keep: plot, preview and coordinates all stay as they were',
        JSON.stringify(siteMove.afterCancel)
      );
      check(
        JSON.stringify(siteMove.afterApply.preview) !== JSON.stringify(siteMove.start.preview),
        'take: site preview re-rendered for the NEW location',
        `${JSON.stringify(siteMove.start.preview)} -> ${JSON.stringify(siteMove.afterApply.preview)}`
      );
      check(siteMove.afterApply.footprint === 0, 'take: no footprint left stuck to the moved pin', `features ${siteMove.afterApply.footprint}`);
      check(siteMove.afterApply.entrance === 0, 'take: no stale entrance overlay after the move');
      check(siteMove.afterApply.captureRing === 0, 'take: no leftover capture ring on the basemap');
      check(siteMove.afterApply.plotStillCaptured, 'take: the captured plot travelled with the pin');
      check(siteMove.afterApply.notice, 'take: the user is told to re-run the analysis');
      check(
        siteMove.afterRecapture.plotCleared && siteMove.afterRecapture.wizardOpen && !siteMove.afterRecapture.dialog,
        're-capture: plot cleared and the wizard opens at locate',
        JSON.stringify(siteMove.afterRecapture)
      );
    }

    // 7. zero browser errors
    check(consoleErrors.length === 0, 'zero console errors', consoleErrors.slice(0, 3).join(' | '));
    check(pageErrors.length === 0, 'zero page errors', pageErrors.slice(0, 3).join(' | '));
  } catch (err) {
    check(false, 'E2E aborted', String(err && err.message || err));
    try {
      const state = await page.evaluate(() => ({
        buttons: Array.from(document.querySelectorAll('button')).map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 40),
        bodySnippet: (document.body.innerText || '').slice(0, 600),
      }));
      console.log('--- UI state at abort ---');
      console.log('buttons:', JSON.stringify(state.buttons));
      console.log('text:', state.bodySnippet.replace(/\n+/g, ' / '));
    } catch (e) { /* page may be gone */ }
    console.log('--- API failures so far:', JSON.stringify(apiFailures));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== e2e full funnel: ${results.length - failed.length} passed, ${failed.length} failed ===`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(2);
});
