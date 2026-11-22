// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/restaurant-field-locks.test.ts
//
// WEB-BE-069: a field an owner or admin set on a restaurant is not overwritten
// by the next Google enrichment. The pure rule (withoutLockedFields), the
// places bulk-update-restaurants applies it, and the two SQL writers of
// restaurants.locked_fields run from the real migration in PGlite.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";
import {
  lockedFieldNames,
  selectWithLocks,
  withLocksColumn,
  withoutLockedFields,
} from "../_shared/restaurantFieldLocks.ts";
import { descriptionUpdate } from "../_shared/restaurantEnrich.ts";

const BULK = new URL("../bulk-update-restaurants/index.ts", import.meta.url);
const M = (f: string) => new URL(`../../migrations/${f}`, import.meta.url);

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

Deno.test("enriching a row with a locked phone keeps the phone and updates the unlocked fields", () => {
  // The row as bulk-update-restaurants reads it: the owner corrected the phone.
  const row = {
    id: "00000000-0000-0000-0000-00000000000a",
    name: "Lucca",
    description: "Owner's own words",
    locked_fields: { phone: { by: "owner", at: "2026-11-20T12:00:00Z" } },
  };
  // What Google answered, mapped the way the enrichment maps it.
  const place = { nationalPhoneNumber: "(515) 555-0000", rating: 4.66, formattedAddress: "420 E Locust St" };
  const update = {
    id: row.id,
    name: row.name,
    enhanced: "completed",
    updated_at: "2026-11-21T00:00:00Z",
    phone: place.nationalPhoneNumber,
    rating: Math.round(place.rating * 10) / 10,
    location: place.formattedAddress,
    ...descriptionUpdate(row.description, "Google's summary"),
  };

  const { update: written, skipped } = withoutLockedFields(update, row.locked_fields);

  assert.deepEqual(skipped, ["phone"]);
  assert.equal("phone" in written, false, "a locked phone must not be written");
  assert.equal(written.rating, 4.7, "an unlocked field still updates");
  assert.equal(written.location, "420 E Locust St");
  assert.equal(written.description, "Google's summary", "description is not locked on this row");
  assert.equal(written.enhanced, "completed");
  assert.equal(written.id, row.id);
  // The input is left as it was.
  assert.equal(update.phone, "(515) 555-0000");
});

Deno.test("counter-check: with no lock the same update writes the phone", () => {
  const update = { id: "x", name: "n", updated_at: "t", phone: "(515) 555-0000", rating: 4.7 };
  for (const locks of [null, undefined, {}, "phone", ["phone"], 42]) {
    const { update: written, skipped } = withoutLockedFields(update, locks);
    assert.equal(written.phone, "(515) 555-0000", JSON.stringify(locks));
    assert.deepEqual(skipped, []);
  }
});

Deno.test("a lock never removes the row id or the run's own stamps", () => {
  const locks = {
    id: {}, name: {}, updated_at: {}, enhanced: {}, enrich_checked_at: {}, hours_checked_at: {},
    place_lookup_checked_at: {}, website: {},
  };
  assert.deepEqual([...lockedFieldNames(locks)], ["website"]);
  const { update } = withoutLockedFields(
    { id: "x", name: "n", updated_at: "t", enhanced: "completed", hours_checked_at: "t", website: "w" },
    locks,
  );
  assert.deepEqual(Object.keys(update).sort(), ["enhanced", "hours_checked_at", "id", "name", "updated_at"]);
});

Deno.test("the hours refresh keeps a locked hours_json and still records the check", () => {
  const { update, skipped } = withoutLockedFields(
    { hours_json: { periods: [] }, business_status: "OPERATIONAL", hours_checked_at: "t" },
    { hours_json: { by: "owner", at: "t" } },
  );
  assert.deepEqual(skipped, ["hours_json"]);
  assert.deepEqual(update, { business_status: "OPERATIONAL", hours_checked_at: "t" });
});

