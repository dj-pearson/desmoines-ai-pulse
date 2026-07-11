import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { getAIConfig, buildClaudeRequest, getClaudeHeaders, getAnthropicApiKey, extractClaudeText } from "../_shared/aiConfig.ts";
import { checkRateLimitPersistent } from "../_shared/rateLimit.ts";
import { resolveEntitledTier, hasFeatureAccess } from "../_shared/entitlements.ts";
import { getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

// Monthly trip-planner quota per tier (matches the web useSubscription copy /
// WEB-FEAT-011). -1 = unlimited. Enforced server-side so the client gate can't
// be bypassed by calling the function directly.
const TRIP_PLANNER_MONTHLY_QUOTA: Record<'free' | 'insider' | 'vip', number> = {
  free: 0, // free has no trip_planner access at all (gated above)
  insider: 5,
  vip: -1,
};

// Origin-validated CORS: this endpoint returns a user's private itinerary, so
// it echoes only an allowlisted Origin (native apps send no Origin and are
// unaffected — CORS is browser-enforced).
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  return getCorsHeaders(origin && isOriginAllowed(origin) ? origin : undefined);
}

/**
 * AI Trip Planner - Intelligent Itinerary Generator
 *
 * Uses Claude Sonnet (full model) to generate personalized multi-day
 * itineraries based on user preferences, available events, restaurants,
 * and attractions in the Des Moines area.
 */

interface TripPlannerRequest {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  preferences: {
    interests?: string[];           // ["music", "food", "outdoors", "arts", "sports"]
    budget?: 'budget' | 'moderate' | 'splurge' | 'any';
    pace?: 'relaxed' | 'moderate' | 'packed';
    groupSize?: number;
    hasChildren?: boolean;
    childAges?: number[];
    accessibilityNeeds?: string[];
    dietaryRestrictions?: string[];
    mustSee?: string[];             // Specific places they want to include
    avoidCategories?: string[];     // Categories to avoid
  };
  // Optional: existing trip plan to update/enhance
  existingTripId?: string;
}

interface ItineraryItem {
  dayNumber: number;
  orderIndex: number;
  itemType: 'event' | 'restaurant' | 'attraction' | 'custom' | 'transport' | 'break';
  contentId?: string;
  contentType?: 'event' | 'restaurant' | 'attraction';
  customTitle?: string;
  customDescription?: string;
  customLocation?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes: number;
  notes?: string;
  estimatedCost?: string;
  aiReason: string;
}

interface GeneratedItinerary {
  title: string;
  description: string;
  totalEstimatedCost: string;
  items: ItineraryItem[];
  tips: string[];
  packingList?: string[];
}

serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    const claudeApiKey = getAnthropicApiKey();
    if (!claudeApiKey) {
      throw new Error('CLAUDE_API key is required');
    }

    // Get user info
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // PROD-SUB-001: enforce the Trip Planner paywall SERVER-side. The web/iOS
    // PremiumGate is client-only and bypassable by calling this function
    // directly, so verify the caller is entitled to the trip_planner feature
    // (Insider+) here too.
    const tier = await resolveEntitledTier(supabaseClient, user.id);
    if (!hasFeatureAccess(tier, 'trip_planner')) {
      return new Response(
        JSON.stringify({
          error: 'Trip Planner is an Insider feature. Please upgrade to continue.',
          code: 'upgrade_required',
          feature: 'trip_planner',
          requiredTier: 'insider',
          tier,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Persistent, per-user burst limit (survives edge cold starts; keyed by the
    // verified user id, not a spoofable IP). Generous enough not to interfere
    // with legitimate use or older iOS clients that retry.
    const burst = await checkRateLimitPersistent(req, {
      endpoint: 'generate-itinerary',
      userId: user.id,
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: 'AI itinerary rate limit exceeded. Please try again later.',
    });
    if (!burst.success) return burst.response!;

    // Monthly quota per tier (Insider 5 / VIP unlimited). Counts itineraries
    // this calendar month from trip_plans (no new table needed). Returns a
    // structured 429 the web client surfaces as an upgrade prompt.
    const monthlyQuota = TRIP_PLANNER_MONTHLY_QUOTA[tier];
    if (monthlyQuota !== -1) {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const { count: usedThisMonth, error: quotaErr } = await supabaseClient
        .from('trip_plans')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('ai_generated', true)
        .gte('created_at', monthStart.toISOString());

      // Fail open on a quota-count error — never block a paying user on our bug.
      if (quotaErr) {
        console.warn('[generate-itinerary] monthly quota count failed, allowing:', quotaErr.message);
      } else if ((usedThisMonth ?? 0) >= monthlyQuota) {
        return new Response(
          JSON.stringify({
            error: `You've used all ${monthlyQuota} trip plans included this month.`,
            code: 'quota_exceeded',
            feature: 'trip_planner',
            tier,
            limit: monthlyQuota,
            used: usedThisMonth,
            requiredTier: tier === 'insider' ? 'vip' : 'insider',
            upgradeHint: tier === 'insider' ? 'vip' : 'insider',
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const {
      startDate,
      endDate,
      preferences = {},
      existingTripId
    }: TripPlannerRequest = await req.json();

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }
    if (end < start) {
      throw new Error('End date must be after start date');
    }

    const numDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (numDays > 14) {
      throw new Error('Trip cannot exceed 14 days');
    }

    console.log(`Generating ${numDays}-day itinerary from ${startDate} to ${endDate}`);

    // Fetch available events during the trip dates
    const { data: events, error: eventsError } = await supabaseClient
      .from('events')
      .select('id, title, enhanced_description, original_description, date, location, venue, category, price, image_url, latitude, longitude')
      .gte('date', startDate)
      .lte('date', endDate + 'T23:59:59')
      .order('date', { ascending: true })
      .limit(100);

    if (eventsError) console.error('Error fetching events:', eventsError);

    // Fetch restaurants
    const { data: restaurants, error: restaurantsError } = await supabaseClient
      .from('restaurants')
      .select('id, name, description, cuisine, location, price_range, rating, image_url, hours, latitude, longitude')
      .order('rating', { ascending: false, nullsFirst: false })
      .limit(50);

    if (restaurantsError) console.error('Error fetching restaurants:', restaurantsError);

    // Fetch attractions
    const { data: attractions, error: attractionsError } = await supabaseClient
      .from('attractions')
      .select('id, name, description, category, location, hours, admission, website, image_url, latitude, longitude')
      .limit(50);

    if (attractionsError) console.error('Error fetching attractions:', attractionsError);

    // Build context for AI
    const eventsContext = (events || []).map(e => ({
      id: e.id,
      title: e.title,
      description: (e.enhanced_description || e.original_description || '').substring(0, 200),
      date: e.date,
      location: e.location,
      venue: e.venue,
      category: e.category,
      price: e.price,
    }));

    const restaurantsContext = (restaurants || []).map(r => ({
      id: r.id,
      name: r.name,
      description: (r.description || '').substring(0, 150),
      cuisine: r.cuisine,
      location: r.location,
      priceRange: r.price_range,
      rating: r.rating,
    }));

    const attractionsContext = (attractions || []).map(a => ({
      id: a.id,
      name: a.name,
      description: (a.description || '').substring(0, 150),
      category: a.category,
      location: a.location,
      admission: a.admission,
    }));

    // Build preferences context
    const prefsContext = {
      interests: preferences.interests || ['general'],
      budget: preferences.budget || 'moderate',
      pace: preferences.pace || 'moderate',
      groupSize: preferences.groupSize || 2,
      hasChildren: preferences.hasChildren || false,
      childAges: preferences.childAges || [],
      accessibilityNeeds: preferences.accessibilityNeeds || [],
      dietaryRestrictions: preferences.dietaryRestrictions || [],
      mustSee: preferences.mustSee || [],
      avoidCategories: preferences.avoidCategories || [],
    };

    // Build the AI prompt
    const itineraryPrompt = `You are an expert Des Moines, Iowa travel planner creating a personalized itinerary.

TRIP DETAILS:
- Start Date: ${startDate} (${new Date(startDate).toLocaleDateString('en-US', { weekday: 'long' })})
- End Date: ${endDate} (${new Date(endDate).toLocaleDateString('en-US', { weekday: 'long' })})
- Number of Days: ${numDays}

USER PREFERENCES:
${JSON.stringify(prefsContext, null, 2)}

AVAILABLE EVENTS DURING TRIP:
${JSON.stringify(eventsContext, null, 2)}

AVAILABLE RESTAURANTS:
${JSON.stringify(restaurantsContext, null, 2)}

AVAILABLE ATTRACTIONS:
${JSON.stringify(attractionsContext, null, 2)}

PLANNING GUIDELINES:
1. Create a balanced itinerary matching the user's pace preference:
   - Relaxed: 2-3 activities per day with plenty of downtime
   - Moderate: 3-4 activities per day with some breaks
   - Packed: 5+ activities per day maximizing experiences

2. Consider practical logistics:
   - Group nearby activities together
   - Account for meal times (breakfast ~8am, lunch ~12pm, dinner ~6pm)
   - Include travel time between locations
   - Leave buffer time for unexpected discoveries

3. Match the budget level:
   - Budget: Free events, affordable restaurants ($-$$), free attractions
   - Moderate: Mix of free and paid, mid-range restaurants ($$-$$$)
   - Splurge: Premium events, fine dining ($$$-$$$$), special experiences

4. For families with children:
   - Prioritize kid-friendly activities
   - Include playground/park time
   - Plan around nap times for young children
   - Choose family-friendly restaurants

5. Include Des Moines highlights:
   - Downtown Des Moines / East Village for dining and nightlife
   - Pappajohn Sculpture Park for outdoor art
   - Iowa State Capitol for history
   - Principal Park if there's a baseball game
   - Local farmers markets on weekends

6. Time allocations:
   - Meals: 45-90 minutes
   - Major attractions: 2-3 hours
   - Events: varies by type
   - Walking/transit: 15-30 minutes between locations

CREATE A DETAILED ITINERARY with this exact JSON structure:
{
  "title": "Catchy trip title reflecting the experience",
  "description": "2-3 sentence overview of what makes this trip special",
  "totalEstimatedCost": "$X-$Y per person estimate",
  "items": [
    {
      "dayNumber": 1,
      "orderIndex": 1,
      "itemType": "restaurant|event|attraction|custom|transport|break",
      "contentId": "UUID from provided data or null for custom",
      "contentType": "event|restaurant|attraction or null",
      "customTitle": "Only for custom items",
      "customDescription": "Only for custom items",
      "customLocation": "Only for custom items",
      "startTime": "HH:MM (24hr format)",
      "endTime": "HH:MM",
      "durationMinutes": 60,
      "notes": "Helpful tips for this activity",
      "estimatedCost": "$X-$Y or Free",
      "aiReason": "Why this was recommended (1-2 sentences)"
    }
  ],
  "tips": [
    "Practical tip 1 for the trip",
    "Practical tip 2",
    "Local insider tip"
  ],
  "packingList": [
    "Item to bring based on activities planned"
  ]
}

IMPORTANT:
- Use ACTUAL IDs from the provided events/restaurants/attractions data
- For custom activities (like "check into hotel", "walk along river"), use itemType="custom" with contentId=null
- Include breakfast, lunch, and dinner each day
- Order items chronologically within each day
- Be specific with times and durations
- Make aiReason personal and relevant to their preferences

Return ONLY the JSON object, no additional text.`;

    // Call Claude Sonnet for intelligent planning
    const config = await getAIConfig(supabaseUrl, supabaseServiceKey);
    const headers = await getClaudeHeaders(claudeApiKey, supabaseUrl, supabaseServiceKey);
    const requestBody = await buildClaudeRequest(
      [{ role: 'user', content: itineraryPrompt }],
      {
        supabaseUrl,
        supabaseKey: supabaseServiceKey,
        useLargeTokens: true,     // Use large token limit for detailed itinerary
        useCreativeTemp: false    // Keep it precise
      }
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
    const itineraryText = extracted.text;

    let generatedItinerary: GeneratedItinerary;
    try {
      const jsonMatch = itineraryText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generatedItinerary = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse itinerary JSON:', parseError);
      throw new Error('Failed to generate itinerary. Please try again.');
    }

    // Generate share code
    const shareCode = await supabaseClient.rpc('generate_trip_share_code').then(r => r.data).catch(() => null);

    // Create the trip plan in the database
    const { data: tripPlan, error: tripError } = await supabaseClient
      .from('trip_plans')
      .insert({
        user_id: user.id,
        title: generatedItinerary.title,
        description: generatedItinerary.description,
        start_date: startDate,
        end_date: endDate,
        preferences: prefsContext,
        status: 'draft',
        is_public: false,
        share_code: shareCode,
        ai_generated: true,
        total_estimated_cost: generatedItinerary.totalEstimatedCost,
      })
      .select()
      .single();

    if (tripError) {
      console.error('Error creating trip plan:', tripError);
      throw new Error('Failed to save trip plan');
    }

    // Insert itinerary items
    const itemsToInsert = generatedItinerary.items.map((item, idx) => ({
      trip_plan_id: tripPlan.id,
      day_number: item.dayNumber,
      order_index: item.orderIndex,
      item_type: item.itemType,
      event_id: item.contentType === 'event' ? item.contentId : null,
      restaurant_id: item.contentType === 'restaurant' ? item.contentId : null,
      attraction_id: item.contentType === 'attraction' ? item.contentId : null,
      custom_title: item.customTitle || null,
      custom_description: item.customDescription || null,
      custom_location: item.customLocation || null,
      start_time: item.startTime || null,
      end_time: item.endTime || null,
      duration_minutes: item.durationMinutes || null,
      notes: item.notes || null,
      estimated_cost: item.estimatedCost || null,
      booking_url: null,
      is_confirmed: false,
      ai_suggested: true,
      ai_reason: item.aiReason,
    }));

    const { error: itemsError } = await supabaseClient
      .from('trip_plan_items')
      .insert(itemsToInsert);

    if (itemsError) {
      // WEB-BE-006: the plan row is quota-counted (ai_generated=true) but is
      // useless without its items. Rather than charge the user a quota unit for
      // a broken empty plan, compensate by deleting the just-created plan and
      // return a retriable error. (A monthly quota counts trip_plans rows, so
      // removing the plan means it is not counted.)
      console.error('Error creating trip items; rolling back the trip plan:', itemsError);
      const { error: rollbackError } = await supabaseClient
        .from('trip_plans')
        .delete()
        .eq('id', tripPlan.id);
      if (rollbackError) {
        console.error('Failed to roll back trip plan after items error:', rollbackError);
      }
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to save your itinerary. Please try again.',
        code: 'itinerary_save_failed',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the complete itinerary with item details
    const { data: fullItinerary } = await supabaseClient
      .rpc('get_trip_itinerary', { p_trip_id: tripPlan.id });

    console.log(`Successfully generated ${numDays}-day itinerary: ${tripPlan.title}`);

    return new Response(JSON.stringify({
      success: true,
      tripPlan: {
        ...tripPlan,
        items: fullItinerary || [],
        tips: generatedItinerary.tips,
        packingList: generatedItinerary.packingList,
      },
      metadata: {
        numDays,
        numItems: generatedItinerary.items.length,
        modelUsed: config.default_model,
        eventsAvailable: events?.length || 0,
        restaurantsAvailable: restaurants?.length || 0,
        attractionsAvailable: attractions?.length || 0,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Sanitized: full error logged server-side; clients get a generic message.
    console.error('Error in generate-itinerary function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to generate itinerary. Please try again.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
