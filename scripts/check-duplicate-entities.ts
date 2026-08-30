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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVENT_BASELINE = join(ROOT, 'duplicate-events-baseline.json');
const PLAYGROUND_BASELINE = join(ROOT, 'duplicate-playgrounds-baseline.json');

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

// ---------------------------------------------------------------------------
// Events (WEB-SEO-017). Same defect, twenty times the scale, and unchecked.
//
// This detector was written for restaurants because two restaurants were found
// duplicated. Nobody looked at events. public.events carries 10 groups sharing
// title+date+venue across 21 rows, and the Daily Event Crawler is still adding
// to them: its one scheduled run on 2026-08-23 logged
//     Inserted event: Chef Georges Steak Bar
//     Inserted event: Chef George's Steak Bar
//     Inserted event: Chef George's Steak Bar
//     Duplicates skipped: 0
// Three inserts of one venue, and the dedupe reported nothing to skip. That is
// the restaurant note's "SELECT before an INSERT with nothing behind it" shape:
// two records for the same event inside ONE batch both pass, because neither is
// in the table when the other is checked.
//
// KEYED ON title+date+venue, which mirrors name+address. Title alone finds 44
// groups and most are legitimate - a weekly trivia night IS the same title many
// times. Title+date finds 20 and still catches a touring act playing two
// venues. Adding the venue leaves 10, and every one of them is genuinely one
// event stored twice.
//
// BASELINED, unlike the restaurant check, which is a hard gate at zero. Ten
// groups exist today and each needs a per-group merge decision, so failing on
// them would make this permanently red - the failure mode this repo keeps
// re-learning. It fails on a NEW group, which is the crawler inserting another.
interface EventRow {
  id: string;
  title: string | null;
  date: string | null;
  venue: string | null;
}

const eventRows = (await fetchAll('events', 'id,title,date,venue')) as unknown as EventRow[];
if (eventRows.length === 0) {
  console.error('[duplicate-entities] events returned no rows - refusing to pass.');
  process.exit(1);
}

const eventKey = (r: EventRow) =>
  `${normalise(r.title ?? '')}|${r.date ?? ''}|${normalise(r.venue ?? '')}`;

const eventGroups = new Map<string, EventRow[]>();
for (const row of eventRows) {
  // An event with no title or no date cannot be compared; judging it would
  // report every untitled draft against every other one.
  if (!row.title?.trim() || !row.date) continue;
  const key = eventKey(row);
  if (!eventGroups.has(key)) eventGroups.set(key, []);
  eventGroups.get(key)!.push(row);
}

const eventDupes = [...eventGroups.entries()].filter(([, g]) => g.length > 1);

// THE BASELINE IS WRITTEN BY THIS SCRIPT, not by a psql one-liner, and that is
// deliberate: the first attempt keyed it from `date::text` while the REST API
// returns ISO ("2026-03-04T00:30:00+00:00" against "2026-03-04 00:30:00+00"),
// so every key missed and all ten known groups reported as new. A baseline
// generated by the same code that reads it cannot drift in format.
if (process.argv.includes('--write-events')) {
  const keys = eventDupes.map(([k]) => k).sort();
  writeFileSync(
    EVENT_BASELINE,
    `${JSON.stringify(
      {
        _comment:
          'WEB-SEO-017. Event rows already sharing title+date+venue. The detector fails on a NEW group, not on these - the crawler created several and merging is a per-group decision. Do not add to this list to make CI pass.',
        groups: keys,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[duplicate-entities] wrote ${keys.length} baselined event group(s).`);
  process.exit(0);
}

const knownEventGroups = new Set<string>(
  existsSync(EVENT_BASELINE)
    ? (JSON.parse(readFileSync(EVENT_BASELINE, 'utf8')).groups as string[])
    : [],
);
const freshEventDupes = eventDupes.filter(([key]) => !knownEventGroups.has(key));

console.log(
  `[duplicate-entities] ${eventRows.length} events, ${eventDupes.length} group(s) sharing ` +
    `title+date+venue (${knownEventGroups.size} baselined).`,
);