Deno.test("selectWithLocks asks for locked_fields and falls back when the column is missing", async () => {
  const asked: string[] = [];
  const ok = await selectWithLocks((cols) => {
    asked.push(cols);
    return Promise.resolve({ data: [{ id: "a" }], error: null });
  }, "id, name");
  assert.deepEqual(asked, [withLocksColumn("id, name")]);
  assert.equal(ok.locksRead, true);

  asked.length = 0;
  const pending = await selectWithLocks((cols) => {
    asked.push(cols);
    return Promise.resolve(
      cols.includes("locked_fields")
        ? { data: null, error: { code: "42703", message: "column restaurants.locked_fields does not exist" } }
        : { data: [{ id: "a" }], error: null },
    );
  }, "id, name");
  assert.deepEqual(asked, ["id, name, locked_fields", "id, name"]);
  assert.equal(pending.locksRead, false);
  assert.deepEqual(pending.data, [{ id: "a" }]);

  // Any other error is returned, not retried.
  asked.length = 0;
  const failed = await selectWithLocks((cols) => {
    asked.push(cols);
    return Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } });
  }, "id");
  assert.equal(asked.length, 1);
  assert.equal(failed.error?.code, "57014");
});

// ---------------------------------------------------------------------------
// Where bulk-update-restaurants applies it
// ---------------------------------------------------------------------------

function slice(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, `${from} .. ${to} not found`);
  return src.slice(a, b);
}

