/**
 * SECURITY: verify_jwt = false
 * Reason: Background scraping job that runs without user context to collect restaurant opening data
 * Alternative measures: Service role key required for database access, API key validation for external services
 * Risk level: MEDIUM
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scrapeUrl } from "../_shared/scraper.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { getAnthropicApiKey, buildClaudeRequest, getClaudeHeaders } from "../_shared/aiConfig.ts";
import { runJob } from "../_shared/jobRunner.ts";
import { summarizeRun, type SourceOutcome } from "./summary.ts";
import { sanitizeLikeInput } from '../_shared/validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const claudeApiKey = getAnthropicApiKey()!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface RestaurantOpening {
  name: string;
  description?: string;
  location?: string;
  cuisine?: string;
  opening_date?: string;
  opening_timeframe?: string;
  status: 'opening_soon' | 'newly_opened' | 'announced';
  source_url?: string;
  phone?: string;
  website?: string;
  price_range?: string;
}

// BEGIN pure: planOpeningUpdate
// Self-contained on purpose (no imports, no module state):
// _tests/restaurant-ingest-honesty.test.ts lifts this block out of the file and
// runs it, because importing index.ts would start the server.

/** Existing row as the lookup selects it (EXISTING_OPENING_COLUMNS). */
export interface ExistingOpeningRow {
  id: string;
  name: string;
  location: string | null;
  status: string | null;
  opening_date: string | null;
  opening_timeframe: string | null;
  description: string | null;
  cuisine: string | null;
  source_url: string | null;
  phone: string | null;
  website: string | null;
  price_range: string | null;
}

/** What one scrape extracted for a restaurant. */
export interface ScrapedOpening {
  name: string;
  status: string;
  opening_date?: string | null;
  opening_timeframe?: string | null;
  description?: string | null;
  cuisine?: string | null;
  location?: string | null;
  source_url?: string | null;
  phone?: string | null;
  website?: string | null;
  price_range?: string | null;
}

export const EXISTING_OPENING_COLUMNS =
  'id, name, location, status, opening_date, opening_timeframe, description, cuisine, source_url, phone, website, price_range';

// Lower number = earlier in the lifecycle. `closed` is deliberately absent:
// a scrape never moves a row onto or off it (a closed row is skipped whole).
const OPENING_STATUS_RANK: Record<string, number> = {
  announced: 1,
  opening_soon: 2,
  newly_opened: 3,
  open: 4,
};

const FILLABLE_FIELDS = ['description', 'cuisine', 'source_url', 'phone', 'website', 'price_range'] as const;

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/**
 * The columns one scrape may change on an existing row, or null for none.
 * Status only moves forward, and never off `closed` or an unknown status.
 * Dates follow the newest scrape. Every other field is filled only when the
 * row has nothing there; `location` is never rewritten, because the row's
 * location is what matched it.
 */
export function planOpeningUpdate(
  existing: ExistingOpeningRow,
  scraped: ScrapedOpening,
): Record<string, string> | null {
  if (existing.status === 'closed') return null;

  const update: Record<string, string> = {};

  const existingRank = existing.status === null ? 0 : OPENING_STATUS_RANK[existing.status];
  const scrapedRank = OPENING_STATUS_RANK[scraped.status];
  if (existingRank !== undefined && scrapedRank !== undefined && scrapedRank > existingRank) {
    update.status = scraped.status;
  }

  if (!isBlank(scraped.opening_date) && existing.opening_date !== scraped.opening_date) {
    update.opening_date = scraped.opening_date as string;
  }
  if (!isBlank(scraped.opening_timeframe) && existing.opening_timeframe !== scraped.opening_timeframe) {
    update.opening_timeframe = scraped.opening_timeframe as string;
  }

  for (const field of FILLABLE_FIELDS) {
    if (isBlank(existing[field]) && !isBlank(scraped[field])) {
      update[field] = scraped[field] as string;
    }
  }
  if (isBlank(existing.location) && !isBlank(scraped.location)) {
    update.location = scraped.location as string;
  }

  return Object.keys(update).length > 0 ? update : null;
}
// END pure: planOpeningUpdate

interface ScraperSource {
  url: string;
  name: string;
  type: 'news' | 'blog' | 'directory';
}

