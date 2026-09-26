// Run with: deno test supabase/functions/_shared/aiQuota.test.ts
// Offline: the Supabase client is a stub that records RPC calls and inserts.
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  denialBody,
  guardAi,
  interpretConsume,
  nextTier,
  type QuotaClient,
  quotaSubject,
  secondsUntilCentralMidnight,
} from "./aiQuota.ts";
import { openAiCostUsd } from "./providerUsage.ts";

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };

function stub(opts: {
  consume?: RpcResult | (() => never);
  settleError?: { message: string } | null;
  paused?: boolean | "error";
}) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const client: QuotaClient = {
    rpc(fn, args) {
      rpcs.push({ fn, args });
      if (fn === "consume_ai_quota") {
        const c = opts.consume;
        if (typeof c === "function") c();
        const result: RpcResult = c && typeof c !== "function"
          ? c
          : { data: { allowed: true, limit: 5, remaining: 4, calls: 1 }, error: null };
        return Promise.resolve(result);
      }
      return Promise.resolve({ data: null, error: opts.settleError ?? null });
    },
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(
                opts.paused === "error"
                  ? { data: null, error: { message: "boom" } }
                  : { data: { paused: opts.paused ?? false }, error: null },
              ),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client, rpcs, inserts };
}

const req = (headers: Record<string, string> = {}) =>
  new Request("https://x.test/fn", { method: "POST", headers });

Deno.test("quotaSubject keys a verified user by id and anyone else by IP", () => {
  assertEquals(quotaSubject("u1", "1.2.3.4"), "user:u1");
  assertEquals(quotaSubject(null, "1.2.3.4"), "ip:1.2.3.4");
  assertEquals(quotaSubject(undefined, ""), "ip:unknown");
});

Deno.test("interpretConsume: allow, deny, and every shape that fails open", () => {
  assertEquals(interpretConsume({ allowed: true, limit: 5, remaining: 2, calls: 3 }, null), {
    kind: "allow",
    limit: 5,
    remaining: 2,
    calls: 3,
  });
  assertEquals(interpretConsume({ allowed: true, limit: null, remaining: null, calls: 1 }, null), {
    kind: "allow",
    limit: null,
    remaining: null,
    calls: 1,
  });
  assertEquals(interpretConsume({ allowed: false, code: "ai_budget_paused", reason: "kill_switch" }, null), {
    kind: "deny",
    code: "ai_budget_paused",
    reason: "kill_switch",
    limit: null,
  });
  // An unknown refusal code is still a refusal, never an allow.
  assertEquals(interpretConsume({ allowed: false, code: "something_new" }, null).kind, "deny");
  assertEquals(interpretConsume(null, { code: "PGRST202", message: "not found" }).kind, "fail_open");
  assertEquals(interpretConsume(null, null).kind, "fail_open");
  assertEquals(interpretConsume([{ allowed: true }], null).kind, "fail_open");
  assertEquals(interpretConsume({ ok: 1 }, null).kind, "fail_open");
});

Deno.test("nextTier suggests the tier above, and nothing above vip", () => {
  assertEquals(nextTier("anon"), "free");
  assertEquals(nextTier("free"), "insider");
  assertEquals(nextTier("insider"), "vip");
  assertEquals(nextTier("vip"), null);
});

Deno.test("secondsUntilCentralMidnight counts to midnight in Chicago, not UTC", () => {
  // 2026-07-01 04:00 UTC is 23:00 CDT: one hour left.
  assertEquals(secondsUntilCentralMidnight(new Date("2026-07-01T04:00:00Z")), 3600);
  // 2026-01-15 06:00 UTC is 00:00 CST: a full day.
  assertEquals(secondsUntilCentralMidnight(new Date("2026-01-15T06:00:00Z")), 86_400);
  // Never below a minute.
  assert(secondsUntilCentralMidnight(new Date("2026-07-01T04:59:59Z")) >= 60);
});

Deno.test("denialBody offers an upgrade on a quota refusal, never on a budget pause", () => {
  const now = new Date("2026-07-01T04:00:00Z");
  const quota = denialBody({ kind: "deny", code: "quota_exceeded", reason: "daily_calls", limit: 5 }, "discover-chat", "free", now);
  assertEquals(quota.code, "quota_exceeded");
  assertEquals(quota.upgradeHint, "insider");
  assertEquals(quota.limit, 5);
  assertEquals(quota.retryAfter, 3600);

  const paused = denialBody({ kind: "deny", code: "ai_budget_paused", reason: "daily_budget", limit: null }, "nlp-search", "free", now);
  assertEquals(paused.upgradeHint, null);
});

Deno.test("guardAi allows, passes the tier, subject and estimate to the RPC", async () => {
  const s = stub({});
  const r = await guardAi(s.client, req({ "cf-connecting-ip": "9.9.9.9" }), {
    feature: "discover-chat",
    provider: "anthropic",
    tier: "free",
    userId: "u1",
  });
  assert(r.ok);
  assertEquals(r.remaining, 4);
  assertEquals(r.failedOpen, false);
  assertEquals(s.rpcs[0], {
    fn: "consume_ai_quota",
    args: { p_subject: "user:u1", p_tier: "free", p_feature: "discover-chat", p_provider: "anthropic", p_est_usd: 0.05 },
  });
});

