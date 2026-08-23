#!/usr/bin/env tsx
/**
 * Duplicate-entity detector (WEB-SEO-019 AC5).
 *
 * Two restaurants existed twice at the same address until 2026-08-22 --
 * Dave's Hot Chicken and Outback Steakhouse, the latter written eight seconds
 * apart, which is one ingest run inserting the same record twice.
 *
 * WHY A CHECK RATHER THAN A UNIQUE INDEX. A unique index on (name, address) is
 * the obvious fix and is the wrong first move here. It is a tightening in the
 * CLAUDE.md sense: it converts a duplicate insert from a silent extra row into a
 * hard failure, and the ingest paths do not handle that -- restaurant-opening-
 * scraper inserts inside a per-record loop and would abort a batch on the first
 * conflict. It also cannot be added without deciding what "same address" means
 * for the 50 rows with a null location. A detector has none of those problems
 * and answers the question the story actually asks: is it happening again.
 *
 * WHY THE INGEST-SIDE CHECK IS NOT ENOUGH ON ITS OWN. restaurant-opening-scraper
 * already looks for an existing row by name and location before inserting. That
 * check is a SELECT before an INSERT with nothing behind it, so two records for
 * the same restaurant inside ONE batch both pass -- neither is in the table yet
 * when the other is checked. Eight seconds apart is exactly that shape.
 *
 * MATCHING IS ON NAME **AND** ADDRESS, deliberately. Name alone would report
 * Texas Roadhouse (Johnston and West Des Moines) and Flip'N Jacks (Ames and
 * Altoona) as duplicates. They are different restaurants, and a check that cries
 * wolf on legitimate second locations gets switched off.
 *
 * Usage:
 *   npx tsx scripts/check-duplicate-entities.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const URL_ = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
const KEY = env('SUPABASE_SERVICE_ROLE_KEY') ?? env('VITE_SUPABASE_ANON_KEY');
if (!URL_ || !KEY) {
  console.error('[duplicate-entities] no Supabase credentials - skipping.');
  process.exit(0);
}

interface Row {
  id: string;
  name: string;
  slug: string;
  location: string | null;
}

/** Fold case, punctuation and whitespace so "Dave's" and "Daves" agree. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    // Strip combining accents, so an accented name matches its plain spelling --
    // the same fold the slug generator does server-side.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function fetchAll(table: string, columns: string): Promise<Row[]> {
  const out: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=${columns}`, {
      headers: {
        apikey: KEY!,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!res.ok) {
      console.error(`[duplicate-entities] ${table} returned ${res.status}: ${(await res.text()).slice(0, 160)}`);
      process.exit(1);
    }
    const page = (await res.json()) as Row[];
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}

const rows = await fetchAll('restaurants', 'id,name,slug,location');

if (rows.length === 0) {
  // An empty table is not a clean bill of health, it is a broken query.
  console.error('[duplicate-entities] restaurants returned no rows - refusing to pass.');
  process.exit(1);
}

const groups = new Map<string, Row[]>();
for (const row of rows) {
  // A row with no address cannot be compared on address, so it is not judged.
  // Reporting every unaddressed same-name pair would drown the real signal.
  if (!row.location || !row.location.trim()) continue;
  const key = `${normalise(row.name)}|${normalise(row.location)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(row);
}

const duplicates = [...groups.values()].filter((g) => g.length > 1);

const unaddressed = rows.filter((r) => !r.location || !r.location.trim()).length;
console.log(
  `[duplicate-entities] ${rows.length} restaurants, ${groups.size} distinct name+address, ` +
    `${unaddressed} without an address (not judged).`,
);

if (duplicates.length > 0) {
  console.error(`\nX ${duplicates.length} restaurant(s) exist more than once at the same address:`);
  for (const group of duplicates) {
    console.error(`\n  ${group[0].name} - ${group[0].location}`);
    for (const row of group) console.error(`    ${row.slug}  (${row.id})`);
  }
  console.error(
    '\n  Matching is on name AND address, so this is not a second location -- those\n' +
      '  are legitimate and deliberately not reported. Merge the rows, keeping the\n' +
      '  slug search engines have actually indexed, and 301 the other in\n' +
      '  public/_redirects. See WEB-SEO-019.\n',
  );
  process.exit(1);
}

console.log('\nOK No restaurant appears twice at one address.');
