// Run with:
//   deno test --allow-read supabase/functions/_tests/subscription-reconcile.test.ts
//
// WEB-BE-062: the nightly reconciler, driven with a stubbed Stripe client and a
// recording store. The rule under test: only an answer Stripe actually gave is
// written; an error, a 404 or an answer we cannot read writes nothing, so it
// neither extends entitlement nor revokes it.

import { strict as assert } from "node:assert";
import {
  failedCount,
  isStripeNotFound,
  parseBatchSize,
  type ReconcileCandidate,
  reconcileBatch,
  type ReconcileOutcome,
  type ReconcileStore,
  readStripeSubscription,
} from "../_shared/subscriptionReconcile.ts";
import { mapStripeStatus } from "../_shared/stripeSubscriptionRow.ts";

const NOW = new Date("2026-11-20T12:00:00Z");
const DAY = 86_400;
const nowS = Math.floor(NOW.getTime() / 1000);
const iso = (s: number) => new Date(s * 1000).toISOString();

function candidate(over: Partial<ReconcileCandidate> = {}): ReconcileCandidate {
  return {
    id: "row-1",
    user_id: "user-1",
    platform: "web",
    status: "active",
    current_period_end: iso(nowS - 10 * DAY),
    stripe_subscription_id: "sub_1",
    plan_id: "plan-insider",
    ...over,
  };
}

function stripeSub(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    status: "active",
    current_period_start: nowS - 40 * DAY,
    current_period_end: nowS - 10 * DAY,
    cancel_at_period_end: false,
    canceled_at: null,
    trial_end: null,
    items: { data: [{ price: { id: "price_insider_m", recurring: { interval: "month" } } }] },
    ...over,
  };
}

interface Recorded {
  applied: Array<{ id: string; patch: Record<string, unknown>; details: Record<string, unknown> }>;
  notes: Array<{ id: string; outcome: ReconcileOutcome; detail: string | null }>;
}

function recordingStore(opts: { apply?: () => Promise<boolean>; noteThrows?: boolean } = {}): ReconcileStore & Recorded {
  const rec: Recorded = { applied: [], notes: [] };
  return {
    ...rec,
    async apply(c, patch, details) {
      rec.applied.push({ id: c.id, patch, details });
      return opts.apply ? await opts.apply() : true;
    },
    async note(id, outcome, detail) {
      if (opts.noteThrows) throw new Error("db down");
      rec.notes.push({ id, outcome, detail });
    },
  };
}

function stubStripe(answer: (id: string) => Promise<unknown>) {
  const calls: string[] = [];
  return {
    calls,
    retrieve(id: string) {
      calls.push(id);
      return answer(id);
    },
  };
}

const CATALOG = [
  { id: "plan-insider", stripe_price_id_monthly: "price_insider_m", stripe_price_id_yearly: null },
  { id: "plan-vip", stripe_price_id_monthly: "price_vip_m", stripe_price_id_yearly: null },
];

Deno.test("Stripe says canceled: the row is corrected and the event carries before and after", async () => {
  const store = recordingStore();
  const stripe = stubStripe((id) => Promise.resolve(stripeSub(id, { status: "canceled", canceled_at: nowS - 9 * DAY })));
  const report = await reconcileBatch([candidate()], { stripe, store, catalog: CATALOG, now: NOW });
  assert.equal(report.corrected, 1);
  assert.equal(store.applied.length, 1);
  assert.equal(store.applied[0].patch.status, "canceled");
  const d = store.applied[0].details as { before: { status: string }; after: { status: string }; source: string };
  assert.equal(d.source, "stripe");
  assert.equal(d.before.status, "active");
  assert.equal(d.after.status, "canceled");
  assert.equal(failedCount(report), 0);
  assert.deepEqual(store.notes, [], "a correction's check is written by apply, in its transaction");
});

Deno.test("Stripe says renewed: the new period end is written", async () => {
  const store = recordingStore();
  const stripe = stubStripe((id) =>
    Promise.resolve(stripeSub(id, { current_period_start: nowS - 2 * DAY, current_period_end: nowS + 28 * DAY }))
  );
  const report = await reconcileBatch([candidate()], { stripe, store, catalog: CATALOG, now: NOW });
  assert.equal(report.corrected, 1);
  assert.equal(store.applied[0].patch.current_period_end, iso(nowS + 28 * DAY));
});

Deno.test("Stripe agrees with the row: nothing is written, the row is noted unchanged", async () => {
  const store = recordingStore();
  const stripe = stubStripe((id) => Promise.resolve(stripeSub(id)));
  const report = await reconcileBatch([candidate()], { stripe, store, catalog: CATALOG, now: NOW });
  assert.equal(report.corrected, 0);
  assert.equal(store.applied.length, 0);
  assert.deepEqual(store.notes.map((n) => n.outcome), ["unchanged"]);
});

Deno.test("a plan change at Stripe moves plan_id through the catalogue", async () => {
  const store = recordingStore();
  const stripe = stubStripe((id) =>
    Promise.resolve(stripeSub(id, { items: { data: [{ price: { id: "price_vip_m", recurring: { interval: "month" } } }] } }))
  );
  const report = await reconcileBatch([candidate()], { stripe, store, catalog: CATALOG, now: NOW });
  assert.equal(report.corrected, 1);
  assert.equal(store.applied[0].patch.plan_id, "plan-vip");
});

Deno.test("a Stripe error writes nothing and counts as failed", async () => {
  const store = recordingStore();
  const stripe = stubStripe(() => Promise.reject(Object.assign(new Error("connection reset"), { statusCode: 500 })));
  const report = await reconcileBatch([candidate()], { stripe, store, catalog: CATALOG, now: NOW });
  assert.equal(store.applied.length, 0, "an error must not reach user_subscriptions");
  assert.equal(report.outcomes.provider_error, 1);
  assert.equal(failedCount(report), 1);
  assert.equal(store.notes[0].outcome, "provider_error");
  assert.match(report.problems[0].detail, /connection reset/);
});

