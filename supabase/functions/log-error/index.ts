/**
 * SECURITY: verify_jwt = false
 * Reason: public error sink — the web client posts errors before/without a
 *   session. Rate-limited per IP; PII is scrubbed before storage; no data
 *   returned. No secrets, no privileged reads. user_id is stored only from a
 *   verified bearer or a machine caller, never from an anonymous body.
 * Risk level: LOW.
 *
 * log-error (AOS-DEV-001) — production error ingest.
 *
 * Receives errors from @/lib/errorHandler (and edge functions), scrubs PII from
 * the message, computes a cluster signature, and stores a row in error_events.
 * The error-triage agent clusters these into dev tasks.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimitPersistent, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { scrubPii, errorSignature } from "../_shared/scrubPii.ts";
import { classifyCaller, expectedSecrets, isMachineCaller, presentedCredentials } from "../_shared/callerKind.ts";
import { resolveErrorUserId, resolveSource, shouldVerifyBearer } from "../_shared/errorPolicy.ts";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
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

  // Every stored text field is scrubbed, not only the message: a route can
  // carry an email or a token in its query string (IOS-DD-PLATFORM-18).
  const component = scrubPii(String(body.component ?? "")).slice(0, 80);
  const action = scrubPii(String(body.action ?? "")).slice(0, 80);
  const route = scrubPii(String(body.route ?? "")).slice(0, 200);
  const severity = ["info", "warning", "error", "critical"].includes(body.severity) ? body.severity : "error";
  // "edge" only from a caller holding the service role or the edge API key;
  // triage reads "edge" as not user-facing.
  const presented = presentedCredentials(req);
  const internal = isMachineCaller(classifyCaller(presented, expectedSecrets()));
  const source = resolveSource(body.source, internal);

  const messageRedacted = scrubPii(message);
  const signature = await errorSignature(component, action, message);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // user_id comes from a verified session, or from a machine caller's word;
    // an anonymous caller's userId is dropped (WEB-SEC-063). A token that fails
    // verification still files the error, unattributed. The body's userId
    // field is read in exactly one place, below; the test counts.
    // edge-auth: attribution-only
    // (getUser below labels the row; it does not gate the call. Read by
    // scripts/check-edge-auth.mjs, which keeps log-error on its baseline.)
    let verifiedUserId: string | null = null;
    if (!internal && shouldVerifyBearer(presented.bearer, Deno.env.get("SUPABASE_ANON_KEY"))) {
      try {
        const { data } = await supabase.auth.getUser(presented.bearer!);
        verifiedUserId = data?.user?.id ?? null;
      } catch {
        verifiedUserId = null;
      }
    }
    const userId = resolveErrorUserId(body.userId, { internal, verifiedUserId });

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
