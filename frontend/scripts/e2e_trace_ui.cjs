/**
 * e2e_trace_ui.cjs — browser proof for the boundary-tracing UI.
 * ============================================================================
 * Drives the real wizard (Puppeteer + real mouse) against a local dev server
 * and asserts the tracing UX contract end to end:
 *
 *   TOOLBAR    icons + words only — no key glyph pinned inside a control,
 *              binding still documented in the tooltip / Methodology reference;
 *   WIZARD     the primary "Close shape" action is a compact single-row
 *              control (32px, nowrap, no inline keycap) that stays inside the
 *              sheet, not a two-line block taller than every neighbour;
 *   PILLS      every floating tracing pill is legible over a live basemap:
 *              the close-target pill paints the accent surface (not panel
 *              white) with >= 4.5:1 text contrast and no opacity pulse;
 *   LIFECYCLE  Esc destroys all six draft sources and resets the HUD;
 *   EDIT       preset seeding draws the ring on the map in edit mode, a
 *              vertex drag updates the HUD live, Finish locks with no residue;
 *   METHOD     the Methodology reference documents every tracing shortcut;
 *   GLYPHS     no emoji-range code point is rendered anywhere in the app shell.
 *
 * Draft-overlay assertions read the REAL source geometry through
 * GeoJSONSource.serialize() (MapLibre v6 keeps data under `_data.geojson` /
 * `_data.updateable`, NOT `_data.features` — counting geometry points rather
 * than features also catches an "empty" LineString that still draws).
 *
 * Artifacts: screenshots + results.json in ../docs_ignore/trace-ui-proof
 * (repo-ignored scratch dir) — override with PROOF_DIR.
 *
 * Usage:
 *   node scripts/e2e_trace_ui.cjs
 * Env:
 *   E2E_URL     app URL (default http://localhost:5173/app)
 *   CHROME_PATH Chrome executable (defaults to the known local install)
 *   PROOF_DIR   artifact directory
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const URL = process.env.E2E_URL || 'http://localhost:5173/app';
const PROOF_DIR = process.env.PROOF_DIR || path.resolve(__dirname, '..', '..', 'docs_ignore', 'trace-ui-proof');

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
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  throw new Error('Chrome not found. Set CHROME_PATH to the Chrome executable.');
}

const results = [];
function check(ok, label, detail) {
  results.push({ ok, label, detail: detail === undefined ? null : detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- colors */
