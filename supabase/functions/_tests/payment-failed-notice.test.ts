/**
 * The payment-failed (dunning) notice is transactional (owner decision
 * 2026-11-22, follow-up to WEB-LEGAL-016).
 *
 *   deno test --allow-read --allow-env --no-check supabase/functions/_tests/payment-failed-notice.test.ts
 *
 * Both copies of subscription-nurture skipped the dunning step when the member
 * had not consented to marketing, so an opted-out customer whose card failed
 * heard nothing until the subscription ended. These run the agent-runner copy
 * against a PostgREST-shaped mock and assert:
 *
 *   - an opted-out (and a never-classified) past_due customer reaches the
 *     mailer with a transactional dunning email;
 *   - an opted-out free member does NOT get the upgrade prompt, paired with an
 *     opted-in one who reaches the quality gate, so the negative is not vacuous;
 *   - a bounce suppression still blocks the notice and an unsubscribe does not;
 *   - the notice is not sent when subscription-lifecycle already sent its own
 *     payment-failed email, and is when that send is outside the window;
 *   - the transactional footer carries no marketing unsubscribe.
 *
 * The standalone agent-subscription-nurture is a Deno.serve file and cannot be
 * imported, so the source guards at the bottom hold it to the same blocks.
 *
 * Offline: SES and Anthropic keys are deleted before anything is imported, so
 * sendEmail records provider "none" and scoreOutput fails closed. Sends are
 * proven by the nurture_sends and email_log rows those write on every outcome.
 */
import { strict as assert } from "node:assert";
import type { AgentRunContext } from "../_shared/agentRun.ts";

for (const k of ["AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY", "CLAUDE_API", "ANTHROPIC_API_KEY", "CLAUDE_API_KEY"]) {
  try { Deno.env.delete(k); } catch { /* --allow-env not granted for this name */ }
}

const { run: subscriptionNurture } = await import("../_shared/agents/subscription-nurture.ts");
const { paymentFailedNoticeSentSince } = await import("../_shared/paymentFailedNotice.ts");
const { buildDunningEmail } = await import("../_shared/billingLinks.ts");
const { renderEmail, listUnsubscribeHeaders } = await import("../_shared/emailLayout.ts");

// --- A PostgREST-shaped mock that applies the filters these paths use ---

type Row = Record<string, unknown>;
interface Insert { table: string; rows: Row[] }

/**
 * Unlike marketing-optout-agents.test.ts this mock honours eq / in / gte / lte /
 * is / not, because the agent reads user_subscriptions three times with
 * different status filters, and the dedupe is a date window. A mock that
 * ignored them would put the past_due row in the trial sweep too.
 */