// Default sources to scrape for restaurant openings
const DEFAULT_SOURCES: ScraperSource[] = [
  {
    url: 'https://www.desmoinesregister.com/search/?q=restaurant+opening',
    name: 'Des Moines Register - Restaurant Openings',
    type: 'news'
  },
  {
    url: 'https://www.catchdesmoines.com/restaurants/',
    name: 'Catch Des Moines - Restaurants',
    type: 'directory'
  },
  {
    url: 'https://dsm.eater.com/maps/best-new-restaurants-des-moines',
    name: 'Eater Des Moines - New Restaurants',
    type: 'blog'
  }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  try {
    const { sources = DEFAULT_SOURCES } = await req.json().catch(() => ({}));

    console.log(`🚀 Starting restaurant opening scraper with ${sources.length} sources`);

    // WEB-BE-041 AC3. Per-source outcomes replace three running totals and a
    // flat string array. The totals could not say WHICH source produced them,
    // and the errors array was written and then thrown away by a response that
    // always said success.
    const perSource: SourceOutcome[] = [];

    const job = await runJob("restaurant-opening-scraper", async (ctx) => {
    for (const source of sources) {
      console.log(`🌐 Scraping source: ${source.name} (${source.url})`);
      const outcome: SourceOutcome = {
        name: source.name,
        url: source.url,
        ok: false,
        found: 0,
        inserted: 0,
        updated: 0,
      };
      perSource.push(outcome);
      const rowErrors: string[] = [];

      try {
        // Use universal scraper (Puppeteer/Playwright/Firecrawl)
        const scrapeResult = await scrapeUrl(source.url, {
          waitTime: 5000,
          timeout: 30000,
        });

        if (!scrapeResult.success) {
          console.error(`❌ Scraping error for ${source.url}: ${scrapeResult.error}`);
          outcome.error = `scrape failed: ${scrapeResult.error}`;
          continue;
        }

        const content = scrapeResult.markdown || scrapeResult.text || scrapeResult.html || '';
        
        console.log(`📄 ${scrapeResult.backend} returned ${content.length} characters from ${source.name} (took ${scrapeResult.duration}ms)`);

        if (!content || content.length < 100) {
          console.error(`❌ No usable content returned from ${source.url}`);
          outcome.error = `no usable content (${content.length} chars)`;
          continue;
        }

        // Extract restaurant openings using Claude AI
        const claudePrompt = `You are an expert at extracting NEW restaurant opening information from websites. Analyze this content from ${source.url} and find EVERY new restaurant opening, upcoming restaurant, or recently opened restaurant.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

WEBSITE CONTENT:
${content.substring(0, 20000)}

CRITICAL PARSING INSTRUCTIONS:

🎯 WHAT TO LOOK FOR:
- Restaurants that are "opening soon" or "coming soon"
- Recently opened restaurants (within last 3-6 months)
- Announced restaurant projects
- Restaurant construction or renovation announcements
- New concepts from existing restaurant groups
- Franchise expansions
- Restaurant relocations or reopenings

🔍 SPECIFIC PATTERNS:
- Keywords: "opening", "coming soon", "now open", "grand opening", "announced", "plans to open"
- Temporal indicators: "spring 2025", "this summer", "Q2 2025", "late 2025"
- Construction language: "under construction", "renovating", "building out space"
- Ownership mentions: "chef X is opening", "restaurateur Y announces"

📅 DATE & STATUS EXTRACTION:
- If EXACT DATE is given (e.g., "June 15, 2025"): 
  * opening_date: "2025-06-15"
  * opening_timeframe: null
  * status: "opening_soon"

- If APPROXIMATE timeframe (e.g., "Summer 2025", "Q2 2025"):
  * opening_date: null
  * opening_timeframe: "Summer 2025" (or "Q2 2025", etc.)
  * status: "announced"

- If ALREADY OPENED recently (within 3 months):
  * opening_date: actual opening date if available
  * status: "newly_opened"

- If vague future reference ("later this year", "soon"):
  * opening_date: null
  * opening_timeframe: "2025" or "Coming Soon"
  * status: "announced"

🏢 REQUIRED INFORMATION:
For EVERY restaurant opening you find, extract:
- name: Restaurant name (REQUIRED)
- description: What makes this restaurant unique, concept, menu highlights
- location: Full address or area (e.g., "West Des Moines, IA", "Downtown Des Moines")
- cuisine: Type of cuisine (Italian, Mexican, American, Asian Fusion, etc.)
- opening_date: Exact date in YYYY-MM-DD format (if available)
- opening_timeframe: Approximate timeframe if exact date not available
- status: "opening_soon", "newly_opened", or "announced"
- source_url: Direct URL to article about this opening (if different from page URL)
- phone: Phone number if mentioned
- website: Restaurant website if mentioned
- price_range: $, $$, $$$, or $$$$ if indicated

VALIDATION RULES:
✅ Must have a restaurant name
✅ Must indicate it's NEW (opening, opening soon, recently opened, or announced)
✅ Prefer specific details over vague mentions
✅ Include both chain and independent restaurants
✅ Include food trucks or pop-ups if they're permanent locations

❌ EXCLUDE:
- Restaurants that have been open for years (unless major renovation/reopening)
- Temporary pop-ups or events
- Food festivals or one-time dining events
- Restaurants that have already closed

FORMAT AS JSON ARRAY ONLY - no other text:
[
  {
    "name": "Restaurant Name",
    "description": "Restaurant concept and menu highlights",
    "location": "Full address or area",
    "cuisine": "Cuisine Type",
    "opening_date": "2025-06-15",
    "opening_timeframe": null,
    "status": "opening_soon",
    "source_url": "${source.url}",
    "phone": "515-xxx-xxxx",
    "website": "https://restaurant-website.com",
    "price_range": "$$"
  }
]

🚨 REQUIREMENT: Extract EVERY new restaurant opening mentioned. Return [] ONLY if absolutely no openings are found.`;

        console.log(`🤖 Sending content to Claude AI for extraction...`);

        // WEB-BE-041 AC2. This hardcoded `model: 'claude-3-5-sonnet-20241022'` and
        // its own headers, bypassing _shared/aiConfig.ts entirely. That model is
        // retired: the API answers not_found, so EVERY extraction failed - and
        // the handler below still returned success: true with HTTP 200. The
        // model now comes from getAIConfig (one place, overridable from the
        // ai_config row) and the version header from the same config.
        const [claudeHeaders, claudeBody] = await Promise.all([
          getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseKey),
          buildClaudeRequest(
            [{ role: 'user', content: claudePrompt }],
            { supabaseUrl, supabaseKey, customMaxTokens: 4096 },
          ),
        ]);

        const claudeResponse = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: claudeHeaders,
          body: JSON.stringify(claudeBody),
        }, 60_000);

        if (!claudeResponse.ok) {
          const errorText = await claudeResponse.text();
          console.error(`❌ Claude API error: ${claudeResponse.status} - ${errorText}`);
          // The status and the model are both in the message: a 404 here means
          // the configured model is gone, which is the exact failure that went
          // unreported for months and is indistinguishable from a rate limit
          // without them.
          outcome.error = `model call failed (${claudeResponse.status}, model ${claudeBody.model}): ${errorText.slice(0, 200)}`;
          continue;
        }

        const claudeData = await claudeResponse.json();
        const extractedText = claudeData.content?.[0]?.text || '[]';
        
        console.log(`🤖 Claude response: ${extractedText.substring(0, 500)}...`);

        // Parse the extracted JSON
        let restaurants: RestaurantOpening[] = [];
        try {
          const jsonMatch = extractedText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            restaurants = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.error(`❌ Failed to parse Claude response as JSON:`, parseError);
          outcome.error = `model returned unparseable JSON: ${String(parseError).slice(0, 200)}`;
          continue;
        }

        console.log(`✨ Extracted ${restaurants.length} restaurant openings from ${source.name}`);
        // Reaching here means the source scraped AND the model answered with
        // parseable JSON. Zero rows is a legitimate answer - see summary.ts.
        outcome.ok = true;
        outcome.found = restaurants.length;

        // Insert or update restaurants in database
        for (const restaurant of restaurants) {
          try {
            // Check if restaurant already exists (by name AND similar location)
            const { data: existingList } = await supabase
              .from('restaurants')
              .select(EXISTING_OPENING_COLUMNS)
              // A scraped name is a LIKE pattern here; a percent or underscore in
              // it would widen this existence check and mask a genuinely new
              // restaurant. Escaped, not stripped - sanitizeLikeInput keeps
              // apostrophes, which most venue names here have.
              .ilike('name', sanitizeLikeInput(restaurant.name ?? ''));

            // Find match only if BOTH name and location match (same restaurant in same location)
            // If name matches but location is different, treat as new location (allow it)
            let existing = null;
            if (existingList && existingList.length > 0) {
              // Extract city/area from locations for comparison
              const newLoc = (restaurant.location || '').toLowerCase();
              const newCity = newLoc.split(',')[0].trim(); // Get city/area part
              
              // Find restaurant with matching name AND location
              const locationMatch = existingList.find(r => {
                const existLoc = (r.location || '').toLowerCase();
                const existCity = existLoc.split(',')[0].trim();
                
                // Match if cities are the same or one contains the other
                return existCity === newCity || 
                       existCity.includes(newCity) || 
                       newCity.includes(existCity) ||
                       existLoc === newLoc;
              });
              
              // Only update if we found a location match (same restaurant in same city)
              // If no location match, it's a new location - allow as new entry
              existing = locationMatch || null;
            }

            if (existing) {
              // planOpeningUpdate decides what changes. It used to be decided
              // here against a row that never selected description, so every
              // run rewrote description, cuisine, location, phone, website and
              // price_range, and a closed row came back to life because
              // `closed` wasn't in the status ranking.
              const planned = planOpeningUpdate(existing as ExistingOpeningRow, restaurant);

              if (planned) {
                const updateData: Record<string, string> = {
                  ...planned,
                  updated_at: new Date().toISOString(),
                };

                const { error: updateError } = await supabase
                  .from('restaurants')
                  .update(updateData)
                  .eq('id', existing.id);

                if (updateError) {
                  console.error(`❌ Error updating restaurant ${restaurant.name}:`, updateError);
                  rowErrors.push(`update ${restaurant.name}: ${updateError.message}`);
                } else {
                  const changes = [];
                  if (planned.status) changes.push(`status: ${existing.status} → ${restaurant.status}`);
                  if (planned.opening_date) changes.push(`date: ${existing.opening_date || 'none'} → ${restaurant.opening_date}`);
                  console.log(`✅ Updated: ${restaurant.name} (${changes.join(', ')})`);
                  outcome.updated++;
                }
              } else {
                console.log(`⏭️ Skipped: ${restaurant.name} (no significant changes)`);
              }
            } else {
              // Insert new restaurant
              const { error: insertError } = await supabase
                .from('restaurants')
                .insert({
                  name: restaurant.name,
                  description: restaurant.description,
                  location: restaurant.location || 'Des Moines, IA',
                  cuisine: restaurant.cuisine,
                  opening_date: restaurant.opening_date,
                  opening_timeframe: restaurant.opening_timeframe,
                  status: restaurant.status,
                  source_url: restaurant.source_url || source.url,
                  phone: restaurant.phone,
                  website: restaurant.website,
                  price_range: restaurant.price_range,
                  is_featured: false,
                  rating: null,
                });

              if (insertError) {
                console.error(`❌ Error inserting restaurant ${restaurant.name}:`, insertError);
                rowErrors.push(`insert ${restaurant.name}: ${insertError.message}`);
              } else {
                console.log(`✅ Inserted: ${restaurant.name} (${restaurant.status})`);
                outcome.inserted++;
              }
            }
          } catch (dbError) {
            console.error(`❌ Database error for ${restaurant.name}:`, dbError);
            rowErrors.push(`db error for ${restaurant.name}: ${String(dbError).slice(0, 120)}`);
          }
        }

      } catch (sourceError) {
        console.error(`❌ Error processing source ${source.name}:`, sourceError);
        // Overwrites any row-level note: a thrown source is a worse failure
        // than a handful of rejected rows, and outcome.ok stays false either way.
        outcome.error = `unhandled: ${sourceError instanceof Error ? sourceError.message : String(sourceError)}`;
      }

      // Row-level failures do NOT make the source a failure - the model
      // answered and some rows landed. They ride along so a run that inserted
      // 2 of 30 is visibly different from one that inserted 30.
      if (rowErrors.length > 0) {
        outcome.error = `${outcome.error ? outcome.error + '; ' : ''}${rowErrors.length} row error(s): ${rowErrors.slice(0, 3).join('; ')}`;
      }
      ctx.processed(outcome.inserted + outcome.updated);
      ctx.failed(rowErrors.length + (outcome.ok ? 0 : 1));
    }

      const summary = summarizeRun(perSource);
      ctx.meta({
        sourcesAttempted: summary.body.sourcesAttempted,
        sourcesSucceeded: summary.body.sourcesSucceeded,
        totalFound: summary.body.totalFound,
        inserted: summary.body.inserted,
        updated: summary.body.updated,
        perSource,
        // WEB-BE-043. The same outcomes in the shape the per-source rule reads.
        // Written alongside `perSource` rather than instead of it: the admin
        // panel and the response shape both read the itemised array, and
        // _shared/ingestionHealth.ts can parse either, so neither reader breaks
        // whichever side is deployed first.
        sources: Object.fromEntries(perSource.map((o) => [o.name, {
          fetched: o.found,
          // An update is a write - a source that only refreshes existing
          // openings is alive, not dark.
          inserted: o.inserted + o.updated,
          duplicates: 0,
          errors: o.ok ? 0 : 1,
        }])),
      });
      // Throwing marks the ledger row failed and alerts. The HTTP status is
      // decided below from perSource either way, so a ledger write that fails
      // cannot change what the caller is told.
      if (!summary.body.success) {
        throw new Error(
          `every source failed (${summary.body.sourcesAttempted} attempted)`,
        );
      }
      return summary;
    });

    const summary = summarizeRun(perSource);
    console.log(
      `✅ Scraping complete: ${summary.body.sourcesSucceeded}/${summary.body.sourcesAttempted} sources, ` +
      `found ${summary.body.totalFound}, inserted ${summary.body.inserted}, updated ${summary.body.updated}`,
    );

    return new Response(
      JSON.stringify({ ...summary.body, runId: job.runId }),
      {
        status: summary.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error(`❌ Error in restaurant opening scraper:`, error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
