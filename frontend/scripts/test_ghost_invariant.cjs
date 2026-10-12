#!/usr/bin/env node
/**
 * test_ghost_invariant.cjs — ghost-core-overlay invariant gate.
 * =============================================================
 * The F0 anchor core is drawn on EVERY blueprint sheet, so the ghost
 * (upper-floor core collapse) overlay is only meaningful above the ground
 * floor. This pins that contract on the pure gate + sanitizer the viewer uses:
 *
 *   .ghost-core-overlay is injected (display:block !important) ONLY when
 *   showGhostOverlay === true AND safeFloorIndex > 0.
 *
 * Both directions are checked: the toggle ON at F0 must still render hidden,
 * and the toggle OFF at F1+ must render hidden.
 *
 * Repo dialect: plain-node assertions (no test framework). Run with
 *   node --experimental-strip-types scripts/test_ghost_invariant.cjs
 */
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

(async () => {
  let failures = 0;
  const check = (cond, label) => {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`);
    if (!cond) failures++;
  };

  const { isGhostOverlayVisible, sanitizeBlueprintSvg } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'components', 'report', 'svgSanitize.ts')).href
  );

  console.log('\n[1] The gate: overlay is visible only above the ground floor');
  check(isGhostOverlayVisible(false, 0) === false, 'toggle OFF, F0 → hidden');
  check(isGhostOverlayVisible(false, 3) === false, 'toggle OFF, F3 → hidden');
  check(isGhostOverlayVisible(true, 0) === false, 'toggle ON, F0 → hidden (anchor core is on the sheet)');
  check(isGhostOverlayVisible(true, 1) === true, 'toggle ON, F1 → visible');
  check(isGhostOverlayVisible(true, 5) === true, 'toggle ON, F5 → visible');

  const sheet = '<svg width="100" height="100"><g class="ghost-core-overlay"></g></svg>';

  console.log('\n[2] The sanitizer injects the hidden override when the gate is closed');
  const hidden = sanitizeBlueprintSvg(sheet, isGhostOverlayVisible(true, 0));
  check(hidden.includes('display: none !important'), 'F0 + toggle ON → display:none !important is injected');
  check(!hidden.includes('display: block !important'), 'F0 + toggle ON → no display:block override');
  check(hidden.includes('data-ghost-overlay="false"'), 'data-ghost-overlay mirrors the gate (false)');

  console.log('\n[3] The sanitizer injects the visible override only when the gate is open');
  const shown = sanitizeBlueprintSvg(sheet, isGhostOverlayVisible(true, 2));
  check(shown.includes('display: block !important'), 'F2 + toggle ON → display:block !important is injected');
  check(!shown.includes('display: none !important'), 'F2 + toggle ON → no display:none override');
  check(shown.includes('data-ghost-overlay="true"'), 'data-ghost-overlay mirrors the gate (true)');

  console.log('\n[4] Sanitization still strips scripts and inline handlers');
  const dirty = '<svg onload="alert(1)"><script>steal()</script><g/></svg>';
  const clean = sanitizeBlueprintSvg(dirty, false);
  check(!clean.includes('<script'), 'script element removed');
  check(!/onload/i.test(clean), 'inline on* handler removed');
  check(sanitizeBlueprintSvg(null, true) === '', 'null sheet → empty string');
  check(sanitizeBlueprintSvg('', true) === '', 'empty sheet → empty string');

  console.log(
    failures === 0
      ? '\nPASS — ghost-core-overlay invariant holds in both directions\n'
      : `\nFAIL — ${failures} assertion(s) failed\n`
  );
  process.exit(failures === 0 ? 0 : 1);
})();
