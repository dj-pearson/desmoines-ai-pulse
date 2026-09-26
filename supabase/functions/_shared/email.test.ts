/**
 * sendEmail: provider choice, message headers, suppression and the log. The
 * network and the database are stubs; nothing here can send real mail.
 *
 *   deno test supabase/functions/_shared/email.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildMessageHeaders,
  buildResendPayload,
  buildSesPayload,
  resolveEmailProvider,
  sendEmail,
  type SendEmailInput,
} from "./email.ts";
import { buildOneClickUnsubscribeUrl, listUnsubscribeHeaders, renderEmail } from "./emailLayout.ts";

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

Deno.test("provider: SES when all three AWS values are set, Resend as the fallback, else none", () => {
  assertEquals(resolveEmailProvider(envOf(SES_ENV)).kind, "ses");
  assertEquals(resolveEmailProvider(envOf({ ...SES_ENV, RESEND_API_KEY: "re_x" })).kind, "ses");
  assertEquals(resolveEmailProvider(envOf({ AWS_SES_REGION: "us-east-2", RESEND_API_KEY: "re_x" })).kind, "resend");
  assertEquals(resolveEmailProvider(envOf({})).kind, "none");
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

Deno.test("Resend payload: List-Unsubscribe goes in the JSON body, which is where Resend reads it", () => {
  const p = buildResendPayload(marketing, { from: "f@desmoinesinsider.com" }, ["reader@example.com"]);
  assertEquals((p.headers as Record<string, string>)["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
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

Deno.test("Resend fallback when SES is not configured", async () => {
  const { f, calls } = stubFetch(200, { id: "re_1" });
  const res = await sendEmail(marketing, { env: envOf({ RESEND_API_KEY: "re_test" }), fetch: f });
  assertEquals(res.provider, "resend");
  assertEquals(res.messageId, "re_1");
  assertEquals(calls[0].url, "https://api.resend.com/emails");
  const body = JSON.parse(calls[0].init.body as string);
  assert(body.headers["List-Unsubscribe"].includes("email-unsubscribe"));
  assertEquals((calls[0].init.headers as Record<string, string>)["List-Unsubscribe"], undefined);
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
  assertEquals(r3, { ok: false, error: "no email provider configured", provider: "none", suppressed: [] });
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
