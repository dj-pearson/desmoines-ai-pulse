/**
 * pSEO 2.0 — Phase 4: Enhanced Generation Prompt Library
 *
 * One complete prompt per page type, structured as:
 *   1. System prompt (role + constraints)
 *   2. Context injection (taxonomy context objects, never inline)
 *   3. Data injection (real database records)
 *   4. Schema injection (empty schema to fill)
 *   5. Output rules (JSON only, no markdown)
 *   6. Quality constraints (page-type-specific)
 *
 * Prompts produce the EXACT JSON matching detailedSchemas.ts interfaces.
 */

import type { DimensionValue, DimensionKey } from './taxonomy';
import type { PageTypeId } from './detailedSchemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnhancedPromptContext {
  pageTypeId: PageTypeId;
  dimensions: Partial<Record<DimensionKey, DimensionValue>>;
  /** Real records from Supabase to reference */
  dbRecords: DbRecord[];
  /** IDs of records referenced */
  dbRecordIds: string[];
  currentDate: string;
  currentSeason: 'spring' | 'summer' | 'fall' | 'winter';
  /** All existing pSEO page slugs for internal linking */
  existingPageSlugs: string[];
}

export interface DbRecord {
  id: string;
  name: string;
  type: 'event' | 'restaurant' | 'attraction';
  location?: string;
  category?: string;
  rating?: number;
  price?: string;
  description?: string;
}

export interface StructuredPrompt {
  system: string;
  user: string;
  /** Estimated input tokens (for cost tracking) */
  estimatedInputTokens: number;
}

// ---------------------------------------------------------------------------
// Shared System Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Des Moines local guide writer for Des Moines AI Pulse (desmoinesaipulse.com). You write authoritative, practical, genuinely useful guides for residents and visitors of Greater Des Moines, Iowa.

## Your voice
- Conversational but authoritative — like a trusted friend who knows every corner of the city
- Specific — always include names, cross-streets, landmarks, and practical logistics
- Honest — mention limitations, parking issues, crowds, and when something is overrated
- Local-first — use neighborhood names as reference points, not addresses alone
- Seasonal — Iowa weather matters; reference it when relevant

## Geography you know
Core neighborhoods: Downtown (skywalk system, Court Ave), East Village (trendy, walkable), Valley Junction (historic, antiques), Drake (diverse, university), Sherman Hill (Victorian, historic), Ingersoll (restaurant corridor), Beaverdale (family, charming)
Suburbs: West Des Moines (Jordan Creek, Valley Junction), Ankeny (fastest growing, Prairie Trail), Urbandale (Living History Farms), Johnston (Terra Park), Waukee (Kettlestone), Altoona (Adventureland, Prairie Meadows)
Landmarks: Iowa State Capitol, Pappajohn Sculpture Park, Principal Park, Wells Fargo Arena, Greater Des Moines Botanical Garden, Science Center of Iowa, Des Moines Art Center, Blank Park Zoo, Adventureland, Living History Farms

## Hard rules
1. Output ONLY valid JSON. No markdown fences. No explanatory text. No preamble.
2. NEVER fabricate a specific business name, phone number, or address you aren't confident about. Use descriptive phrases instead.
3. Include "Des Moines" or the specific neighborhood/suburb name 2-4 times naturally in body text.
4. Every curated pick must have a unique, specific insider_tip — no generic "call ahead for reservations."
5. FAQ answers must include the location name and be 2-3 actionable sentences, not wishy-washy.
6. Match the EXACT JSON schema provided. Missing required fields = failure.`;

// ---------------------------------------------------------------------------
// Per-Page-Type Prompt Builders
// ---------------------------------------------------------------------------

export function buildPromptForPageType(ctx: EnhancedPromptContext): StructuredPrompt {
  const builder = PROMPT_BUILDERS[ctx.pageTypeId];
  if (!builder) {
    throw new Error(`No prompt builder for page type: ${ctx.pageTypeId}`);
  }
  return builder(ctx);
}

// ---------------------------------------------------------------------------
// 1. Content + Location
// ---------------------------------------------------------------------------

function buildContentLocationPrompt(ctx: EnhancedPromptContext): StructuredPrompt {
  const content = ctx.dimensions.content_type!;
  const location = ctx.dimensions.location!;

  const user = `## TASK