Deno.test("guardAi keys an anonymous caller by the trusted IP", async () => {
  const s = stub({});
  await guardAi(s.client, req({ "x-forwarded-for": "6.6.6.6, 10.0.0.1" }), {
    feature: "nlp-search",
    provider: "anthropic",
    tier: "anon",
    userId: null,
  });
  // Rightmost XFF hop, not the caller-written leftmost one.
  assertEquals(s.rpcs[0].args.p_subject, "ip:10.0.0.1");
});

Deno.test("guardAi turns a refusal into a 429 with CORS headers and Retry-After", async () => {
  const s = stub({ consume: { data: { allowed: false, code: "quota_exceeded", reason: "daily_calls", limit: 5 }, error: null } });
  const r = await guardAi(s.client, req(), {
    feature: "discover-chat",
    provider: "anthropic",
    tier: "free",
    userId: "u1",
    headers: { "Access-Control-Allow-Origin": "https://example.test" },
  });
  assert(!r.ok);
  assertEquals(r.response.status, 429);
  assertEquals(r.response.headers.get("Access-Control-Allow-Origin"), "https://example.test");
  assert(Number(r.response.headers.get("Retry-After")) >= 60);
  const body = await r.response.json();
  assertEquals(body.code, "quota_exceeded");
  assertEquals(body.upgradeHint, "insider");
});

Deno.test("guardAi fails CLOSED on a budget pause from the RPC", async () => {
  const s = stub({ consume: { data: { allowed: false, code: "ai_budget_paused", reason: "provider_paused" }, error: null } });
  const r = await guardAi(s.client, req(), { feature: "itinerary", provider: "anthropic", tier: "vip", userId: "u1" });
  assert(!r.ok);
  assertEquals((await r.response.json()).code, "ai_budget_paused");
});

Deno.test("guardAi fails OPEN when the RPC errors and the budget is not paused", async () => {
  const s = stub({ consume: { data: null, error: { code: "PGRST202", message: "function not found" } } });
  const r = await guardAi(s.client, req(), { feature: "nlp-search", provider: "anthropic", tier: "anon", userId: null });
  assert(r.ok);
  assertEquals(r.failedOpen, true);
  assertEquals(r.remaining, null);
});

Deno.test("guardAi fails OPEN when the RPC throws and the paused read errors too", async () => {
  const s = stub({
    consume: () => {
      throw new Error("network");
    },
    paused: "error",
  });
  const r = await guardAi(s.client, req(), { feature: "nlp-search", provider: "anthropic", tier: "anon", userId: null });
  assert(r.ok);
});

Deno.test("guardAi still honours provider_budgets.paused when the RPC is unavailable", async () => {
  const s = stub({ consume: { data: null, error: { code: "PGRST202", message: "function not found" } }, paused: true });
  const r = await guardAi(s.client, req(), { feature: "discover-chat", provider: "anthropic", tier: "vip", userId: "u1" });
  assert(!r.ok);
  assertEquals(r.decision.reason, "provider_paused");
});

Deno.test("settle books the cost once, to ai_usage_daily and provider_usage", async () => {
  const s = stub({});
  const r = await guardAi(s.client, req(), {
    feature: "itinerary",
    provider: "anthropic",
    tier: "insider",
    userId: "u1",
    source: "generate-itinerary",
  });
  assert(r.ok);
  await r.settle({ costUsd: 0.12, model: "test-model", usage: { input_tokens: 10, output_tokens: 5 } });
  await r.settle({ costUsd: 0.12 });

  const settles = s.rpcs.filter((c) => c.fn === "settle_ai_usage");
  assertEquals(settles.length, 1);
  assertEquals(settles[0].args, { p_subject: "user:u1", p_feature: "itinerary", p_provider: "anthropic", p_cost_usd: 0.12 });
  assertEquals(s.inserts.length, 1);
  assertEquals(s.inserts[0].table, "provider_usage");
  assertEquals((s.inserts[0].row.meta as Record<string, unknown>).source, "generate-itinerary");
  assertEquals((s.inserts[0].row.meta as Record<string, unknown>).tier, "insider");
});

Deno.test("settle skips a zero or non-finite cost and never throws on an RPC error", async () => {
  const s = stub({ settleError: { message: "nope" } });
  const r = await guardAi(s.client, req(), { feature: "nlp-search", provider: "anthropic", tier: "free", userId: "u1" });
  assert(r.ok);
  await r.settle({ costUsd: Number.NaN });
  assertEquals(s.rpcs.filter((c) => c.fn === "settle_ai_usage").length, 0);

  const s2 = stub({ settleError: { message: "nope" } });
  const r2 = await guardAi(s2.client, req(), { feature: "nlp-search", provider: "anthropic", tier: "free", userId: "u1" });
  assert(r2.ok);
  await r2.settle({ costUsd: 0.001 });
  assertEquals(s2.rpcs.filter((c) => c.fn === "settle_ai_usage").length, 1);
});

Deno.test("openAiCostUsd prices gpt-4o-mini, and gpt-4o-mini is not priced as gpt-4o", () => {
  const mini = openAiCostUsd("gpt-4o-mini", { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
  assertEquals(Math.round(mini * 100) / 100, 0.75);
  const full = openAiCostUsd("gpt-4o-2024-08-06", { prompt_tokens: 1_000_000, completion_tokens: 0 });
  assertEquals(full, 2.5);
  // Unknown model over-reports rather than under-reports.
  assert(openAiCostUsd("o9-preview", { prompt_tokens: 1_000_000 }) >= 10);
  assertEquals(openAiCostUsd("gpt-4o-mini", {}), 0);
});
