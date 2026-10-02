#!/usr/bin/env node
/**
 * lint_tokens.cjs — design-token consumption gate.
 * =========================================================
 * Global rule: all UI consumes design tokens (src/design). Ad-hoc hex colors,
 * shadows, off-scale durations and `transition-all` in component code are
 * flagged. Legacy files carry a pinned baseline (count of pre-existing
 * violations); ANY file exceeding its baseline fails the build, so new code
 * can never add violations and cleanups shrink the baseline over time.
 *
 * Usage:
 *   node scripts/lint_tokens.cjs            # gate (exit 1 on regression)
 *   node scripts/lint_tokens.cjs --update   # regenerate baseline (after cleanup)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(__dirname, 'token-lint-baseline.json');

// Files that ARE the design system (allowed to hold raw values).
const ALLOWLIST = [
  path.join(SRC, 'design', 'tokens.ts'),
  path.join(SRC, 'design', 'primitives.tsx'),
  path.join(SRC, 'design', 'index.ts'),
];

const RULES = [
  {
    id: 'hex-color',
    // #rgb / #rrggbb literals (deliberately not #rrggbbaa-only usages inside var(...) defs)
    pattern: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g,
    hint: 'use a token (var(--...) or design/tokens)',
  },
  {
    id: 'transition-all',
    pattern: /transition-all\b/g,
    hint: 'transitions must list paint-safe properties (use ui() / transition-ui)',
  },
  {
    id: 'off-scale-duration',
    // duration-* outside the token scale {100,150,200,250}
    pattern: /duration-(?!100\b|150\b|200\b|250\b)\d+/g,
    hint: 'use durations 100/150/200/250 (tokens MOTION)',
  },
  {
    id: 'arbitrary-shadow',
    pattern: /shadow-\[[^\]]+\]/g,
    hint: 'use the token shadow scale (var(--shadow))',
  },
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) yield p;
  }
}

/** Relative path key, normalized to posix. */
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const violations = new Map(); // file -> { ruleId -> count }

for (const file of walk(SRC)) {
  if (ALLOWLIST.some((a) => path.resolve(file) === a)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of RULES) {
    const matches = text.match(rule.pattern);
    if (!matches || matches.length === 0) continue;
    const key = rel(file);
    if (!violations.has(key)) violations.set(key, {});
    const entry = violations.get(key);
    entry[rule.id] = (entry[rule.id] || 0) + matches.length;
  }
}

if (process.argv.includes('--update')) {
  const baseline = {};
  for (const [file, rules] of [...violations.entries()].sort()) baseline[file] = rules;
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`token-lint baseline updated: ${Object.keys(baseline).length} files`);
  process.exit(0);
}

let baseline = {};
if (fs.existsSync(BASELINE_PATH)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

let regressions = 0;
let improvements = 0;
const report = [];

for (const [file, rules] of [...violations.entries()].sort()) {
  const allowed = baseline[file] || {};
  for (const ruleId of Object.keys(rules)) {
    const rule = RULES.find((r) => r.id === ruleId);
    const count = rules[ruleId];
    const base = allowed[ruleId] || 0;
    if (count > base) {
      regressions += count - base;
      report.push(`  FAIL ${file} [${ruleId}]: ${count} (baseline ${base}) — ${rule.hint}`);
    } else if (count < base) {
      improvements += base - count;
      report.push(`  ok   ${file} [${ruleId}]: ${count} (baseline ${base}) — shrink baseline with --update`);
    }
  }
}

// Baseline entries whose files vanished (renames/deletes) are stale.
for (const file of Object.keys(baseline)) {
  if (!violations.has(file)) {
    improvements += Object.values(baseline[file]).reduce((a, b) => a + b, 0);
    report.push(`  ok   ${file}: no violations remaining (baseline entry removable via --update)`);
  }
}

console.log('=== Token consumption lint (design system gate) ===');
if (report.length) console.log(report.join('\n'));
if (regressions > 0) {
  console.log(`\nRESULT: FAIL — ${regressions} new token violation(s). New/changed UI must consume src/design tokens.`);
  process.exit(1);
}
console.log(`\nRESULT: PASS — no new token violations (${improvements} improvement(s) pending baseline refresh).`);
