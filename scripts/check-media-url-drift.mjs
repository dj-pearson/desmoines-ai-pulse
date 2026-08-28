#!/usr/bin/env node
/**
 * How many content rows are still served straight off Supabase (WEB-OPS-023).
 *
 * The /media route is live and caching - an object answers 200 image/jpeg with
 * `cache-control: public, max-age=31536000` and `cf-cache-status: HIT` - and the
 * existing rows were repointed onto it. So the expensive path is closed for
 * everything that was already there.
 *
 * IT RE-ACCRUES, WHICH IS THE POINT OF THIS CHECK. Measured 2026-08-28: seven
 * event rows carried a raw storage URL, and all seven were created in the same
 * crawl at 15:46 on 2026-08-27, while every repointed row was created on
 * 2026-08-26 or earlier. The backfill fixed history and the write path kept
 * producing more.
 *
 * WHY: cdnUrlFor (_shared/imageStorage.ts) switches on
 * `Deno.env.get("MEDIA_CDN_BASE")`. That is a SUPABASE EDGE FUNCTION variable.
 * This story's AC3 says to set MEDIA_CDN_BASE "in the Cloudflare Pages
 * environment", which is where the Pages route reads its own copy and is NOT
 * where the code that writes image_url looks. docs/EGRESS_IMAGE_RUNBOOK.md:164
 * has it right - `supabase secrets set MEDIA_CDN_BASE=...` - and the AC does
 * not. Set it in the wrong place and nothing changes, silently.
 *
 * A COUNT, NOT A GATE. The number moves with ingest, so it is red on any day the
 * crawler runs before the switch is set, and green afterwards. Reporting it is
 * what makes the re-accrual visible; failing a build on it would just be noise.
 * Same reasoning, and the same exit 0, as check-hub-inventory.
 *
 * ANON KEY IS ENOUGH - these tables are publicly readable, which is the whole
 * problem being measured.
 *
 *   node scripts/check-media-url-drift.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

function env(key) {
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
const KEY = env('VITE_SUPABASE_ANON_KEY') ?? env('SUPABASE_SERVICE_ROLE_KEY');
if (!URL_BASE || !KEY) {
  console.error('[media-drift] SUPABASE_URL / anon key not set - skipping.');
  process.exit(0);
}
const STORAGE_HOST = new global.URL(URL_BASE).host;

/** Exact count via the Content-Range header, so no rows are transferred. */
async function count(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`${path} -> ${res.status} ${(await res.text()).slice(0, 120)}`);
  }
  return Number((res.headers.get('content-range') ?? '/0').split('/')[1] || 0);
}

// The column is not called the same thing everywhere: articles uses
// featured_image_url. A first pass assumed image_url across the board, and the
// ad-hoc version of this measurement reported "articles: 0 images" - a 42703
// read as an empty count. The strict error above is the only reason it surfaced.
const TABLES = [
  { table: 'events', column: 'image_url' },
  { table: 'restaurants', column: 'image_url' },
  { table: 'attractions', column: 'image_url' },
  { table: 'playgrounds', column: 'image_url' },
  { table: 'articles', column: 'featured_image_url' },
];

const rows = [];
for (const { table, column } of TABLES) {
  const withImage = await count(`${table}?select=id&${column}=not.is.null`);
  const onStorage = await count(`${table}?select=id&${column}=like.*${STORAGE_HOST}*`);
  rows.push({ table, withImage, onStorage });
}

// A CHECK THAT READ NOTHING MUST NOT REPORT A CLEAN RESULT. If every table came
// back with zero images the tables are unreadable, not empty of images.
if (rows.every((r) => r.withImage === 0)) {
  console.error('[media-drift] no table reports any image_url - refusing to report zero drift.');
  process.exit(1);
}

const total = rows.reduce((n, r) => n + r.onStorage, 0);
console.log(`[media-drift] rows still served straight off ${STORAGE_HOST}:`);
for (const r of rows) {
  console.log(`  ${r.table.padEnd(13)} ${String(r.onStorage).padStart(5)} of ${String(r.withImage).padStart(5)} with an image`);
}

if (total === 0) {
  console.log('\nOK Nothing is served off the storage origin. Every stored image goes through /media.');
  process.exit(0);
}

console.log(
  `\n${total} row(s) bypass the edge cache, so their images cost Supabase egress on every view.\n` +
    '  If these are RECENT rows, the ingest switch is not set where the code reads it:\n' +
    '      supabase secrets set MEDIA_CDN_BASE=https://desmoinesinsider.com\n' +
    '  cdnUrlFor reads Deno.env, so setting it only in Cloudflare Pages changes nothing.\n' +
    '  Existing rows move with: npx tsx scripts/repoint-media-urls.ts (dry run first).\n'
);
process.exit(0);
