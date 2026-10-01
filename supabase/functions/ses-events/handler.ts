/**
 * ses-events request handling, with the database client and the network
 * injected so the test runs offline. Verification and the per-event decision
 * live in _shared/sesEvents.ts; this file is the order of operations and the
 * writes.
 */
import {
  type CertFetcher,
  decideSesEvent,
  isAllowedSnsUrl,
  parseSnsEnvelope,
  type SesEventDecision,
  topicRegion,
  verifySnsMessage,
} from "../_shared/sesEvents.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface SesEventsDeps {
  db: Db;
  /** SES_SNS_TOPIC_ARN. Unset refuses every message. */
  allowedTopics: string | undefined;
  fetchCert: CertFetcher;
  /** GET the SubscribeURL. Only ever called with a URL that passed isAllowedSnsUrl. */
  confirm: (url: string) => Promise<boolean>;
  /** The SNS signature check. Always verifySnsMessage outside tests. */
  verifySignature: typeof verifySnsMessage;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function check(error: { message: string } | null | undefined, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/**
 * Write one decision. Throws on a database error so the caller answers 500 and
 * SNS redelivers; every write here is idempotent, so a retry is safe.
 */
export async function applyDecision(db: Db, d: SesEventDecision): Promise<void> {
  const now = new Date().toISOString();

  for (const s of d.suppress) {
    // Overwrites an 'unsubscribe' row: a bounce or complaint is the stronger
    // fact and also blocks transactional mail.
    const { error } = await db.from("email_suppressions").upsert(
      { email: s.email, reason: s.reason, source: "ses", detail: { messageId: d.messageId, kind: d.kind }, updated_at: now },
      { onConflict: "email" },
    );
    check(error, "email_suppressions upsert");

    const patch = s.reason === "bounce"
      ? { status: "bounced", updated_at: now }
      : { status: "unsubscribed", unsubscribed_at: now, updated_at: now };
    const { error: subError } = await db.from("newsletter_subscribers").update(patch).eq("email", s.email);
    check(subError, "newsletter_subscribers update");
  }

  if (!d.messageId || !d.logStatus) return;

  // "delivered" never overwrites a bounce or complaint that arrived first.
  let log = db.from("email_log").update({ status: d.logStatus, updated_at: now }).eq("provider_message_id", d.messageId);
  if (d.logStatus === "delivered") log = log.eq("status", "sent");
  const { error: logError } = await log;
  check(logError, "email_log update");

  // The ledgers that predate email_log. Their column is named for Resend and
  // holds whichever provider's id sent the message.
  let deliveries = db.from("newsletter_deliveries").update({ status: d.logStatus, event_at: now }).eq("resend_message_id", d.messageId);
  if (d.logStatus === "delivered") deliveries = deliveries.eq("status", "queued");
  const { error: delError } = await deliveries;
  check(delError, "newsletter_deliveries update");

  let nurture = db.from("nurture_sends").update({ status: d.logStatus, updated_at: now }).eq("resend_message_id", d.messageId);
  if (d.logStatus === "delivered") nurture = nurture.eq("status", "queued");
  const { error: nurError } = await nurture;
  check(nurError, "nurture_sends update");
}

export async function handleSesEvent(req: Request, deps: SesEventsDeps): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: unknown;
  try {
    // SNS posts JSON with Content-Type text/plain.
    body = JSON.parse(await req.text());
  } catch {
    return json(400, { error: "Body is not JSON" });
  }
  const env = parseSnsEnvelope(body);
  if (!env) return json(400, { error: "Not an SNS message" });

  const verified = await deps.verifySignature(env, { allowedTopics: deps.allowedTopics, fetchCert: deps.fetchCert });
  if (!verified.ok) {
    console.warn(`[ses-events] rejected ${env.Type} from ${env.TopicArn}: ${verified.reason}`);
    return json(403, { error: "Message not verified" });
  }

  if (env.Type === "SubscriptionConfirmation") {
    if (!isAllowedSnsUrl(env.SubscribeURL ?? "", topicRegion(env.TopicArn))) return json(400, { error: "SubscribeURL not allowed" });
    const ok = await deps.confirm(env.SubscribeURL!);
    console.log(`[ses-events] subscription to ${env.TopicArn} ${ok ? "confirmed" : "NOT confirmed"}`);
    return ok ? json(200, { ok: true, confirmed: true }) : json(502, { error: "Confirmation failed" });
  }

  if (env.Type === "UnsubscribeConfirmation") {
    console.warn(`[ses-events] topic ${env.TopicArn} unsubscribed this endpoint`);
    return json(200, { ok: true });
  }

  let message: unknown;
  try {
    message = JSON.parse(env.Message);
  } catch {
    // Signed by AWS but not an SES event (a test publish from the console).
    return json(200, { ok: true, ignored: "message is not JSON" });
  }

  const decision = decideSesEvent(message);
  try {
    await applyDecision(deps.db, decision);
  } catch (err) {
    console.error(`[ses-events] ${decision.kind} not recorded: ${err instanceof Error ? err.message : String(err)}`);
    return json(500, { error: "Not recorded, retry" });
  }
  return json(200, { ok: true, kind: decision.kind, suppressed: decision.suppress.length });
}
