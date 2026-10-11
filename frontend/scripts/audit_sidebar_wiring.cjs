#!/usr/bin/env node
/**
 * audit_sidebar_wiring.cjs — Site Coordinates sidebar tile audit.
 * ==================================================================
 * Proves, through the interfaces a user actually touches, that every control in
 * the left parameters tile is wired to a visible output:
 *
 *   A. Backend deltas over real HTTP (grade -> cost, grade -> sheet finish
 *      schedule, plinth area -> generated room programme).
 *   B. Live UI interaction checks in Chromium (grade cards, slider bubble +
 *      magnetic snap + ticks, brief chips + counter + parse preview, provider
 *      status dot, storeys disabled-with-reason, collapsible persistence,
 *      portalled info popovers, Enter-to-run).
 *   C. Light + dark proof screenshots (default, popover open, slider drag), each
 *      measured back from its own PNG so a frame that silently stayed light
 *      cannot be filed as a dark-mode proof, plus a coarse frame-to-frame
 *      delta so a stale or duplicated capture cannot pass as new evidence.
 *   D. Theme shortcut while the tile holds focus, and the guard rail that keeps
 *      it swallowed while the user is really typing.
 *
 * Usage: node scripts/audit_sidebar_wiring.cjs
 * Env:   APP_URL, API_URL, CHROME_PATH, PROOF_DIR
 * Exit:  1 on any failed check.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const puppeteer = require('puppeteer-core');

const APP_URL = process.env.APP_URL || 'http://localhost:5173/app';
const API_URL = process.env.API_URL || 'http://localhost:8000';
const PROOF_DIR = process.env.PROOF_DIR || path.resolve(__dirname, '..', '..', 'docs_ignore', 'sidebar-ui-proof');
const VIEWPORT = { width: 1440, height: 950, deviceScaleFactor: 2 };

let passes = 0;
const failures = [];
const checks = [];

function record(ok, name, detail) {
  checks.push({ name, ok, detail: detail ?? null });
  if (ok) {
    passes += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push({ name, detail: detail ?? null });
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Screenshot capture + read-back                                     */
/* ------------------------------------------------------------------ */
/** Captured frames, keyed by filename, so the proof can re-read its own output. */
const frames = {};

function writeShot(name, b64) {
  frames[name] = b64;
  fs.writeFileSync(path.join(PROOF_DIR, name), Buffer.from(b64, 'base64'));
  return b64;
}

async function shotElement(page, handle, name) {
  return writeShot(name, await handle.screenshot({ encoding: 'base64' }));
}

async function shotClip(page, clip, name) {
  return writeShot(name, await page.screenshot({ encoding: 'base64', clip }));
}

/**
 * Mean luminance (0-1) of a captured PNG, decoded in the live page. Proof
 * frames are measured rather than assumed: a dark-mode shot that never left
 * light mode fails here instead of shipping as evidence.
 */
async function frameLuminance(page, b64) {
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
      n += 1;
    }
    return sum / n / 255;
  }, b64);
}

/**
 * Share of pixels that differ between two captured frames (coarse: the two clips
 * are a few pixels apart, which only inflates the number). Used to prove a
 * popover / drag / dark capture is not a duplicate of the baseline frame.
 */
async function frameDelta(page, aName, bName) {
  return page.evaluate(
    async (a, b) => {
      const load = async (data) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, px: ctx.getImageData(0, 0, img.width, img.height).data };
      };
      const A = await load(a);
      const B = await load(b);
      const w = Math.min(A.w, B.w);
      const h = Math.min(A.h, B.h);
      let changed = 0;
      let total = 0;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * A.w + x) * 4;
          const j = (y * B.w + x) * 4;
          total += 1;
          if (
            Math.abs(A.px[i] - B.px[j]) + Math.abs(A.px[i + 1] - B.px[j + 1]) + Math.abs(A.px[i + 2] - B.px[j + 2]) >
            24
          ) {
            changed += 1;
          }
        }
      }
      return (100 * changed) / total;
    },
    frames[aName],
    frames[bName]
  );
}

function getChromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const p of candidates) if (p && fs.existsSync(p)) return p;
  throw new Error('Chrome executable not found. Set CHROME_PATH.');
}