Generate a "${content.name} in ${location.name}" page for Des Moines AI Pulse.

## TAXONOMY CONTEXT — Content Type
${JSON.stringify(content.context, null, 2)}

## TAXONOMY CONTEXT — Location
${JSON.stringify(location.context, null, 2)}

## DATABASE RECORDS (reference these real businesses in your curated picks where appropriate)
${formatDbRecords(ctx.dbRecords)}

## GENERATION DATE
${ctx.currentDate} (${ctx.currentSeason})

## QUALITY CONSTRAINTS
- Hero intro: 2-3 sentences, mention ${location.name} in first sentence
- Curated picks: exactly 6-8 items. Each item needs name, description (2-3 sentences), why_we_recommend (1 sentence), insider_tip (1 unique sentence), tags (2-4)
- Neighborhood profile: 100-150 words about ${location.name}'s character, parking, walkability, vibe
- Local tips: exactly 4-6 tips specific to ${content.name.toLowerCase()} in ${location.name}
- FAQ: exactly 4-6 questions matching real search queries for "${content.name.toLowerCase()} in ${location.name} des moines"
- Related pages: exactly 4-6 links
- All text must pass: "Would this be useful without search engines?"

## OUTPUT SCHEMA
Return this exact JSON structure:
{
  "seo": {
    "description": "string, max 155 chars, includes CTA",
    "keywords": ["5-8 keywords mixing head terms and long-tail"]
  },
  "hero": {
    "headline": "string, 8-15 words, niche-aware",
    "subheadline": "string, 10-20 words, specific value prop",
    "intro": "string, 2-3 sentences, 40-60 words"
  },
  "curated_picks": {
    "heading": "string",
    "items": [{
      "name": "string",
      "description": "string, 30-50 words",
      "why_we_recommend": "string, 1 sentence",
      "insider_tip": "string, 1 unique sentence",
      "price_range": "$|$$|$$$|$$$$",
      "tags": ["2-4 tags"]
    }]
  },
  "neighborhood_profile": {
    "heading": "string",
    "content": "string, 100-150 words",
    "walkability": "high|medium|low",
    "parking_difficulty": "easy|moderate|difficult",
    "vibe": "string, 3-5 words"
  },
  "local_tips": {
    "heading": "string",
    "tips": ["4-6 tip strings, each 1-2 sentences"]
  },
  "faq": [{"question": "string", "answer": "string, 2-3 sentences"}],
  "related_pages": [{"title": "string", "url": "string", "relationship": "parent|child|sibling|cross", "description": "string, 1 sentence"}],
  "cta": {
    "heading": "string, 5-10 words, action-oriented",
    "body": "string, 1-2 sentences"
  }
}`;

  return { system: SYSTEM_PROMPT, user, estimatedInputTokens: estimateTokens(user) };
}

// ---------------------------------------------------------------------------
// 2. Content + Audience
// ---------------------------------------------------------------------------

function buildContentAudiencePrompt(ctx: EnhancedPromptContext): StructuredPrompt {
  const content = ctx.dimensions.content_type!;
  const audience = ctx.dimensions.audience!;

  const user = `## TASK
Generate a "${audience.name} ${content.name} in Des Moines" page.

## TAXONOMY CONTEXT — Content Type
${JSON.stringify(content.context, null, 2)}

## TAXONOMY CONTEXT — Audience
${JSON.stringify(audience.context, null, 2)}

## DATABASE RECORDS
${formatDbRecords(ctx.dbRecords)}

## DATE: ${ctx.currentDate} (${ctx.currentSeason})

## QUALITY CONSTRAINTS
- Write in second person ("you") in the audience_callout section
- Curated picks must be filtered for this specific audience — a "date night" pick is different from a "families" pick
- FAQ questions must reflect how THIS audience searches (use their search_behavior from context)
- Every tip must be actionable for THIS audience specifically
- Hero headline must speak to the audience's pain points

