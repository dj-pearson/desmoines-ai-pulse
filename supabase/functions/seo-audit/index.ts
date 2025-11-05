// ============================================================================
// SEO Audit Edge Function
// ============================================================================
// Purpose: Comprehensive SEO audit of a given URL
// Returns: Detailed audit results with scores and recommendations
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AuditRequest {
  url: string;
  auditType?: "full" | "quick" | "technical" | "content";
  saveResults?: boolean;
}

interface AuditResult {
  url: string;
  overallScore: number;
  technicalScore: number;
  contentScore: number;
  performanceScore: number;
  accessibilityScore: number;
  criticalIssues: number;
  warningIssues: number;
  infoIssues: number;
  metaTags: any;
  headings: any;
  images: any;
  links: any;
  performance: any;
  mobile: any;
  structuredData: any;
  security: any;
  recommendations: any[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { url, auditType = "full", saveResults = true }: AuditRequest =
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

    console.log(`Starting ${auditType} SEO audit for: ${url}`);
    const startTime = Date.now();

    // Initialize audit result
    const auditResult: AuditResult = {
      url,
      overallScore: 0,
      technicalScore: 0,
      contentScore: 0,
      performanceScore: 0,
      accessibilityScore: 0,
      criticalIssues: 0,
      warningIssues: 0,
      infoIssues: 0,
      metaTags: {},
      headings: {},
      images: {},
      links: {},
      performance: {},
      mobile: {},
      structuredData: {},
      security: {},
      recommendations: [],
    };

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SEOBot/1.0; +https://desmoines-ai-pulse.com)",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      throw new Error(`URL is not an HTML page: ${contentType}`);
    }

    // Parse HTML (basic parsing - in production, use a proper HTML parser)
    // For now, using regex patterns (not ideal but works for basic checks)

    // ========================================================================
    // 1. META TAGS ANALYSIS
    // ========================================================================
    const metaTags: any = {
      title: null,
      description: null,
      keywords: null,
      ogTags: {},
      twitterTags: {},
      canonical: null,
      robots: null,
      viewport: null,
    };

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    metaTags.title = titleMatch ? titleMatch[1].trim() : null;

