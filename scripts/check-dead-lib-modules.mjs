/**
 * Modules in src/lib and src/hooks that production code does not import
 * (WEB-PERF-007, WEB-FEAT-006, WEB-UX-001).
 *
 * WHY THIS IS NOT TIDINESS. Several are DEAD TWINS of a live feature - a second
 * implementation of the same thing that no longer runs:
 *
 *   conversionTracking      twin of favoriteAnalytics   (checks its error; the live one did not)
 *   webVitalsRum            twin of webVitals           (both write web_vitals)
 *   sponsoredTracking       twin of lib/sponsored
 *   guestFavoriteMigration  twin of hooks/useGuestFavoriteMigration
 *   useUrlFilterState       twin of useUrlFilters       (all three list pages use the other)
 *
 * A dead twin is worse than dead code: it answers "is this handled?" with yes,
 * about a file that does not execute. The favourites-funnel bug on 2026-08-24 was
 * hard to see for exactly that reason - the better-written copy was the dead one.
 *
 * TWO CATEGORIES, because they mislead differently:
 *   unimported  nothing references it at all.
 *   test-only   ONLY a test imports it. Worse, because the suite is green on code
 *               nothing runs, so CI and coverage both report it healthy.
 *
 * DETECTION is a plain scan for quoted module specifiers - `from "..."`,
 * `import("...")`, re-exports - comparing the LAST path segment to the module
 * name. Dynamic imports must count: src/lib/webVitals is only ever loaded as
 * import("@/lib/webVitals") from main.tsx, and a static-only scan calls it dead.
 *
 * THIS SCRIPT SHIPPED WITH TWO BLIND SPOTS OF ITS OWN, both found within an hour
 * and both fixed here: it filtered on `.ts` so src/lib/csrf.tsx was invisible, and
 * it counted a test file as an importer, so the test-only category did not exist.
 * A check that prints OK while skipping cases is the failure this repo collects.
 *
 * BASELINED. Existing entries are not failures - deleting each is a call for
 * whoever knows why it was written. A NEW one fails: that is the moment someone
 * replaced something and left the old copy behind.
 *
 *   node scripts/check-dead-lib-modules.mjs           # check
 *   node scripts/check-dead-lib-modules.mjs --write   # re-baseline
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = [join(ROOT, 'src', 'lib'), join(ROOT, 'src', 'hooks')];
const BASELINE = join(ROOT, '.github', 'dead-lib-baseline.json');

for (const dir of ROOTS) {
  if (!existsSync(dir)) {
    console.error('[dead-lib] ' + dir + ' is missing - refusing to pass.');
    process.exit(1);
  }
}

const BACKSLASH = String.fromCharCode(92);
const slash = (p) => p.split(BACKSLASH).join('/');
const isTest = (p) => {
  const q = slash(p);
  return q.includes('__tests__') || q.includes('.test.') || q.includes('.spec.');
};
const stem = (f) => (f.endsWith('.tsx') ? f.slice(0, -4) : f.slice(0, -3));

const modules = ROOTS.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('.d.ts') && !isTest(f))
    .map((f) => ({ name: stem(f), label: slash(dir.slice(ROOT.length + 1)) + '/' + f })),
);

function sources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(path);
  }
  return out;
}

const files = sources(join(ROOT, 'src'));
if (files.length === 0) {
  console.error('[dead-lib] no sources found - refusing to pass.');
  process.exit(1);
}

const SINGLE = String.fromCharCode(39);
const DOUBLE = String.fromCharCode(34);

/**
 * Last path segment of every quoted module specifier in a file.
 *
 * Scans for the keyword, then requires only whitespace or an opening paren
 * between it and the quote, so `fromCharCode(` and similar near-misses do not
 * register as imports.
 */
function importedNames(text) {
  const names = new Set();
  for (const marker of ['from', 'import', 'require']) {
    let at = text.indexOf(marker);
    while (at !== -1) {
      const rest = text.slice(at + marker.length, at + marker.length + 300);
      let i = 0;
      while (i < rest.length && (rest[i] === ' ' || rest[i] === '(' || rest[i] === '\n' || rest[i] === '\r' || rest[i] === '\t')) {
        i += 1;
      }
      const quote = rest[i];
      if (quote === SINGLE || quote === DOUBLE) {
        const end = rest.indexOf(quote, i + 1);
        if (end !== -1) {
          const segment = rest.slice(i + 1, end).split('/').pop();
          if (segment) {
            names.add(
              segment.endsWith('.tsx')
                ? segment.slice(0, -4)
                : segment.endsWith('.ts')
                  ? segment.slice(0, -3)
                  : segment,
            );
          }
        }
      }
      at = text.indexOf(marker, at + 1);
    }
  }
  return names;
}

const scanned = files.map((p) => ({
  path: slash(p),
  test: isTest(p),
  names: importedNames(readFileSync(p, 'utf8')),
}));

const unimported = [];
const testOnly = [];
for (const mod of modules) {
  let prod = 0;
  let tests = 0;
  for (const file of scanned) {
    if (file.path.endsWith('/' + mod.label)) continue; // the module's own file
    if (!file.names.has(mod.name)) continue;
    if (file.test) tests += 1;
    else prod += 1;
  }
  if (prod === 0 && tests === 0) unimported.push(mod.label);
  else if (prod === 0) testOnly.push(mod.label);
}

if (process.argv.includes('--write')) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment:
          'Modules production code does not import. Several are dead TWINS of a live feature - see the script header. testOnly is worse than unimported: the suite is green on code nothing runs. Do not add entries to make CI pass; delete the module or wire it up.',
        unimported: unimported.sort(),
        testOnly: testOnly.sort(),
      },
      null,
      2,
    ) + '\n',
  );
  console.log('[dead-lib] wrote ' + unimported.length + ' unimported, ' + testOnly.length + ' test-only.');
  process.exit(0);
}

const saved = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const knownUnimported = new Set(saved.unimported || []);
const knownTestOnly = new Set(saved.testOnly || []);
const freshUnimported = unimported.filter((m) => !knownUnimported.has(m));
const freshTestOnly = testOnly.filter((m) => !knownTestOnly.has(m));

console.log(
  '[dead-lib] ' +
    modules.length +
    ' module(s) in src/lib + src/hooks; ' +
    unimported.length +
    ' imported by nothing, ' +
    testOnly.length +
    ' imported only by tests.',
);
for (const m of testOnly) console.log('  ' + (knownTestOnly.has(m) ? 'known' : 'NEW  ') + '  test-only   ' + m);
for (const m of unimported) console.log('  ' + (knownUnimported.has(m) ? 'known' : 'NEW  ') + '  unimported  ' + m);

if (freshUnimported.length + freshTestOnly.length > 0) {
  console.error('');
  for (const m of freshTestOnly) {
    console.error('X ' + m + ' is imported ONLY by a test.');
    console.error('  The suite passes on code nothing runs, so CI and coverage both call it healthy.');
  }
  for (const m of freshUnimported) console.error('X ' + m + ' is imported by nothing.');
  console.error('');
  console.error('  A new one usually means a replacement was written and the old copy left');
  console.error('  behind. That copy still reads as the implementation, so the next person to');
  console.error('  ask "is this handled?" gets yes from a file that does not run.');
  process.exit(1);
}

console.log('');
console.log('OK Every module in src/lib and src/hooks is imported by production code.');
process.exit(0);
