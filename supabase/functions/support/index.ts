/**
 * SECURITY: verify_jwt = false
 * Reason: consolidated dispatcher; every hosted handler self-authenticates via
 *   requireAdminOrApiKey / getUser exactly as it did standalone. The gateway
 *   JWT check stays off so admin UI (admin JWT), signed-in users (own JWT), and
 *   cron/API-key callers all reach the same in-function auth gate as before.
 *
 * support — consolidated dispatcher for the support / knowledge-base edge
 * functions (chat, admin console, CSAT, KB admin/search/embed, ticket
 * reclassify).
 *
 * Each former function's body now lives in `_shared/routes/support/<name>.ts`
 * and exports its handler; this file holds the one router.
 *
 * Routing: POST /functions/v1/support/<name>. The request (headers + body) is
 * passed through untouched. Request/response shapes are unchanged; only the URL
 * prefix gains `/support`.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";

import supportChat from "../_shared/routes/support/support-chat.ts";
import supportConsole from "../_shared/routes/support/support-console.ts";
import supportCsatSubmit from "../_shared/routes/support/support-csat-submit.ts";
import supportKbAdmin from "../_shared/routes/support/support-kb-admin.ts";
import supportKbEmbed from "../_shared/routes/support/support-kb-embed.ts";
import supportKbSearch from "../_shared/routes/support/support-kb-search.ts";
import supportTicketReclassify from "../_shared/routes/support/support-ticket-reclassify.ts";

type Handler = (req: Request) => Response | Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "support-chat": supportChat,
  "support-console": supportConsole,
  "support-csat-submit": supportCsatSubmit,
  "support-kb-admin": supportKbAdmin,
  "support-kb-embed": supportKbEmbed,
  "support-kb-search": supportKbSearch,
  "support-ticket-reclassify": supportTicketReclassify,
};

function resolveRoute(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("support");
  if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  return "";
}

Deno.serve((req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const route = resolveRoute(req);
  const handler = ROUTES[route];
  if (!handler) {
    const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);
    return new Response(
      JSON.stringify({ error: `Unknown support route '${route}'`, available: Object.keys(ROUTES).sort() }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return handler(req);
});
