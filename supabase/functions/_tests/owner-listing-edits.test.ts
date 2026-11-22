// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/owner-listing-edits.test.ts
//
// WEB-ADS-048: a verified owner sets weekly hours, reports a closure or a
// reopening, and uploads a photo; every owner write is recorded with before
// and after values; an unknown or paid-placement field is still refused.
// update_claimed_listing, report_owner_listing_status and
// resolve_closure_review run from the real migrations in PGlite.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";
import { withoutLockedFields } from "../_shared/restaurantFieldLocks.ts";
import { isRestaurantPromotable, restaurantPromotionRefusal } from "../_shared/sponsoredPickFilters.ts";

interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const M = (f: string) => new URL(`../../migrations/${f}`, import.meta.url);

const R = "00000000-0000-0000-0000-00000000000a";
const ATT = "00000000-0000-0000-0000-0000000000a7";
const OWNER = "00000000-0000-0000-0000-0000000000f1";
const OTHER = "00000000-0000-0000-0000-0000000000f2";
const GOOGLE_FETCHED = "2026-11-01T09:41:00.000Z";
const BASE = "https://abc.supabase.co/storage/v1/object/public/media";

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA storage;
    CREATE TABLE auth.current (uid uuid, admin boolean DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM auth.current LIMIT 1';
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT coalesce((SELECT admin FROM auth.current LIMIT 1), false)';
    CREATE FUNCTION extensions.digest(t text, alg text) RETURNS bytea LANGUAGE sql AS 'SELECT sha256(convert_to(t, ''UTF8''))';
    CREATE FUNCTION extensions.gen_random_bytes(n int) RETURNS bytea LANGUAGE sql AS 'SELECT sha256(convert_to(random()::text, ''UTF8''))';
    CREATE TABLE storage.objects (bucket_id text, name text, metadata jsonb);
    CREATE TABLE public.business_claims (listing_type text, listing_id uuid, user_id uuid, status text);
    CREATE TABLE public.restaurants (
      id uuid PRIMARY KEY, name text, description text, website text, phone text,
      image_url text, menu_url text, cuisine text, location text, rating numeric,
      is_featured boolean DEFAULT false, is_sponsored boolean DEFAULT false, popularity_score numeric,
      status text DEFAULT 'open', business_status text, is_merged boolean DEFAULT false,
      hours_json jsonb, hours_checked_at timestamptz, opening_date date,
      updated_at timestamptz
    );
    CREATE TABLE public.attractions (
      id uuid PRIMARY KEY, name text, description text, website text, phone text, image_url text,
      updated_at timestamptz
    );
    CREATE TABLE public.known_venues (id uuid PRIMARY KEY, website text, phone text, updated_at timestamptz);
    INSERT INTO public.restaurants (id, name, description, phone, business_status, hours_json) VALUES (
      '${R}', 'Lucca', 'Google wrote this', '(515) 555-0000', 'OPERATIONAL',
      '{"version":1,"timeZone":"America/Chicago","periods":[{"open":{"day":1,"hour":9,"minute":0},"close":{"day":1,"hour":17,"minute":0}}],"weekdayDescriptions":["Monday: 9 AM - 5 PM"],"source":"google-places","fetchedAt":"${GOOGLE_FETCHED}"}'
    );
    INSERT INTO public.attractions (id, name) VALUES ('${ATT}', 'Science Center');
    INSERT INTO public.business_claims VALUES
      ('restaurant', '${R}', '${OWNER}', 'verified'),
      ('attraction', '${ATT}', '${OWNER}', 'verified');
    INSERT INTO storage.objects VALUES
      ('media', '${OWNER}/listing-photos/${R}/1.jpg', '{"mimetype":"image/jpeg","size":120000}'),
      ('media', '${OTHER}/listing-photos/${R}/1.jpg', '{"mimetype":"image/jpeg","size":120000}'),
      ('media', '${OWNER}/listing-photos/${R}/2.gif', '{"mimetype":"image/gif","size":1000}'),
      ('media', '${OWNER}/listing-photos/${R}/3.jpg', '{"mimetype":"image/jpeg","size":9000000}'),
      ('media', '${OWNER}/other/4.jpg', '{"mimetype":"image/jpeg","size":1000}');
  `);
  for (const f of [
    "20261121000010_restaurant_closure_reviews.sql",
    "20261121000020_restaurant_closed_flag_sync.sql",
    "20261121000030_restaurant_closure_reports.sql",
    "20261121000070_restaurant_locked_fields.sql",
    "20261121000110_restaurant_changes.sql",
    "20261121000120_restaurant_opening_progress.sql",
    "20261121000150_owner_hours_status_photos.sql",
  ]) {
    await pg.exec(await Deno.readTextFile(M(f)));
  }
  return pg;
}

async function as(pg: PGlite, uid: string | null, admin = false) {
  await pg.query("DELETE FROM auth.current");
  if (uid || admin) await pg.query("INSERT INTO auth.current VALUES ($1, $2)", [uid, admin]);
}

async function errMessage(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

async function one<T>(pg: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  return (await pg.query<T>(sql, params)).rows[0];
}

const edit = (pg: PGlite, patch: unknown, type = "restaurant", id = R) =>
  pg.query<{ ok: boolean }>("SELECT public.update_claimed_listing($1, $2, $3::jsonb) AS ok", [type, id, JSON.stringify(patch)]);

const status = (pg: PGlite, s: string, note: string | null = null) =>
  pg.query<{ r: { result: string } }>("SELECT public.report_owner_listing_status($1, $2, $3) AS r", [R, s, note]);

const p = (od: number, oh: number, om: number, cd: number, ch: number, cm: number) => ({
  open: { day: od, hour: oh, minute: om },
  close: { day: cd, hour: ch, minute: cm },
});

interface RestaurantRow {
  description: string | null;
  phone: string | null;
  image_url: string | null;
  rating: number | null;
  status: string;
  business_status: string | null;
  promotion_hold_reason: string | null;
  hours_json: Record<string, unknown> | null;
  hours_checked_at: string | null;
  locked_fields: Record<string, { by: string; at: string }> | null;
}
const restaurant = (pg: PGlite) =>
  one<RestaurantRow>(
    pg,
    `SELECT description, phone, image_url, rating, status, business_status, promotion_hold_reason, hours_json,
            to_char(hours_checked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS hours_checked_at, locked_fields
       FROM restaurants WHERE id = $1`,
    [R],
  );

// ---------------------------------------------------------------------------
// Hours
// ---------------------------------------------------------------------------

Deno.test("an owner sets weekly hours: stored with source owner, locked, and the Places refresh keeps them", async () => {
  const pg = await db();
  await as(pg, OWNER);
  // Sent out of order; Friday runs past midnight.
  await edit(pg, {
    hours_json: { periods: [p(5, 17, 0, 6, 1, 30), p(1, 11, 0, 1, 14, 0), p(1, 16, 30, 1, 22, 0)] },
  });
  const r = await restaurant(pg);
  const h = r.hours_json as {
    source: string; timeZone: string; version: number; setAt: string; fetchedAt?: string;
    periods: Array<{ open: { day: number; hour: number } }>; weekdayDescriptions: string[];
  };
  assert.equal(h.source, "owner");
  assert.equal(h.timeZone, "America/Chicago");
  assert.equal(h.version, 1);
  assert.ok(h.setAt);
  assert.equal(h.fetchedAt, undefined, "an owner save is not a Google check");
  assert.deepEqual(h.periods.map((x) => [x.open.day, x.open.hour]), [[1, 11], [1, 16], [5, 17]]);
  assert.deepEqual(h.weekdayDescriptions, [
    "Monday: 11:00 AM - 2:00 PM, 4:30 PM - 10:00 PM",
    "Tuesday: Closed",
    "Wednesday: Closed",
    "Thursday: Closed",
    "Friday: 5:00 PM - 1:30 AM",
    "Saturday: Closed",
    "Sunday: Closed",
  ]);
  assert.equal(r.locked_fields?.hours_json.by, "owner");
  // The Google check that fetchedAt recorded is kept on hours_checked_at.
  assert.equal(r.hours_checked_at, GOOGLE_FETCHED.slice(0, 19));

  // What the hours refresh then writes for this row (WEB-BE-069 strip).
  const refresh = { hours_json: { source: "google-places", periods: [] }, business_status: "OPERATIONAL", hours_checked_at: "now" };
  const { update, skipped } = withoutLockedFields(refresh, r.locked_fields);
  assert.deepEqual(skipped, ["hours_json"]);
  assert.deepEqual(Object.keys(update).sort(), ["business_status", "hours_checked_at"]);
});

Deno.test("counter-check: before the owner saves hours, the refresh writes Google's hours", async () => {
  const pg = await db();
  const r = await restaurant(pg);
  const { skipped, update } = withoutLockedFields({ hours_json: { periods: [] } }, r.locked_fields);
  assert.deepEqual(skipped, []);
  assert.ok("hours_json" in update);
});

Deno.test("hours that are not real are refused and change nothing", async () => {
  const pg = await db();
  await as(pg, OWNER);
  const cases: Array<[unknown, RegExp]> = [
    [{ periods: [] }, /at least one opening time/],
    [{ periods: [p(1, 14, 0, 1, 11, 0)] }, /after its opening time/],
    [{ periods: [p(1, 11, 0, 3, 1, 0)] }, /after its opening time/],
    [{ periods: [p(1, 11, 0, 1, 15, 0), p(1, 14, 0, 1, 20, 0)] }, /overlap/],
    [{ periods: [p(6, 20, 0, 0, 3, 0), p(0, 2, 0, 0, 9, 0)] }, /overlap/],
    [{ periods: [p(7, 11, 0, 7, 12, 0)] }, /not a real day and time/],
    [{ periods: [p(1, 11.5, 0, 1, 12, 0)] }, /not a real day and time/],
    [{ periods: [{ open: { day: 1, hour: 11 } }] }, /open and a close/],
    [{ periods: "Mon 11-2" }, /periods list/],
    ["11 to 2", /periods list/],
  ];
  for (const [hours, re] of cases) {
    assert.match((await errMessage(edit(pg, { hours_json: hours }))) ?? "no error", re, JSON.stringify(hours));
  }
  const r = await restaurant(pg);
  assert.equal((r.hours_json as { source: string }).source, "google-places");
  assert.equal(r.locked_fields, null);
  assert.equal((await one<{ n: number }>(pg, "SELECT count(*)::int AS n FROM listing_owner_edits")).n, 0);
});

Deno.test("clearing owner hours removes the lock so Google fills them again", async () => {
  const pg = await db();
  await as(pg, OWNER);
  await edit(pg, { hours_json: { periods: [p(2, 8, 0, 2, 12, 0)] }, phone: "(515) 555-1111" });
  await edit(pg, { hours_json: null });
  const r = await restaurant(pg);
  assert.equal(r.hours_json, null);
  assert.deepEqual(Object.keys(r.locked_fields ?? {}), ["phone"], "the phone lock stays");
  const { skipped } = withoutLockedFields({ hours_json: {} }, r.locked_fields);
  assert.deepEqual(skipped, []);
});

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

Deno.test("a photo must be one the owner uploaded: jpeg/png/webp, 5 MB or less, in their own folder", async () => {
  const pg = await db();
  await as(pg, OWNER);
  const refused = [
    "https://example.com/lucca.jpg",
    `${BASE}/${OTHER}/listing-photos/${R}/1.jpg`,
    `${BASE}/${OWNER}/listing-photos/${R}/never-uploaded.jpg`,
    `${BASE}/${OWNER}/listing-photos/${R}/2.gif`,
    `${BASE}/${OWNER}/listing-photos/${R}/3.jpg`,
    `${BASE}/${OWNER}/other/4.jpg`,
    `${BASE}/${OWNER}/listing-photos/../../${OTHER}/listing-photos/${R}/1.jpg`,
    `http://abc.supabase.co/storage/v1/object/public/media/${OWNER}/listing-photos/${R}/1.jpg`,
  ];
  for (const url of refused) {
    assert.match((await errMessage(edit(pg, { image_url: url }))) ?? "no error", /upload the photo/, url);
    assert.match((await errMessage(edit(pg, { image_url: url }, "attraction", ATT))) ?? "no error", /upload the photo/, url);
  }
  assert.equal((await restaurant(pg)).image_url, null);

  // The counter-assertion: the owner's own upload is accepted.
  const good = `${BASE}/${OWNER}/listing-photos/${R}/1.jpg`;
  assert.equal((await edit(pg, { image_url: good })).rows[0].ok, true);
  assert.equal((await restaurant(pg)).image_url, good);
  assert.equal((await restaurant(pg)).locked_fields?.image_url.by, "owner");
  assert.equal((await edit(pg, { image_url: good }, "attraction", ATT)).rows[0].ok, true);
  // Removing the photo is allowed.
  await edit(pg, { image_url: null });
  assert.equal((await restaurant(pg)).image_url, null);
});

