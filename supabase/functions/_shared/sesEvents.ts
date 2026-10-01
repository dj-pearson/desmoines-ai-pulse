/**
 * SNS envelope verification and SES event decisions for the ses-events edge
 * function (WP2 of docs/plans/NON_CORE_REVIEW_2026-09.md). Pure apart from
 * crypto.subtle and an injected certificate fetcher, so the test runs offline.
 *
 * Why the checks are strict. ses-events is public (verify_jwt=false) and what
 * it does with a message is add an address to email_suppressions. Anyone who
 * can get a message accepted can stop mail to any address, so:
 *   - the signature is verified against the certificate SNS names, and that
 *     certificate is fetched only from https://sns.<region>.amazonaws.com/
 *     with the region taken from the topic ARN;
 *   - the topic must be one we configured (SES_SNS_TOPIC_ARN). A valid SNS
 *     signature proves AWS sent it, not that it came from OUR topic: anyone
 *     can create a topic in their own account and subscribe this URL.
 *
 * Reference: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 */

export interface SnsEnvelope {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
  UnsubscribeURL?: string;
}

const TYPES = new Set(["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"]);

export function parseSnsEnvelope(body: unknown): SnsEnvelope | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const str = (k: string) => typeof b[k] === "string";
  if (!TYPES.has(String(b.Type))) return null;
  for (const k of ["MessageId", "TopicArn", "Message", "Timestamp", "SignatureVersion", "Signature", "SigningCertURL"]) {
    if (!str(k)) return null;
  }
  if (b.Type !== "Notification" && (!str("SubscribeURL") || !str("Token"))) return null;
  return b as unknown as SnsEnvelope;
}

/** The canonical string SNS signs, per message type. */
export function snsStringToSign(env: SnsEnvelope): string {
  const keys = env.Type === "Notification"
    ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
    : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  let out = "";
  for (const k of keys) {
    const v = (env as unknown as Record<string, unknown>)[k];
    if (typeof v === "string") out += `${k}\n${v}\n`;
  }
  return out;
}

/** "us-east-2" out of arn:aws:sns:us-east-2:123456789012:topic, or null. */
export function topicRegion(topicArn: string): string | null {
  const m = topicArn.match(/^arn:aws:sns:([a-z0-9-]+):\d{12}:[A-Za-z0-9_-]+$/);
  return m ? m[1] : null;
}

/**
 * An SNS URL we are willing to fetch: https, exactly sns.<region>.amazonaws.com,
 * no port, no credentials. `region` pins it to the topic's region.
 */
export function isAllowedSnsUrl(raw: string, region: string | null): boolean {
  if (!region) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === "https:" && u.hostname === `sns.${region}.amazonaws.com` && u.port === "" &&
    u.username === "" && u.password === "";
}

export function isAllowedCertUrl(raw: string, region: string | null): boolean {
  if (!isAllowedSnsUrl(raw, region)) return false;
  return new URL(raw).pathname.endsWith(".pem");
}

export function isAllowedTopic(topicArn: string, allowed: string | undefined): boolean {
  if (!allowed) return false;
  return allowed.split(",").map((s) => s.trim()).filter(Boolean).includes(topicArn);
}

export function pemToDer(pem: string): Uint8Array {
  const m = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
  if (!m) throw new Error("no certificate in PEM");
  const bin = atob(m[1].replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface Tlv {
  tag: number;
  /** Offset of the tag byte. */
  start: number;
  /** Offset of the first content byte. */
  body: number;
  /** Offset just past the content. */
  end: number;
}

function readTlv(der: Uint8Array, at: number): Tlv {
  if (at + 2 > der.length) throw new Error("DER truncated");
  const tag = der[at];
  let len = der[at + 1];
  let body = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || body + n > der.length) throw new Error("DER length");
    len = 0;
    for (let i = 0; i < n; i++) len = (len * 256) + der[body + i];
    body += n;
  }
  const end = body + len;
  if (end > der.length) throw new Error("DER truncated");
  return { tag, start: at, body, end };
}

/**
 * The SubjectPublicKeyInfo of an X.509 certificate, as the DER bytes
 * crypto.subtle.importKey("spki", ...) takes. Walks only as far as it needs:
 * Certificate > tbsCertificate > [version] serial sigAlg issuer validity
 * subject subjectPublicKeyInfo.
 */