## OUTPUT SCHEMA
{
  "seo": { "description": "max 155 chars", "keywords": ["5-8"] },
  "hero": { "headline": "8-15 words", "subheadline": "10-20 words", "intro": "2-3 sentences" },
  "audience_callout": {
    "heading": "string, speaks to ${audience.name}",
    "content": "string, 80-120 words, second person",
    "key_considerations": ["3-5 specific considerations for ${audience.name}"]
  },
  "curated_picks": {
    "heading": "string",
    "items": [{"name":"","description":"30-50 words","why_we_recommend":"1 sentence","insider_tip":"1 sentence","price_range":"$-$$$$","tags":["2-4"]}]
  },
  "local_tips": { "heading": "string", "tips": ["4-6 audience-specific tips"] },
  "faq": [{"question":"","answer":"2-3 sentences"}],
  "related_pages": [{"title":"","url":"","relationship":"parent|child|sibling|cross","description":""}],
  "cta": { "heading": "5-10 words", "body": "1-2 sentences" }
}`;

  return { system: SYSTEM_PROMPT, user, estimatedInputTokens: estimateTokens(user) };
}

// ---------------------------------------------------------------------------
// 3. Content + Temporal
// ---------------------------------------------------------------------------

function buildContentTemporalPrompt(ctx: EnhancedPromptContext): StructuredPrompt {
  const content = ctx.dimensions.content_type!;
  const temporal = ctx.dimensions.temporal!;

  const user = `## TASK
Generate a "${content.name} ${temporal.name} in Des Moines" page.

## TAXONOMY CONTEXT — Content Type
${JSON.stringify(content.context, null, 2)}

## TAXONOMY CONTEXT — Temporal
${JSON.stringify(temporal.context, null, 2)}

## DATABASE RECORDS
${formatDbRecords(ctx.dbRecords)}

## DATE: ${ctx.currentDate} (${ctx.currentSeason})

## QUALITY CONSTRAINTS
- Seasonal context must reference Iowa weather patterns specifically
- For "today"/"this-weekend": emphasize urgency and real-time value
- For months: reference that month's signature events (e.g., August = Iowa State Fair)
- For seasons: reference seasonal traditions, outdoor availability, clothing needs
- Curated picks must be appropriate for the time period
- Hero must create urgency for time-bound content

## OUTPUT SCHEMA
{
  "seo": { "description": "max 155 chars, time-aware", "keywords": ["5-8 including temporal terms"] },
  "hero": { "headline": "8-15 words, time-aware", "subheadline": "10-20 words", "intro": "2-3 sentences" },
  "seasonal_context": {
    "heading": "string",
    "content": "100-150 words on ${temporal.name} in Des Moines",
    "weather_note": "1 sentence on weather expectations",
    "seasonal_highlights": ["3-5 highlights specific to ${temporal.name}"]
  },
  "curated_picks": {
    "heading": "string, time-aware",
    "items": [{"name":"","description":"30-50 words","why_we_recommend":"","insider_tip":"","price_range":"$-$$$$","tags":["2-4"]}]
  },
  "local_tips": { "heading": "string", "tips": ["4-6 time-specific tips"] },
  "faq": [{"question":"","answer":"2-3 sentences"}],
  "related_pages": [{"title":"","url":"","relationship":"","description":""}],
  "cta": { "heading": "5-10 words", "body": "1-2 sentences" }
}`;

  return { system: SYSTEM_PROMPT, user, estimatedInputTokens: estimateTokens(user) };
}

// ---------------------------------------------------------------------------
// 4. Content + Category
// ---------------------------------------------------------------------------

function buildContentCategoryPrompt(ctx: EnhancedPromptContext): StructuredPrompt {
  const content = ctx.dimensions.content_type!;
  const category = ctx.dimensions.category!;

  const user = `## TASK
Generate a "Best ${category.name} ${content.name} in Des Moines" page.

## TAXONOMY CONTEXT — Content Type
${JSON.stringify(content.context, null, 2)}

## TAXONOMY CONTEXT — Category
${JSON.stringify(category.context, null, 2)}

## DATABASE RECORDS
${formatDbRecords(ctx.dbRecords)}

