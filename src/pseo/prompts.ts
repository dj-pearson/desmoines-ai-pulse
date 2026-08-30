/**
 * pSEO 2.0 Generation Prompt Library
 *
 * Each prompt is a function that takes dimension context objects and returns
 * a fully-formed system + user prompt for Claude AI. Prompts are designed to
 * produce substantively different content for each dimension combination.
 *
 * Key principles:
 * 1. Every prompt injects the specific context objects for its dimensions
 * 2. Prompts specify exact JSON output format for reliable parsing
 * 3. Local authority tone — write like a Des Moines insider, not a tourist guide
 * 4. Actionable content — every recommendation includes practical details
 */

import type { DimensionValue, DimensionKey } from './taxonomy';
import type { PseoSection, PseoFaqItem, PseoCuratedItem, PseoSeoMeta } from './schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptContext {
  dimensions: Partial<Record<DimensionKey, DimensionValue>>;
  pageTypeId: string;
  existingItemNames?: string[];
  currentDate: string;
  currentSeason: string;
}

export interface GenerationPrompt {
  system: string;
  user: string;
  /** Expected JSON schema description for the model */
  outputFormat: string;
}

// ---------------------------------------------------------------------------
// Core System Prompt (shared across all page types)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT_BASE = `You are a knowledgeable Des Moines, Iowa local who writes authoritative, practical guides for residents and visitors. You have deep familiarity with every neighborhood, restaurant, bar, park, and event venue in the Greater Des Moines metro area.

Your writing style:
- Conversational but authoritative — like a friend who really knows the city
- Specific and actionable — always include names, addresses, and practical tips
- Honest — mention limitations, parking challenges, or when something isn't worth the hype
- Local-first — use neighborhood names, local landmarks as reference points
- SEO-aware — naturally incorporate keywords without stuffing

Geography you know well:
- Core: Downtown, East Village, Valley Junction, Drake, Sherman Hill, Ingersoll, Beaverdale
- Suburbs: West Des Moines, Ankeny, Urbandale, Johnston, Waukee, Altoona, Clive, Pleasant Hill, Windsor Heights
- Landmarks: Iowa State Capitol, Pappajohn Sculpture Park, Principal Park, Wells Fargo Arena, Adventureland, Living History Farms
- Food scene: Farm-to-table movement, diverse ethnic corridor on University Ave, craft brewery boom

Rules:
1. NEVER fabricate specific business names, addresses, or prices — if you're unsure, describe the type of place generically
2. ALWAYS include "Des Moines" or the specific neighborhood name 2-4 times naturally
3. Reference specific cross-streets, landmarks, or well-known nearby businesses for location context
4. Include seasonal awareness — mention weather, seasonal menus, patio season, etc.
5. Write for PEOPLE first, search engines second
6. Output valid JSON matching the exact schema specified`;

// ---------------------------------------------------------------------------
// Section-Specific Prompts
// ---------------------------------------------------------------------------

function buildHeroIntroPrompt(ctx: PromptContext): string {
  const dims = Object.values(ctx.dimensions).filter(Boolean);
  const dimDescriptions = dims
    .map((d) => `- ${d!.name} (${d!.dimension}): audience is "${d!.context.audience}", they struggle with "${d!.context.pain_points}"`)
    .join('\n');

  return `Write an engaging 50-80 word introduction paragraph for a page about ${dims.map((d) => d!.name).join(' + ')} in Des Moines.

Dimension context:
${dimDescriptions}

Requirements:
- Hook the reader in the first sentence with something specific to this combination
- Establish local authority
- Include primary keyword naturally
- Don't use generic phrases like "Welcome to" or "Looking for"
- Reference something specific to ${ctx.currentSeason} if relevant
- Today's date: ${ctx.currentDate}`;
}