export function spkiFromCertificate(der: Uint8Array): Uint8Array {
  const cert = readTlv(der, 0);
  if (cert.tag !== 0x30) throw new Error("not a certificate");
  const tbs = readTlv(der, cert.body);
  if (tbs.tag !== 0x30) throw new Error("no tbsCertificate");
  let at = tbs.body;
  let field = readTlv(der, at);
  if (field.tag === 0xa0) {
    at = field.end; // explicit version
    field = readTlv(der, at);
  }
  // serial, signature algorithm, issuer, validity, subject
  for (let i = 0; i < 5; i++) {
    field = readTlv(der, at);
    at = field.end;
  }
  const spki = readTlv(der, at);
  if (spki.tag !== 0x30) throw new Error("no subjectPublicKeyInfo");
  return der.slice(spki.start, spki.end);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function buf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

export type CertFetcher = (url: string) => Promise<string>;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify an SNS message. `allowedTopics` is SES_SNS_TOPIC_ARN (comma-separated
 * allowed). The certificate URL is checked BEFORE anything is fetched.
 */
export async function verifySnsMessage(
  env: SnsEnvelope,
  opts: { allowedTopics: string | undefined; fetchCert: CertFetcher },
): Promise<VerifyResult> {
  if (!isAllowedTopic(env.TopicArn, opts.allowedTopics)) return { ok: false, reason: "topic not allowed" };
  const region = topicRegion(env.TopicArn);
  if (!isAllowedCertUrl(env.SigningCertURL, region)) return { ok: false, reason: "certificate URL not allowed" };
  const hash = env.SignatureVersion === "1" ? "SHA-1" : env.SignatureVersion === "2" ? "SHA-256" : null;
  if (!hash) return { ok: false, reason: "unknown SignatureVersion" };
  try {
    const pem = await opts.fetchCert(env.SigningCertURL);
    const key = await crypto.subtle.importKey(
      "spki",
      buf(spkiFromCertificate(pemToDer(pem))),
      { name: "RSASSA-PKCS1-v1_5", hash },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      buf(b64ToBytes(env.Signature)),
      buf(new TextEncoder().encode(snsStringToSign(env))),
    );
    return ok ? { ok: true } : { ok: false, reason: "bad signature" };
  } catch (err) {
    return { ok: false, reason: `verification error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// --- SES event decisions -----------------------------------------------------

export type LogStatus = "delivered" | "bounced" | "complained";

export interface SesEventDecision {
  /** SES message id (mail.messageId), which sendEmail logged as provider_message_id. */
  messageId: string | null;
  /** New email_log status, or null to leave it. */
  logStatus: LogStatus | null;
  /** Addresses to add to email_suppressions, lowercased. */
  suppress: Array<{ email: string; reason: "bounce" | "complaint" }>;
  /** What the event was, for the response and the logs. */
  kind: string;
}

function recipients(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => (r && typeof r === "object" ? (r as { emailAddress?: unknown }).emailAddress : null))
    .filter((e): e is string => typeof e === "string" && e.includes("@"))
    .map((e) => e.trim().toLowerCase());
}

/**
 * What to do with one SES event. Handles both shapes SES publishes:
 * configuration-set event publishing ("eventType") and identity
 * notifications ("notificationType").
 *
 * Only a PERMANENT bounce suppresses. A transient bounce (mailbox full,
 * greylisting) is SES retrying, and suppressing on it would drop real readers.
 * A complaint always suppresses: someone pressed "report spam".
 */
export function decideSesEvent(message: unknown): SesEventDecision {
  const m = (message && typeof message === "object" ? message : {}) as Record<string, unknown>;
  const kind = String(m.eventType ?? m.notificationType ?? "unknown");
  const mail = (m.mail ?? {}) as { messageId?: unknown };
  const messageId = typeof mail.messageId === "string" ? mail.messageId : null;
  const none: SesEventDecision = { messageId, logStatus: null, suppress: [], kind };

  if (kind === "Bounce") {
    const b = (m.bounce ?? {}) as { bounceType?: unknown; bouncedRecipients?: unknown };
    if (b.bounceType !== "Permanent") return { ...none, kind: `Bounce/${String(b.bounceType ?? "unknown")}` };
    return {
      messageId,
      logStatus: "bounced",
      suppress: recipients(b.bouncedRecipients).map((email) => ({ email, reason: "bounce" as const })),
      kind: "Bounce/Permanent",
    };
  }
  if (kind === "Complaint") {
    const c = (m.complaint ?? {}) as { complainedRecipients?: unknown };
    return {
      messageId,
      logStatus: "complained",
      suppress: recipients(c.complainedRecipients).map((email) => ({ email, reason: "complaint" as const })),
      kind,
    };
  }
  if (kind === "Delivery") return { ...none, logStatus: "delivered" };
  return none;
}
