// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/subscription-entitlement-expiry.test.ts
//
// WEB-BE-062: entitlement ends on time. The SQL predicate, entitled_plan_limit,
// get_user_subscription_tier and the reconciliation RPCs, run from the real
// migration in PGlite against a minimal schema, and the SQL predicate checked
// against the TypeScript one over the same rows.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";
import {
  ACTIVE_GRACE_DAYS,
  GRACE_PERIOD_DAYS,
  isSubscriptionRowEntitled,
} from "../_shared/entitlements.ts";
import {
  type ReconcileCandidate,
  reconcileBatch,
  type ReconcileStore,
} from "../_shared/subscriptionReconcile.ts";

interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const M = (f: string) => new URL(`../../migrations/${f}`, import.meta.url);
const MIGRATION = "20261122000020_subscription_entitlement_expiry.sql";
const OLD_LIMITS = "20260918000001_enforce_plan_limits.sql";

const U1 = "00000000-0000-0000-0000-0000000000a1";
const FREE = "00000000-0000-0000-0000-0000000000f0";
const INSIDER = "00000000-0000-0000-0000-0000000000f1";
const VIP = "00000000-0000-0000-0000-0000000000f2";
// Real time, because the RPCs that write a check stamp it with now().
const NOW = new Date();
const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

async function db(sqls?: string[]): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    SET TimeZone = 'UTC';
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.current (uid uuid, role text, admin boolean DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT uid FROM auth.current LIMIT 1';
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT role FROM auth.current LIMIT 1';
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS 'SELECT coalesce((SELECT admin FROM auth.current LIMIT 1), false)';
    CREATE FUNCTION public.is_admin_or_root() RETURNS boolean LANGUAGE sql AS 'SELECT public.is_admin()';
    CREATE TABLE public.subscription_plans (
      id uuid PRIMARY KEY, name text, limits jsonb, sort_order int,
      stripe_price_id_monthly text, stripe_price_id_yearly text
    );
    INSERT INTO public.subscription_plans VALUES
      ('${FREE}', 'free', '{"favorites": 3}', 0, NULL, NULL),
      ('${INSIDER}', 'insider', '{"favorites": -1}', 1, 'price_insider_m', NULL),
      ('${VIP}', 'vip', '{"favorites": -1}', 2, 'price_vip_m', NULL);
    CREATE TABLE public.user_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
      status text, platform text NOT NULL DEFAULT 'web',
      stripe_subscription_id text, stripe_customer_id text,
      current_period_start timestamptz, current_period_end timestamptz,
      cancel_at_period_end boolean DEFAULT false, canceled_at timestamptz,
      trial_start timestamptz, trial_end timestamptz, billing_interval text,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE public.subscription_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid, subscription_id uuid, event_type text NOT NULL,
      platform text, details jsonb, created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  for (const sql of sqls ?? [await Deno.readTextFile(M(MIGRATION))]) await pg.exec(sql);
  return pg;
}