function buildCuratedPicksPrompt(ctx: PromptContext): string {
  const dims = Object.values(ctx.dimensions).filter(Boolean);
  const contentType = ctx.dimensions.content_type;
  const location = ctx.dimensions.location;
  const audience = ctx.dimensions.audience;
  const category = ctx.dimensions.category;

  let specificInstructions = '';
  if (contentType?.slug === 'restaurants' || category) {
    specificInstructions = `For each restaurant/food recommendation include:
- What specific dish to order
- Price context ($$, $$$, etc.)
- Best time to visit (lunch vs dinner, weekday vs weekend)
- Reservation recommendations
- Parking situation`;
  } else if (contentType?.slug === 'events') {
    specificInstructions = `For each event recommendation include:
- Typical ticket price or "free"
- Best time to arrive
- Where to park
- What to bring/wear
- Insider tips for the best experience`;
  } else if (contentType?.slug === 'attractions') {
    specificInstructions = `For each attraction include:
- Visit duration estimate
- Best time of day/week to visit
- Admission cost or "free"
- Age appropriateness
- Parking and accessibility notes`;
  } else {
    specificInstructions = `For each recommendation include:
- Why it's worth visiting
- Practical logistics (parking, hours, cost)
- Insider tip that only locals would know
- Best time to go`;
  }

  const audienceContext = audience
    ? `\nThe audience is specifically: ${audience.context.audience}. They care about: ${audience.context.pain_points}. Content that works for them: ${audience.context.content_that_works}.`
    : '';

  const locationContext = location
    ? `\nFocus on the ${location.name} area. Context: ${location.context.what_makes_it_useful}. Subtopics: ${location.context.subtopics.join(', ')}.`
    : '';

  return `Generate 6-8 curated recommendations for ${dims.map((d) => d!.name).join(' + ')} in Des Moines.
${audienceContext}
${locationContext}

${specificInstructions}

${ctx.existingItemNames?.length ? `Reference these known local businesses where appropriate: ${ctx.existingItemNames.join(', ')}` : 'Recommend types of places with general descriptions if you are not certain of specific current business names.'}

Each item must have: name, description (2-3 sentences), whyWeRecommend (1 sentence), insiderTip (1 sentence).`;
}

function buildLocalTipsPrompt(ctx: PromptContext): string {
  const location = ctx.dimensions.location;
  const audience = ctx.dimensions.audience;

  return `Write 4-6 practical local tips for ${Object.values(ctx.dimensions).filter(Boolean).map((d) => d!.name).join(' + ')} in Des Moines.

${location ? `Neighborhood context: ${location.context.what_makes_it_useful}. Pain points: ${location.context.pain_points}.` : ''}
${audience ? `Audience: ${audience.context.audience}. They need: ${audience.context.content_that_works}.` : ''}

Tips should be:
- Genuinely useful (not generic "plan ahead" type advice)
- Specific to this combination of dimensions
- Include parking tips, timing advice, money-saving hacks
- Mention specific landmarks or cross-streets as reference points
- Season: ${ctx.currentSeason} (include weather-appropriate tips)

Return as an array of tip strings.`;
}

function buildFaqPrompt(ctx: PromptContext): string {
  const dims = Object.values(ctx.dimensions).filter(Boolean);
  const searchBehaviors = dims
    .map((d) => d!.context.search_behavior)
    .join('; ');

  return `Generate 4-6 FAQ items for a page about ${dims.map((d) => d!.name).join(' + ')} in Des Moines.

People searching for this topic typically ask: ${searchBehaviors}

Related subtopics they care about: ${dims.flatMap((d) => d!.context.subtopics).join(', ')}

Requirements:
- Questions should match real search queries (how people actually phrase questions)
- Answers should be 2-3 sentences, specific and practical
- Include at least one question about cost/budget
- Include at least one question about timing/planning
- Include at least one question specific to Des Moines (not generic)
- Answers should include "Des Moines" or the specific neighborhood name

Return as array of {question, answer} objects.`;
}

function buildSeasonalContextPrompt(ctx: PromptContext): string {
  const temporal = ctx.dimensions.temporal;
  const contentType = ctx.dimensions.content_type;

  return `Write a 100-150 word seasonal context paragraph for ${contentType?.name ?? 'things to do'} during ${temporal?.name ?? ctx.currentSeason} in Des Moines.

${temporal ? `Temporal context: ${temporal.context.content_that_works}. Audience: ${temporal.context.audience}.` : ''}

Include:
- Weather expectations and how they affect plans
- What's in season (food, activities, nature)
- Seasonal events or traditions unique to Des Moines
- Practical advice for this time of year
- Indoor alternatives if relevant

Be specific to Des Moines — reference Iowa weather patterns, local seasonal traditions (State Fair in August, RAGBRAI, farmers market season, etc.).`;
}

