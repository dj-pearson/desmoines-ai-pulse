// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/restaurant-changes.test.ts
//
// WEB-BE-075: the restaurant change history and content_changed_at, from the
// real migration in PGlite against a minimal restaurants table.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";

interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const ID = "00000000-0000-0000-0000-00000000000a";

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.current (uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM auth.current LIMIT 1';
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT true';
    CREATE TABLE public.restaurants (
      id uuid PRIMARY KEY, name text, phone text, description text, status text DEFAULT 'open',
      business_status text, hours_json jsonb, hours_checked_at timestamptz, popularity_score int DEFAULT 0,
      updated_at timestamptz DEFAULT '2026-01-01T00:00:00Z'
    );
    INSERT INTO public.restaurants (id, name, phone, description, hours_json)
    VALUES ('${ID}', 'A', '515-555-0100', 'Long copy', '{"weekdayDescriptions":["Mon: 9-5"],"fetchedAt":"2026-01-01"}');
  `);
  await pg.exec(await Deno.readTextFile(new URL("../../migrations/20261121000110_restaurant_changes.sql", import.meta.url)));
  return pg;
}

async function changes(pg: PGlite) {
  return (await pg.query<{ actor: string; columns: string[]; old_values: Record<string, unknown>; new_values: Record<string, unknown> }>(
    "SELECT actor, columns, old_values, new_values FROM restaurant_changes ORDER BY id",
  )).rows;
}

async function contentChangedAt(pg: PGlite): Promise<string> {
  return (await pg.query<{ c: string }>("SELECT content_changed_at::text c FROM restaurants")).rows[0].c;
}

Deno.test("backfill copies updated_at into content_changed_at", async () => {
  const pg = await db();
  assert.match(await contentChangedAt(pg), /^2026-01-01/);
});

Deno.test("a person's phone edit is recorded with old and new values and moves content_changed_at", async () => {
  const pg = await db();
  await pg.query("INSERT INTO auth.current VALUES ('00000000-0000-0000-0000-0000000000ad')");
  await pg.query("UPDATE restaurants SET phone = '515-555-0199', updated_at = now()");
  const c = await changes(pg);
  assert.equal(c.length, 1);
  assert.equal(c[0].actor, "person:00000000-0000-0000-0000-0000000000ad");
  assert.deepEqual(c[0].columns, ["phone"]);
  assert.deepEqual(c[0].old_values, { phone: "515-555-0100" });
  assert.deepEqual(c[0].new_values, { phone: "515-555-0199" });
  assert.doesNotMatch(await contentChangedAt(pg), /^2026-01-01/);
});

Deno.test("an hours re-check that changes only the fetch stamp is history but not a content change", async () => {
  const pg = await db();
  await pg.query(`SELECT set_config('request.headers', '{"x-actor":"bulk-update-restaurants"}', false)`);
  await pg.query(
    `UPDATE restaurants SET hours_json = '{"weekdayDescriptions":["Mon: 9-5"],"fetchedAt":"2026-11-21"}',
       hours_checked_at = now(), updated_at = now(), popularity_score = 5`,
  );
  const c = await changes(pg);
  assert.equal(c.length, 1);
  assert.equal(c[0].actor, "bulk-update-restaurants");
  assert.deepEqual(c[0].columns.sort(), ["hours_checked_at", "hours_json"]);
  assert.deepEqual(c[0].new_values.hours_json, { changed: true }, "hours bodies are not stored");
  assert.match(await contentChangedAt(pg), /^2026-01-01/, "a re-check must not look like a content change");
});

Deno.test("changed hours text is a content change", async () => {
  const pg = await db();
  await pg.query(`UPDATE restaurants SET hours_json = '{"weekdayDescriptions":["Mon: 10-6"],"fetchedAt":"2026-11-21"}'`);
  assert.doesNotMatch(await contentChangedAt(pg), /^2026-01-01/);
});

Deno.test("bookkeeping-only updates write no history row", async () => {
  const pg = await db();
  await pg.query("UPDATE restaurants SET updated_at = now(), popularity_score = 9");
  assert.equal((await changes(pg)).length, 0);
});

Deno.test("long text is stored as changed, not its body", async () => {
  const pg = await db();
  await pg.query("UPDATE restaurants SET description = 'New copy'");
  const c = await changes(pg);
  assert.deepEqual(c[0].old_values, { description: { changed: true } });
});

Deno.test("the migration applies twice", async () => {
  const pg = await db();
  await pg.exec(await Deno.readTextFile(new URL("../../migrations/20261121000110_restaurant_changes.sql", import.meta.url)));
  await pg.query("UPDATE restaurants SET phone = 'x'");
  assert.equal((await changes(pg)).length, 1);
});
