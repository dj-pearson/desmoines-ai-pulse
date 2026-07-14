/**
 * SECURITY: verify_jwt = false
 * Reason: consolidated dispatcher; every hosted handler self-authenticates via
 *   requireAdminOrApiKey / requireApiKey exactly as it did standalone, or is a
 *   deliberately public telemetry endpoint (log-error, log-content-metrics) that
 *   already ran verify_jwt=false. The gateway JWT check stays off so cron
 *   (service-role bearer), admin UI (admin JWT), API-key, and public-telemetry
 *   callers all reach the same in-function behavior they had before.
 *
 * maintenance — consolidated dispatcher for scheduled/admin maintenance,
 * housekeeping, audit and telemetry edge functions.
 *
 * Collapses several functions into one deployed function to stay under the
 * Supabase edge-function cap. Each former function's body now lives in
 * `_shared/routes/maintenance/<name>.ts` and exports its handler; this file
 * holds the one router.
 *
 * Routing: POST /functions/v1/maintenance/<name>. The request (headers + body)
 * is passed through untouched. Request/response shapes are unchanged; only the
 * URL prefix gains `/maintenance`.
 */
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";

import cleanupOldEvents from "../_shared/routes/maintenance/cleanup-old-events.ts";
import regenerateSitemaps from "../_shared/routes/maintenance/regenerate-sitemaps.ts";
import dataQualityHeal from "../_shared/routes/maintenance/data-quality-heal.ts";
import jobHealthWatchdog from "../_shared/routes/maintenance/job-health-watchdog.ts";
import updateEventDatetime from "../_shared/routes/maintenance/update-event-datetime.ts";
import webVitalsWeekly from "../_shared/routes/maintenance/web-vitals-weekly.ts";
import runScheduledAudit from "../_shared/routes/maintenance/run-scheduled-audit.ts";
import seoAudit from "../_shared/routes/maintenance/seo-audit.ts";
import logContentMetrics from "../_shared/routes/maintenance/log-content-metrics.ts";
import logError from "../_shared/routes/maintenance/log-error.ts";

type Handler = (req: Request) => Response | Promise<Response>;

const ROUTES: Record<string, Handler> = {
  "cleanup-old-events": cleanupOldEvents,
  "regenerate-sitemaps": regenerateSitemaps,
  "data-quality-heal": dataQualityHeal,
  "job-health-watchdog": jobHealthWatchdog,
  "update-event-datetime": updateEventDatetime,
  "web-vitals-weekly": webVitalsWeekly,
  "run-scheduled-audit": runScheduledAudit,
  "seo-audit": seoAudit,
  "log-content-metrics": logContentMetrics,
  "log-error": logError,
};

function resolveRoute(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("maintenance");
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
      JSON.stringify({ error: `Unknown maintenance route '${route}'`, available: Object.keys(ROUTES).sort() }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return handler(req);
});
