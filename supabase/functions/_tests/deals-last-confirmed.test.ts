// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/deals-last-confirmed.test.ts
//
// WEB-FEAT-104: migration 20261121000100 adds deals.last_confirmed_at, run in
// PGlite against a minimal deals table. Pins the backfill choice (a deal
// counts as confirmed when it was entered) and that new rows are stamped.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";

// The edge-types shim cannot see npm packages' named exports, so the class is
// read off the namespace with the slice of its API these tests use.
interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const MIGRATION = new URL("../../migrations/20261121000100_deals_last_confirmed_at.sql", import.meta.url);

async function db(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE public.deals (
      id text PRIMARY KEY,
      title text NOT NULL,
      start_date timestamptz NOT NULL DEFAULT now(),
      end_date timestamptz,
      created_at timestamptz DEFAULT now()
    );
    INSERT INTO public.deals (id, title, start_date, end_date, created_at) VALUES
      ('old', 'Old happy hour', '2026-01-05T00:00:00Z', NULL, '2026-01-01T00:00:00Z'),
      ('recent', 'Recent special', '2026-11-01T00:00:00Z', NULL, '2026-11-01T00:00:00Z'),
      ('no-created', 'No created_at', '2026-03-03T00:00:00Z', NULL, NULL);
  `);
  await pg.exec(await Deno.readTextFile(MIGRATION));
  return pg;
}

async function confirmedAt(pg: PGlite, id: string): Promise<string | null> {
  const r = await pg.query<{ c: string | null }>(
    "SELECT to_char(last_confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS c FROM public.deals WHERE id = $1",
    [id],
  );
  return r.rows[0]?.c ?? null;
}

Deno.test("existing rows are backfilled from created_at, then start_date", async () => {
  const pg = await db();
  assert.equal(await confirmedAt(pg, "old"), "2026-01-01");
  assert.equal(await confirmedAt(pg, "recent"), "2026-11-01");
  assert.equal(await confirmedAt(pg, "no-created"), "2026-03-03");
  const nulls = await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM public.deals WHERE last_confirmed_at IS NULL");
  assert.equal(nulls.rows[0].n, 0);
});

Deno.test("a new deal is stamped when it is inserted, and an explicit stamp is kept", async () => {
  const pg = await db();
  await pg.query("INSERT INTO public.deals (id, title) VALUES ('new', 'New deal')");
  const r = await pg.query<{ fresh: boolean }>(
    "SELECT last_confirmed_at > now() - interval '1 minute' AS fresh FROM public.deals WHERE id = 'new'",
  );
  assert.equal(r.rows[0].fresh, true);
  await pg.query(
    "INSERT INTO public.deals (id, title, last_confirmed_at) VALUES ('given', 'Given', '2026-10-10T12:00:00Z')",
  );
  assert.equal(await confirmedAt(pg, "given"), "2026-10-10");
});

Deno.test("re-running the migration changes nothing already stamped", async () => {
  const pg = await db();
  await pg.query("UPDATE public.deals SET last_confirmed_at = '2026-11-20T00:00:00Z' WHERE id = 'old'");
  await pg.exec(await Deno.readTextFile(MIGRATION));
  assert.equal(await confirmedAt(pg, "old"), "2026-11-20");
});
