/**
 * SECURITY: verify_jwt = false
 * Reason: consolidated dispatcher. google-indexing-api self-authenticates
 *   (getUser); gsc-fetch-properties and gsc-sync-data carried no in-handler auth
 *   and relied on the gateway, so the router enforces requireAdminOrApiKey for
 *   those two (admin JWT / API key / service-role bearer pass). gsc-oauth is NOT
 *   hosted here — it is a registered OAuth redirect URI and stays standalone.
 *
 * gsc — consolidated dispatcher for Google Search Console / indexing admin
 * edge functions (gsc-fetch-properties, gsc-sync-data, google-indexing-api).
 *
 * Routing: POST /functions/v1/gsc/<name>. Request/response shapes unchanged;
 * only the URL prefix gains `/gsc`.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";

import gscFetchProperties from "../_shared/routes/gsc/gsc-fetch-properties.ts";
import gscSyncData from "../_shared/routes/gsc/gsc-sync-data.ts";
import googleIndexingApi from "../_shared/routes/gsc/google-indexing-api.ts";

type Handler = (req: Request) => Response | Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "gsc-fetch-properties": gscFetchProperties,
  "gsc-sync-data": gscSyncData,
  "google-indexing-api": googleIndexingApi,
};

const GATEWAY_AUTH = new Set<string>([
  "gsc-fetch-properties",
  "gsc-sync-data",
]);

function resolveRoute(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("gsc");
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
      JSON.stringify({ error: `Unknown gsc route '${route}'`, available: Object.keys(ROUTES).sort() }),
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
