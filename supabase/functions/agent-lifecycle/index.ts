/**
 * SECURITY: verify_jwt = false
 * Reason: cron control-plane job; auth via requireAdminOrApiKey per WEB-SEC-001.
 * Risk level: LOW (classifies users into lifecycle stages from activity signals;
 *   writes stage + non-PII signal summaries only; sends nothing).
 *
 * agent-lifecycle (AOS-NURTURE-001) — user lifecycle-stage classifier.
 *
 * Daily, for a batch of the stalest profiles, derives a stage from activity
 * signals (signup age, last activity across saves/reviews/logins, recent saves,
 * subscription state) and records any transition. PII-safe: only counts, day
 * offsets, subscription status, and a messaging-allowed flag are stored — never
 * names, emails, or payload content. The stage is a segmentation input other
 * nurture agents read; downstream messaging must still honor the
 * messaging_allowed flag (unsubscribe/consent).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runAgent } from "../_shared/agentRun.ts";

const AGENT_KEY = "lifecycle-classifier";
const BATCH = 500;
const DAY = 24 * 60 * 60 * 1000;

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

interface Signals {
  daysSinceSignup: number;
  daysSinceActive: number | null; // null = never active beyond signup
  saves30d: number;
  subStatus: string | null;
  messagingAllowed: boolean;
}

// Deterministic stage rules from activity signals + prior stage.
function classify(s: Signals, prior: string | null): string {
  const active = s.daysSinceActive ?? Infinity;
  // Reactivated: previously lapsed but active again recently.
  if ((prior === "dormant" || prior === "churned") && active <= 7) return "reactivated";
  if (active > 90) return "churned";
  if (active > 30) return "dormant";
  // Past-due subscriptions or lapsing engagement → at risk.
  if (s.subStatus === "past_due") return "at_risk";
  if (active > 14) return "at_risk";
  // Recently active.
  if (s.daysSinceSignup <= 3 && s.saves30d === 0 && active > 1) return "new";
  if (s.daysSinceSignup <= 14 && s.saves30d < 3) return "onboarding";
  return "active";
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  const supabase: Client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const ledger = await runAgent(AGENT_KEY, async (ctx) => {
    const now = Date.now();
    // Process the stalest profiles first (nulls first via the index).
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, email, created_at, communication_preferences, lifecycle_stage")
      .order("lifecycle_updated_at", { ascending: true, nullsFirst: true })
      .limit(BATCH);
    // WEB-BE-032. THE work list. A dropped error processed nothing and reported a
    // successful run, indistinguishable from an empty profile batch.
    if (profilesError) throw new Error(`lifecycle-classifier: profile batch read failed: ${profilesError.message}`);
    const rows = (profiles ?? []) as { user_id: string; email: string | null; created_at: string; communication_preferences: unknown; lifecycle_stage: string | null }[];
    if (rows.length === 0) { ctx.summary("no profiles"); return { classified: 0, transitions: 0 }; }

    const userIds = rows.map((r) => r.user_id).filter(Boolean);
    const emails = rows.map((r) => r.email).filter((e): e is string => !!e);
    const since90 = new Date(now - 90 * DAY).toISOString();

    // Bulk-fetch activity signals (a few queries, aggregated in memory).
    const [favs, revs, subs, unsub] = await Promise.all([
      supabase.from("content_favorites").select("user_id, created_at").in("user_id", userIds).gte("created_at", since90),
      supabase.from("event_reviews").select("user_id, created_at").in("user_id", userIds).gte("created_at", since90),
      supabase.from("user_subscriptions").select("user_id, status").in("user_id", userIds),
      // LOGIN REMOVED AS AN ACTIVITY SIGNAL (WEB-QA-017). It asked
      // login_attempts for successful logins, and that table NEVER HOLDS ONE:
      // check-login-attempt inserts on record_failure and DELETES the email's
      // rows on record_success, so a success is recorded by absence. The
      // columns it named (attempt_time, success) belong to
      // failed_login_attempts, a separate table with 0 rows and no writer.
      //
      // RENAMING THE COLUMNS WOULD HAVE BEEN THE WRONG FIX. The query 42703s
      // today, so the signal contributes nothing; pointed at the real columns
      // it would contribute the time of the last FAILED login as evidence of
      // activity, which is worse than contributing nothing. The other four
      // signals - favourites, reviews, subscriptions, newsletter - are
      // unaffected. A real last-login needs a source that does not exist yet.
            supabase.from("newsletter_subscribers").select("email, status").in("email", emails),
    ]);

    const lastActiveByUser = new Map<string, number>();
    const saves30ByUser = new Map<string, number>();
    const bump = (uid: string, ts: string, isSave: boolean) => {
      const t = new Date(ts).getTime();
      if (!Number.isNaN(t)) lastActiveByUser.set(uid, Math.max(lastActiveByUser.get(uid) ?? 0, t));
      if (isSave && t >= now - 30 * DAY) saves30ByUser.set(uid, (saves30ByUser.get(uid) ?? 0) + 1);
    };
    for (const f of (favs.data ?? []) as { user_id: string; created_at: string }[]) bump(f.user_id, f.created_at, true);
    for (const r of (revs.data ?? []) as { user_id: string; created_at: string }[]) bump(r.user_id, r.created_at, false);
    const subByUser = new Map<string, string>();
    for (const s of (subs.data ?? []) as { user_id: string; status: string }[]) subByUser.set(s.user_id, s.status);
    const unsubByEmail = new Map<string, string>();
    for (const u of (unsub.data ?? []) as { email: string; status: string }[]) unsubByEmail.set(u.email, u.status);

    let transitions = 0;
    const historyRows: Record<string, unknown>[] = [];
    for (const p of rows) {
      const signupT = new Date(p.created_at).getTime();
      const lastActivity = lastActiveByUser.get(p.user_id) ?? 0;
      // WEB-LEGAL-012: read the keys the clients actually write. Signup
      // (src/pages/Auth.tsx:462) and PreferencesManager.tsx:146 both store
      // { email_notifications, sms_notifications, event_recommendations }. Nothing in
      // this repo has ever written `marketing` or `email`, so both keys this used to
      // read were undefined on every profile and `undefined !== false` made every user
      // permanently opted in - which is why the consent gates downstream have never
      // skipped anyone. Measured against production 2026-08-24: 6 of 6 profiles carry
      // email_notifications, 0 carry marketing, 0 carry email.
      //
      // The old keys stay in the expression so a future writer using them still works,
      // and absence still means opted IN (AC5) - only an explicit false stops mail.
      // event_recommendations is deliberately NOT read: it selects a content type, and
      // treating it as consent would stop churn and milestone mail for a user who only
      // turned off event suggestions.
      const commPref = (p.communication_preferences ?? {}) as {
        marketing?: boolean;
        email?: boolean;
        email_notifications?: boolean;
      };
      const messagingAllowed =
        (p.email ? unsubByEmail.get(p.email) !== "unsubscribed" : true) &&
        commPref.marketing !== false &&
        commPref.email !== false &&
        commPref.email_notifications !== false;

      const signals: Signals = {
        daysSinceSignup: Math.floor((now - signupT) / DAY),
        daysSinceActive: lastActivity > 0 ? Math.floor((now - lastActivity) / DAY) : null,
        saves30d: saves30ByUser.get(p.user_id) ?? 0,
        subStatus: subByUser.get(p.user_id) ?? null,
        messagingAllowed,
      };
      const stage = classify(signals, p.lifecycle_stage);

      await supabase
        .from("profiles")
        .update({ lifecycle_stage: stage, lifecycle_updated_at: new Date().toISOString(), lifecycle_signals: signals })
        .eq("user_id", p.user_id);

      if (stage !== p.lifecycle_stage) {
        transitions++;
        historyRows.push({ user_id: p.user_id, from_stage: p.lifecycle_stage, to_stage: stage, reason: "scheduled reclassification", signals });
      }
    }
    if (historyRows.length) await supabase.from("user_lifecycle_history").insert(historyRows);

    ctx.processed(rows.length);
    ctx.summary(`classified ${rows.length} users, ${transitions} stage transition(s)`);
    ctx.meta({ classified: rows.length, transitions });
    return { classified: rows.length, transitions };
  });

  return json({ ok: ledger.ok, status: ledger.status, ...(ledger.result ?? {}) }, ledger.ok ? 200 : 500, corsHeaders);
});
