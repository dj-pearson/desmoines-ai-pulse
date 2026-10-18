#!/usr/bin/env node
/**
 * No two files may export a hook of the same name.
 *
 * WHY THIS IS WORTH A CHECK. A collision is invisible at every call site: the
 * import looks right, the name reads right, and which implementation you get is
 * decided by the import PATH. One exists in src/hooks today and is live, the
 * two halves reading different data. (useUserPreferences ended when the
 * unimported use-user-preferences.ts was deleted, 2026-09; useTrending ended
 * when useTrendingContent.ts's copy was renamed to useTrendingContent and
 * moved onto TanStack Query, 2026-10.)
 *
 *   useRestaurantOpenings  useSupabase.ts reads `restaurants` (and is what the
 *                          public RestaurantOpenings.tsx renders from);
 *                          useRestaurantOpenings.ts reads `restaurant_openings`
 *                          (and is what AdminContent.tsx manages). WEB-BE-054
 *                          is the decision about which table wins.
 *
 * That one needs a product decision, so it is ALLOWED here by name with the
 * reason attached. What this stops is a SECOND, which is cheap to add by
 * accident and expensive to find: the useRestaurantOpenings pair cost most of
 * an iteration to untangle, and the conclusion drawn before finding it was
 * wrong.
 *
 * Usage: node scripts/check-hook-name-collisions.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Collisions that exist, each with the story that resolves it. */
const ALLOWED = new Map([
  ['useRestaurantOpenings', 'WEB-BE-054 decides which table openings live in'],
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Strip comments first. This file's subject is hook names, and the codebase
 * discusses them in prose constantly - useSupabase.ts's own header names
 * useRestaurantOpenings in a sentence about what remains in the file.
 */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '');
}

const byName = new Map();
for (const file of walk('src')) {
  if (file.includes('__tests__')) continue;
  const code = codeOnly(readFileSync(file, 'utf8'));
  const names = [
    ...[...code.matchAll(/export\s+(?:async\s+)?function\s+(use[A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]),
    ...[...code.matchAll(/export\s+const\s+(use[A-Z][A-Za-z0-9_]*)\s*[=:]/g)].map((m) => m[1]),
  ];
  for (const name of names) {
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name).add(file.replace(/\\/g, '/'));
  }
}

const collisions = [...byName.entries()].filter(([, files]) => files.size > 1);
const unexpected = collisions.filter(([name]) => !ALLOWED.has(name));
const resolved = [...ALLOWED.keys()].filter(
  (name) => !collisions.some(([n]) => n === name),
);

let failed = false;

if (unexpected.length > 0) {
  failed = true;
  console.error(`\nX ${unexpected.length} hook name(s) exported from more than one file:\n`);
  for (const [name, files] of unexpected) {
    console.error(`  ${name}`);
    for (const f of files) console.error(`      ${f}`);
  }
  console.error(
    '\nWhich implementation a caller gets is decided by the import path, and every\n' +
      'call site looks correct in isolation. Rename one, or merge them.\n',
  );
}

if (resolved.length > 0) {
  // Not a failure, but the allowlist must not outlive the collisions - a stale
  // entry here would hide a genuine new collision under the same name.
  failed = true;
  console.error(
    `\nX ${resolved.join(', ')} no longer collide(s). Remove the entry from ALLOWED ` +
      'in this script, or a future collision under that name passes silently.\n',
  );
}

if (failed) process.exit(1);

console.log(
  `[hook-names] ${byName.size} exported hook(s); ${collisions.length} known collision(s), no new ones.`,
);
