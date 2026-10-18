/**
 * css_orphans.cjs — do the landing's `bw-*` class rules have anything to match?
 *
 * WHY. A CSS rule for a class no element carries is the one kind of dead code
 * that is pure cost: it ships in every build, it cannot affect a pixel, and it
 * survives every refactor because deleting a component does not delete its
 * rule. The landing has been through six removed preview sections and two
 * removed 3D heroes, so this is exactly the check its stylesheet needs.
 *
 * It reads every tracked source file (plus index.html), so a class used only by
 * the static boot shell sentinel in theme/heroCopy still counts as used.
 *
 * Usage:  node scripts/css_orphans.cjs        (exit 1 if any orphan exists)
 */
const fs = require('fs');
const { execSync } = require('child_process');

/** Comments are stripped first: this file documents its own deletions by name,
    and a rule named only in a note about its removal is already gone. */
const css = fs.readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const classes = [...new Set([...css.matchAll(/\.(bw-[a-z0-9-]+)/g)].map((m) => m[1]))];

/* --cached --others: tracked files PLUS new files not yet added. Plain
   `git ls-files` lists only the index, so every component written but not yet
   staged reads as "referenced nowhere" — which is how this check first
   reported the brand-new WindowBar.tsx as dead CSS. */
const files = execSync('git ls-files --cached --others --exclude-standard src public index.html', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);
/** index.css is where the rules live; matching it against itself proves nothing. */
const haystack = files
  .filter((f) => f !== 'src/index.css')
  .map((f) => {
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return '';
    }
  })
  .join('\n');

const orphans = classes.filter((c) => !new RegExp(`(^|[^a-z0-9-])${c}([^a-z0-9-]|$)`).test(haystack));

console.log(`bw-* classes declared in src/index.css : ${classes.length}`);
console.log(`referenced by no tracked file          : ${orphans.length}`);
if (orphans.length) {
  for (const o of orphans) {
    /* Print the headers the class appears in, so the reader can see what the
       dead rule was FOR before deciding to delete it. */
    const headers = [
      ...css.matchAll(new RegExp(`(^|})\\s*([^{}]*\\.${o}\\b[^{}]*)\\{`, 'g')),
    ].map((m) => m[2].trim().replace(/\s+/g, ' '));
    console.log(`  ORPHAN  .${o}\n            selector: ${headers.join(' | ') || '(only in a comment body)'}`);
  }
  process.exit(1);
}
console.log('all rules have a consumer');
