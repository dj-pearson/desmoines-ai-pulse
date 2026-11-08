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

// WEB-FEAT-059: a reminder email's ?reminder= link stops that event's
// reminders and never touches the newsletter RPC.
const REMINDER = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

function reminderDeps() {
  const newsletter = rpcReturning([{ success: true }]);
  const reminders = rpcReturning([{ success: true, cancelled: 2, event_title: "Jazz in July" }]);
  return {
    newsletter,
    reminders,
    deps: { rpc: newsletter.rpc, cancelReminders: reminders.rpc, siteUrl: "https://desmoinesinsider.com" },
  };
}

Deno.test("POST ?reminder= cancels that event's reminders, not the newsletter", async () => {
  const { newsletter, reminders, deps: d } = reminderDeps();
  const res = await handleUnsubscribe(
    new Request(`${FN}?reminder=${REMINDER.toUpperCase()}`, { method: "POST", body: "List-Unsubscribe=One-Click" }),
    d,
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, cancelled: 2 });
  assertEquals(reminders.calls, [REMINDER]);
  assertEquals(newsletter.calls.length, 0);
});

Deno.test("POST ?reminder= with a malformed id never reaches the database", async () => {
  const { newsletter, reminders, deps: d } = reminderDeps();
  const res = await handleUnsubscribe(new Request(`${FN}?reminder=nope`, { method: "POST" }), d);
  assertEquals(res.status, 400);
  assertEquals(reminders.calls.length + newsletter.calls.length, 0);
  await res.body?.cancel();
});

Deno.test("POST ?reminder= unknown is 404, a database error is 503", async () => {
  const base = { rpc: rpcReturning(null).rpc, siteUrl: "https://desmoinesinsider.com" };
  const unknown = await handleUnsubscribe(
    new Request(`${FN}?reminder=${REMINDER}`, { method: "POST" }),
    { ...base, cancelReminders: rpcReturning([{ success: false, cancelled: 0 }]).rpc },
  );
  assertEquals(unknown.status, 404);
  await unknown.body?.cancel();
  const down = await handleUnsubscribe(
    new Request(`${FN}?reminder=${REMINDER}`, { method: "POST" }),
    { ...base, cancelReminders: rpcReturning(null, { message: "PGRST202" }).rpc },
  );
  assertEquals(down.status, 503);
  await down.body?.cancel();
});

Deno.test("GET ?reminder= hands the reader to the page with the reminder id", async () => {
  const { reminders, deps: d } = reminderDeps();
  const res = await handleUnsubscribe(new Request(`${FN}?reminder=${REMINDER}`), d);
  assertEquals(res.status, 303);
  assertEquals(res.headers.get("location"), `https://desmoinesinsider.com/unsubscribe?reminder=${REMINDER}`);
  assertEquals(reminders.calls.length, 0);
});

// WEB-FEAT-073: a saved-search alert's ?alerts= link turns off event
// alerts and never touches the newsletter RPC.
const ALERTS = "7a1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";

function alertsDeps() {
  const newsletter = rpcReturning([{ success: true, already_unsubscribed: false }]);
  const alerts = rpcReturning([{ success: true, already_disabled: false }]);
  return {
    newsletter,
    alerts,
    deps: { rpc: newsletter.rpc, disableAlerts: alerts.rpc, siteUrl: "https://desmoinesinsider.com" },
  };
}

Deno.test("POST ?alerts= turns off event alerts, not the newsletter", async () => {
  const { newsletter, alerts, deps: d } = alertsDeps();
  const res = await handleUnsubscribe(
    new Request(`${FN}?alerts=${ALERTS.toUpperCase()}`, { method: "POST", body: "List-Unsubscribe=One-Click" }),
    d,
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, already_disabled: false });
  assertEquals(alerts.calls, [ALERTS]);
  assertEquals(newsletter.calls.length, 0);
});

Deno.test("POST ?alerts= with a malformed id never reaches the database", async () => {
  const { newsletter, alerts, deps: d } = alertsDeps();
  const res = await handleUnsubscribe(new Request(`${FN}?alerts=nope`, { method: "POST" }), d);
  assertEquals(res.status, 400);
  await res.body?.cancel();
  assertEquals(alerts.calls.length + newsletter.calls.length, 0);
});

Deno.test("POST ?alerts= unknown is 404, a database error is 503", async () => {
  const base = { rpc: rpcReturning(null).rpc, siteUrl: "https://desmoinesinsider.com" };
  const unknown = await handleUnsubscribe(
    new Request(`${FN}?alerts=${ALERTS}`, { method: "POST" }),
    { ...base, disableAlerts: rpcReturning([{ success: false, already_disabled: false }]).rpc },
  );
  assertEquals(unknown.status, 404);
  await unknown.body?.cancel();
  const down = await handleUnsubscribe(
    new Request(`${FN}?alerts=${ALERTS}`, { method: "POST" }),
    { ...base, disableAlerts: rpcReturning(null, { message: "PGRST202" }).rpc },
  );
  assertEquals(down.status, 503);
  await down.body?.cancel();
});

Deno.test("GET ?alerts= hands the reader to the page with the search id", async () => {
  const { alerts, deps: d } = alertsDeps();
  const res = await handleUnsubscribe(new Request(`${FN}?alerts=${ALERTS}`), d);
  assertEquals(res.status, 303);
  assertEquals(res.headers.get("location"), `https://desmoinesinsider.com/unsubscribe?alerts=${ALERTS}`);
  assertEquals(alerts.calls.length, 0);
});