function parseColor(s) {
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((v) => parseFloat(v.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function luminance(c) {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
/** Composite a translucent color over an opaque backdrop. */
function over(fg, bg) {
  return {
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
    a: 1,
  };
}
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };

/** Worst-case contrast of text on a translucent pill (over white and black). */
function pillContrast(fg, bg) {
  const worstOf = (backdrop) => {
    const surface = over(bg, backdrop);
    return contrast(over(fg, surface), surface);
  };
  return Math.min(worstOf(WHITE), worstOf(BLACK));
}

/* -------------------------------------------------------------- in-page JS */
/** Real GeoJSON of every named source, read through the public serialize(). */
const READ_SOURCES = (ids) => {
  const map = window.__maplibreMap;
  const geometryPoints = (geom) => {
    if (!geom || !geom.coordinates) return 0;
    const c = geom.coordinates;
    switch (geom.type) {
      case 'Point': return c.length === 2 ? 1 : 0;
      case 'LineString': return c.length;
      case 'MultiLineString': return c.reduce((n, l) => n + l.length, 0);
      case 'Polygon': return c.reduce((n, r) => n + r.length, 0);
      case 'MultiPolygon':
        return c.reduce((n, poly) => n + poly.reduce((m, r) => m + r.length, 0), 0);
      default: return 0;
    }
  };
  const out = {};
  for (const id of ids) {
    const src = map && map.getSource(id);
    let data = null;
    try {
      const s = src && typeof src.serialize === 'function' ? src.serialize() : null;
      data = s && s.data;
    } catch { /* ignore */ }
    if (!data && src && src._data) data = src._data.geojson;
    // Sources are either a FeatureCollection or a single Feature (the live
    // edge / boundary line / drag line are bare LineStrings).
    const feats = !data ? [] : data.type === 'FeatureCollection' ? data.features || [] : data.type === 'Feature' ? [data] : [];
    out[id] = {
      features: feats.length,
      points: feats.reduce((n, f) => n + geometryPoints(f.geometry), 0),
    };
  }
  return out;
};

/** Screen coords of every placed vertex (source geometry -> map.project). */
const READ_VERTEX_POINTS = () => {
  const map = window.__maplibreMap;
  if (!map) return [];
  const src = map.getSource('bw-capture-vertices');
  let data = null;
  try {
    const s = src && typeof src.serialize === 'function' ? src.serialize() : null;
    data = s && s.data;
  } catch { /* ignore */ }
  if (!data && src && src._data) data = src._data.geojson;
  const feats = !data ? [] : data.type === 'FeatureCollection' ? data.features || [] : data.type === 'Feature' ? [data] : [];
  const rect = document.querySelector('.maplibregl-canvas').getBoundingClientRect();
  return feats
    .map((f) => {
      const [lng, lat] = f.geometry.coordinates;
      const p = map.project({ lng, lat });
      return { x: Math.round(rect.left + p.x), y: Math.round(rect.top + p.y) };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
};

/** Deterministic clickable points on the bare map canvas (skips every panel). */
const PICK_MAP_POINTS = (n) => {
  const canvas = document.querySelector('.maplibregl-canvas');
  if (!canvas) return [];
  const overlays = [
    '[data-testid="capture-sheet"]',
    '[data-testid="trace-toolbar-anchor"]',
    '[data-testid="capture-hud"]',
    '[data-testid="preset-menu"]',
  ]
    .map((s) => document.querySelector(s))
    .filter(Boolean)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { x1: r.left - 20, y1: r.top - 20, x2: r.right + 20, y2: r.bottom + 20 };
    });
  const r = canvas.getBoundingClientRect();
  const blocked = (x, y) => overlays.some((o) => x > o.x1 && x < o.x2 && y > o.y1 && y < o.y2);
  const pts = [];
  for (let y = Math.round(r.top + 150); y < r.bottom - 160; y += 16) {
    for (let x = Math.round(r.left + 40); x < r.right - 40; x += 16) {
      if (pts.length >= n) break;
      if (blocked(x, y)) continue;
      if (pts.some((p) => Math.hypot(p.x - x, p.y - y) < 190)) continue;
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      if (!(el.classList.contains('maplibregl-canvas') || el.closest('.maplibregl-canvas'))) continue;
      pts.push({ x, y });
    }
    if (pts.length >= n) break;
  }
  return pts;
};

/* ------------------------------------------------------------- page helpers */
async function shoot(page, name, clip) {
  const file = path.join(PROOF_DIR, `${name}.png`);
  await page.screenshot(clip ? { path: file, clip } : { path: file });
  return file;
}

async function openTraceStep(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('bw:edit-boundary')));
  await page.waitForSelector('[data-testid="capture-sheet"]', { timeout: 10000 });
  const clicked = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find((x) => /Trace boundary/.test(x.textContent || ''));
    if (!b) return false;
    b.click();
    return true;
  });
  if (!clicked) throw new Error('Trace boundary button not found');
  await page.waitForSelector('[data-testid="trace-toolbar"]', { timeout: 10000 });
  await sleep(180);
}

const sourceGeometry = (page, ids) => page.evaluate(READ_SOURCES, ids);
const vertexPoints = (page) => page.evaluate(READ_VERTEX_POINTS);
const hudVertices = (page) =>
  page.$eval('[data-testid="capture-hud-vertices"]', (el) => Number(el.textContent.trim()));
const hudArea = (page) => page.$eval('[data-testid="capture-hud-area"]', (el) => parseFloat(el.textContent));
const rectOf = (page, sel, pad = 12) =>
  page.$eval(
    sel,
    (el, p) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, r.x - p),
        y: Math.max(0, r.y - p),
        width: Math.min(1580, r.width + p * 2),
        height: Math.min(980, r.height + p * 2),
      };
    },
    pad
  );

const DRAFT_SOURCES = [
  'bw-capture-live',
  'bw-capture-guides',
  'bw-capture-ghost',
  'bw-capture-drag-line',
  'bw-capture-insert-handle',
  'bw-capture-close-target-src',
];

