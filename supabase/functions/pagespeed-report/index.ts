// ============================================================================
// PageSpeed Insights Full Report Edge Function
// ============================================================================
// Purpose: Fetch a comprehensive PageSpeed Insights report across all categories
//          (Performance, Accessibility, Best Practices, SEO) and return structured JSON
// Requires: PAGESPEED_INSIGHTS_API_KEY environment variable
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PageSpeedRequest {
  url?: string;
  strategy?: "mobile" | "desktop";
  categories?: string[];
}

interface AuditResult {
  id: string;
  title: string;
  description: string;
  score: number | null;
  scoreDisplayMode: string;
  displayValue?: string;
  numericValue?: number;
  numericUnit?: string;
  details?: {
    type: string;
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
    items?: Array<Record<string, unknown>>;
  };
}

interface CategoryResult {
  score: number;
  audits: {
    passed: AuditResult[];
    failed: AuditResult[];
    manual: AuditResult[];
    informative: AuditResult[];
  };
}

function classifyAudit(audit: Record<string, unknown>): AuditResult {
  return {
    id: audit.id as string,
    title: audit.title as string,
    description: (audit.description as string || "").replace(/\[.*?\]\(.*?\)/g, "").trim(),
    score: audit.score as number | null,
    scoreDisplayMode: audit.scoreDisplayMode as string,
    displayValue: audit.displayValue as string | undefined,
    numericValue: audit.numericValue as number | undefined,
    numericUnit: audit.numericUnit as string | undefined,
    details: audit.details
      ? {
          type: (audit.details as Record<string, unknown>).type as string,
          overallSavingsMs: (audit.details as Record<string, unknown>).overallSavingsMs as number | undefined,
          overallSavingsBytes: (audit.details as Record<string, unknown>).overallSavingsBytes as number | undefined,
          items: ((audit.details as Record<string, unknown>).items as Array<Record<string, unknown>> | undefined)?.slice(0, 10),
        }
      : undefined,
  };
}

