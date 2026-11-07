import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  confirmVoidedPurchase,
  type PlayRtdnLogRow,
  processVoidedPurchase,
  TransientPlayApiError,
  type VoidCheck,
  voidedLookupStartMs,
} from "./playVoidedPurchase.ts";

// WEB-SEC-058. The voided-purchase branch of play-rtdn-webhook revoked a
// subscription on the notification's word. It now revokes only when Google's
// voidedpurchases.list carries the token.

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const TOKEN = "victim-purchase-token";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeFetch(responses: Array<Response | Error>) {
  const urls: string[] = [];
  const fn = (url: string): Promise<Response> => {
    urls.push(url);
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { fn, urls };
}

const confirm = (fetchFn: (url: string) => Promise<Response>, eventTimeMillis = String(NOW - 60_000)) =>
  confirmVoidedPurchase({
    fetchFn,
    apiBase: API,
    accessToken: "at",
    packageName: "com.desmoines.aipulse",
    purchaseToken: TOKEN,
    eventTimeMillis,
    nowMs: NOW,
  });

Deno.test("a token Google lists as voided is confirmed, across pages", async () => {
  const f = fakeFetch([
    json({ voidedPurchases: [{ purchaseToken: "someone-else" }], tokenPagination: { nextPageToken: "p2" } }),
    json({ voidedPurchases: [{ purchaseToken: TOKEN, orderId: "GPA.1", voidedTimeMillis: String(NOW) }] }),
  ]);
  const r = await confirm(f.fn);
  assert(r.confirmed);
  assertEquals(r.entry.orderId, "GPA.1");
  const first = new URL(f.urls[0]);
  assertEquals(first.pathname, "/androidpublisher/v3/applications/com.desmoines.aipulse/purchases/voidedpurchases");
  assertEquals(first.searchParams.get("type"), "1", "type=1, or subscriptions are not listed at all");
  assertEquals(first.searchParams.get("startTime"), String(NOW - 60_000 - DAY));
  assertEquals(new URL(f.urls[1]).searchParams.get("token"), "p2");
});

Deno.test("a token Google does not list is not confirmed", async () => {
  const f = fakeFetch([json({ voidedPurchases: [{ purchaseToken: "someone-else" }] })]);
  const r = await confirm(f.fn);
  assertEquals(r.confirmed, false);
  assertEquals(!r.confirmed && r.reason, "not_listed");
  // An empty list comes back as {} with no voidedPurchases key.
  assertEquals((await confirm(fakeFetch([json({})]).fn)).confirmed, false);
});

Deno.test("network errors, 5xx and 429 are transient; 403 is a permanent refusal", async () => {
  for (const res of [new TypeError("connection reset"), json({}, 503), json({}, 429)]) {
    await assertRejects(() => confirm(fakeFetch([res]).fn), TransientPlayApiError);
  }
  const r = await confirm(fakeFetch([json({ error: "no financial permission" }, 403)]).fn);
  assertEquals(!r.confirmed && r.reason, "play_api_error");
});

Deno.test("the lookup window stays inside the 30 days Play accepts", () => {
  const floor = NOW - 30 * DAY + 60_000;
  assertEquals(voidedLookupStartMs(undefined, NOW), floor);
  assertEquals(voidedLookupStartMs("not a number", NOW), floor);
  assertEquals(voidedLookupStartMs(String(NOW - 90 * DAY), NOW), floor);
  assertEquals(voidedLookupStartMs(String(NOW + 5 * DAY), NOW), NOW);
});

function harness(opts: { row: { id: string } | null; check: () => Promise<VoidCheck>; lookupError?: Error }) {
  const revoked: string[] = [];
  const logs: PlayRtdnLogRow[] = [];
  let confirmCalls = 0;
  const deps = {
    findSubscription: () => (opts.lookupError ? Promise.reject(opts.lookupError) : Promise.resolve(opts.row)),
    confirmVoid: () => {
      confirmCalls++;
      return opts.check();
    },
    revoke: (id: string) => {
      revoked.push(id);
      return Promise.resolve();
    },
    writeLog: (row: PlayRtdnLogRow) => {
      logs.push(row);
      return Promise.resolve();
    },
    now: () => new Date(NOW),
  };
  return { deps, revoked, logs, confirmCalls: () => confirmCalls };
}

const input = { messageId: "m-1", purchaseToken: TOKEN };

Deno.test("confirmed void: revoked and logged applied", async () => {
  const h = harness({ row: { id: "sub-1" }, check: () => Promise.resolve({ confirmed: true, entry: { purchaseToken: TOKEN } }) });
  const r = await processVoidedPurchase(input, h.deps);
  assertEquals(r.status, 200);
  assertEquals(h.revoked, ["sub-1"]);
  assertEquals(h.logs.map((l) => l.status), ["applied"]);
});

Deno.test("unconfirmed void: nothing revoked, logged void_unconfirmed and acked", async () => {
  for (const check of [
    () => Promise.resolve<VoidCheck>({ confirmed: false, reason: "not_listed", detail: "x" }),
    // A permanent failure getting an access token is not a confirmation either.
    () => Promise.reject(new Error("Google token exchange failed: 400")),
  ]) {
    const h = harness({ row: { id: "sub-1" }, check });
    const r = await processVoidedPurchase(input, h.deps);
    assertEquals(r.status, 200);
    assertEquals(h.revoked, [], "a forged or unverifiable void must not revoke");
    assertEquals(h.logs.length, 1);
    assertEquals(h.logs[0].status, "void_unconfirmed");
    assertEquals(h.logs[0].user_subscription_id, "sub-1");
  }
});

Deno.test("transient Play failure: 503, nothing revoked, nothing logged", async () => {
  const h = harness({ row: { id: "sub-1" }, check: () => Promise.reject(new TransientPlayApiError("503")) });
  const r = await processVoidedPurchase(input, h.deps);
  assertEquals(r.status, 503);
  assertEquals(h.revoked, []);
  assertEquals(h.logs, [], "a log row would make the idempotency guard swallow the redelivery");
});

Deno.test("no matching row: logged no_match without asking Google; lookup errors propagate unlogged", async () => {
  const h = harness({ row: null, check: () => Promise.reject(new Error("should not be called")) });
  assertEquals((await processVoidedPurchase(input, h.deps)).status, 200);
  assertEquals(h.confirmCalls(), 0);
  assertEquals(h.logs.map((l) => l.status), ["no_match"]);

  const e = harness({ row: null, check: () => Promise.reject(new Error("x")), lookupError: new Error("db down") });
  await assertRejects(() => processVoidedPurchase(input, e.deps), Error, "db down");
  assertEquals(e.logs, []);
});

Deno.test("play-rtdn-webhook routes voided purchases through processVoidedPurchase", async () => {
  const src = await Deno.readTextFile(new URL("../play-rtdn-webhook/index.ts", import.meta.url));
  const branch = src.slice(src.indexOf("if (vn) {"), src.indexOf("4b. Subscription notification"));
  assert(branch.includes("processVoidedPurchase("), "the void branch must go through the confirming helper");
  assert(branch.includes("confirmVoidedPurchase("), "confirmVoid must ask voidedpurchases.list");
  // The old shape revoked inline right after the lookup.
  assertEquals(branch.match(/\.update\(/g)?.length, 1, "the only update is the one inside revoke()");
});
