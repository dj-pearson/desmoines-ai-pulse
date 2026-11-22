// Run with:
//   deno test --allow-read --allow-net --allow-env supabase/functions/_tests/restaurant-closed-flags.test.ts
//
// WEB-BE-065: the trigger that keeps restaurants.status and business_status
// telling the same story. Runs the real migration in PGlite (Postgres in
// WASM, from npm) against a minimal restaurants table, so a writer that sets
// one closed flag without the other fails here.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";

// The edge-types shim cannot see npm packages' named exports, so the class is
// read off the namespace with the slice of its API these tests use.
interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const MIGRATION = new URL(
  "../../migrations/20261121000020_restaurant_closed_flag_sync.sql",
  import.meta.url,
);

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.current (uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM auth.current LIMIT 1';
    CREATE TABLE public.restaurants (
      id serial PRIMARY KEY,
      name text,
      status text DEFAULT 'open' CHECK (status IN ('open', 'opening_soon', 'newly_opened', 'announced', 'closed')),
      business_status text
    );
    INSERT INTO public.restaurants (name, status, business_status) VALUES
      ('drifted', 'open', 'CLOSED_PERMANENTLY'),
      ('fine', 'open', 'OPERATIONAL');
  `);
  const sql = await Deno.readTextFile(MIGRATION);
  await pg.exec(sql);
  return pg;
}

type Row = { status: string; business_status: string | null; status_changed_by: string | null };

async function row(pg: PGlite, name: string): Promise<Row> {
  const r = await pg.query<Row>(
    "SELECT status, business_status, status_changed_by FROM restaurants WHERE name = $1",
    [name],
  );
  return r.rows[0];
}

Deno.test("the backfill closes rows Google already marks CLOSED_PERMANENTLY", async () => {
  const pg = await db();
  assert.deepEqual(await row(pg, "drifted"), {
    status: "closed",
    business_status: "CLOSED_PERMANENTLY",
    status_changed_by: "places-backfill",
  });
  assert.equal((await row(pg, "fine")).status, "open");
});

Deno.test("the migration applies twice", async () => {
  const pg = await db();
  await pg.exec(await Deno.readTextFile(MIGRATION));
  assert.equal((await row(pg, "drifted")).status, "closed");
});

Deno.test("a refresh writing CLOSED_PERMANENTLY alone also closes status", async () => {
  const pg = await db();
  await pg.query("UPDATE restaurants SET business_status = 'CLOSED_PERMANENTLY' WHERE name = 'fine'");
  assert.deepEqual(await row(pg, "fine"), {
    status: "closed",
    business_status: "CLOSED_PERMANENTLY",
    status_changed_by: "places",
  });
});

Deno.test("an insert with CLOSED_PERMANENTLY is stored closed", async () => {
  const pg = await db();
  await pg.query("INSERT INTO restaurants (name, business_status) VALUES ('new', 'CLOSED_PERMANENTLY')");
  assert.equal((await row(pg, "new")).status, "closed");
});

Deno.test("a person's reopen survives the refresh repeating the same answer", async () => {
  const pg = await db();
  await pg.query("INSERT INTO auth.current VALUES ('00000000-0000-0000-0000-000000000001')");
  await pg.query("UPDATE restaurants SET status = 'open' WHERE name = 'drifted'");
  await pg.query("DELETE FROM auth.current");
  assert.equal((await row(pg, "drifted")).status_changed_by, "person:00000000-0000-0000-0000-000000000001");
  // Next refresh: same Google answer, no change.
  await pg.query("UPDATE restaurants SET business_status = 'CLOSED_PERMANENTLY' WHERE name = 'drifted'");
  assert.equal((await row(pg, "drifted")).status, "open");
});

Deno.test("a newer contradicting Google answer re-closes a reopened row", async () => {
  const pg = await db();
  await pg.query("UPDATE restaurants SET status = 'open' WHERE name = 'drifted'");
  await pg.query("UPDATE restaurants SET business_status = 'OPERATIONAL' WHERE name = 'drifted'");
  assert.equal((await row(pg, "drifted")).status, "open");
  await pg.query("UPDATE restaurants SET business_status = 'CLOSED_PERMANENTLY' WHERE name = 'drifted'");
  assert.equal((await row(pg, "drifted")).status, "closed");
});

Deno.test("a statement that sets status itself wins over the Google answer", async () => {
  const pg = await db();
  await pg.query(
    "UPDATE restaurants SET business_status = 'CLOSED_PERMANENTLY', status = 'newly_opened' WHERE name = 'fine'",
  );
  const r = await row(pg, "fine");
  assert.equal(r.status, "newly_opened");
  assert.equal(r.status_changed_by, "service");
});

Deno.test("CLOSED_TEMPORARILY does not close status", async () => {
  const pg = await db();
  await pg.query("UPDATE restaurants SET business_status = 'CLOSED_TEMPORARILY' WHERE name = 'fine'");
  assert.equal((await row(pg, "fine")).status, "open");
});