// ---------------------------------------------------------------------------
// Whitelist
// ---------------------------------------------------------------------------

Deno.test("an unknown, rating or paid-placement field is still refused, and the old refusals hold", async () => {
  const pg = await db();
  await as(pg, OWNER);
  for (const key of [
    "rating", "is_featured", "is_sponsored", "sponsored_until", "popularity_score",
    "status", "business_status", "promotion_hold_reason", "locked_fields", "cuisine", "name", "made_up",
  ]) {
    assert.match(
      (await errMessage(edit(pg, { [key]: "x", phone: "(515) 555-2222" }))) ?? "no error",
      /is not an owner-editable field/,
      key,
    );
  }
  // hours_json is a restaurant field only.
  assert.match(
    (await errMessage(edit(pg, { hours_json: { periods: [p(1, 9, 0, 1, 10, 0)] } }, "attraction", ATT))) ?? "",
    /is not an owner-editable field/,
  );
  const r = await restaurant(pg);
  assert.equal(r.phone, "(515) 555-0000", "a refused patch writes none of its fields");
  assert.equal((await one<{ n: number }>(pg, "SELECT count(*)::int AS n FROM listing_owner_edits")).n, 0);

  await as(pg, OTHER);
  assert.match((await errMessage(edit(pg, { phone: "1" }))) ?? "", /not verified this listing/);
  await as(pg, null);
  assert.match((await errMessage(edit(pg, { phone: "1" }))) ?? "", /sign in first/);
  await as(pg, OWNER);
  assert.equal((await edit(pg, {})).rows[0].ok, false);
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

Deno.test("every owner edit is recorded with full before and after values", async () => {
  const pg = await db();
  await as(pg, OWNER);
  const longText = "Our own words. ".repeat(40);
  await edit(pg, { description: longText, phone: "(515) 555-3333" });
  await edit(pg, { phone: "(515) 555-0000" }, "attraction", ATT);

  const rows = (await pg.query<{
    listing_type: string; user_id: string; action: string;
    old_values: Record<string, unknown>; new_values: Record<string, unknown>;
  }>("SELECT listing_type, user_id, action, old_values, new_values FROM listing_owner_edits ORDER BY id")).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].user_id, OWNER);
  assert.equal(rows[0].action, "edit");
  assert.deepEqual(rows[0].old_values, { description: "Google wrote this", phone: "(515) 555-0000" });
  assert.deepEqual(rows[0].new_values, { description: longText, phone: "(515) 555-3333" });
  assert.equal(rows[1].listing_type, "attraction", "attractions are recorded too");
  assert.deepEqual(rows[1].old_values, { phone: null });

  // restaurant_changes (WEB-BE-075) keeps the long description as a marker
  // only; listing_owner_edits is what carries the text.
  const rc = await one<{ actor: string; new_values: Record<string, unknown> }>(
    pg,
    "SELECT actor, new_values FROM restaurant_changes WHERE 'description' = ANY(columns) ORDER BY id DESC LIMIT 1",
  );
  assert.equal(rc.actor, `person:${OWNER}`);
  assert.deepEqual(rc.new_values.description, { changed: true });

  // An owner reads their own history; RLS is not exercised in PGlite, so the
  // policy text is checked instead.
  const pol = await one<{ qual: string }>(
    pg,
    "SELECT qual FROM pg_policies WHERE tablename = 'listing_owner_edits' AND cmd = 'SELECT'",
  );
  assert.match(pol.qual, /user_id = auth\.uid\(\)/);
  assert.match(pol.qual, /is_admin\(\)/);
});

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const promotableRow = (r: RestaurantRow) => ({
  ...r,
  hours_checked_at: new Date().toISOString(),
});