function makeClient(tables: Record<string, Row[]>, failTables: string[] = []) {
  const inserts: Insert[] = [];

  function builder(table: string) {
    const preds: Array<(r: Row) => boolean> = [];
    let wrote: Row[] | null = null;
    const fail = failTables.includes(table);
    const rows = () => (wrote ?? (tables[table] ?? []).filter((r) => preds.every((p) => p(r))));
    const result = () => fail
      ? { data: null, error: { message: `${table} unavailable` } }
      : { data: rows(), error: null };

    const self: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
      single: () => Promise.resolve(fail ? result() : { data: rows()[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve(fail ? result() : { data: rows()[0] ?? null, error: null }),
      insert: (r: Row | Row[]) => {
        const list = Array.isArray(r) ? r : [r];
        inserts.push({ table, rows: list });
        wrote = [{ id: `mock-${inserts.length}` }];
        return self;
      },
      update: () => { wrote = [{ id: "mock-update" }]; return self; },
      eq: (c: string, v: unknown) => { preds.push((r) => r[c] === v); return self; },
      in: (c: string, v: unknown[]) => { preds.push((r) => v.includes(r[c])); return self; },
      gte: (c: string, v: string) => { preds.push((r) => String(r[c]) >= v); return self; },
      lte: (c: string, v: string) => { preds.push((r) => String(r[c]) <= v); return self; },
      is: (c: string, v: unknown) => { preds.push((r) => (r[c] ?? null) === v); return self; },
      not: (c: string, op: string, v: unknown) => {
        if (op === "is") preds.push((r) => (r[c] ?? null) !== v);
        else if (op === "in") {
          const list = String(v).replace(/[()]/g, "").split(",");
          preds.push((r) => !list.includes(String(r[c])));
        }
        return self;
      },
    };
    for (const m of ["select", "order", "limit", "or"]) self[m] = () => self;
    return self;
  }

  // deno-lint-ignore no-explicit-any
  const client: any = { from: (t: string) => builder(t) };
  const of = (table: string) => inserts.filter((i) => i.table === table).flatMap((i) => i.rows);
  return { client, of };
}

function makeCtx(): AgentRunContext {
  return {
    processed: () => {}, failed: () => {}, escalated: () => {}, tokens: () => {}, cost: () => {},
    summary: () => {}, meta: () => {},
  } as unknown as AgentRunContext;
}

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86_400_000;

const OPTED_OUT = { messagingAllowed: false };
const OPTED_IN = { messagingAllowed: true };

function pastDueFixtures(signals: Row | null, extra: Record<string, Row[]> = {}) {
  return {
    user_subscriptions: [{ user_id: "u-late", status: "past_due", platform: "web" }],
    // lifecycle_stage is not "active", so the upgrade sweep does not see this
    // member; the dunning step is the only path under test here.
    profiles: [{ user_id: "u-late", email: "late@example.com", lifecycle_stage: "at_risk", lifecycle_signals: signals }],
    nurture_sends: [],
    subscription_events: [],
    email_suppressions: [],
    ...extra,
  };
}

const run = (client: unknown) =>
  subscriptionNurture(makeCtx(), { supabase: client, req: new Request("http://x"), body: {} } as never);

const dunningLedger = (of: (t: string) => Row[]) => of("nurture_sends").filter((r) => r.kind === "dunning");
const dunningLog = (of: (t: string) => Row[]) => of("email_log").filter((r) => r.template === "nurture_dunning");

// --- An opted-out customer with a failed payment gets the notice ---

Deno.test("an opted-out customer with a failed payment reaches the mailer with the dunning notice", async () => {
  const { client, of } = makeClient(pastDueFixtures(OPTED_OUT));
  await run(client);

  assert.equal(dunningLedger(of).length, 1, "the dunning step skipped an opted-out customer");
  const log = dunningLog(of);
  assert.equal(log.length, 1);
  assert.equal(log[0].category, "transactional", "a payment-failed notice must not be sent as marketing");
  assert.equal(log[0].to_email, "late@example.com");
  // provider "none" is the offline mailer: it got as far as sending.
  assert.equal(log[0].status, "skipped");
  assert.equal(log[0].provider, "none");
  // The quality gate is not run for a required notice.
  assert.equal(of("agent_quality_scores").length, 0);
});

Deno.test("a never-classified customer (no lifecycle_signals) also gets the dunning notice", async () => {
  const { client, of } = makeClient(pastDueFixtures(null));
  await run(client);
  assert.equal(dunningLedger(of).length, 1);
});

// --- Web-billed subscriptions only ---
// Apple and Google run their own retries, and the copy says to update a card
// on /subscription. The mock ignores .or(), so these exercise the per-row
// isWebBilled check; the source guards below cover the query filter.

function platformFixtures(platform: string | null) {
  return pastDueFixtures(OPTED_OUT, {
    user_subscriptions: [{ user_id: "u-late", status: "past_due", platform }],
  });
}

for (const platform of ["ios", "android"]) {
  Deno.test(`a past_due ${platform} subscriber gets no dunning email`, async () => {
    const { client, of } = makeClient(platformFixtures(platform));
    await run(client);
    assert.deepEqual(dunningLedger(of), [], `${platform} reached the dunning send`);
    assert.deepEqual(dunningLog(of), []);
  });
}

for (const platform of ["web", null]) {
  Deno.test(`counter-assertion: a past_due ${platform ?? "legacy (no platform)"} subscriber does get it`, async () => {
    const { client, of } = makeClient(platformFixtures(platform));
    await run(client);
    assert.equal(dunningLedger(of).length, 1);
  });
}

Deno.test("nurture and lifecycle share one web-billed predicate", async () => {
  const shared = await import("../_shared/paymentFailedNotice.ts");
  const policy = await import("../subscription-lifecycle/policy.ts");
  assert.equal(policy.isWebBilled, shared.isWebBilled, "policy.ts must re-export the shared rule, not keep its own");
  for (const p of ["ios", "android"]) assert.equal(shared.isWebBilled(p), false);
  for (const p of ["web", null, ""]) assert.equal(shared.isWebBilled(p), true);
});

// --- Marketing stays behind consent ---

function freeMemberFixtures(signals: Row | null) {
  return {
    user_subscriptions: [],
    profiles: [{ user_id: "u-free", email: "free@example.com", lifecycle_stage: "active", lifecycle_signals: signals }],
    nurture_sends: [],
    subscription_events: [],
    email_suppressions: [],
  };
}

Deno.test("an opted-out free member does not get the upgrade prompt", async () => {
  const { client, of } = makeClient(freeMemberFixtures(OPTED_OUT));
  await run(client);
  assert.deepEqual(of("nurture_sends"), [], "an opted-out member reached the send ledger");
  assert.deepEqual(of("agent_quality_scores"), [], "an opted-out member reached the quality gate");
});

Deno.test("a never-classified free member does not get the upgrade prompt", async () => {
  // `messagingAllowed === false` let this one through; consent is recorded, not assumed.
  const { client, of } = makeClient(freeMemberFixtures(null));
  await run(client);
  assert.deepEqual(of("agent_quality_scores"), []);
});

Deno.test("counter-assertion: an opted-in free member DOES reach the upgrade prompt's quality gate", async () => {
  const { client, of } = makeClient(freeMemberFixtures(OPTED_IN));
  await run(client);
  const scored = of("agent_quality_scores");
  assert.equal(scored.length, 1, "the fixture no longer drives the upgrade step; the negatives above prove nothing");
  assert.equal(scored[0].category, "nurture");
  // scoreOutput fails closed offline, so nothing is sent.
  assert.deepEqual(of("nurture_sends"), []);
});

// --- Hard suppressions still apply ---

Deno.test("a bounced address does not get the dunning notice", async () => {
  const { client, of } = makeClient(pastDueFixtures(OPTED_OUT, {
    email_suppressions: [{ email: "late@example.com", reason: "bounce" }],
  }));
  await run(client);
  const log = dunningLog(of);
  assert.equal(log.length, 1);
  assert.equal(log[0].status, "suppressed");
});

Deno.test("a complaint blocks it too", async () => {
  const { client, of } = makeClient(pastDueFixtures(OPTED_OUT, {
    email_suppressions: [{ email: "late@example.com", reason: "complaint" }],
  }));
  await run(client);
  assert.equal(dunningLog(of)[0].status, "suppressed");
});

Deno.test("a marketing unsubscribe does not block it", async () => {
  const { client, of } = makeClient(pastDueFixtures(OPTED_OUT, {
    email_suppressions: [{ email: "late@example.com", reason: "unsubscribe" }],
  }));
  await run(client);
  const log = dunningLog(of);
  assert.equal(log[0].status, "skipped");
  assert.equal(log[0].provider, "none", "an unsubscribe suppression stopped a transactional notice");
});

// --- One failed invoice, one notice ---

Deno.test("nurture does not send when subscription-lifecycle sent its payment-failed email today", async () => {
  const { client, of } = makeClient(pastDueFixtures(OPTED_OUT, {
    subscription_events: [{ id: "e1", user_id: "u-late", event_type: "payment_failed", created_at: iso(5 * 60 * 60 * 1000) }],
  }));
  await run(client);
  assert.deepEqual(dunningLedger(of), [], "both jobs mailed the same failed invoice");
});

Deno.test("counter-assertion: a lifecycle send outside the window does not block it", async () => {
  const { client, of } = makeClient(pastDueFixtures(OPTED_OUT, {
    subscription_events: [{ id: "e1", user_id: "u-late", event_type: "payment_failed", created_at: iso(4 * DAY) }],
  }));
  await run(client);
  assert.equal(dunningLedger(of).length, 1);
});

Deno.test("subscription-lifecycle's check sees a nurture dunning send", async () => {
  const sent = makeClient({
    subscription_events: [],
    nurture_sends: [{ id: "n1", user_id: "u-late", kind: "dunning", status: "queued", created_at: iso(2 * 60 * 60 * 1000) }],
  });
  assert.equal(await paymentFailedNoticeSentSince(sent.client, "u-late", iso(DAY)), true);

  // Counter-assertions: a send that never reached anyone, or an older one, does not count.
  for (const status of ["failed", "skipped"]) {
    const notSent = makeClient({
      subscription_events: [],
      nurture_sends: [{ id: "n1", user_id: "u-late", kind: "dunning", status, created_at: iso(2 * 60 * 60 * 1000) }],
    });
    assert.equal(await paymentFailedNoticeSentSince(notSent.client, "u-late", iso(DAY)), false, `a ${status} row blocked the notice`);
  }
  const old = makeClient({
    subscription_events: [],
    nurture_sends: [{ id: "n1", user_id: "u-late", kind: "dunning", status: "queued", created_at: iso(2 * DAY) }],
  });
  assert.equal(await paymentFailedNoticeSentSince(old.client, "u-late", iso(DAY)), false);
});

Deno.test("an unreadable ledger is treated as sent (fails closed)", async () => {
  for (const table of ["subscription_events", "nurture_sends"]) {
    const { client } = makeClient({ subscription_events: [], nurture_sends: [] }, [table]);
    assert.equal(await paymentFailedNoticeSentSince(client, "u-late", iso(DAY)), true, `${table} error read as not sent`);
  }
});

// --- The footer ---

Deno.test("the dunning notice carries no marketing unsubscribe", () => {
  const dun = buildDunningEmail("https://desmoinesinsider.com");
  const rendered = renderEmail({
    bodyHtml: dun.html,
    bodyText: dun.text,
    recipient: { email: "late@example.com", unsubscribeToken: "a".repeat(48) },
    category: "transactional",
  });
  assert.doesNotMatch(rendered.html, /unsubscribe/i, "an unsubscribe link suggests opting out stops a billing notice");
  assert.doesNotMatch(rendered.text, /unsubscribe/i);
  assert.deepEqual(listUnsubscribeHeaders(rendered), {});

  // Counter-assertion: the same body as marketing does get one, so the check can fire.
  const marketing = renderEmail({
    bodyHtml: dun.html,
    bodyText: dun.text,
    recipient: { email: "late@example.com", unsubscribeToken: "a".repeat(48) },
    category: "marketing",
  });
  assert.match(marketing.html, /unsubscribe/i);
});

// --- Source guards: both nurture copies, and the lifecycle job ---

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");

function block(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + 1);
  assert(a !== -1 && b > a, `block "${from}" not found; update this test`);
  return src.slice(a, b);
}

// The section markers below contain U+2500 because the source files do; they
// are matched literally, so they cannot be ASCII.
const NURTURE_COPIES = [
  "../_shared/agents/subscription-nurture.ts",
  "../agent-subscription-nurture/index.ts",
];

for (const path of NURTURE_COPIES) {
  Deno.test(`dunning is sent as a transactional notice, deduped against lifecycle (${path})`, async () => {
    const dunning = codeOnly(block(await read(path), "// ── 2) Dunning", "// ── 3) Upgrade"));
    assert(!/consented\(|hasMarketingConsent|messagingAllowed|lifecycle_signals/.test(dunning),
      "the dunning step reads marketing consent again");
    assert(dunning.includes("sendNotice("), "dunning must use the transactional sender");
    assert(!dunning.includes("sendStep("), "sendStep runs the marketing quality gate");
    assert(dunning.includes("paymentFailedNoticeSentSince("), "dunning must check subscription-lifecycle's ledger");
    assert(dunning.includes(".or(WEB_BILLED_FILTER)"), "the past_due query must list web-billed rows only");
    assert(dunning.includes("if (!isWebBilled(d.platform)) continue;"), "store rows must be skipped per row too");
  });

  Deno.test(`the upgrade prompt is gated on recorded consent (${path})`, async () => {
    const src = await read(path);
    const upgrade = codeOnly(src.slice(src.indexOf("// ── 3) Upgrade")));
    assert(/if \(!hasMarketingConsent\(p\.lifecycle_signals\)\) continue;/.test(upgrade));
    assert(upgrade.includes("sendStep("), "the upgrade prompt is marketing and keeps the quality gate");
  });
}

Deno.test("both nurture copies have the same dunning step", async () => {
  const norm = (s: string) => codeOnly(s).split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  const [a, b] = await Promise.all(NURTURE_COPIES.map(read));
  assert.equal(
    norm(block(a, "// ── 2) Dunning", "// ── 3) Upgrade")),
    norm(block(b, "// ── 2) Dunning", "// ── 3) Upgrade")),
    "the two copies drifted; WEB-LEGAL-006 landed on one copy only for exactly this reason",
  );
});

Deno.test("subscription-lifecycle's payment-failed case reads both ledgers", async () => {
  const src = codeOnly(await read("../subscription-lifecycle/index.ts"));
  const c = block(src, "case 'payment_failed':", "case 'cancel_in_stripe':");
  assert(c.includes("paymentFailedNoticeSentSince("), "lifecycle would send after nurture already did");
  assert(!c.includes("alreadyLogged("), "alreadyLogged reads only subscription_events");
  assert(src.includes(".or(WEB_BILLED_FILTER)"), "lifecycle must list rows with the shared web-billed filter");
});

Deno.test("subscription-lifecycle sends payment_failed as transactional", async () => {
  const { lifecycleEmail } = await import("../subscription-lifecycle/policy.ts");
  const msg = lifecycleEmail(
    { kind: "payment_failed", accessUntil: Date.now() + 7 * DAY },
    { planName: "Insider", manageUrl: "https://desmoinesinsider.com/subscription", siteUrl: "https://desmoinesinsider.com" },
  );
  assert.equal(msg?.category, "transactional");
});
