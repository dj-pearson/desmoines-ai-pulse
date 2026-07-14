/**
 * generate-pseo-page Edge Function
 *
 * Generates pSEO page content using Claude AI based on taxonomy dimensions.
 * Supports single page generation and batch generation.
 *
 * Endpoints:
 *   POST /generate-pseo-page
 *     Body: { pageTypeId, dimensions, batchSize?, forceRegenerate? }
 *
 * SECURITY: verify_jwt = false
 * Reason: Background batch processing job for generating pSEO content
 * Alternative measures: Claude API key required, rate limiting applied
 * Risk level: MEDIUM
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAIConfig, getClaudeHeaders, getAnthropicApiKey } from "../../aiConfig.ts";
import { checkRateLimit } from "../../rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DimensionRef {
  dimension: string;
  slug: string;
  name: string;
  tier: number;
}

interface GenerateRequest {
  pageTypeId: string;
  dimensions: DimensionRef[];
  forceRegenerate?: boolean;
  batchMode?: boolean;
  batchSize?: number;
  tier1Only?: boolean;
}

export default (async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const rateLimit = checkRateLimit(req, {
    max: 20,
    message: 'pSEO generation rate limit exceeded.',
  });
  if (!rateLimit.success) {
    return rateLimit.response!;
  }

  try {
    const body: GenerateRequest = await req.json();
    const { pageTypeId, dimensions, forceRegenerate = false } = body;

    if (!pageTypeId || !dimensions?.length) {
      return jsonResponse({ error: 'pageTypeId and dimensions are required' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const claudeApiKey = getAnthropicApiKey();

    if (!claudeApiKey) {
      return jsonResponse({ error: 'Claude API key not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const aiConfig = await getAIConfig(supabaseUrl, supabaseKey);

    // Build slug from dimensions
    const slug = buildSlug(pageTypeId, dimensions);
    const pageId = buildPageId(pageTypeId, dimensions);

    // Check if page already exists
    if (!forceRegenerate) {
      const { data: existing } = await supabase
        .from('pseo_pages')
        .select('id')
        .eq('id', pageId)
        .single();

      if (existing) {
        return jsonResponse({
          success: true,
          skipped: true,
          message: 'Page already exists. Use forceRegenerate to overwrite.',
          pageId,
          slug,
        });
      }
    }

    // Build prompt
    const currentDate = new Date().toISOString().split('T')[0];
    const currentSeason = getCurrentSeason();

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(pageTypeId, dimensions, currentDate, currentSeason);

    // Call Claude
    const startTime = Date.now();
    const claudeHeaders = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseKey);
    const claudeResponse = await fetch(aiConfig.api_endpoint, {
      method: 'POST',
      headers: claudeHeaders,
      body: JSON.stringify({
        model: aiConfig.default_model,
        max_tokens: aiConfig.max_tokens_large,
        temperature: aiConfig.temperature_precise,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', errorText);
      return jsonResponse({ error: 'AI generation failed', details: errorText }, 500);
    }

    const claudeData = await claudeResponse.json();
    const generationTimeMs = Date.now() - startTime;

    // Parse AI response
    const aiText = claudeData.content?.[0]?.text ?? '';
    let parsedContent;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      parsedContent = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return jsonResponse({ error: 'Failed to parse AI response', raw: aiText.slice(0, 500) }, 500);
    }

    // Build full page record
    const breadcrumbs = buildBreadcrumbs(pageTypeId, dimensions);
    const title = parsedContent.seo?.title ?? buildFallbackTitle(dimensions);
    const description = parsedContent.seo?.description ?? '';
    const h1 = parsedContent.seo?.h1 ?? title;
    const keywords = parsedContent.seo?.keywords ?? [];

    const pageRecord = {
      id: pageId,
      slug,
      page_type_id: pageTypeId,
      dimensions,
      seo: {
        title,
        description,
        h1,
        keywords,
        canonicalUrl: slug,
        ogType: 'website',
      },
      sections: parsedContent.sections ?? [],
      related_pages: [],
      structured_data: {
        '@type': 'WebPage',
        breadcrumb: breadcrumbs,
        faqItems: parsedContent.sections?.find((s: { type: string }) => s.type === 'faq')?.faqs ?? [],
      },
      generation_meta: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'generate-pseo-page',
        promptVersion: '2.0',
        modelUsed: aiConfig.default_model,
        wordCount: aiText.split(/\s+/).length,
        refreshSchedule: getRefreshSchedule(dimensions),
      },
      is_published: true,
      quality_score: 0.8,
    };

    // Upsert to database
    const { error: upsertError } = await supabase
      .from('pseo_pages')
      .upsert(pageRecord, { onConflict: 'id' });

    if (upsertError) {
      console.error('Database upsert error:', upsertError);
      return jsonResponse({ error: 'Failed to save page', details: upsertError.message }, 500);
    }

    return jsonResponse({
      success: true,
      pageId,
      slug,
      generationTimeMs,
      wordCount: pageRecord.generation_meta.wordCount,
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return jsonResponse({ error: 'Internal server error', details: String(error) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildSlug(pageTypeId: string, dimensions: DimensionRef[]): string {
  const contentType = dimensions.find(d => d.dimension === 'content_type');
  const location = dimensions.find(d => d.dimension === 'location');
  const audience = dimensions.find(d => d.dimension === 'audience');
  const temporal = dimensions.find(d => d.dimension === 'temporal');
  const category = dimensions.find(d => d.dimension === 'category');

  const parts: string[] = [];

  if (contentType) parts.push(contentType.slug);
  else if (category) parts.push(category.slug);
  else if (pageTypeId === 'audience-temporal') parts.push('things-to-do');
  else if (pageTypeId === 'location-guide') parts.push('guide');

  if (location) parts.push(location.slug);
  if (audience) parts.push(audience.slug);
  if (temporal) parts.push(temporal.slug);
  if (category && contentType) parts.push(category.slug);

  return '/' + parts.join('/');
}

function buildPageId(pageTypeId: string, dimensions: DimensionRef[]): string {
  const dimSlugs = dimensions.map(d => d.slug).sort().join('_');
  return `${pageTypeId}__${dimSlugs}`;
}

function buildBreadcrumbs(pageTypeId: string, dimensions: DimensionRef[]) {
  const crumbs = [{ name: 'Home', url: '/' }];

  const contentType = dimensions.find(d => d.dimension === 'content_type');
  const location = dimensions.find(d => d.dimension === 'location');
  const category = dimensions.find(d => d.dimension === 'category');

  if (contentType) {
    crumbs.push({ name: contentType.name, url: `/${contentType.slug}` });
  }
  if (location) {
    crumbs.push({ name: location.name, url: `/${contentType?.slug ?? 'guide'}/${location.slug}` });
  }
  if (category) {
    crumbs.push({ name: category.name, url: `/${contentType?.slug ?? 'explore'}/${category.slug}` });
  }

  return crumbs;
}

function buildFallbackTitle(dimensions: DimensionRef[]): string {
  return dimensions.map(d => d.name).join(' in ') + ' | Des Moines AI Pulse';
}

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

function getRefreshSchedule(dimensions: DimensionRef[]): string {
  const hasTemporal = dimensions.some(d => d.dimension === 'temporal');
  const temporalSlug = dimensions.find(d => d.dimension === 'temporal')?.slug;

  if (temporalSlug === 'today') return 'daily';
  if (temporalSlug === 'this-weekend' || temporalSlug === 'this-week') return 'daily';
  if (hasTemporal) return 'weekly';
  return 'monthly';
}

// ---------------------------------------------------------------------------
// Prompt Builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are a knowledgeable Des Moines, Iowa local who writes authoritative, practical guides for residents and visitors. You have deep familiarity with every neighborhood, restaurant, bar, park, and event venue in the Greater Des Moines metro area.

Your writing style:
- Conversational but authoritative — like a friend who really knows the city
- Specific and actionable — include names, practical tips, and local context
- Honest — mention limitations and when something isn't worth the hype
- Local-first — use neighborhood names and local landmarks as reference points
- SEO-aware — naturally incorporate keywords without stuffing

Geography you know well:
- Core: Downtown, East Village, Valley Junction, Drake, Sherman Hill, Ingersoll, Beaverdale
- Suburbs: West Des Moines, Ankeny, Urbandale, Johnston, Waukee, Altoona, Clive
- Key landmarks: Iowa State Capitol, Pappajohn Sculpture Park, Principal Park, Wells Fargo Arena

Rules:
1. NEVER fabricate specific business names or addresses you're not confident about — describe types of places generically if unsure
2. Include "Des Moines" or the specific neighborhood name 2-4 times naturally
3. Reference cross-streets, landmarks, or well-known nearby businesses for context
4. Include seasonal awareness when relevant
5. Write for PEOPLE first, search engines second
6. Output ONLY valid JSON matching the exact schema specified — no markdown, no explanation`;
}

function buildUserPrompt(
  pageTypeId: string,
  dimensions: DimensionRef[],
  currentDate: string,
  currentSeason: string
): string {
  const dimList = dimensions.map(d => `${d.dimension}: ${d.name}`).join(', ');
  const contentType = dimensions.find(d => d.dimension === 'content_type');
  const location = dimensions.find(d => d.dimension === 'location');
  const audience = dimensions.find(d => d.dimension === 'audience');
  const temporal = dimensions.find(d => d.dimension === 'temporal');
  const category = dimensions.find(d => d.dimension === 'category');

  const sections: string[] = [];

  // Section 1: Hero Intro
  sections.push(`SECTION 1 - hero_intro: Write a 50-80 word engaging introduction for a page about ${dimList} in Des Moines. Hook the reader immediately. Don't start with "Welcome to" or "Looking for".`);

  // Section 2: Curated Picks
  let pickType = 'recommendations';
  if (contentType?.slug === 'restaurants' || category?.slug?.match(/italian|mexican|asian|bbq|brunch|coffee|steakhouse/)) {
    pickType = 'restaurant recommendations with specific dish suggestions, price context, and best time to visit';
  } else if (contentType?.slug === 'events') {
    pickType = 'event recommendations with ticket prices, arrival tips, and what to bring';
  } else if (contentType?.slug === 'attractions') {
    pickType = 'attraction recommendations with visit duration, admission cost, and best time to go';
  }
  sections.push(`SECTION 2 - curated_picks: Generate 6-8 ${pickType}. Each must have: name, description (2-3 sentences), whyWeRecommend (1 sentence), insiderTip (1 sentence). If you aren't confident about a specific business name, describe the type of place generically.`);

  // Section 3: Local Tips
  sections.push(`SECTION 3 - local_tips: Write 4-6 practical local tips specific to ${dimList}. Include parking tips, timing advice, money-saving hacks. Be specific, not generic.`);

  // Section 4: FAQ
  sections.push(`SECTION 4 - faq: Generate 4-6 FAQ items based on real search queries about ${dimList} in Des Moines. Include questions about cost, timing, and Des Moines-specific topics.`);

  // Conditional sections
  if (temporal) {
    sections.push(`SECTION 5 - seasonal_context: Write 100-150 words about ${contentType?.name ?? 'things to do'} during ${temporal.name} in Des Moines. Include weather expectations, what's in season, and seasonal traditions.`);
  }
  if (location) {
    sections.push(`SECTION 6 - neighborhood_profile: Write 100-150 words about ${location.name}'s character, walkability, parking, and what makes it unique.`);
  }
  if (audience) {
    sections.push(`SECTION 7 - audience_callout: Write 80-120 words directly addressing ${audience.name} visitors. Use second person. Be specific about how Des Moines serves their needs.`);
  }

  return `Generate a complete pSEO page for: ${dimList}
Page type: ${pageTypeId}
Date: ${currentDate}, Season: ${currentSeason}

${sections.join('\n\n')}

SEO METADATA: Also generate seo_title (50-60 chars), seo_description (150-160 chars), seo_h1, and seo_keywords (8-12 keywords).

OUTPUT FORMAT - Return ONLY this JSON (no markdown):
{
  "seo": {
    "title": "string",
    "description": "string",
    "h1": "string",
    "keywords": ["string"]
  },
  "sections": [
    {"id": "hero_intro", "type": "hero_intro", "content": "string"},
    {"id": "curated_picks", "type": "curated_picks", "heading": "string", "items": [{"name": "string", "description": "string", "whyWeRecommend": "string", "insiderTip": "string", "priceRange": "string", "tags": ["string"]}]},
    {"id": "local_tips", "type": "local_tips", "heading": "string", "tips": ["string"]},
    {"id": "faq", "type": "faq", "heading": "string", "faqs": [{"question": "string", "answer": "string"}]}
    ${temporal ? ',{"id": "seasonal_context", "type": "seasonal_context", "heading": "string", "content": "string"}' : ''}
    ${location ? ',{"id": "neighborhood_profile", "type": "neighborhood_profile", "heading": "string", "content": "string"}' : ''}
    ${audience ? ',{"id": "audience_callout", "type": "audience_callout", "heading": "string", "content": "string"}' : ''}
  ]
}`;
}
