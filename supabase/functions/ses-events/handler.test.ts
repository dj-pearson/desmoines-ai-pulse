/**
 * ses-events end to end over a stubbed database and network, with the real
 * signature check and the signed fixtures from _shared/fixtures.
 *
 *   deno test --allow-read supabase/functions/ses-events/handler.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { verifySnsMessage } from "../_shared/sesEvents.ts";
import { handleSesEvent } from "./handler.ts";

const fx = JSON.parse(await Deno.readTextFile(new URL("../_shared/fixtures/sns-signed.json", import.meta.url)));
const TOPIC = "arn:aws:sns:us-east-2:123456789012:dmi-ses-events";

interface Op { table: string; op: string; row?: unknown; filters: Array<[string, unknown]> }

function stubDb(failOn?: string) {
  const ops: Op[] = [];
  const db = {
    from(table: string) {
      const rec: Op = { table, op: "", filters: [] };
      const q = {
        upsert(row: unknown) { rec.op = "upsert"; rec.row = row; ops.push(rec); return q; },
        update(row: unknown) { rec.op = "update"; rec.row = row; ops.push(rec); return q; },
        eq(col: string, v: unknown) { rec.filters.push([col, v]); return q; },
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve({ error: failOn === table ? { message: "boom" } : null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { db, ops };
}

function deps(db: unknown, confirmed: string[] = []) {
  return {
    db,
    allowedTopics: TOPIC,
    verifySignature: verifySnsMessage,
    fetchCert: () => Promise.resolve(fx.certPem as string),
    confirm: (url: string) => {
      confirmed.push(url);
      return Promise.resolve(true);
    },
  };
}

const post = (body: unknown) => new Request("https://x/ses-events", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain" } });

Deno.test("a verified permanent bounce suppresses, marks the subscriber and the logs", async () => {
  const { db, ops } = stubDb();
  const res = await handleSesEvent(post(fx.notificationV2), deps(db));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, kind: "Bounce/Permanent", suppressed: 1 });
  const sup = ops.find((o) => o.table === "email_suppressions")!;
  assertEquals((sup.row as { email: string; reason: string }).email, "gone@example.com");
  assertEquals((sup.row as { reason: string }).reason, "bounce");
  assertEquals((ops.find((o) => o.table === "newsletter_subscribers")!.row as { status: string }).status, "bounced");
  const log = ops.find((o) => o.table === "email_log")!;
  assertEquals(log.filters, [["provider_message_id", "0100019a-abc"]]);
  assertEquals(ops.some((o) => o.table === "newsletter_deliveries"), true);
});

Deno.test("an unverified message writes nothing", async () => {
  const { db, ops } = stubDb();
  const forged = { ...fx.notificationV2, Message: fx.notificationV2.Message.replace("Gone@", "Victim@") };
  const res = await handleSesEvent(post(forged), deps(db));
  assertEquals(res.status, 403);
  await res.body?.cancel();
  assertEquals(ops.length, 0);
});

Deno.test("a subscription confirmation is confirmed at its SubscribeURL", async () => {
  const confirmed: string[] = [];
  const res = await handleSesEvent(post(fx.subscriptionConfirmation), deps(stubDb().db, confirmed));
  assertEquals(res.status, 200);
  await res.body?.cancel();
  assertEquals(confirmed, [fx.subscriptionConfirmation.SubscribeURL]);
});

Deno.test("a database error answers 500 so SNS redelivers", async () => {
  const res = await handleSesEvent(post(fx.notificationV2), deps(stubDb("email_suppressions").db));
  assertEquals(res.status, 500);
  await res.body?.cancel();
});

Deno.test("junk is a 400, not a crash", async () => {
  const r1 = await handleSesEvent(new Request("https://x", { method: "POST", body: "not json" }), deps(stubDb().db));
  assertEquals(r1.status, 400);
  await r1.body?.cancel();
  const r2 = await handleSesEvent(new Request("https://x", { method: "GET" }), deps(stubDb().db));
  assertEquals(r2.status, 405);
  await r2.body?.cancel();
});
