#!/usr/bin/env node
/**
 * lint_emoji.cjs — UI glyph gate.
 * =====================================================================
 * The product UI must not render emoji, dingbats, or look-alike unicode
 * icons (⊕ ✎ ⏎  ✓ ↺ ⌫ ⌘): every affordance is a lucide/design-system SVG or
 * an ASCII word. This gate scans every frontend source file and fails the
 * build when a glyph from a banned code-point range reaches RENDERED text.
 *
 * Scope and intent
 * ----------------
 * - Comments are documentation, not UI: `→` in a code comment is fine and is
 *   reported as "ignored" so the exemption stays visible (never silent).
 * - String literals and JSX text are RENDERED (or renderable) copy: banned.
 * - Keycap glyphs therefore have no exemption — the app renders "Ctrl+Z",
 *   "Enter", "Esc", "Tab", "Backspace" as plain words inside <kbd>.
 *
 * Banned ranges — everywhere (any rendered string in the app):
 *   U+1F300-U+1FAFF  emoji pictographs
 *   U+2600-U+27BF    miscellaneous symbols & dingbats (✓ ✎ ⊕ …)
 *   U+FE0F           variation selector-16 (emoji presentation)
 *
 * Banned additionally in the TRACING UI only (src/components/map/**,
 * src/components/Icon.tsx) — every affordance there is an SVG + a word:
 *   U+2190-U+21FF    arrows (→ ↺ ↻)
 *   U+2300-U+23FF    technical symbols (⌘ ⌫ ⏎)
 *   U+2B00-U+2BFF    extra arrows & shapes
 *
 * A typographic arrow in a formula or doc string OUTSIDE the tracing UI is
 * allowed (and only inside comments inside it).
 *
 * Usage:
 *   node scripts/lint_emoji.cjs          # gate (exit 1 on any violation)
 *   node scripts/lint_emoji.cjs --json   # machine-readable report
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/* Emoji / dingbat blocks — banned in RENDERED text anywhere in the app. */
const EMOJI = [
  [0x1f300, 0x1faff, 'emoji pictographs'],
  [0x2600, 0x27bf, 'misc symbols / dingbats'],
  [0xfe0f, 0xfe0f, 'variation selector-16'],
];

/* Symbol blocks that only ever appear as faux-icons. Banned in RENDERED text
   of the tracing UI, where every affordance must be a real SVG + a word.
   Documentation copy elsewhere may still use a typographic arrow (e.g. a
   formula "NDVI = ... -> Canopy Mask"). */
const GLYPH = [
  [0x2190, 0x21ff, 'unicode arrows'],
  [0x2300, 0x23ff, 'technical symbols'],
  [0x2b00, 0x2bff, 'extra arrows / shapes'],
];

/** Files that own the map-tracing surface: held to the strict glyph rule. */
const TRACING_FILES = [/(^|[\\/])components[\\/]map[\\/]/, /(^|[\\/])components[\\/]Icon\.tsx$/];

function isTracingUi(relPath) {
  return TRACING_FILES.some((re) => re.test(relPath));
}

function bannedReason(cp, strict) {
  for (const [lo, hi, why] of strict ? EMOJI.concat(GLYPH) : EMOJI) {
    if (cp >= lo && cp <= hi) return why;
  }
  return null;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) yield p;
  }
}

/**
 * Walk one file, marking which character offsets sit inside a comment.
 * A `'` / `"` string cannot span a line in JS/TS, so the quote state is
 * reset at end-of-line — that keeps apostrophes in JSX prose ("don't") from
 * swallowing the rest of the file. Template literals can span lines.
 */
function scanFile(file, relPath) {
  const strict = isTracingUi(relPath);
  const text = fs.readFileSync(file, 'utf8');
  const violations = [];
  const ignored = [];
  let inBlock = false;

  text.split(/\r?\n/).forEach((line, i) => {
    let inQuote = null; // "'" | '"' | '`'
    let inLineComment = false;

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const next = line[c + 1];

      if (inBlock) {
        if (ch === '*' && next === '/') { inBlock = false; c++; continue; }
        const cp = line.codePointAt(c);
        if (bannedReason(cp, strict)) ignored.push({ file, line: i + 1, cp });
        if (cp > 0xffff) c++;
        continue; // comment body — documentation, never rendered
      }
      if (inLineComment) {
        const cp = line.codePointAt(c);
        if (bannedReason(cp, strict)) ignored.push({ file, line: i + 1, cp });
        if (cp > 0xffff) c++;
        continue;
      }
      if (inQuote) {
        // Strings ARE rendered copy: they still get the range check.
        const cp = line.codePointAt(c);
        const why = bannedReason(cp, strict);
        if (why) {
          violations.push({ file, line: i + 1, cp, why, text: line.trim().slice(0, 120), inString: true });
        }
        if (line[c] === '\\') { c += 1; continue; } // skip the escaped char
        const width = cp > 0xffff ? 2 : 1;
        if (width === 1 && line[c] === inQuote) inQuote = null;
        c += width - 1;
        continue;
      }

      if (ch === '/' && next === '/') { inLineComment = true; c++; continue; }
      if (ch === '/' && next === '*') { inBlock = true; c++; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { inQuote = ch; continue; }

      const cp = line.codePointAt(c);
      const why = bannedReason(cp, strict);
      if (why) violations.push({ file, line: i + 1, cp, why, text: line.trim().slice(0, 120) });
      if (cp > 0xffff) c++;
    }
  });

  return { violations, ignored };
}

const files = [...walk(SRC)].sort();
const violations = [];
const ignored = [];
let strictFiles = 0;
for (const file of files) {
  const relPath = path.relative(ROOT, file).split(path.sep).join('/');
  if (isTracingUi(relPath)) strictFiles += 1;
  const res = scanFile(file, relPath);
  violations.push(...res.violations);
  ignored.push(...res.ignored);
}

const glyph = (cp) => String.fromCodePoint(cp);
const hex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ files: files.length, strictFiles, violations, ignored }, null, 2));
} else {
  for (const v of violations) {
    console.log(
      `  FAIL ${path.relative(ROOT, v.file).split(path.sep).join('/')}:${v.line}  ` +
        `${hex(v.cp)} ${glyph(v.cp)}  [${v.why}]  "${v.text}"`
    );
  }
  const note = ignored.length
    ? ` (${ignored.length} glyph${ignored.length === 1 ? '' : 's'} inside comments ignored)`
    : '';
  console.log(
    violations.length === 0
      ? `emoji lint: PASS — ${files.length} files scanned (${strictFiles} tracing-UI files held to the strict glyph rule), 0 banned glyphs in rendered strings${note}`
      : `emoji lint: FAIL — ${violations.length} banned glyph(s) in rendered strings across ${files.length} files`
  );
}

process.exit(violations.length === 0 ? 0 : 1);
