#!/usr/bin/env node
/**
 * WEB-BE-040 dry run: how many rows would 20260902000004 clear?
 *
 * Reads counts through PostgREST with the anon key and writes nothing. The
 * predicates mirror the migration exactly, so the numbers printed here are
 * the numbers the migration will RAISE when it runs.
 *
 *   node scripts/audit-random-featured.mjs
 *
 * Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment (or
 * .env). Rows hidden by RLS from anon are not counted; content tables are
 * public-read so that should be none.
 */
import { readFileSync, existsSync } from 'node:fs';

function loadDotEnv() {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadDotEnv();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.');
  process.exit(2);
}

async function count(table, filter) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&${filter}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
  }
  const range = res.headers.get('content-range') ?? '';
  return Number(range.split('/')[1] ?? 0);
}

// The sponsored_listing_links exemption cannot be expressed as a PostgREST
// filter on the parent table; the links table is admin-read only and held 0
// rows at the last probe, so is_sponsored is the effective exemption here.
const checks = [
  ['events (cleared)', 'events', 'is_featured=eq.true&is_sponsored=not.is.true&or=(source.not.is.null,source_url.not.is.null)'],
  ['playgrounds (cleared)', 'playgrounds', 'is_featured=eq.true&source=not.is.null&manually_curated=not.is.true'],
  ['restaurants (cleared)', 'restaurants', 'is_featured=eq.true&is_sponsored=not.is.true'],
  ['attractions (review only)', 'attractions', 'is_featured=eq.true'],
];

let failed = false;
for (const [label, table, filter] of checks) {
  try {
    const n = await count(table, filter);
    console.log(`${label.padEnd(28)} ${n}`);
  } catch (err) {
    failed = true;
    console.error(`${label.padEnd(28)} ERROR ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
