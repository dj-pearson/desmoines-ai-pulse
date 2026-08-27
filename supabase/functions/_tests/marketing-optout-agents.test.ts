/**
 * An opted-out user is skipped by every family of marketing sender
 * (WEB-LEGAL-012 AC6).
 *
 * marketing-consent-contract.test.ts already compares the key the clients WRITE
 * against the key the classifier READS. That catches a rename. It cannot catch
 * the other half: a sender that reads the right key and mails anyway, or one
 * added later that never checks at all. These run the agents.
 *
 * ONE AGENT PER FAMILY, which is what AC6 asks for:
 *     nurture          onboarding-drip
 *     re-engagement    dormant-reengagement
 *     churn            churn-winback
 *     milestone        milestone-recognition
 *     outreach         outreach-sequencer
 * The first four gate on profiles.lifecycle_signals.messagingAllowed. The fifth
 * does not and should not: it mails business contacts from crm_leads, not users,
 * so its opt-out is the outreach_suppression list. Testing it against
 * messagingAllowed would have asserted the wrong control exists.
 *
 * ── EVERY TEST IS PAIRED, AND THE POSITIVE HALF IS THE LOAD-BEARING ONE ──────
 *
 * A mock that returns nothing everywhere makes "no email was sent" true for
 * reasons that have nothing to do with consent. So each family is asserted
 * twice: opted OUT reaches no send decision, opted IN reaches the quality gate.
 * If the fixtures ever stop driving an agent that far, the positive test fails
 * and says so, instead of the negative test passing vacuously.
 *
 * The gate is where the opted-in run stops because scoreOutput fails closed
 * without an Anthropic key, and this file deletes those keys below. That is
 * deliberate on two counts: it makes `gated` a stable observable, and it means a
 * runner that happens to hold RESEND_API_KEY cannot turn this suite into real
 * outbound mail.
 *
 * Offline: no credentials, no network, and no imports beyond the modules under
 * test - see the note on the assertions below.
 */
import type { AgentRunContext } from "../_shared/agentRun.ts";

// ── Assertions, hand-rolled, and the reason is not preference ────────────────
//
// The sibling suites import the std assert from deno.land. That module is
// unreachable from the container this was written in (the agent proxy answers
// 403 to CONNECT for deno.land), so the file used node:assert instead - which CI
// then refused, because type-checking a `node:` specifier needs @types/node in a
// node_modules directory and the deno lane has none:
//     error: Could not find "@types/node" in a node_modules folder.
// Putting --no-check on that step would have fixed it by turning off type
// checking for the whole file. Two functions with no imports fixes it without
// giving anything up, and keeps this step type-checked like its fifteen
// siblings.