function processCategory(
  categoryData: Record<string, unknown>,
  allAudits: Record<string, Record<string, unknown>>
): CategoryResult {
  const auditRefs = (categoryData.auditRefs as Array<Record<string, unknown>>) || [];
  const passed: AuditResult[] = [];
  const failed: AuditResult[] = [];
  const manual: AuditResult[] = [];
  const informative: AuditResult[] = [];

  for (const ref of auditRefs) {
    const auditId = ref.id as string;
    const audit = allAudits[auditId];
    if (!audit) continue;

    const classified = classifyAudit(audit);
    const scoreMode = audit.scoreDisplayMode as string;

    if (scoreMode === "manual") {
      manual.push(classified);
    } else if (scoreMode === "informative" || scoreMode === "notApplicable") {
      informative.push(classified);
    } else if (audit.score === null || (audit.score as number) >= 0.9) {
      passed.push(classified);
    } else {
      failed.push(classified);
    }
  }

  // Sort failed by score ascending (worst first)
  failed.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  return {
    score: Math.round(((categoryData.score as number) || 0) * 100),
    audits: { passed, failed, manual, informative },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const pagespeedApiKey = Deno.env.get("PAGESPEED_INSIGHTS_API_KEY");
    if (!pagespeedApiKey) {
      return new Response(
        JSON.stringify({ error: "PAGESPEED_INSIGHTS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: PageSpeedRequest = req.method === "POST" ? await req.json() : {};
    const url = body.url || "https://desmoinesinsider.com";
    const strategy = body.strategy || "mobile";
    const categories = body.categories || ["performance", "accessibility", "best-practices", "seo"];

    // Build API URL
    const apiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    apiUrl.searchParams.append("url", url);
    apiUrl.searchParams.append("key", pagespeedApiKey);
    apiUrl.searchParams.append("strategy", strategy);
    for (const cat of categories) {
      apiUrl.searchParams.append("category", cat);
    }

    console.log(`Fetching PageSpeed report for ${url} (${strategy})...`);
    const startTime = Date.now();

    const response = await fetch(apiUrl.toString());
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PageSpeed API error ${response.status}: ${errorText.slice(0, 500)}`);
    }

    const data = await response.json();
    const lr = data.lighthouseResult;
    const audits = lr.audits as Record<string, Record<string, unknown>>;

    // Process each category
    const categoryResults: Record<string, CategoryResult> = {};
    for (const [catId, catData] of Object.entries(lr.categories || {})) {
      categoryResults[catId] = processCategory(
        catData as Record<string, unknown>,
        audits
      );
    }

    // Extract Core Web Vitals
    const cwv = {
      lcp: {
        value: (audits["largest-contentful-paint"]?.numericValue as number) || null,
        score: Math.round(((audits["largest-contentful-paint"]?.score as number) || 0) * 100),
        displayValue: audits["largest-contentful-paint"]?.displayValue || null,
      },
      fcp: {
        value: (audits["first-contentful-paint"]?.numericValue as number) || null,
        score: Math.round(((audits["first-contentful-paint"]?.score as number) || 0) * 100),
        displayValue: audits["first-contentful-paint"]?.displayValue || null,
      },
      tbt: {
        value: (audits["total-blocking-time"]?.numericValue as number) || null,
        score: Math.round(((audits["total-blocking-time"]?.score as number) || 0) * 100),
        displayValue: audits["total-blocking-time"]?.displayValue || null,
      },
      cls: {
        value: (audits["cumulative-layout-shift"]?.numericValue as number) || null,
        score: Math.round(((audits["cumulative-layout-shift"]?.score as number) || 0) * 100),
        displayValue: audits["cumulative-layout-shift"]?.displayValue || null,
      },
      si: {
        value: (audits["speed-index"]?.numericValue as number) || null,
        score: Math.round(((audits["speed-index"]?.score as number) || 0) * 100),
        displayValue: audits["speed-index"]?.displayValue || null,
      },
    };

    // Extract field data if available
    const fieldData = data.loadingExperience?.metrics
      ? {
          lcp: data.loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile || null,
          inp: data.loadingExperience.metrics.INTERACTION_TO_NEXT_PAINT?.percentile || null,
          cls: data.loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE
            ? data.loadingExperience.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100
            : null,
          fcp: data.loadingExperience.metrics.FIRST_CONTENTFUL_PAINT_MS?.percentile || null,
          ttfb: data.loadingExperience.metrics.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile || null,
          overall: data.loadingExperience.overall_category || null,
        }
      : null;

    // Top opportunities (sorted by savings)
    const opportunities = Object.values(audits)
      .filter(
        (a) =>
          (a.details as Record<string, unknown>)?.overallSavingsMs &&
          ((a.details as Record<string, unknown>).overallSavingsMs as number) > 0
      )
      .map((a) => ({
        id: a.id,
        title: a.title,
        savingsMs: (a.details as Record<string, unknown>).overallSavingsMs,
        savingsBytes: (a.details as Record<string, unknown>).overallSavingsBytes || 0,
        displayValue: a.displayValue,
      }))
      .sort((a, b) => (b.savingsMs as number) - (a.savingsMs as number));

    // Resource summary
    const resourceItems = (audits["resource-summary"]?.details as Record<string, unknown>)?.items as Array<Record<string, unknown>> || [];
    const resources: Record<string, { count: number; size: number }> = {};
    for (const item of resourceItems) {
      resources[item.resourceType as string] = {
        count: item.requestCount as number,
        size: item.transferSize as number,
      };
    }

    const executionTime = Date.now() - startTime;

    const report = {
      url,
      strategy,
      fetchedAt: new Date().toISOString(),
      executionTimeMs: executionTime,
      lighthouseVersion: lr.lighthouseVersion,
      scores: Object.fromEntries(
        Object.entries(categoryResults).map(([k, v]) => [k, v.score])
      ),
      coreWebVitals: cwv,
      fieldData,
      categories: categoryResults,
      topOpportunities: opportunities.slice(0, 10),
      resources,
    };

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("PageSpeed report error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
