// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/restaurant-rankings.test.ts
//
// WEB-BE-076: the popularity formula, the nightly refresh, featured expiry and
// relevance-ordered search, run from the real migrations in PGlite against a
// minimal restaurants table. 20250728200000 is applied first so the RANDOM()
// backfill and the old trigger are what this migration replaces.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";

// The edge-types shim cannot see npm packages' named exports, so the class is
// read off the namespace with the slice of its API these tests use.
interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const M = (f: string) => new URL(`../../migrations/${f}`, import.meta.url);

const FEAT_ADMIN = "00000000-0000-0000-0000-0000000000a1";
const FEAT_LINKED = "00000000-0000-0000-0000-0000000000a2";

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.restaurants (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      rating numeric(2,1),
      google_review_count integer,
      hours_checked_at timestamptz,
      is_featured boolean DEFAULT false,
      is_sponsored boolean DEFAULT false,
      sponsored_until timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      search_vector tsvector
    );
    CREATE TABLE public.content_metrics (
      content_type text, content_id uuid, metric_type text,
      metric_value integer, date date DEFAULT CURRENT_DATE
    );
    CREATE TABLE public.sponsored_listing_links (listing_type text, listing_id uuid);
    -- Featured before this migration: one with a past campaign link, one an
    -- admin ticked after WEB-BE-040.
    INSERT INTO public.restaurants (id, name, rating, is_featured) VALUES
      ('${FEAT_ADMIN}', 'Admin pick', 4.5, true),
      ('${FEAT_LINKED}', 'Old sponsor', 4.5, true);
    INSERT INTO public.sponsored_listing_links VALUES ('restaurant', '${FEAT_LINKED}');
  `);
  await pg.exec(await Deno.readTextFile(M("20250728200000_add_restaurant_popularity_scoring.sql")));
  await pg.exec(await Deno.readTextFile(M("20261121000170_restaurant_rankings.sql")));
  return pg;
}

async function one<T>(pg: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  return (await pg.query<T>(sql, params)).rows[0];
}

async function score(
  pg: PGlite,
  rating: number | null,
  count: number | null,
  views = 0,
  checkedDaysAgo: number | null = null,
): Promise<number> {
  const r = await one<{ s: number }>(
    pg,
    `SELECT public.restaurant_popularity_score($1, $2, $3,
       CASE WHEN $4::int IS NULL THEN NULL ELSE now() - make_interval(days => $4::int) END) AS s`,
    [rating, count, views, checkedDaysAgo],
  );
  return r.s;
}

let idSeq = 0;
async function insert(pg: PGlite, cols: Record<string, unknown>): Promise<string> {
  idSeq += 1;
  const id = `00000000-0000-0000-0000-${String(idSeq).padStart(12, "0")}`;
  const keys = ["id", "name", ...Object.keys(cols)];
  const vals = [id, `R${idSeq}`, ...Object.values(cols)];
  await pg.query(
    `INSERT INTO public.restaurants (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
    vals,
  );
  return id;
}

Deno.test("the formula has no random term and weighs the review count", async () => {
  const pg = await db();
  // Same inputs, same answer, every time.
  const a = await score(pg, 4.6, 300, 40, 10);
  for (let i = 0; i < 5; i++) assert.equal(await score(pg, 4.6, 300, 40, 10), a);

  // A 5.0 from four reviews scores below a 4.8 from three thousand.
  const few = await score(pg, 5, 4);
  const many = await score(pg, 4.8, 3000);
  assert.ok(few < many, `5.0/4 (${few}) should score below 4.8/3000 (${many})`);
  // Counter-assertion: with equal counts the higher rating still wins, so the
  // count is a weight, not a replacement for the rating.
  assert.ok((await score(pg, 5, 3000)) > many);

  // Views and a recent hours check each add; nothing goes past 0..100.
  assert.ok((await score(pg, 4.5, 100, 200)) > (await score(pg, 4.5, 100, 0)));
  assert.ok((await score(pg, 4.5, 100, 0, 1)) > (await score(pg, 4.5, 100, 0, 80)));
  assert.equal(await score(pg, 4.5, 100, 0, 200), await score(pg, 4.5, 100, 0, null));
  assert.equal(await score(pg, null, null), 0);
  assert.ok((await score(pg, 5, 1_000_000, 1_000_000, 0)) <= 100);
});

