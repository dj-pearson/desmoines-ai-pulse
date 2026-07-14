/**
 * SECURITY: verify_jwt = false
 * Reason: consolidated dispatcher. social-daily-poster (requireAdminOrApiKey)
 *   and manage-social-account (getUser) self-authenticate; social-media-manager
 *   carried no in-handler auth and relied on the gateway, so the router enforces
 *   requireAdminOrApiKey for it (admin JWT / API key / the service-role bearer
 *   that social-daily-poster sends all pass).
 *
 * social — consolidated dispatcher for social-posting edge functions
 * (social-daily-poster, social-media-manager, manage-social-account).
 *
 * Routing: POST /functions/v1/social/<name>. Request/response shapes unchanged;
 * only the URL prefix gains `/social`.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";

import socialDailyPoster from "../_shared/routes/social/social-daily-poster.ts";
import socialMediaManager from "../_shared/routes/social/social-media-manager.ts";
import manageSocialAccount from "../_shared/routes/social/manage-social-account.ts";

type Handler = (req: Request) => Response | Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "social-daily-poster": socialDailyPoster,
  "social-media-manager": socialMediaManager,
  "manage-social-account": manageSocialAccount,
};

const GATEWAY_AUTH = new Set<string>([
  "social-media-manager",
]);

function resolveRoute(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("social");
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
      JSON.stringify({ error: `Unknown social route '${route}'`, available: Object.keys(ROUTES).sort() }),
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
