import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { getAIConfig, buildLightweightClaudeRequest, getClaudeHeaders } from "../_shared/aiConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const claudeApiKey = Deno.env.get('CLAUDE_API') || Deno.env.get('CLAUDE_API_KEY');
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

    console.log(`NLP Search: Parsing query "${query}"`);

    // Get today's date for context
    const today = new Date();
    const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });
    const todayStr = today.toISOString().split('T')[0];

    // Build the NLP parsing prompt
    const nlpPrompt = `You are a search query parser for Des Moines, Iowa local discovery app. Parse the user's natural language query into structured search parameters.

CURRENT CONTEXT:
- Today is ${dayOfWeek}, ${today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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

    const aiResponse = await fetch(config.api_endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!aiResponse.ok) {
      const errorData = await aiResponse.text();
      console.error('Claude API error:', aiResponse.status, errorData);
      throw new Error(`Claude API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const parsedText = aiResult.content[0].text;

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

    // Calculate date range based on parsed intent
    let dateStart: string | null = null;
    let dateEnd: string | null = null;

    if (parsedIntent.dateFilter) {
      const now = new Date();
      switch (parsedIntent.dateFilter) {
        case 'today':
          dateStart = todayStr;
          dateEnd = todayStr;
          break;
        case 'tomorrow':
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          dateStart = tomorrow.toISOString().split('T')[0];
          dateEnd = dateStart;
          break;
        case 'this_weekend':
          const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
          const saturday = new Date(now);
          saturday.setDate(saturday.getDate() + daysUntilSaturday);
          const sunday = new Date(saturday);
          sunday.setDate(sunday.getDate() + 1);
          dateStart = saturday.toISOString().split('T')[0];
          dateEnd = sunday.toISOString().split('T')[0];
          break;
        case 'this_week':
          dateStart = todayStr;
          const endOfWeek = new Date(now);
          endOfWeek.setDate(endOfWeek.getDate() + (7 - now.getDay()));
          dateEnd = endOfWeek.toISOString().split('T')[0];
          break;
        case 'next_week':
          const startNextWeek = new Date(now);
          startNextWeek.setDate(startNextWeek.getDate() + (7 - now.getDay() + 1));
          const endNextWeek = new Date(startNextWeek);
          endNextWeek.setDate(endNextWeek.getDate() + 6);
          dateStart = startNextWeek.toISOString().split('T')[0];
          dateEnd = endNextWeek.toISOString().split('T')[0];
          break;
        case 'specific':
          if (parsedIntent.specificDate) {
            dateStart = parsedIntent.specificDate;
            dateEnd = parsedIntent.specificDate;
          }
          break;
      }
    }

    // Build search keyword from parsed intent
    const searchKeyword = parsedIntent.keywords.length > 0
      ? parsedIntent.keywords.join(' ')
      : query;

    // Search events if requested
    if (parsedIntent.contentTypes.includes('events')) {
      let eventsQuery = supabaseClient
        .from('events')
        .select('*')
        .order('date', { ascending: true })
        .limit(20);

      // Apply date filters
      if (dateStart) {
        eventsQuery = eventsQuery.gte('date', dateStart);
      } else {
        // Default to today and future
        eventsQuery = eventsQuery.gte('date', todayStr);
      }
      if (dateEnd) {
        eventsQuery = eventsQuery.lte('date', dateEnd + 'T23:59:59');
      }

      // Apply category filter
      if (parsedIntent.category) {
        eventsQuery = eventsQuery.ilike('category', `%${parsedIntent.category}%`);
      }

      // Apply location filter
      if (parsedIntent.location || parsedIntent.neighborhood) {
        const locationFilter = parsedIntent.neighborhood || parsedIntent.location;
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
        restaurantsQuery = restaurantsQuery.ilike('cuisine', `%${parsedIntent.cuisine}%`);
      }

      // Apply location filter
      if (parsedIntent.location || parsedIntent.neighborhood) {
        const locationFilter = parsedIntent.neighborhood || parsedIntent.location;
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
        const locationFilter = parsedIntent.neighborhood || parsedIntent.location;
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

    // Log search analytics
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabaseClient.auth.getUser(token);
      userId = user?.id;
    }

    await supabaseClient.from('search_analytics').insert({
      user_id: userId,
      search_query: query,
      results_count: results.events.length + results.restaurants.length + results.attractions.length,
      search_filters: {
        type: 'nlp',
        contentTypes: parsedIntent.contentTypes,
        dateFilter: parsedIntent.dateFilter,
        priceRange: parsedIntent.priceRange,
        location: parsedIntent.location,
      },
      nlp_parsed: parsedIntent,
      model_used: config.lightweight_model,
      response_time_ms: responseTime,
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
