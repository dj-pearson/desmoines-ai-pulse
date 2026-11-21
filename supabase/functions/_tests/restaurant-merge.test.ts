// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/restaurant-merge.test.ts
//
// WEB-BE-074: merge_duplicate_content copies the loser's data onto the
// survivor, moves owner claims, picks the Google-linked or claimed row, and
// unmerge_content undoes the copy and the claim move. Runs the real dedupe
// migrations in PGlite against a minimal schema.

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

const S = "00000000-0000-0000-0000-00000000000a"; // survivor
const L = "00000000-0000-0000-0000-00000000000b"; // loser
const OWNER = "00000000-0000-0000-0000-0000000000f1";
const OTHER = "00000000-0000-0000-0000-0000000000f2";

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.current (uid uuid, admin boolean DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM auth.current LIMIT 1';
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT coalesce((SELECT admin FROM auth.current LIMIT 1), false)';
    -- pg_trgm stand-ins: exact (case-insensitive) match is similarity 1.
    CREATE FUNCTION public.similarity(a text, b text) RETURNS real LANGUAGE sql IMMUTABLE
      AS 'SELECT CASE WHEN lower(a) = lower(b) THEN 1 ELSE 0 END::real';
    CREATE FUNCTION public.trgm_match(a text, b text) RETURNS boolean LANGUAGE sql IMMUTABLE
      AS 'SELECT lower(a) = lower(b)';
    CREATE OPERATOR public.% (LEFTARG = text, RIGHTARG = text, FUNCTION = public.trgm_match);
    CREATE TABLE public.events (
      id uuid PRIMARY KEY, title text, date timestamptz, image_url text, is_featured boolean,
      is_enhanced boolean, enhanced_description text, original_description text, ai_writeup text,
      latitude double precision, longitude double precision, updated_at timestamptz
    );
    CREATE TABLE public.restaurants (
      id uuid PRIMARY KEY, name text, image_url text, is_featured boolean DEFAULT false,
      rating numeric, description text, ai_writeup text, google_place_id text, hours_json jsonb,
      latitude double precision, longitude double precision, phone text, website text,
      menu_url text, cuisine text, updated_at timestamptz
    );
    CREATE TABLE public.restaurant_reviews (
      id serial PRIMARY KEY, restaurant_id uuid REFERENCES public.restaurants(id)
    );
    CREATE TABLE public.deals (id serial PRIMARY KEY, entity_type text, entity_id uuid);
    CREATE TABLE public.business_claims (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      listing_type text NOT NULL, listing_id uuid NOT NULL, user_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX business_claims_one_verified_owner
      ON public.business_claims (listing_type, listing_id) WHERE status = 'verified';
    CREATE UNIQUE INDEX business_claims_one_open_per_user
      ON public.business_claims (listing_type, listing_id, user_id) WHERE status <> 'rejected';
  `);
  for (const f of [
    "20260612000008_dedupe_columns.sql",
    "20260612000009_dedupe_queue_and_audit.sql",
    "20260612000010_dedupe_functions.sql",
    "20261108000090_repoint_deals_on_restaurant_merge.sql",
    "20261121000080_restaurant_merge_keeps_data.sql",
  ]) {
    await pg.exec(await Deno.readTextFile(M(f)));
  }
  return pg;
}

async function one<T>(pg: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  return (await pg.query<T>(sql, params)).rows[0];
}

async function merge(pg: PGlite, survivor = S, loser = L): Promise<string> {
  const r = await one<{ id: string }>(
    pg,
    "SELECT public.merge_duplicate_content('restaurant', $1, $2, 0.95, 'admin') AS id",
    [survivor, loser],
  );
  return r.id;
}

Deno.test("merge fills the survivor's empty columns from the loser and keeps its own values", async () => {
  const pg = await db();
  await pg.query(
    `INSERT INTO restaurants (id, name, description, phone, website, hours_json, menu_url)
     VALUES ($1, 'Taco Place', 'A long scraped description', '', 'https://kept.example', '{}', NULL)`,
    [S],
  );
  await pg.query(
    `INSERT INTO restaurants (id, name, google_place_id, hours_json, latitude, longitude, phone, website, menu_url)
     VALUES ($1, 'Taco Place', 'ChIJ123', '{"mon":"11-9"}', 41.59, -93.62, '515-555-0100',
             'https://loser.example', 'https://loser.example/menu')`,
    [L],
  );
  const mergeId = await merge(pg);

  const s = await one<Record<string, unknown>>(pg, "SELECT * FROM restaurants WHERE id = $1", [S]);
  assert.equal(s.google_place_id, "ChIJ123");
  assert.deepEqual(s.hours_json, { mon: "11-9" }, "an empty {} counts as missing");
  assert.equal(s.latitude, 41.59);
  assert.equal(s.longitude, -93.62);
  assert.equal(s.phone, "515-555-0100", "an empty string counts as missing");
  assert.equal(s.menu_url, "https://loser.example/menu");
  // Counter-assertion: a value the survivor already had is not overwritten.
  assert.equal(s.website, "https://kept.example");
  assert.equal(s.description, "A long scraped description");

  const l = await one<{ is_merged: boolean; google_place_id: string }>(
    pg,
    "SELECT is_merged, google_place_id FROM restaurants WHERE id = $1",
    [L],
  );
  assert.deepEqual(l, { is_merged: true, google_place_id: "ChIJ123" }, "the loser keeps its own copy");

  const audit = await one<{ filled_columns: Record<string, unknown> }>(
    pg,
    "SELECT filled_columns FROM content_merges WHERE id = $1",
    [mergeId],
  );
  assert.deepEqual(
    Object.keys(audit.filled_columns).sort(),
    ["google_place_id", "hours_json", "latitude", "longitude", "menu_url", "phone"],
  );
});

Deno.test("coordinates move as a pair, never one half", async () => {
  const pg = await db();
  await pg.query("INSERT INTO restaurants (id, name, latitude) VALUES ($1, 'X', 41.0)", [S]);
  await pg.query("INSERT INTO restaurants (id, name, latitude) VALUES ($1, 'X', 42.0)", [L]);
  await merge(pg);
  const s = await one<{ latitude: number; longitude: number | null }>(
    pg,
    "SELECT latitude, longitude FROM restaurants WHERE id = $1",
    [S],
  );
  assert.deepEqual(s, { latitude: 41.0, longitude: null }, "a loser with half a pair gives nothing");
});

Deno.test("survivor rule: place id, then verified claim, then the old score", async () => {
  const pg = await db();
  // L has the long description and image (old score winner); S has the place id.
  await pg.query("INSERT INTO restaurants (id, name, google_place_id) VALUES ($1, 'Pho Hut', 'ChIJabc')", [S]);
  await pg.query(
    "INSERT INTO restaurants (id, name, image_url, is_featured, rating, description) VALUES ($1, 'Pho Hut', 'x.jpg', true, 4.5, $2)",
    [L, "y".repeat(2000)],
  );
  const pair = await one<{ a_id: string; a_richness: number; b_richness: number }>(
    pg,
    "SELECT a_id, a_richness::float8 AS a_richness, b_richness::float8 AS b_richness FROM find_duplicate_restaurants(0.7, 10)",
  );
  assert.equal(pair.a_id, S);
  assert.ok(pair.a_richness > pair.b_richness, "the Google-linked row outranks the long scraped row");
  assert.equal((await one<{ s: string }>(pg, "SELECT suggest_merge_survivor('restaurant', $1, $2) AS s", [L, S])).s, S);

  // Without a place id on either row, a verified claim wins over the score.
  await pg.query("UPDATE restaurants SET google_place_id = NULL WHERE id = $1", [S]);
  assert.equal((await one<{ s: string }>(pg, "SELECT suggest_merge_survivor('restaurant', $1, $2) AS s", [S, L])).s, L);
  await pg.query(
    "INSERT INTO business_claims (listing_type, listing_id, user_id, status) VALUES ('restaurant', $1, $2, 'verified')",
    [S, OWNER],
  );
  assert.equal((await one<{ s: string }>(pg, "SELECT suggest_merge_survivor('restaurant', $1, $2) AS s", [S, L])).s, S);
  // A pending claim does not count.
  await pg.query("UPDATE business_claims SET status = 'pending'");
  assert.equal((await one<{ s: string }>(pg, "SELECT suggest_merge_survivor('restaurant', $1, $2) AS s", [S, L])).s, L);
});

Deno.test("suggest_merge_survivor is admin-only for signed-in callers", async () => {
  const pg = await db();
  await pg.query("INSERT INTO restaurants (id, name) VALUES ($1, 'A'), ($2, 'B')", [S, L]);
  await pg.query("INSERT INTO auth.current VALUES ($1, false)", [OWNER]);
  await assert.rejects(pg.query("SELECT suggest_merge_survivor('restaurant', $1, $2)", [S, L]));
  await pg.query("UPDATE auth.current SET admin = true");
  await pg.query("SELECT suggest_merge_survivor('restaurant', $1, $2)", [S, L]);
});

Deno.test("claims on the loser move to the survivor; a second verified owner stays put", async () => {
  const pg = await db();
  await pg.query("INSERT INTO restaurants (id, name) VALUES ($1, 'A'), ($2, 'A')", [S, L]);
  await pg.query(
    `INSERT INTO business_claims (listing_type, listing_id, user_id, status) VALUES
       ('restaurant', $1, $2, 'verified'),
       ('restaurant', $1, $3, 'pending')`,
    [L, OWNER, OTHER],
  );
  await pg.query("INSERT INTO restaurant_reviews (restaurant_id) VALUES ($1)", [L]);
  const mergeId = await merge(pg);
  const claims = await pg.query<{ listing_id: string }>("SELECT listing_id FROM business_claims");
  assert.deepEqual(claims.rows.map((c) => c.listing_id), [S, S]);
  const rev = await one<{ restaurant_id: string }>(pg, "SELECT restaurant_id FROM restaurant_reviews");
  assert.equal(rev.restaurant_id, S, "foreign-key children still move");
  const audit = await one<{ repointed: Record<string, number>; n: number }>(
    pg,
    "SELECT repointed, cardinality(moved_claims) AS n FROM content_merges WHERE id = $1",
    [mergeId],
  );
  assert.equal(audit.n, 2);
  assert.equal(audit.repointed["business_claims.listing_id"], 2);

  // Both rows verified by different owners: the survivor's owner keeps it and
  // the loser's claim is left for an admin, not deleted.
  const pg2 = await db();
  await pg2.query("INSERT INTO restaurants (id, name) VALUES ($1, 'A'), ($2, 'A')", [S, L]);
  await pg2.query(
    `INSERT INTO business_claims (listing_type, listing_id, user_id, status) VALUES
       ('restaurant', $1, $2, 'verified'), ('restaurant', $3, $4, 'verified')`,
    [S, OWNER, L, OTHER],
  );
  const id2 = await merge(pg2);
  const left = await one<{ listing_id: string }>(pg2, "SELECT listing_id FROM business_claims WHERE user_id = $1", [OTHER]);
  assert.equal(left.listing_id, L);
  const a2 = await one<{ repointed: Record<string, number> }>(pg2, "SELECT repointed FROM content_merges WHERE id = $1", [id2]);
  assert.equal(a2.repointed["business_claims.left_on_loser"], 1);
});

Deno.test("unmerge restores the loser, clears copied values nobody edited, and returns claims", async () => {
  const pg = await db();
  await pg.query("INSERT INTO restaurants (id, name, phone) VALUES ($1, 'A', NULL)", [S]);
  await pg.query(
    "INSERT INTO restaurants (id, name, phone, website, google_place_id) VALUES ($1, 'A', '515-1', 'https://l.example', 'ChIJ9')",
    [L],
  );
  await pg.query(
    "INSERT INTO business_claims (listing_type, listing_id, user_id, status) VALUES ('restaurant', $1, $2, 'verified')",
    [L, OWNER],
  );
  const mergeId = await merge(pg);
  // Counter-assertion: the merge did copy and move, so what Undo clears below
  // was really there.
  const mid = await one<{ phone: string; listing_id: string }>(
    pg,
    "SELECT r.phone, c.listing_id FROM restaurants r, business_claims c WHERE r.id = $1",
    [S],
  );
  assert.deepEqual(mid, { phone: "515-1", listing_id: S });
  // An admin edits one copied value after the merge; Undo must keep that edit.
  await pg.query("UPDATE restaurants SET website = 'https://edited.example' WHERE id = $1", [S]);

  await pg.query("SELECT public.unmerge_content($1)", [mergeId]);

  const s = await one<{ phone: string | null; website: string; google_place_id: string | null }>(
    pg,
    "SELECT phone, website, google_place_id FROM restaurants WHERE id = $1",
    [S],
  );
  assert.deepEqual(s, { phone: null, website: "https://edited.example", google_place_id: null });
  const l = await one<{ is_merged: boolean }>(pg, "SELECT is_merged FROM restaurants WHERE id = $1", [L]);
  assert.equal(l.is_merged, false);
  const c = await one<{ listing_id: string }>(pg, "SELECT listing_id FROM business_claims");
  assert.equal(c.listing_id, L);
  const m = await one<{ reversed: boolean }>(pg, "SELECT reversed FROM content_merges WHERE id = $1", [mergeId]);
  assert.equal(m.reversed, true);
});
