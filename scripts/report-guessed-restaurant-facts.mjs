#!/usr/bin/env node
/**
 * WEB-BE-068 review list: restaurant rows that may carry ingest guesses.
 *
 * firecrawl-scraper used to insert cuisine "American" and price_range "$$"
 * when the page said nothing, and enhance-content let a model write phone,
 * website, address, price and rating. Both are fixed going forward; this lists
 * the existing rows that look like the old defaults so a person can review
 * them. It cannot tell a guess from a real American, $$ restaurant, which is
 * why it only lists and never rewrites.
 *
 * The filter: cuisine = 'American' AND price_range = '$$' AND enhanced is not
 * 'completed' (null counts as not completed). Rows bulk-update-restaurants has
 * enriched from Google Places are marked completed and left out.
 *
 *   node scripts/report-guessed-restaurant-facts.mjs           # table
 *   node scripts/report-guessed-restaurant-facts.mjs --json    # machine-readable
 *
 * Read-only: GET requests through PostgREST with the anon key, nothing else.
 * Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment (or
 * .env). The key is read from the environment and never printed. restaurants
 * is public-read, so RLS should hide no rows; if the anon role cannot read a
 * column the request fails and the script says so rather than printing zero.
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

const COLUMNS = 'id,name,cuisine,price_range,enhanced,rating,location,source_url,is_merged,created_at';
const FILTER = 'cuisine=eq.American&price_range=eq.%24%24&or=(enhanced.is.null,enhanced.neq.completed)';
const PAGE = 1000;

async function fetchPage(offset) {
  const res = await fetch(`${url}/rest/v1/restaurants?select=${COLUMNS}&${FILTER}&order=created_at.asc`, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: `${offset}-${offset + PAGE - 1}`,
    },
  });
  if (!res.ok) {
    // The body is PostgREST's error object; it carries no credentials.
    throw new Error(`HTTP ${res.status} ${await res.text()}`);
  }
  const total = Number((res.headers.get('content-range') ?? '').split('/')[1]);
  return { rows: await res.json(), total: Number.isFinite(total) ? total : null };
}

let rows = [];
let total = null;
try {
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchPage(offset);
    total = page.total;
    rows = rows.concat(page.rows);
    if (page.rows.length < PAGE) break;
  }
} catch (err) {
  console.error(`restaurants read failed, so no list was produced: ${err.message}`);
  process.exit(1);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ filter: FILTER, total, rows }, null, 2));
  process.exit(0);
}

const cell = (v, w) => String(v ?? '-').slice(0, w).padEnd(w);
console.log(`${rows.length} row(s) with cuisine American, price_range $$ and enhanced not completed` +
  (total !== null && total !== rows.length ? ` (server count ${total})` : ''));
if (rows.length === 0) process.exit(0);
console.log('');
console.log(`${cell('id', 36)}  ${cell('name', 34)}  ${cell('enhanced', 10)}  ${cell('rating', 6)}  ${cell('merged', 6)}  source_url`);
for (const r of rows) {
  console.log(
    `${cell(r.id, 36)}  ${cell(r.name, 34)}  ${cell(r.enhanced, 10)}  ${cell(r.rating, 6)}  ${cell(r.is_merged, 6)}  ${r.source_url ?? '-'}`,
  );
}
