// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/business-claim-revoke.test.ts
//
// WEB-ADS-047: revoke_business_claim and the claim_listing change, run from
// the real migrations in PGlite against a minimal schema.

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

const LISTING = "00000000-0000-0000-0000-0000000000aa";
const OWNER = "00000000-0000-0000-0000-000000000001";
const BUYER = "00000000-0000-0000-0000-000000000002";
const ADMIN = "00000000-0000-0000-0000-0000000000ad";

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.current (uid uuid, admin boolean DEFAULT false);
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM auth.current LIMIT 1';
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT coalesce((SELECT admin FROM auth.current LIMIT 1), false)';
    CREATE TABLE public.restaurants (
      id uuid PRIMARY KEY, name text, website text, description text, phone text,
      image_url text, menu_url text, updated_at timestamptz
    );
    CREATE TABLE public.attractions (id uuid PRIMARY KEY, name text, website text);
    CREATE TABLE public.known_venues (id uuid PRIMARY KEY, name text, website text);
    INSERT INTO public.restaurants (id, name, website) VALUES ('${LISTING}', 'Zombie Burger', 'https://www.zombieburger.com');
    INSERT INTO auth.users VALUES ('${OWNER}', 'old@zombieburger.com'), ('${BUYER}', 'new@gmail.com');
  `);
  for (const f of ["20260920000005_business_claims.sql", "20261121000090_business_claim_revoke.sql"]) {
    await pg.exec(await Deno.readTextFile(M(f)));
  }
  return pg;
}

async function as(pg: PGlite, uid: string | null, admin = false) {
  await pg.query("DELETE FROM auth.current");
  if (uid) await pg.query("INSERT INTO auth.current VALUES ($1, $2)", [uid, admin]);
}

async function claim(pg: PGlite, uid: string): Promise<string> {
  await as(pg, uid);
  const { rows } = await pg.query<{ s: string }>("SELECT public.claim_listing('restaurant', $1) AS s", [LISTING]);
  return rows[0].s;
}

async function claimIdOf(pg: PGlite, uid: string): Promise<string> {
  const { rows } = await pg.query<{ id: string }>(
    "SELECT id FROM public.business_claims WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [uid],
  );
  return rows[0].id;
}

async function canEdit(pg: PGlite, uid: string): Promise<boolean> {
  await as(pg, uid);
  try {
    await pg.query("SELECT public.update_claimed_listing('restaurant', $1, $2::jsonb)", [LISTING, '{"phone":"515-555-0100"}']);
    return true;
  } catch (e) {
    assert.match(String(e), /you have not verified this listing/);
    return false;
  }
}

async function revoke(pg: PGlite, id: string, reason: string | null) {
  return pg.query<{ r: string }>("SELECT public.revoke_business_claim($1, $2) AS r", [id, reason]);
}

Deno.test("revoke removes edit access and records who and why", async () => {
  const pg = await db();
  assert.equal(await claim(pg, OWNER), "verified"); // domain match
  assert.equal(await canEdit(pg, OWNER), true);

  const id = await claimIdOf(pg, OWNER);
  await as(pg, ADMIN, true);
  const { rows } = await revoke(pg, id, "  Sold to new owners in November  ");
  assert.equal(rows[0].r, "revoked");

  const { rows: after } = await pg.query<Record<string, unknown>>(
    "SELECT status, revoked_by, revoke_reason, revoked_at IS NOT NULL AS has_at FROM public.business_claims WHERE id = $1",
    [id],
  );
  assert.deepEqual(after[0], { status: "rejected", revoked_by: ADMIN, revoke_reason: "Sold to new owners in November", has_at: true });
  assert.equal(await canEdit(pg, OWNER), false);
});

Deno.test("revoke frees the listing for a new owner", async () => {
  const pg = await db();
  await claim(pg, OWNER);
  await as(pg, BUYER);
  await assert.rejects(pg.query("SELECT public.claim_listing('restaurant', $1)", [LISTING]), /already claimed/);

  await as(pg, ADMIN, true);
  await revoke(pg, await claimIdOf(pg, OWNER), "Changed hands");
  assert.equal(await claim(pg, BUYER), "pending"); // gmail: goes to the queue
});

Deno.test("a revoked owner cannot auto-verify again by domain", async () => {
  const pg = await db();
  await claim(pg, OWNER);
  await as(pg, ADMIN, true);
  await revoke(pg, await claimIdOf(pg, OWNER), "Changed hands");
  // Counter-assertion for the domain path: without the revoke this same user
  // and listing verified on the spot (first test).
  assert.equal(await claim(pg, OWNER), "pending");
  assert.equal(await canEdit(pg, OWNER), false);
});

Deno.test("revoke refuses non-admins, a blank reason, and a claim that is not verified", async () => {
  const pg = await db();
  await claim(pg, OWNER);
  const id = await claimIdOf(pg, OWNER);

  await as(pg, BUYER);
  await assert.rejects(revoke(pg, id, "mine now"), /not authorized/);

  await as(pg, ADMIN, true);
  await assert.rejects(revoke(pg, id, "   "), /give a reason/);
  await assert.rejects(revoke(pg, id, null), /give a reason/);
  assert.equal(await canEdit(pg, OWNER), true); // nothing changed

  // A pending claim (written directly: the listing is held, so claim_listing
  // would refuse a second claimant).
  await pg.query(
    "INSERT INTO public.business_claims (listing_type, listing_id, user_id, status) VALUES ('restaurant', $1, $2, 'pending')",
    [LISTING, BUYER],
  );
  await as(pg, ADMIN, true);
  await assert.rejects(revoke(pg, await claimIdOf(pg, BUYER), "pending one"), /is not a verified owner/);
  await assert.rejects(revoke(pg, "00000000-0000-0000-0000-00000000dead", "x"), /not found/);
});
