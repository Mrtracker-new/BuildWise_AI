#!/usr/bin/env node
/**
 * check_contrast.cjs — AA contrast gate.
 * ===============================================
 * 1. Extracts app-theme ink pairs from src/index.css (:root light, dark),
 *    sheet-theme pairs from backend drawing_ir.py (CAD/Paper), and the design
 *    module pairs from src/design/tokens.ts.
 * 2. Asserts the three sources AGREE (single-source-of-truth cross-check).
 * 3. Computes WCAG 2.x contrast ratios; primary AND secondary text must
 *    clear 4.5:1 (AA normal text) against the theme background.
 *
 * Usage: node scripts/check_contrast.cjs   (exit 1 on any AA failure/drift)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CSS = fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'index.css'), 'utf8');
const TOKENS = fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'design', 'tokens.ts'), 'utf8');
const DRAWING_IR = fs.readFileSync(
  path.join(ROOT, 'backend', 'app', 'services', 'floorplan', 'drawing_ir.py'),
  'utf8'
);

/* ---------------- WCAG 2.x relative luminance ---------------- */
function luminance(hex) {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------------- Source 1: index.css app themes ---------------- */
function cssVar(scope, name) {
  // scope: index of ':root,' or '[data-theme="dark"] {' block start
  const block = CSS.slice(scope);
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,6})`));
  return m ? m[1] : null;
}
const lightStart = CSS.indexOf(':root,');
const darkStart = CSS.indexOf('[data-theme="dark"]');
if (lightStart < 0 || darkStart < 0) {
  console.error('FAIL: theme blocks not found in index.css');
  process.exit(1);
}
const cssThemes = {
  light: {
    bg: cssVar(lightStart, 'bg-page'),
    ink: cssVar(lightStart, 'text-1'),
    inkSecondary: cssVar(lightStart, 'text-2'),
  },
  dark: {
    bg: cssVar(darkStart, 'bg-page'),
    ink: cssVar(darkStart, 'text-1'),
    inkSecondary: cssVar(darkStart, 'text-2'),
  },
};

/* ---------------- Source 2: design/tokens.ts APP_INK / SHEET_INK ---------------- */
function tokenPair(constName) {
  const re = new RegExp(`${constName}[^=]*=\\s*{([\\s\\S]*?)\\n};`);
  const m = TOKENS.match(re);
  if (!m) return null;
  const body = m[1];
  const pick = (key) => {
    const km = body.match(new RegExp(`${key}:\\s*'([^']+)'`));
    return km ? km[1] : null;
  };
  return {
    light: { bg: pick('light') && extract(body, 'light'), ink: null, inkSecondary: null },
    raw: body,
  };
}
// Simpler robust approach: pull each theme entry individually.
function tokenThemePair(constName, themeKey) {
  const re = new RegExp(`${constName}[^{]*{[\\s\\S]*?${themeKey}:\\s*{([^}]*)}`);
  const m = TOKENS.match(re);
  if (!m) return null;
  const body = m[1];
  const pick = (key) => {
    const km = body.match(new RegExp(`${key}:\\s*'([^']+)'`));
    return km ? km[1] : null;
  };
  return { bg: pick('bg'), ink: pick('ink'), inkSecondary: pick('inkSecondary'), name: pick('name') };
}
const tokenApp = {
  light: tokenThemePair('APP_INK', 'light'),
  dark: tokenThemePair('APP_INK', 'dark'),
};
const tokenSheet = {
  cad: tokenThemePair('SHEET_INK', 'cad'),
  paper: tokenThemePair('SHEET_INK', 'paper'),
};

/* ---------------- Source 3: drawing_ir.py sheet palettes ---------------- */
const ir = DRAWING_IR;
const pickIr = (pattern) => {
  const m = ir.match(pattern);
  return m ? m[1] : null;
};
const sheetThemes = {
  cad: {
    bg: pickIr(/bg_color\s*=\s*"#0B132B"\s*if\s+is_cad\s+else\s+"#F8FAFC"/) || (ir.includes('"#0B132B"') ? '#0B132B' : null),
    ink: pickIr(/text_primary\s*=\s*"(#[0-9A-Fa-f]{6})"\s*if\s+is_cad/),
    inkSecondary: pickIr(/text_secondary\s*=\s*"(#[0-9A-Fa-f]{6})"\s*if\s+is_cad/),
  },
  paper: {
    bg: '#F8FAFC',
    ink: pickIr(/text_primary\s*=\s*"[^"]*"\s*if\s+is_cad\s+else\s*"(#[0-9A-Fa-f]{6})"/),
    inkSecondary: pickIr(/text_secondary\s*=\s*"[^"]*"\s*if\s+is_cad\s+else\s*"(#[0-9A-Fa-f]{6})"/),
  },
};

/* ---------------- Cross-source agreement ---------------- */
const failures = [];
const rows = [];

function checkPair(label, pair, target) {
  if (!pair || !pair.bg || !pair.ink || !pair.inkSecondary) {
    failures.push(`${label}: source extraction failed (${JSON.stringify(pair)})`);
    return;
  }
  const c1 = contrast(pair.ink, pair.bg);
  const c2 = contrast(pair.inkSecondary, pair.bg);
  rows.push({ label, bg: pair.bg, ink: pair.ink, c1, ink2: pair.inkSecondary, c2 });
  if (c1 < 4.5) failures.push(`${label}: primary ink ${pair.ink} on ${pair.bg} = ${c1.toFixed(2)}:1 (< 4.5 AA)`);
  if (c2 < 4.5) failures.push(`${label}: secondary ink ${pair.inkSecondary} on ${pair.bg} = ${c2.toFixed(2)}:1 (< 4.5 AA)`);
  if (target && (pair.bg !== target.bg || pair.ink !== target.ink || pair.inkSecondary !== target.inkSecondary)) {
    failures.push(`${label}: DRIFT vs design/tokens.ts (tokens=${JSON.stringify(target)} actual=${JSON.stringify(pair)})`);
  }
}

// App themes: index.css must agree with tokens.ts and both must pass AA.
checkPair('App Light (css)', cssThemes.light, tokenApp.light);
checkPair('App Dark (css)', cssThemes.dark, tokenApp.dark);
// Sheet themes: drawing_ir.py must agree with tokens.ts and both must pass AA.
checkPair('Sheet CAD (ir)', sheetThemes.cad, tokenSheet.cad);
checkPair('Sheet Paper (ir)', sheetThemes.paper, tokenSheet.paper);

/* ---------------- Report ---------------- */
console.log('=== AA contrast gate (WCAG 2.x, normal-text 4.5:1) ===');
for (const r of rows) {
  console.log(
    `  ${r.label.padEnd(18)} bg ${r.bg}  ink ${r.ink} ${r.c1.toFixed(2)}:1  |  ink2 ${r.ink2} ${r.c2.toFixed(2)}:1`
  );
}
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('\nRESULT: PASS — all app + sheet themes clear AA; sources agree with design/tokens.ts.');
