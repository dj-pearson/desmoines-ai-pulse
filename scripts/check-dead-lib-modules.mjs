/**
 * Modules in src/lib/ that nothing imports (WEB-PERF-007, WEB-FEAT-006).
 *
 * WHY THIS IS NOT TIDINESS. Four of the fourteen found on the first run are DEAD
 * TWINS of a live feature - a second implementation of the same thing, writing
 * the same table, that no longer runs:
 *
 *   conversionTracking      twin of favoriteAnalytics    (checks its error; the live one did not)
 *   webVitalsRum            twin of webVitals            (both write web_vitals)
 *   sponsoredTracking       twin of lib/sponsored
 *   guestFavoriteMigration  twin of hooks/useGuestFavoriteMigration
 *
 * Two of those cost real time on 2026-08-24. The funnel bug was hard to see
 * because the better-written copy was the dead one, so reading it gave a false
 * sense that errors were handled. And EventCard rendering expired sponsorships
 * happened because a helper existed, one caller used it, and the other kept its
 * own inline copy - the same shape one step earlier.
 *
 * A dead twin is worse than dead code. It answers the question "is this handled?"
 * with yes, about a file that does not execute.
 *
 * DETECTION counts static `from "..."`, dynamic `import("...")` and re-exports.
 * Dynamic imports matter: src/lib/webVitals is loaded only as
 * `import("@/lib/webVitals")` from main.tsx, and a static-only scan calls it dead.
 * That was a false positive in the first version of this script, caught by
 * knowing the module is live.
 *
 * BASELINED, and the existing fourteen are NOT failures - deleting them is a call
 * for whoever knows why each was written, and sitemapGenerator for one is still
 * referenced by a progress note. A NEW unimported module fails, because that is
 * the moment someone has just replaced something and left the old copy behind.
 *
 *   node scripts/check-dead-lib-modules.mjs           # check
 *   node scripts/check-dead-lib-modules.mjs --write   # re-baseline
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'src', 'lib');
const BASELINE = join(ROOT, '.github', 'dead-lib-baseline.json');

if (!existsSync(LIB)) {
  console.error('[dead-lib] src/lib is missing - refusing to pass.');
  process.exit(1);
}

const modules = readdirSync(LIB)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  .map((f) => f.slice(0, -3));

function sources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

const files = sources(join(ROOT, 'src'));
if (files.length === 0) {
  console.error('[dead-lib] no sources found - refusing to pass.');
  process.exit(1);
}
const blobs = files.map((p) => [p, readFileSync(p, 'utf8')]);

const dead = modules.filter((m) => {
  // `from "@/lib/m"`, `import("@/lib/m")`, `export ... from "./m"`. The module's
  // own file and its test are excluded by basename.
  const pattern = new RegExp(
    String.raw`(?:from|import)\s*\(?\s*["'][^"']*[/"']${m}["']`,
  );
  return !blobs.some(([p, b]) => basename(p).slice(0, -3) !== m && pattern.test(b));
});

if (process.argv.includes('--write')) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _comment:
          'Modules in src/lib nothing imports. Several are dead TWINS of a live feature - see the script header. Do not add to this list to make CI pass; delete the module or wire it up.',
        modules: dead.sort(),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[dead-lib] wrote ${dead.length} baselined module(s).`);
  process.exit(0);
}

const known = new Set(existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).modules : []);
const fresh = dead.filter((m) => !known.has(m));

console.log(
  `[dead-lib] ${modules.length} module(s) in src/lib, ${dead.length} imported by nothing (${known.size} baselined).`,
);
for (const m of dead) console.log(`  ${known.has(m) ? 'known' : 'NEW  '}  src/lib/${m}.ts`);

if (fresh.length > 0) {
  console.error(
    `\nX ${fresh.length} module(s) in src/lib are imported by nothing:\n` +
      fresh.map((m) => `    src/lib/${m}.ts`).join('\n') +
      '\n\n  A new one usually means a replacement was written and the old copy left\n' +
      '  behind. That copy still reads as the implementation, so the next person to\n' +
      '  ask "is this handled?" gets yes from a file that does not run. Delete it or\n' +
      '  wire it up.\n',
  );
  process.exit(1);
}

console.log('\nOK No new unimported module in src/lib.');
process.exit(0);
