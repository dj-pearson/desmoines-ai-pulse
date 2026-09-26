/**
 *   deno test supabase/functions/email-unsubscribe/handler.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { handleUnsubscribe, type UnsubscribeRpc } from "./handler.ts";

const TOKEN = "0123456789abcdef".repeat(3);
const FN = "https://x.supabase.co/functions/v1/email-unsubscribe";

function rpcReturning(data: unknown, error: { message: string } | null = null) {
  const calls: string[] = [];
  const rpc: UnsubscribeRpc = (t) => {
    calls.push(t);
    return Promise.resolve({ data, error });
  };
  return { rpc, calls };
}

const deps = (rpc: UnsubscribeRpc) => ({ rpc, siteUrl: "https://desmoinesinsider.com" });

Deno.test("RFC 8058 POST unsubscribes by token", async () => {
  const { rpc, calls } = rpcReturning([{ success: true, already_unsubscribed: false }]);
  const res = await handleUnsubscribe(
    new Request(`${FN}?token=${TOKEN}`, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
    deps(rpc),
  );
  assertEquals(res.status, 200);
  assertEquals(calls, [TOKEN]);
  assertEquals(await res.json(), { ok: true, already_unsubscribed: false });
});

Deno.test("POST with a malformed token never reaches the database", async () => {
  const { rpc, calls } = rpcReturning(null);
  const res = await handleUnsubscribe(new Request(`${FN}?token=nope`, { method: "POST" }), deps(rpc));
  assertEquals(res.status, 400);
  assertEquals(calls.length, 0);
  await res.body?.cancel();
});

Deno.test("POST with an unknown token is 404, a database error is 503 so the provider retries", async () => {
  const unknown = await handleUnsubscribe(new Request(`${FN}?token=${TOKEN}`, { method: "POST" }), deps(rpcReturning([{ success: false, already_unsubscribed: false }]).rpc));
  assertEquals(unknown.status, 404);
  await unknown.body?.cancel();
  const down = await handleUnsubscribe(new Request(`${FN}?token=${TOKEN}`, { method: "POST" }), deps(rpcReturning(null, { message: "timeout" }).rpc));
  assertEquals(down.status, 503);
  await down.body?.cancel();
});

Deno.test("GET hands the reader to the /unsubscribe page and does not unsubscribe twice", async () => {
  const { rpc, calls } = rpcReturning([{ success: true }]);
  const res = await handleUnsubscribe(new Request(`${FN}?token=${TOKEN}`), deps(rpc));
  assertEquals(res.status, 303);
  assertEquals(res.headers.get("location"), `https://desmoinesinsider.com/unsubscribe?token=${TOKEN}`);
  assertEquals(calls.length, 0);
});