/* ------------------------------------------------------------------ */
/* HTTP helper (no deps)                                              */
/* ------------------------------------------------------------------ */
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
        timeout: 120000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(new Error(`non-JSON response: ${text.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/* ================================================================== */
/* A. BACKEND DELTAS                                                  */
/* ================================================================== */
async function backendDeltas() {
  console.log('\n[A] Backend deltas over HTTP');

  // A1. Specification grade -> CPWD rate + total construction cost
  try {
    const base = {
      latitude: 12.9716,
      longitude: 77.5946,
      built_up_area_sqft: 2000,
      building_typology: 'residential_single',
      floors: 1,
      ai_provider: 'mock',
      ground_coverage_ratio: 0.6,
    };
    const basic = await postJson(`${API_URL}/api/analyze`, { ...base, quality_grade: 'basic' });
    const premium = await postJson(`${API_URL}/api/analyze`, { ...base, quality_grade: 'premium' });
    const br = basic.cost_estimate.base_rate_per_sqft;
    const pr = premium.cost_estimate.base_rate_per_sqft;
    const bt = basic.cost_estimate.total_estimated_cost_inr;
    const pt = premium.cost_estimate.total_estimated_cost_inr;
    record(
      br === 1500 && pr === 3500 && pt > bt,
      'grade -> construction cost (HTTP /api/analyze)',
      `basic ₹${br}/sq ft = ₹${bt.toLocaleString()} · premium ₹${pr}/sq ft = ₹${pt.toLocaleString()}`
    );
  } catch (e) {
    record(false, 'grade -> construction cost (HTTP /api/analyze)', e.message);
    return;
  }

  // A2. Specification grade -> room-schedule finish tier on the floor plan
  const fpRequest = (grade, area) => ({
    plot_width_m: 15,
    plot_depth_m: 18,
    building_typology: 'residential_single',
    quality_grade: grade,
    floors: 1,
    vastu_strictness: 'medium',
    ...(area ? { built_up_area_sqft: area } : {}),
  });
  try {
    const basic = await postJson(`${API_URL}/api/generate-floorplan`, fpRequest('basic'));
    const premium = await postJson(`${API_URL}/api/generate-floorplan`, fpRequest('premium'));
    const rows = (res) => (res.multi_storey?.floors?.[0]?.room_schedule) || [];
    const bRooms = rows(basic);
    const pRooms = rows(premium);
    // Room ids carry a floor suffix (living_F0) and may be renamed by the
    // naming-threshold layer, so match on the id prefix.
    const pick = (rs, prefix) => (rs.find((r) => String(r.room_id).startsWith(prefix)) || {}).finish_zone;
    const livingBasic = pick(bRooms, 'living');
    const livingPremium = pick(pRooms, 'living');
    const tierLabel = (rows(premium)[0] || {}).finish_grade_label || '';
    record(
      bRooms.length > 0 && livingBasic && livingPremium && livingBasic !== livingPremium,
      'grade -> room schedule finish specification (HTTP /api/generate-floorplan)',
      `living: basic "${livingBasic}" vs premium "${livingPremium}" · tier "${tierLabel}"`
    );
    // The whole schedule must move, not one hero row.
    const bMap = new Map(bRooms.map((r) => [r.room_id, r.finish_zone]));
    const moved = pRooms.filter((r) => bMap.has(r.room_id) && bMap.get(r.room_id) !== r.finish_zone).length;
    record(
      moved >= Math.min(5, bRooms.length),
      'every shared room row re-resolves its finish across grades',
      `${moved}/${bRooms.length} shared rows changed`
    );
    const anyBasicPremiumMaterial = bRooms.some((r) =>
      /Travertine|Marble Inlay|Oak Plank|Mirror-Polished/.test(r.finish_zone || '')
    );
    record(!anyBasicPremiumMaterial, 'basic schedule contains no premium-only materials');
  } catch (e) {
    record(false, 'grade -> room schedule finish specification (HTTP /api/generate-floorplan)', e.message);
  }

  // A3. Built-up plinth area -> generated room programme
  try {
    const small = await postJson(`${API_URL}/api/generate-floorplan`, fpRequest('standard', 500));
    const medium = await postJson(`${API_URL}/api/generate-floorplan`, fpRequest('standard', 2000));
    // Measure the SOLVED floor plate (the visible output), not an echo: the
    // programme is generated server-side and is not always echoed back. The
    // plate is bounded by plot x coverage, so beyond the envelope's capacity the
    // room count saturates — the 500 vs 2,000 pair is the discriminating test.
    const placedOf = (res) => (res.multi_storey?.floors?.[0]?.rooms || []).map((r) => String(r.room_id));
    const sRooms = placedOf(small);
    const mRooms = placedOf(medium);
    record(
      sRooms.length > 0 && mRooms.length > sRooms.length && sRooms.length <= 4,
      'plinth area -> generated room programme + plate (HTTP /api/generate-floorplan)',
      `500 sq ft -> ${sRooms.length} rooms [${sRooms.join(', ')}] · 2,000 sq ft -> ${mRooms.length} rooms [${mRooms.join(', ')}]`
    );
  } catch (e) {
    record(false, 'plinth area -> generated room programme (HTTP /api/generate-floorplan)', e.message);
  }
}

/* ================================================================== */
/* B. LIVE UI CHECKS                                                  */
/* ================================================================== */
async function setRangeValue(page, selector, value) {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`missing ${sel}`);
      const proto = window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, String(val));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    selector,
    value
  );
  await sleep(220);
}

async function uiChecks(page, shots) {
  console.log('\n[B] Live UI checks');

  // B1. Tile structure: four collapsible sections
  const sectionTitles = ['Project Parameters', 'Building Configuration', 'Client Requirements', 'Report Narrative Engine'];
  const present = await page.evaluate((titles) => {
    return titles.map((t) => Boolean(document.querySelector(`section[aria-label="${t}"]`)));
  }, sectionTitles);
  record(
    present.every(Boolean),
    'tile exposes 4 collapsible sections',
    sectionTitles.filter((_, i) => !present[i]).length ? `missing: ${sectionTitles.filter((_, i) => !present[i])}` : sectionTitles.join(' / ')
  );

  // B2. Collapsible persistence (localStorage)
  await page.evaluate(() => {
    const header = document.querySelector('section[aria-label="Client Requirements"] button');
    header.click();
  });
  await sleep(350);
  const collapsedState = await page.evaluate(() => {
    const header = document.querySelector('section[aria-label="Client Requirements"] button');
    return {
      expanded: header.getAttribute('aria-expanded'),
      stored: localStorage.getItem('bw.report.sections.v1'),
    };
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(500);
  const afterReload = await page.evaluate(() => {
    const header = document.querySelector('section[aria-label="Client Requirements"] button');
    return header && header.getAttribute('aria-expanded');
  });
  record(
    collapsedState.expanded === 'false' && /"side.brief":false/.test(collapsedState.stored || '') && afterReload === 'false',
    'section collapse persists across reload',
    `stored ${collapsedState.stored} · after reload aria-expanded=${afterReload}`
  );
  // restore
  await page.evaluate(() => {
    const header = document.querySelector('section[aria-label="Client Requirements"] button');
    if (header.getAttribute('aria-expanded') === 'false') header.click();
  });
  await sleep(300);

  // B3. Grade segmented cards: rates + accent selected state
  const gradeInfo = await page.evaluate(() => {
    const group = document.querySelector('[data-testid="quality-grade-group"]');
    const cards = Array.from(group.querySelectorAll('[role="radio"]'));
    return cards.map((c) => {
      const label = c.querySelector('span:nth-child(1)').textContent.trim();
      const rate = c.querySelector('span:nth-child(2)').textContent.trim();
      const blurb = c.querySelector('span:nth-child(3)').textContent.trim();
      return { label, rate, blurb, checked: c.getAttribute('aria-checked'), bg: getComputedStyle(c).backgroundColor };
    });
  });
  record(
    gradeInfo.length === 3 && gradeInfo.every((g) => /₹[\d,]+/.test(g.rate)) && gradeInfo.every((g) => g.blurb.length > 3),
    'grade cards show rate + description',
    gradeInfo.map((g) => `${g.label}: ${g.rate} (${g.blurb})`).join(' | ')
  );

  await page.click('[data-testid="quality-grade-premium"]');
  await sleep(260);
  const afterGrade = await page.evaluate(() => {
    const group = document.querySelector('[data-testid="quality-grade-group"]');
    const cards = Array.from(group.querySelectorAll('[role="radio"]'));
    return cards.map((c) => ({
      label: c.querySelector('span:nth-child(1)').textContent.trim(),
      checked: c.getAttribute('aria-checked'),
      bg: getComputedStyle(c).backgroundColor,
      color: getComputedStyle(c.querySelector('span:nth-child(1)')).color,
    }));
  });
  const premium = afterGrade.find((c) => c.label === 'Premium');
  const standard = afterGrade.find((c) => c.label === 'Standard');
  record(
    premium.checked === 'true' && standard.checked === 'false' && premium.bg !== standard.bg,
    'grade selection moves the accent card state',
    `premium bg ${premium.bg} / ${premium.color} vs standard bg ${standard.bg}`
  );
  if (shots) await shots.lightTile();

  // B4. Info popover is portalled (cannot be clipped) and states the rate table
  await page.click('section[aria-label="Project Parameters"] [aria-label="Methodology for Specification Grade"]');
  await sleep(320);
  const popover = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="methodology-popover-specification-grade"]');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      parent: el.parentElement === document.body ? 'body' : el.parentElement.tagName,
      insideClipped: Boolean(el.closest('.overflow-hidden')),
      text: el.innerText,
      fullyVisible: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.width > 200,
    };
  });
  record(
    popover !== null &&
      popover.parent === 'body' &&
      popover.fullyVisible &&
      /₹1,500/.test(popover.text) &&
      /₹3,500/.test(popover.text) &&
      /Not the land price/i.test(popover.text) &&
      /Finish schedule/i.test(popover.text),
    'grade info popover: portalled, fully visible, rate table + finish tiers',
    popover ? `parent=${popover.parent} clippedAncestor=${popover.insideClipped}` : 'popover not found'
  );
  if (shots) await shots.lightPopover();
  await page.keyboard.press('Escape');
  await sleep(250);

  // B5. Plinth slider: live bubble while dragging
  const box = await page.$eval('#area-input', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.mouse.move(box.x + box.w * 0.5, box.y + box.h / 2);
  await page.mouse.down();
  await sleep(200);
  const bubble = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="area-input-bubble"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { text: b.innerText.trim(), visible: r.width > 0 && r.height > 0 };
  });
  if (shots) await shots.lightSliderDrag();
  await page.mouse.up();
  await sleep(200);
  record(
    bubble !== null && bubble.visible && /sq ft/.test(bubble.text),
    'plinth slider shows a live value bubble while dragging',
    bubble ? `"${bubble.text}"` : 'bubble missing'
  );
  // Focus keeps the bubble while the control is active (keyboard parity); it
  // must clear as soon as the slider is no longer the active control.
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await sleep(250);
  const bubbleGone = await page.evaluate(() => !document.querySelector('[data-testid="area-input-bubble"]'));
  record(bubbleGone, 'value bubble clears once the slider is no longer active');

  // B6. Magnetic snap at the 2,000 sq ft preset + secondary unit (m²)
  await setRangeValue(page, '#area-input', 1990);
  await sleep(250);
  const snapped = await page.evaluate(() => {
    const el = document.querySelector('#area-input');
    const row = el.closest('div').parentElement;
    return {
      value: el.value,
      label: document.querySelector('label[for="area-input"]').parentElement.parentElement.innerText,
    };
  });
  record(snapped.value === '2000', 'plinth slider snaps to the 2,000 sq ft preset', `raw 1990 -> ${snapped.value}`);
  record(/185\.8 m²/.test(snapped.label), 'plinth area prints the secondary unit (m²)', snapped.label.split('\n').join(' | '));

  // B7. Coverage slider: tick marks, magenta snap points, footprint secondary text
  const cov = await page.evaluate(() => {
    const el = document.querySelector('#coverage-input');
    const wrap = el.parentElement;
    const ticks = wrap.querySelectorAll('div[aria-hidden="true"] span');
    const group = el.closest('.space-y-1');
    return { tickCount: ticks.length, rowText: group.innerText };
  });
  record(cov.tickCount === 3, 'coverage slider renders 3 preset tick marks', `ticks=${cov.tickCount}`);
  record(
    /cap on plot area|footprint/.test(cov.rowText),
    'coverage prints the resulting footprint cap',
    cov.rowText.split('\n').join(' | ')
  );
  await setRangeValue(page, '#coverage-input', 0.59);
  await sleep(250);
  const covSnapped = await page.$eval('#coverage-input', (el) => el.value);
  record(/^0\.6/.test(covSnapped), 'coverage slider snaps to the 60% preset', `raw 0.59 -> ${covSnapped}`);

  // B8. Typology caption + storeys disabled-with-reason per typology cap
  const typoChange = await page.evaluate(() => {
    const sel = document.querySelector('#typology-select');
    sel.click();
    return true;
  });
  void typoChange;
  await sleep(250);
  await page.evaluate(() => {
    const opt = Array.from(document.querySelectorAll('[role="option"]')).find((o) =>
      /Industrial|Warehouse/i.test(o.textContent || '')
    );
    if (opt) opt.click();
  });
  await sleep(400);
  const captions = await page.evaluate(() => ({
    typology: document.querySelector('[data-testid="typology-caption"]')?.innerText || '',
    storeys: document.querySelector('[data-testid="storeys-caption"]')?.innerText || '',
  }));
  record(
    /T4 - Warehouse/.test(captions.typology) && /capped at 2/.test(captions.storeys),
    'typology + storeys captions describe the selected configuration',
    `${captions.typology.trim()} · ${captions.storeys.trim()}`
  );
  await page.evaluate(() => document.querySelector('#floors-select').click());
  await sleep(300);
  const disabledRows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="option"][aria-disabled="true"]')).map((o) => ({
      text: o.innerText.replace(/\n/g, ' | '),
      title: o.getAttribute('title'),
    }));
  });
  record(
    disabledRows.length >= 2 && disabledRows.every((r) => (r.title || '').length > 10),
    'out-of-range storeys options are disabled with a reason',
    disabledRows.map((r) => r.text).join(' ;; ')
  );
  await page.keyboard.press('Escape');
  await sleep(200);
  // restore the default typology
  await page.evaluate(() => {
    const sel = document.querySelector('#typology-select');
    sel.click();
  });
  await sleep(250);
  await page.evaluate(() => {
    const opt = Array.from(document.querySelectorAll('[role="option"]')).find((o) =>
      /Single-Family/i.test(o.textContent || '')
    );
    if (opt) opt.click();
  });
  await sleep(350);

  // B9. Brief: click-to-insert example, live counter, parse preview
  await page.click('[data-testid="brief-example-2-baths"]');
  await sleep(250);
  await page.click('[data-testid="brief-example-north-facing-study"]');
  await sleep(300);
  const brief = await page.evaluate(() => ({
    value: document.querySelector('#client-requirements-input').value,
    counter: document.querySelector('[data-testid="brief-counter"]').innerText.trim(),
  }));
  record(
    /2 baths/.test(brief.value) && /north-facing study/.test(brief.value),
    'brief example chips insert into the textarea',
    `"${brief.value}"`
  );
  record(
    brief.counter === `${brief.value.length}/240`,
    'brief counter tracks the live length',
    `counter ${brief.counter} vs length ${brief.value.length}`
  );
  // Wait for a parse that reflects the FULL brief (the preview first shows the
  // synchronous fallback for the previous text, which is not the settled state).
  let preview = null;
  for (let i = 0; i < 25; i += 1) {
    preview = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="brief-parse-preview"]');
      return el ? el.innerText.trim() : null;
    });
    if (preview && /Parsed:/.test(preview) && /[1-9] space/.test(preview)) break;
    await sleep(400);
  }
  record(
    Boolean(preview && /Parsed:/.test(preview) && /bed/.test(preview) && /bath/.test(preview)),
    'brief parse preview reports the extracted constraints',
    preview || 'no parse preview'
  );
  const chipPanel = await page.evaluate(() => {
    // innerText reflects CSS text-transform, so match case-insensitively.
    const panel = Array.from(document.querySelectorAll('div')).find((d) =>
      /parsed design constraints/i.test(d.innerText || '')
    );
    if (!panel) return null;
    return {
      hasStudyChip: /study/i.test(panel.innerText),
      steppers: Array.from(panel.querySelectorAll('[title^="Increase "]')).map((b) => b.getAttribute('title')),
      removers: Array.from(panel.querySelectorAll('[title^="Remove "]')).map((b) => b.getAttribute('title')),
    };
  });
  record(
    chipPanel !== null && chipPanel.steppers.length >= 2 && chipPanel.hasStudyChip,
    'parsed constraints render as editable chips (counts + specialised spaces)',
    chipPanel ? `steppers ${chipPanel.steppers.join(', ')} · removers ${chipPanel.removers.join(', ')}` : 'no chip panel'
  );

  // B10. Provider status dot + honest caption
  const providerBefore = await page.evaluate(() => ({
    label: document.querySelector('[data-testid="provider-state-label"]').innerText.trim(),
    dot: getComputedStyle(document.querySelector('[data-testid="provider-status-dot"]')).backgroundColor,
    caption: document.querySelector('[data-testid="provider-caption"]').innerText.trim(),
  }));
  await page.evaluate(() => document.querySelector('#ai-provider-select').click());
  await sleep(250);
  const providerMenu = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.innerText.replace(/\n/g, ' | '))
  );

  // B10a. While the menu is open: it is anchored to the field and never leaves
  // the frame it belongs to (the sidebar tile) or the viewport. The panel used
  // to widen past the tile's right edge and hang off the bottom of a short
  // window, leaving the last engine unreachable.
  const menuBounds = await page.evaluate(() => {
    const trigger = document.getElementById('ai-provider-select');
    const menu = document.querySelector('[role="listbox"]');
    if (!menu || !trigger) return null;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) };
    };
    const options = Array.from(menu.querySelectorAll('[role="option"]'));
    return {
      menu: box(menu),
      menuStyle: menu.getAttribute('style'),
      openMenus: document.querySelectorAll('[role="listbox"]').length,
      trigger: box(trigger),
      frame: box(trigger.closest('aside') || document.documentElement),
      lastOption: options.length ? box(options[options.length - 1]) : null,
      scrollable: menu.scrollHeight > menu.clientHeight + 1,
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  });
  const boxText = (b) => `[${b.l}..${b.r} x ${b.t}..${b.b}]`;
  record(
    menuBounds !== null &&
      menuBounds.menu.l >= menuBounds.frame.l - 1 &&
      menuBounds.menu.r <= menuBounds.frame.r + 1 &&
      menuBounds.menu.t >= menuBounds.frame.t - 1 &&
      menuBounds.menu.b <= menuBounds.frame.b + 1,
    'open provider menu stays inside its sidebar tile',
    menuBounds
      ? `menu ${boxText(menuBounds.menu)} · trigger ${boxText(menuBounds.trigger)} · frame ${boxText(menuBounds.frame)} · open menus ${menuBounds.openMenus} · style ${menuBounds.menuStyle}`
      : 'no open menu'
  );
  record(
    menuBounds !== null &&
      menuBounds.menu.t >= 0 &&
      menuBounds.menu.b <= menuBounds.viewport.h + 1 &&
      (menuBounds.scrollable || menuBounds.lastOption.b <= menuBounds.viewport.h + 1),
    'open menu keeps every engine reachable inside the viewport',
    menuBounds
      ? `menu ${boxText(menuBounds.menu)} · last option bottom ${menuBounds.lastOption.b} · scrollable ${menuBounds.scrollable} · viewport h ${menuBounds.viewport.h}`
      : 'no open menu'
  );

  await page.evaluate(() => {
    const opt = Array.from(document.querySelectorAll('[role="option"]')).find((o) => /Ollama/.test(o.textContent || ''));
    if (opt) opt.click();
  });
  await sleep(350);
  const providerAfter = await page.evaluate(() => ({
    label: document.querySelector('[data-testid="provider-state-label"]').innerText.trim(),
    dot: getComputedStyle(document.querySelector('[data-testid="provider-status-dot"]')).backgroundColor,
    caption: document.querySelector('[data-testid="provider-caption"]').innerText.trim(),
  }));
  record(
    providerBefore.label === 'Live' && /rgb\(52, 199, 89\)/.test(providerBefore.dot) && providerAfter.label === 'Unknown',
    'provider status dot reflects key availability',
    `groq: ${providerBefore.label} ${providerBefore.dot} -> ollama: ${providerAfter.label} ${providerAfter.dot}`
  );
  record(
    providerMenu.some((m) => /Key configured/.test(m)) && providerMenu.some((m) => /No key, no network/.test(m)),
    'provider menu states each engine availability',
    providerMenu.join(' ;; ')
  );
  await page.evaluate(() => document.querySelector('#ai-provider-select').click());
  await sleep(250);
  await page.evaluate(() => {
    const opt = Array.from(document.querySelectorAll('[role="option"]')).find((o) => /Groq/.test(o.textContent || ''));
    if (opt) opt.click();
  });
  await sleep(300);

  // B11. Run CTA label + Enter shortcut opens the capture flow
  const ctaLabel = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      /Select Location on Map to Begin|Run Site Feasibility Analysis/.test(b.textContent || '')
    );
    return btn ? btn.innerText.trim() : null;
  });
  record(Boolean(ctaLabel), 'run CTA renders with an honest label', ctaLabel);

  await page.focus('#area-input');
  await page.keyboard.press('Enter');
  await sleep(700);
  const captureOpen = await page.evaluate(() => Boolean(document.querySelector('[data-testid="capture-sheet"]')));
  record(captureOpen, 'Enter inside the panel starts the gated flow (capture wizard opens)');
  await page.keyboard.press('Escape');
  await sleep(400);
}

/* ================================================================== */
/* C. THEME SHORTCUT + LIGHT/DARK FRAMES                              */
/* ================================================================== */
async function themeProof(page, shots) {
  console.log('\n[C] Theme shortcut + light/dark frames');

  // The tile is keyboard-operable, so the theme shortcut has to survive focus
  // sitting on a sidebar control (a slider is not a typing surface).
  await page.focus('#area-input');
  await page.keyboard.press('t');
  await sleep(450);
  const darkState = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    bgPage: getComputedStyle(document.documentElement).getPropertyValue('--bg-page').trim(),
    focused: document.activeElement && document.activeElement.id,
  }));
  record(
    darkState.theme === 'dark' && /^#0/i.test(darkState.bgPage),
    'T toggles the theme while the plinth slider holds focus',
    `data-theme=${darkState.theme} · --bg-page=${darkState.bgPage} · focus=#${darkState.focused}`
  );

  const darkB64 = await shots.darkTile();
  const darkLum = await frameLuminance(page, darkB64);
  record(darkLum < 0.5, 'dark tile frame is genuinely dark', `mean luminance ${(darkLum * 100).toFixed(1)}%`);

  await page.click('section[aria-label="Project Parameters"] [aria-label="Methodology for Specification Grade"]');
  await sleep(400);
  const darkPopover = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="methodology-popover-specification-grade"]');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      parent: el.parentElement === document.body ? 'body' : el.parentElement.tagName,
      visible: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.width > 200,
      text: el.innerText,
    };
  });
  const darkPopB64 = await shots.darkPopover();
  const darkPopLum = await frameLuminance(page, darkPopB64);
  record(darkPopLum < 0.6, 'dark popover frame is genuinely dark', `mean luminance ${(darkPopLum * 100).toFixed(1)}%`);
  record(
    darkPopover !== null && darkPopover.parent === 'body' && darkPopover.visible && /₹1,500/.test(darkPopover.text) && /Not the land price/i.test(darkPopover.text),
    'grade popover stays portalled + readable in dark mode',
    darkPopover ? `parent=${darkPopover.parent} visible=${darkPopover.visible}` : 'popover not found'
  );
  await page.keyboard.press('Escape');
  await sleep(300);

  // Focus is now on the info button — another non-typing surface — so T still
  // works there and restores light mode for the rest of the audit.
  await page.keyboard.press('t');
  await sleep(450);
  const restored = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  record(restored === 'light', 'theme shortcut restores light mode from a focused button', `data-theme=${restored}`);

  // Guard rail for the rule above: the same key must still be swallowed while
  // the user is genuinely typing, or the shortcut would corrupt form entry.
  const briefBefore = await page.$eval('#client-requirements-input', (el) => {
    el.setSelectionRange(el.value.length, el.value.length);
    return el.value;
  });
  await page.focus('#client-requirements-input');
  await page.keyboard.press('t');
  await sleep(350);
  const typing = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    value: document.querySelector('#client-requirements-input').value,
  }));
  record(
    typing.theme === 'light' && typing.value === `${briefBefore}t`,
    'T is still swallowed while typing in the brief textarea',
    `data-theme=${typing.theme} · value "${typing.value}"`
  );

  // Each interactive capture must show something the baseline tile does not.
  console.log('\n[D] Proof frames carry distinct content');
  const pairs = [
    ['00-light-tile-initial.png', '01-light-tile.png', 'grade selection re-renders the tile'],
    ['02-light-grade-popover.png', '01-light-tile.png', 'popover capture adds the rate panel'],
    ['03-light-slider-drag.png', '01-light-tile.png', 'slider-drag capture adds the value bubble'],
    ['05-dark-grade-popover.png', '04-dark-tile.png', 'dark popover capture adds the rate panel'],
  ];
  for (const [a, b, label] of pairs) {
    if (!frames[a] || !frames[b]) {
      record(false, `${label} (${a} vs ${b})`, 'frame missing');
      continue;
    }
    const delta = await frameDelta(page, a, b);
    record(delta > 0.5, `${label} (${a} vs ${b})`, `${delta.toFixed(2)}% of overlapping pixels differ`);
  }
}

