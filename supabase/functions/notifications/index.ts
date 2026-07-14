/**
 * SECURITY: verify_jwt = false
 * Reason: consolidated dispatcher; every hosted handler self-authenticates via
 *   requireAdminOrApiKey / getUser exactly as it did when deployed standalone.
 *   The gateway JWT check is intentionally off so cron (service-role bearer),
 *   admin UI (admin JWT), and end-user (own JWT) callers all reach the same
 *   in-function auth gate they used before.
 *
 * notifications — consolidated dispatcher for outbound notification / email /
 * digest edge functions.
 *
 * Collapses several near-identical send-* / digest / alert functions into one
 * deployed function to stay under the Supabase edge-function cap. Each former
 * function's body now lives in `_shared/routes/notifications/<name>.ts` and
 * exports its handler; this file holds the one router.
 *
 * Routing: POST /functions/v1/notifications/<name>. The request (headers +
 * body) is passed through untouched, so each handler's own CORS, auth, and body
 * parsing behave exactly as before. Request/response shapes are unchanged; only
 * the URL prefix gains `/notifications`.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";

import sendCampaignNotification from "../_shared/routes/notifications/send-campaign-notification.ts";
import sendEventReminders from "../_shared/routes/notifications/send-event-reminders.ts";
import sendFeedbackReply from "../_shared/routes/notifications/send-feedback-reply.ts";
import sendNewsletterCampaign from "../_shared/routes/notifications/send-newsletter-campaign.ts";
import sendSecurityNotification from "../_shared/routes/notifications/send-security-notification.ts";
import assembleWeeklyDigest from "../_shared/routes/notifications/assemble-weekly-digest.ts";
import savedSearchAlerts from "../_shared/routes/notifications/saved-search-alerts.ts";
import dispatchScheduledNewsletters from "../_shared/routes/notifications/dispatch-scheduled-newsletters.ts";
import sendWeeklyDigest from "../_shared/routes/notifications/send-weekly-digest.ts";

type Handler = (req: Request) => Response | Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "send-campaign-notification": sendCampaignNotification,
  "send-event-reminders": sendEventReminders,
  "send-feedback-reply": sendFeedbackReply,
  "send-newsletter-campaign": sendNewsletterCampaign,
  "send-security-notification": sendSecurityNotification,
  "assemble-weekly-digest": assembleWeeklyDigest,
  "saved-search-alerts": savedSearchAlerts,
  "dispatch-scheduled-newsletters": dispatchScheduledNewsletters,
  "send-weekly-digest": sendWeeklyDigest,
};

// Routes whose original standalone functions relied on the gateway's
// verify_jwt=true with no in-handler auth. The router enforces
// requireAdminOrApiKey for them (cron service-role bearer / admin JWT / API key
// all pass) so consolidation does not open them up.
const GATEWAY_AUTH = new Set<string>([
  "dispatch-scheduled-newsletters",
  "send-weekly-digest",
]);

function resolveRoute(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("notifications");
  if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  return "";
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const route = resolveRoute(req);
  const handler = ROUTES[route];
  if (!handler) {
    const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
    return new Response(
      JSON.stringify({ error: `Unknown notifications route '${route}'`, available: Object.keys(ROUTES).sort() }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (GATEWAY_AUTH.has(route)) {
    const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
    const authError = await requireAdminOrApiKey(req, corsHeaders);
    if (authError) return authError;
  }

  return handler(req);
});