if (freshEventDupes.length > 0) {
  console.error(`\nX ${freshEventDupes.length} NEW event(s) stored more than once:`);
  for (const [, group] of freshEventDupes) {
    console.error(`\n  ${group[0].title} - ${group[0].date} - ${group[0].venue ?? '(no venue)'}`);
    for (const row of group) console.error(`    ${row.id}`);
  }
  console.error(
    '\n  An ingest run inserted the same event twice. The check before the insert is\n' +
      '  a SELECT with nothing behind it, so two records in one batch both pass. Fix\n' +
      '  the ingest path, then merge these rows. See WEB-SEO-017.\n',
  );
  process.exit(1);
}

console.log('OK No new event stored more than once.');

// ---------------------------------------------------------------------------
// PLAYGROUNDS.
//
// Added 2026-08-27 after the sitemap generator started reporting collapsed URLs
// and named two: /playgrounds/riverview-park and /playgrounds/union-park. Both
// are single rows duplicated in July 2025, three days apart, and no check has
// ever looked at this table - the restaurant check was written for restaurants
// and extended to events, and playgrounds sat outside both.
//
// THE KEY IS THE SLUG, not name+address. A playground URL is /playgrounds/<slug>
// derived from the name alone (createSlug in the sitemap generator), so two rows
// whose names differ only in punctuation collide in the URL space even though
// name+address would separate them. Keying on what the URL is built from is what
// makes this agree with the symptom that found it.
//
// BASELINED at the two that exist, like events: merging them is a per-row
// decision about which id the existing links point at.
interface PlaygroundRow {
  id: string;
  name: string | null;
}

const playgroundRows = (await fetchAll('playgrounds', 'id,name')) as unknown as PlaygroundRow[];
if (playgroundRows.length === 0) {
  console.error('[duplicate-entities] playgrounds returned no rows - refusing to pass.');
  process.exit(1);
}

const playgroundSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const playgroundGroups = new Map<string, PlaygroundRow[]>();
for (const row of playgroundRows) {
  if (!row.name?.trim()) continue;
  const key = playgroundSlug(row.name);
  if (!key) continue;
  if (!playgroundGroups.has(key)) playgroundGroups.set(key, []);
  playgroundGroups.get(key)!.push(row);
}

const playgroundDupes = [...playgroundGroups.entries()].filter(([, g]) => g.length > 1);

if (process.argv.includes('--write-playgrounds')) {
  const keys = playgroundDupes.map(([k]) => k).sort();
  writeFileSync(
    PLAYGROUND_BASELINE,
    `${JSON.stringify(
      {
        _comment:
          'Playground rows whose names produce the same URL slug. The detector fails on a NEW one, not on these - merging is a per-row decision about which id existing links point at. Do not add to this list to make CI pass.',
        groups: keys,
      },
      null,
      2,
    )}
`,
  );
  console.log(`[duplicate-entities] wrote ${keys.length} baselined playground group(s).`);
  process.exit(0);
}

const knownPlaygroundGroups = new Set<string>(
  existsSync(PLAYGROUND_BASELINE)
    ? (JSON.parse(readFileSync(PLAYGROUND_BASELINE, 'utf8')).groups as string[])
    : [],
);
const freshPlaygroundDupes = playgroundDupes.filter(([key]) => !knownPlaygroundGroups.has(key));

console.log(
  `[duplicate-entities] ${playgroundRows.length} playgrounds, ${playgroundDupes.length} group(s) sharing ` +
    `a URL slug (${knownPlaygroundGroups.size} baselined).`,
);

if (freshPlaygroundDupes.length > 0) {
  console.error(`
X ${freshPlaygroundDupes.length} NEW playground(s) sharing a URL slug:`);
  for (const [slug, group] of freshPlaygroundDupes) {
    console.error(`
  /playgrounds/${slug}`);
    for (const row of group) console.error(`    ${row.id}  ${row.name}`);
  }
  console.error(
    '\n  Two rows resolve to one URL, so the sitemap lists it once and the page can\n' +
      '  only show one of them. Merge the rows, or rename one so the slugs differ.\n',
  );
  process.exit(1);
}

console.log('OK No new playground sharing a URL slug.');
