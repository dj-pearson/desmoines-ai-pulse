/**
 * sendEmail - the one outbound mail path for every edge function (WP2 of
 * docs/plans/NON_CORE_REVIEW_2026-09.md).
 *
 * Provider: Amazon SES v2 (`POST /v2/email/outbound-emails`, SigV4-signed by
 * ./awsSigV4.ts). While the owner finishes SES setup, a function with no SES
 * credentials but a RESEND_API_KEY still sends through Resend, so nothing stops
 * mailing on the day this ships. Delete the Resend branch once SES is live.
 *
 * What every caller gets without asking:
 *   - Suppression. Addresses in email_suppressions are dropped before the
 *     provider sees them. A bounce or complaint blocks everything; an
 *     unsubscribe blocks marketing only, so a password reset still arrives.
 *   - Message headers, not HTTP headers. List-Unsubscribe used to be set on the
 *     request to Resend's API, where it meant nothing, so no marketing mail
 *     carried it. Here it goes into the message. Marketing mail with no
 *     List-Unsubscribe from the caller gets the mailto form at least.
 *   - email_log. One row per recipient, keyed later by provider_message_id so
 *     ses-events can mark it delivered, bounced or complained.
 *
 * Never throws. Every caller is finishing work that already succeeded and must
 * not be undone by a mail outage.
 *
 * Imports nothing from esm.sh; the DB client is passed in, so the core loads
 * in a Deno test with no network.
 *
 * Env: AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY,
 *      SES_FROM_ADDRESS, SES_CONFIGURATION_SET (optional),
 *      RESEND_API_KEY (transitional fallback only).
 */
import { signRequest } from "./awsSigV4.ts";
import { fetchWithTimeout } from "./fetchWithTimeout.ts";
import { envVar } from "./siteUrl.ts";

export type EmailCategory = "transactional" | "marketing";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  category: EmailCategory;
  /** Short stable name for the kind of mail ("security_notification"). Logged and tagged. */
  template: string;
  /** Display-name form is fine: "Des Moines Insider <hello@desmoinesinsider.com>". */
  from?: string;
  replyTo?: string | string[];
  /** Message headers (List-Unsubscribe, List-Unsubscribe-Post, ...). */
  headers?: Record<string, string>;
  userId?: string | null;
  /** What the mail is about, for email_log (e.g. { type: "campaign", id }). */
  ref?: { type: string; id: string } | null;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  provider?: "ses" | "resend" | "none";
  /** Recipients dropped by email_suppressions. */
  suppressed?: string[];
}

export type EnvReader = (key: string) => string | undefined;

export type EmailProviderConfig =
  | {
    kind: "ses";
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    from: string;
    configurationSet?: string;
  }
  | { kind: "resend"; apiKey: string; from: string }
  | { kind: "none"; from: string };

export const DEFAULT_FROM = "Des Moines Insider <hello@desmoinesinsider.com>";

// Through globalThis (siteUrl.ts envVar): campaignNotificationEmail.ts imports
// this module and is loaded by an offline tsx test and type-checked by
// tsconfig.scripts.json, where `Deno` is not a binding.
export const denoEnv: EnvReader = (key) => {
  try {
    return envVar(key) || undefined;
  } catch {
    return undefined;
  }
};

export function resolveEmailProvider(env: EnvReader = denoEnv): EmailProviderConfig {
  const from = env("SES_FROM_ADDRESS") || DEFAULT_FROM;
  const region = env("AWS_SES_REGION");
  const accessKeyId = env("AWS_SES_ACCESS_KEY_ID");
  const secretAccessKey = env("AWS_SES_SECRET_ACCESS_KEY");
  if (region && accessKeyId && secretAccessKey) {
    return { kind: "ses", region, accessKeyId, secretAccessKey, from, configurationSet: env("SES_CONFIGURATION_SET") };
  }
  const apiKey = env("RESEND_API_KEY");
  if (apiKey) return { kind: "resend", apiKey, from };
  return { kind: "none", from };
}

/**
 * Admin alert recipient. ADMIN_ALERT_EMAIL is the one name; the others are
 * what individual functions read before it existed, kept as fallbacks so a
 * deployment that only set the old secret keeps getting mail.
 */