Deno.test("closed for good: queued for review and out of promotion at once, the listing itself not closed", async () => {
  const pg = await db();
  assert.equal(isRestaurantPromotable(promotableRow(await restaurant(pg))), true, "promotable before the report");

  await as(pg, OWNER);
  const res = await status(pg, "closed_permanently", "  Last service was Saturday  ");
  assert.equal(res.rows[0].r.result, "queued");

  const r = await restaurant(pg);
  assert.equal(r.promotion_hold_reason, "owner_closed");
  assert.equal(r.status, "open", "an admin closes it from the queue");
  assert.equal(restaurantPromotionRefusal(promotableRow(r)), "held");

  const review = await one<{ reason: string; source: string; details: Record<string, string> }>(
    pg,
    "SELECT reason, source, details FROM restaurant_closure_reviews WHERE resolved_at IS NULL",
  );
  assert.equal(review.reason, "owner_report");
  assert.equal(review.source, "owner");
  assert.deepEqual(review.details, { kind: "closed_permanently", note: "Last service was Saturday" });

  // A second tap does not add a second finding.
  await status(pg, "closed_permanently");
  assert.equal((await one<{ n: number }>(pg, "SELECT count(*)::int AS n FROM restaurant_closure_reviews")).n, 1);

  const audit = await one<{ action: string; old_values: Record<string, unknown>; new_values: Record<string, unknown> }>(
    pg,
    "SELECT action, old_values, new_values FROM listing_owner_edits ORDER BY id LIMIT 1",
  );
  assert.equal(audit.action, "status:closed_permanently");
  assert.deepEqual(audit.old_values, { business_status: "OPERATIONAL", promotion_hold_reason: null });
  assert.equal(audit.new_values.promotion_hold_reason, "owner_closed");

  // The admin approves: the listing closes.
  await as(pg, null, true);
  const id = (await one<{ id: string }>(pg, "SELECT id FROM restaurant_closure_reviews")).id;
  await pg.query("SELECT public.resolve_closure_review($1, 'approve', NULL)", [id]);
  assert.equal((await restaurant(pg)).status, "closed");
});