function equal(actual: unknown, expected: unknown, message?: string): void {
  if (Object.is(actual, expected)) return;
  throw new Error(
    `${message ?? "values differ"}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
  );
}

/** Names what leaked, rather than only failing a length check. */
function noneOf(rows: Array<{ table: string; rows: unknown }>, message: string): void {
  if (rows.length === 0) return;
  throw new Error(`${message}\n  ${rows.length} row(s): ${rows.map((r) => r.table).join(", ")}`);
}

// Before importing anything that reads them. sendNurtureEmail POSTs to Resend
// when RESEND_API_KEY is set, and scoreOutput POSTs to Anthropic.
for (const k of ["RESEND_API_KEY", "CLAUDE_API", "ANTHROPIC_API_KEY", "CLAUDE_API_KEY"]) {
  try { Deno.env.delete(k); } catch { /* --allow-env not granted for this name */ }
}

const { run: onboardingDrip } = await import("../_shared/agents/onboarding-drip.ts");
const { run: dormantReengagement } = await import("../_shared/agents/dormant-reengagement.ts");
const { run: churnWinback } = await import("../_shared/agents/churn-winback.ts");
const { run: milestoneRecognition } = await import("../_shared/agents/milestone-recognition.ts");
const { run: outreachSequencer } = await import("../_shared/agents/outreach-sequencer.ts");

// ─── A PostgREST-shaped mock ─────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface Recorded {
  /** Every .insert(), in order, so a send can be proven absent. */
  inserts: Array<{ table: string; rows: unknown }>;
  updates: Array<{ table: string; patch: unknown }>;
}

/**
 * Builder methods that narrow or order a query. All of them return the builder
 * unchanged - the fixtures decide what a table yields, not the filters. That is
 * a real limitation and it is the right one here: these tests are about whether
 * a branch is taken, not about whether a WHERE clause is correct.
 */
const PASSTHROUGH = [
  "select", "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
  "or", "not", "filter", "order", "limit", "range", "contains", "overlaps",
];

function makeClient(tables: Record<string, Row[]>) {
  const rec: Recorded = { inserts: [], updates: [] };

  function builder(table: string) {
    // "select" yields the fixture; a write yields one synthetic row, because
    // callers chain .select("id").single() onto an insert to get the new id.
    let yields = () => tables[table] ?? [];

    const self: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: yields(), error: null }).then(resolve, reject),
      single: () => Promise.resolve({ data: yields()[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: yields()[0] ?? null, error: null }),
      insert: (rows: unknown) => {
        rec.inserts.push({ table, rows });
        yields = () => [{ id: `mock-${rec.inserts.length}` }];
        return self;
      },
      upsert: (rows: unknown) => {
        rec.inserts.push({ table, rows });
        yields = () => [{ id: `mock-${rec.inserts.length}` }];
        return self;
      },
      update: (patch: unknown) => {
        rec.updates.push({ table, patch });
        yields = () => [{ id: `mock-${rec.updates.length}` }];
        return self;
      },
      delete: () => { yields = () => []; return self; },
    };
    for (const m of PASSTHROUGH) self[m] = () => self;
    return self;
  }

  // deno-lint-ignore no-explicit-any
  const client: any = { from: (t: string) => builder(t) };
  return { client, rec };
}

/** The counters an agent reports, captured instead of written to a ledger. */
function makeCtx() {
  let meta: Record<string, unknown> = {};
  let summary = "";
  const ctx = {
    processed: () => {},
    failed: () => {},
    escalated: () => {},
    tokens: () => {},
    cost: () => {},
    summary: (s: string) => { summary = s; },
    meta: (m: Record<string, unknown>) => { meta = { ...meta, ...m }; },
  } as unknown as AgentRunContext;
  return { ctx, read: () => ({ meta, summary }) };
}

/**
 * Sends are proven absent by their ledger row, not by a spy on the mailer.
 * sendNurtureEmail records into nurture_sends on EVERY outcome - queued, failed,
 * and the skipped row it writes when no mailer is configured - so the absence of
 * a nurture_sends insert is the absence of an attempt.
 */
const sendLedgerInserts = (rec: Recorded) =>
  rec.inserts.filter((i) => i.table === "nurture_sends" || i.table === "outreach_sends");

const OPTED_OUT = { messagingAllowed: false };
const OPTED_IN = { messagingAllowed: true };

// ─── nurture: onboarding-drip ────────────────────────────────────────────────

function onboardingFixtures(signals: Row) {
  return {
    profiles: [{
      user_id: "u1",
      email: "someone@example.com",
      created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      lifecycle_signals: signals,
    }],
    nurture_sends: [],
    content_favorites: [],
  };
}

Deno.test("nurture: onboarding-drip does not mail an opted-out user", async () => {
  const { client, rec } = makeClient(onboardingFixtures(OPTED_OUT));
  const { ctx, read } = makeCtx();
  const out = await onboardingDrip(ctx, { supabase: client, req: new Request("http://x"), body: {} }) as Row;

  equal(out.sent, 0);
  equal(out.skipped, 1, "the profile should be counted as skipped for consent");
  noneOf(sendLedgerInserts(rec), "an opted-out user reached the send ledger");
  equal(read().meta.sent, 0);
});

Deno.test("nurture: onboarding-drip DOES reach the send path for an opted-in user", async () => {
  const { client } = makeClient(onboardingFixtures(OPTED_IN));
  const { ctx } = makeCtx();
  const out = await onboardingDrip(ctx, { supabase: client, req: new Request("http://x"), body: {} }) as Row;

  equal(out.skipped, 0, "an opted-in user must not be skipped");
  equal(out.gated, 1, "should have reached the quality gate; if not, the fixture stopped it earlier and the negative test above proves nothing");
});

// ─── re-engagement: dormant-reengagement ─────────────────────────────────────

function dormantFixtures(signals: Row) {
  return {
    profiles: [{
      user_id: "u1",
      email: "someone@example.com",
      lifecycle_signals: signals,
      reengage_suppressed_at: null,
    }],
    nurture_sends: [],
    events: [],
  };
}

Deno.test("re-engagement: dormant-reengagement does not mail an opted-out user", async () => {
  const { client, rec } = makeClient(dormantFixtures(OPTED_OUT));
  const { ctx, read } = makeCtx();
  const out = await dormantReengagement(ctx, { supabase: client, req: new Request("http://x"), body: {} }) as Row;

  equal(out.sent, 0);
  equal(read().meta.noConsent, 1);
  noneOf(sendLedgerInserts(rec), "an opted-out user reached the send ledger");
});

Deno.test("re-engagement: dormant-reengagement DOES reach the send path for an opted-in user", async () => {
  const { client } = makeClient(dormantFixtures(OPTED_IN));
  const { ctx, read } = makeCtx();
  await dormantReengagement(ctx, { supabase: client, req: new Request("http://x"), body: {} });

  equal(read().meta.noConsent, 0);
  equal(read().meta.gated, 1, "should have reached the quality gate");
});

// ─── churn: churn-winback ────────────────────────────────────────────────────

function churnFixtures(signals: Row) {
  return {
    profiles: [{
      user_id: "u1",
      email: "someone@example.com",
      // Enough inactivity to score as at-risk without hitting the offer play,
      // which is approval-gated and would stop the run for a different reason.
      lifecycle_signals: { daysSinceActive: 40, subStatus: "free", ...signals },
      lifecycle_stage: "active",
    }],
    winback_interventions: [],
    nurture_sends: [],
    user_lifecycle_history: [],
  };
}

Deno.test("churn: churn-winback does not mail an opted-out user", async () => {
  const { client, rec } = makeClient(churnFixtures(OPTED_OUT));
  const { ctx, read } = makeCtx();
  await churnWinback(ctx, { supabase: client, req: new Request("http://x"), body: {} });

  equal(read().meta.skipped, 1, "the profile should be counted as skipped for consent");
  noneOf(sendLedgerInserts(rec), "an opted-out user reached the send ledger");
});

Deno.test("churn: churn-winback DOES reach the send path for an opted-in user", async () => {
  const { client } = makeClient(churnFixtures(OPTED_IN));
  const { ctx, read } = makeCtx();
  await churnWinback(ctx, { supabase: client, req: new Request("http://x"), body: {} });

  equal(read().meta.skipped, 0, "an opted-in user must not be skipped");
  equal(read().meta.gated, 1, "should have reached the quality gate");
});

// ─── milestone: milestone-recognition ────────────────────────────────────────

function milestoneFixtures(signals: Row) {
  const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
  return {
    profiles: [{ user_id: "u1", email: "someone@example.com", created_at: old, lifecycle_signals: signals }],
    // Enough activity that a milestone is actually earned; without one the agent
    // returns before consent is ever consulted.
    content_favorites: Array.from({ length: 12 }, () => ({ user_id: "u1", created_at: old })),
    event_reviews: [],
    user_milestones: [],
    nurture_sends: [],
  };
}

Deno.test("milestone: milestone-recognition does not mail an opted-out user", async () => {
  const { client, rec } = makeClient(milestoneFixtures(OPTED_OUT));
  const { ctx, read } = makeCtx();
  const out = await milestoneRecognition(ctx, { supabase: client, req: new Request("http://x"), body: {} }) as Row;

  equal(out.recognized, 1, "the milestone itself is in-app and is NOT gated on email consent");
  equal(out.emailed, 0, "an opted-out user must not be emailed about it");
  noneOf(sendLedgerInserts(rec), "an opted-out user reached the send ledger");
  // `emailed === 0` alone does NOT prove this: the quality gate also holds at
  // zero, so forcing consent true still left the count at 0 and the test passed
  // - measured, by removing the gate and re-running. `gated === 0` is the
  // assertion that discriminates, because an opted-out user must never reach the
  // gate at all.
  equal(out.gated, 0, "an opted-out user reached the quality gate, so consent was not checked first");
});

Deno.test("milestone: milestone-recognition DOES reach the send path for an opted-in user", async () => {
  const { client } = makeClient(milestoneFixtures(OPTED_IN));
  const { ctx } = makeCtx();
  const out = await milestoneRecognition(ctx, { supabase: client, req: new Request("http://x"), body: {} }) as Row;

  equal(out.recognized, 1);
  equal(out.gated, 1, "should have reached the quality gate");
});

// ─── outreach: outreach-sequencer ────────────────────────────────────────────
//
// Different population, different control. This one mails a business contact
// from crm_leads, so the opt-out that governs it is outreach_suppression.

function outreachFixtures(suppression: Row[]) {
  return {
    outreach_templates: [{ step: 1, subject: "hi {{business_name}}", body: "hello", approved: true }],
    crm_leads: [{ id: "l1", business_name: "Cafe", contact_email: "owner@cafe.example" }],
    outreach_suppression: suppression,
    outreach_sends: [],
  };
}

Deno.test("outreach: outreach-sequencer does not mail a suppressed address", async () => {
  const { client, rec } = makeClient(outreachFixtures([{ id: "s1" }]));
  const { ctx } = makeCtx();
  const out = await outreachSequencer(ctx, { supabase: client, req: new Request("http://x"), body: {} }) as Row;

  equal(out.sent, 0);
  equal(out.skipped, 1);
  noneOf(sendLedgerInserts(rec), "a suppressed address reached the send ledger");
});

Deno.test("outreach: outreach-sequencer DOES reach the send path for an unsuppressed address", async () => {
  const { client } = makeClient(outreachFixtures([]));
  const { ctx } = makeCtx();
  const out = await outreachSequencer(ctx, { supabase: client, req: new Request("http://x"), body: {} }) as Row;

  equal(out.skipped, 0, "an unsuppressed lead must not be skipped");
  equal(out.gated, 1, "should have reached the quality gate");
});
