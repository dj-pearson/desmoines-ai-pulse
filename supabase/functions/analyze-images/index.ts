// ============================================================================
// Image Analysis Edge Function
// ============================================================================
// Purpose: Analyze images for SEO optimization (alt text, size, format)
// Returns: Image analysis with optimization recommendations
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ImageAnalysisRequest {
  url: string;
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

    const { url, saveResults = true }: ImageAnalysisRequest = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Analyzing images for: ${url}`);
    const startTime = Date.now();

    // Fetch the page
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = await response.text();
    const baseUrl = new URL(url);

    // Extract all images
    const imgRegex = /<img([^>]*)>/gi;
    const images: any[] = [];
    let position = 0;

    for (const match of html.matchAll(imgRegex)) {
      position++;
      const imgTag = match[1];

      // Extract attributes
      const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
      const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
      const titleMatch = imgTag.match(/title=["']([^"']*)["']/i);
      const widthMatch = imgTag.match(/width=["']?(\d+)["']?/i);
      const heightMatch = imgTag.match(/height=["']?(\d+)["']?/i);
      const loadingMatch = imgTag.match(/loading=["']([^"']+)["']/i);
      const srcsetMatch = imgTag.match(/srcset=["']([^"']+)["']/i);

      if (!srcMatch) continue;

      const imageSrc = srcMatch[1];
      const altText = altMatch ? altMatch[1] : null;
      const titleAttribute = titleMatch ? titleMatch[1] : null;
      const width = widthMatch ? parseInt(widthMatch[1]) : null;
      const height = heightMatch ? parseInt(heightMatch[1]) : null;
      const loadingAttribute = loadingMatch ? loadingMatch[1] : null;
      const hasSrcset = !!srcsetMatch;

      // Resolve image URL
      let imageUrl;
      try {
        imageUrl = new URL(imageSrc, url).href;
      } catch {
        imageUrl = imageSrc;
      }

      // Determine file format from URL
      const urlPath = imageUrl.split('?')[0];
      const extension = urlPath.split('.').pop()?.toLowerCase() || '';
      const fileFormat = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(
        extension
      )
        ? extension
        : 'unknown';

      // Check if optimized format
      const isOptimizedFormat = ['webp', 'avif', 'svg'].includes(fileFormat);

      // Calculate aspect ratio
      const aspectRatio =
        width && height ? Math.round((width / height) * 100) / 100 : null;

      // Check if responsive
      const isResponsive = hasSrcset || imgTag.includes('<picture');
      const hasPictureElement = false; // Would need to parse parent elements

      // Analyze issues
      const issues: string[] = [];
      let issueSeverity = "low";

      if (!altText || altText.trim() === "") {
        issues.push("Missing alt text");
        issueSeverity = "high";
      } else if (altText.length < 5) {
        issues.push("Alt text too short (should be descriptive)");
        issueSeverity = "medium";
      } else if (altText.length > 125) {
        issues.push("Alt text too long (recommended: under 125 characters)");
        issueSeverity = "low";
      }

      if (!isOptimizedFormat && fileFormat !== 'svg') {
        issues.push(
          `Not using modern format (consider WebP or AVIF instead of ${fileFormat})`
        );
        if (issueSeverity === "low") issueSeverity = "medium";
      }

      if (!isResponsive) {
        issues.push("Not using responsive images (consider srcset or picture element)");
        if (issueSeverity === "low") issueSeverity = "medium";
      }

      // Try to fetch image to get actual file size
      let fileSizeBytes: number | null = null;
      let isOversized = false;
      let potentialSavingsBytes: number | null = null;
      let potentialSavingsPercentage: number | null = null;

      try {
        const imgResponse = await fetch(imageUrl, { method: "HEAD" });
        const contentLength = imgResponse.headers.get("content-length");
        if (contentLength) {
          fileSizeBytes = parseInt(contentLength);

          // Check if oversized (>100KB for regular images, >500KB for hero images)
          const maxSize = position === 1 ? 500000 : 100000;
          if (fileSizeBytes > maxSize) {
            isOversized = true;
            issues.push(
              `File size too large: ${Math.round(fileSizeBytes / 1024)}KB (recommended: <${Math.round(maxSize / 1024)}KB)`
            );
            issueSeverity = "high";

            // Estimate savings (assuming 50% compression with WebP)
            if (!isOptimizedFormat) {
              potentialSavingsBytes = Math.round(fileSizeBytes * 0.5);
              potentialSavingsPercentage = 50;
            }
          }
        }
      } catch (error) {
        console.log(`Could not fetch image size for ${imageUrl}:`, error.message);
      }

      // Check if above fold (first 2 images are likely above fold)
      const isAboveFold = position <= 2;
      if (isAboveFold && loadingAttribute === "lazy") {
        issues.push(
          "Above-fold image should not be lazy-loaded (impacts LCP)"
        );
        issueSeverity = "high";
      }

      // Generate recommendations
      const recommendations: string[] = [];

      if (!altText || altText.trim() === "") {
        recommendations.push("Add descriptive alt text that describes the image content");
      }

      if (!isOptimizedFormat && fileFormat !== 'svg') {
        recommendations.push(
          `Convert to WebP or AVIF format for ${potentialSavingsPercentage || 30}% size reduction`
        );
      }

      if (!isResponsive) {
        recommendations.push(
          "Add srcset attribute with multiple image sizes for responsive loading"
        );
      }

      if (isOversized) {
        recommendations.push("Compress image to reduce file size and improve loading speed");
      }

      if (!isAboveFold && !loadingAttribute) {
        recommendations.push('Add loading="lazy" attribute to defer loading');
      }

      // Save to database
      if (saveResults) {
        await supabase.from("seo_image_analysis").insert({
          page_url: url,
          image_url: imageUrl,
          image_position: position,
          alt_text: altText,
          title_attribute: titleAttribute,
          width,
          height,
          aspect_ratio: aspectRatio,
          file_size_bytes: fileSizeBytes,
          file_format: fileFormat,
          is_optimized_format: isOptimizedFormat,
          is_oversized: isOversized,
          recommended_max_size_kb: position === 1 ? 500 : 100,
          potential_savings_bytes: potentialSavingsBytes,
          potential_savings_percentage: potentialSavingsPercentage,
          is_responsive: isResponsive,
          has_srcset: hasSrcset,
          has_picture_element: hasPictureElement,
          loading_attribute: loadingAttribute,
          is_above_fold: isAboveFold,
          issues,
          issue_severity: issueSeverity,
          recommendations,
        });
      }

      images.push({
        url: imageUrl,
        position,
        altText,
        width,
        height,
        fileFormat,
        fileSizeKB: fileSizeBytes ? Math.round(fileSizeBytes / 1024) : null,
        isOptimized: isOptimizedFormat,
        isResponsive,
        issues,
        issueSeverity,
        recommendations,
      });
    }

    // Calculate summary statistics
    const totalImages = images.length;
    const imagesWithoutAlt = images.filter(
      (img) => !img.altText || img.altText.trim() === ""
    ).length;
    const oversizedImages = images.filter((img) => img.issues.some(i => i.includes('too large'))).length;
    const nonOptimizedFormats = images.filter((img) => !img.isOptimized && img.fileFormat !== 'svg').length;
    const nonResponsiveImages = images.filter((img) => !img.isResponsive).length;

    const executionTime = Date.now() - startTime;

    console.log(
      `Image analysis completed: ${totalImages} images analyzed in ${executionTime}ms`
    );

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          totalImages,
          imagesWithoutAlt,
          oversizedImages,
          nonOptimizedFormats,
          nonResponsiveImages,
        },
        images,
        executionTime,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-images function:", error);

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
