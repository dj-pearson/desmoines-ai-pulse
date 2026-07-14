/**
 * SECURITY: verify_jwt = false
 * Reason: consolidated dispatcher; every hosted handler self-authenticates via
 *   requireAdminOrApiKey / getUser exactly as it did standalone. The gateway
 *   JWT check stays off. (image-transform is deliberately NOT hosted here — it
 *   is a public, hot-path image proxy that stays standalone.)
 *
 * images — consolidated dispatcher for admin image-management edge functions
 * (apply-image, backfill-images, find-image-candidates, parse-menu-upload).
 *
 * Routing: POST /functions/v1/images/<name>. Request/response shapes unchanged;
 * only the URL prefix gains `/images`.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";

import applyImage from "../_shared/routes/images/apply-image.ts";
import backfillImages from "../_shared/routes/images/backfill-images.ts";
import findImageCandidates from "../_shared/routes/images/find-image-candidates.ts";
import parseMenuUpload from "../_shared/routes/images/parse-menu-upload.ts";

type Handler = (req: Request) => Response | Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "apply-image": applyImage,
  "backfill-images": backfillImages,
  "find-image-candidates": findImageCandidates,
  "parse-menu-upload": parseMenuUpload,
};

function resolveRoute(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("images");
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
      JSON.stringify({ error: `Unknown images route '${route}'`, available: Object.keys(ROUTES).sort() }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return handler(req);
});
