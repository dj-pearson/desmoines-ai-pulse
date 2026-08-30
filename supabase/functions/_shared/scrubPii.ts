/**
 * scrubPii — redact PII / secrets from free-text error messages (AOS-DEV-001).
 * Applied at ingest so no PII from an error payload is ever stored.
 */
export function scrubPii(input: string): string {
  if (!input) return "";
  return input
    .slice(0, 2000)
    // emails
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
    // JWTs / bearer tokens
    .replace(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, "<jwt>")
    .replace(/(sk|rk|pk)_[a-z]+_[0-9a-zA-Z]{12,}/g, "<key>")
    // UUIDs
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, "<uuid>")
    // phone-ish and long digit runs
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "<num>")
    // query strings / tokens in URLs
    .replace(/([?&](token|key|secret|password|email)=)[^&\s]+/gi, "$1<redacted>");
}

/**
 * A stable cluster signature: normalize the message (strip volatile bits) and
 * combine with component/action. Same bug → same signature regardless of the
 * specific ids/numbers in the message.
 */
export async function errorSignature(
  component: string,
  action: string,
  message: string,
): Promise<string> {
  const normalized = scrubPii(message)
    .replace(/<uuid>|<num>|<email>|<jwt>|<key>/g, "#")
    .replace(/\d+/g, "#")
    .replace(/['"`].*?['"`]/g, "'#'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
    .toLowerCase();
  const basis = `${component}|${action}|${normalized}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis));
  return Array.from(new Uint8Array(digest)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