export function adminAlertEmail(env: EnvReader = denoEnv): string | undefined {
  return env("ADMIN_ALERT_EMAIL") || env("ALERT_EMAIL") || env("ADMIN_NOTIFICATION_EMAIL") || undefined;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Bare address out of "Name <addr>" or "addr". */
export function addressOf(value: string): string {
  const m = value.match(/<([^>]+)>/);
  return normalizeEmail(m ? m[1] : value);
}

const MAILTO_UNSUBSCRIBE = "<mailto:unsubscribe@desmoinesinsider.com?subject=unsubscribe>";

/**
 * The message headers that go out. Header names are matched case-insensitively
 * so a caller's "list-unsubscribe" does not produce a second one. CR/LF are
 * stripped from values: a header value is the one place a newline becomes
 * header injection.
 */
export function buildMessageHeaders(input: Pick<SendEmailInput, "category" | "headers">): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    if (!value || !/^[A-Za-z0-9-]+$/.test(name)) continue;
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push({ name, value: value.replace(/[\r\n]+/g, " ").trim() });
  }
  if (input.category === "marketing" && !seen.has("list-unsubscribe")) {
    out.push({ name: "List-Unsubscribe", value: MAILTO_UNSUBSCRIBE });
  }
  // RFC 8058: one-click needs an https URI in List-Unsubscribe to POST to.
  const lu = out.find((h) => h.name.toLowerCase() === "list-unsubscribe");
  const post = out.findIndex((h) => h.name.toLowerCase() === "list-unsubscribe-post");
  if (post >= 0 && !(lu && /<https:\/\//i.test(lu.value))) out.splice(post, 1);
  return out;
}

/** SES tag values allow [A-Za-z0-9_.-]; anything else becomes "_". */
function tagValue(v: string): string {
  return v.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 256) || "none";
}

function asList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter(Boolean);
}

export function buildSesPayload(
  input: SendEmailInput,
  cfg: { from: string; configurationSet?: string },
  recipients: string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.text) body.Text = { Data: input.text, Charset: "UTF-8" };
  if (input.html) body.Html = { Data: input.html, Charset: "UTF-8" };
  const headers = buildMessageHeaders(input);
  const payload: Record<string, unknown> = {
    FromEmailAddress: input.from || cfg.from,
    Destination: { ToAddresses: recipients },
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: body,
        ...(headers.length ? { Headers: headers.map((h) => ({ Name: h.name, Value: h.value })) } : {}),
      },
    },
    EmailTags: [
      { Name: "template", Value: tagValue(input.template) },
      { Name: "category", Value: input.category },
    ],
  };
  const replyTo = asList(input.replyTo);
  if (replyTo.length) payload.ReplyToAddresses = replyTo;
  if (cfg.configurationSet) payload.ConfigurationSetName = cfg.configurationSet;
  return payload;
}

export function buildResendPayload(
  input: SendEmailInput,
  cfg: { from: string },
  recipients: string[],
): Record<string, unknown> {
  const headers = buildMessageHeaders(input);
  const payload: Record<string, unknown> = {
    from: input.from || cfg.from,
    to: recipients,
    subject: input.subject,
    tags: [
      { name: "template", value: tagValue(input.template) },
      { name: "category", value: input.category },
    ],
  };
  if (input.html) payload.html = input.html;
  if (input.text) payload.text = input.text;
  const replyTo = asList(input.replyTo);
  if (replyTo.length) payload.reply_to = replyTo;
  // In the JSON body, where Resend puts them on the message.
  if (headers.length) payload.headers = Object.fromEntries(headers.map((h) => [h.name, h.value]));
  return payload;
}

// deno-lint-ignore no-explicit-any
type DbClient = any;

export interface SendEmailDeps {
  /** Service-role client. Without one, suppression and email_log are skipped. */
  supabase?: DbClient;
  env?: EnvReader;
  fetch?: typeof fetch;
  /** Pinned in tests. */
  now?: Date;
}

/** Suppression that applies to this category. Bounces and complaints block everything. */
export function isBlocked(reason: string | null | undefined, category: EmailCategory): boolean {
  if (category === "marketing") return true;
  return reason !== "unsubscribe";
}

/**
 * A table that does not exist yet. Postgres says 42P01; PostgREST, which is
 * what supabase-js talks to, says PGRST205 before the query ever reaches
 * Postgres. Checking only 42P01 would make every marketing send fail closed in
 * the window between deploying these functions and applying 20261002000001.
 */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

async function suppressedRecipients(
  supabase: DbClient,
  recipients: string[],
  category: EmailCategory,
): Promise<{ blocked: Set<string>; failClosed: boolean }> {
  const blocked = new Set<string>();
  try {
    const { data, error } = await supabase
      .from("email_suppressions")
      .select("email, reason")
      .in("email", recipients.map(normalizeEmail));
    if (error) {
      // The migration has not been applied yet. Nothing can be on a list that
      // does not exist, so send; anything else is a read we could not do.
      if (isMissingTable(error)) return { blocked, failClosed: false };
      console.warn(`[email] suppression check failed: ${error.message}`);
      // Marketing fails closed: mailing someone who asked us to stop is worse
      // than a newsletter that goes out an hour late. Transactional fails open.
      return { blocked, failClosed: category === "marketing" };
    }
    for (const row of (data ?? []) as Array<{ email: string; reason: string }>) {
      if (isBlocked(row.reason, category)) blocked.add(normalizeEmail(row.email));
    }
  } catch (err) {
    console.warn(`[email] suppression check threw: ${err instanceof Error ? err.message : String(err)}`);
    return { blocked, failClosed: category === "marketing" };
  }
  return { blocked, failClosed: false };
}