Deno.test("a 404 is reported as not_found and is not taken as a cancellation", async () => {
  const store = recordingStore();
  const notFound = Object.assign(new Error("No such subscription: 'sub_1'"), { statusCode: 404, code: "resource_missing" });
  const stripe = stubStripe(() => Promise.reject(notFound));
  const report = await reconcileBatch([candidate()], { stripe, store, catalog: CATALOG, now: NOW });
  assert.equal(store.applied.length, 0);
  assert.equal(report.outcomes.not_found, 1);
  assert.ok(isStripeNotFound(notFound));
  assert.ok(!isStripeNotFound(new Error("timeout")));
});

Deno.test("an unknown Stripe status is unreadable, though mapStripeStatus would have said active", async () => {
  // Counter-assertion first: the webhook's mapping turns an unknown status into
  // 'active'. Written by this job, that would extend entitlement on an answer
  // nobody understood.
  assert.equal(mapStripeStatus("mystery"), "active");
  const store = recordingStore();
  const stripe = stubStripe((id) =>
    Promise.resolve(stripeSub(id, { status: "mystery", current_period_end: nowS + 30 * DAY }))
  );
  const report = await reconcileBatch([candidate()], { stripe, store, catalog: CATALOG, now: NOW });
  assert.equal(store.applied.length, 0);
  assert.equal(report.outcomes.unreadable, 1);
  assert.equal(failedCount(report), 1);
});

Deno.test("an answer for a different id, or with no period, is unreadable", () => {
  assert.equal(readStripeSubscription("sub_1", stripeSub("sub_2")).kind, "unreadable");
  assert.equal(readStripeSubscription("sub_1", stripeSub("sub_1", { current_period_end: null })).kind, "unreadable");
  assert.equal(readStripeSubscription("sub_1", stripeSub("sub_1", { current_period_start: undefined })).kind, "unreadable");
  assert.equal(readStripeSubscription("sub_1", null).kind, "unreadable");
  assert.equal(readStripeSubscription("sub_1", stripeSub("sub_1")).kind, "ok");
});

Deno.test("iOS and Android rows are reported, and Stripe is never asked about them", async () => {
  const store = recordingStore();
  const stripe = stubStripe((id) => Promise.resolve(stripeSub(id)));
  const report = await reconcileBatch(
    [
      candidate({ id: "ios-1", platform: "ios", stripe_subscription_id: null }),
      candidate({ id: "and-1", platform: "android", stripe_subscription_id: null }),
      candidate({ id: "web-noid", stripe_subscription_id: null }),
    ],
    { stripe, store, catalog: CATALOG, now: NOW },
  );
  assert.deepEqual(stripe.calls, []);
  assert.equal(report.outcomes.provider_not_wired, 2);
  assert.equal(report.outcomes.no_provider_reference, 1);
  assert.equal(store.applied.length, 0);
  assert.equal(failedCount(report), 0, "a known gap is reported, not a failure every night");
});

Deno.test("a row that moved since the read, or a failed write, is reported and the batch continues", async () => {
  let call = 0;
  const store = recordingStore({
    apply: () => {
      call++;
      if (call === 1) return Promise.resolve(false);
      if (call === 2) return Promise.reject(new Error("deadlock"));
      return Promise.resolve(true);
    },
  });
  const stripe = stubStripe((id) => Promise.resolve(stripeSub(id, { status: "canceled" })));
  const report = await reconcileBatch(
    [candidate({ id: "a" }), candidate({ id: "b" }), candidate({ id: "c" })],
    { stripe, store, catalog: CATALOG, now: NOW },
  );
  assert.equal(report.outcomes.row_moved, 1);
  assert.equal(report.outcomes.store_error, 1);
  assert.equal(report.corrected, 1);
  assert.equal(report.checked, 3);
  assert.equal(failedCount(report), 1);
});

Deno.test("a failed note does not stop the batch and is counted", async () => {
  const store = recordingStore({ noteThrows: true });
  const stripe = stubStripe((id) => Promise.resolve(stripeSub(id)));
  const report = await reconcileBatch([candidate({ id: "a" }), candidate({ id: "b" })], {
    stripe, store, catalog: CATALOG, now: NOW,
  });
  assert.equal(report.checked, 2);
  assert.equal(report.noteFailures, 2);
  assert.equal(failedCount(report), 2);
});

Deno.test("batchSize is clamped", () => {
  assert.equal(parseBatchSize(undefined), 50);
  assert.equal(parseBatchSize("20"), 20);
  assert.equal(parseBatchSize(0), 1);
  assert.equal(parseBatchSize(10_000), 200);
  assert.equal(parseBatchSize("x"), 50);
});

Deno.test("the edge function records its run, fails without a key, and reports corrected", async () => {
  const src = await Deno.readTextFile(new URL("../subscription-reconcile/index.ts", import.meta.url));
  assert.ok(src.includes("runJob(JOB"), "the run is recorded in automation_job_runs");
  assert.ok(/if \(!stripeKey\) \{[\s\S]*?throw new Error/.test(src), "a missing key fails the run");
  assert.ok(/ctx\.meta\(\{\s*corrected: report\.corrected/.test(src), "corrected reaches the run metadata");
  assert.ok(src.includes("requireAdminOrApiKey"), "admin or service key only");
  assert.ok(/if \(candidatesError\) throw/.test(src), "a failed candidate read is a failed run, not zero");
});
