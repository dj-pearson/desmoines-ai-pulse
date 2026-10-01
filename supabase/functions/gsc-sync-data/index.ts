// ============================================================================
// GSC Sync Data Edge Function
// ============================================================================
// Purpose: Sync keyword and page performance data from Google Search Console
// Returns: Summary of synced data
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

import { errorResponse } from "../_shared/errorResponse.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { checkRateLimitPersistent, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { validateInput } from "../_shared/validation.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Search Console retains 16 months (~486 days). The widest backfill pass ever
// sent was 480, so 540 rejects nothing a real caller has used.
const MAX_DATE_RANGE_DAYS = 540;

serve(async (req) => {
  // SEO-050: shared, environment-aware CORS instead of a hardcoded "*". The
  // only browser caller is the admin dashboard on the site origin; pg_cron
  // sends no Origin header and is unaffected.
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  // Each call makes two Search Console API requests and up to ~50 upsert
  // batches. 20 per 15 minutes is far above what an admin clicking "sync"
  // does; the daily cron presents the service-role key and is exempt.
  const rateLimit = await checkRateLimitPersistent(req, {
    max: 20,
    endpoint: "gsc-sync-data",
    exemptInternal: true,
    message: "Too many sync requests. Please try again later.",
  });
  if (!rateLimit.success && rateLimit.response) {
    return addRateLimitHeaders(rateLimit.response, rateLimit);
  }

  // Runs as service_role and had no caller check. verify_jwt is not a gate:
  // it defaults to true, and true only means "a valid Supabase JWT" - which
  // the publishable anon key is, in every client bundle.
  //
  // Every caller is admin-gated already: SearchTrafficDashboard, mounted at
  // /admin/analytics-dashboard behind <ProtectedRoute requireAdmin>, and the
  // gsc-sync-daily pg_cron job (20260831000001), which sends the service-role
  // key. The admin JWT that functions.invoke sends, or that key, is what
  // requireAdminOrApiKey checks.
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  let propertyId: string | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // A body that is not JSON used to throw out of req.json() into the 500
    // handler. It is a caller error, so it is a 400 now.
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Request body must be JSON with propertyId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = validateInput(body ?? {}, {
      propertyId: { type: "string", required: true, pattern: UUID_PATTERN },
      dateRange: { type: "number", min: 1, max: MAX_DATE_RANGE_DAYS, default: 28 },
    });
    if (!validation.success) {
      // Same status and same `error` key the old "propertyId is required"
      // branch returned; `details` is new and additive.
      return new Response(
        JSON.stringify({
          error: Object.values(validation.errors ?? {})[0] ?? "Invalid request",
          details: validation.errors,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    propertyId = validation.data!.propertyId as string;
    const dateRange = Math.round(validation.data!.dateRange as number);

    console.log(`Syncing GSC data for property: ${propertyId}`);
    const startTime = Date.now();

    // Get property and credential
    const { data: property, error: propertyError } = await supabase
      .from("gsc_properties")
      .select("*, gsc_oauth_credentials(*)")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      return new Response(
        JSON.stringify({ error: "Property not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // SEO-050: a sync that cannot authenticate used to return 401 and leave
    // the property reading status 'active', so the admin panel had no way to
    // say "not connected". status is CHECKed to active/paused/error, so this
    // uses 'error' with a message that says reconnecting is the fix.
    const markDisconnected = async (reason: string) => {
      const now = new Date().toISOString();
      const { error: markError } = await supabase
        .from("gsc_properties")
        .update({ status: "error", error_message: reason, is_syncing: false, updated_at: now })
        .eq("id", propertyId);
      if (markError) console.error("Could not record disconnected state:", markError.message);
    };

    const credential = property.gsc_oauth_credentials;
    if (!credential || !credential.is_active) {
      await markDisconnected("No active Search Console credential is linked to this property. Reconnect through OAuth.");
      return new Response(
        JSON.stringify({ error: "No active credential for this property" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Auto-refresh token if expired
    if (new Date(credential.expires_at) <= new Date()) {
      console.log("Access token expired — attempting refresh...");

      if (!credential.refresh_token) {
        await markDisconnected("Access token expired and the credential has no refresh token. Reconnect through OAuth.");
        return new Response(
          JSON.stringify({
            error: "Access token expired and no refresh token available. Please reconnect.",
            requiresRefresh: true,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

      const refreshResponse = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: googleClientId!,
          client_secret: googleClientSecret!,
          refresh_token: credential.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshResponse.ok) {
        const refreshError = await refreshResponse.text();
        console.error("Token refresh failed:", refreshError);
        // invalid_grant is Google saying the refresh token is revoked or
        // lapsed: only a person at the consent screen can fix that. Anything
        // else (5xx, timeout) may clear on tomorrow's run.
        const revoked = refreshError.includes("invalid_grant");
        // A revoked grant also deactivates the credential, matching what
        // gsc-oauth?action=refresh does. is_active=false is what the admin
        // panel reads as "not connected".
        const { error: credErr } = await supabase
          .from("gsc_oauth_credentials")
          .update({
            ...(revoked ? { is_active: false } : {}),
            error_count: (credential.error_count || 0) + 1,
            last_error: `Token refresh failed (HTTP ${refreshResponse.status})${revoked ? ": invalid_grant" : ""}`,
            last_error_at: new Date().toISOString(),
          })
          .eq("id", credential.id);
        if (credErr) console.error("Could not record refresh failure on credential:", credErr.message);
        if (revoked) {
          await markDisconnected("Google rejected the refresh token (invalid_grant). Reconnect through OAuth.");
        } else {
          const { error: propErr } = await supabase
            .from("gsc_properties")
            .update({
              status: "error",
              error_message: `Token refresh failed (HTTP ${refreshResponse.status}); will retry on the next run.`,
              is_syncing: false,
            })
            .eq("id", propertyId);
          if (propErr) console.error("Could not record refresh failure on property:", propErr.message);
        }
        return new Response(
          JSON.stringify({
            error: "Token refresh failed — please reconnect Google Search Console.",
            details: refreshError,
            requiresRefresh: true,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const refreshData = await refreshResponse.json();
      const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000);

      // Persist refreshed token. A failed write is survivable for this run
      // (the token is in memory) but means every run refreshes again, so it
      // is logged rather than ignored.
      const { error: persistError } = await supabase
        .from("gsc_oauth_credentials")
        .update({
          access_token: refreshData.access_token,
          expires_at: newExpiresAt.toISOString(),
          last_refreshed_at: new Date().toISOString(),
        })
        .eq("id", credential.id);
      if (persistError) console.error("Could not persist refreshed token:", persistError.message);

      credential.access_token = refreshData.access_token;
      console.log("Token refreshed successfully, new expiry:", newExpiresAt.toISOString());
    }

    // Calculate date range
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 3); // GSC data has 3-day lag
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - dateRange);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    console.log(`Syncing data from ${startDateStr} to ${endDateStr}`);

    // Mark property as syncing
    await supabase
      .from("gsc_properties")
      .update({ is_syncing: true })
      .eq("id", propertyId);

    // ========================================================================
    // Sync keyword performance data
    // ========================================================================
    console.log("Fetching keyword performance...");

    // Use ["query", "date"] only — adding "page" creates an explosion of rows
    // (same keyword × many pages × many dates) that causes timeouts.
    //
    // rowLimit was 1000 with a comment calling that "sufficient for analytics".
    // It is not, and the number said so: on 2026-08-31 six passes were run
    // against production over windows of 28, 56, 90, 180, 365 and 480 days, and
    // every single one returned keywordsSynced exactly 1000. A result that lands
    // precisely on the limit six times is the limit, not the data. Google
    // returns rows ordered by clicks descending, so the truncation was silently
    // discarding the long tail — which is the half of the report that SEO work
    // is chosen from. 25000 is the API's own maximum; the page query has always
    // used it, and its widest pass returned 15,239 rows, so the whole property
    // fits inside one request with room left.
    const keywordResponse = await fetchWithTimeout(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        property.property_url
      )}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startDateStr,
          endDate: endDateStr,
          dimensions: ["query", "date"],
          rowLimit: 25000,
        }),
      }
    );

    if (!keywordResponse.ok) {
      const error = await keywordResponse.text();
      throw new Error(`GSC API error: ${error}`);
    }

    const keywordData = await keywordResponse.json();
    const keywordRows = keywordData.rows || [];

    console.log(`Processing ${keywordRows.length} keyword records...`);

    let keywordsSynced = 0;
    let batchErrors = 0;
    const BATCH_SIZE = 500;

    // Build records array
    const keywordRecords = keywordRows.map((row: any) => ({
      property_id: propertyId,
      query: row.keys[0],
      page_url: null,
      date: row.keys[1],
      impressions: row.impressions || 0,
      clicks: row.clicks || 0,
      ctr: row.ctr ? Math.round(row.ctr * 10000) / 100 : 0,
      position: row.position ? Math.round(row.position * 100) / 100 : null,
      country: "USA",
    }));

    // Batch upserts — dramatically faster than one-at-a-time
    for (let i = 0; i < keywordRecords.length; i += BATCH_SIZE) {
      const batch = keywordRecords.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from("gsc_keyword_performance")
        .upsert(batch, {
          onConflict: "property_id,query,date,country",
          ignoreDuplicates: false,
        });

      if (!upsertError) {
        keywordsSynced += batch.length;
      } else {
        batchErrors++;
        console.error(`Keyword batch ${i / BATCH_SIZE + 1} error:`, upsertError.message);
      }
    }

    // ========================================================================
    // Sync page performance data
    // ========================================================================
    console.log("Fetching page performance...");

    const pageResponse = await fetchWithTimeout(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        property.property_url
      )}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startDateStr,
          endDate: endDateStr,
          dimensions: ["page", "date", "device"],
          rowLimit: 25000,
        }),
      }
    );

    if (!pageResponse.ok) {
      const error = await pageResponse.text();
      throw new Error(`GSC API error (pages): ${error}`);
    }

    const pageData = await pageResponse.json();
    const pageRows = pageData.rows || [];

    console.log(`Processing ${pageRows.length} page records...`);

    let pagesSynced = 0;

    // Group by page and date
    const pagesByPageAndDate = new Map();

    for (const row of pageRows) {
      const pageUrl = row.keys[0];
      const date = row.keys[1];
      const device = row.keys[2]; // MOBILE, DESKTOP, TABLET
      const key = `${pageUrl}|${date}`;

      if (!pagesByPageAndDate.has(key)) {
        pagesByPageAndDate.set(key, {
          pageUrl,
          date,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          position: 0,
          impressionsMobile: 0,
          impressionsDesktop: 0,
          impressionsTablet: 0,
          clicksMobile: 0,
          clicksDesktop: 0,
          clicksTablet: 0,
          count: 0,
        });
      }

      const entry = pagesByPageAndDate.get(key);
      entry.impressions += row.impressions || 0;
      entry.clicks += row.clicks || 0;
      entry.position += row.position || 0;
      entry.count++;

      if (device === "MOBILE") {
        entry.impressionsMobile += row.impressions || 0;
        entry.clicksMobile += row.clicks || 0;
      } else if (device === "DESKTOP") {
        entry.impressionsDesktop += row.impressions || 0;
        entry.clicksDesktop += row.clicks || 0;
      } else if (device === "TABLET") {
        entry.impressionsTablet += row.impressions || 0;
        entry.clicksTablet += row.clicks || 0;
      }
    }

    // Build aggregated page records and batch upsert
    const pageRecords = Array.from(pagesByPageAndDate.values()).map((entry: any) => {
      const avgPosition = entry.count > 0 ? entry.position / entry.count : 0;
      const ctr = entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0;
      return {
        property_id: propertyId,
        page_url: entry.pageUrl,
        date: entry.date,
        impressions: entry.impressions,
        clicks: entry.clicks,
        ctr: Math.round(ctr * 100) / 100,
        position: Math.round(avgPosition * 100) / 100,
        impressions_mobile: entry.impressionsMobile,
        impressions_desktop: entry.impressionsDesktop,
        impressions_tablet: entry.impressionsTablet,
        clicks_mobile: entry.clicksMobile,
        clicks_desktop: entry.clicksDesktop,
        clicks_tablet: entry.clicksTablet,
        country: "USA",
      };
    });

    for (let i = 0; i < pageRecords.length; i += BATCH_SIZE) {
      const batch = pageRecords.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from("gsc_page_performance")
        .upsert(batch, {
          onConflict: "property_id,page_url,date,country",
          ignoreDuplicates: false,
        });

      if (!upsertError) {
        pagesSynced += batch.length;
      } else {
        batchErrors++;
        console.error(`Page batch ${i / BATCH_SIZE + 1} error:`, upsertError.message);
      }
    }

    // ========================================================================
    // Update property with sync status
    // ========================================================================
    const executionTime = Date.now() - startTime;
    const finishedAt = new Date().toISOString();

    // error_message used to survive a successful run forever, so a property
    // that failed once in March still carried the March error. A clean run
    // clears it; a run with failed batches says how many.
    const { error: finalUpdateError } = await supabase
      .from("gsc_properties")
      .update({
        is_syncing: false,
        last_sync_at: finishedAt,
        status: "active",
        error_message: batchErrors > 0
          ? `${batchErrors} upsert batch(es) failed on the last run; see gsc-sync-data logs.`
          : null,
        updated_at: finishedAt,
      })
      .eq("id", propertyId);
    if (finalUpdateError) console.error("Could not record sync completion:", finalUpdateError.message);

    // The refresh-token idle clock runs from last use. Nothing wrote
    // last_used_at on this path, so the column still read 2026-03-31 while
    // the daily job was using the grant every morning.
    const { error: usedError } = await supabase
      .from("gsc_oauth_credentials")
      .update({ last_used_at: finishedAt })
      .eq("id", credential.id);
    if (usedError) console.error("Could not record credential use:", usedError.message);

    console.log(
      `Sync completed: ${keywordsSynced} keywords, ${pagesSynced} pages in ${executionTime}ms`
    );

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          keywordsSynced,
          pagesSynced,
          batchErrors,
          dateRange: {
            start: startDateStr,
            end: endDateStr,
            days: dateRange,
          },
          executionTime,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in gsc-sync-data function:", error);

    // Update property sync status on error (use already-parsed propertyId from outer scope)
    if (propertyId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase
          .from("gsc_properties")
          .update({
            is_syncing: false,
            status: "error",
            error_message: error.message,
          })
          .eq("id", propertyId);
      } catch { /* best-effort cleanup */ }
    }

    return errorResponse(error, {
      status: 500,
      headers: corsHeaders,
      logContext: "gsc-sync-data",
    });
  }
});