async function writeLog(
  supabase: DbClient,
  input: SendEmailInput,
  recipients: string[],
  fields: { provider: string; status: string; messageId?: string; error?: string },
): Promise<void> {
  if (!supabase || recipients.length === 0) return;
  try {
    const { error } = await supabase.from("email_log").insert(
      recipients.map((to) => ({
        template: input.template,
        category: input.category,
        to_email: normalizeEmail(to),
        user_id: input.userId ?? null,
        ref_type: input.ref?.type ?? null,
        ref_id: input.ref?.id ?? null,
        provider: fields.provider,
        provider_message_id: fields.messageId ?? null,
        status: fields.status,
        error: fields.error ? fields.error.slice(0, 500) : null,
      })),
    );
    if (error && !isMissingTable(error)) console.warn(`[email] email_log insert failed: ${error.message}`);
  } catch (err) {
    console.warn(`[email] email_log insert threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function deliverSes(
  input: SendEmailInput,
  cfg: Extract<EmailProviderConfig, { kind: "ses" }>,
  recipients: string[],
  doFetch: typeof fetch,
  now?: Date,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const url = `https://email.${cfg.region}.amazonaws.com/v2/email/outbound-emails`;
  const body = JSON.stringify(buildSesPayload(input, cfg, recipients));
  const headers = await signRequest(
    { method: "POST", url, headers: { "content-type": "application/json" }, body },
    { region: cfg.region, service: "ses", credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }, now },
  );
  // host is set by fetch itself and is a forbidden header in some runtimes.
  delete headers.host;
  const res = await doFetch(url, { method: "POST", headers, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `SES ${res.status}: ${String(json?.message ?? json?.Message ?? "").slice(0, 200)}` };
  return { ok: true, messageId: json?.MessageId ?? undefined };
}

async function deliverResend(
  input: SendEmailInput,
  cfg: Extract<EmailProviderConfig, { kind: "resend" }>,
  recipients: string[],
  doFetch: typeof fetch,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const res = await doFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildResendPayload(input, cfg, recipients)),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${String(json?.message ?? "").slice(0, 200)}` };
  return { ok: true, messageId: json?.id ?? undefined };
}

export async function sendEmail(input: SendEmailInput, deps: SendEmailDeps = {}): Promise<SendEmailResult> {
  const env = deps.env ?? denoEnv;
  const doFetch = deps.fetch ?? ((u: string | URL | Request, i?: RequestInit) => fetchWithTimeout(u, i ?? {}));
  const supabase = deps.supabase;

  const all = [...new Set(asList(input.to).map((t) => t.trim()).filter(Boolean))];
  if (all.length === 0) return { ok: false, error: "no recipient" };
  if (!input.html && !input.text) return { ok: false, error: "empty body" };

  const cfg = resolveEmailProvider(env);

  let recipients = all;
  let suppressed: string[] = [];
  if (supabase) {
    const { blocked, failClosed } = await suppressedRecipients(supabase, all, input.category);
    if (failClosed) {
      await writeLog(supabase, input, all, { provider: cfg.kind, status: "failed", error: "suppression check failed" });
      return { ok: false, error: "suppression check failed", provider: cfg.kind };
    }
    suppressed = all.filter((t) => blocked.has(normalizeEmail(t)));
    recipients = all.filter((t) => !blocked.has(normalizeEmail(t)));
    if (suppressed.length) await writeLog(supabase, input, suppressed, { provider: cfg.kind, status: "suppressed" });
  }
  if (recipients.length === 0) {
    return { ok: false, error: "all recipients suppressed", provider: cfg.kind, suppressed };
  }

  if (cfg.kind === "none") {
    console.warn(`[email] ${input.template} not sent: no SES credentials and no RESEND_API_KEY`);
    await writeLog(supabase, input, recipients, { provider: "none", status: "skipped", error: "no email provider configured" });
    return { ok: false, error: "no email provider configured", provider: "none", suppressed };
  }

  let result: { ok: boolean; messageId?: string; error?: string };
  try {
    result = cfg.kind === "ses"
      ? await deliverSes(input, cfg, recipients, doFetch, deps.now)
      : await deliverResend(input, cfg, recipients, doFetch);
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  console.log(`[email] ${input.template} via ${cfg.kind}: ${result.ok ? "sent" : `failed (${result.error})`}`);
  await writeLog(supabase, input, recipients, {
    provider: cfg.kind,
    status: result.ok ? "sent" : "failed",
    messageId: result.messageId,
    error: result.error,
  });

  return { ...result, provider: cfg.kind, suppressed };
}
