// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/restaurant-closure-reports.test.ts
//
// WEB-FEAT-102: report_restaurant_closed and resolve_closure_review, run from
// the real migrations in PGlite against a minimal schema.

import { strict as assert } from "node:assert";
import { PGlite } from "npm:@electric-sql/pglite@0.3.15";

const M = (f: string) => new URL(`../../migrations/${f}`, import.meta.url);

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE TABLE auth.current (uid uuid, admin boolean DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM auth.current LIMIT 1';
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT coalesce((SELECT admin FROM auth.current LIMIT 1), false)';
    CREATE FUNCTION extensions.digest(t text, alg text) RETURNS bytea LANGUAGE sql AS 'SELECT sha256(convert_to(t, ''UTF8''))';
    CREATE FUNCTION extensions.gen_random_bytes(n int) RETURNS bytea LANGUAGE sql AS 'SELECT sha256(convert_to(random()::text, ''UTF8''))';
    CREATE TABLE public.restaurants (
      id uuid PRIMARY KEY, name text, is_merged boolean DEFAULT false,
      status text DEFAULT 'open', business_status text
    );
    INSERT INTO public.restaurants (id, name) VALUES
      ('00000000-0000-0000-0000-00000000000a', 'A'),
      ('00000000-0000-0000-0000-00000000000b', 'B');
    INSERT INTO public.restaurants (id, name, is_merged) VALUES ('00000000-0000-0000-0000-00000000000c', 'merged', true);
  `);
  for (const f of [
    "20261121000010_restaurant_closure_reviews.sql",
    "20261121000020_restaurant_closed_flag_sync.sql",
    "20261121000030_restaurant_closure_reports.sql",
  ]) {
    await pg.exec(await Deno.readTextFile(M(f)));
  }
  return pg;
}

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

async function asClient(pg: PGlite, ip: string, uid: string | null = null, admin = false) {
  await pg.query("DELETE FROM auth.current");
  if (uid || admin) await pg.query("INSERT INTO auth.current VALUES ($1, $2)", [uid, admin]);
  await pg.query(`SELECT set_config('request.headers', $1, false)`, [JSON.stringify({ "cf-connecting-ip": ip })]);
}

async function report(pg: PGlite, id: string, note: string | null = null) {
  return pg.query("SELECT public.report_restaurant_closed($1, $2) AS r", [id, note]);
}

async function errCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  }
}

async function one<T>(pg: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  return (await pg.query<T>(sql, params)).rows[0];
}

Deno.test("a report is queued and never changes the listing", async () => {
  const pg = await db();
  await asClient(pg, "1.1.1.1");
  await report(pg, A, "  Sign on the door says closed  ");
  const r = await one<{ reason: string; source: string; details: { note: string } }>(
    pg,
    "SELECT reason, source, details FROM restaurant_closure_reviews",
  );
  assert.equal(r.reason, "visitor_report");
  assert.equal(r.source, "visitor");
  assert.equal(r.details.note, "Sign on the door says closed");
  const listing = await one<{ status: string; promotion_hold_reason: string | null }>(
    pg,
    "SELECT status, promotion_hold_reason FROM restaurants WHERE id = $1",
    [A],
  );
  assert.deepEqual(listing, { status: "open", promotion_hold_reason: null });
});

Deno.test("unknown and merged restaurants are refused", async () => {
  const pg = await db();
  await asClient(pg, "1.1.1.1");
  assert.equal(await errCode(report(pg, "00000000-0000-0000-0000-0000000000ff")), "22023");
  assert.equal(await errCode(report(pg, "00000000-0000-0000-0000-00000000000c")), "22023");
});

Deno.test("one report per restaurant per day from the same caller", async () => {
  const pg = await db();
  await asClient(pg, "1.1.1.1");
  await report(pg, A);
  assert.equal(await errCode(report(pg, A)), "54000");
  await asClient(pg, "2.2.2.2");
  assert.equal(await errCode(report(pg, A)), null, "a different caller may report");
});

Deno.test("five reports an hour per caller across restaurants", async () => {
  const pg = await db();
  await asClient(pg, "1.1.1.1");
  for (let i = 0; i < 5; i++) {
    const id = crypto.randomUUID();
    await pg.query("INSERT INTO restaurants (id, name) VALUES ($1, 'x')", [id]);
    await report(pg, id);
  }
  assert.equal(await errCode(report(pg, B)), "54000");
});

Deno.test("three open visitor reports hold the restaurant out of promotion", async () => {
  const pg = await db();
  for (const ip of ["1.1.1.1", "2.2.2.2"]) {
    await asClient(pg, ip);
    await report(pg, A);
  }
  assert.equal((await one<{ h: string | null }>(pg, "SELECT promotion_hold_reason h FROM restaurants WHERE id=$1", [A])).h, null);
  await asClient(pg, "3.3.3.3");
  await report(pg, A);
  assert.equal(
    (await one<{ h: string }>(pg, "SELECT promotion_hold_reason h FROM restaurants WHERE id=$1", [A])).h,
    "visitor_reports",
  );
});

Deno.test("only an admin may resolve", async () => {
  const pg = await db();
  await asClient(pg, "1.1.1.1");
  await report(pg, A);
  const id = (await one<{ id: string }>(pg, "SELECT id FROM restaurant_closure_reviews")).id;
  await asClient(pg, "1.1.1.1", "00000000-0000-0000-0000-000000000099", false);
  assert.equal(await errCode(pg.query("SELECT resolve_closure_review($1, 'approve')", [id])), "42501");
});

Deno.test("approve closes the listing and resolves every open finding on it, with the admin's id", async () => {
  const pg = await db();
  for (const ip of ["1.1.1.1", "2.2.2.2"]) {
    await asClient(pg, ip);
    await report(pg, A);
  }
  const id = (await one<{ id: string }>(pg, "SELECT id FROM restaurant_closure_reviews LIMIT 1")).id;
  const admin = "00000000-0000-0000-0000-0000000000ad";
  await asClient(pg, "9.9.9.9", admin, true);
  await pg.query("SELECT resolve_closure_review($1, 'approve')", [id]);
  const r = await one<{ status: string; by: string }>(
    pg,
    "SELECT status, status_changed_by by FROM restaurants WHERE id=$1",
    [A],
  );
  assert.equal(r.status, "closed");
  assert.equal(r.by, `person:${admin}`);
  const open = await one<{ n: number }>(pg, "SELECT count(*)::int n FROM restaurant_closure_reviews WHERE resolved_at IS NULL");
  assert.equal(open.n, 0);
  const by = await one<{ b: string }>(pg, "SELECT DISTINCT resolved_by::text b FROM restaurant_closure_reviews");
  assert.equal(by.b, admin);
});

Deno.test("dismiss needs a reason and clears the hold when nothing still justifies it", async () => {
  const pg = await db();
  for (const ip of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
    await asClient(pg, ip);
    await report(pg, A);
  }
  const id = (await one<{ id: string }>(pg, "SELECT id FROM restaurant_closure_reviews LIMIT 1")).id;
  await asClient(pg, "9.9.9.9", "00000000-0000-0000-0000-0000000000ad", true);
  assert.equal(await errCode(pg.query("SELECT resolve_closure_review($1, 'dismiss')", [id])), "22023");
  await pg.query("SELECT resolve_closure_review($1, 'dismiss', 'Called them, open')", [id]);
  const r = await one<{ status: string; h: string | null; res: string }>(
    pg,
    `SELECT r.status, r.promotion_hold_reason h,
            (SELECT resolution FROM restaurant_closure_reviews WHERE id = $2) res
       FROM restaurants r WHERE r.id = $1`,
    [A, id],
  );
  assert.equal(r.status, "open");
  assert.equal(r.h, null, "two open reports left is under the hold threshold");
  assert.equal(r.res, "dismissed: Called them, open");
});
