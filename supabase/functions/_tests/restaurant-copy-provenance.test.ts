// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/restaurant-copy-provenance.test.ts
//
// WEB-BE-077: the trigger that records where a restaurant description came
// from and when its AI copy was generated. Real migration in PGlite.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";

interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const ID = "00000000-0000-0000-0000-00000000000a";
const OWNER = "00000000-0000-0000-0000-0000000000b1";
const ADMIN = "00000000-0000-0000-0000-0000000000ad";

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.current (uid uuid);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM auth.current LIMIT 1';
    CREATE TABLE public.business_claims (listing_type text, listing_id uuid, user_id uuid, status text);
    INSERT INTO public.business_claims VALUES ('restaurant', '${ID}', '${OWNER}', 'verified');
    CREATE TABLE public.restaurants (id uuid PRIMARY KEY, description text, geo_summary text, geo_key_facts text[], geo_faq jsonb);
    INSERT INTO public.restaurants (id, description) VALUES ('${ID}', 'old');
  `);
  await pg.exec(await Deno.readTextFile(new URL("../../migrations/20261121000160_restaurant_copy_provenance.sql", import.meta.url)));
  return pg;
}

async function row(pg: PGlite) {
  return (await pg.query<{ s: string | null; g: string | null }>(
    "SELECT description_source s, geo_generated_at::text g FROM restaurants",
  )).rows[0];
}

async function asUser(pg: PGlite, uid: string | null) {
  await pg.query("DELETE FROM auth.current");
  if (uid) await pg.query("INSERT INTO auth.current VALUES ($1)", [uid]);
}

async function asActor(pg: PGlite, actor: string) {
  await pg.query(`SELECT set_config('request.headers', $1, false)`, [JSON.stringify({ "x-actor": actor })]);
}

Deno.test("existing rows keep an unknown source and no date", async () => {
  assert.deepEqual(await row(await db()), { s: null, g: null });
});

Deno.test("enrichment writes are labelled google, enhance-content writes ai", async () => {
  const pg = await db();
  await asActor(pg, "bulk-update-restaurants");
  await pg.query("UPDATE restaurants SET description = 'Google summary'");
  assert.equal((await row(pg)).s, "google");
  await asActor(pg, "enhance-content");
  await pg.query("UPDATE restaurants SET description = 'Model text'");
  assert.equal((await row(pg)).s, "ai");
});

Deno.test("the verified owner is 'restaurant', another signed-in user is 'editor'", async () => {
  const pg = await db();
  await asUser(pg, OWNER);
  await pg.query("UPDATE restaurants SET description = 'Our story'");
  assert.equal((await row(pg)).s, "restaurant");
  await asUser(pg, ADMIN);
  await pg.query("UPDATE restaurants SET description = 'Edited'");
  assert.equal((await row(pg)).s, "editor");
});

Deno.test("an unknown service write is not given a label", async () => {
  const pg = await db();
  await asActor(pg, "firecrawl-scraper");
  await pg.query("UPDATE restaurants SET description = 'Scraped'");
  assert.equal((await row(pg)).s, null);
});

Deno.test("a statement that sets the source itself wins; an unrelated update keeps it", async () => {
  const pg = await db();
  await pg.query("UPDATE restaurants SET description = 'x', description_source = 'google'");
  assert.equal((await row(pg)).s, "google");
  await asUser(pg, ADMIN);
  await pg.query("UPDATE restaurants SET geo_summary = 's'");
  assert.equal((await row(pg)).s, "google");
});

Deno.test("geo copy changes stamp geo_generated_at; description changes do not", async () => {
  const pg = await db();
  await pg.query("UPDATE restaurants SET description = 'y'");
  assert.equal((await row(pg)).g, null);
  await pg.query("UPDATE restaurants SET geo_faq = '[]'");
  assert.notEqual((await row(pg)).g, null);
});
