/**
 * SECURITY: verify_jwt = false
 * Reason: Background job triggered by GitHub Actions CI/CD pipeline, which cannot provide Supabase JWT tokens
 * Alternative measures: Service role key required for database writes, scraping job configuration validated before execution
 * Risk level: MEDIUM
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { isHubOwned } from "../_shared/eventSourceProfiles.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAIConfig, buildClaudeRequest, getClaudeHeaders, getAnthropicApiKey } from "../_shared/aiConfig.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { acceptedJobStatuses, JOB_STATUS_IDLE } from "../_shared/scrapingJobStatus.ts";
import { runJob } from "../_shared/jobRunner.ts";
import type { SourceCounts } from "../_shared/ingestionHealth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trigger-source, x-endpoint",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

interface ScrapingJob {
  id: string;
  name: string;
  status: string;
  config: {
    url: string;
    selectors: {
      title: string;
      description: string;
      date: string;
      location: string;
      price?: string;
      category?: string;
    };
    schedule: string;
    isActive: boolean;
  };
  last_run?: string;
  events_found?: number;
}

// Check if we should skip scraping a job based on recent scraping history
function shouldSkipJobScraping(
  job: ScrapingJob,
  isAdminDashboard = false
): {
  skip: boolean;
  reason?: string;
} {
  // If triggered from admin dashboard, allow more frequent scraping
  if (isAdminDashboard) {
    if (!job.last_run) {
      return { skip: false }; // Never scraped before
    }

    const lastRun = new Date(job.last_run);
    const now = new Date();
    const minutesSinceLastRun =
      (now.getTime() - lastRun.getTime()) / (1000 * 60);

    // For admin dashboard, only skip if scraped within last 30 seconds
    if (minutesSinceLastRun < 0.5) {
      return {
        skip: true,
        reason: `Too recent - last scraped ${minutesSinceLastRun.toFixed(
          1
        )} minutes ago`,
      };
    }

    return { skip: false };
  }

  if (!job.last_run) {
    return { skip: false }; // Never scraped before
  }

  const lastRun = new Date(job.last_run);
  const now = new Date();
  const hoursSinceLastRun =
    (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

  // Skip if scraped within last 15 minutes and found events (reduced from 2 hours)
  if (hoursSinceLastRun < 0.25 && (job.events_found || 0) > 0) {
    return {
      skip: true,
      reason: `Recently scraped ${hoursSinceLastRun.toFixed(1)}h ago with ${
        job.events_found
      } events found`,
    };
  }

  // Skip if scraped within last 5 minutes regardless of results (reduced from 30 minutes)
  if (hoursSinceLastRun < 0.083) {
    return {
      skip: true,
      reason: `Too recent - last scraped ${(hoursSinceLastRun * 60).toFixed(
        0
      )} minutes ago`,
    };
  }

  return { skip: false };
}

// Simple HTML parser for extracting text content from HTML strings
async function scrapeJobWithFirecrawl(
  job: ScrapingJob,
  supabase: any
): Promise<{ success: boolean; eventsFound: number; errors: string[]; counts: SourceCounts; unchanged?: boolean }> {
  // WEB-BE-043. `eventsFound` alone cannot tell a dark source from a quiet one:
  // both are zero. The four counts come straight off firecrawl-scraper's
  // response so the ledger records what the source actually did.
  const noCounts: SourceCounts = { fetched: 0, inserted: 0, duplicates: 0, errors: 0 };
  try {
    console.log(
      `🚀 Starting Firecrawl scrape for job: ${job.name} - ${job.config.url}`
    );

    // Call the firecrawl-scraper function
    const { data, error } = await supabase.functions.invoke(
      "firecrawl-scraper",
      {
        body: {
          url: job.config.url,
          category: job.config.category || "General",
          maxPages: job.config.maxPages || 3,
        },
      }
    );

    if (error) {
      console.error(`❌ Firecrawl error for ${job.name}:`, error);
      return {
        success: false,
        eventsFound: 0,
        errors: [error.message || "Firecrawl error"],
        counts: { ...noCounts, errors: 1 },
      };
    }

    if (data?.success) {
      console.log(
        `✅ Firecrawl completed for ${job.name}: ${data.inserted} new, ${data.updated} updated`
      );
      return {
        success: true,
        eventsFound: data.inserted + data.updated,
        errors: data.errors > 0 ? [`${data.errors} processing errors`] : [],
        counts: {
          fetched: data.totalFound ?? 0,
          inserted: (data.inserted ?? 0) + (data.updated ?? 0),
          duplicates: data.duplicates ?? 0,
          errors: data.errors ?? 0,
        },
        // The page had not changed since its last clean run, so the model was
        // not called and nothing could be inserted (pageFingerprint.ts).
        unchanged: data.modelSkipped === "unchanged",
      };
    } else {
      return {
        success: false,
        eventsFound: 0,
        errors: [data?.error || "Unknown error"],
        counts: { ...noCounts, errors: 1 },
      };
    }
  } catch (error) {
    console.error(`❌ Error scraping job ${job.name}:`, error);
    return { success: false, eventsFound: 0, errors: [error.message], counts: { ...noCounts, errors: 1 } };
  }
}

// Enhanced AI-powered event extraction from website HTML (fallback)
async function analyzeWebsiteStructure(
  url: string,
  claudeApiKey?: string
): Promise<{
  success: boolean;
  analysis?: {
    suggestedSelectors: {
      title: string[];
      description: string[];
      date: string[];
      location: string[];
      price: string[];
      category: string[];
    };
    htmlStructureAnalysis: string;
    recommendations: string;
  };
  error?: string;
}> {
  try {
    console.log(`🔍 Analyzing website structure for: ${url}`);

    // Fetch the website HTML
    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch website: ${response.status} ${response.statusText}`,
      };
    }

    const html = await response.text();
    console.log(`✅ Fetched HTML for analysis, length: ${html.length}`);

    // Extract relevant HTML snippets that might contain event data
    const htmlAnalysisSnippet = extractRelevantHTMLSnippets(html);

    // Use AI to analyze the structure and suggest selectors
    const aiAnalysis = await getAIStructureAnalysis(
      url,
      htmlAnalysisSnippet,
      claudeApiKey
    );

    if (!aiAnalysis) {
      return {
        success: false,
        error: "AI analysis failed or no API keys available",
      };
    }

    return {
      success: true,
      analysis: aiAnalysis,
    };
  } catch (error) {
    console.error(`❌ Error analyzing website structure:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Extract relevant HTML snippets for AI analysis
function extractRelevantHTMLSnippets(html: string): string {
  // Remove scripts, styles, and other non-content elements
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Extract potential event-related sections
  const eventKeywords = [
    "event",
    "show",
    "concert",
    "game",
    "match",
    "schedule",
    "calendar",
    "date",
    "time",
    "venue",
    "location",
    "price",
    "ticket",
    "admission",
    "title",
    "name",
    "description",
    "details",
    "artist",
    "performer",
  ];

  // Find sections that likely contain event information
  const relevantSections: string[] = [];

  // Look for divs, articles, sections with event-related classes or content
  const sectionRegex =
    /<(div|article|section|header|main)[^>]*(?:class|id)="[^"]*(?:event|show|concert|game|schedule|calendar)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi;
  let match;
  while (
    (match = sectionRegex.exec(cleanHtml)) !== null &&
    relevantSections.length < 3
  ) {
    relevantSections.push(match[0].substring(0, 1000)); // Limit length
  }

  // If no specific event sections found, look for common structural patterns
  if (relevantSections.length === 0) {
    // Look for date patterns and surrounding context
    const datePatterns = [
      /(<[^>]*>.*?\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}[^<]*<\/[^>]*>)/gi,
      /(<[^>]*>.*?\b\d{1,2}\/\d{1,2}\/\d{4}[^<]*<\/[^>]*>)/gi,
      /(<[^>]*>.*?\b\d{4}-\d{2}-\d{2}[^<]*<\/[^>]*>)/gi,
    ];

    for (const pattern of datePatterns) {
      let dateMatch;
      while (
        (dateMatch = pattern.exec(cleanHtml)) !== null &&
        relevantSections.length < 2
      ) {
        // Get surrounding context (500 chars before and after)
        const start = Math.max(0, dateMatch.index - 500);
        const end = Math.min(
          cleanHtml.length,
          dateMatch.index + dateMatch[0].length + 500
        );
        relevantSections.push(cleanHtml.substring(start, end));
      }
    }
  }

  // If still no sections, get first few structural elements
  if (relevantSections.length === 0) {
    const structuralRegex =
      /<(h1|h2|h3|div|article|section)[^>]*>[\s\S]*?<\/\1>/gi;
    let structMatch;
    while (
      (structMatch = structuralRegex.exec(cleanHtml)) !== null &&
      relevantSections.length < 5
    ) {
      if (structMatch[0].length < 2000) {
        // Only include reasonably sized elements
        relevantSections.push(structMatch[0]);
      }
    }
  }

  return relevantSections
    .join("\n\n--- SECTION BREAK ---\n\n")
    .substring(0, 4000);
}

// Get AI analysis of website structure
async function getAIStructureAnalysis(
  url: string,
  htmlSnippet: string,
  claudeApiKey?: string
): Promise<{
  suggestedSelectors: {
    title: string[];
    description: string[];
    date: string[];
    location: string[];
    price: string[];
    category: string[];
  };
  htmlStructureAnalysis: string;
  recommendations: string;
} | null> {
  const prompt = `Analyze this HTML structure from ${url} and provide CSS selector recommendations for scraping event information.

HTML SNIPPET:
${htmlSnippet}

Please analyze this HTML and provide:

1. SUGGESTED CSS SELECTORS for each field (provide 2-3 options for each):
   - Event titles
   - Event descriptions  
   - Event dates/times
   - Event locations/venues
   - Event prices
   - Event categories/types

2. HTML STRUCTURE ANALYSIS: Brief explanation of the page structure

3. RECOMMENDATIONS: Best practices for scraping this specific site

Format your response as JSON:
{
  "suggestedSelectors": {
    "title": ["selector1", "selector2", "selector3"],
    "description": ["selector1", "selector2"],
    "date": ["selector1", "selector2", "selector3"],
    "location": ["selector1", "selector2"],
    "price": ["selector1", "selector2"],
    "category": ["selector1", "selector2"]
  },
  "htmlStructureAnalysis": "Brief analysis of the HTML structure...",
  "recommendations": "Specific recommendations for scraping this site..."
}`;

  // Try Claude first
  if (claudeApiKey) {
    try {
      console.log(`🔍 Using Claude for website structure analysis`);

      // Use centralized AI configuration for structure analysis
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const aiConfig = await getAIConfig(supabaseUrl, supabaseKey);
      const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseKey);
      const requestBody = await buildClaudeRequest(
        [{ role: "user", content: prompt }],
        { supabaseUrl, supabaseKey, customMaxTokens: 1000 }
      );

      const claudeResponse = await fetchWithTimeout(
        aiConfig.api_endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        },
        60_000
      );

      console.log(`🔍 Claude response status: ${claudeResponse.status}`);

      if (claudeResponse.ok) {
        const claudeData = await claudeResponse.json();
        console.log(`🔍 Claude response data:`, claudeData);
        const analysisText = claudeData.content?.[0]?.text?.trim();

        if (analysisText) {
          console.log(`🔍 Claude analysis text length: ${analysisText.length}`);
          try {
            // Try to parse JSON from the response
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const analysis = JSON.parse(jsonMatch[0]);
              console.log(`✅ Claude provided structure analysis`);
              return analysis;
            } else {
              console.log(`⚠️ No JSON found in Claude response`);
            }
          } catch (parseError) {
            console.log(`⚠️ Could not parse Claude JSON response:`, parseError);
          }
        } else {
          console.log(`⚠️ No analysis text found in Claude response`);
        }
      } else {
        const errorText = await claudeResponse.text();
        console.error(
          `❌ Claude API error: ${claudeResponse.status} - ${errorText}`
        );
      }
    } catch (error) {
      console.error("Claude API error:", error);
    }
  } else {
    console.log(`⚠️ No Claude API key available`);
  }

  console.log(`❌ Claude API failed or unavailable, returning null`);
  return null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const isAnalyzeRequest = req.headers.get("x-endpoint") === "analyze";
    const isUpdateRequest = req.headers.get("x-endpoint") === "update";

    console.log(
      `🔍 Request details: method=${
        req.method
      }, pathname=${pathname}, x-endpoint=${req.headers.get(
        "x-endpoint"
      )}, isAnalyzeRequest=${isAnalyzeRequest}, isUpdateRequest=${isUpdateRequest}`
    );

    // Handle website analysis endpoint
    if (isAnalyzeRequest && req.method === "POST") {
      console.log("Starting website structure analysis...");

      let requestBody;
      try {
        requestBody = await req.json();
        console.log(`🔍 Request body:`, requestBody);
      } catch (parseError) {
        console.error(`❌ Failed to parse request body:`, parseError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid JSON in request body",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      const { websiteUrl } = requestBody;
      console.log(`🔍 Extracted websiteUrl: "${websiteUrl}"`);

      if (!websiteUrl) {
        console.log(`❌ No websiteUrl provided in request body`);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Website URL is required",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      const claudeApiKey = getAnthropicApiKey();

      console.log(
        `🔑 API Keys availability - Claude: ${
          claudeApiKey ? "Available" : "Missing"
        }`
      );

      // Check if we have Claude API key
      if (!claudeApiKey) {
        console.error(
          "❌ No Claude API key found. Please configure CLAUDE_API environment variable."
        );
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Claude API key not configured. Please set CLAUDE_API environment variable in your Supabase project settings.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }

      const analysisResult = await analyzeWebsiteStructure(
        websiteUrl,
        claudeApiKey
      );

      return new Response(JSON.stringify(analysisResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: analysisResult.success ? 200 : 400,
      });
    }

    // Handle scraping job selector update endpoint
    if (isUpdateRequest && req.method === "POST") {
      console.log("Starting scraping job selector update...");

      let requestBody;
      try {
        requestBody = await req.json();
        console.log(`🔍 Update request body:`, requestBody);
      } catch (parseError) {
        console.error(`❌ Failed to parse update request body:`, parseError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid JSON in request body",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      const { jobId, selectors } = requestBody;

      if (!jobId || !selectors) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Job ID and selectors are required",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      // Initialize Supabase client for update
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      try {
        // Fetch current job to merge selectors
        const { data: currentJob, error: fetchError } = await supabase
          .from("scraping_jobs")
          .select("config")
          .eq("id", jobId)
          .single();

        if (fetchError) {
          console.error("Error fetching current job:", fetchError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to fetch current job configuration",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500,
            }
          );
        }

        // Merge new selectors with existing config
        const updatedConfig = {
          ...currentJob.config,
          selectors: {
            ...currentJob.config.selectors,
            ...selectors,
          },
        };

        // Update the job with new selectors
        const { data: updatedJob, error: updateError } = await supabase
          .from("scraping_jobs")
          .update({ config: updatedConfig })
          .eq("id", jobId)
          .select()
          .single();

        if (updateError) {
          console.error("Error updating job selectors:", updateError);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Failed to update job selectors",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500,
            }
          );
        }

        console.log(`✅ Successfully updated selectors for job ${jobId}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Selectors updated successfully",
            updatedJob,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      } catch (error) {
        console.error("Error in selector update:", error);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Internal server error during selector update",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          }
        );
      }
    }

    // Handle main scraping endpoint (existing functionality)
    console.log("Starting event scraping process...");

    // Parse request body to check for specific jobId
    let requestBody: any = {};
    try {
      if (req.method === "POST") {
        const text = await req.text();
        if (text) {
          requestBody = JSON.parse(text);
        }
      }
    } catch (parseError) {
      console.log("No valid JSON body found, proceeding with all jobs");
    }

    const { jobId } = requestBody;
    console.log(
      `Specific jobId requested: ${jobId || "none (will process all jobs)"}`
    );

    // Check for authorization header or specific trigger
    const authHeader = req.headers.get("authorization");
    const triggerSource = req.headers.get("x-trigger-source");

    // Only allow calls from:
    // 1. Authenticated requests with valid Supabase JWT
    // 2. Requests with our custom trigger header
    // 3. Requests from our frontend domain
    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");

    const isValidTrigger =
      authHeader?.includes("Bearer") || // Supabase auth
      triggerSource === "admin-dashboard" || // Our frontend
      triggerSource === "cron" || // Old cron system
      triggerSource === "cron-auto" || // New auto cron system
      origin?.includes("desmoinesinsider.com") ||
      origin?.includes("localhost") ||
      referer?.includes("desmoinesinsider.com") ||
      referer?.includes("localhost");

    if (!isValidTrigger) {
      console.log(
        `🚫 Unauthorized scraping attempt from ${origin || "unknown"}`
      );
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Unauthorized - scraping can only be triggered from admin dashboard",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    console.log(
      `✅ Authorized scraping request from ${
        origin || triggerSource || "authenticated source"
      }`
    );

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // WEB-BE-046. A 60-day read of every event, plus every future one, with a
    // fingerprint computed for each - and the only thing that consumed it was
    // the log line "Found N existing events for duplicate checking". Nothing in
    // this function deduplicates anything: it delegates to firecrawl-scraper,
    // which does its own duplicate check against the database. The read ran on
    // every invocation, every 30 minutes, over 1,246+ rows.

    // Fetch active scraping jobs from database
    console.log("Fetching scraping jobs from database...");

    // WEB-BE-035: the pg_cron dispatcher used to park rows at 'running'
    // before its asynchronous POST, and this lookup only accepted 'idle', so
    // a dispatched job was never found. A caller that names a job has decided
    // it should run; both labels are accepted for that path.
    let jobsQuery = supabase
      .from("scraping_jobs")
      .select("*")
      .in("status", acceptedJobStatuses(jobId));

    // If specific jobId is requested, filter for that job only
    if (jobId) {
      console.log(`Filtering for specific job: ${jobId}`);
      jobsQuery = jobsQuery.eq("id", jobId);
    } else {
      // WEB-BE-047. `.limit(10)` with no ORDER BY returned whatever Postgres
      // handed back - in practice the same ten rows every run, so the five
      // scraping jobs beyond them had never been scraped at all.
      //
      // last_run NULLS FIRST puts a job that has never run at the front, then
      // the least recently run; next_run breaks the tie for jobs the dispatcher
      // has scheduled. Every job now gets a turn, and a job that was skipped
      // moves to the head of the queue by construction rather than by luck.
      console.log("No specific jobId, will fetch the ten least recently run jobs");
      jobsQuery = jobsQuery
        .order("last_run", { ascending: true, nullsFirst: true })
        .order("next_run", { ascending: true, nullsFirst: true })
        .limit(10);
    }

    const { data: scrapingJobs, error: jobsError } = await jobsQuery;

    if (jobsError) {
      console.error("Error fetching scraping jobs:", jobsError);
      throw jobsError;
    }

    if (!scrapingJobs || scrapingJobs.length === 0) {
      const message = jobId
        ? `No scraping job found with ID: ${jobId}`
        : "No active scraping jobs found";
      console.log(message);
      return new Response(
        JSON.stringify({
          success: true,
          message,
          events_processed: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(`Found ${scrapingJobs.length} total scraping jobs`);

    // Filter jobs based on recent scraping history
    const jobsToProcess: any[] = [];
    const skippedJobs: { name: string; reason: string }[] = [];

    // Detect admin dashboard trigger more broadly
    const isAdminDashboard =
      triggerSource === "admin-dashboard" ||
      origin?.includes("desmoinesinsider.com") ||
      origin?.includes("localhost") ||
      referer?.includes("desmoinesinsider.com") ||
      referer?.includes("localhost");

    console.log(
      `🔍 Admin Dashboard Detection: triggerSource="${triggerSource}", origin="${origin}", referer="${referer}", isAdminDashboard=${isAdminDashboard}`
    );

    for (const jobRow of scrapingJobs) {
      const job: ScrapingJob = {
        id: jobRow.id,
        name: jobRow.name,
        status: jobRow.status,
        config: jobRow.config as any,
        last_run: jobRow.last_run,
        events_found: jobRow.events_found,
      };

      // DMI-013 — a hub-owned source is not this producer's to scrape.
      //
      // Derived from `ownership` on the profile, never from a list kept here.
      // The check runs BEFORE the recency check so a hub-owned job is reported
      // as "not ours" rather than as "scraped too recently", which are different
      // facts and would send an operator to the wrong place.
      //
      // A url matching no profile falls through and is scraped as before: an
      // unrecognised source keeps its old behaviour rather than being silently
      // dropped by both producers.
      if (job.config?.url && isHubOwned(job.config.url)) {
        const reason = "owned by the ADE Hub ingest run (eventSourceProfiles.ownership = 'hub')";
        console.log(`⏭️ Skipping ${job.name}: ${reason}`);
        skippedJobs.push({ name: job.name, reason });
        continue;
      }

      const skipCheck = shouldSkipJobScraping(job, isAdminDashboard);
      if (skipCheck.skip) {
        console.log(`⏭️ Skipping ${job.name}: ${skipCheck.reason}`);
        skippedJobs.push({ name: job.name, reason: skipCheck.reason! });
      } else if (job.config?.isActive && job.config?.url) {
        jobsToProcess.push(jobRow);
      }
    }

    console.log(
      `Processing ${jobsToProcess.length} jobs, skipped ${skippedJobs.length} jobs`
    );

    // Scrape events from filtered jobs using Firecrawl
    let totalEventsFound = 0;
    let totalErrors = 0;
    const jobResults = [];
    // WEB-BE-043. Keyed by scraping job name, which is what an operator reads
    // in the admin panel and what eventSourceProfiles calls a source.
    const sources: Record<string, SourceCounts> = {};

    const ledger = await runJob("scrape-events", async (ctx) => {
    for (const jobRow of jobsToProcess) {
      const job: ScrapingJob = {
        id: jobRow.id,
        name: jobRow.name,
        status: jobRow.status,
        config: jobRow.config as any,
      };

      console.log(`🎯 Processing job: ${job.name} - ${job.config.url}`);

      // Use Firecrawl for scraping
      const scrapeResult = await scrapeJobWithFirecrawl(job, supabase);

      totalEventsFound += scrapeResult.eventsFound;
      totalErrors += scrapeResult.errors.length;
      // An unchanged page stays out of the per-source counts, as it does in
      // firecrawl-scraper's own ledger: its zero is not a dark source.
      if (!scrapeResult.unchanged) sources[job.name] = scrapeResult.counts;

      jobResults.push({
        jobName: job.name,
        url: job.config.url,
        eventsFound: scrapeResult.eventsFound,
        success: scrapeResult.success,
        errors: scrapeResult.errors,
      });

      // Update job status. This is the ONLY writer of scraping_jobs.status
      // left in the system (WEB-BE-035): the dispatcher advances next_run and
      // nothing else, so a row that reached this line is idle again whatever
      // it carried when it was picked up.
      await supabase
        .from("scraping_jobs")
        .update({
          status: JOB_STATUS_IDLE,
          last_run: new Date().toISOString(),
          events_found: scrapeResult.eventsFound,
        })
        .eq("id", job.id);

      console.log(
        `✅ Completed ${job.name}: ${scrapeResult.eventsFound} events found`
      );
    }

      ctx.processed(totalEventsFound);
      ctx.failed(totalErrors);
      ctx.meta({
        jobsProcessed: jobsToProcess.length,
        jobsSkipped: skippedJobs.length,
        sources,
      });
      // Total failure is a failed run, so the ledger and the HTTP status agree.
      // The status is still computed below from the same counts, so a ledger
      // write that fails cannot change what the caller is told.
      if (jobsToProcess.length > 0 && totalErrors >= jobsToProcess.length) {
        throw new Error(`all ${jobsToProcess.length} scraping jobs errored, 0 events found`);
      }
    });

    console.log(
      `Processed ${jobsToProcess.length} jobs, found ${totalEventsFound} total events`
    );

    // EVERY JOB FAILING IS NOT A SUCCESSFUL SCRAPE.
    //
    // This returned `success: true` with HTTP 200 unconditionally, so a run where
    // all ten sources failed was byte-indistinguishable from a run where all ten
    // worked and the calendar was simply quiet. It has been returning exactly
    // that for days:
    //
    //   {"success":true,"message":"Scraping completed: 0 events found across 10
    //    jobs","total_events_found":0,"total_errors":10, ...}
    //   every job_results entry: "Edge Function returned a non-2xx status code"
    //
    // pg_cron recorded "succeeded", cron_health saw a healthy job, and SeatGeek -
    // 375 events, the largest single source in the corpus - stopped ingesting on
    // 2026-08-21 with nothing anywhere reporting a problem. This is WEB-OPS-007
    // AC4's rule ("re-verify by outcome, not by absence of error") applied to the
    // scraper itself.
    //
    // Total failure is reported as failure. A partial run stays 200 with
    // success: true and its error count, because losing one source of ten is a
    // normal Tuesday and should not page anyone.
    const everyJobFailed = jobsToProcess.length > 0 && totalErrors >= jobsToProcess.length;

    return new Response(
      JSON.stringify({
        success: !everyJobFailed,
        runId: ledger.runId,
        ...(ledger.status === "skipped" ? { paused: true } : {}),
        message: everyJobFailed
          ? `Scraping FAILED: all ${jobsToProcess.length} jobs errored, 0 events found`
          : `Scraping completed: ${totalEventsFound} events found across ${jobsToProcess.length} jobs`,
        jobs_processed: jobsToProcess.length,
        jobs_skipped: skippedJobs.length,
        total_events_found: totalEventsFound,
        total_errors: totalErrors,
        skipped_jobs: skippedJobs,
        job_results: jobResults,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: everyJobFailed ? 500 : 200,
      }
    );

    // A second return block used to sit here, unreachable behind the return
    // above and referencing five identifiers that are not in scope -
    // insertError, insertedEvents, enhancedEvents, enhancedCount and
    // totalDuplicatesSkipped. Left over from an earlier shape of this function.
    //
    // It never ran, so nothing was broken by it, and that is the problem: it
    // read as if this function checks its insert error and reports
    // duplicates_skipped and events_enhanced. It does neither. Whoever needs
    // those numbers should add them to the response above rather than restoring
    // this (found by the edge type check, 2026-08-27).
  } catch (error) {
    console.error("Error in scrape-events function:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
