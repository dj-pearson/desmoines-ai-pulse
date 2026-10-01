#!/usr/bin/env tsx
/// <reference types="vite/client" />
// ^ the import below reaches src/lib/logger.ts through timezone.ts, which reads
// import.meta.env. Types only; nothing on this path calls the logger.
/**
 * Stale-opening check (SEO-062).
 *
 * restaurants.status opening_soon / announced is set by the openings pipeline
 * and cleared by nothing. On 2026-10-01, 22 rows carried it and 15 of them
 * were open, among them the most-clicked restaurant pages on the site, each
 * telling searchers the place had not opened yet. Two of them already had
 * Google business_status OPERATIONAL stored on the row.
 *
 * This lists every upcoming row that should be looked at by a person:
 *   - business_status is OPERATIONAL (Google says it is trading), or
 *   - opening_date has passed, or an undated timeframe names an earlier year
 *     (same rule the site uses to print "not confirmed",
 *     src/lib/restaurantOpenings.ts isStaleUpcoming).
 * It changes nothing: a passed date is not proof of opening, so the fix is a
 * person checking the restaurant's own site, as SEO-062 did
 * (scripts/content-backups/seo-062/fix-upcoming-status.sql).
 *
 * Exits 1 when any row is flagged. Runs nightly from
 * .github/workflows/stale-openings-check.yml with the anon key; status,
 * opening_date, opening_timeframe and business_status are all public columns.
 *
 * Usage: npx tsx scripts/check-stale-openings.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staleUpcomingReason } from '../src/lib/restaurantOpenings';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function env(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const f = join(ROOT, '.env');
  if (!existsSync(f)) return undefined;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    if (line.slice(0, i).trim() === key) return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

interface UpcomingRow {
  id: string;
  slug: string | null;
  name: string;
  status: string | null;
  opening_date: string | null;
  opening_timeframe: string | null;
  business_status: string | null;
}

const URL_ = env('VITE_SUPABASE_URL');
const KEY = env('VITE_SUPABASE_ANON_KEY');
if (!URL_ || !KEY) {
  console.error('[stale-openings] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set; skipping.');
  process.exit(0);
}

const params = new URLSearchParams({
  select: 'id,slug,name,status,opening_date,opening_timeframe,business_status',
  status: 'in.(opening_soon,announced)',
  is_merged: 'not.is.true',
  order: 'slug',
});
const res = await fetch(`${URL_}/rest/v1/restaurants?${params}`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  console.error(`[stale-openings] restaurants query failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
const body: unknown = await res.json();
if (!Array.isArray(body)) {
  console.error('[stale-openings] unexpected response shape');
  process.exit(1);
}
const rows = body as UpcomingRow[];
const now = new Date();
const flagged = rows
  .map((row) => ({ row, reason: staleUpcomingReason(row, now) }))
  .filter((x): x is { row: UpcomingRow; reason: string } => x.reason !== null);

console.log(`[stale-openings] ${rows.length} upcoming restaurant row(s), ${flagged.length} need a person to check`);
for (const { row, reason } of flagged) {
  console.log(`  /restaurants/${row.slug ?? row.id}  ${row.status}  ${reason}`);
}
if (flagged.length > 0) {
  console.log(
    '\nCheck each place on its own site or official listing, then set status to open, closed, or a',
    'future opening_date. Record the evidence (see scripts/content-backups/seo-062/).',
  );
  process.exit(1);
}