async function sub(
  pg: PGlite,
  row: { status: string; end: string | null; plan?: string; platform?: string; stripeId?: string | null },
): Promise<string> {
  const r = await pg.query<{ id: string }>(
    `INSERT INTO public.user_subscriptions (user_id, plan_id, status, platform, stripe_subscription_id, current_period_end)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [U1, row.plan ?? INSIDER, row.status, row.platform ?? "web", row.stripeId ?? null, row.end],
  );
  return r.rows[0].id;
}

async function limit(pg: PGlite): Promise<number> {
  const r = await pg.query<{ n: number }>(`SELECT public.entitled_plan_limit($1, 'favorites') AS n`, [U1]);
  return r.rows[0].n;
}

// --------------------------------------------------------------------------
// The predicate, SQL against TypeScript
// --------------------------------------------------------------------------

Deno.test("the SQL predicate and isSubscriptionRowEntitled agree on every row", async () => {
  const pg = await db();
  const statuses = ["active", "trialing", "past_due", "canceled", "paused", "incomplete", null];
  const offsets: Array<number | null> = [
    null,
    -20 * DAY,
    -(GRACE_PERIOD_DAYS * DAY) - 3_600_000,
    -(GRACE_PERIOD_DAYS * DAY) + 3_600_000,
    -10 * DAY,
    -(ACTIVE_GRACE_DAYS * DAY) - 3_600_000,
    -(ACTIVE_GRACE_DAYS * DAY),
    -(ACTIVE_GRACE_DAYS * DAY) + 3_600_000,
    -DAY,
    DAY,
    30 * DAY,
  ];
  let compared = 0;
  let entitled = 0;
  for (const status of statuses) {
    for (const off of offsets) {
      const end = off === null ? null : at(off);
      const r = await pg.query<{ ok: boolean }>(
        "SELECT public.subscription_row_entitled($1, $2::timestamptz, $3::timestamptz) AS ok",
        [status, end, NOW.toISOString()],
      );
      const ts = isSubscriptionRowEntitled(status, end, NOW);
      assert.equal(r.rows[0].ok, ts, `status=${status} end=${end}: SQL ${r.rows[0].ok}, TS ${ts}`);
      compared++;
      if (ts) entitled++;
    }
  }
  assert.equal(compared, statuses.length * offsets.length);
  // Counter-assertion: the matrix is not trivially all-false.
  assert.ok(entitled >= 10, `expected a mix of answers, got ${entitled} entitled`);
});

Deno.test("active 10 days past its period end is not entitled anywhere", async () => {
  const end = at(-10 * DAY);
  assert.equal(isSubscriptionRowEntitled("active", end, NOW), false);
  assert.equal(isSubscriptionRowEntitled("trialing", end, NOW), false);
  const pg = await db();
  const r = await pg.query<{ ok: boolean }>(
    "SELECT public.subscription_row_entitled('active', $1::timestamptz, $2::timestamptz) AS ok",
    [end, NOW.toISOString()],
  );
  assert.equal(r.rows[0].ok, false);
  // Counter-assertion: inside the buffer it still is.
  assert.equal(isSubscriptionRowEntitled("active", at(-DAY), NOW), true);
});

// --------------------------------------------------------------------------
// entitled_plan_limit and get_user_subscription_tier
// --------------------------------------------------------------------------

Deno.test("entitled_plan_limit drops an active row 10 days past its end to the free limit", async () => {
  const pg = await db();
  await sub(pg, { status: "active", end: new Date(Date.now() - 10 * DAY).toISOString() });
  assert.equal(await limit(pg), 3);
});

Deno.test("entitled_plan_limit keeps an active row inside the 3-day buffer and a past_due row inside grace", async () => {
  const pg = await db();
  const id = await sub(pg, { status: "active", end: new Date(Date.now() - DAY).toISOString() });
  assert.equal(await limit(pg), -1);
  await pg.query("UPDATE public.user_subscriptions SET status = 'past_due', current_period_end = $2 WHERE id = $1", [
    id,
    new Date(Date.now() - 10 * DAY).toISOString(),
  ]);
  assert.equal(await limit(pg), -1);
  await pg.query("UPDATE public.user_subscriptions SET status = 'active', current_period_end = NULL WHERE id = $1", [id]);
  assert.equal(await limit(pg), 3, "an active row with no period end is not entitled");
});

Deno.test("negative control: the old entitled_plan_limit kept the expired active row paid", async () => {
  // The definition this migration replaces. If this ever stops reading -1,
  // the test above is no longer proving a change.
  const old = await Deno.readTextFile(M(OLD_LIMITS));
  const start = old.indexOf("CREATE OR REPLACE FUNCTION public.entitled_plan_limit");
  const end = old.indexOf("$$;", old.indexOf("AS $$", start) + 5) + 3;
  assert.ok(start > 0 && end > start, "the old definition is still in its migration");
  const pg = await db([old.slice(start, end)]);
  await sub(pg, { status: "active", end: new Date(Date.now() - 10 * DAY).toISOString() });
  assert.equal(await limit(pg), -1);
});

Deno.test("get_user_subscription_tier reads an expired active row as free", async () => {
  const pg = await db();
  await pg.query("INSERT INTO auth.current (uid, role) VALUES ($1, 'authenticated')", [U1]);
  const id = await sub(pg, { status: "active", plan: VIP, end: new Date(Date.now() - 10 * DAY).toISOString() });
  const tier = async () =>
    (await pg.query<{ t: string }>("SELECT public.get_user_subscription_tier($1) AS t", [U1])).rows[0].t;
  assert.equal(await tier(), "free");
  await pg.query("UPDATE public.user_subscriptions SET current_period_end = $2 WHERE id = $1", [
    id,
    new Date(Date.now() + 5 * DAY).toISOString(),
  ]);
  assert.equal(await tier(), "vip");
});

// --------------------------------------------------------------------------
// The reconciliation RPCs
// --------------------------------------------------------------------------

Deno.test("candidates are paid-status rows past their end, not recently checked", async () => {
  const pg = await db();
  const lapsed = await sub(pg, { status: "active", end: at(-10 * DAY), stripeId: "sub_lapsed" });
  const noEnd = await sub(pg, { status: "trialing", end: null, stripeId: "sub_noend" });
  await sub(pg, { status: "active", end: at(10 * DAY), stripeId: "sub_future" });
  await sub(pg, { status: "canceled", end: at(-10 * DAY), stripeId: "sub_canceled" });
  const checked = await sub(pg, { status: "past_due", end: at(-2 * DAY), stripeId: "sub_checked" });
  await pg.query("SELECT public.note_subscription_reconcile_check($1, 'not_found', 'x')", [checked]);

  const ids = async () =>
    (await pg.query<{ id: string }>("SELECT id FROM public.subscription_reconcile_candidates(50, $1)", [
      NOW.toISOString(),
    ])).rows.map((r) => r.id);
  assert.deepEqual(await ids(), [noEnd, lapsed], "never-checked first, NULL end first, then most recent");

  // 21 hours later the checked row is due again, behind the never-checked ones.
  const later = new Date(Date.now() + 21 * 3_600_000).toISOString();
  const r = await pg.query<{ id: string }>("SELECT id FROM public.subscription_reconcile_candidates(50, $1)", [later]);
  assert.ok(r.rows.map((x) => x.id).includes(checked));

  const one = await pg.query("SELECT id FROM public.subscription_reconcile_candidates(1, $1)", [NOW.toISOString()]);
  assert.equal(one.rows.length, 1, "the batch is bounded");
});

Deno.test("backlog counts lapsed paid rows per platform", async () => {
  const pg = await db();
  await sub(pg, { status: "active", end: at(-10 * DAY) });
  await sub(pg, { status: "active", end: at(-DAY) });
  await sub(pg, { status: "active", end: at(-10 * DAY), platform: "ios" });
  await sub(pg, { status: "active", end: at(5 * DAY) });
  const r = await pg.query<{ platform: string; lapsed: number; not_entitled: number }>(
    "SELECT platform, lapsed::int, not_entitled::int FROM public.subscription_reconcile_backlog($1)",
    [NOW.toISOString()],
  );
  assert.deepEqual(r.rows, [
    { platform: "ios", lapsed: 1, not_entitled: 1 },
    { platform: "web", lapsed: 2, not_entitled: 1 },
  ]);
});

Deno.test("apply writes Stripe's patch and exactly one subscription_events row", async () => {
  const pg = await db();
  const id = await sub(pg, { status: "active", end: at(-10 * DAY), stripeId: "sub_1" });
  const ok = await pg.query<{ ok: boolean }>(
    "SELECT public.apply_subscription_reconciliation($1, 'sub_1', $2::jsonb, $3::jsonb) AS ok",
    [id, JSON.stringify({ status: "canceled", current_period_end: at(-10 * DAY), canceled_at: at(-9 * DAY) }), "{}"],
  );
  assert.equal(ok.rows[0].ok, true);
  const row = (await pg.query<{ status: string; canceled_at: string }>(
    "SELECT status, canceled_at FROM public.user_subscriptions WHERE id = $1",
    [id],
  )).rows[0];
  assert.equal(row.status, "canceled");
  assert.ok(row.canceled_at);
  const ev = await pg.query<{ event_type: string; platform: string; user_id: string }>(
    "SELECT event_type, platform, user_id FROM public.subscription_events WHERE subscription_id = $1",
    [id],
  );
  assert.deepEqual(ev.rows, [{ event_type: "reconciled", platform: "web", user_id: U1 }]);
  const chk = await pg.query<{ outcome: string }>(
    "SELECT outcome FROM public.subscription_reconcile_checks WHERE subscription_id = $1",
    [id],
  );
  assert.equal(chk.rows[0].outcome, "corrected");
});

Deno.test("apply refuses a row that no longer holds that Stripe id, and writes no event", async () => {
  const pg = await db();
  const id = await sub(pg, { status: "active", end: at(-10 * DAY), stripeId: "sub_new" });
  const ok = await pg.query<{ ok: boolean }>(
    "SELECT public.apply_subscription_reconciliation($1, 'sub_old', $2::jsonb, '{}'::jsonb) AS ok",
    [id, JSON.stringify({ status: "canceled" })],
  );
  assert.equal(ok.rows[0].ok, false);
  const ev = await pg.query("SELECT 1 FROM public.subscription_events");
  assert.equal(ev.rows.length, 0);
  const row = (await pg.query<{ status: string }>("SELECT status FROM public.user_subscriptions WHERE id = $1", [id]))
    .rows[0];
  assert.equal(row.status, "active");
});

Deno.test("apply refuses a status the table does not hold", async () => {
  const pg = await db();
  const id = await sub(pg, { status: "active", end: at(-10 * DAY), stripeId: "sub_1" });
  await assert.rejects(
    pg.query("SELECT public.apply_subscription_reconciliation($1, 'sub_1', $2::jsonb, '{}'::jsonb)", [
      id,
      JSON.stringify({ status: "mystery" }),
    ]),
  );
});

Deno.test("the reconciler over the real RPCs: one event per correction, none for an error", async () => {
  const pg = await db();
  const canceledAtStripe = await sub(pg, { status: "active", end: at(-10 * DAY), stripeId: "sub_gone" });
  const errored = await sub(pg, { status: "active", end: at(-10 * DAY), stripeId: "sub_err" });
  const renewed = await sub(pg, { status: "past_due", end: at(-2 * DAY), stripeId: "sub_renewed" });

  const store: ReconcileStore = {
    async apply(c, patch, details) {
      const r = await pg.query<{ ok: boolean }>(
        "SELECT public.apply_subscription_reconciliation($1, $2, $3::jsonb, $4::jsonb) AS ok",
        [c.id, c.stripe_subscription_id, JSON.stringify(patch), JSON.stringify(details)],
      );
      return r.rows[0].ok;
    },
    async note(id, outcome, detail) {
      await pg.query("SELECT public.note_subscription_reconcile_check($1, $2, $3)", [id, outcome, detail]);
    },
  };
  const s = (sec: number) => Math.floor(sec / 1000);
  const stripe = {
    retrieve(id: string): Promise<unknown> {
      if (id === "sub_err") return Promise.reject(Object.assign(new Error("Stripe 500"), { statusCode: 500 }));
      if (id === "sub_gone") {
        return Promise.resolve({
          id, status: "canceled",
          current_period_start: s(NOW.getTime() - 40 * DAY), current_period_end: s(NOW.getTime() - 10 * DAY),
          canceled_at: s(NOW.getTime() - 9 * DAY),
        });
      }
      return Promise.resolve({
        id, status: "active",
        current_period_start: s(NOW.getTime() - 2 * DAY), current_period_end: s(NOW.getTime() + 28 * DAY),
      });
    },
  };
  const candidates = (await pg.query<ReconcileCandidate>(
    `SELECT id, user_id, platform, status, to_json(current_period_end) #>> '{}' AS current_period_end,
            stripe_subscription_id, plan_id
       FROM public.subscription_reconcile_candidates(50, $1)`,
    [NOW.toISOString()],
  )).rows;
  assert.equal(candidates.length, 3);

  const report = await reconcileBatch(candidates, { stripe, store, catalog: [], now: NOW });
  assert.equal(report.corrected, 2);
  assert.equal(report.outcomes.provider_error, 1);

  const events = await pg.query<{ subscription_id: string }>(
    "SELECT subscription_id FROM public.subscription_events WHERE event_type = 'reconciled' ORDER BY subscription_id",
  );
  assert.deepEqual(events.rows.map((r) => r.subscription_id).sort(), [canceledAtStripe, renewed].sort());

  const rows = await pg.query<{ id: string; status: string; current_period_end: string }>(
    "SELECT id, status, to_json(current_period_end) #>> '{}' AS current_period_end FROM public.user_subscriptions",
  );
  const byId = new Map(rows.rows.map((r) => [r.id, r]));
  assert.equal(byId.get(canceledAtStripe)?.status, "canceled");
  assert.equal(byId.get(renewed)?.status, "active");
  assert.ok(new Date(byId.get(renewed)!.current_period_end).getTime() > NOW.getTime());
  // The errored row is exactly as it was: not extended, not cancelled.
  assert.equal(byId.get(errored)?.status, "active");
  assert.equal(new Date(byId.get(errored)!.current_period_end).getTime(), new Date(at(-10 * DAY)).getTime());
  const chk = await pg.query<{ outcome: string }>(
    "SELECT outcome FROM public.subscription_reconcile_checks WHERE subscription_id = $1",
    [errored],
  );
  assert.equal(chk.rows[0].outcome, "provider_error");
});

Deno.test("the RPCs are service_role only and the schedule reads Vault", async () => {
  const sql = await Deno.readTextFile(M(MIGRATION));
  for (const fn of [
    "subscription_reconcile_candidates\\(integer, timestamptz\\)",
    "subscription_reconcile_backlog\\(timestamptz\\)",
    "apply_subscription_reconciliation\\(uuid, text, jsonb, jsonb\\)",
    "note_subscription_reconcile_check\\(uuid, text, text\\)",
  ]) {
    assert.ok(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn} FROM PUBLIC, anon, authenticated;`).test(sql), fn);
    assert.ok(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn} TO service_role;`).test(sql), fn);
  }
  assert.ok(sql.includes("public.app_secret('service_role_key')"));
  assert.ok(!/current_setting\('app\.settings/.test(sql), "no app.settings credentials in the schedule");
  assert.ok(sql.includes("/functions/v1/subscription-reconcile"));
});