function buildNeighborhoodProfilePrompt(ctx: PromptContext): string {
  const location = ctx.dimensions.location;
  if (!location) return '';

  return `Write a 100-150 word neighborhood profile for ${location.name} in the Des Moines metro area.

Context: ${location.context.what_makes_it_useful}
Audience: ${location.context.audience}
Subtopics: ${location.context.subtopics.join(', ')}

Include:
- The neighborhood's character/vibe in 1-2 sentences
- Walkability and parking situation
- Key landmarks or intersections that orient visitors
- What makes it different from other Des Moines neighborhoods
- Who lives here / who visits here

Write as a local who genuinely knows and appreciates this area.`;
}

function buildAudienceCalloutPrompt(ctx: PromptContext): string {
  const audience = ctx.dimensions.audience;
  if (!audience) return '';

  return `Write a 80-120 word callout section specifically addressing ${audience.name} visitors to Des Moines.

Audience context:
- Who they are: ${audience.context.audience}
- Pain points: ${audience.context.pain_points}
- What works for them: ${audience.context.content_that_works}
- What makes content useful: ${audience.context.what_makes_it_useful}

Write in second person ("you") directly to this audience. Be specific about how Des Moines serves their needs. Don't be generic — reference specific Des Moines features that address their pain points.`;
}

// ---------------------------------------------------------------------------
// Full Page Generation Prompt
// ---------------------------------------------------------------------------

export function buildFullPagePrompt(ctx: PromptContext): GenerationPrompt {
  const dims = Object.values(ctx.dimensions).filter(Boolean);
  const dimList = dims.map((d) => `${d!.dimension}: ${d!.name}`).join(', ');

  const sectionPrompts: string[] = [
    `## Section 1: Hero Introduction\n${buildHeroIntroPrompt(ctx)}`,
    `## Section 2: Curated Picks\n${buildCuratedPicksPrompt(ctx)}`,
    `## Section 3: Local Tips\n${buildLocalTipsPrompt(ctx)}`,
    `## Section 4: FAQ\n${buildFaqPrompt(ctx)}`,
  ];

  // Conditional sections
  if (ctx.dimensions.temporal) {
    sectionPrompts.push(`## Section 5: Seasonal Context\n${buildSeasonalContextPrompt(ctx)}`);
  }
  if (ctx.dimensions.location) {
    sectionPrompts.push(`## Section 6: Neighborhood Profile\n${buildNeighborhoodProfilePrompt(ctx)}`);
  }
  if (ctx.dimensions.audience) {
    sectionPrompts.push(`## Section 7: Audience Callout\n${buildAudienceCalloutPrompt(ctx)}`);
  }

  const userPrompt = `Generate a complete pSEO page for: ${dimList}

Page type: ${ctx.pageTypeId}
Current date: ${ctx.currentDate}
Current season: ${ctx.currentSeason}

${sectionPrompts.join('\n\n---\n\n')}

---

## SEO Metadata
Also generate:
- seo_title (50-60 characters, include primary keyword and "Des Moines")
- seo_description (150-160 characters, include call to action)
- seo_h1 (clear, keyword-rich heading)
- seo_keywords (8-12 keywords, mix of head terms and long-tail)

---

## Output Format
Return a single JSON object with this structure:
{
  "seo": {
    "title": "string",
    "description": "string",
    "h1": "string",
    "keywords": ["string"]
  },
  "sections": [
    {
      "id": "hero_intro",
      "type": "hero_intro",
      "content": "string (the intro paragraph)"
    },
    {
      "id": "curated_picks",
      "type": "curated_picks",
      "heading": "string",
      "items": [
        {
          "name": "string",
          "description": "string",
          "whyWeRecommend": "string",
          "insiderTip": "string",
          "priceRange": "string (optional)",
          "tags": ["string"]
        }
      ]
    },
    {
      "id": "local_tips",
      "type": "local_tips",
      "heading": "string",
      "tips": ["string"]
    },
    {
      "id": "faq",
      "type": "faq",
      "heading": "string",
      "faqs": [
        { "question": "string", "answer": "string" }
      ]
    }
    // ... plus seasonal_context, neighborhood_profile, audience_callout as applicable
  ]
}`;

  return {
    system: SYSTEM_PROMPT_BASE,
    user: userPrompt,
    outputFormat: 'JSON object with seo and sections fields',
  };
}

