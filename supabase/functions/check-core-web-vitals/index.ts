// ============================================================================
// Check Core Web Vitals Edge Function
// ============================================================================
// Purpose: Check Core Web Vitals using Google PageSpeed Insights API
// Returns: LCP, FID, CLS, INP, TTFB, FCP metrics and performance scores
// Requires: PAGESPEED_INSIGHTS_API_KEY environment variable
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CWVRequest {
  url: string;
  device?: "mobile" | "desktop";
  saveResults?: boolean;
}

interface CoreWebVitals {
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
  fcp: number | null;
  performanceScore: number;
  overallAssessment: "good" | "needs_improvement" | "poor";
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const pagespeedApiKey = Deno.env.get("PAGESPEED_INSIGHTS_API_KEY");

    if (!pagespeedApiKey) {
      return new Response(
        JSON.stringify({
          error:
            "PageSpeed Insights API key not configured. Set PAGESPEED_INSIGHTS_API_KEY environment variable.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { url, device = "mobile", saveResults = true }: CWVRequest =
      await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Checking Core Web Vitals for: ${url} (${device})`);
    const startTime = Date.now();

    // Build PageSpeed Insights API URL
    const strategy = device === "desktop" ? "desktop" : "mobile";
    const apiUrl = new URL(
      "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
    );
    apiUrl.searchParams.append("url", url);
    apiUrl.searchParams.append("key", pagespeedApiKey);
    apiUrl.searchParams.append("strategy", strategy);
    apiUrl.searchParams.append("category", "performance");

    // Call PageSpeed Insights API
    console.log("Calling PageSpeed Insights API...");
    const response = await fetch(apiUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `PageSpeed Insights API error: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();

    // Extract metrics from PageSpeed Insights response
    const lighthouseResult = data.lighthouseResult;
    const audits = lighthouseResult.audits;
    const loadingExperience = data.loadingExperience;

    // Core Web Vitals from field data (if available)
    let fieldLCP = null;
    let fieldFID = null;
    let fieldCLS = null;
    let fieldINP = null;

    if (loadingExperience && loadingExperience.metrics) {
      const metrics = loadingExperience.metrics;

      if (metrics.LARGEST_CONTENTFUL_PAINT_MS) {
        fieldLCP = metrics.LARGEST_CONTENTFUL_PAINT_MS.percentile;
      }
      if (metrics.FIRST_INPUT_DELAY_MS) {
        fieldFID = metrics.FIRST_INPUT_DELAY_MS.percentile;
      }
      if (metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE) {
        fieldCLS =
          metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100; // Convert to decimal
      }
      if (metrics.INTERACTION_TO_NEXT_PAINT) {
        fieldINP = metrics.INTERACTION_TO_NEXT_PAINT.percentile;
      }
    }

    // Core Web Vitals from lab data
    const labLCP = audits["largest-contentful-paint"]?.numericValue || null;
    const labFID = audits["max-potential-fid"]?.numericValue || null; // FID replacement in lab
    const labCLS =
      audits["cumulative-layout-shift"]?.numericValue || null;
    const labTTFB =
      audits["server-response-time"]?.numericValue || null;
    const labFCP = audits["first-contentful-paint"]?.numericValue || null;

    // Use field data if available, otherwise lab data
    const cwv: CoreWebVitals = {
      lcp: fieldLCP || labLCP,
      fid: fieldFID || labFID,
      cls: fieldCLS !== null ? fieldCLS : labCLS,
      inp: fieldINP || null,
      ttfb: labTTFB,
      fcp: labFCP,
      performanceScore: lighthouseResult.categories.performance.score * 100,
      overallAssessment: "good",
    };

    // Determine overall assessment based on Google's thresholds
    let goodCount = 0;
    let poorCount = 0;

    // LCP: good < 2.5s, poor > 4s
    if (cwv.lcp !== null) {
      if (cwv.lcp < 2500) goodCount++;
      else if (cwv.lcp > 4000) poorCount++;
    }

    // FID/INP: good < 100ms (FID) or 200ms (INP), poor > 300ms (FID) or 500ms (INP)
    if (cwv.inp !== null) {
      if (cwv.inp < 200) goodCount++;
      else if (cwv.inp > 500) poorCount++;
    } else if (cwv.fid !== null) {
      if (cwv.fid < 100) goodCount++;
      else if (cwv.fid > 300) poorCount++;
    }

    // CLS: good < 0.1, poor > 0.25
    if (cwv.cls !== null) {
      if (cwv.cls < 0.1) goodCount++;
      else if (cwv.cls > 0.25) poorCount++;
    }

    // Determine overall assessment
    if (poorCount > 0) {
      cwv.overallAssessment = "poor";
    } else if (goodCount >= 2) {
      cwv.overallAssessment = "good";
    } else {
      cwv.overallAssessment = "needs_improvement";
    }

    // Extract additional performance metrics
    const speedIndex = audits["speed-index"]?.numericValue || null;
    const timeToInteractive =
      audits["interactive"]?.numericValue || null;
    const totalBlockingTime =
      audits["total-blocking-time"]?.numericValue || null;

    // Extract page weight metrics
    const resourceSummary =
      audits["resource-summary"]?.details?.items || [];
    let pageSizeBytes = 0;
    let htmlSizeBytes = 0;
    let cssSizeBytes = 0;
    let jsSizeBytes = 0;
    let imageSizeBytes = 0;
    let fontSizeBytes = 0;
    let otherSizeBytes = 0;

    let totalRequests = 0;
    let htmlRequests = 0;
    let cssRequests = 0;
    let jsRequests = 0;
    let imageRequests = 0;
    let fontRequests = 0;

    for (const item of resourceSummary) {
      const resourceType = item.resourceType;
      const transferSize = item.transferSize || 0;
      const requestCount = item.requestCount || 0;

      totalRequests += requestCount;
      pageSizeBytes += transferSize;

      switch (resourceType) {
        case "document":
          htmlSizeBytes += transferSize;
          htmlRequests += requestCount;
          break;
        case "stylesheet":
          cssSizeBytes += transferSize;
          cssRequests += requestCount;
          break;
        case "script":
          jsSizeBytes += transferSize;
          jsRequests += requestCount;
          break;
        case "image":
          imageSizeBytes += transferSize;
          imageRequests += requestCount;
          break;
        case "font":
          fontSizeBytes += transferSize;
          fontRequests += requestCount;
          break;
        default:
          otherSizeBytes += transferSize;
      }
    }

    // Extract opportunities (optimization recommendations)
    const opportunities: any[] = [];
    const opportunityAudits = [
      "render-blocking-resources",
      "unused-css-rules",
      "unused-javascript",
      "modern-image-formats",
      "offscreen-images",
      "unminified-css",
      "unminified-javascript",
      "efficient-animated-content",
      "duplicated-javascript",
    ];

    for (const auditKey of opportunityAudits) {
      const audit = audits[auditKey];
      if (audit && audit.details && audit.details.overallSavingsMs > 0) {
        opportunities.push({
          type: auditKey,
          savings_ms: audit.details.overallSavingsMs || 0,
          savings_bytes: audit.details.overallSavingsBytes || 0,
          description: audit.description,
        });
      }
    }

    // Extract diagnostics
    const diagnostics: any[] = [];
    const diagnosticAudits = [
      "mainthread-work-breakdown",
      "bootup-time",
      "uses-long-cache-ttl",
      "total-byte-weight",
      "dom-size",
    ];

    for (const auditKey of diagnosticAudits) {
      const audit = audits[auditKey];
      if (audit && audit.score !== null && audit.score < 0.9) {
        diagnostics.push({
          type: auditKey,
          severity: audit.score < 0.5 ? "high" : "medium",
          description: audit.description,
          score: audit.score,
        });
      }
    }

    // Calculate individual scores
    const lcpScore = audits["largest-contentful-paint"]?.score * 100 || 0;
    const fidScore = audits["max-potential-fid"]?.score * 100 || 0;
    const clsScore =
      audits["cumulative-layout-shift"]?.score * 100 || 0;

    // Save results to database
    const executionTime = Date.now() - startTime;

    if (saveResults) {
      const { error: insertError } = await supabase
        .from("seo_core_web_vitals")
        .insert({
          url,
          device,
          lcp: cwv.lcp,
          fid: cwv.fid,
          cls: cwv.cls,
          inp: cwv.inp,
          ttfb: cwv.ttfb,
          fcp: cwv.fcp,
          performance_score: Math.round(cwv.performanceScore),
          lcp_score: Math.round(lcpScore),
          fid_score: Math.round(fidScore),
          cls_score: Math.round(clsScore),
          overall_assessment: cwv.overallAssessment,
          data_source: fieldLCP ? "field" : "lab",
          speed_index: speedIndex,
          time_to_interactive: timeToInteractive,
          total_blocking_time: totalBlockingTime,
          page_size_bytes: pageSizeBytes,
          html_size_bytes: htmlSizeBytes,
          css_size_bytes: cssSizeBytes,
          js_size_bytes: jsSizeBytes,
          image_size_bytes: imageSizeBytes,
          font_size_bytes: fontSizeBytes,
          other_size_bytes: otherSizeBytes,
          total_requests: totalRequests,
          html_requests: htmlRequests,
          css_requests: cssRequests,
          js_requests: jsRequests,
          image_requests: imageRequests,
          font_requests: fontRequests,
          opportunities,
          diagnostics,
          pagespeed_api_response: data,
          api_version: "v5",
          lighthouse_version: lighthouseResult.lighthouseVersion,
        });

      if (insertError) {
        console.error("Error saving Core Web Vitals results:", insertError);
      } else {
        console.log("Core Web Vitals results saved to database");
      }
    }

    console.log(
      `Core Web Vitals check completed in ${executionTime}ms. Assessment: ${cwv.overallAssessment}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        coreWebVitals: cwv,
        additionalMetrics: {
          speedIndex,
          timeToInteractive,
          totalBlockingTime,
        },
        pageWeight: {
          total: pageSizeBytes,
          html: htmlSizeBytes,
          css: cssSizeBytes,
          js: jsSizeBytes,
          images: imageSizeBytes,
          fonts: fontSizeBytes,
        },
        requests: {
          total: totalRequests,
          html: htmlRequests,
          css: cssRequests,
          js: jsRequests,
          images: imageRequests,
          fonts: fontRequests,
        },
        opportunities,
        diagnostics,
        executionTime,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in check-core-web-vitals function:", error);

    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
