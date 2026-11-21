// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/place-facts.test.ts
//
// WEB-BE-070: rating, review count, phone, website, price level, reservability
// and the Google listing link were fetched once and never again, and the page
// credited Google with a price_range Google never supplied. Pins the stale
// refresh mask (and its SKU), the rule that a missing answer never blanks a
// stored value, the lock companions, and the SQL that keeps price_range_source
// honest when somebody other than Google writes the price.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";
import {
  buildGoogleFactsUpdate,
  GOOGLE_FACT_NEW_COLUMNS,
  PLACES_PRICE_RANGE,
  placesPriceRange,
  withoutNewFactColumns,
} from "../_shared/placeFacts.ts";
import {
  buildStaleRefreshUpdate,
  HOURS_ONLY_FIELD_MASK,
  STALE_REFRESH_FIELD_MASK,
  STALE_REFRESH_RESERVABLE_FIELD_MASK,
  staleRefreshFieldMask,
} from "../_shared/placeHours.ts";
import { withoutLockedFields } from "../_shared/restaurantFieldLocks.ts";

const REPO = new URL("../../../", import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const AT = "2026-11-21T15:00:00.000Z";

// ---------------------------------------------------------------------------
// The mask
// ---------------------------------------------------------------------------

// From Google's Place Details (New) SKU list. Recorded here so a field added
// to the refresh mask has to be placed in a tier on purpose.
const PRO = ["businessStatus", "googleMapsUri"];
const ENTERPRISE = [
  "regularOpeningHours",
  "rating",
  "userRatingCount",
  "nationalPhoneNumber",
  "websiteUri",
  "priceLevel",
];
const ATMOSPHERE = ["reservable", "editorialSummary", "reviews", "servesBeer", "takeout", "delivery", "dineIn"];

const fields = (mask: string) => mask.split(",").map((f) => f.trim());

Deno.test("the stale refresh mask reads the Google facts and stays in the Enterprise SKU", () => {
  const mask = fields(STALE_REFRESH_FIELD_MASK);
  for (const f of ["rating", "userRatingCount", "nationalPhoneNumber", "websiteUri", "priceLevel", "googleMapsUri"]) {
    assert.ok(mask.includes(f), `${f} must be in the refresh mask`);
  }
  // Still hours and status.
  for (const f of fields(HOURS_ONLY_FIELD_MASK)) assert.ok(mask.includes(f), f);
  // Every field is Pro or Enterprise: one Atmosphere field would bill the
  // whole call a tier up.
  for (const f of mask) {
    assert.ok([...PRO, ...ENTERPRISE].includes(f), `${f} is not a known Pro/Enterprise field`);
    assert.ok(!ATMOSPHERE.includes(f), `${f} is Atmosphere`);
  }
});

Deno.test("reservable is asked for only on rows that do not know it", () => {
  assert.deepEqual(fields(STALE_REFRESH_RESERVABLE_FIELD_MASK), [...fields(STALE_REFRESH_FIELD_MASK), "reservable"]);
  assert.equal(staleRefreshFieldMask({ reservable: null }), STALE_REFRESH_RESERVABLE_FIELD_MASK);
  assert.equal(staleRefreshFieldMask({}), STALE_REFRESH_RESERVABLE_FIELD_MASK);
  // false is an answer, not a gap.
  assert.equal(staleRefreshFieldMask({ reservable: false }), STALE_REFRESH_FIELD_MASK);
  assert.equal(staleRefreshFieldMask({ reservable: true }), STALE_REFRESH_FIELD_MASK);
});

Deno.test("bulk-update-restaurants uses the per-row mask and the full mask asks for price and count", async () => {
  const src = await read("supabase/functions/bulk-update-restaurants/index.ts");
  const fn = src.slice(src.indexOf("async function refreshStaleHours"), src.indexOf("async function queueClosureReview"));
  assert.ok(fn.includes("'X-Goog-FieldMask': staleRefreshFieldMask(row)"), "refresh sends the per-row mask");
  assert.ok(fn.includes("'id, name, google_place_id, reservable'"), "refresh reads reservable to pick the mask");
  assert.ok(!fn.includes("HOURS_ONLY_FIELD_MASK"), "refresh no longer asks for hours only");
  assert.ok(fn.includes("withoutNewFactColumns(update)"), "refresh retries without the new columns");
  const full = /'X-Goog-FieldMask': '(id,displayName,formattedAddress,[^']+)'/.exec(src);
  assert.ok(full, "full enrichment mask present");
  for (const f of ["priceLevel", "userRatingCount"]) assert.ok(fields(full[1]).includes(f), `full mask lacks ${f}`);
  assert.ok(src.includes("Object.assign(update, buildGoogleFactsUpdate(placeDetails))"), "one builder for both paths");
});