Deno.test("dismissing the owner's report lifts the owner_closed hold; another open finding keeps it", async () => {
  const pg = await db();
  await as(pg, OWNER);
  await status(pg, "closed_permanently");
  await as(pg, null, true);
  // A place_not_found finding on the same row is still open.
  await pg.query(
    "INSERT INTO restaurant_closure_reviews (restaurant_id, reason, source) VALUES ($1, 'place_not_found', 'test')",
    [R],
  );
  const ownerReview = (await one<{ id: string }>(pg, "SELECT id FROM restaurant_closure_reviews WHERE reason = 'owner_report'")).id;
  await pg.query("SELECT public.resolve_closure_review($1, 'dismiss', 'Called them, still open')", [ownerReview]);
  assert.equal((await restaurant(pg)).promotion_hold_reason, "owner_closed", "place_not_found still justifies a hold");

  const other = (await one<{ id: string }>(pg, "SELECT id FROM restaurant_closure_reviews WHERE reason = 'place_not_found'")).id;
  await pg.query("SELECT public.resolve_closure_review($1, 'dismiss', 'Place id fixed')", [other]);
  assert.equal((await restaurant(pg)).promotion_hold_reason, null);
});

Deno.test("temporarily closed, then reopened: business_status set and locked, report withdrawn, hold lifted", async () => {
  const pg = await db();
  await as(pg, OWNER);
  await status(pg, "temporarily_closed");
  let r = await restaurant(pg);
  assert.equal(r.business_status, "CLOSED_TEMPORARILY");
  assert.equal(r.locked_fields?.business_status.by, "owner");
  assert.equal(restaurantPromotionRefusal(promotableRow(r)), "not_operational");
  // The refresh keeps the owner's answer.
  assert.deepEqual(withoutLockedFields({ business_status: "OPERATIONAL" }, r.locked_fields).skipped, ["business_status"]);

  await status(pg, "closed_permanently");
  const res = await status(pg, "reopened");
  assert.equal(res.rows[0].r.result, "reopened");
  r = await restaurant(pg);
  assert.equal(r.business_status, "OPERATIONAL");
  assert.equal(r.promotion_hold_reason, null);
  const review = await one<{ resolution: string; resolved_by: string }>(
    pg,
    "SELECT resolution, resolved_by FROM restaurant_closure_reviews WHERE reason = 'owner_report'",
  );
  assert.match(review.resolution, /withdrawn/);
  assert.equal(review.resolved_by, OWNER);
  assert.deepEqual(
    (await pg.query<{ action: string }>("SELECT action FROM listing_owner_edits ORDER BY id")).rows.map((x) => x.action),
    ["status:temporarily_closed", "status:closed_permanently", "status:reopened"],
  );
});

