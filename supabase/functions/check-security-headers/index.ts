// ============================================================================
// Check Security Headers Edge Function
// ============================================================================
// Purpose: Validate security headers (HSTS, CSP, X-Frame-Options, etc.)
// Returns: Security analysis with recommendations
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { url, saveResults = true } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Checking security headers for: ${url}`);

    // Fetch page to check headers
    const response = await fetch(url);
    const urlObj = new URL(url);

    // Extract security headers
    const hstsHeader = response.headers.get("strict-transport-security");
    const cspHeader = response.headers.get("content-security-policy");
    const xFrameOptions = response.headers.get("x-frame-options");
    const xContentTypeOptions = response.headers.get("x-content-type-options");
    const referrerPolicy = response.headers.get("referrer-policy");
    const permissionsPolicy = response.headers.get("permissions-policy");

    // Check HTTPS
    const isHttps = urlObj.protocol === "https:";

    // Parse HSTS
    let hstsMaxAge = null;
    let hstsIncludeSubdomains = false;
    let hstsPreload = false;

    if (hstsHeader) {
      const maxAgeMatch = hstsHeader.match(/max-age=(\d+)/);
      if (maxAgeMatch) hstsMaxAge = parseInt(maxAgeMatch[1]);
      hstsIncludeSubdomains = hstsHeader.includes("includeSubDomains");
      hstsPreload = hstsHeader.includes("preload");
    }

    // Parse CSP
    let cspDirectives: any = null;
    const cspViolations: string[] = [];

    if (cspHeader) {
      cspDirectives = {};
      const directives = cspHeader.split(";");
      for (const directive of directives) {
        const [key, ...values] = directive.trim().split(/\s+/);
        if (key) {
          cspDirectives[key] = values.join(" ");
        }
      }

      // Check for unsafe directives
      if (cspHeader.includes("'unsafe-inline'")) {
        cspViolations.push("Uses 'unsafe-inline' which reduces security");
      }
      if (cspHeader.includes("'unsafe-eval'")) {
        cspViolations.push("Uses 'unsafe-eval' which can allow code injection");
      }
    }

    // Analyze issues
    const criticalIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // HTTPS check
    if (!isHttps) {
      criticalIssues.push("Not using HTTPS");
      recommendations.push("Enable HTTPS to encrypt data in transit");
    }

    // HSTS check
    if (!hstsHeader && isHttps) {
      warnings.push("Missing HSTS header");
      recommendations.push(
        "Add Strict-Transport-Security header: max-age=31536000; includeSubDomains; preload"
      );
    } else if (hstsMaxAge && hstsMaxAge < 31536000) {
      warnings.push(`HSTS max-age is too short (${hstsMaxAge} seconds)`);
      recommendations.push("Increase HSTS max-age to at least 31536000 (1 year)");
    }

    // CSP check
    if (!cspHeader) {
      warnings.push("Missing Content-Security-Policy header");
      recommendations.push(
        "Add Content-Security-Policy header to prevent XSS attacks"
      );
    } else if (cspViolations.length > 0) {
      warnings.push(...cspViolations);
    }

    // X-Frame-Options check
    if (!xFrameOptions) {
      warnings.push("Missing X-Frame-Options header");
      recommendations.push(
        "Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking"
      );
    }

    // X-Content-Type-Options check
    if (!xContentTypeOptions) {
      warnings.push("Missing X-Content-Type-Options header");
      recommendations.push("Add X-Content-Type-Options: nosniff");
    }

    // Referrer-Policy check
    if (!referrerPolicy) {
      warnings.push("Missing Referrer-Policy header");
      recommendations.push(
        "Add Referrer-Policy: strict-origin-when-cross-origin or no-referrer"
      );
    }

    // Calculate security score
    let securityScore = 100;

    if (!isHttps) securityScore -= 40;
    if (!hstsHeader && isHttps) securityScore -= 15;
    if (!cspHeader) securityScore -= 20;
    if (!xFrameOptions) securityScore -= 10;
    if (!xContentTypeOptions) securityScore -= 5;
    if (!referrerPolicy) securityScore -= 5;
    if (cspViolations.length > 0) securityScore -= 5;

    securityScore = Math.max(0, securityScore);

    // Overall assessment
    let overallAssessment = "excellent";
    if (securityScore < 40) overallAssessment = "critical";
    else if (securityScore < 60) overallAssessment = "poor";
    else if (securityScore < 80) overallAssessment = "needs_improvement";
    else if (securityScore < 95) overallAssessment = "good";

    // Save to database
    if (saveResults) {
      await supabase.from("seo_security_analysis").insert({
        url,
        is_https: isHttps,
        has_hsts: !!hstsHeader,
        hsts_max_age: hstsMaxAge,
        hsts_include_subdomains: hstsIncludeSubdomains,
        hsts_preload: hstsPreload,
        has_csp: !!cspHeader,
        csp_directives: cspDirectives,
        csp_violations: cspViolations,
        has_x_frame_options: !!xFrameOptions,
        x_frame_options_value: xFrameOptions,
        has_x_content_type_options: !!xContentTypeOptions,
        x_content_type_options_value: xContentTypeOptions,
        has_referrer_policy: !!referrerPolicy,
        referrer_policy_value: referrerPolicy,
        has_permissions_policy: !!permissionsPolicy,
        permissions_policy_value: permissionsPolicy,
        security_score: securityScore,
        critical_issues: criticalIssues,
        warnings,
        recommendations,
        overall_assessment: overallAssessment,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis: {
          url,
          securityScore,
          overallAssessment,
          https: {
            enabled: isHttps,
          },
          headers: {
            hsts: {
              present: !!hstsHeader,
              maxAge: hstsMaxAge,
              includeSubdomains: hstsIncludeSubdomains,
              preload: hstsPreload,
            },
            csp: {
              present: !!cspHeader,
              directives: cspDirectives,
              violations: cspViolations,
            },
            xFrameOptions: {
              present: !!xFrameOptions,
              value: xFrameOptions,
            },
            xContentTypeOptions: {
              present: !!xContentTypeOptions,
              value: xContentTypeOptions,
            },
            referrerPolicy: {
              present: !!referrerPolicy,
              value: referrerPolicy,
            },
            permissionsPolicy: {
              present: !!permissionsPolicy,
              value: permissionsPolicy,
            },
          },
          issues: {
            critical: criticalIssues,
            warnings,
          },
          recommendations,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in check-security-headers function:", error);

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