// ---------------------------------------------------------------------------
// The null rule
// ---------------------------------------------------------------------------

Deno.test("a complete answer writes every fact, with the check date and the price source", () => {
  assert.deepEqual(
    buildGoogleFactsUpdate(
      {
        rating: 4.46,
        userRatingCount: 312,
        nationalPhoneNumber: " (515) 555-0100 ",
        websiteUri: "https://lucca.example/",
        priceLevel: "PRICE_LEVEL_MODERATE",
        reservable: true,
        googleMapsUri: "https://maps.google.com/?cid=1",
      },
      AT,
    ),
    {
      rating: 4.5,
      google_review_count: 312,
      google_rating_checked_at: AT,
      phone: "(515) 555-0100",
      website: "https://lucca.example/",
      price_range: "$$",
      price_range_source: "google",
      price_range_source_at: AT,
      reservable: true,
      google_maps_uri: "https://maps.google.com/?cid=1",
    },
  );
});

Deno.test("a missing, null or unusable answer writes nothing for that field", () => {
  for (const details of [null, undefined, "x", {}, {
    rating: null,
    userRatingCount: null,
    nationalPhoneNumber: "",
    websiteUri: null,
    priceLevel: null,
    reservable: null,
    googleMapsUri: "",
  }, {
    rating: 0,
    userRatingCount: -1,
    nationalPhoneNumber: "   ",
    websiteUri: "javascript:alert(1)",
    priceLevel: "PRICE_LEVEL_UNSPECIFIED",
    reservable: "yes",
    googleMapsUri: "not a url",
  }, { rating: 6, userRatingCount: 2.5, priceLevel: "PRICE_LEVEL_FREE" }, { rating: "4.5" }]) {
    assert.deepEqual(buildGoogleFactsUpdate(details, AT), {}, JSON.stringify(details));
  }
  // The refresh still records the check, and nothing else.
  assert.deepEqual(buildStaleRefreshUpdate({ rating: null, websiteUri: null }, AT), { hours_checked_at: AT });
});

Deno.test("each field stands alone: a partial answer writes only what it has", () => {
  assert.deepEqual(buildGoogleFactsUpdate({ websiteUri: "https://x.example" }, AT), { website: "https://x.example" });
  // Zero reviews is a real count, and dates the read.
  assert.deepEqual(buildGoogleFactsUpdate({ userRatingCount: 0 }, AT), {
    google_review_count: 0,
    google_rating_checked_at: AT,
  });
  assert.deepEqual(buildGoogleFactsUpdate({ reservable: false }, AT), { reservable: false });
  const refresh = buildStaleRefreshUpdate({ businessStatus: "OPERATIONAL", rating: 4.1 }, AT);
  assert.deepEqual(refresh, {
    business_status: "OPERATIONAL",
    rating: 4.1,
    google_rating_checked_at: AT,
    hours_checked_at: AT,
  });
  assert.ok(!("phone" in refresh) && !("website" in refresh) && !("price_range" in refresh));
});

