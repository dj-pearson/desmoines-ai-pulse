// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/restaurant-hide.test.ts
//
// WEB-FEAT-103: an admin hides a restaurant instead of deleting it.
//
//   * hide_restaurant / unhide_restaurant, the RLS policy that makes a hidden
//     row read as absent, get_removed_restaurant and fuzzy_search_restaurants,
//     run from the real migrations in PGlite.
//   * The do-not-ingest rule (_shared/restaurantDoNotIngest.ts), and that every
//     path that inserts into restaurants reads it. The knownVenues test
//     (ingest-coordinates.test.ts) is the model: a path that stops calling the
//     shared module turns this red.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";
import {
  buildDoNotIngestList,
  isDoNotIngest,
  loadDoNotIngest,
  normalizeRestaurantName,
  withoutDoNotIngest,
} from "../_shared/restaurantDoNotIngest.ts";

interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const REPO = new URL("../../../", import.meta.url);
const M = (f: string) => new URL(`supabase/migrations/${f}`, REPO);
const read = async (rel: string) => await Deno.readTextFile(new URL(rel, REPO));

const LIVE = "00000000-0000-0000-0000-00000000000a";
const GONE = "00000000-0000-0000-0000-00000000000b";
const ADMIN = "00000000-0000-0000-0000-0000000000ad";

