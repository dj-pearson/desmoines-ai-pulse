// ============================================================================
// Check Broken Links Edge Function
// ============================================================================
// Purpose: Find broken links (404s, timeouts) on a page or entire site
// Returns: List of broken links with details
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BrokenLinkRequest {
  url: string;
  checkExternal?: boolean;
  timeout?: number; // Timeout in ms
  saveResults?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      url,
      checkExternal = false,
      timeout = 10000,
      saveResults = true,
    }: BrokenLinkRequest = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Checking broken links for: ${url}`);
    const startTime = Date.now();

    // Fetch the page
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    const baseUrl = new URL(url);

    // Extract all links
    const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi);
    const links = new Map<string, { text: string; count: number; sources: number[] }>();
    let linkIndex = 0;

    for (const match of linkMatches) {
      const href = match[1];
      const text = match[2].replace(/<[^>]+>/g, "").trim();

      try {
        // Resolve relative URLs
        const linkUrl = new URL(href, url);

        // Normalize URL (remove hash)
        const normalizedUrl = linkUrl.origin + linkUrl.pathname + linkUrl.search;

        // Filter based on checkExternal setting
        const isExternal = linkUrl.hostname !== baseUrl.hostname;
        if (isExternal && !checkExternal) {
          continue;
        }

        // Track link
        if (links.has(normalizedUrl)) {
          const existing = links.get(normalizedUrl)!;
          existing.count++;
          existing.sources.push(linkIndex);
        } else {
          links.set(normalizedUrl, {
            text: text || href,
            count: 1,
            sources: [linkIndex],
          });
        }

        linkIndex++;
      } catch {
        // Invalid URL, skip
      }
    }

    console.log(`Found ${links.size} unique links to check`);

    // Check each link
    const brokenLinks: any[] = [];
    const workingLinks: any[] = [];
    let checked = 0;

    for (const [linkUrl, linkInfo] of links.entries()) {
      checked++;

      if (checked % 10 === 0) {
        console.log(`Checked ${checked}/${links.size} links...`);
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const linkResponse = await fetch(linkUrl, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
        });

        clearTimeout(timeoutId);

        const statusCode = linkResponse.status;
        const isBroken = statusCode >= 400;

        const linkData = {
          url: linkUrl,
          text: linkInfo.text,
          statusCode,
          occurrences: linkInfo.count,
          linkType: new URL(linkUrl).hostname === baseUrl.hostname ? "internal" : "external",
        };

        if (isBroken) {
          brokenLinks.push(linkData);
        } else {
          workingLinks.push(linkData);
        }
      } catch (error) {
        // Timeout or network error
        brokenLinks.push({
          url: linkUrl,
          text: linkInfo.text,
          statusCode: 0,
          error: error.message,
          occurrences: linkInfo.count,
          linkType: new URL(linkUrl).hostname === baseUrl.hostname ? "internal" : "external",
        });
      }
    }

    // Save results to database
    if (saveResults) {
      // Update seo_link_analysis for each broken link
      for (const link of brokenLinks) {
        await supabase.from("seo_link_analysis").insert({
          source_url: url,
          link_url: link.url,
          link_text: link.text,
          link_type: link.linkType,
          status_code: link.statusCode,
          is_follow: true, // Would need to parse rel attribute
          issues: link.statusCode >= 400 ? ["broken"] : [],
          checked_at: new Date().toISOString(),
        });
      }
    }

    const executionTime = Date.now() - startTime;

    console.log(
      `Broken link check completed: ${brokenLinks.length} broken out of ${links.size} total in ${executionTime}ms`
    );

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalLinks: links.size,
          brokenLinks: brokenLinks.length,
          workingLinks: workingLinks.length,
          executionTime,
        },
        brokenLinks,
        // Only return first 20 working links to avoid huge response
        workingLinks: workingLinks.slice(0, 20),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in check-broken-links function:", error);

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