Deno.test("reopening keeps a hold the owner did not cause, and is refused on a listing closed for good", async () => {
  const pg = await db();
  await pg.query("UPDATE restaurants SET promotion_hold_reason = 'visitor_reports' WHERE id = $1", [R]);
  await as(pg, OWNER);
  await status(pg, "reopened");
  assert.equal((await restaurant(pg)).promotion_hold_reason, "visitor_reports");

  await pg.query("UPDATE restaurants SET status = 'closed' WHERE id = $1", [R]);
  for (const s of ["reopened", "temporarily_closed"]) {
    assert.match((await errMessage(status(pg, s))) ?? "no error", /closed for good/);
  }
});

Deno.test("status reports are refused for anyone without a verified claim, and for a made-up status", async () => {
  const pg = await db();
  await as(pg, OTHER);
  assert.match((await errMessage(status(pg, "closed_permanently"))) ?? "", /not verified this listing/);
  await as(pg, null);
  assert.match((await errMessage(status(pg, "closed_permanently"))) ?? "", /sign in first/);
  await as(pg, OWNER);
  assert.match((await errMessage(status(pg, "open_forever"))) ?? "", /not a status you can report/);
  const r = await restaurant(pg);
  assert.equal(r.promotion_hold_reason, null);
  assert.equal(r.business_status, "OPERATIONAL");
  assert.equal((await one<{ n: number }>(pg, "SELECT count(*)::int AS n FROM restaurant_closure_reviews")).n, 0);
});
