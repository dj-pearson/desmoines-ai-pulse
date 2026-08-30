#!/usr/bin/env tsx
/**
 * Move existing image_url values off the supabase.co storage origin and onto
 * /media, so they are served through the Cloudflare edge cache (WEB-OPS-023).
 *
 *   npx tsx scripts/repoint-media-urls.ts                 # DRY RUN, the default
 *   npx tsx scripts/repoint-media-urls.ts --apply
 *   npx tsx scripts/repoint-media-urls.ts --table events
 *   npx tsx scripts/repoint-media-urls.ts --revert --apply # put them all back
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and MEDIA_CDN_BASE.
 *
 * ── THIS IS A COST CHANGE, NOT A CORRECTNESS FIX ──────────────────────────────
 *
 * Both URL forms resolve. A row left on supabase.co still works - it just costs
 * egress on every view. So there is no hurry, nothing breaks if it is run
 * halfway, and --revert exists because a rewrite you cannot undo is a rewrite
 * nobody should run first.
 *
 * ── ORDER MATTERS ─────────────────────────────────────────────────────────────
 *
 * Deploy functions/media/[[path]].ts and confirm one image loads through it
 * BEFORE running this. Rewriting a thousand rows to a route that 404s is a
 * thousand broken images, and the fact that it is reversible is not much comfort
 * while it is happening. The dry run prints a sample URL for exactly that check.
 *
 * ── SCOPE ─────────────────────────────────────────────────────────────────────
 *
 * Only rewrites URLs that start with the project's own storage prefix. An
 * externally hosted image_url - a hot-linked venue photo that was never stored -
 * is left alone, because /media cannot serve what is not in the bucket.
 *
 * ── UNVERIFIED AGAINST A REAL DATABASE ────────────────────────────────────────
 *
 * The rewrite and its inverse are unit-tested offline in
 * scripts/__tests__/repoint-media-urls.test.mjs. The database calls are not -
 * this container has no Supabase credentials and no route to one.
 */
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const REVERT = process.argv.includes('--revert');
const TABLE_FILTER = (() => {
  const i = process.argv.indexOf('--table');
  return i !== -1 ? process.argv[i + 1] : null;
})();

/** Every content table imageStorage writes an image_url into. */
const TABLES = ['events', 'restaurants', 'attractions', 'playgrounds'] as const;

export function storagePrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/media/`;
}

export function cdnPrefix(cdnBase: string): string {
  return `${cdnBase.replace(/\/+$/, '')}/media/`;
}

/**
 * The rewrite, and its inverse. Returns null when the URL is not ours to touch -
 * an external image, an already-converted one, or an empty value.
 */
export function rewrite(
  url: string | null,
  from: string,
  to: string,
): string | null {
  if (!url || !url.startsWith(from)) return null;
  const next = to + url.slice(from.length);
  return next === url ? null : next;
}

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  return createClient(url, key);
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const cdnBase = process.env.MEDIA_CDN_BASE;
  if (!cdnBase) {
    console.error('Set MEDIA_CDN_BASE (e.g. https://desmoinesinsider.com).');
    console.error('It must match what the edge functions use, or new writes and');
    console.error('rewritten rows will disagree about where images live.');
    process.exit(1);
  }
  const supabase = client();

  const from = REVERT ? cdnPrefix(cdnBase) : storagePrefix(supabaseUrl);
  const to = REVERT ? storagePrefix(supabaseUrl) : cdnPrefix(cdnBase);

  console.log(APPLY ? '=== APPLY ===' : '=== DRY RUN (nothing will change) ===');
  console.log(`  ${from}`);
  console.log(`    -> ${to}\n`);

  let totalChanged = 0;
  let sample: string | null = null;

  for (const table of TABLES) {
    if (TABLE_FILTER && table !== TABLE_FILTER) continue;

    const { data, error } = await supabase
      .from(table)
      .select('id, image_url')
      .like('image_url', `${from}%`);
    if (error) {
      // Not fatal: a table that does not exist in this environment should not
      // stop the ones that do. Named, because a silent skip here would look
      // like "that table had nothing to move".
      console.error(`  ! ${table}: read failed, skipping - ${error.message}`);
      continue;
    }

    const rows = (data ?? []) as { id: string; image_url: string | null }[];
    const changes = rows
      .map((r) => ({ id: r.id, next: rewrite(r.image_url, from, to) }))
      .filter((c): c is { id: string; next: string } => c.next !== null);

    console.log(`  ${String(changes.length).padStart(6)}  ${table}`);
    if (!sample && changes.length) sample = changes[0].next;
    totalChanged += changes.length;

    if (!APPLY) continue;

    let done = 0;
    for (const c of changes) {
      const { error: updateError } = await supabase
        .from(table)
        .update({ image_url: c.next })
        .eq('id', c.id);
      if (updateError) {
        console.error(`    ! ${table}/${c.id}: ${updateError.message}`);
        continue;
      }
      done++;
    }
    console.log(`          ${done}/${changes.length} updated`);
  }

  console.log(`\n${totalChanged} row(s) ${APPLY ? 'rewritten' : 'would be rewritten'}.`);

  if (!APPLY && sample) {
    console.log('\nBefore running with --apply, confirm the route actually serves:');
    console.log(`\n  curl -sSI "${sample}" | head -20\n`);
    console.log('Expect 200 and X-Media-Origin: supabase-storage. If that 404s, the');
    console.log('Pages Function is not deployed and this would break every image.');
  }
}

// Only when run directly - the rewrite helpers above are imported by the test.
if (process.argv[1] && process.argv[1].endsWith('repoint-media-urls.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