/* ================================================================== */
/* MAIN                                                               */
/* ================================================================== */
(async () => {
  fs.mkdirSync(PROOF_DIR, { recursive: true });
  await backendDeltas();

  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=2'],
    defaultViewport: VIEWPORT,
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('[data-testid="quality-grade-group"]', { timeout: 30000 });
  await sleep(600);

  const sidebarHandle = async () => {
    const el = await page.$('section[aria-label="Project Parameters"]');
    const parent = await el.evaluateHandle((n) => n.closest('aside') || n.parentElement.parentElement);
    return parent.asElement();
  };

  const shots = {
    lightTile: async () => shotElement(page, await sidebarHandle(), '01-light-tile.png'),
    lightPopover: async () => shotClip(page, await clipSidebar(page), '02-light-grade-popover.png'),
    lightSliderDrag: async () => shotClip(page, await clipSidebar(page), '03-light-slider-drag.png'),
    darkTile: async () => shotElement(page, await sidebarHandle(), '04-dark-tile.png'),
    darkPopover: async () => shotClip(page, await clipSidebar(page), '05-dark-grade-popover.png'),
  };

  const clipSidebar = async (p) =>
    p.$eval('section[aria-label="Project Parameters"]', (n) => {
      const aside = n.closest('aside') || n.parentElement.parentElement;
      const r = aside.getBoundingClientRect();
      return { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 4), width: Math.min(r.width + 8, 520), height: Math.min(r.height + 8, 950) };
    });

  try {
    if (await page.$('[data-testid="quality-grade-group"]')) {
      const initialB64 = await shotElement(page, await sidebarHandle(), '00-light-tile-initial.png');
      const initialLum = await frameLuminance(page, initialB64);
      record(initialLum > 0.7, 'light tile frame is genuinely light', `mean luminance ${(initialLum * 100).toFixed(1)}%`);
    }
    await uiChecks(page, shots);
    await themeProof(page, shots);
  } catch (e) {
    record(false, 'ui audit completed', `${e.message}`);
  }

  const realErrors = consoleErrors.filter((t) => !/favicon|ResizeObserver loop|Download the React DevTools/i.test(t));
  record(realErrors.length === 0, 'no console/page errors during the audit', realErrors.slice(0, 3).join(' | '));

  await browser.close();

  const results = {
    generated_at: new Date().toISOString(),
    app_url: APP_URL,
    api_url: API_URL,
    viewport: VIEWPORT,
    passed: passes,
    failed: failures.length,
    checks,
  };
  fs.writeFileSync(path.join(PROOF_DIR, 'results.json'), JSON.stringify(results, null, 2));

  console.log(`\n=== sidebar wiring audit: ${passes} passed, ${failures.length} failed ===`);
  console.log(`proof: ${PROOF_DIR}`);
  if (failures.length) {
    for (const f of failures) console.log(`  FAIL ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(`audit crashed: ${e.message}`);
  process.exit(1);
});
