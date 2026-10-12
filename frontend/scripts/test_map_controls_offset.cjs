#!/usr/bin/env node
/**
 * test_map_controls_offset.cjs — map-controls anchor offset (viewport boundary).
 * ============================================================================
 * Regression guard for the drawer-offset bug: a stylesheet `!important` once
 * forced `.map-controls-anchor { right: 16px }` below the lg edge, ignoring the
 * `--map-controls-right` custom property the app sets from the live viewport.
 *
 * The offset now comes from ONE pure function (design/breakpoints.ts
 * mapControlsRight). This test pins its behaviour at the exact 1023/1024px
 * drawer edge and asserts no !important override remains in the stylesheet.
 *
 * Repo dialect: plain-node assertions (no test framework). Run with
 *   node --experimental-strip-types scripts/test_map_controls_offset.cjs
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

(async () => {
  let failures = 0;
  const check = (cond, label) => {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`);
    if (!cond) failures++;
  };

  const { mapControlsRight, viewportClassFor, BP } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'design', 'breakpoints.ts')).href
  );

  console.log('\n[1] Drawer offset at the lg edge (1024px)');
  check(BP.lg === 1024, 'BP.lg is 1024 (matches the Tailwind lg screen)');
  check(viewportClassFor(1023) === 'md', '1023px classifies as md (drawer is a bottom sheet)');
  check(viewportClassFor(1024) === 'lg', '1024px classifies as lg (drawer docks beside the map)');
  check(
    mapControlsRight(true, viewportClassFor(1023)) === '16px',
    '1023px + open drawer → controls keep the 16px inset'
  );
  check(
    mapControlsRight(true, viewportClassFor(1024)) === '384px',
    '1024px + open drawer → controls honour the 384px drawer offset'
  );
  check(
    mapControlsRight(false, viewportClassFor(1024)) === '16px',
    '1024px + closed drawer → 16px inset'
  );
  check(
    mapControlsRight(true, viewportClassFor(1440)) === '384px',
    'xl + open drawer → 384px offset'
  );
  check(
    mapControlsRight(true, viewportClassFor(768)) === '16px',
    'md + open drawer → 16px inset (bottom-sheet drawer never insets the map)'
  );

  console.log('\n[2] Stylesheet carries no !important override for the anchor');
  const css = fs.readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8');
  check(
    /\.map-controls-anchor\s*\{[^}]*right:\s*var\(--map-controls-right/.test(css),
    '.map-controls-anchor reads the --map-controls-right custom property'
  );

  // Parse every `selector { body }` rule: no rule whose selector targets
  // .map-controls-anchor may carry !important in its body.
  const anchorRules = [...css.matchAll(/([^{}]*)\{([^}]*)\}/g)].filter(([, sel]) =>
    sel.includes('map-controls-anchor')
  );
  check(
    anchorRules.length > 0 && anchorRules.every(([, , body]) => !body.includes('!important')),
    `no !important inside any .map-controls-anchor rule (${anchorRules.length} rule(s))`
  );

  console.log('\n[3] App derives the offset from the live viewport class');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'App.tsx'), 'utf8');
  check(
    /--map-controls-right':\s*mapControlsRight\(isDrawerOpen,\s*viewportClass\)/.test(appSrc),
    'App sets --map-controls-right from mapControlsRight(isDrawerOpen, viewportClass)'
  );
  check(/const viewportClass = useViewportClass\(\)/.test(appSrc), 'App reads the live viewport class');

  console.log(
    `\n=== map-controls offset tests: ${failures === 0 ? 'all passed' : `${failures} failed`} ===`
  );
  process.exit(failures === 0 ? 0 : 1);
})();