Deno.test("withoutNewFactColumns drops exactly the 20261121000130 columns", () => {
  const update = buildStaleRefreshUpdate(
    { rating: 4, userRatingCount: 9, priceLevel: "PRICE_LEVEL_EXPENSIVE", websiteUri: "https://a.example" },
    AT,
  );
  const legacy = withoutNewFactColumns(update);
  for (const c of GOOGLE_FACT_NEW_COLUMNS) assert.ok(!(c in legacy), c);
  assert.equal(legacy.rating, 4);
  assert.equal(legacy.price_range, "$$$");
  assert.equal(legacy.website, "https://a.example");
  assert.equal(legacy.hours_checked_at, AT);
});

// ---------------------------------------------------------------------------
// Locks (WEB-BE-069) and their companions
// ---------------------------------------------------------------------------

const FULL = buildStaleRefreshUpdate(
  {
    rating: 4.2,
    userRatingCount: 50,
    nationalPhoneNumber: "(515) 555-0199",
    websiteUri: "https://g.example",
    priceLevel: "PRICE_LEVEL_INEXPENSIVE",
  },
  AT,
);

Deno.test("a locked rating keeps the person's number and gets no Google count or date beside it", () => {
  const { update, skipped } = withoutLockedFields(FULL, { rating: { by: "admin", at: AT } });
  for (const k of ["rating", "google_review_count", "google_rating_checked_at"]) assert.ok(!(k in update), k);
  assert.deepEqual(skipped.sort(), ["google_rating_checked_at", "google_review_count", "rating"]);
  // Counter-assertion: everything else still lands.
  assert.equal(update.phone, "(515) 555-0199");
  assert.equal(update.price_range, "$");
  assert.equal(update.hours_checked_at, AT);
});

Deno.test("a locked price is not overwritten or stamped as Google's; a locked phone is kept", () => {
  const { update } = withoutLockedFields(FULL, { price_range: { by: "admin", at: AT }, phone: { by: "owner", at: AT } });
  for (const k of ["price_range", "price_range_source", "price_range_source_at", "phone"]) assert.ok(!(k in update), k);
  assert.equal(update.rating, 4.2);
  assert.equal(update.google_review_count, 50);
  // Counter-assertion: with no locks the same update carries all of it.
  const open = withoutLockedFields(FULL, null).update;
  assert.equal(open.price_range_source, "google");
  assert.equal(open.phone, "(515) 555-0199");
});

// ---------------------------------------------------------------------------
// Price attribution
// ---------------------------------------------------------------------------

Deno.test("only a real Google price level is credited to Google", () => {
  assert.equal(placesPriceRange("PRICE_LEVEL_VERY_EXPENSIVE"), "$$$$");
  for (const level of ["PRICE_LEVEL_FREE", "PRICE_LEVEL_UNSPECIFIED", "", null, 2]) {
    assert.equal(placesPriceRange(level), null, String(level));
    const u = buildGoogleFactsUpdate({ priceLevel: level }, AT);
    assert.ok(!("price_range_source" in u), `no source for ${String(level)}`);
  }
});

