import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { getAIConfig, buildLightweightClaudeRequest, getClaudeHeaders, getAnthropicApiKey, extractClaudeText } from "../_shared/aiConfig.ts";
import { sanitizePostgrestPattern } from "../_shared/validation.ts";
import { getCorsHeaders, handleCors, isOriginAllowed, addCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimitPersistent } from "../_shared/rateLimit.ts";
import { centralTodayStartUtc, nlpDateWindow } from "./dateWindow.ts";

/** Environment-aware CORS headers for a given request origin (no wildcard). */
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || undefined;
  return getCorsHeaders(origin && isOriginAllowed(origin) ? origin : undefined);
}

/**
 * NLP Search - Natural Language Search Parser
 *
 * Uses Claude Haiku (lightweight model) to parse natural language queries
 * into structured search parameters, then executes the search.
 *
 * Example queries:
 * - "Family dinner under $50 near downtown Saturday"
 * - "Free things to do this weekend with kids"
 * - "Best brunch spots with outdoor seating"
 * - "Live music events tonight"
 */

interface NLPSearchRequest {
  query: string;
  contentTypes?: ('events' | 'restaurants' | 'attractions')[];
}

interface ParsedSearchIntent {
  // What are they looking for?
  contentTypes: ('events' | 'restaurants' | 'attractions')[];

  // Search terms
  keywords: string[];
  category?: string;
  cuisine?: string;

  // Location filters
  location?: string;
  neighborhood?: string;
  nearDowntown?: boolean;

  // Date/Time filters
  dateFilter?: 'today' | 'tomorrow' | 'this_weekend' | 'this_week' | 'next_week' | 'specific';
  specificDate?: string;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';

  // Price filters
  priceRange?: 'free' | 'cheap' | 'moderate' | 'expensive' | 'any';
  maxBudget?: number;

  // Audience filters
  familyFriendly?: boolean;
  kidFriendly?: boolean;
  dateFriendly?: boolean;
  groupFriendly?: boolean;
  petFriendly?: boolean;

  // Amenity filters
  outdoorSeating?: boolean;
  liveMusic?: boolean;
  parking?: boolean;

  // Dietary filters
  dietary?: string[];

  // Sort preference
  sortBy?: 'relevance' | 'date' | 'rating' | 'price' | 'distance';

  // Confidence score (0-1)
  confidence: number;

  // Original query for fallback
  originalQuery: string;
}

serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req);

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const claudeApiKey = getAnthropicApiKey();
    if (!claudeApiKey) {
      throw new Error('CLAUDE_API key is required');
    }

    const { query, contentTypes = ['events', 'restaurants', 'attractions'] }: NLPSearchRequest = await req.json();

    if (!query || query.trim().length < 3) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Query must be at least 3 characters'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Best-effort per-user identity for rate-limit keying (falls back to IP).
    const authHeaderIn = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeaderIn?.startsWith('Bearer ')) {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser(authHeaderIn.slice(7));
        userId = user?.id ?? null;
      } catch { /* anon key or invalid token → key by IP */ }
    }

    // COST GUARD: DB-backed rate limit BEFORE any Claude call. Generous ceiling
    // so real users (and shipped clients that retry) are never blocked, but a
    // script can't burn Claude spend. Keyed per-user when a JWT is present,
    // else per-IP. Fails OPEN on a rate-limit DB outage.
    const rl = await checkRateLimitPersistent(req, {
      endpoint: 'nlp-search',
      windowMs: 60 * 1000,
      max: 30,
      userId: userId ?? undefined,
      message: 'Search rate limit exceeded. Please slow down and try again shortly.',
    });
    if (!rl.success && rl.response) {
      const origin = req.headers.get('origin') || undefined;
      return addCorsHeaders(rl.response, origin && isOriginAllowed(origin) ? origin : undefined);
    }

    console.log(`NLP Search: Parsing query "${query}"`);

    // Today's date for context, in Des Moines time (the model resolves
    // "tonight" and "this weekend" against it).
    const today = new Date();
    const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Chicago' });

    // Build the NLP parsing prompt
    const nlpPrompt = `You are a search query parser for Des Moines, Iowa local discovery app. Parse the user's natural language query into structured search parameters.

CURRENT CONTEXT:
- Today is ${dayOfWeek}, ${today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })}
- Location: Des Moines, Iowa metro area
- Available neighborhoods: East Village, Court Avenue, Downtown, Ingersoll, Beaverdale, Highland Park, Drake, Sherman Hill, Valley Junction, West Des Moines, Ankeny, Urbandale, Johnston, Clive, Waukee

USER QUERY: "${query}"

PARSE INSTRUCTIONS:
1. Identify what type of content they want (events, restaurants, attractions)
2. Extract date/time intent (today, tomorrow, this weekend, etc.)
3. Extract location preferences (downtown, specific neighborhoods)
4. Extract price constraints (free, under $X, cheap, expensive)
5. Extract audience filters (family, kids, date night, groups)
6. Extract food preferences (cuisine type, dietary restrictions)
7. Extract amenity preferences (outdoor seating, live music, parking)
8. Determine sorting preference

RESPONSE FORMAT (JSON only, no explanation):
{
  "contentTypes": ["events", "restaurants", "attractions"],
  "keywords": ["extracted", "search", "terms"],
  "category": "Music|Food|Sports|Arts|Family|Outdoor|Nightlife|etc or null",
  "cuisine": "Italian|Mexican|American|etc or null",
  "location": "specific location mentioned or null",
  "neighborhood": "recognized neighborhood or null",
  "nearDowntown": true/false,
  "dateFilter": "today|tomorrow|this_weekend|this_week|next_week|specific|null",
  "specificDate": "YYYY-MM-DD if mentioned or null",
  "timeOfDay": "morning|afternoon|evening|night|null",
  "priceRange": "free|cheap|moderate|expensive|any",
  "maxBudget": number or null,
  "familyFriendly": true/false/null,
  "kidFriendly": true/false/null,
  "dateFriendly": true/false/null,
  "groupFriendly": true/false/null,
  "petFriendly": true/false/null,
  "outdoorSeating": true/false/null,
  "liveMusic": true/false/null,
  "parking": true/false/null,
  "dietary": ["vegan", "gluten-free", etc] or [],
  "sortBy": "relevance|date|rating|price|distance",
  "confidence": 0.0-1.0
}

Return ONLY the JSON object, no other text.`;

    // Call Claude Haiku for fast parsing
    const config = await getAIConfig(supabaseUrl, supabaseServiceKey);
    const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseServiceKey);
    const requestBody = await buildLightweightClaudeRequest(
      [{ role: 'user', content: nlpPrompt }],
      { supabaseUrl, supabaseKey: supabaseServiceKey }
    );

    const aiResponse = await fetchWithTimeout(config.api_endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    }, 60_000);

    if (!aiResponse.ok) {
      const errorData = await aiResponse.text();
      console.error('Claude API error:', aiResponse.status, errorData);
      throw new Error(`Claude API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const extracted = extractClaudeText(aiResult);
    if (!extracted.ok) {
      console.error("Claude response not usable:", extracted.reason, extracted.detail);
      throw new Error(`AI response ${extracted.reason}: ${extracted.detail}`);
    }
    const parsedText = extracted.text;

    let parsedIntent: ParsedSearchIntent;
    try {
      const jsonMatch = parsedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedIntent = JSON.parse(jsonMatch[0]);
        parsedIntent.originalQuery = query;
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.warn('Failed to parse NLP response, using fallback:', parseError);
      // Fallback to basic keyword search
      parsedIntent = {
        contentTypes: contentTypes,
        keywords: query.split(' ').filter(w => w.length > 2),
        confidence: 0.3,
        originalQuery: query,
        priceRange: 'any',
        sortBy: 'relevance'
      };
    }

    console.log('Parsed intent:', JSON.stringify(parsedIntent, null, 2));

    // Now execute the search based on parsed intent
    const results: any = {
      events: [],
      restaurants: [],
      attractions: [],
    };

    // Date range in America/Chicago (events.date is TIMESTAMPTZ). This used
    // to be computed on UTC calendar dates, so evening searches for
    // "tonight" returned tomorrow's events. See dateWindow.ts.
    const dateWindow = nlpDateWindow(parsedIntent.dateFilter, new Date(), parsedIntent.specificDate);

    // Build search keyword from parsed intent. Sanitize every value that gets
    // interpolated into a PostgREST filter string to prevent filter injection
    // (this function runs with the service-role key, bypassing RLS).
    const searchKeyword = sanitizePostgrestPattern(
      parsedIntent.keywords.length > 0
        ? parsedIntent.keywords.join(' ')
        : query
    );

    // Search events if requested
    if (parsedIntent.contentTypes.includes('events')) {
      let eventsQuery = supabaseClient
        .from('events')
        .select('*')
        .order('date', { ascending: true })
        .limit(20);

      // Same visibility predicate as the web app's applyEventVisibility():
      // this client uses the service-role key, so RLS does not hide merged,
      // hidden or archived rows here.
      eventsQuery = eventsQuery
        .neq('is_merged', true)
        .neq('is_hidden', true)
        .is('archived_at', null);

      // Apply date filters (Central day bounds; default is today onward)
      if (dateWindow) {
        eventsQuery = eventsQuery.gte('date', dateWindow.start).lte('date', dateWindow.end);
      } else {
        eventsQuery = eventsQuery.gte('date', centralTodayStartUtc());
      }

      // Apply category filter
      if (parsedIntent.category) {
        eventsQuery = eventsQuery.ilike('category', `%${sanitizePostgrestPattern(parsedIntent.category)}%`);
      }

      // Apply location filter
      if (parsedIntent.location || parsedIntent.neighborhood) {
        const locationFilter = sanitizePostgrestPattern(parsedIntent.neighborhood || parsedIntent.location);
        eventsQuery = eventsQuery.or(`location.ilike.%${locationFilter}%,venue.ilike.%${locationFilter}%`);
      }

      // Apply price filter
      if (parsedIntent.priceRange === 'free') {
        eventsQuery = eventsQuery.or('price.ilike.%free%,price.is.null,price.eq.');
      }

      // Text search on title/description
      if (searchKeyword && parsedIntent.confidence > 0.5) {
        eventsQuery = eventsQuery.or(`title.ilike.%${searchKeyword}%,enhanced_description.ilike.%${searchKeyword}%,original_description.ilike.%${searchKeyword}%`);
      }

      const { data: eventsData, error: eventsError } = await eventsQuery;
      if (!eventsError && eventsData) {
        results.events = eventsData;
      }
    }

    // Search restaurants if requested
    if (parsedIntent.contentTypes.includes('restaurants')) {
      let restaurantsQuery = supabaseClient
        .from('restaurants')
        .select('*')
        .order('rating', { ascending: false, nullsFirst: false })
        .limit(20);

      // Apply cuisine filter
      if (parsedIntent.cuisine) {
        restaurantsQuery = restaurantsQuery.ilike('cuisine', `%${sanitizePostgrestPattern(parsedIntent.cuisine)}%`);
      }

      // Apply location filter
      if (parsedIntent.location || parsedIntent.neighborhood) {
        const locationFilter = sanitizePostgrestPattern(parsedIntent.neighborhood || parsedIntent.location);
        restaurantsQuery = restaurantsQuery.ilike('location', `%${locationFilter}%`);
      }

      // Apply price filter
      if (parsedIntent.priceRange) {
        switch (parsedIntent.priceRange) {
          case 'cheap':
            restaurantsQuery = restaurantsQuery.in('price_range', ['$', '$$']);
            break;
          case 'moderate':
            restaurantsQuery = restaurantsQuery.in('price_range', ['$$', '$$$']);
            break;
          case 'expensive':
            restaurantsQuery = restaurantsQuery.in('price_range', ['$$$', '$$$$']);
            break;
        }
      }

      // Text search
      if (searchKeyword && parsedIntent.confidence > 0.5) {
        restaurantsQuery = restaurantsQuery.or(`name.ilike.%${searchKeyword}%,description.ilike.%${searchKeyword}%,cuisine.ilike.%${searchKeyword}%`);
      }

      const { data: restaurantsData, error: restaurantsError } = await restaurantsQuery;
      if (!restaurantsError && restaurantsData) {
        results.restaurants = restaurantsData;
      }
    }

    // Search attractions if requested
    if (parsedIntent.contentTypes.includes('attractions')) {
      let attractionsQuery = supabaseClient
        .from('attractions')
        .select('*')
        .order('name', { ascending: true })
        .limit(20);

      // Apply location filter
      if (parsedIntent.location || parsedIntent.neighborhood) {
        const locationFilter = sanitizePostgrestPattern(parsedIntent.neighborhood || parsedIntent.location);
        attractionsQuery = attractionsQuery.ilike('location', `%${locationFilter}%`);
      }

      // Text search
      if (searchKeyword && parsedIntent.confidence > 0.5) {
        attractionsQuery = attractionsQuery.or(`name.ilike.%${searchKeyword}%,description.ilike.%${searchKeyword}%,category.ilike.%${searchKeyword}%`);
      }

      const { data: attractionsData, error: attractionsError } = await attractionsQuery;
      if (!attractionsError && attractionsData) {
        results.attractions = attractionsData;
      }
    }

    const responseTime = Date.now() - startTime;

    // Log search analytics (reuse the userId resolved for rate-limit keying).
    await supabaseClient.from('search_analytics').insert({
      user_id: userId,
      search_query: query,
      results_count: results.events.length + results.restaurants.length + results.attractions.length,
      // nlp_parsed, model_used AND response_time_ms WERE THREE COLUMNS
      // search_analytics DOES NOT HAVE, and PostgREST rejects the whole insert
      // on any one of them - so no NLP search has ever been logged, including
      // the real columns beside them (WEB-QUAL-015, WEB-QA-017). They are
      // folded into search_filters, which is jsonb, rather than dropped: the
      // data is worth keeping and this needs no migration.
      search_filters: {
        type: 'nlp',
        contentTypes: parsedIntent.contentTypes,
        dateFilter: parsedIntent.dateFilter,
        priceRange: parsedIntent.priceRange,
        location: parsedIntent.location,
        nlpParsed: parsedIntent,
        modelUsed: config.lightweight_model,
        responseTimeMs: responseTime,
      },
    }).catch(err => console.warn('Failed to log analytics:', err));

    console.log(`NLP Search completed in ${responseTime}ms. Found: ${results.events.length} events, ${results.restaurants.length} restaurants, ${results.attractions.length} attractions`);

    return new Response(JSON.stringify({
      success: true,
      query,
      parsedIntent,
      results,
      metadata: {
        totalResults: results.events.length + results.restaurants.length + results.attractions.length,
        responseTimeMs: responseTime,
        modelUsed: config.lightweight_model,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in nlp-search function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
