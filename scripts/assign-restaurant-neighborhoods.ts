#!/usr/bin/env tsx
/**
 * SEO-060 - assign restaurants.neighborhood from latitude/longitude, using the
 * polygons in src/lib/neighborhoodBoundaries.ts. Emits SQL for review; it
 * never writes to the database itself.
 *
 *   npx tsx scripts/assign-restaurant-neighborhoods.ts > assign.sql   (SQL on stdout)
 *   (back up restaurants(id, neighborhood), then apply with psql)
 *
 * Every row is written, NULL included, so a restaurant that moves out of a
 * polygon (or whose coordinates are corrected) loses a stale value on the
 * next run. The per-row report and the per-neighbourhood counts go to stderr.
 *
 * FALLBACK COORDINATES ARE NOT PLACED. Some rows were geocoded to a city
 * centroid rather than their address: nine rows share 41.5869,-93.6249 in
 * downtown, among them an Ankeny address and several whose location is just
 * "Des Moines, IA". A coordinate shared by 3+ rows with 2+ different
 * locations is treated as a fallback and those rows get NULL until they are
 * geocoded properly.
 *
 * Reads production with the anon key from .env (VITE_SUPABASE_URL,
 * VITE_SUPABASE_ANON_KEY).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { NEIGHBORHOOD_BOUNDARIES, neighborhoodFor } from '../src/lib/neighborhoodBoundaries';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface Row {
  id: string;
  name: string;
  location: string | null;
  cuisine: string | null;
  latitude: number | null;
  longitude: number | null;
}

function env(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...process.env };
  try {
    for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // environment only
  }
  return out;
}

/** Coordinates (4 dp) shared by 3+ rows with 2+ distinct locations: a geocoder fallback, not an address. */
export function fallbackCoordinates(rows: readonly Row[]): Set<string> {
  const groups = new Map<string, { n: number; locations: Set<string> }>();
  for (const r of rows) {
    if (r.latitude === null || r.longitude === null) continue;
    const k = `${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}`;
    const g = groups.get(k) ?? { n: 0, locations: new Set<string>() };
    g.n++;
    g.locations.add((r.location ?? '').trim().toLowerCase());
    groups.set(k, g);
  }
  return new Set([...groups].filter(([, g]) => g.n >= 3 && g.locations.size >= 2).map(([k]) => k));
}

export function assign(rows: readonly Row[]): Map<string, string | null> {
  const fallback = fallbackCoordinates(rows);
  const out = new Map<string, string | null>();
  for (const r of rows) {
    const k = r.latitude === null || r.longitude === null ? '' : `${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}`;
    out.set(r.id, fallback.has(k) ? null : neighborhoodFor(r.latitude, r.longitude, r.location));
  }
  return out;
}

async function main() {
  const E = env();
  const base = E.VITE_SUPABASE_URL;
  const key = E.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(
      `${base.replace(/\/+$/, '')}/rest/v1/restaurants?select=id,name,location,cuisine,latitude,longitude&order=id&limit=1000&offset=${offset}`,
      { headers },
    );
    if (!res.ok) throw new Error(`restaurants: HTTP ${res.status}`);
    const page = (await res.json()) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  const fallback = fallbackCoordinates(rows);
  const result = assign(rows);
  const counts = new Map<string, number>(NEIGHBORHOOD_BOUNDARIES.map((n) => [n.slug, 0]));
  for (const slug of NEIGHBORHOOD_BOUNDARIES.map((n) => n.slug)) {
    console.error(`-- ${slug}`);
    for (const r of rows.filter((x) => result.get(x.id) === slug).sort((a, b) => a.name.localeCompare(b.name))) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
      console.error(`   ${r.name} | ${r.cuisine ?? '-'} | ${r.location ?? '-'}`);
    }
  }
  const skipped = rows.filter(
    (r) => r.latitude !== null && r.longitude !== null && fallback.has(`${r.latitude.toFixed(4)},${r.longitude.toFixed(4)}`),
  );
  console.error(`-- not placed, fallback coordinate (${skipped.length}): ${skipped.map((r) => r.name).sort().join('; ')}`);
  console.error(
    `-- counts: ${[...counts].map(([s, n]) => `${s} ${n}`).join(', ')}; NULL ${rows.length - [...counts.values()].reduce((a, b) => a + b, 0)} of ${rows.length}`,
  );

  const values = rows.map((r) => {
    const v = result.get(r.id);
    return `('${r.id}'::uuid, ${v ? `'${v}'` : 'null'})`;
  });
  const sql = [
    '-- SEO-060 restaurants.neighborhood. Generated by scripts/assign-restaurant-neighborhoods.ts',
    'begin;',
    'update restaurants r set neighborhood = v.n',
    `from (values\n  ${values.join(',\n  ')}\n) as v(id, n)`,
    'where r.id = v.id and r.neighborhood is distinct from v.n;',
    'commit;',
  ];
  process.stdout.write(`${sql.join('\n')}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`[assign-restaurant-neighborhoods] ${(err as Error).message}`);
    process.exit(1);
  });
}