// ---------------------------------------------------------------------------
// SEO Metadata Generation Prompt (lightweight, for bulk generation)
// ---------------------------------------------------------------------------

export function buildSeoOnlyPrompt(ctx: PromptContext): GenerationPrompt {
  const dims = Object.values(ctx.dimensions).filter(Boolean);
  const dimList = dims.map((d) => `${d!.dimension}: ${d!.name}`).join(', ');

  return {
    system: `You are an SEO specialist for Des Moines Insider, a local discovery platform for Des Moines, Iowa. Generate optimized metadata.`,
    user: `Generate SEO metadata for a page about: ${dimList}

Search behavior context:
${dims.map((d) => `- ${d!.name}: ${d!.context.search_behavior}`).join('\n')}

Return JSON:
{
  "title": "50-60 char title with primary keyword and Des Moines",
  "description": "150-160 char meta description with call to action",
  "h1": "Clear H1 heading",
  "keywords": ["8-12 keywords mixing head terms and long-tail"]
}`,
    outputFormat: 'JSON with title, description, h1, keywords',
  };
}

// ---------------------------------------------------------------------------
// Related Pages Prompt
// ---------------------------------------------------------------------------

export function buildRelatedPagesPrompt(
  currentSlug: string,
  allSlugs: string[]
): GenerationPrompt {
  return {
    system: 'You are an internal linking specialist. Given a page slug and a list of all available page slugs, select the most relevant related pages for cross-linking.',
    user: `Current page: ${currentSlug}

Available pages (select 4-8 most relevant):
${allSlugs.slice(0, 100).join('\n')}

Return JSON array:
[
  {
    "slug": "/path/to/page",
    "title": "Display Title",
    "relationship": "sibling|parent|child|cross",
    "description": "Brief description of why this link is relevant"
  }
]

Rules:
- "parent" = broader topic (e.g., /restaurants is parent of /restaurants/italian)
- "child" = more specific subtopic
- "sibling" = same level, different angle
- "cross" = related but different dimension
- Prioritize links that help users explore naturally
- Include at least one parent and one sibling`,
    outputFormat: 'JSON array of related page objects',
  };
}

// ---------------------------------------------------------------------------
// Content Refresh Prompt (for updating existing pages)
// ---------------------------------------------------------------------------

export function buildRefreshPrompt(
  existingContent: string,
  ctx: PromptContext
): GenerationPrompt {
  return {
    system: SYSTEM_PROMPT_BASE,
    user: `Update this existing pSEO page content for freshness. Today is ${ctx.currentDate}, season is ${ctx.currentSeason}.

Current content:
${existingContent}

Update rules:
1. Keep the structure and most content intact
2. Update any date-specific references
3. Add seasonal relevance for ${ctx.currentSeason}
4. Check if any referenced businesses might have changed (add qualifiers like "as of ${ctx.currentDate}")
5. Refresh the FAQ with any new common questions
6. Return the complete updated JSON in the same format`,
    outputFormat: 'Same JSON format as original content',
  };
}

// ---------------------------------------------------------------------------
// Utility: Get current season
// ---------------------------------------------------------------------------

export function getCurrentSeason(date: Date = new Date()): string {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

// ---------------------------------------------------------------------------
// Prompt Registry
// ---------------------------------------------------------------------------

export const promptRegistry = {
  fullPage: buildFullPagePrompt,
  seoOnly: buildSeoOnlyPrompt,
  relatedPages: buildRelatedPagesPrompt,
  refresh: buildRefreshPrompt,
  // Individual section prompts (for targeted regeneration)
  sections: {
    hero_intro: buildHeroIntroPrompt,
    curated_picks: buildCuratedPicksPrompt,
    local_tips: buildLocalTipsPrompt,
    faq: buildFaqPrompt,
    seasonal_context: buildSeasonalContextPrompt,
    neighborhood_profile: buildNeighborhoodProfilePrompt,
    audience_callout: buildAudienceCalloutPrompt,
  },
} as const;
