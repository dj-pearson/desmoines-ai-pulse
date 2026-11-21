/**
 * sendEmail: provider choice, message headers, suppression and the log. The
 * network and the database are stubs; nothing here can send real mail.
 *
 *   deno test supabase/functions/_shared/email.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildMessageHeaders,
  buildSesPayload,
  resolveEmailProvider,
  sendEmail,
  type SendEmailInput,
} from "./email.ts";
import {
  buildOneClickAlertsUrl,
  buildOneClickReminderUrl,
  buildOneClickUnsubscribeUrl,
  buildUnsubscribeUrl,
  listUnsubscribeHeaders,
  renderEmail,
} from "./emailLayout.ts";

const SES_ENV: Record<string, string> = {
  AWS_SES_REGION: "us-east-2",
  AWS_SES_ACCESS_KEY_ID: "AKIDEXAMPLE",
  AWS_SES_SECRET_ACCESS_KEY: "secret-for-tests",
  SES_FROM_ADDRESS: "Des Moines Insider <hello@desmoinesinsider.com>",
  SES_CONFIGURATION_SET: "dmi-default",
};
const envOf = (m: Record<string, string>) => (k: string) => m[k];

interface Call { url: string; init: RequestInit }
function stubFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const f = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
  return { f, calls };
}

function stubDb(suppressions: Array<{ email: string; reason: string }>, readError: { code?: string; message: string } | null = null) {
  const inserts: Array<{ table: string; rows: Array<Record<string, unknown>> }> = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            in(_col: string, emails: string[]) {
              if (readError) return Promise.resolve({ data: null, error: readError });
              return Promise.resolve({ data: suppressions.filter((s) => emails.includes(s.email)), error: null });
            },
          };
        },
        insert(rows: Array<Record<string, unknown>>) {
          inserts.push({ table, rows });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client, inserts };
}

const marketing: SendEmailInput = {
  to: "Reader@Example.com",
  subject: "This week",
  html: "<p>hi</p>",
  text: "hi",
  category: "marketing",
  template: "weekly_digest",
  headers: {
    "List-Unsubscribe": "<mailto:unsubscribe@desmoinesinsider.com?subject=unsubscribe>, <https://x.supabase.co/functions/v1/email-unsubscribe?token=abc>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
};

Deno.test("provider: SES when all three AWS values are set, else none naming what is missing", () => {
  assertEquals(resolveEmailProvider(envOf(SES_ENV)).kind, "ses");
  // A leftover RESEND_API_KEY is not a provider any more.
  const partial = resolveEmailProvider(envOf({ AWS_SES_REGION: "us-east-2", RESEND_API_KEY: "re_x" }));
  assertEquals(partial, { kind: "none", from: SES_ENV.SES_FROM_ADDRESS, missing: ["AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY"] });
  const empty = resolveEmailProvider(envOf({}));
  assertEquals(empty.kind, "none");
  assertEquals(empty.kind === "none" ? empty.missing : [], ["AWS_SES_REGION", "AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY"]);
});

Deno.test("headers: marketing always carries List-Unsubscribe; one-click only with an https target", () => {
  const bare = buildMessageHeaders({ category: "marketing" });
  assertEquals(bare.map((h) => h.name), ["List-Unsubscribe"]);
  const mailtoOnly = buildMessageHeaders({
    category: "marketing",
    headers: { "List-Unsubscribe": "<mailto:a@b.c>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  assertEquals(mailtoOnly.map((h) => h.name), ["List-Unsubscribe"]);
  assertEquals(buildMessageHeaders({ category: "transactional" }), []);
  const injected = buildMessageHeaders({ category: "transactional", headers: { "X-Ref": "a\r\nBcc: evil@x.y" } });
  assertEquals(injected[0].value.includes("\n"), false);
});

Deno.test("SES payload: headers on the message, configuration set, tags", () => {
  const p = buildSesPayload(marketing, { from: "f@desmoinesinsider.com", configurationSet: "dmi-default" }, ["reader@example.com"]);
  // deno-lint-ignore no-explicit-any
  const simple = (p.Content as any).Simple;
  assertEquals(simple.Headers.map((h: { Name: string }) => h.Name), ["List-Unsubscribe", "List-Unsubscribe-Post"]);
  assertEquals(p.ConfigurationSetName, "dmi-default");
  assertEquals(simple.Body.Text.Data, "hi");
  assertEquals((p.EmailTags as Array<{ Value: string }>)[0].Value, "weekly_digest");
});

Deno.test("sendEmail over SES: signed POST to the v2 endpoint, message id logged", async () => {
  const { f, calls } = stubFetch(200, { MessageId: "0100-abc" });
  const { client, inserts } = stubDb([]);
  const res = await sendEmail({ ...marketing, userId: "u1", ref: { type: "digest", id: "d1" } }, { env: envOf(SES_ENV), fetch: f, supabase: client });
  assertEquals(res, { ok: true, messageId: "0100-abc", provider: "ses", suppressed: [] });
  assertEquals(calls[0].url, "https://email.us-east-2.amazonaws.com/v2/email/outbound-emails");
  const h = calls[0].init.headers as Record<string, string>;
  assert(h.authorization.startsWith("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/"));
  assert(h.authorization.includes("/us-east-2/ses/aws4_request"));
  assertEquals(h["List-Unsubscribe"], undefined, "List-Unsubscribe must not be an HTTP request header");
  const log = inserts.find((i) => i.table === "email_log")!.rows[0];
  assertEquals(log.provider_message_id, "0100-abc");
  assertEquals(log.to_email, "reader@example.com");
  assertEquals(log.status, "sent");
  assertEquals(log.ref_type, "digest");
});

Deno.test("suppression: an unsubscribe blocks marketing but not a password notice", async () => {
  const sup = [{ email: "reader@example.com", reason: "unsubscribe" }];
  const m = stubFetch(200, { MessageId: "m" });
  const mdb = stubDb(sup);
  const r1 = await sendEmail(marketing, { env: envOf(SES_ENV), fetch: m.f, supabase: mdb.client });
  assertEquals(r1.ok, false);
  assertEquals(m.calls.length, 0);
  assertEquals(mdb.inserts[0].rows[0].status, "suppressed");

  const t = stubFetch(200, { MessageId: "t" });
  const r2 = await sendEmail({ ...marketing, category: "transactional", headers: {} }, { env: envOf(SES_ENV), fetch: t.f, supabase: stubDb(sup).client });
  assertEquals(r2.ok, true);
  assertEquals(t.calls.length, 1);
});

Deno.test("suppression: a bounce blocks transactional mail too", async () => {
  const t = stubFetch(200, { MessageId: "t" });
  const r = await sendEmail({ ...marketing, category: "transactional" }, {
    env: envOf(SES_ENV), fetch: t.f, supabase: stubDb([{ email: "reader@example.com", reason: "bounce" }]).client,
  });
  assertEquals(r.ok, false);
  assertEquals(t.calls.length, 0);
});

Deno.test("suppression read failure: marketing fails closed, transactional sends, a missing table sends", async () => {
  const m = stubFetch(200, { MessageId: "m" });
  assertEquals((await sendEmail(marketing, { env: envOf(SES_ENV), fetch: m.f, supabase: stubDb([], { message: "timeout" }).client })).ok, false);
  assertEquals(m.calls.length, 0);
  const t = stubFetch(200, { MessageId: "t" });
  assertEquals((await sendEmail({ ...marketing, category: "transactional" }, { env: envOf(SES_ENV), fetch: t.f, supabase: stubDb([], { message: "timeout" }).client })).ok, true);
  const n = stubFetch(200, { MessageId: "n" });
  assertEquals((await sendEmail(marketing, { env: envOf(SES_ENV), fetch: n.f, supabase: stubDb([], { code: "42P01", message: "no table" }).client })).ok, true);
  // supabase-js goes through PostgREST, which reports a missing table as
  // PGRST205. Treating that as a read failure blocked every newsletter until
  // the migration was applied.
  const p = stubFetch(200, { MessageId: "p" });
  assertEquals((await sendEmail(marketing, { env: envOf(SES_ENV), fetch: p.f, supabase: stubDb([], { code: "PGRST205", message: "Could not find the table" }).client })).ok, true);
});

Deno.test("SES not configured: nothing goes on the network, even with a RESEND_API_KEY set, and the skip is logged", async () => {
  const { f, calls } = stubFetch(200, { id: "re_1" });
  const { client, inserts } = stubDb([]);
  const res = await sendEmail(marketing, { env: envOf({ RESEND_API_KEY: "re_test", AWS_SES_REGION: "us-east-2" }), fetch: f, supabase: client });
  assertEquals(res.ok, false);
  assertEquals(res.provider, "none");
  assertEquals(res.error, "SES not configured: AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY unset");
  assertEquals(calls.length, 0);
  const log = inserts.find((i) => i.table === "email_log")!.rows[0];
  assertEquals(log.status, "skipped");
  assertEquals(log.provider, "none");
});

Deno.test("never throws: a network error and a 4xx both come back as ok:false", async () => {
  const boom = (() => Promise.reject(new Error("dns"))) as unknown as typeof fetch;
  const r1 = await sendEmail(marketing, { env: envOf(SES_ENV), fetch: boom });
  assertEquals(r1.ok, false);
  assertEquals(r1.error, "dns");
  const { f } = stubFetch(400, { message: "Email address is not verified." });
  const r2 = await sendEmail(marketing, { env: envOf(SES_ENV), fetch: f });
  assertEquals(r2.ok, false);
  assert(r2.error!.startsWith("SES 400"));
  const r3 = await sendEmail(marketing, { env: envOf({}) });
  assertEquals(r3, {
    ok: false,
    error: "SES not configured: AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY unset",
    provider: "none",
    suppressed: [],
  });
});

Deno.test("emailLayout: the one-click header points at email-unsubscribe, the footer at the page", () => {
  assertEquals(
    buildOneClickUnsubscribeUrl("ab12", "https://x.supabase.co/"),
    "https://x.supabase.co/functions/v1/email-unsubscribe?token=ab12",
  );
  assertEquals(buildOneClickUnsubscribeUrl(null, "https://x.supabase.co"), null);
  const r = renderEmail({ bodyHtml: "<p>x</p>", bodyText: "x", recipient: { email: "a@b.c" } });
  // No token: mailto only, and no one-click claim.
  assertEquals(listUnsubscribeHeaders(r), { "List-Unsubscribe": "<mailto:unsubscribe@desmoinesinsider.com?subject=unsubscribe>" });
  const t = renderEmail({ bodyHtml: "<p>x</p>", bodyText: "x", recipient: { email: "a@b.c" }, category: "transactional" });
  assertEquals(listUnsubscribeHeaders(t), {});
});

Deno.test("emailLayout: a reminder email's opt-out stops the reminder, not the newsletter (WEB-FEAT-059)", () => {
  const id = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
  const recipient = { email: "a@b.c", reminderToken: id, unsubscribeToken: "ab12" };
  assertEquals(
    buildOneClickReminderUrl(id, "https://x.supabase.co/"),
    `https://x.supabase.co/functions/v1/email-unsubscribe?reminder=${id}`,
  );
  assertEquals(buildOneClickReminderUrl(null, "https://x.supabase.co"), null);
  // The reminder id wins over a newsletter token.
  assert(buildUnsubscribeUrl(recipient).endsWith(`/unsubscribe?reminder=${id}`));
  const r = renderEmail({ bodyHtml: "<p>x</p>", bodyText: "x", recipient });
  assert(r.html.includes(`/unsubscribe?reminder=${id}`), "footer links the reminder opt-out");
  assert(!r.html.includes("token=ab12"), "footer does not carry the newsletter token");
  assert(r.html.includes("stop reminders for this event"));
  assert(r.text.includes("Stop reminders for this event (one click): "));
  assert(r.text.includes("/my-events?tab=reminders"));
  assert(!(r.listUnsubscribe ?? "").includes("token=ab12"), "inbox button does not unsubscribe the newsletter");
});

Deno.test("emailLayout: a saved-search alert's opt-out stops alerts, not the newsletter (WEB-FEAT-073)", () => {
  const id = "7a1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
  const recipient = { email: "a@b.c", alertsToken: id, unsubscribeToken: "ab12" };
  assertEquals(
    buildOneClickAlertsUrl(id, "https://x.supabase.co/"),
    `https://x.supabase.co/functions/v1/email-unsubscribe?alerts=${id}`,
  );
  assertEquals(buildOneClickAlertsUrl(null, "https://x.supabase.co"), null);
  // The search id wins over a newsletter token; a reminder id wins over both.
  assert(buildUnsubscribeUrl(recipient).endsWith(`/unsubscribe?alerts=${id}`));
  assert(buildUnsubscribeUrl({ ...recipient, reminderToken: "r1" }).endsWith("/unsubscribe?reminder=r1"));
  const r = renderEmail({ bodyHtml: "<p>x</p>", bodyText: "x", recipient });
  assert(r.html.includes(`/unsubscribe?alerts=${id}`), "footer links the alerts opt-out");
  assert(!r.html.includes("token=ab12"), "footer does not carry the newsletter token");
  assert(r.html.includes("turn off saved-search alerts in one click"));
  assert(r.html.includes("/dashboard?tab=saved-searches"));
  assert(r.text.includes("Turn off saved-search alerts (one click): "));
  assert(!(r.listUnsubscribe ?? "").includes("token=ab12"), "inbox button does not unsubscribe the newsletter");
});