    // Extract meta description
    const descMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
    );
    metaTags.description = descMatch ? descMatch[1].trim() : null;

    // Extract meta keywords
    const keywordsMatch = html.match(
      /<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i
    );
    metaTags.keywords = keywordsMatch
      ? keywordsMatch[1].split(",").map((k) => k.trim())
      : [];

    // Extract viewport
    const viewportMatch = html.match(
      /<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']+)["']/i
    );
    metaTags.viewport = viewportMatch ? viewportMatch[1] : null;

    // Extract canonical
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    metaTags.canonical = canonicalMatch ? canonicalMatch[1] : null;

    // Extract robots
    const robotsMatch = html.match(
      /<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i
    );
    metaTags.robots = robotsMatch ? robotsMatch[1] : null;

    // Extract OpenGraph tags
    const ogMatches = html.matchAll(
      /<meta[^>]*property=["']og:([^"']+)["'][^>]*content=["']([^"']+)["']/gi
    );
    for (const match of ogMatches) {
      metaTags.ogTags[match[1]] = match[2];
    }

    // Extract Twitter tags
    const twitterMatches = html.matchAll(
      /<meta[^>]*name=["']twitter:([^"']+)["'][^>]*content=["']([^"']+)["']/gi
    );
    for (const match of twitterMatches) {
      metaTags.twitterTags[match[1]] = match[2];
    }

    auditResult.metaTags = metaTags;

    // ========================================================================
    // 2. HEADINGS ANALYSIS
    // ========================================================================
    const headings: any = {
      h1: [],
      h2: [],
      h3: [],
      issues: [],
    };

    const h1Matches = html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi);
    for (const match of h1Matches) {
      headings.h1.push(match[1].trim());
    }

    const h2Matches = html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi);
    for (const match of h2Matches) {
      headings.h2.push(match[1].trim());
    }

    const h3Matches = html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/gi);
    for (const match of h3Matches) {
      headings.h3.push(match[1].trim());
    }

    if (headings.h1.length === 0) {
      headings.issues.push("No H1 heading found");
      auditResult.criticalIssues++;
    } else if (headings.h1.length > 1) {
      headings.issues.push(`Multiple H1 headings found (${headings.h1.length})`);
      auditResult.warningIssues++;
    }

    auditResult.headings = headings;

    // ========================================================================
    // 3. IMAGES ANALYSIS
    // ========================================================================
    const images: any = {
      total: 0,
      missingAlt: 0,
      issues: [],
    };

    const imgMatches = html.matchAll(/<img[^>]*>/gi);
    for (const match of imgMatches) {
      images.total++;
      const imgTag = match[0];

      // Check for alt attribute
      if (!imgTag.match(/alt=["'][^"']*["']/i)) {
        images.missingAlt++;
      }
    }

    if (images.missingAlt > 0) {
      images.issues.push(
        `${images.missingAlt} images missing alt text`
      );
      auditResult.warningIssues += images.missingAlt;
    }

    auditResult.images = images;

    // ========================================================================
    // 4. LINKS ANALYSIS
    // ========================================================================
    const links: any = {
      internal: 0,
      external: 0,
      nofollow: [],
    };

    const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi);
    for (const match of linkMatches) {
      const href = match[1];
      const linkTag = match[0];

      // Determine if internal or external
      if (
        href.startsWith("/") ||
        href.startsWith("#") ||
        href.includes(new URL(url).hostname)
      ) {
        links.internal++;
      } else if (href.startsWith("http")) {
        links.external++;
      }

      // Check for nofollow
      if (linkTag.match(/rel=["'][^"']*nofollow[^"']*["']/i)) {
        links.nofollow.push(href);
      }
    }

    auditResult.links = links;

    // ========================================================================
    // 5. SECURITY ANALYSIS
    // ========================================================================
    const security: any = {
      https: url.startsWith("https://"),
      headers: {},
      issues: [],
    };

    // Check security headers
    const securityHeaders = [
      "strict-transport-security",
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
    ];

    for (const header of securityHeaders) {
      security.headers[header] = response.headers.get(header) || null;
    }

    if (!security.https) {
      security.issues.push("Not using HTTPS");
      auditResult.criticalIssues++;
    }

    if (!security.headers["strict-transport-security"]) {
      security.issues.push("Missing HSTS header");
      auditResult.warningIssues++;
    }

    auditResult.security = security;

    // ========================================================================
    // 6. CALCULATE SCORES
    // ========================================================================

    // Technical Score (0-100)
    let technicalScore = 100;
    if (!metaTags.title) technicalScore -= 20;
    if (!metaTags.description) technicalScore -= 15;
    if (!metaTags.viewport) technicalScore -= 10;
    if (headings.h1.length === 0) technicalScore -= 15;
    if (headings.h1.length > 1) technicalScore -= 10;
    if (!security.https) technicalScore -= 30;
    auditResult.technicalScore = Math.max(0, technicalScore);

    // Content Score (0-100)
    let contentScore = 100;
    if (!metaTags.title || metaTags.title.length < 30) contentScore -= 15;
    if (!metaTags.description || metaTags.description.length < 100)
      contentScore -= 15;
    if (headings.h2.length === 0) contentScore -= 10;
    if (images.missingAlt > 0)
      contentScore -= Math.min(20, images.missingAlt * 2);
    auditResult.contentScore = Math.max(0, contentScore);

    // Accessibility Score (0-100)
    let accessibilityScore = 100;
    if (images.missingAlt > 0)
      accessibilityScore -= Math.min(30, images.missingAlt * 3);
    if (headings.h1.length === 0) accessibilityScore -= 20;
    auditResult.accessibilityScore = Math.max(0, accessibilityScore);

    // Overall Score (weighted average)
    auditResult.overallScore = Math.round(
      auditResult.technicalScore * 0.35 +
        auditResult.contentScore * 0.35 +
        auditResult.accessibilityScore * 0.30
    );

    // ========================================================================
    // 7. GENERATE RECOMMENDATIONS
    // ========================================================================
    const recommendations: any[] = [];

    if (!metaTags.title) {
      recommendations.push({
        priority: "critical",
        category: "meta_tags",
        title: "Missing Title Tag",
        description: "Add a unique, descriptive title tag (50-60 characters)",
        fix: 'Add: <title>Your Page Title Here</title>',
      });
    }

    if (!metaTags.description) {
      recommendations.push({
        priority: "critical",
        category: "meta_tags",
        title: "Missing Meta Description",
        description:
          "Add a compelling meta description (150-160 characters)",
        fix: '<meta name="description" content="Your description here">',
      });
    }

    if (headings.h1.length === 0) {
      recommendations.push({
        priority: "high",
        category: "headings",
        title: "Missing H1 Heading",
        description: "Add one H1 heading that describes the page content",
        fix: "<h1>Your Main Heading</h1>",
      });
    }

    if (images.missingAlt > 0) {
      recommendations.push({
        priority: "medium",
        category: "images",
        title: `${images.missingAlt} Images Missing Alt Text`,
        description:
          "Add descriptive alt text to all images for accessibility and SEO",
        fix: '<img src="..." alt="Descriptive text here">',
      });
    }

    if (!security.https) {
      recommendations.push({
        priority: "critical",
        category: "security",
        title: "Not Using HTTPS",
        description: "Enable HTTPS to secure your site and improve SEO",
        fix: "Install SSL certificate and redirect HTTP to HTTPS",
      });
    }

    if (!metaTags.viewport) {
      recommendations.push({
        priority: "high",
        category: "mobile",
        title: "Missing Viewport Meta Tag",
        description: "Add viewport meta tag for mobile responsiveness",
        fix: '<meta name="viewport" content="width=device-width, initial-scale=1">',
      });
    }

    auditResult.recommendations = recommendations;

    // ========================================================================
    // 8. SAVE RESULTS TO DATABASE
    // ========================================================================
    const executionTime = Date.now() - startTime;

    if (saveResults) {
      const { error: insertError } = await supabase
        .from("seo_audit_history")
        .insert({
          url: auditResult.url,
          audit_type: auditType,
          overall_score: auditResult.overallScore,
          technical_score: auditResult.technicalScore,
          content_score: auditResult.contentScore,
          performance_score: auditResult.performanceScore,
          accessibility_score: auditResult.accessibilityScore,
          critical_issues: auditResult.criticalIssues,
          warning_issues: auditResult.warningIssues,
          info_issues: auditResult.infoIssues,
          meta_tags: auditResult.metaTags,
          headings: auditResult.headings,
          images: auditResult.images,
          links: auditResult.links,
          performance: auditResult.performance,
          mobile: auditResult.mobile,
          structured_data: auditResult.structuredData,
          security: auditResult.security,
          recommendations: auditResult.recommendations,
          execution_time_ms: executionTime,
        });

      if (insertError) {
        console.error("Error saving audit results:", insertError);
        // Don't throw - still return results even if save fails
      } else {
        console.log(`Audit results saved to database`);
      }
    }

    console.log(
      `SEO audit completed in ${executionTime}ms. Overall score: ${auditResult.overallScore}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        audit: auditResult,
        executionTime,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in seo-audit function:", error);

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