Deno.test("bulk-update-restaurants reads locks and drops locked fields in every write path", async () => {
  const src = await Deno.readTextFile(BULK);

  const fill = slice(src, "async function refreshHoursOnly", "async function refreshStaleHours");
  assert.match(fill, /selectWithLocks\(/);
  assert.match(fill, /withoutLockedFields\(built, row\.locked_fields\)[\s\S]*\.update\(update\)/);

  const stale = slice(src, "async function refreshStaleHours", "async function queueClosureReview");
  assert.match(stale, /selectWithLocks\(/);
  assert.match(stale, /withoutLockedFields\(update, row\.locked_fields\)[\s\S]*\.update\(update\)/);

  const full = src.slice(src.indexOf("const restaurantIds = parseRestaurantIds"));
  assert.match(full, /selectWithLocks<EnrichRow>\(\s*\(cols\) => applyEnrichTargets\(/);
  assert.match(full, /withoutLockedFields\(update, restaurant\.locked_fields\)/);
  // Every push of an enriched update goes through the strip. The other push is
  // the stamp-only write for an unmatched row, which carries no Google field.
  const pushes = [...full.matchAll(/updates\.push\(([^\s)]*)/g)].map((m) => m[1].trim());
  assert.deepEqual(pushes, ["{", "kept.update"]);
});

// ---------------------------------------------------------------------------
// The SQL writers, from the real migration
// ---------------------------------------------------------------------------

interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const R = "00000000-0000-0000-0000-00000000000a";
const ATT = "00000000-0000-0000-0000-0000000000a7";
const OWNER = "00000000-0000-0000-0000-0000000000f1";
const OTHER = "00000000-0000-0000-0000-0000000000f2";

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
      updated_at timestamptz
    );
    CREATE TABLE public.attractions (
      id uuid PRIMARY KEY, name text, description text, website text, phone text, image_url text,
      updated_at timestamptz
    );
    CREATE TABLE public.known_venues (id uuid PRIMARY KEY, website text, phone text, updated_at timestamptz);
    INSERT INTO public.restaurants (id, name, phone) VALUES ('${R}', 'Lucca', '(515) 555-0000');
    INSERT INTO public.attractions (id, name) VALUES ('${ATT}', 'Science Center');
    INSERT INTO public.business_claims VALUES
      ('restaurant', '${R}', '${OWNER}', 'verified'),
      ('attraction', '${ATT}', '${OWNER}', 'verified');
  `);
  await pg.exec(await Deno.readTextFile(M("20261121000070_restaurant_locked_fields.sql")));
  return pg;
}

async function as(pg: PGlite, uid: string | null, admin = false) {
  await pg.query("DELETE FROM auth.current");
  if (uid || admin) await pg.query("INSERT INTO auth.current VALUES ($1, $2)", [uid, admin]);
}

async function row(pg: PGlite) {
  return (await pg.query<{ phone: string; website: string | null; locked_fields: Record<string, { by: string; at: string }> | null }>(
    "SELECT phone, website, locked_fields FROM public.restaurants WHERE id = $1",
    [R],
  )).rows[0];
}

async function errMessage(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

Deno.test("update_claimed_listing writes the owner's value and locks each field it set", async () => {
  const pg = await db();
  await as(pg, OWNER);
  const r = await pg.query<{ ok: boolean }>(
    "SELECT public.update_claimed_listing('restaurant', $1, $2::jsonb) AS ok",
    [R, JSON.stringify({ phone: "(515) 555-1234", website: "https://lucca.example" })],
  );
  assert.equal(r.rows[0].ok, true);
  const after = await row(pg);
  assert.equal(after.phone, "(515) 555-1234");
  assert.equal(after.website, "https://lucca.example");
  assert.deepEqual(Object.keys(after.locked_fields ?? {}).sort(), ["phone", "website"]);
  assert.equal(after.locked_fields?.phone.by, "owner");
  assert.ok(after.locked_fields?.phone.at, "the lock records when");
  assert.equal(JSON.stringify(after.locked_fields).includes(OWNER), false, "no user id in a public row");

  // A second edit adds to the map; it does not replace it.
  await pg.query("SELECT public.update_claimed_listing('restaurant', $1, $2::jsonb)", [R, JSON.stringify({ description: "Ours" })]);
  assert.deepEqual(Object.keys((await row(pg)).locked_fields ?? {}).sort(), ["description", "phone", "website"]);
});

Deno.test("update_claimed_listing keeps its old refusals and leaves other listing types alone", async () => {
  const pg = await db();
  await as(pg, OTHER);
  assert.match(
    (await errMessage(pg.query("SELECT public.update_claimed_listing('restaurant', $1, '{\"phone\":\"1\"}'::jsonb)", [R]))) ?? "",
    /not verified this listing/,
  );
  await as(pg, OWNER);
  assert.match(
    (await errMessage(pg.query("SELECT public.update_claimed_listing('restaurant', $1, '{\"cuisine\":\"x\"}'::jsonb)", [R]))) ?? "",
    /not an owner-editable field/,
  );
  assert.equal((await row(pg)).locked_fields, null, "a refused edit locks nothing");
  const empty = await pg.query<{ ok: boolean }>("SELECT public.update_claimed_listing('restaurant', $1, '{}'::jsonb) AS ok", [R]);
  assert.equal(empty.rows[0].ok, false);

  // attractions has no locked_fields column; the edit must still work.
  const att = await pg.query<{ ok: boolean }>(
    "SELECT public.update_claimed_listing('attraction', $1, '{\"phone\":\"(515) 555-9999\"}'::jsonb) AS ok",
    [ATT],
  );
  assert.equal(att.rows[0].ok, true);
  const a = await pg.query<{ phone: string }>("SELECT phone FROM public.attractions WHERE id = $1", [ATT]);
  assert.equal(a.rows[0].phone, "(515) 555-9999");
});

Deno.test("set_restaurant_field_locks: admins lock lockable fields and clear a lock", async () => {
  const pg = await db();
  await as(pg, OWNER);
  await pg.query("SELECT public.update_claimed_listing('restaurant', $1, '{\"phone\":\"(515) 555-1234\"}'::jsonb)", [R]);

  await as(pg, null, true);
  const locked = await pg.query<{ m: Record<string, { by: string }> }>(
    "SELECT public.set_restaurant_field_locks($1, ARRAY['cuisine','name','status'], '{}') AS m",
    [R],
  );
  assert.deepEqual(Object.keys(locked.rows[0].m).sort(), ["cuisine", "phone"], "name and status are not lockable");
  assert.equal(locked.rows[0].m.cuisine.by, "admin");
  assert.equal(locked.rows[0].m.phone.by, "owner", "an owner's lock is kept");

  const cleared = await pg.query<{ m: Record<string, unknown> }>(
    "SELECT public.set_restaurant_field_locks($1, '{}', ARRAY['phone']) AS m",
    [R],
  );
  assert.deepEqual(Object.keys(cleared.rows[0].m), ["cuisine"]);
  assert.equal((await row(pg)).phone, "(515) 555-1234", "clearing a lock does not change the value");

  await pg.query("SELECT public.set_restaurant_field_locks($1, '{}', ARRAY['cuisine'])", [R]);
  assert.equal((await row(pg)).locked_fields, null, "an empty map is stored as null");
});

Deno.test("set_restaurant_field_locks refuses anyone who is not an admin", async () => {
  const pg = await db();
  for (const uid of [OWNER, null]) {
    await as(pg, uid, false);
    assert.match(
      (await errMessage(pg.query("SELECT public.set_restaurant_field_locks($1, ARRAY['phone'], '{}')", [R]))) ?? "",
      /admins only/,
    );
  }
  assert.equal((await row(pg)).locked_fields, null);
});
