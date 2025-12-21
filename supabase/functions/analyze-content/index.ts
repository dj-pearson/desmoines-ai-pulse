// ============================================================================
// Content Analysis Edge Function
// ============================================================================
// Purpose: Analyze content quality, readability, and SEO optimization
// Returns: Content scores with AI-powered recommendations
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContentRequest {
  url: string;
  targetKeyword?: string;
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

    const { url, targetKeyword, saveResults = true }: ContentRequest =
      await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Analyzing content for: ${url}`);
    const startTime = Date.now();

    // Fetch the page
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = await response.text();

    // Extract text content
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || null;
    const metaDescription =
      html.match(
        /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
      )?.[1]?.trim() || null;
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() || null;

    // Extract main content (remove scripts, styles, nav, footer)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Calculate content metrics
    const wordCount = textContent.split(/\s+/).filter((w) => w.length > 0).length;
    const characterCount = textContent.length;
    const sentences = textContent.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const sentenceCount = sentences.length;
    const paragraphCount = (html.match(/<p[^>]*>/gi) || []).length;

    const averageWordsPerSentence =
      sentenceCount > 0 ? wordCount / sentenceCount : 0;

    // Calculate reading time (average 200 words per minute)
    const readingTimeMinutes = Math.ceil(wordCount / 200);

    // Calculate Flesch Reading Ease (approximate)
    // Formula: 206.835 - 1.015 × (words/sentences) - 84.6 × (syllables/words)
    // We'll estimate syllables as 1.5 per word for approximation
    const estimatedSyllables = wordCount * 1.5;
    const syllablesPerWord = estimatedSyllables / wordCount;
    let readabilityScore =
      206.835 - 1.015 * averageWordsPerSentence - 84.6 * syllablesPerWord;
    readabilityScore = Math.max(0, Math.min(100, readabilityScore));

    // Determine readability grade
    let readabilityGrade = "";
    if (readabilityScore >= 90) readabilityGrade = "5th grade";
    else if (readabilityScore >= 80) readabilityGrade = "6th grade";
    else if (readabilityScore >= 70) readabilityGrade = "7th grade";
    else if (readabilityScore >= 60) readabilityGrade = "8th-9th grade";
    else if (readabilityScore >= 50) readabilityGrade = "10th-12th grade";
    else if (readabilityScore >= 30) readabilityGrade = "College";
    else readabilityGrade = "College graduate";

    // Count headings
    const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
    const h3Count = (html.match(/<h3[^>]*>/gi) || []).length;

    // Count images
    const imagesCount = (html.match(/<img[^>]*>/gi) || []).length;
    const hasFeaturedImage = html.match(
      /<img[^>]*(?:class|id)=["'][^"']*(?:featured|hero|banner)[^"']*["']/i
    );

    // Count links
    const internalLinksCount = (
      html.match(/<a[^>]*href=["'](?:\/|#)[^"']*["']/gi) || []
    ).length;
    const externalLinksCount = (
      html.match(/<a[^>]*href=["']https?:\/\/[^"']+["']/gi) || []
    ).length;

    // Check content structure
    const hasIntroduction = textContent.length > 0 && paragraphCount > 0;
    const hasConclusion = paragraphCount >= 3;
    const hasList = /<(?:ul|ol)[^>]*>/i.test(html);
    const hasTableOfContents = /<(?:nav|div)[^>]*(?:class|id)=["'][^"']*toc[^"']*["']/i.test(
      html
    );

    // Keyword analysis
    let keywordFrequency = 0;
    let keywordDensity = 0;
    let keywordInTitle = false;
    let keywordInDescription = false;
    let keywordInH1 = false;
    let keywordInFirstParagraph = false;

    if (targetKeyword) {
      const keyword = targetKeyword.toLowerCase();
      const lowerContent = textContent.toLowerCase();
      keywordFrequency = (lowerContent.match(new RegExp(keyword, "g")) || [])
        .length;
      keywordDensity = wordCount > 0 ? (keywordFrequency / wordCount) * 100 : 0;

      keywordInTitle = title?.toLowerCase().includes(keyword) || false;
      keywordInDescription =
        metaDescription?.toLowerCase().includes(keyword) || false;
      keywordInH1 = h1?.toLowerCase().includes(keyword) || false;

      // Check first paragraph
      const firstParagraph = html.match(/<p[^>]*>([^<]+)<\/p>/i)?.[1] || "";
      keywordInFirstParagraph = firstParagraph.toLowerCase().includes(keyword);
    }

    // Calculate scores
    let overallContentScore = 100;
    let keywordOptimizationScore = 100;
    const readabilityScoreRating = Math.round(readabilityScore);
    let structureScore = 100;
    let engagementScore = 100;

    // Keyword optimization scoring
    if (targetKeyword) {
      if (!keywordInTitle) keywordOptimizationScore -= 25;
      if (!keywordInDescription) keywordOptimizationScore -= 20;
      if (!keywordInH1) keywordOptimizationScore -= 15;
      if (!keywordInFirstParagraph) keywordOptimizationScore -= 15;
      if (keywordDensity < 0.5 || keywordDensity > 2.5)
        keywordOptimizationScore -= 15;
    }

    // Structure scoring
    if (!h1) structureScore -= 20;
    if (h2Count === 0) structureScore -= 15;
    if (!hasList) structureScore -= 10;
    if (paragraphCount < 3) structureScore -= 15;

    // Engagement scoring
    if (imagesCount === 0) engagementScore -= 20;
    if (internalLinksCount < 3) engagementScore -= 15;
    if (externalLinksCount === 0) engagementScore -= 10;
    if (wordCount < 300) engagementScore -= 25;

    // Overall score (weighted average)
    overallContentScore = Math.round(
      keywordOptimizationScore * 0.3 +
        readabilityScoreRating * 0.2 +
        structureScore * 0.25 +
        engagementScore * 0.25
    );

    // Collect issues
    const issues: any[] = [];
    let issuesCount = 0;

    if (!title) {
      issues.push({
        severity: "critical",
        category: "meta",
        issue: "Missing title tag",
        suggestion: "Add a descriptive title (50-60 characters)",
      });
      issuesCount++;
    }

    if (wordCount < 300) {
      issues.push({
        severity: "high",
        category: "content",
        issue: "Content too short",
        suggestion: `Add more content (current: ${wordCount} words, recommended: 500+ words)`,
      });
      issuesCount++;
    }

    if (h2Count === 0) {
      issues.push({
        severity: "medium",
        category: "structure",
        issue: "No H2 headings",
        suggestion: "Add H2 headings to improve content structure",
      });
      issuesCount++;
    }

    if (targetKeyword && !keywordInTitle) {
      issues.push({
        severity: "high",
        category: "keyword",
        issue: "Target keyword not in title",
        suggestion: `Include "${targetKeyword}" in the title tag`,
      });
      issuesCount++;
    }

    if (readabilityScore < 50) {
      issues.push({
        severity: "medium",
        category: "readability",
        issue: "Content difficult to read",
        suggestion: "Use shorter sentences and simpler words",
      });
      issuesCount++;
    }

    // Determine optimization priority
    let optimizationPriority = "medium";
    if (overallContentScore < 40) optimizationPriority = "critical";
    else if (overallContentScore < 60) optimizationPriority = "high";
    else if (overallContentScore >= 80) optimizationPriority = "low";

    // Save to database
    if (saveResults) {
      const { error } = await supabase.from("seo_content_optimization").insert({
        url,
        title,
        meta_description: metaDescription,
        h1,
        word_count: wordCount,
        character_count: characterCount,
        paragraph_count: paragraphCount,
        sentence_count: sentenceCount,
        average_words_per_sentence: Math.round(averageWordsPerSentence * 100) / 100,
        readability_score: Math.round(readabilityScore * 100) / 100,
        readability_grade_level: readabilityGrade,
        reading_time_minutes: readingTimeMinutes,
        overall_content_score: overallContentScore,
        keyword_optimization_score: keywordOptimizationScore,
        readability_score_rating: readabilityScoreRating,
        structure_score: structureScore,
        engagement_score: engagementScore,
        target_keyword: targetKeyword,
        keyword_density: Math.round(keywordDensity * 100) / 100,
        keyword_in_title: keywordInTitle,
        keyword_in_description: keywordInDescription,
        keyword_in_h1: keywordInH1,
        keyword_in_first_paragraph: keywordInFirstParagraph,
        keyword_frequency: keywordFrequency,
        has_introduction: hasIntroduction,
        has_conclusion: hasConclusion,
        has_call_to_action: false, // Would need more sophisticated detection
        has_table_of_contents: hasTableOfContents,
        has_lists: hasList,
        has_images: imagesCount > 0,
        internal_links_count: internalLinksCount,
        external_links_count: externalLinksCount,
        images_count: imagesCount,
        has_featured_image: !!hasFeaturedImage,
        issues,
        issues_count: issuesCount,
        optimization_status: "needs_optimization",
        optimization_priority: optimizationPriority,
      });

      if (error) {
        console.error("Error saving content analysis:", error);
      }
    }

    const executionTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        analysis: {
          url,
          scores: {
            overall: overallContentScore,
            keywordOptimization: keywordOptimizationScore,
            readability: readabilityScoreRating,
            structure: structureScore,
            engagement: engagementScore,
          },
          metrics: {
            wordCount,
            characterCount,
            paragraphCount,
            sentenceCount,
            averageWordsPerSentence: Math.round(averageWordsPerSentence * 100) / 100,
            readingTimeMinutes,
            readabilityScore: Math.round(readabilityScore * 100) / 100,
            readabilityGrade,
          },
          keyword: targetKeyword
            ? {
                keyword: targetKeyword,
                frequency: keywordFrequency,
                density: Math.round(keywordDensity * 100) / 100,
                inTitle: keywordInTitle,
                inDescription: keywordInDescription,
                inH1: keywordInH1,
                inFirstParagraph: keywordInFirstParagraph,
              }
            : null,
          structure: {
            hasIntroduction,
            hasConclusion,
            hasList,
            hasTableOfContents,
            h2Count,
            h3Count,
            imagesCount,
            internalLinksCount,
            externalLinksCount,
          },
          issues,
          issuesCount,
          optimizationPriority,
        },
        executionTime,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-content function:", error);

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
