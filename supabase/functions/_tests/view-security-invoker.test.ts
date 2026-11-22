// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/view-security-invoker.test.ts
//
// WEB-SEC-081: the eight views written after 20260511000000_fix_security_lints
// ran as their owner, so the RLS on agent_tasks, automation_job_runs and the
// rest did not apply to anyone reading through them. These tests build each
// view from its real migration in PGlite, with Supabase's default privileges
// (every new public table and view granted to anon and authenticated), then
// read them as anon, as a signed-in non-admin and as an admin, before and after
// 20261122000050_views_security_invoker.sql.

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

const VIEWS = [
  "social_accounts_admin",
  "automation_job_health",
  "agent_run_summary",
  "agent_tasks_overdue",
  "agent_month_spend",
  "agent_quality_summary",
  "provider_spend_mtd",
  "user_lifecycle_summary",
];

const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const USER = "00000000-0000-0000-0000-0000000000b2";

// Stand-ins for what the earlier migrations and the Supabase platform provide.
// Each admin policy the views lean on is the real one, from the real migration;
// only profiles' admin policy is mirrored here (it calls
// user_has_role_or_higher, whose migration needs much more schema).
const PRELUDE = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

  CREATE SCHEMA auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE TABLE auth.current (uid uuid);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql SECURITY DEFINER
    AS 'SELECT uid FROM auth.current LIMIT 1';

  CREATE TABLE public.user_roles (user_id uuid, role text);
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
    AS 'SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN (''admin'', ''root_admin''))';
  CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql
    AS 'BEGIN NEW.updated_at := now(); RETURN NEW; END';

  CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid);
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (user_id = auth.uid());
  CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());

  DO $$ BEGIN
    CREATE TYPE agent_category AS ENUM ('dev','maintain','nurture','prospect','support','manage','security','governance');
    CREATE TYPE agent_mode AS ENUM ('shadow','live');
  END $$;
  CREATE TABLE public.agent_registry (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_key text UNIQUE NOT NULL, name text NOT NULL, category agent_category NOT NULL,
    description text, schedule_cron text, enabled boolean NOT NULL DEFAULT true,
    tier1_confidence_threshold numeric NOT NULL DEFAULT 0.85, monthly_cost_budget_usd numeric,
    owner_role text NOT NULL DEFAULT 'admin', mode agent_mode NOT NULL DEFAULT 'shadow',
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.agent_registry ENABLE ROW LEVEL SECURITY;
  -- Copied from 20260709000001_agent_registry.sql.
  CREATE POLICY "Admin-only read for agent registry" ON public.agent_registry FOR SELECT
    USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'root_admin')));