Deno.test("the admin Places tool's price map is the shared one", async () => {
  const src = await read("src/components/GooglePlacesRestaurantTools.tsx");
  const block = src.slice(src.indexOf("// BEGIN pure: placesPriceRange"), src.indexOf("// END pure: placesPriceRange"));
  const pairs = Object.fromEntries([...block.matchAll(/(PRICE_LEVEL_\w+):\s*"(\$+)"/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(pairs, { ...PLACES_PRICE_RANGE });
  // And its insert records the source and the review count.
  assert.ok(src.includes('price_range_source: priceRange ? "google" : null'));
  assert.ok(src.includes("google_review_count:"));
});

// ---------------------------------------------------------------------------
// The SQL, from the real migrations
// ---------------------------------------------------------------------------

interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;
const M = (f: string) => new URL(`../../migrations/${f}`, import.meta.url);
const R = "00000000-0000-0000-0000-00000000000a";

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.current (uid uuid, admin boolean DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM auth.current LIMIT 1';
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT coalesce((SELECT admin FROM auth.current LIMIT 1), false)';
    CREATE TABLE public.business_claims (listing_type text, listing_id uuid, user_id uuid, status text);
    CREATE TABLE public.restaurants (
      id uuid PRIMARY KEY, name text, description text, website text, phone text,
      image_url text, menu_url text, cuisine text, location text, rating numeric,
      price_range text, updated_at timestamptz
    );
    CREATE TABLE public.attractions (
      id uuid PRIMARY KEY, name text, description text, website text, phone text, image_url text,
      updated_at timestamptz
    );
    CREATE TABLE public.known_venues (id uuid PRIMARY KEY, website text, phone text, updated_at timestamptz);
    INSERT INTO public.restaurants (id, name, price_range) VALUES ('${R}', 'Lucca', '$$');
  `);
  await pg.exec(await Deno.readTextFile(M("20261121000070_restaurant_locked_fields.sql")));
  await pg.exec(await Deno.readTextFile(M("20261121000130_restaurant_google_facts.sql")));
  return pg;
}

async function source(pg: PGlite) {
  return (await pg.query<{ price_range: string; price_range_source: string | null }>(
    "SELECT price_range, price_range_source FROM public.restaurants WHERE id = $1",
    [R],
  )).rows[0];
}

Deno.test("SQL: a Google write records the source, and a later Google price change keeps it", async () => {
  const pg = await db();
  await pg.query(
    "UPDATE public.restaurants SET price_range = '$$$', price_range_source = 'google', price_range_source_at = $2 WHERE id = $1",
    [R, AT],
  );
  assert.deepEqual(await source(pg), { price_range: "$$$", price_range_source: "google" });
  // Google says something else next week: new stamp, so the source stays.
  await pg.query(
    "UPDATE public.restaurants SET price_range = '$$', price_range_source = 'google', price_range_source_at = $2 WHERE id = $1",
    [R, "2026-11-28T15:00:00.000Z"],
  );
  assert.deepEqual(await source(pg), { price_range: "$$", price_range_source: "google" });
});

Deno.test("SQL: a price written by anyone else stops being credited to Google", async () => {
  const pg = await db();
  await pg.query(
    "UPDATE public.restaurants SET price_range = '$$$', price_range_source = 'google', price_range_source_at = $2 WHERE id = $1",
    [R, AT],
  );
  // Counter-assertion first: an edit that leaves the price alone keeps the source.
  await pg.query("UPDATE public.restaurants SET phone = '(515) 555-0100' WHERE id = $1", [R]);
  assert.equal((await source(pg)).price_range_source, "google");
  await pg.query("UPDATE public.restaurants SET price_range = '$$$$' WHERE id = $1", [R]);
  assert.deepEqual(await source(pg), { price_range: "$$$$", price_range_source: null });
});

Deno.test("SQL: price_range is lockable, and the source column rejects unknown values", async () => {
  const pg = await db();
  const lockable = (await pg.query<{ f: string[] }>("SELECT public.restaurant_lockable_fields() AS f")).rows[0].f;
  assert.ok(lockable.includes("price_range"));
  // The WEB-BE-069 names are all still there.
  for (const f of ["description", "website", "phone", "image_url", "menu_url", "cuisine", "location", "rating"]) {
    assert.ok(lockable.includes(f), f);
  }
  await pg.query("INSERT INTO auth.current VALUES (NULL, true)");
  const locks = await pg.query<{ m: Record<string, unknown> }>(
    "SELECT public.set_restaurant_field_locks($1, ARRAY['price_range', 'name']) AS m",
    [R],
  );
  assert.deepEqual(Object.keys(locks.rows[0].m), ["price_range"]);
  await assert.rejects(pg.query("UPDATE public.restaurants SET price_range_source = 'model' WHERE id = $1", [R]));
  await assert.rejects(pg.query("UPDATE public.restaurants SET google_review_count = -1 WHERE id = $1", [R]));
});