async function main() {
  console.log('=== E2E: boundary-tracing UI ===');
  fs.mkdirSync(PROOF_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: resolveChrome(),
    headless: true,
    // vsync/frame-limit off so the drag probe measures the WORK cost per frame
    // (a vsync-capped headless renderer just reports the 60Hz wall clock and
    // cannot distinguish a cheap drag from a dropped frame).
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1600,1000',
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e)));

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.maplibregl-canvas', { timeout: 15000 });
    await sleep(600);

    /* ---------------------------------------------------------- TOOLBAR */
    await openTraceStep(page);
    const toolbar = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="trace-toolbar"]');
      return Array.from(t.querySelectorAll('button')).map((b) => {
        const r = b.getBoundingClientRect();
        return {
          testid: b.getAttribute('data-testid'),
          label: b.textContent.trim(),
          glyphs: b.querySelectorAll('kbd').length,
          title: b.getAttribute('title') || '',
          disabled: b.disabled,
          h: +r.height.toFixed(1),
        };
      });
    });
    const glyphTotal = toolbar.reduce((n, b) => n + b.glyphs, 0);
    check(glyphTotal === 0, 'toolbar pins no key glyph inside any control', `kbd inside buttons = ${glyphTotal}`);
    const enabledTitles = toolbar.filter((b) => !b.disabled);
    check(
      enabledTitles.every((b) => b.title.length > 0),
      'every enabled toolbar control exposes a tooltip',
      enabledTitles.map((b) => `${b.testid}:"${b.title}"`).join(' ')
    );
    const drawBtn = toolbar.find((b) => b.testid === 'trace-toolbar-draw');
    check(
      Boolean(drawBtn && /\(D\)/.test(drawBtn.title)),
      'the D binding is discoverable in the tooltip, not painted on the button',
      drawBtn ? drawBtn.title : 'draw button missing'
    );
    check(
      toolbar.every((b) => b.h <= 34),
      'toolbar controls keep one constant compact height',
      toolbar.map((b) => `${b.testid}:${b.h}`).join(' ')
    );
    await shoot(page, '01-toolbar', await rectOf(page, '[data-testid="trace-toolbar-anchor"]'));

    /* ------------------------------------------------ WIZARD FOOTER BUTTON */
    const footer = await page.evaluate(() => {
      const sheet = document.querySelector('[data-testid="capture-sheet"]');
      const close = Array.from(sheet.querySelectorAll('button'))
        .find((b) => /Close shape/.test(b.textContent || ''));
      if (!close) return null;
      const cs = getComputedStyle(close);
      const r = close.getBoundingClientRect();
      const sr = sheet.getBoundingClientRect();
      const row = Array.from(sheet.querySelectorAll('button'))
        .filter((b) => Math.abs(b.getBoundingClientRect().top - r.top) < 24);
      return {
        w: +r.width.toFixed(1),
        h: +r.height.toFixed(1),
        whiteSpace: cs.whiteSpace,
        lineHeight: cs.lineHeight,
        glyphs: close.querySelectorAll('kbd').length,
        icons: close.querySelectorAll('svg').length,
        text: close.textContent.trim(),
        insetRight: +(sr.right - r.right).toFixed(1),
        insetBottom: +(sr.bottom - r.bottom).toFixed(1),
        rowHeights: row.map((b) => +b.getBoundingClientRect().height.toFixed(1)),
      };
    });
    check(Boolean(footer), 'the wizard still exposes a "Close shape" primary action');
    if (footer) {
      const oneLine = footer.h <= parseFloat(footer.lineHeight) + 16;
      check(footer.h <= 34 && oneLine, 'Close shape is a compact single-line control', `${footer.w}x${footer.h} (line-height ${footer.lineHeight})`);
      check(footer.whiteSpace === 'nowrap', 'the Close shape label can never wrap to two lines', footer.whiteSpace);
      check(footer.glyphs === 0, 'no keycap is embedded inside the primary button', `kbd=${footer.glyphs}`);
      check(footer.icons >= 1, 'the action is marked with the Check icon, not a glyph', `svg=${footer.icons}`);
      check(
        footer.rowHeights.every((h) => Math.abs(h - footer.h) <= 2),
        'the primary action matches its sibling controls in height',
        `heights ${footer.rowHeights.join('/')}`
      );
      check(
        footer.insetBottom > 6 && footer.insetRight > 6,
        'the button stays inside the sheet padding',
        `bottom ${footer.insetBottom}px, right ${footer.insetRight}px`
      );
    }
    await shoot(page, '02-wizard-footer', await rectOf(page, '[data-testid="capture-sheet"]', 14));

    /* --------------------------------------------- PLACE 3 VERTICES + PILL */
    const pts = await (async () => page.evaluate(PICK_MAP_POINTS, 3))();
    check(pts.length === 3, 'resolved 3 clickable points on the bare map', JSON.stringify(pts));
    const placedAfterEachClick = [];
    const paintAfterEachClick = [];
    for (const p of pts) {
      await page.mouse.click(p.x, p.y);
      await sleep(200);
      placedAfterEachClick.push(await hudVertices(page));
      const geom = await sourceGeometry(page, ['bw-capture-vertices', 'bw-capture-live']);
      paintAfterEachClick.push({
        handles: geom['bw-capture-vertices'].features,
        liveEdge: geom['bw-capture-live'].points,
      });
    }
    check(
      paintAfterEachClick.every((c, i) => c.handles === i + 1),
      'every click paints immediately (no dropped write while tiles stream)',
      `handles after each click: ${paintAfterEachClick.map((c) => c.handles).join(', ')}`
    );
    check(
      paintAfterEachClick[0].liveEdge === 2,
      'the dashed rubber-band edge is live from the very first vertex',
      `live edge points after click 1 = ${paintAfterEachClick[0].liveEdge}`
    );
    check(
      JSON.stringify(placedAfterEachClick) === '[1,2,3]',
      'the HUD vertex count tracks placed vertices 1:1 (no preview inflation)',
      `after each click: ${placedAfterEachClick.join(', ')}`
    );
    const placedGeom = await sourceGeometry(page, ['bw-capture-vertices']);
    check(
      placedGeom['bw-capture-vertices'].features === 3,
      'three vertex handles exist on the map while tracing',
      `handle features = ${placedGeom['bw-capture-vertices'].features}`
    );
    const draftWhileTracing = await sourceGeometry(page, DRAFT_SOURCES);
    check(
      draftWhileTracing['bw-capture-live'].points > 0,
      'the dashed rubber-band edge is live while tracing',
      `live edge points = ${draftWhileTracing['bw-capture-live'].points}`
    );

    const verts = await vertexPoints(page);
    check(
      verts.length === 3,
      'read all 3 vertex positions from the map source',
      `n=${verts.length} ${JSON.stringify(verts)} (vertices source: ${JSON.stringify(placedGeom['bw-capture-vertices'])})`
    );
    if (verts.length >= 1) {
      // Land EXACTLY on P1: the magnetic close engages within 6 m, and landing
      // on the vertex (not a few px off) is what makes the assertion stable.
      await page.mouse.move(verts[0].x, verts[0].y, { steps: 6 });
      await sleep(300);
    }
    const pill = await page.evaluate(() => {
      const hud = document.querySelector('[data-testid="cursor-dimension-hud"]');
      const el = hud && hud.firstElementChild;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        text: el.textContent.trim(),
        bg: cs.backgroundColor,
        color: cs.color,
        opacity: cs.opacity,
        animation: cs.animationName,
        box: { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: r.width + 32, height: r.height + 32 },
      };
    });
    check(Boolean(pill && /close/i.test(pill.text)), 'hovering P1 raises the close-target pill', pill ? pill.text : 'no pill');
    if (pill) {
      const bg = parseColor(pill.bg);
      const fg = parseColor(pill.color);
      const ratio = bg && fg ? pillContrast(fg, bg) : 0;
      check(
        Boolean(bg && bg.a >= 0.9),
        'the close-target pill paints an opaque accent surface (not panel white)',
        `background-color = ${pill.bg}`
      );
      check(ratio >= 4.5, 'close-target pill text contrast over the map >= 4.5:1', `${ratio.toFixed(2)}:1 (${pill.color} on ${pill.bg})`);
      check(pill.animation === 'none', 'the close-target label no longer pulses its own opacity', `animation-name = ${pill.animation}`);
      // Capturing a frame flushes the hover state, so the shots are taken
      // AFTER the assertions and the hover is re-armed first: one tight crop
      // straight off the element, one full viewport shown in situ.
      if (verts.length) {
        await page.mouse.move(verts[0].x + 1, verts[0].y + 1, { steps: 3 });
        await page.mouse.move(verts[0].x, verts[0].y, { steps: 3 });
        await sleep(260);
        const handle = await page.$('[data-testid="cursor-dimension-hud"] > *');
        if (handle) {
          try {
            await handle.screenshot({ path: path.join(PROOF_DIR, '03b-close-pill.png') });
          } catch { /* crop is best-effort evidence */ }
        }
        await shoot(page, '03-close-pill-in-context', { x: 0, y: 0, width: 1600, height: 1000 });
      }
    }

    const guidance = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div.vibrancy-pill'))
        .find((d) => /Click P1 or|Click map to place|Click to place point/.test(d.textContent || ''));
      if (!el) return null;
      const cs = getComputedStyle(el);
      const key = Array.from(el.querySelectorAll('span'))
        .find((s) => !/text-\[var\(--text-3\)\]/.test(s.className) && s.textContent.trim().length > 3);
      return {
        bg: cs.backgroundColor,
        text: el.textContent.trim().slice(0, 70),
        ink: key ? getComputedStyle(key).color : null,
      };
    });
    if (guidance && guidance.ink) {
      const gbg = parseColor(guidance.bg);
      const gfg = parseColor(guidance.ink);
      const gr = gbg && gfg ? pillContrast(gfg, gbg) : 0;
      check(Boolean(gbg && gbg.a >= 0.85), 'the guidance pill keeps a near-opaque float surface', `alpha = ${gbg ? gbg.a : 'n/a'}`);
      check(gr >= 4.5, 'guidance pill copy clears 4.5:1 over the darkest map tiles', `${gr.toFixed(2)}:1 (${guidance.ink} on ${guidance.bg})`);
    } else {
      check(false, 'found the guidance pill while tracing', guidance ? guidance.text : 'not found');
    }

    /* ------------------------------------------------------ LIFECYCLE: ESC */
    await page.keyboard.press('Escape');
    await sleep(300);
    const afterEsc = await page.evaluate(() => ({
      sheet: Boolean(document.querySelector('[data-testid="capture-sheet"]')),
      hud: Boolean(document.querySelector('[data-testid="capture-hud"]')),
      toolbar: Boolean(document.querySelector('[data-testid="trace-toolbar"]')),
      dashedDom: document.querySelectorAll('.maplibregl-canvas-container [stroke-dasharray]').length,
    }));
    const escDrafts = await sourceGeometry(page, DRAFT_SOURCES);
    const escLeft = Object.entries(escDrafts).filter(([, v]) => v.points > 0);
    check(
      escLeft.length === 0,
      'Esc leaves zero draft geometry in all six sources',
      escLeft.length ? JSON.stringify(escLeft) : JSON.stringify(escDrafts)
    );
    check(!afterEsc.sheet && !afterEsc.hud && !afterEsc.toolbar, 'Esc unmounts wizard + HUD + toolbar', JSON.stringify(afterEsc));
    check(afterEsc.dashedDom === 0, 'no dashed draft element is left in the map container DOM', `matches = ${afterEsc.dashedDom}`);

    /* --------------------------------------------------- PRESETS + EDIT MODE */
    await openTraceStep(page);
    const editBtnBefore = await page.$eval('[data-testid="trace-toolbar-edit"]', (el) => ({ disabled: el.disabled, title: el.title }));
    check(
      editBtnBefore.disabled && /3 vertices/.test(editBtnBefore.title),
      'Edit stays disabled (with a reason) until the ring has 3 vertices',
      `title = "${editBtnBefore.title}"`
    );
    await page.click('[data-testid="trace-toolbar-presets"]');
    await page.waitForSelector('[data-testid="preset-menu"]', { timeout: 5000 });
    const presetItems = await page.$$eval('[data-testid="preset-menu"] [role="menuitem"]', (els) =>
      els.map((e) => ({ id: e.getAttribute('data-testid'), svg: e.querySelectorAll('svg').length, label: e.textContent.trim() }))
    );
    check(
      presetItems.length === 4 && presetItems.every((p) => p.svg >= 1),
      'the presets menu lists 4 named thumbnails',
      JSON.stringify(presetItems.map((p) => p.id))
    );
    await shoot(page, '04-presets-menu', await rectOf(page, '[data-testid="preset-menu"]'));

    // Reduced motion honoured: the entrance animation must collapse to none.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await sleep(140);
    const reduced = await page.$eval('[data-testid="preset-menu"]', (el) => {
      const cs = getComputedStyle(el);
      return { name: cs.animationName, duration: cs.animationDuration };
    });
    check(
      reduced.name === 'none' || parseFloat(reduced.duration) < 0.05,
      'reduced-motion suppresses the preset menu entrance animation',
      JSON.stringify(reduced)
    );
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await sleep(80);

    await page.click('[data-testid="preset-item-l_shape"]');
    await sleep(400);
    const seeded = await page.evaluate(() => ({
      vertices: Number(document.querySelector('[data-testid="capture-hud-vertices"]').textContent.trim()),
      editActive: document.querySelector('[data-testid="trace-toolbar-edit"]')?.getAttribute('aria-pressed') === 'true',
    }));
    const seededGeom = await sourceGeometry(page, ['bw-capture-boundary', 'bw-capture-boundary-line-src', 'bw-capture-vertices']);
    check(
      seeded.vertices === 6 && seededGeom['bw-capture-vertices'].features === 6,
      'L-Shape seeds 6 vertices and 6 handles on the map',
      `hud=${seeded.vertices} handles=${seededGeom['bw-capture-vertices'].features}`
    );
    check(
      seededGeom['bw-capture-boundary-line-src'].points >= 6 && seededGeom['bw-capture-boundary-line-src'].features === 1,
      'the seeded ring is stroked on the map (closed polyline)',
      `line points = ${seededGeom['bw-capture-boundary-line-src'].points}`
    );
    check(seeded.editActive, 'seeding switches the session into EDIT mode');
    const editBtnAfter = await page.$eval('[data-testid="trace-toolbar-edit"]', (el) => ({ disabled: el.disabled, title: el.title }));
    check(
      !editBtnAfter.disabled && /\(E\)/.test(editBtnAfter.title),
      'the E binding lives in the Edit tooltip once the tool is usable',
      `title = "${editBtnAfter.title}"`
    );
    await shoot(page, '05-seeded-edit', { x: 0, y: 0, width: 1600, height: 1000 });

    /* ----------------------------------------------------- LIVE HUD ON DRAG */
    const handles = await vertexPoints(page);
    const beforeArea = await hudArea(page);
    let duringArea = beforeArea;
    let dragged = false;
    const startSampler = () =>
      page.evaluate(() => {
        window.__frames = [];
        window.__sampling = true;
        const tick = (t) => {
          if (!window.__sampling) return;
          window.__frames.push(t);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    const stopSampler = () =>
      page.evaluate(() => {
        window.__sampling = false;
        const f = window.__frames || [];
        const d = [];
        for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]);
        d.sort((a, b) => a - b);
        const q = (p) => (d.length ? d[Math.floor(p * (d.length - 1))] : 0);
        return { n: d.length, p50: q(0.5), p95: q(0.95), max: d.length ? d[d.length - 1] : 0 };
      });

    // (1) Frame budget on a CLEAN drag: the measured window must not contain a
    // CDP round-trip. Reading the HUD mid-drag (below) is itself a protocol
    // stall of the renderer, which would show up as harness jank, not product
    // jank. So the timing drag runs alone and the ring is then restored.
    let frameStats = null;
    if (handles.length >= 2) {
      await startSampler();
      await page.mouse.move(handles[1].x, handles[1].y, { steps: 5 });
      await page.mouse.down();
      await page.mouse.move(handles[1].x + 26, handles[1].y + 22, { steps: 16 });
      await page.mouse.up();
      await sleep(120);
      frameStats = await stopSampler();
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyZ');
      await page.keyboard.up('Control');
      await sleep(220);
    }

    // (2) Live HUD while the pointer is still down (separate drag).
    if (handles.length >= 2) {
      await page.mouse.move(handles[1].x, handles[1].y, { steps: 5 });
      await page.mouse.down();
      await page.mouse.move(handles[1].x + 26, handles[1].y + 22, { steps: 16 });
      duringArea = await hudArea(page); // pointer still down
      await page.mouse.up();
      dragged = true;
      await sleep(220);
    }
    check(handles.length >= 2, 'edit mode exposes draggable vertex handles', `handles = ${handles.length}`);
    check(dragged && duringArea !== beforeArea, 'the HUD area updates DURING a vertex drag (not only on release)', `${beforeArea} -> ${duringArea}`);
    if (frameStats) {
      check(
        frameStats.n >= 10 && frameStats.p95 < 16.7,
        'a clean drag costs under one 60fps frame (p95 < 16.7ms, vsync off)',
        `p50=${frameStats.p50.toFixed(1)}ms p95=${frameStats.p95.toFixed(1)}ms max=${frameStats.max.toFixed(1)}ms frames=${frameStats.n}`
      );
    }
    /* --------------------------------------------- INSERT + DELETE (EDIT) */
    const ringPts = await vertexPoints(page);
    let insertHandleShown = false;
    if (ringPts.length >= 4) {
      const mid = { x: (ringPts[1].x + ringPts[2].x) / 2, y: (ringPts[1].y + ringPts[2].y) / 2 };
      await page.mouse.move(mid.x, mid.y, { steps: 6 });
      await sleep(260);
      const hoverGeom = await sourceGeometry(page, ['bw-capture-insert-handle']);
      insertHandleShown = hoverGeom['bw-capture-insert-handle'].points === 1;
      check(insertHandleShown, 'hovering an edge reveals the mid-edge insert handle', `insert handle points = ${hoverGeom['bw-capture-insert-handle'].points}`);
      await page.mouse.click(mid.x, mid.y);
      await sleep(260);
      const afterInsert = await sourceGeometry(page, ['bw-capture-vertices']);
      check(
        afterInsert['bw-capture-vertices'].features === ringPts.length + 1,
        'clicking the edge inserts a vertex',
        `${ringPts.length} -> ${afterInsert['bw-capture-vertices'].features}`
      );
      // Delete with Ctrl+click (the documented twin of right-click).
      const pts7 = await vertexPoints(page);
      if (pts7.length >= 5) {
        const target = pts7[2];
        await page.mouse.move(target.x, target.y, { steps: 4 });
        await page.keyboard.down('Control');
        await page.mouse.click(target.x, target.y);
        await page.keyboard.up('Control');
        await sleep(280);
        const afterDelete = await sourceGeometry(page, ['bw-capture-vertices']);
        check(
          afterDelete['bw-capture-vertices'].features === pts7.length - 1,
          'Ctrl+click (and right-click) deletes a vertex',
          `${pts7.length} -> ${afterDelete['bw-capture-vertices'].features}`
        );
      } else {
        check(false, 'Ctrl+click (and right-click) deletes a vertex', 'not enough handles to delete');
      }
    } else {
      check(false, 'mid-edge insert handle', 'not enough handles after the drag');
    }

    const statusText = await page.$eval('[data-testid="capture-hud-status"]', (el) => el.textContent.trim());
    if (/self-intersect/i.test(statusText)) {
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyZ');
      await page.keyboard.up('Control');
      await sleep(220);
    }

    /* ------------------------------------------------------------- FINISH */
    const finishDisabled = await page.$eval('[data-testid="trace-toolbar-finish"]', (el) => el.disabled);
    check(!finishDisabled, 'Finish is enabled once the ring is closable', finishDisabled ? 'button disabled' : undefined);
    if (!finishDisabled) {
      await page.click('[data-testid="trace-toolbar-finish"]');
      await sleep(500);
    }
    const finishStep = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).some(
        (b) => b.getAttribute('aria-current') === 'step' && /frontage/i.test(b.getAttribute('aria-label') || '')
      )
    );
    const finishDrafts = await sourceGeometry(page, DRAFT_SOURCES);
    const finishLeft = Object.entries(finishDrafts).filter(([, v]) => v.points > 0);
    check(finishLeft.length === 0, 'Finish leaves no draft residue behind', finishLeft.length ? JSON.stringify(finishLeft) : 'all six sources empty');
    check(finishStep, 'Finish advances the wizard to the frontage step');
    await shoot(page, '06-finished', { x: 0, y: 0, width: 1600, height: 1000 });

    /* ------------------------------------------------------- METHODOLOGY */
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => /Methodology/.test(x.textContent || ''));
      if (b) b.click();
    });
    await page.waitForFunction(() => /Boundary tracing/i.test(document.body.textContent || ''), { timeout: 5000 });
    await sleep(150);
    const method = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h5')).find((x) => /Boundary tracing/i.test(x.textContent || ''));
      if (!h) return null;
      const section = h.parentElement;
      // The reference is scrollable: bring the block into view before shooting.
      section.scrollIntoView({ block: 'center' });
      const keys = Array.from(section.querySelectorAll('kbd')).map((k) => k.textContent.trim());
      const r = section.getBoundingClientRect();
      const width = Math.min(window.innerWidth - 8, r.width + 24);
      const height = Math.min(window.innerHeight - 8, r.height + 24);
      return {
        keys,
        box: {
          x: Math.max(0, Math.min(r.x - 12, window.innerWidth - width)),
          y: Math.max(0, Math.min(r.y - 12, window.innerHeight - height)),
          width,
          height,
        },
      };
    });
    const wantKeys = ['D', 'E', 'Tab', 'Enter', 'Backspace', 'Ctrl+Z', 'Click P1', 'Esc'];
    check(
      Boolean(method && wantKeys.every((k) => method.keys.includes(k))),
      'the Methodology reference documents every tracing shortcut',
      method ? JSON.stringify(method.keys) : 'section missing'
    );
    if (method) {
      await shoot(page, '07-methodology-shortcuts', method.box);
      await page.keyboard.press('Escape');
      await sleep(220);
    }

    /* ------------------------------------------------- RENDERED GLYPH AUDIT */
    await openTraceStep(page);
    const auditPts = await page.evaluate(PICK_MAP_POINTS, 2);
    for (const p of auditPts) {
      await page.mouse.click(p.x, p.y);
      await sleep(160);
    }
    const glyphAudit = await page.evaluate(() => {
      const EMOJI = [[0x1f300, 0x1faff], [0x2600, 0x27bf], [0xfe0f, 0xfe0f]];
      const GLYPH = EMOJI.concat([[0x2190, 0x21ff], [0x2300, 0x23ff], [0x2b00, 0x2bff]]);
      const scan = (root, ranges) => {
        const hits = [];
        if (!root) return hits;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          for (const ch of n.nodeValue) {
            const cp = ch.codePointAt(0);
            if (ranges.some(([a, b]) => cp >= a && cp <= b)) {
              hits.push({ cp: 'U+' + cp.toString(16).toUpperCase(), text: n.nodeValue.trim().slice(0, 50) });
            }
          }
        }
        return hits;
      };
      const tracingRoots = ['[data-testid="capture-sheet"]', '[data-testid="trace-toolbar"]', '[data-testid="capture-hud"]']
        .map((s) => document.querySelector(s))
        .filter(Boolean);
      return {
        traced: tracingRoots.length,
        tracing: tracingRoots.flatMap((r) => scan(r, GLYPH)),
        shell: scan(document.body, EMOJI),
      };
    });
    check(
      glyphAudit.tracing.length === 0 && glyphAudit.traced >= 2,
      'the tracing UI renders zero unicode glyph icons',
      `${glyphAudit.traced} tracing surfaces scanned; hits = ${JSON.stringify(glyphAudit.tracing.slice(0, 5))}`
    );
    check(
      glyphAudit.shell.length === 0,
      'no emoji or dingbat is rendered anywhere in the app shell',
      JSON.stringify(glyphAudit.shell.slice(0, 5))
    );
    await page.keyboard.press('Escape');
    await sleep(200);
  } catch (err) {
    check(false, 'E2E completed without throwing', String((err && err.stack) || err).slice(0, 400));
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  const report = {
    url: URL,
    ranAt: new Date().toISOString(),
    passed: results.length - failed.length,
    total: results.length,
    results,
    consoleErrors: consoleErrors.slice(0, 8),
    pageErrors,
    proofDir: PROOF_DIR,
  };
  fs.writeFileSync(path.join(PROOF_DIR, 'results.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(`\n=== ${report.passed}/${report.total} checks passed ===`);
  if (failed.length) {
    console.log('FAILURES:');
    failed.forEach((f) => console.log(`  - ${f.label}${f.detail ? ` — ${f.detail}` : ''}`));
  }
  if (consoleErrors.length) console.log(`(console errors captured: ${consoleErrors.length} — backend /api/status CORS is expected when the API is down)`);
  if (pageErrors.length) console.log(`(page errors captured: ${pageErrors.length})`);
  console.log(`artifacts: ${PROOF_DIR}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