`;

const VIEW_MIGRATIONS = [
  "20260520000006_create_social_accounts.sql",
  "20260612000002_create_automation_job_runs.sql",
  "20260709000002_agent_run_ledger.sql",
  "20260709000004_agent_tasks.sql",
  "20260709000007_agent_summary_30d.sql",
  "20260709000010_agent_month_spend.sql",
  "20260709000012_agent_quality_scores.sql",
  "20260709000033_api_cost_watchdog.sql",
  "20260709000043_lifecycle_stage.sql",
];

const FIX = "20261122000050_views_security_invoker.sql";

async function db(withFix: boolean): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(PRELUDE);
  for (const f of VIEW_MIGRATIONS) await pg.exec(await Deno.readTextFile(M(f)));
  if (withFix) await pg.exec(await Deno.readTextFile(M(FIX)));
  await pg.exec(`
    INSERT INTO auth.users VALUES ('${ADMIN}'), ('${USER}');
    INSERT INTO public.user_roles VALUES ('${ADMIN}', 'admin');
    INSERT INTO public.profiles VALUES (gen_random_uuid(), '${ADMIN}'), (gen_random_uuid(), '${USER}'), (gen_random_uuid(), NULL);
    INSERT INTO public.agent_registry (agent_key, name, category) VALUES ('fraud-abuse-detector', 'Fraud', 'security')
      ON CONFLICT (agent_key) DO NOTHING;
    INSERT INTO public.agent_tasks (agent_key, category, tier, title, payload, status, sla_due_at)
      VALUES ('fraud-abuse-detector', 'security', 2, 'Suspicious signups',
              '{"evidence": "ip 203.0.113.9, card bin 411111"}', 'escalated', now() - interval '1 day');
    INSERT INTO public.automation_job_runs (job_name, agent_key, status, error, cost_usd)
      VALUES ('fraud-abuse-detector', 'fraud-abuse-detector', 'failed', 'stripe key rejected', 1.25);
    INSERT INTO public.agent_quality_scores (agent_key, category, score, threshold, passed)
      VALUES ('fraud-abuse-detector', 'security', 90, 70, true);
    INSERT INTO public.social_accounts (platform, handle, access_token_encrypted, notes)
      VALUES ('twitter', 'dsminsider', 'enc:abc', 'recovery codes in the vault');
  `);
  return pg;
}

async function as(pg: PGlite, role: "anon" | "authenticated", uid: string | null = null) {
  await pg.exec("RESET ROLE");
  await pg.query("DELETE FROM auth.current");
  if (uid) await pg.query("INSERT INTO auth.current VALUES ($1)", [uid]);
  await pg.exec(`SET ROLE ${role}`);
}

async function rows(pg: PGlite, view: string): Promise<Record<string, unknown>[] | string> {
  try {
    return (await pg.query(`SELECT * FROM public.${view}`)).rows;
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  }
}

Deno.test("before the fix: anon reads agent_tasks payloads through agent_tasks_overdue (the hole)", async () => {
  const pg = await db(false);
  await as(pg, "anon");
  const got = await rows(pg, "agent_tasks_overdue");
  assert.ok(Array.isArray(got) && got.length === 1, `expected the leak to reproduce, got ${JSON.stringify(got)}`);
  assert.match(JSON.stringify(got[0].payload), /203\.0\.113\.9/);
  // And the same for the job errors and social account notes in the story title.
  assert.equal((await rows(pg, "automation_job_health") as unknown[]).length, 1);
  assert.equal((await rows(pg, "social_accounts_admin") as unknown[]).length, 1);
});

Deno.test("every one of the eight views has security_invoker=on", async () => {
  const pg = await db(true);
  const { rows: r } = await pg.query<{ relname: string; reloptions: string[] | null }>(
    "SELECT relname, reloptions FROM pg_class WHERE relname = ANY($1) AND relkind = 'v' ORDER BY relname",
    [VIEWS],
  );
  assert.equal(r.length, VIEWS.length);
  for (const v of r) assert.ok(v.reloptions?.includes("security_invoker=on"), `${v.relname}: ${v.reloptions}`);
});

Deno.test("anon gets no rows from any of the eight", async () => {
  const pg = await db(true);
  await as(pg, "anon");
  for (const v of VIEWS) {
    const got = await rows(pg, v);
    assert.ok(got === "42501" || (Array.isArray(got) && got.length === 0), `${v}: ${JSON.stringify(got)}`);
  }
});

Deno.test("a signed-in non-admin gets [] from social_accounts_admin, provider_spend_mtd and automation_job_health", async () => {
  const pg = await db(true);
  await as(pg, "authenticated", USER);
  for (const v of ["social_accounts_admin", "provider_spend_mtd", "automation_job_health", "agent_tasks_overdue"]) {
    assert.deepEqual(await rows(pg, v), [], v);
  }
  // user_lifecycle_summary now counts only the caller's own profile row.
  assert.deepEqual(
    (await rows(pg, "user_lifecycle_summary") as { users: number }[]).map((r) => Number(r.users)),
    [1],
  );
});

Deno.test("an admin still reads every view the admin panels use", async () => {
  const pg = await db(true);
  await as(pg, "authenticated", ADMIN);
  for (const v of ["automation_job_health", "agent_run_summary", "agent_tasks_overdue", "agent_month_spend", "agent_quality_summary"]) {
    const got = await rows(pg, v);
    assert.ok(Array.isArray(got) && got.length >= 1, `${v}: ${JSON.stringify(got)}`);
  }
  const spend = await rows(pg, "provider_spend_mtd") as { provider: string; spend_mtd: string }[];
  assert.equal(spend.length, 5, "the five seeded provider budgets");
  assert.equal(
    (await rows(pg, "user_lifecycle_summary") as { users: number }[]).reduce((n, r) => n + Number(r.users), 0),
    3,
    "admin counts every profile",
  );
  // social_accounts is service_role-only; the admin UI goes through the
  // manage-social-account edge function, which uses the service role.
  assert.deepEqual(await rows(pg, "social_accounts_admin"), []);
});

Deno.test("authenticated can no longer write through the views", async () => {
  const pg = await db(true);
  await as(pg, "authenticated", ADMIN);
  let code: string | null = null;
  try {
    await pg.query("UPDATE public.agent_tasks_overdue SET title = 'x'");
  } catch (e) {
    code = (e as { code?: string }).code ?? "error";
  }
  assert.equal(code, "42501");
});
