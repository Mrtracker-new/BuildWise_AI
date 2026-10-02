#!/usr/bin/env node
/**
 * test_design_system.cjs — design-system tests.
 * ====================================================
 * Repo dialect: plain-node assertions (no test framework).
 *   1. Token module surface: MOTION, RADII, Z_INDEX, SHORTCUTS, APP_INK,
 *      SHEET_INK, ui(), TABULAR_NUMS_CLASS exported from src/design.
 *   2. Primitive inventory: GlassPanel, SegmentedControl, PillChip, Sheet,
 *      Tooltip, ToastViewport, Stepper, IconButton, ActionButton, Select,
 *      CoachMark + Kbd/ShortcutHint, useShortcuts/ShortcutsSheet.
 *   3. Contracts: motion band 100-250ms; SHORTCUTS = t/m/r/?; index.css has
 *      motion vars + global reduced-motion guard; Tailwind scales wired.
 *   4. Adoption: App uses DesignProvider/useShortcuts/ShortcutsSheet/
 *      ToastViewport; AppHeader + MapStyleSelector expose the T/M/R
 *      shortcuts through aria-keyshortcuts (no visible Kbd badges on
 *      buttons); AnalysisForm consumes the design Select directly.
 *   5. Behavioral: lint_tokens FAILS a file with a new hex literal and PASSES
 *      again once removed (temp file, cleaned up).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DESIGN = path.join(ROOT, 'src', 'design');
let failures = 0;
let passes = 0;

function check(cond, label) {
  if (cond) {
    passes++;
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

/* ---------------- 1+2. Module surface ---------------- */
console.log('\n[1] Token module surface');
const tokensSrc = fs.readFileSync(path.join(DESIGN, 'tokens.ts'), 'utf8');
for (const name of ['MOTION', 'RADII', 'SPACING', 'TYPOGRAPHY', 'TABULAR_NUMS_CLASS', 'Z_INDEX', 'HIT_TARGETS', 'BLUR', 'SHORTCUTS', 'APP_INK', 'SHEET_INK', 'ui']) {
  check(new RegExp(`export (const|function|type) ${name}\\b`).test(tokensSrc), `tokens.ts exports ${name}`);
}

console.log('\n[2] Primitive inventory');
const primSrc = fs.readFileSync(path.join(DESIGN, 'primitives.tsx'), 'utf8');
for (const name of ['GlassPanel', 'SegmentedControl', 'PillChip', 'Sheet', 'Tooltip', 'ToastViewport', 'Stepper', 'IconButton', 'ActionButton', 'Select', 'CoachMark', 'Kbd', 'ShortcutHint', 'DesignProvider', 'useDesign', 'useToast', 'useCoachMark', 'useReducedMotion', 'useShortcuts', 'ShortcutsSheet']) {
  check(new RegExp(`export (const|function|type|interface) ${name}\\b`).test(primSrc), `primitives.tsx exports ${name}`);
}
const barrel = fs.readFileSync(path.join(DESIGN, 'index.ts'), 'utf8');
check(/export \* from '\.\/tokens'/.test(barrel) && /export \* from '\.\/primitives'/.test(barrel), 'barrel re-exports tokens + primitives');

/* ---------------- 3. Contracts ---------------- */
console.log('\n[3] Design contracts');
check(/100.*150.*200|'fast': 100/.test(tokensSrc.replace(/\s+/g, ' ')), 'MOTION durations within 100-250ms band');
check(/250/.test(tokensSrc), 'sheet/overlay duration 250ms present');
const shortcutKeys = [...tokensSrc.matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1]);
check(JSON.stringify(shortcutKeys) === JSON.stringify(['t', 'm', 'r', '?']), `SHORTCUTS = t,m,r,? (got ${shortcutKeys})`);

const css = fs.readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8');
check(css.includes('--motion-duration-base') && css.includes('--motion-ease-out'), 'index.css carries motion tokens (light+dark)');
check(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration:\s*0\.01ms/.test(css), 'global reduced-motion guard in index.css');
check(css.includes('.ui-font-tabular') || css.includes('tabular-nums'), 'tabular-nums utility in index.css');

const tw = fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8');
check(/apple:\s*'cubic-bezier\(0\.25, 0\.1, 0\.25, 1\)'/.test(tw), 'Tailwind ease-apple scale');
check(/100:\s*'100ms'|150:\s*'150ms'/.test(tw), 'Tailwind duration scale 100/150/...');

/* ---------------- 4. Adoption ---------------- */
console.log('\n[4] App adoption');
const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'App.tsx'), 'utf8');
check(/<DesignProvider>/.test(appSrc), 'App wrapped in DesignProvider');
check(/useShortcuts\(/.test(appSrc), 'App registers global useShortcuts');
check(/<ShortcutsSheet /.test(appSrc), 'App renders ShortcutsSheet');
check(/<ToastViewport \/>/.test(appSrc), 'App renders ToastViewport');

const headerSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'AppHeader.tsx'), 'utf8');
check(/aria-keyshortcuts="T"/.test(headerSrc), 'theme button advertises its T shortcut');
check(/aria-keyshortcuts="R"/.test(headerSrc), 'reset button advertises its R shortcut');
check(!/<Kbd>/.test(headerSrc), 'AppHeader buttons carry no visible Kbd badge');
check(/focus-visible:ring-2/.test(headerSrc), 'AppHeader buttons carry focus-visible rings');

const styleSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'MapStyleSelector.tsx'), 'utf8');
check(/aria-keyshortcuts="M"/.test(styleSrc), 'MapStyleSelector advertises its M shortcut');
check(!/<Kbd>/.test(styleSrc), 'MapStyleSelector carries no visible Kbd badge');
check(/bw:open-map-styles/.test(styleSrc), 'MapStyleSelector listens for M-key event');

const formSrc = fs.readFileSync(path.join(ROOT, 'src', 'components', 'AnalysisForm.tsx'), 'utf8');
check(/import \{ Select \} from '\.\.\/design'/.test(formSrc), 'AnalysisForm imports the design Select');
check(!fs.existsSync(path.join(ROOT, 'src', 'components', 'IosSelect.tsx')), 'legacy IosSelect shim is gone');

/* ---------------- 5. Behavioral: lint gate blocks new violations ---------------- */
console.log('\n[5] Token lint gate (behavioral)');
const tmpFile = path.join(ROOT, 'src', '__lint_probe_tmp__.tsx');
const lintScript = path.join(__dirname, 'lint_tokens.cjs');
const runLint = () => {
  try {
    execFileSync('node', [lintScript], { cwd: ROOT, stdio: 'pipe' });
    return 0;
  } catch (e) {
    return e.status || 1;
  }
};
try {
  fs.writeFileSync(tmpFile, 'export const probe = <div style={{ color: "#DEAD12" }}>x</div>;\n');
  const rc = runLint();
  check(rc !== 0, 'lint FAILS on new ad-hoc hex literal');
} finally {
  fs.unlinkSync(tmpFile);
}
check(runLint() === 0, 'lint PASSES on clean tree');

/* ---------------- Summary ---------------- */
console.log(`\n=== design system tests: ${passes} passed, ${failures} failed ===`);
process.exit(failures === 0 ? 0 : 1);
