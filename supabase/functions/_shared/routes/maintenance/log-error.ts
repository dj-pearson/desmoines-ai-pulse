/**
 * SECURITY: verify_jwt = false
 * Reason: public error sink — the web client posts errors before/without a
 *   session. Rate-limited per IP; PII is scrubbed before storage; no data
 *   returned. No secrets, no privileged reads.
 * Risk level: LOW.
 *
 * log-error (AOS-DEV-001) — production error ingest.
 *
 * Receives errors from @/lib/errorHandler (and edge functions), scrubs PII from
 * the message, computes a cluster signature, and stores a row in error_events.
 * The error-triage agent clusters these into dev tasks.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../../cors.ts";
import { checkRateLimitPersistent, addRateLimitHeaders } from "../../rateLimit.ts";
import { scrubPii, errorSignature } from "../../scrubPii.ts";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

export default (async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, corsHeaders);

  // Burst-protect the public sink so it can't be used to flood the table.
  const rl = await checkRateLimitPersistent(req, {
    endpoint: "log-error",
    windowMs: 60 * 1000,
    max: 60,
    message: "Too many error reports.",
  });
  if (!rl.success && rl.response) return addRateLimitHeaders(rl.response, rl);

  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? "").slice(0, 2000);
  if (!message) return json({ ok: true, skipped: "no message" }, 200, corsHeaders);

  const component = String(body.component ?? "").slice(0, 80);
  const action = String(body.action ?? "").slice(0, 80);
  const route = String(body.route ?? "").slice(0, 200);
  const severity = ["info", "warning", "error", "critical"].includes(body.severity) ? body.severity : "error";
  const source = body.source === "edge" ? "edge" : "client";
  const userId = typeof body.userId === "string" && /^[0-9a-f-]{36}$/i.test(body.userId) ? body.userId : null;

  const messageRedacted = scrubPii(message);
  const signature = await errorSignature(component, action, message);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await supabase.from("error_events").insert({
      signature,
      message_redacted: messageRedacted,
      component: component || null,
      action: action || null,
      route: route || null,
      severity,
      source,
      user_id: userId,
    });
  } catch (err) {
    console.error("[log-error] insert failed:", err instanceof Error ? err.message : String(err));
    // Best-effort: never fail the caller on a sink hiccup.
  }

  return json({ ok: true, signature }, 200, corsHeaders);
});
