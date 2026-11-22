// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/restaurant-opening-progress.test.ts
//
// WEB-BE-073: announced/opening_soon -> newly_opened -> open, forward only,
// and unconfirmed past-date openings queued for review. Real migrations in
// PGlite on a minimal schema.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";

interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const M = (f: string) => new URL(`../../migrations/${f}`, import.meta.url);
const HOURS = `'{"weekdayDescriptions":["Mon: 11-9"],"periods":[]}'`;

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE FUNCTION extensions.digest(t text, alg text) RETURNS bytea LANGUAGE sql AS 'SELECT sha256(convert_to(t, ''UTF8''))';
    CREATE FUNCTION extensions.gen_random_bytes(n int) RETURNS bytea LANGUAGE sql AS 'SELECT sha256(convert_to(random()::text, ''UTF8''))';
    CREATE TABLE public.restaurants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, is_merged boolean DEFAULT false,
      status text DEFAULT 'open', business_status text, hours_json jsonb, opening_date date
    );
  `);
  for (const f of [
    "20261121000010_restaurant_closure_reviews.sql",
    "20261121000020_restaurant_closed_flag_sync.sql",
    "20261121000030_restaurant_closure_reports.sql",
    "20261121000120_restaurant_opening_progress.sql",
  ]) {
    await pg.exec(await Deno.readTextFile(M(f)));
  }
  return pg;
}

async function status(pg: PGlite, name: string): Promise<{ status: string; by: string | null }> {
  return (await pg.query<{ status: string; by: string | null }>(
    "SELECT status, status_changed_by by FROM restaurants WHERE name = $1",
    [name],
  )).rows[0];
}

Deno.test("Google OPERATIONAL with hours moves announced to newly_opened, attributed to places", async () => {
  const pg = await db();
  await pg.query("INSERT INTO restaurants (name, status) VALUES ('a', 'announced')");
  await pg.query(`UPDATE restaurants SET business_status = 'OPERATIONAL', hours_json = ${HOURS} WHERE name = 'a'`);
  assert.deepEqual(await status(pg, "a"), { status: "newly_opened", by: "places" });
});

Deno.test("OPERATIONAL without hours, or hours without OPERATIONAL, changes nothing", async () => {
  const pg = await db();
  await pg.query("INSERT INTO restaurants (name, status) VALUES ('a', 'opening_soon'), ('b', 'opening_soon')");
  await pg.query("UPDATE restaurants SET business_status = 'OPERATIONAL' WHERE name = 'a'");
  await pg.query(`UPDATE restaurants SET hours_json = ${HOURS} WHERE name = 'b'`);
  assert.equal((await status(pg, "a")).status, "opening_soon");
  assert.equal((await status(pg, "b")).status, "opening_soon");
});

Deno.test("never backwards: open and closed rows are not touched by the trigger", async () => {
  const pg = await db();
  await pg.query("INSERT INTO restaurants (name, status) VALUES ('o', 'open'), ('c', 'closed'), ('n', 'newly_opened')");
  await pg.query(`UPDATE restaurants SET business_status = 'OPERATIONAL', hours_json = ${HOURS}`);
  assert.equal((await status(pg, "o")).status, "open");
  assert.equal((await status(pg, "c")).status, "closed");
  assert.equal((await status(pg, "n")).status, "newly_opened");
});

Deno.test("a statement that sets status itself wins", async () => {
  const pg = await db();
  await pg.query("INSERT INTO restaurants (name, status) VALUES ('a', 'announced')");
  await pg.query(`UPDATE restaurants SET business_status = 'OPERATIONAL', hours_json = ${HOURS}, status = 'opening_soon' WHERE name = 'a'`);
  assert.equal((await status(pg, "a")).status, "opening_soon");
});

Deno.test("newly_opened becomes open after 60 days, not before", async () => {
  const pg = await db();
  await pg.query(`INSERT INTO restaurants (name, status) VALUES ('old', 'newly_opened'), ('new', 'newly_opened'),
                  ('dated', 'newly_opened'), ('undated', 'newly_opened')`);
  await pg.query("UPDATE restaurants SET newly_opened_at = now() - interval '61 days' WHERE name = 'old'");
  await pg.query("UPDATE restaurants SET newly_opened_at = now() - interval '59 days' WHERE name = 'new'");
  await pg.query("UPDATE restaurants SET opening_date = current_date - 90 WHERE name = 'dated'");
  const r = (await pg.query<{ r: { newly_opened_to_open: number } }>("SELECT advance_restaurant_openings() r")).rows[0].r;
  assert.equal(r.newly_opened_to_open, 2);
  assert.equal((await status(pg, "old")).status, "open");
  assert.equal((await status(pg, "dated")).status, "open");
  assert.equal((await status(pg, "new")).status, "newly_opened");
  assert.equal((await status(pg, "undated")).status, "newly_opened", "no date, no recency claim, left alone");
});

Deno.test("a past-date opening Google does not confirm is queued once", async () => {
  const pg = await db();
  await pg.query(`INSERT INTO restaurants (name, status, opening_date, business_status) VALUES
    ('late', 'announced', current_date - 30, NULL),
    ('recent', 'announced', current_date - 3, NULL),
    ('future', 'opening_soon', current_date + 10, NULL)`);
  await pg.query("SELECT advance_restaurant_openings()");
  await pg.query("SELECT advance_restaurant_openings()");
  const q = (await pg.query<{ name: string; n: number }>(
    `SELECT r.name, count(*)::int n FROM restaurant_closure_reviews c JOIN restaurants r ON r.id = c.restaurant_id
      WHERE c.reason = 'opening_unconfirmed' GROUP BY r.name`,
  )).rows;
  assert.deepEqual(q, [{ name: "late", n: 1 }]);
  assert.equal((await status(pg, "late")).status, "announced", "queued, not changed");
});
