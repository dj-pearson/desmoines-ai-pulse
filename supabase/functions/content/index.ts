/**
 * SECURITY: verify_jwt = false
 * Reason: consolidated dispatcher. Self-authenticating handlers keep their
 *   in-function auth (requireAdminOrApiKey / requireApiKey / getUser). The
 *   handlers that carried no in-handler auth and relied on the gateway are
 *   listed in GATEWAY_AUTH and gated here with requireAdminOrApiKey — every one
 *   is admin- or cron-triggered (admin JWT, API key, or service-role bearer all
 *   pass), so none is opened up by dropping the gateway check.
 *
 * content — consolidated dispatcher for AI content generation / analysis /
 * enhancement edge functions.
 *
 * Routing: POST /functions/v1/content/<name>. The request (headers + body) is
 * passed through untouched. Request/response shapes are unchanged; only the URL
 * prefix gains `/content`.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";

import aiArticlePipeline from "../_shared/routes/content/ai-article-pipeline.ts";
import analyzeCompetitor from "../_shared/routes/content/analyze-competitor.ts";
import analyzeContent from "../_shared/routes/content/analyze-content.ts";
import analyzeImages from "../_shared/routes/content/analyze-images.ts";
import batchEnhanceEvents from "../_shared/routes/content/batch-enhance-events.ts";
import bulkEnhanceEvents from "../_shared/routes/content/bulk-enhance-events.ts";
import bulkUpdateRestaurants from "../_shared/routes/content/bulk-update-restaurants.ts";
import campaignCreativeReview from "../_shared/routes/content/campaign-creative-review.ts";
import enhanceContent from "../_shared/routes/content/enhance-content.ts";
import generateArticle from "../_shared/routes/content/generate-article.ts";
import generateHotelAffiliateUrls from "../_shared/routes/content/generate-hotel-affiliate-urls.ts";
import generateProposal from "../_shared/routes/content/generate-proposal.ts";
import generatePseoPage from "../_shared/routes/content/generate-pseo-page.ts";
import generateSeoContent from "../_shared/routes/content/generate-seo-content.ts";
import generateWeekendGuide from "../_shared/routes/content/generate-weekend-guide.ts";
import moderateContent from "../_shared/routes/content/moderate-content.ts";
import pseoBatchWorker from "../_shared/routes/content/pseo-batch-worker.ts";
import suggestArticleTopics from "../_shared/routes/content/suggest-article-topics.ts";

type Handler = (req: Request) => Response | Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "ai-article-pipeline": aiArticlePipeline,
  "analyze-competitor": analyzeCompetitor,
  "analyze-content": analyzeContent,
  "analyze-images": analyzeImages,
  "batch-enhance-events": batchEnhanceEvents,
  "bulk-enhance-events": bulkEnhanceEvents,
  "bulk-update-restaurants": bulkUpdateRestaurants,
  "campaign-creative-review": campaignCreativeReview,
  "enhance-content": enhanceContent,
  "generate-article": generateArticle,
  "generate-hotel-affiliate-urls": generateHotelAffiliateUrls,
  "generate-proposal": generateProposal,
  "generate-pseo-page": generatePseoPage,
  "generate-seo-content": generateSeoContent,
  "generate-weekend-guide": generateWeekendGuide,
  "moderate-content": moderateContent,
  "pseo-batch-worker": pseoBatchWorker,
  "suggest-article-topics": suggestArticleTopics,
};

// Routes whose original standalone functions relied on the gateway's
// verify_jwt=true and carry no in-handler auth. All are admin- or cron-only.
const GATEWAY_AUTH = new Set<string>([
  "analyze-content",
  "analyze-images",
  "batch-enhance-events",
  "enhance-content",
  "generate-hotel-affiliate-urls",
  "generate-pseo-page",
  "generate-weekend-guide",
  "pseo-batch-worker",
]);

function resolveRoute(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("content");
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
      JSON.stringify({ error: `Unknown content route '${route}'`, available: Object.keys(ROUTES).sort() }),
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
