#!/usr/bin/env tsx
/**
 * Merge the duplicate event rows check-duplicate-entities reports (WEB-SEO-017 AC2).
 *
 *   npx tsx scripts/merge-duplicate-events.ts             # DRY RUN, the default
 *   npx tsx scripts/merge-duplicate-events.ts --apply     # actually merge
 *   npx tsx scripts/merge-duplicate-events.ts --json      # machine-readable plan
 *
 * The dry run is READ-ONLY and works with VITE_SUPABASE_ANON_KEY, because
 * reading events needs nothing more. --apply needs SUPABASE_SERVICE_ROLE_KEY.
 * That split is deliberate: producing the plan should not require handing this
 * script a key that can write.
 *
 * ── WHY A SCRIPT AND NOT TEN UPDATE STATEMENTS ────────────────────────────────
 *
 * duplicate-events-baseline.json says merging "is a per-group decision", which
 * is true of the ones where the evidence conflicts and false of the ones where
 * it does not. This applies the mechanical rule to the clear groups and REFUSES
 * the ambiguous ones, so a human reads six lines instead of twenty rows.
 *
 * ── IT MARKS, IT DOES NOT DELETE ──────────────────────────────────────────────
 *
 * The loser gets is_merged = true, merged_into = <keeper id>, merged_at = now().
 * Nothing is destroyed, and the flag is already honoured everywhere that matters:
 *   useEvents.ts:60, useEventBySlug.ts:53, useHomepageStats.ts:67 and :86 all
 *   filter .neq('is_merged', true), and generate-dynamic-sitemaps.ts does now too.
 * That last one is a PREREQUISITE rather than a detail: before it, merging a row
 * would have left it in sitemap-events.xml while its detail page resolved to
 * nothing - a soft-404 with a sitemap entry pointing straight at it.
 *
 * ── THE KEEPER RULE, IN ORDER, AND WHY EACH STEP ──────────────────────────────
 *
 *  1. has an image_url            an event without one renders a placeholder
 *  2. richer description          longer enhanced/original_description
 *  3. older created_at            the row that has been discoverable longest is
 *                                 the one most likely to hold inbound links
 *
 * is_featured is deliberately NOT a criterion. It is an editorial flag rather
 * than evidence about which row is better data, and it is carried across to the
 * keeper anyway (see the field union below), so it can never be lost by merging.
 *
 * A group is AMBIGUOUS when steps 1 and 2 disagree - one row has the image and
 * the other has the better text. Those are reported and skipped, because picking
 * between them is the editorial call the baseline file was talking about.
 *
 * ── THE FIELD UNION IS THE PART THAT IS EASY TO GET WRONG ─────────────────────
 *
 * Merging must not lose data that only the loser had. Before marking it, any
 * field the keeper is missing and the loser has is copied onto the keeper:
 * image_url, price, category, source_url, the two descriptions, and is_featured
 * (OR-ed, never cleared). So "keeper" decides the URL that survives, not which
 * facts survive.
 */
import { readFileSync, existsSync } from 'node:fs';
import {
  type EventRow,
  type Decision,
  groupKey,
  decide,
} from './lib/mergeDuplicateEvents.ts';


const APPLY = process.argv.includes('--apply');
const JSON_OUT = process.argv.includes('--json');

/** Reads a key from the environment, falling back to .env. */
function env(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!existsSync('.env')) return undefined;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && line.slice(0, i).trim() === key) {
      return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return undefined;
}

const URL_BASE = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
// A write needs the service role. A dry run does not, and demanding one would
// mean nobody can produce the plan without holding a key that can destroy data.
const KEY = APPLY
  ? env('SUPABASE_SERVICE_ROLE_KEY')
  : (env('VITE_SUPABASE_ANON_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY'));

if (!URL_BASE || !KEY) {
  console.error(
    APPLY
      ? 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to --apply.'
      : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or the service role key).',
  );
  process.exit(1);
}

const COLUMNS =
  'id,title,date,venue,image_url,enhanced_description,original_description,source,source_url,price,category,is_featured,is_merged,created_at';

async function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

/** Every event row, paged. PostgREST caps a response at 1000. */
async function fetchAllEvents(): Promise<EventRow[]> {
  const rows: EventRow[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await rest(`events?select=${COLUMNS}&order=id`, {
      headers: { Range: `${from}-${from + 999}` },
    });
    const body = await res.json();
    // A NON-ARRAY BODY IS AN ERROR OBJECT, NOT AN EMPTY PAGE. Treating it as
    // "no more rows" is how a 42703 on one column turns into "0 duplicates
    // found" and a clean bill of health - which is exactly what happened while
    // writing this, because events has no `description` column.
    if (!Array.isArray(body)) {
      throw new Error(`events read failed: ${JSON.stringify(body).slice(0, 300)}`);
    }
    rows.push(...body);
    if (body.length < 1000) break;
  }
  return rows;
}

async function main() {
  const rows = await fetchAllEvents();
  if (rows.length === 0) throw new Error('zero events read - refusing to report "no duplicates"');

  const groups = new Map<string, EventRow[]>();
  for (const row of rows) {
    if (row.is_merged) continue; // already merged, not a duplicate any more
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const decisions = [...groups.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([k, v]) => decide(k, v));

  if (JSON_OUT) {
    console.log(JSON.stringify(decisions, null, 2));
    return;
  }

  console.log(`[merge-events] ${rows.length} event(s) read, ${decisions.length} duplicate group(s).`);
  if (decisions.length === 0) {
    console.log('Nothing to merge.');
    return;
  }

  const clear = decisions.filter((d) => !d.ambiguous);
  const ambiguous = decisions.filter((d) => d.ambiguous);

  for (const d of decisions) {
    console.log(`\n${d.ambiguous ? 'SKIP  ' : 'MERGE '} ${d.title}`);
    console.log(`        ${d.date}  |  ${d.venue}`);
    console.log(`        keep   ${d.keeper.id}  (${d.reason})`);
    for (const l of d.losers) {
      console.log(`        merge  ${l.id}  -> is_merged, merged_into=${d.keeper.id.slice(0, 8)}...`);
    }
    if (Object.keys(d.fill).length) {
      console.log(`        carry over to the keeper: ${Object.keys(d.fill).join(', ')}`);
    }
  }

  console.log(
    `\n${clear.length} group(s) decidable by the rule, ${ambiguous.length} need a human.`,
  );

  if (!APPLY) {
    console.log('\nDRY RUN - nothing was changed. Re-run with --apply (needs SUPABASE_SERVICE_ROLE_KEY).');
    return;
  }

  for (const d of clear) {
    if (Object.keys(d.fill).length) {
      const res = await rest(`events?id=eq.${d.keeper.id}`, {
        method: 'PATCH',
        body: JSON.stringify(d.fill),
      });
      if (!res.ok) throw new Error(`keeper update failed for ${d.keeper.id}: ${await res.text()}`);
    }
    for (const l of d.losers) {
      const res = await rest(`events?id=eq.${l.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_merged: true,
          merged_into: d.keeper.id,
          merged_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`loser update failed for ${l.id}: ${await res.text()}`);
    }
    console.log(`merged ${d.losers.length} row(s) into ${d.keeper.id}`);
  }
  console.log(
    `\nDone. Re-run npm run generate-sitemaps so the merged URLs leave sitemap-events.xml, ` +
      `and npx tsx scripts/check-duplicate-entities.ts to shrink duplicate-events-baseline.json.`,
  );
}

main().catch((err) => {
  console.error(`[merge-events] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
