#!/usr/bin/env node
/**
 * The retired brand domain must not appear in application code (WEB-SEO-023).
 *
 * SEO-006 was marked done and the JSON-LD said otherwise. 26 references to the
 * old domain survived, and the ones that mattered were the machine-read ones:
 * `@id` on ~480 restaurant pages, `hasMenu.url` on each of them, and a `sameAs`
 * array in five components. `@id` is how a crawler reconciles one entity across
 * pages, so pointing it at another origin does not produce a broken link -- it
 * produces a different entity. `sameAs` is an identity claim about accounts the
 * brand does not own.
 *
 * Three of the survivors were not SEO at all: a Stripe customer-portal
 * return_url fallback, the billing address printed on every invoice, and the
 * default site name an admin sees before any setting is saved.
 *
 * WHAT THIS DOES NOT COVER: redirects. A redirect from the old domain is the
 * correct place for it to appear, so files under a redirects path are skipped.
 *
 * OFFLINE. No database, no network.
 *
 *   node scripts/check-brand-leak.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The retired brand as an ADDRESS: a hostname, a social-profile path, or an
 * @handle.
 *
 * Not the bare word. supabase/functions/ingest-events reads an environment
 * variable named SUPABASE_SERVICE_ROLE_KEY_DESMOINESPULSE, which is the
 * upstream hub's name for a credential and is not ours to rename -- matching on
 * the bare word would fail the build on a name we do not control, and the
 * usual response to that is to delete the check.
 */
const LEAK = /desmoinespulse\.com|\/desmoinespulse\b|@desmoinespulse\b/i;

const SCAN_ROOTS = ['src', 'supabase/functions'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__tests__', '_tests']);
const SKIP_FILE = /redirects?/i;
const EXTS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      yield* walk(full);
    } else if (EXTS.test(name) && !SKIP_FILE.test(name)) {
      yield full;
    }
  }
}

const hits = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (LEAK.test(line)) {
        hits.push({ file: relative(ROOT, file), line: i + 1, text: line.trim().slice(0, 120) });
      }
    });
  }
}

if (hits.length > 0) {
  console.error(`\n✗ ${hits.length} reference(s) to the retired brand domain:\n`);
  for (const h of hits) console.error(`    ${h.file}:${h.line}\n        ${h.text}`);
  console.error(
    '\nUse BRAND / getCanonicalUrl from src/lib/brandConfig.ts. If this is a\n' +
      'deliberate redirect FROM the old domain, put it in a file whose name says so.\n',
  );
  process.exit(1);
}

console.log('✅ Brand: no references to the retired domain in src/ or supabase/functions/.');
