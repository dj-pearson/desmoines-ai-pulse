// ============================================================================
// Site Crawler Edge Function
// ============================================================================
// Purpose: Crawl website pages for comprehensive SEO analysis
// Returns: Crawled pages with detailed SEO metrics
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CrawlRequest {
  startUrl: string;
  maxPages?: number;
  maxDepth?: number;
  saveResults?: boolean;
}

interface CrawledPage {
  url: string;
  depth: number;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  h1Tags: string[];
  issues: any[];
  issueCount: number;
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
      startUrl,
      maxPages = 50,
      maxDepth = 3,
      saveResults = true,
    }: CrawlRequest = await req.json();

    if (!startUrl) {
      return new Response(JSON.stringify({ error: "Start URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(
      `Starting site crawl: ${startUrl} (max ${maxPages} pages, depth ${maxDepth})`
    );

    const crawlSessionId = crypto.randomUUID();
    const startTime = Date.now();
    const baseUrl = new URL(startUrl);
    const visited = new Set<string>();
    const toVisit: Array<{ url: string; depth: number }> = [
      { url: startUrl, depth: 0 },
    ];
    const crawledPages: CrawledPage[] = [];

    // Crawl loop
    while (toVisit.length > 0 && crawledPages.length < maxPages) {
      const { url, depth } = toVisit.shift()!;

      // Skip if already visited or max depth reached
      if (visited.has(url) || depth > maxDepth) {
        continue;
      }

      visited.add(url);

      try {
        console.log(`Crawling [${depth}]: ${url}`);
        const pageStartTime = Date.now();

        // Fetch page
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; SEOBot/1.0; +https://desmoinesaipulse.com)",
          },
        });

        const statusCode = response.status;
        const contentType = response.headers.get("content-type") || "";

        // Only process HTML pages
        if (!contentType.includes("text/html")) {
          continue;
        }

        const html = await response.text();
        const crawlDuration = Date.now() - pageStartTime;

        // Parse page
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || null;
        const metaDescription =
          html.match(
            /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
          )?.[1]?.trim() || null;

        // Extract H1 tags
        const h1Tags: string[] = [];
        const h1Matches = html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi);
        for (const match of h1Matches) {
          h1Tags.push(match[1].trim());
        }

        // Count headings
        const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
        const h3Count = (html.match(/<h3[^>]*>/gi) || []).length;

        // Extract links for further crawling
        const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']+)["']/gi);
        for (const match of linkMatches) {
          try {
            const linkUrl = new URL(match[1], url);

            // Only crawl same-domain links
            if (
              linkUrl.hostname === baseUrl.hostname &&
              linkUrl.protocol === baseUrl.protocol &&
              !linkUrl.pathname.match(/\.(pdf|jpg|jpeg|png|gif|zip|doc|docx)$/i)
            ) {
              const normalizedUrl = linkUrl.origin + linkUrl.pathname;
              if (!visited.has(normalizedUrl)) {
                toVisit.push({ url: normalizedUrl, depth: depth + 1 });
              }
            }
          } catch {
            // Invalid URL, skip
          }
        }

        // Analyze images
        const imgMatches = html.matchAll(/<img[^>]*>/gi);
        let imagesCount = 0;
        let imagesWithoutAlt = 0;

        for (const match of imgMatches) {
          imagesCount++;
          const imgTag = match[0];
          if (!imgTag.match(/alt=["'][^"']*["']/i)) {
            imagesWithoutAlt++;
          }
        }

        // Count links
        const internalLinksCount = (
          html.match(
            new RegExp(`<a[^>]*href=["'](${baseUrl.origin}[^"']*|/[^"']*)["']`, "gi")
          ) || []
        ).length;
        const externalLinksCount = (
          html.match(/<a[^>]*href=["']https?:\/\/(?!${baseUrl.hostname})[^"']+["']/gi) || []
        ).length;

        // Find broken links (basic check)
        const brokenLinks: string[] = [];
        // Note: In production, you'd want to check each link

        // Check for canonical
        const hasCanonical = /<link[^>]*rel=["']canonical["']/i.test(html);
        const canonicalUrl =
          html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ||
          null;

        // Check for robots meta
        const hasRobotsMeta = /<meta[^>]*name=["']robots["']/i.test(html);
        const robotsMeta =
          html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
          null;

        // Check for viewport
        const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);

        // Check for favicon
        const hasFavicon = /<link[^>]*rel=["'](?:icon|shortcut icon)["']/i.test(html);

        // Check for structured data
        const hasStructuredData = /<script[^>]*type=["']application\/ld\+json["']/i.test(
          html
        );

        // Check for OG tags
        const hasOgTags = /<meta[^>]*property=["']og:/i.test(html);

        // Check for Twitter tags
        const hasTwitterTags = /<meta[^>]*name=["']twitter:/i.test(html);

        // Analyze issues
        const issues: any[] = [];
        let issueCount = 0;

        if (!title) {
          issues.push({
            severity: "critical",
            type: "meta_tags",
            message: "Missing title tag",
          });
          issueCount++;
        } else if (title.length < 30 || title.length > 60) {
          issues.push({
            severity: "warning",
            type: "meta_tags",
            message: `Title length ${title.length} (recommended: 50-60)`,
          });
          issueCount++;
        }

        if (!metaDescription) {
          issues.push({
            severity: "critical",
            type: "meta_tags",
            message: "Missing meta description",
          });
          issueCount++;
        } else if (metaDescription.length < 100 || metaDescription.length > 160) {
          issues.push({
            severity: "warning",
            type: "meta_tags",
            message: `Description length ${metaDescription.length} (recommended: 150-160)`,
          });
          issueCount++;
        }

        if (h1Tags.length === 0) {
          issues.push({
            severity: "high",
            type: "headings",
            message: "Missing H1 tag",
          });
          issueCount++;
        } else if (h1Tags.length > 1) {
          issues.push({
            severity: "warning",
            type: "headings",
            message: `Multiple H1 tags found (${h1Tags.length})`,
          });
          issueCount++;
        }

        if (imagesWithoutAlt > 0) {
          issues.push({
            severity: "medium",
            type: "images",
            message: `${imagesWithoutAlt} images missing alt text`,
          });
          issueCount++;
        }

        if (!hasViewport) {
          issues.push({
            severity: "high",
            type: "mobile",
            message: "Missing viewport meta tag",
          });
          issueCount++;
        }

        // Calculate SEO score
        let pageSeoScore = 100;
        if (!title) pageSeoScore -= 20;
        if (!metaDescription) pageSeoScore -= 15;
        if (h1Tags.length === 0) pageSeoScore -= 15;
        if (h1Tags.length > 1) pageSeoScore -= 10;
        if (!hasViewport) pageSeoScore -= 10;
        if (imagesWithoutAlt > 0) pageSeoScore -= Math.min(15, imagesWithoutAlt * 2);

        // Determine if indexable
        const isIndexable = !(
          robotsMeta?.toLowerCase().includes("noindex") ||
          statusCode >= 400
        );

        // Save to database
        if (saveResults) {
          await supabase.from("seo_crawl_results").insert({
            crawl_session_id: crawlSessionId,
            start_url: startUrl,
            url,
            depth,
            status_code: statusCode,
            response_time_ms: crawlDuration,
            content_type: contentType,
            title,
            meta_description: metaDescription,
            h1_tags: h1Tags,
            h1_count: h1Tags.length,
            h2_count: h2Count,
            h3_count: h3Count,
            internal_links_count: internalLinksCount,
            external_links_count: externalLinksCount,
            broken_links_count: brokenLinks.length,
            broken_links: brokenLinks,
            images_count: imagesCount,
            images_without_alt: imagesWithoutAlt,
            has_canonical: hasCanonical,
            canonical_url: canonicalUrl,
            has_robots_meta: hasRobotsMeta,
            robots_meta: robotsMeta,
            has_viewport: hasViewport,
            has_favicon: hasFavicon,
            has_structured_data: hasStructuredData,
            has_og_tags: hasOgTags,
            has_twitter_tags: hasTwitterTags,
            issues,
            issue_count: issueCount,
            page_seo_score: Math.max(0, pageSeoScore),
            is_indexable: isIndexable,
            noindex_reason: !isIndexable ? "noindex directive or error status" : null,
            crawl_duration_ms: crawlDuration,
          });
        }

        crawledPages.push({
          url,
          depth,
          statusCode,
          title,
          metaDescription,
          h1Tags,
          issues,
          issueCount,
        });
      } catch (error) {
        console.error(`Error crawling ${url}:`, error.message);
      }
    }

    const executionTime = Date.now() - startTime;

    console.log(
      `Crawl completed: ${crawledPages.length} pages in ${executionTime}ms`
    );

    return new Response(
      JSON.stringify({
        success: true,
        crawlSessionId,
        summary: {
          pagesFound: visited.size,
          pagesCrawled: crawledPages.length,
          executionTime,
        },
        pages: crawledPages,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in crawl-site function:", error);

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