## DATE: ${ctx.currentDate} (${ctx.currentSeason})

## QUALITY CONSTRAINTS
- Curated picks: exactly 8-12 items (more for category pages which are primary landing pages)
- For food categories: include specific dish recommendations, not just restaurant names
- For event categories: include venue descriptions and what to expect
- Include cuisine_context for food categories (2-3 sentences on this cuisine's Des Moines scene)
- Deep expertise required — category pages must demonstrate authoritative knowledge

## OUTPUT SCHEMA
{
  "seo": { "description": "max 155 chars", "keywords": ["5-8 category-specific"] },
  "hero": { "headline": "8-15 words", "subheadline": "10-20 words", "intro": "2-3 sentences" },
  "curated_picks": {
    "heading": "string",
    "items": [{"name":"","description":"30-50 words","why_we_recommend":"","insider_tip":"","price_range":"$-$$$$","tags":["2-4"]}],
    "cuisine_context": "2-3 sentences on ${category.name} scene in Des Moines (include only for food categories)"
  },
  "local_tips": { "heading": "string", "tips": ["4-6 category-specific tips"] },
  "faq": [{"question":"","answer":"2-3 sentences"}],
  "related_pages": [{"title":"","url":"","relationship":"","description":""}],
  "cta": { "heading": "5-10 words", "body": "1-2 sentences" }
}`;

  return { system: SYSTEM_PROMPT, user, estimatedInputTokens: estimateTokens(user) };
}

// ---------------------------------------------------------------------------
// 5. Content + Location + Audience (triple)
// ---------------------------------------------------------------------------

function buildContentLocationAudiencePrompt(ctx: EnhancedPromptContext): StructuredPrompt {
  const content = ctx.dimensions.content_type!;
  const location = ctx.dimensions.location!;
  const audience = ctx.dimensions.audience!;

  const user = `## TASK
Generate a "${audience.name} ${content.name} in ${location.name}" page — a high-specificity long-tail page.

## TAXONOMY CONTEXT — Content Type
${JSON.stringify(content.context, null, 2)}

## TAXONOMY CONTEXT — Location
${JSON.stringify(location.context, null, 2)}

## TAXONOMY CONTEXT — Audience
${JSON.stringify(audience.context, null, 2)}

## DATABASE RECORDS
${formatDbRecords(ctx.dbRecords)}

## DATE: ${ctx.currentDate} (${ctx.currentSeason})

## QUALITY CONSTRAINTS
- This is a TRIPLE combination — content must be highly specific to ALL THREE dimensions
- A "Family Restaurant in East Village" page must differ substantially from "Family Restaurant in Downtown"
- Curated picks: 6-8 items filtered for BOTH the audience AND the location
- Neighborhood profile: 80-100 words (shorter than standalone location pages)
- FAQ: exactly 4 items (shorter for triple combos to avoid thin content)
- Every piece of content must pass: "Is this specific to ${audience.name} + ${location.name}?"

## OUTPUT SCHEMA
{
  "seo": { "description": "max 155 chars", "keywords": ["5-8 long-tail"] },
  "hero": { "headline": "8-15 words", "subheadline": "10-20 words", "intro": "2-3 sentences" },
  "audience_callout": { "heading": "", "content": "80-120 words", "key_considerations": ["3-5"] },
  "neighborhood_profile": { "heading": "", "content": "80-100 words", "walkability": "high|medium|low", "parking_difficulty": "easy|moderate|difficult", "vibe": "3-5 words" },
  "curated_picks": { "heading": "", "items": [{"name":"","description":"","why_we_recommend":"","insider_tip":"","price_range":"","tags":[]}] },
  "local_tips": { "heading": "", "tips": ["4-6"] },
  "faq": [{"question":"","answer":""}],
  "related_pages": [{"title":"","url":"","relationship":"","description":""}],
  "cta": { "heading": "", "body": "" }
}`;

  return { system: SYSTEM_PROMPT, user, estimatedInputTokens: estimateTokens(user) };
}

// ---------------------------------------------------------------------------
// 6. Content + Location + Temporal (triple)
// ---------------------------------------------------------------------------

function buildContentLocationTemporalPrompt(ctx: EnhancedPromptContext): StructuredPrompt {
  const content = ctx.dimensions.content_type!;
  const location = ctx.dimensions.location!;
  const temporal = ctx.dimensions.temporal!;

  const user = `## TASK
Generate a "${content.name} in ${location.name} — ${temporal.name}" page.

## TAXONOMY CONTEXT — Content Type
${JSON.stringify(content.context, null, 2)}

## TAXONOMY CONTEXT — Location
${JSON.stringify(location.context, null, 2)}

## TAXONOMY CONTEXT — Temporal
${JSON.stringify(temporal.context, null, 2)}

## DATABASE RECORDS
${formatDbRecords(ctx.dbRecords)}

## DATE: ${ctx.currentDate} (${ctx.currentSeason})

## QUALITY CONSTRAINTS
- Time + location combo: most useful for "what's happening in [neighborhood] [this weekend]"
- Seasonal context: 80-100 words about ${temporal.name} specifically in ${location.name}
- Neighborhood profile: 80-100 words (shorter for triple)
- Curated picks must be temporally relevant AND location-filtered
- FAQ: exactly 4 items
- This page type refreshes DAILY for today/weekend, WEEKLY for seasons

## OUTPUT SCHEMA
{
  "seo": { "description": "max 155 chars", "keywords": ["5-8"] },
  "hero": { "headline": "8-15 words", "subheadline": "10-20 words", "intro": "2-3 sentences" },
  "seasonal_context": { "heading": "", "content": "80-100 words", "weather_note": "1 sentence" },
  "neighborhood_profile": { "heading": "", "content": "80-100 words", "walkability": "high|medium|low", "parking_difficulty": "easy|moderate|difficult", "vibe": "3-5 words" },
  "curated_picks": { "heading": "", "items": [{"name":"","description":"","why_we_recommend":"","insider_tip":"","price_range":"","tags":[]}] },
  "local_tips": { "heading": "", "tips": ["4-6"] },
  "faq": [{"question":"","answer":""}],
  "related_pages": [{"title":"","url":"","relationship":"","description":""}],
  "cta": { "heading": "", "body": "" }
}`;

  return { system: SYSTEM_PROMPT, user, estimatedInputTokens: estimateTokens(user) };
}

// ---------------------------------------------------------------------------
// 7. Category + Location
// ---------------------------------------------------------------------------

function buildCategoryLocationPrompt(ctx: EnhancedPromptContext): StructuredPrompt {
  const category = ctx.dimensions.category!;
  const location = ctx.dimensions.location!;

  const user = `## TASK
Generate a "Best ${category.name} in ${location.name}" page.

## TAXONOMY CONTEXT — Category
${JSON.stringify(category.context, null, 2)}

## TAXONOMY CONTEXT — Location
${JSON.stringify(location.context, null, 2)}

## DATABASE RECORDS
${formatDbRecords(ctx.dbRecords)}

## DATE: ${ctx.currentDate} (${ctx.currentSeason})

## QUALITY CONSTRAINTS
- Highly specific: this is ${category.name} filtered to ${location.name} only
- If there aren't enough real options, be honest — "while [Location] has a growing [Category] scene, here are the standouts"
- Include cuisine_context for food categories
- Neighborhood profile: how ${location.name} relates to the ${category.name} scene

## OUTPUT SCHEMA
{
  "seo": { "description": "max 155 chars", "keywords": ["5-8"] },
  "hero": { "headline": "8-15 words", "subheadline": "10-20 words", "intro": "2-3 sentences" },
  "neighborhood_profile": { "heading": "", "content": "80-100 words", "walkability": "high|medium|low", "parking_difficulty": "easy|moderate|difficult", "vibe": "3-5 words" },
  "curated_picks": { "heading": "", "items": [{"name":"","description":"","why_we_recommend":"","insider_tip":"","price_range":"","tags":[]}], "cuisine_context": "2-3 sentences (food categories only, omit key for non-food)" },
  "local_tips": { "heading": "", "tips": ["4-6"] },
  "faq": [{"question":"","answer":""}],
  "related_pages": [{"title":"","url":"","relationship":"","description":""}],
  "cta": { "heading": "", "body": "" }
}`;

  return { system: SYSTEM_PROMPT, user, estimatedInputTokens: estimateTokens(user) };
}

// ---------------------------------------------------------------------------
// 8. Audience + Temporal
// ---------------------------------------------------------------------------

function buildAudienceTemporalPrompt(ctx: EnhancedPromptContext): StructuredPrompt {
  const audience = ctx.dimensions.audience!;
  const temporal = ctx.dimensions.temporal!;

  const user = `## TASK
Generate a "${audience.name} Things to Do ${temporal.name} in Des Moines" page.

## TAXONOMY CONTEXT — Audience
${JSON.stringify(audience.context, null, 2)}

## TAXONOMY CONTEXT — Temporal
${JSON.stringify(temporal.context, null, 2)}

## DATABASE RECORDS
${formatDbRecords(ctx.dbRecords)}

## DATE: ${ctx.currentDate} (${ctx.currentSeason})

## QUALITY CONSTRAINTS
- Cross-entity: mix events, restaurants, and attractions in curated picks
- Audience callout must address ${audience.name} pain points during ${temporal.name} specifically
- "Family things to do this weekend" is different from "Family things to do in summer"
- Time urgency matters for today/weekend; seasonal planning for seasons/months

## OUTPUT SCHEMA
{
  "seo": { "description": "max 155 chars", "keywords": ["5-8"] },
  "hero": { "headline": "8-15 words", "subheadline": "10-20 words", "intro": "2-3 sentences" },
  "audience_callout": { "heading": "", "content": "80-120 words", "key_considerations": ["3-5"] },
  "seasonal_context": { "heading": "", "content": "80-100 words", "weather_note": "1 sentence" },
  "curated_picks": { "heading": "", "items": [{"name":"","description":"","why_we_recommend":"","insider_tip":"","tags":[]}] },
  "local_tips": { "heading": "", "tips": ["4-6"] },
  "faq": [{"question":"","answer":""}],
  "related_pages": [{"title":"","url":"","relationship":"","description":""}],
  "cta": { "heading": "", "body": "" }
}`;

  return { system: SYSTEM_PROMPT, user, estimatedInputTokens: estimateTokens(user) };
}

// ---------------------------------------------------------------------------
// 9. Category + Temporal
// ---------------------------------------------------------------------------

function buildCategoryTemporalPrompt(ctx: EnhancedPromptContext): StructuredPrompt {
  const category = ctx.dimensions.category!;
  const temporal = ctx.dimensions.temporal!;

  const user = `## TASK
Generate a "${category.name} ${temporal.name} in Des Moines" page.

## TAXONOMY CONTEXT — Category
${JSON.stringify(category.context, null, 2)}

## TAXONOMY CONTEXT — Temporal
${JSON.stringify(temporal.context, null, 2)}

## DATABASE RECORDS
${formatDbRecords(ctx.dbRecords)}

## DATE: ${ctx.currentDate} (${ctx.currentSeason})

## QUALITY CONSTRAINTS
- Seasonal context: how ${category.name} changes during ${temporal.name} in Des Moines
- Include seasonal_highlights for what makes ${category.name} special in ${temporal.name}
- For "festivals in summer" — reference specific Des Moines festivals
- For "live music in winter" — focus on indoor venues

## OUTPUT SCHEMA
{
  "seo": { "description": "max 155 chars", "keywords": ["5-8"] },
  "hero": { "headline": "8-15 words", "subheadline": "10-20 words", "intro": "2-3 sentences" },
  "seasonal_context": { "heading": "", "content": "100-150 words", "weather_note": "1 sentence", "seasonal_highlights": ["3-5 highlights"] },
  "curated_picks": { "heading": "", "items": [{"name":"","description":"","why_we_recommend":"","insider_tip":"","tags":[]}] },
  "local_tips": { "heading": "", "tips": ["4-6"] },
  "faq": [{"question":"","answer":""}],
  "related_pages": [{"title":"","url":"","relationship":"","description":""}],
  "cta": { "heading": "", "body": "" }
}`;

  return { system: SYSTEM_PROMPT, user, estimatedInputTokens: estimateTokens(user) };
}

// ---------------------------------------------------------------------------
// 10. Location Guide (hub page)
// ---------------------------------------------------------------------------

function buildLocationGuidePrompt(ctx: EnhancedPromptContext): StructuredPrompt {
  const location = ctx.dimensions.location!;

  const user = `## TASK
Generate a comprehensive "Guide to ${location.name}" hub page — this is the definitive resource for this area.

## TAXONOMY CONTEXT — Location
${JSON.stringify(location.context, null, 2)}

## DATABASE RECORDS (mix of events, restaurants, attractions in this area)
${formatDbRecords(ctx.dbRecords)}

## EXISTING PSEO PAGES (link to these in related_pages)
${ctx.existingPageSlugs.filter(s => s.includes(location.slug)).slice(0, 20).join('\n')}

## DATE: ${ctx.currentDate} (${ctx.currentSeason})

## QUALITY CONSTRAINTS
- This is a HUB page — must be comprehensive (150-200 word neighborhood profile)
- Curated picks: 8-12 items mixing restaurants, attractions, and activities
- Include dining_highlights section (80-120 words on the food scene + 3-5 top picks)
- Local tips: 6-8 tips (more than standard pages)
- FAQ: 5-7 questions (more than standard)
- Related pages: 6-8 links (most of any page type — this is an internal linking hub)
- best_for: list 3-5 audience types this neighborhood suits
- getting_there: practical transportation info

## OUTPUT SCHEMA
{
  "seo": { "description": "max 155 chars", "keywords": ["5-8"] },
  "hero": { "headline": "8-15 words", "subheadline": "10-20 words", "intro": "2-3 sentences" },
  "neighborhood_profile": {
    "heading": "", "content": "150-200 words",
    "walkability": "high|medium|low", "parking_difficulty": "easy|moderate|difficult",
    "vibe": "3-5 words",
    "best_for": ["3-5 audience types"],
    "getting_there": "2-3 sentences on transportation"
  },
  "curated_picks": { "heading": "", "items": [{"name":"","description":"","why_we_recommend":"","insider_tip":"","price_range":"","tags":[]}] },
  "dining_highlights": { "heading": "", "content": "80-120 words", "top_picks": ["3-5 restaurant names"] },
  "local_tips": { "heading": "", "tips": ["6-8 tips"] },
  "faq": [{"question":"","answer":""}],
  "related_pages": [{"title":"","url":"","relationship":"","description":""}],
  "cta": { "heading": "", "body": "" }
}`;

  return { system: SYSTEM_PROMPT, user, estimatedInputTokens: estimateTokens(user) };
}

// ---------------------------------------------------------------------------
// Prompt Builder Registry
// ---------------------------------------------------------------------------

const PROMPT_BUILDERS: Record<PageTypeId, (ctx: EnhancedPromptContext) => StructuredPrompt> = {
  'content-location': buildContentLocationPrompt,
  'content-audience': buildContentAudiencePrompt,
  'content-temporal': buildContentTemporalPrompt,
  'content-category': buildContentCategoryPrompt,
  'content-location-audience': buildContentLocationAudiencePrompt,
  'content-location-temporal': buildContentLocationTemporalPrompt,
  'category-location': buildCategoryLocationPrompt,
  'audience-temporal': buildAudienceTemporalPrompt,
  'category-temporal': buildCategoryTemporalPrompt,
  'location-guide': buildLocationGuidePrompt,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDbRecords(records: DbRecord[]): string {
  if (!records.length) return '(No database records available — use general Des Moines knowledge)';
  return records
    .map((r, i) => `${i + 1}. [${r.type}] ${r.name}${r.location ? ` — ${r.location}` : ''}${r.rating ? ` (${r.rating}/5)` : ''}${r.price ? ` ${r.price}` : ''}${r.description ? `\n   ${r.description.slice(0, 100)}` : ''}`)
    .join('\n');
}

function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { SYSTEM_PROMPT, PROMPT_BUILDERS };