async function db(opts: { rls?: boolean } = {}): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${ADMIN}');
    CREATE TABLE auth.current (uid uuid, admin boolean DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM auth.current LIMIT 1';
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT coalesce((SELECT admin FROM auth.current LIMIT 1), false)';
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT SELECT ON auth.current TO anon, authenticated;
    -- pg_trgm is not in PGlite; fuzzy_search_restaurants only needs a number.
    CREATE FUNCTION public.similarity(a text, b text) RETURNS real LANGUAGE sql AS 'SELECT 0.5::real';
    CREATE TABLE public.business_claims (listing_type text, listing_id uuid, user_id uuid, status text);
    CREATE TABLE public.restaurants (
      id uuid PRIMARY KEY, name text, slug text, description text, website text, phone text,
      image_url text, menu_url text, cuisine text, location text, rating numeric,
      latitude real, longitude real, price_range text, city text,
      status text DEFAULT 'open', business_status text, google_place_id text,
      is_merged boolean DEFAULT false, updated_at timestamptz, locked_fields jsonb
    );
    INSERT INTO public.restaurants (id, name, slug, location, google_place_id) VALUES
      ('${LIVE}', 'Lucca', 'lucca', 'Des Moines', 'place-live'),
      ('${GONE}', 'Gone Grill', 'gone-grill', 'Ankeny', 'place-gone');
    GRANT SELECT ON public.restaurants TO anon, authenticated;
  `);
  if (opts.rls !== false) {
    await pg.exec(`
      ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Public read" ON public.restaurants FOR SELECT USING (true);
    `);
  }
  await pg.exec(await Deno.readTextFile(M("20260127000000_restaurant_blacklist.sql")));
  await pg.exec(await Deno.readTextFile(M("20261121000070_restaurant_locked_fields.sql")));
  await pg.exec(await Deno.readTextFile(M("20261121000140_restaurant_hide.sql")));
  return pg;
}

async function as(pg: PGlite, uid: string | null, admin = false) {
  await pg.query("DELETE FROM auth.current");
  if (uid || admin) await pg.query("INSERT INTO auth.current VALUES ($1, $2)", [uid, admin]);
}

async function errCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  }
}

/** Runs `sql` as the anon role, the way PostgREST runs a visitor's request. */
async function asAnon<T>(pg: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  await pg.exec("SET ROLE anon");
  try {
    return (await pg.query<T>(sql, params)).rows;
  } finally {
    await pg.exec("RESET ROLE");
  }
}

// ---------------------------------------------------------------------------
// The migration
// ---------------------------------------------------------------------------

Deno.test("hide keeps the row, stamps it, and puts its place id and name on the do-not-ingest list", async () => {
  const pg = await db();
  await as(pg, ADMIN, true);
  await pg.query("SELECT public.hide_restaurant($1, $2)", [GONE, "  Closed and the owner asked  "]);

  const row = (await pg.query<{ name: string; hidden_at: string | null; hidden_by: string; hidden_reason: string }>(
    "SELECT name, hidden_at, hidden_by, hidden_reason FROM restaurants WHERE id = $1",
    [GONE],
  )).rows[0];
  assert.equal(row.name, "Gone Grill", "the row is kept");
  assert.ok(row.hidden_at, "hidden_at is set");
  assert.equal(row.hidden_by, ADMIN);
  assert.equal(row.hidden_reason, "Closed and the owner asked");

  const entries = (await pg.query<{ google_place_id: string; restaurant_name: string; reason_category: string; restaurant_id: string }>(
    "SELECT google_place_id, restaurant_name, reason_category, restaurant_id FROM restaurant_blacklist",
  )).rows;
  assert.deepEqual(entries, [
    { google_place_id: "place-gone", restaurant_name: "Gone Grill", reason_category: "admin_hidden", restaurant_id: GONE },
  ]);

  // A second hide does not stack a duplicate entry.
  await pg.query("SELECT public.hide_restaurant($1, null)", [GONE]);
  const n = (await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM restaurant_blacklist")).rows[0].n;
  assert.equal(n, 1);
});

Deno.test("only an admin can hide or unhide", async () => {
  const pg = await db();
  await as(pg, "00000000-0000-0000-0000-0000000000ff", false);
  assert.equal(await errCode(pg.query("SELECT public.hide_restaurant($1, null)", [GONE])), "42501");
  assert.equal(await errCode(pg.query("SELECT public.unhide_restaurant($1)", [GONE])), "42501");
  await as(pg, ADMIN, true);
  assert.equal(await errCode(pg.query("SELECT public.hide_restaurant($1, null)", ["00000000-0000-0000-0000-000000000099"])), "22023");
});

Deno.test("a hidden row reads as absent to a visitor and stays visible to an admin", async () => {
  const pg = await db();
  await as(pg, ADMIN, true);
  await pg.query("SELECT public.hide_restaurant($1, null)", [GONE]);

  await as(pg, null);
  const visitor = await asAnon<{ id: string }>(pg, "SELECT id FROM public.restaurants ORDER BY name");
  assert.deepEqual(visitor.map((r) => r.id), [LIVE], "the hidden row is not listed");

  await as(pg, ADMIN, true);
  const admin = await asAnon<{ id: string }>(pg, "SELECT id FROM public.restaurants ORDER BY name");
  assert.deepEqual(admin.map((r) => r.id).sort(), [LIVE, GONE].sort(), "an admin still sees it");
});

Deno.test("counter-check: before any hide a visitor reads every row", async () => {
  const pg = await db();
  await as(pg, null);
  const visitor = await asAnon<{ id: string }>(pg, "SELECT id FROM public.restaurants");
  assert.equal(visitor.length, 2, "the policy hides nothing that is not hidden");
});

Deno.test("get_removed_restaurant names a hidden listing by slug or id, and nothing else", async () => {
  const pg = await db();
  await as(pg, ADMIN, true);
  await pg.query("SELECT public.hide_restaurant($1, null)", [GONE]);
  await as(pg, null);

  const bySlug = await asAnon<{ name: string }>(pg, "SELECT name FROM public.get_removed_restaurant('gone-grill')");
  assert.deepEqual(bySlug.map((r) => r.name), ["Gone Grill"]);
  const byId = await asAnon<{ name: string }>(pg, "SELECT name FROM public.get_removed_restaurant($1)", [GONE.toUpperCase()]);
  assert.deepEqual(byId.map((r) => r.name), ["Gone Grill"]);
  const live = await asAnon<{ name: string }>(pg, "SELECT name FROM public.get_removed_restaurant('lucca')");
  assert.deepEqual(live, [], "a live row is not readable through it");
  const none = await asAnon<{ name: string }>(pg, "SELECT name FROM public.get_removed_restaurant('no-such')");
  assert.deepEqual(none, []);
});

Deno.test("unhide lists the row again and removes only the entry the hide wrote", async () => {
  const pg = await db();
  await as(pg, ADMIN, true);
  await pg.query("SELECT public.hide_restaurant($1, null)", [GONE]);
  // A block an admin added by hand in the Places tools, for the same name.
  await pg.query(
    "INSERT INTO restaurant_blacklist (restaurant_name, reason, reason_category) VALUES ('Gone Grill', 'chain', 'chain')",
  );
  await pg.query("SELECT public.unhide_restaurant($1)", [GONE]);

  const row = (await pg.query<{ hidden_at: string | null }>("SELECT hidden_at FROM restaurants WHERE id = $1", [GONE])).rows[0];
  assert.equal(row.hidden_at, null);
  const left = (await pg.query<{ reason_category: string }>("SELECT reason_category FROM restaurant_blacklist")).rows;
  assert.deepEqual(left, [{ reason_category: "chain" }]);
});

Deno.test("fuzzy_search_restaurants leaves hidden rows out", async () => {
  const pg = await db();
  await as(pg, ADMIN, true);
  await pg.query("SELECT public.hide_restaurant($1, null)", [GONE]);
  const hits = (await pg.query<{ name: string }>("SELECT name FROM public.fuzzy_search_restaurants('grill', 10)")).rows;
  assert.deepEqual(hits, []);
  const live = (await pg.query<{ name: string }>("SELECT name FROM public.fuzzy_search_restaurants('lucca', 10)")).rows;
  assert.deepEqual(live.map((r) => r.name), ["Lucca"], "counter-check: a live row is still found");
});

Deno.test("the drawer's fields are lockable, so an admin edit of them is a person's edit (WEB-BE-069)", async () => {
  const pg = await db();
  await as(pg, ADMIN, true);
  const m = (await pg.query<{ m: Record<string, unknown> }>(
    "SELECT public.set_restaurant_field_locks($1, ARRAY['status','business_status','hours_json','google_place_id','reservation_url','name'], '{}') AS m",
    [LIVE],
  )).rows[0].m;
  assert.deepEqual(Object.keys(m).sort(), ["business_status", "google_place_id", "hours_json", "reservation_url", "status"]);
});

Deno.test("the migration refuses a restaurants table without row level security", async () => {
  await assert.rejects(() => db({ rls: false }), /row level security is off/);
});

// ---------------------------------------------------------------------------
// The do-not-ingest rule
// ---------------------------------------------------------------------------

Deno.test("a place on the list is refused by place id or by name, however the name is spaced or cased", () => {
  const list = buildDoNotIngestList([
    { google_place_id: "place-gone", restaurant_name: "Gone Grill" },
    { google_place_id: null, restaurant_name: "  Kwik   Star " },
  ]);
  assert.equal(isDoNotIngest(list, { name: "Something else", google_place_id: "place-gone" }), true);
  assert.equal(isDoNotIngest(list, { name: "gone grill" }), true);
  assert.equal(isDoNotIngest(list, { name: "KWIK STAR" }), true);
  assert.equal(isDoNotIngest(list, { name: "Lucca", google_place_id: "place-live" }), false, "counter-check");
  assert.equal(isDoNotIngest(list, { name: "" }), false, "an empty name matches nothing");
  assert.equal(normalizeRestaurantName("  A   B "), "a b");
});

Deno.test("withoutDoNotIngest keeps the rest and names what it refused", () => {
  const list = buildDoNotIngestList([{ restaurant_name: "Gone Grill" }]);
  const { kept, refused } = withoutDoNotIngest(list, [{ name: "Lucca" }, { name: "Gone Grill" }, { name: "Zombie Burger" }]);
  assert.deepEqual(kept.map((r) => r.name), ["Lucca", "Zombie Burger"]);
  assert.deepEqual(refused, ["Gone Grill"]);
});

Deno.test("loadDoNotIngest reads unexpired entries and reports a failed read as an error, not an empty list", async () => {
  let filter = "";
  const ok = {
    from: () => ({
      select: () => ({
        or: (f: string) => {
          filter = f;
          return Promise.resolve({ data: [{ google_place_id: "p", restaurant_name: "X" }], error: null });
        },
      }),
    }),
  };
  const loaded = await loadDoNotIngest(ok, new Date("2026-11-21T00:00:00Z"));
  assert.equal(filter, "expires_at.is.null,expires_at.gt.2026-11-21T00:00:00.000Z");
  assert.equal(loaded.list?.placeIds.has("p"), true);

  const failing = {
    from: () => ({ select: () => ({ or: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }),
  };
  const failed = await loadDoNotIngest(failing);
  assert.equal(failed.list, null);
  assert.equal(failed.error, "boom");
});

// Every path that adds rows to restaurants. firecrawl-scraper and ai-crawler
// insert through `.from(tableName)`, so they are named; any other file that
// writes `.from('restaurants').insert(` or `.upsert(` is found by the scan
// below and must be in this list.
const INGESTION_PATHS = [
  "supabase/functions/firecrawl-scraper/index.ts",
  "supabase/functions/ai-crawler/index.ts",
  "supabase/functions/restaurant-opening-scraper/index.ts",
  "supabase/functions/search-new-restaurants/index.ts",
];

const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(?<!:)\/\/.*$/, "")).join("\n");

Deno.test("every restaurant ingestion path reads the do-not-ingest list through the shared module", async () => {
  for (const rel of INGESTION_PATHS) {
    const src = codeOnly(await read(rel));
    assert.match(src, /from ["']\.\.\/_shared\/restaurantDoNotIngest\.ts["']/, `${rel} does not import restaurantDoNotIngest.ts`);
    assert.match(src, /loadDoNotIngest\(/, `${rel} never loads the list`);
    assert.match(src, /(withoutDoNotIngest|isDoNotIngest)\(/, `${rel} loads the list and never applies it`);
  }
});

Deno.test("no edge function inserts into restaurants without being on the checked list", async () => {
  const found: string[] = [];
  for await (const dir of Deno.readDir(new URL("supabase/functions/", REPO))) {
    if (!dir.isDirectory || dir.name.startsWith("_")) continue;
    let src: string;
    try {
      src = codeOnly(await read(`supabase/functions/${dir.name}/index.ts`));
    } catch {
      continue;
    }
    if (/\.from\(\s*["']restaurants["']\s*\)\s*\.(insert|upsert)\(/.test(src)) {
      found.push(`supabase/functions/${dir.name}/index.ts`);
    }
  }
  assert.ok(found.includes("supabase/functions/restaurant-opening-scraper/index.ts"), "the scan finds the direct insert it is meant to find");
  for (const f of found) assert.ok(INGESTION_PATHS.includes(f), `${f} inserts into restaurants and is not checked against the do-not-ingest list`);
});