Deno.test("the migration replaced the RANDOM() scores, and a second refresh changes nothing", async () => {
  const pg = await db();
  const rows = (await pg.query<{ id: string; popularity_score: number; rating: string }>(
    "SELECT id, popularity_score, rating FROM public.restaurants ORDER BY id",
  )).rows;
  for (const r of rows) {
    const expected = await score(pg, Number(r.rating), null);
    assert.equal(r.popularity_score, expected, `row ${r.id} carries the formula's score`);
  }
  const again = await one<{ r: { popularity_updated: number } }>(pg, "SELECT public.refresh_restaurant_rankings() AS r");
  assert.equal(again.r.popularity_updated, 0);
});

Deno.test("the nightly refresh counts real views and leaves updated_at alone", async () => {
  const pg = await db();
  const viewed = await insert(pg, { rating: 4.5, google_review_count: 200, updated_at: "2026-01-01T00:00:00Z" });
  const quiet = await insert(pg, { rating: 4.5, google_review_count: 200, updated_at: "2026-01-01T00:00:00Z" });
  await pg.query(
    `INSERT INTO public.content_metrics VALUES
       ('restaurant', $1, 'view', 300, CURRENT_DATE - 3),
       ('restaurant', $1, 'view', 9999, CURRENT_DATE - 200),
       ('event', $2, 'view', 9999, CURRENT_DATE)`,
    [viewed, quiet],
  );
  await pg.query("SELECT public.refresh_restaurant_rankings()");
  const v = await one<{ popularity_score: number; updated_at: Date }>(
    pg, "SELECT popularity_score, updated_at FROM public.restaurants WHERE id = $1", [viewed]);
  const q = await one<{ popularity_score: number }>(
    pg, "SELECT popularity_score FROM public.restaurants WHERE id = $1", [quiet]);
  assert.equal(v.popularity_score, await score(pg, 4.5, 200, 300));
  assert.equal(q.popularity_score, await score(pg, 4.5, 200, 0));
  assert.ok(v.popularity_score > q.popularity_score);
  assert.equal(new Date(v.updated_at).toISOString(), "2026-01-01T00:00:00.000Z", "a score-only change is bookkeeping");

  // Counter-assertion: a real change still moves updated_at, and the row
  // trigger rescored it from the new count.
  await pg.query("UPDATE public.restaurants SET google_review_count = 2000 WHERE id = $1", [quiet]);
  const q2 = await one<{ popularity_score: number; updated_at: Date }>(
    pg, "SELECT popularity_score, updated_at FROM public.restaurants WHERE id = $1", [quiet]);
  assert.notEqual(new Date(q2.updated_at).toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(q2.popularity_score, await score(pg, 4.5, 2000, 0));
});

Deno.test("featured rows were classified by origin at migration time", async () => {
  const pg = await db();
  const rows = (await pg.query<{ id: string; featured_source: string }>(
    "SELECT id, featured_source FROM public.restaurants WHERE id IN ($1, $2)", [FEAT_ADMIN, FEAT_LINKED],
  )).rows;
  const by = Object.fromEntries(rows.map((r) => [r.id, r.featured_source]));
  assert.equal(by[FEAT_ADMIN], "admin");
  // The linked row's sponsorship is over (not is_sponsored), so the
  // migration's own refresh already cleared it.
  assert.equal(by[FEAT_LINKED], null);
  const linked = await one<{ is_featured: boolean }>(
    pg, "SELECT is_featured FROM public.restaurants WHERE id = $1", [FEAT_LINKED]);
  assert.equal(linked.is_featured, false);
});

Deno.test("featuring that came with a sponsorship ends with it; an admin's stays", async () => {
  const pg = await db();
  const past = "now() - interval '1 day'";
  const ahead = "now() + interval '10 days'";
  const expired = await insert(pg, { is_sponsored: true });
  const active = await insert(pg, { is_sponsored: true });
  const admin = await insert(pg, { is_sponsored: true });
  await pg.exec(`
    UPDATE public.restaurants SET sponsored_until = ${past},  is_featured = true, featured_source = 'sponsorship' WHERE id = '${expired}';
    UPDATE public.restaurants SET sponsored_until = ${ahead}, is_featured = true, featured_source = 'sponsorship' WHERE id = '${active}';
    UPDATE public.restaurants SET sponsored_until = ${past},  is_featured = true WHERE id = '${admin}';
  `);
  const srcOf = async (id: string) =>
    one<{ is_featured: boolean; featured_source: string | null }>(
      pg, "SELECT is_featured, featured_source FROM public.restaurants WHERE id = $1", [id]);

  // Ticking the box without naming a source records an admin.
  assert.deepEqual(await srcOf(admin), { is_featured: true, featured_source: "admin" });

  const r = await one<{ r: { featured_cleared: number } }>(pg, "SELECT public.refresh_restaurant_rankings() AS r");
  assert.equal(r.r.featured_cleared, 1);
  assert.deepEqual(await srcOf(expired), { is_featured: false, featured_source: null });
  // Negative controls: same expired dates, admin source -> kept; same source,
  // sponsorship still running -> kept.
  assert.deepEqual(await srcOf(admin), { is_featured: true, featured_source: "admin" });
  assert.deepEqual(await srcOf(active), { is_featured: true, featured_source: "sponsorship" });

  // A campaign ending clears is_sponsored and sponsored_until (20260902000001);
  // that ends sponsorship featuring too.
  await pg.query("UPDATE public.restaurants SET is_sponsored = false, sponsored_until = NULL WHERE id = $1", [active]);
  await pg.query("SELECT public.refresh_restaurant_rankings()");
  assert.deepEqual(await srcOf(active), { is_featured: false, featured_source: null });

  // Unticking clears the source; re-ticking makes it an admin's.
  await pg.query("UPDATE public.restaurants SET is_featured = false WHERE id = $1", [admin]);
  assert.deepEqual(await srcOf(admin), { is_featured: false, featured_source: null });
  await pg.query("UPDATE public.restaurants SET is_featured = true WHERE id = $1", [expired]);
  assert.deepEqual(await srcOf(expired), { is_featured: true, featured_source: "admin" });
});

Deno.test("text search comes back best match first, not by popularity", async () => {
  const pg = await db();
  const weak = await insert(pg, { rating: 5, google_review_count: 5000 });
  const strong = await insert(pg, { rating: 3, google_review_count: 3 });
  const other = await insert(pg, { rating: 4 });
  await pg.query(
    `UPDATE public.restaurants SET search_vector = CASE id
       WHEN $1 THEN setweight(to_tsvector('english', 'Grill House'), 'A') || setweight(to_tsvector('english', 'tacos on tuesday'), 'D')
       WHEN $2 THEN setweight(to_tsvector('english', 'Taco Town tacos'), 'A')
       ELSE to_tsvector('english', 'Pho Place') END
     WHERE id IN ($1, $2, $3)`,
    [weak, strong, other],
  );
  const pop = (await pg.query<{ id: string }>(
    "SELECT id FROM public.restaurants WHERE id IN ($1, $2) ORDER BY popularity_score DESC", [weak, strong],
  )).rows.map((r) => r.id);
  assert.deepEqual(pop, [weak, strong], "by popularity the weak match would lead");

  const hits = (await pg.query<{ id: string }>(
    "SELECT id FROM public.search_restaurants_by_relevance('taco:*')",
  )).rows.map((r) => r.id);
  assert.deepEqual(hits, [strong, weak]);

  const web = (await pg.query<{ id: string }>(
    `SELECT id FROM public.search_restaurants_by_relevance('"taco town"', true)`,
  )).rows.map((r) => r.id);
  assert.deepEqual(web, [strong]);
  assert.equal((await pg.query("SELECT * FROM public.search_restaurants_by_relevance('  ')")).rows.length, 0);
});
