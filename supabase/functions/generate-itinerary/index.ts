import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { getAIConfig, buildClaudeRequest, getClaudeHeaders, getAnthropicApiKey, extractClaudeText } from "../_shared/aiConfig.ts";
import { detectCrisisIntent, crisisPayload } from '../_shared/crisisSupport.ts';
import { checkRateLimitPersistent } from "../_shared/rateLimit.ts";
import { resolveEntitledTier, hasFeatureAccess } from "../_shared/entitlements.ts";
import { getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { anthropicCostUsd } from "../_shared/providerUsage.ts";
import { denialBody, guardAi, type QuotaClient } from "../_shared/aiQuota.ts";
import {
  centralEventWindow,
  centralMonthStartUtc,
  centralToday,
  sanitizeItems,
  stringList,
  validateTripRequest,
} from "./planning.ts";

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
    neighborhood?: string;          // Optional area focus (IOS-DD-TRIP-PLANNER-08)
  };
  // XPLAT-010 AC3: `existingTripId` used to be declared here as "existing trip
  // plan to update/enhance". It was removed 2026-08-22 because the capability
  // existed on NEITHER side: no client ever sent it - not web, not iOS, not
  // Android, confirmed by the XPLAT-011 contract scan - and the handler
  // destructured it and never read it again. It documented a feature nobody
  // could use.
  //
  // Not a backward-compatibility break under CLAUDE.md. That rule protects a
  // field shipped binaries SEND, and none do; and the wire behaviour is
  // unchanged either way, since a request carrying an extra property still
  // parses and the property was already ignored.
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
      // 401 rather than the generic 500 the thrown error became, so a client
      // can tell "sign in again" from "try again" (IOS-DD-TRIP-PLANNER-08).
      return new Response(
        JSON.stringify({ success: false, error: 'Sign in to plan a trip.', code: 'sign_in_required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
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

    // PREFLIGHT: trip_plans must be reachable before we spend a model call.
    //
    // WEB-QA-005 / WEB-QA-018. The failure order used to be: quota count on
    // trip_plans errors and FAILS OPEN by design, the Claude call goes out and
    // is paid for, the insert at the end hits 42P01, and the user is shown
    // "Failed to save trip plan". trip_plans is one of the tables whose
    // migration is ledgered as applied and produced nothing, so on production
    // that is EVERY attempt: a real API bill and an error page, every time.
    //
    // Fail-open on a transient error is still right - never block a paying user
    // on our own bug - so this closes exactly one case and leaves that intact:
    // the table not existing, where continuing is guaranteed to cost money and
    // end in the same error.
    //
    // A GET of at most one id, NOT head:true. PostgREST answers a HEAD on a
    // missing relation with a bodyless 404, and postgrest-js turns a bodyless
    // 404 into a 204 with error null, so the head probe never saw 42P01 and
    // every call still went to the model (IOS-DD-TRIP-PLANNER-02).
    const { error: storageProbeError } = await supabaseClient
      .from('trip_plans')
      .select('id')
      .limit(1);

    // 42P01 is Postgres; PGRST205 is PostgREST's schema-cache equivalent. Both
    // mean "no such relation" as opposed to "the database is briefly unhappy".
    if (storageProbeError && ['42P01', 'PGRST205'].includes(storageProbeError.code ?? '')) {
      console.error(
        '[generate-itinerary] trip_plans is missing (' + storageProbeError.code +
          ') - refusing before the model call so the request is not billed.',
      );
      // Same 500 and the same { success, error } envelope the catch block
      // already returns, so no shipped client sees a status or shape it does
      // not handle. `code` is additive; older clients ignore unknown keys.
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Trip planning is temporarily unavailable. No plan was used from your monthly allowance.',
          code: 'trip_storage_unavailable',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Parse and validate BEFORE anything is counted or billed
    // (IOS-DD-TRIP-PLANNER-08). Dates are rejected with a 400 and a code;
    // preference fields are clamped, never rejected.
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'The request body is not valid JSON.', code: 'invalid_body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const validation = validateTripRequest(rawBody, centralToday(new Date()));
    if (!validation.ok) {
      return new Response(
        JSON.stringify({ success: false, error: validation.error, code: validation.code }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { startDate, endDate, numDays, preferences } = validation.value;

    // Crisis check on the free-text preference fields (WEB-LEGAL-005). The
    // itinerary planner is mostly structured input, but mustSee and the other
    // string arrays are typed by the user and reach the model. Checked before
    // any model call; nothing is logged or stored. Run on the RAW fields, so
    // the clamping above can never cut the phrase that matters.
    const rawPrefs = ((rawBody as { preferences?: Record<string, unknown> })?.preferences ?? {}) as Record<string, unknown>;
    const rawList = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    const freeText = [
      ...rawList(rawPrefs.mustSee),
      ...rawList(rawPrefs.interests),
      ...rawList(rawPrefs.accessibilityNeeds),
      ...rawList(rawPrefs.dietaryRestrictions),
      ...(typeof rawPrefs.neighborhood === 'string' ? [rawPrefs.neighborhood] : []),
    ];
    if (freeText.some((t) => detectCrisisIntent(t))) {
      return new Response(
        JSON.stringify(crisisPayload()),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Monthly quota per tier (Insider 5 / VIP unlimited). Counts GENERATIONS
    // this Central-time month from the trip_plan_generations ledger
    // (IOS-DD-TRIP-PLANNER-06). It used to count trip_plans rows, which the
    // owner can delete, so deleting a plan refunded it; and it used the UTC
    // month, so a plan made on the evening of the 31st counted against the
    // next month. Returns a structured 429 clients surface as an upgrade prompt.
    const monthlyQuota = TRIP_PLANNER_MONTHLY_QUOTA[tier];
    let usedThisMonth: number | null = null;
    if (monthlyQuota !== -1) {
      const monthStart = centralMonthStartUtc(new Date());
      const { count, error: quotaErr } = await supabaseClient
        .from('trip_plan_generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStart.toISOString());
      usedThisMonth = count ?? 0;

      // Fail open on a quota-count error — never block a paying user on our bug.
      if (quotaErr) {
        console.warn('[generate-itinerary] monthly quota count failed, allowing:', quotaErr.message);
        usedThisMonth = null;
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

    console.log(`Generating ${numDays}-day itinerary from ${startDate} to ${endDate}`);

    // The trip's Des Moines days as UTC instants: events.date is a timestamptz,
    // and the bare-date comparison ran the window in UTC (IOS-DD-TRIP-PLANNER-08).
    const eventWindow = centralEventWindow(startDate, endDate);

    // The three reads are independent, so they run together. Each applies the
    // same visibility the listing pages do: no archived, hidden or merged
    // events, no merged restaurants, no inactive attractions.
    const [eventsResult, restaurantsResult, attractionsResult] = await Promise.all([
      supabaseClient
        .from('events')
        .select('id, title, enhanced_description, original_description, date, event_start_local, location, venue, category, price, image_url, latitude, longitude')
        .gte('date', eventWindow.fromIso)
        .lt('date', eventWindow.toIso)
        .is('archived_at', null)
        .not('is_hidden', 'is', true)
        .not('is_merged', 'is', true)
        .order('date', { ascending: true })
        .limit(100),
      supabaseClient
        .from('restaurants')
        // `hours` DROPPED: restaurants has no opening-hours column, so asking for it
        // failed the whole select with 42703 and the planner got zero restaurants.
        .select('id, name, description, cuisine, location, price_range, rating, image_url, latitude, longitude')
        .not('is_merged', 'is', true)
        .order('rating', { ascending: false, nullsFirst: false })
        .limit(50),
      supabaseClient
        .from('attractions')
        // category -> type (attractions stores the kind in `type`), and admission ->
        // is_free, the only cost signal the table carries. `hours` DOES exist here,
        // unlike on restaurants, so it stays.
        .select('id, name, description, type, location, hours, is_free, website, image_url, latitude, longitude')
        .not('is_active', 'is', false)
        .limit(50),
    ]);

    const { data: events, error: eventsError } = eventsResult;
    const { data: restaurants, error: restaurantsError } = restaurantsResult;
    const { data: attractions, error: attractionsError } = attractionsResult;
    if (eventsError) console.error('Error fetching events:', eventsError);
    if (restaurantsError) console.error('Error fetching restaurants:', restaurantsError);
    if (attractionsError) console.error('Error fetching attractions:', attractionsError);

    // Build context for AI
    const eventsContext = (events || []).map(e => ({
      id: e.id,
      title: e.title,
      description: (e.enhanced_description || e.original_description || '').substring(0, 200),
      date: e.date,
      // Des Moines wall-clock start, so the model plans around the real
      // showtime rather than a UTC instant.
      startsLocal: e.event_start_local,
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
      category: a.type,
      location: a.location,
      // The model is told free/paid rather than a price string, because that is
      // what the schema actually knows. Inventing an admission line would be worse
      // than omitting one in an itinerary the user acts on.
      admission: a.is_free === true ? 'Free' : a.is_free === false ? 'Paid admission' : null,
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
      neighborhood: preferences.neighborhood ?? null,
    };

    const neighborhoodLine = preferences.neighborhood
      ? `\n- Prefer stops in or near ${preferences.neighborhood}.`
      : '';

    // Build the AI prompt
    const itineraryPrompt = `You are an expert Des Moines, Iowa travel planner creating a personalized itinerary.

TRIP DETAILS:
- Start Date: ${startDate} (${new Date(startDate).toLocaleDateString('en-US', { weekday: 'long' })})
- End Date: ${endDate} (${new Date(endDate).toLocaleDateString('en-US', { weekday: 'long' })})
- Number of Days: ${numDays}${neighborhoodLine}

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

    // DAILY cap and provider budget (WP1 of NON_CORE_REVIEW_2026-09), on top
    // of the monthly count above. Taken here, after every check that can
    // reject the request for free, so a bad date never costs a plan. The
    // monthly count reads the trip_plan_generations ledger, written only once
    // a plan is saved, so it never sees a call that was billed and then
    // failed; this counter is taken before the call and does.
    const quota = await guardAi(supabaseClient as unknown as QuotaClient, req, {
      feature: 'itinerary',
      provider: 'anthropic',
      tier,
      userId: user.id,
      source: 'generate-itinerary',
      headers: corsHeaders,
    });
    if (!quota.ok) {
      const body = denialBody(quota.decision, 'itinerary', tier, new Date());
      if (quota.decision.code === 'quota_exceeded') {
        body.error = `You've reached today's limit of ${quota.decision.limit ?? 'AI'} trip plans. It resets at midnight Central.`;
        body.period = 'day';
      }
      return new Response(JSON.stringify(body), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(body.retryAfter),
        },
      });
    }

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

    // AOS-MANAGE-005: record the spend BEFORE anything that can throw.
    //
    // Everything below here can fail - an unusable response, unparseable JSON, a
    // trip_plans insert - and every one of those failures happens AFTER
    // Anthropic has billed for this call. Recording later would mean the runs
    // that cost money and delivered nothing are exactly the ones the budget
    // watchdog never sees. That is the WEB-QA-005 case: billed, thrown away,
    // invisible.
    //
    // settle() writes provider_usage as before, plus the ai_usage_daily subject
    // and global rows the daily budget is checked against.
    const billedModel = String(requestBody.model ?? config.default_model);
    await quota.settle({
      costUsd: anthropicCostUsd(billedModel, aiResult?.usage ?? {}),
      model: billedModel,
      usage: aiResult?.usage ?? {},
      extra: { days: numDays },
    });

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

    // Keep only listings the model was actually given, with types the table
    // accepts (IOS-DD-TRIP-PLANNER-08). A hallucinated id used to fail the FK
    // and roll back a plan that had already been billed.
    const knownIds = {
      event: new Set<string>((events || []).map((e) => String(e.id))),
      restaurant: new Set<string>((restaurants || []).map((r) => String(r.id))),
      attraction: new Set<string>((attractions || []).map((a) => String(a.id))),
    };
    const sanitizedItems = sanitizeItems(generatedItinerary.items, knownIds, numDays);
    if (sanitizedItems.length === 0) {
      throw new Error('Generated itinerary had no usable stops');
    }
    const tips = stringList(generatedItinerary.tips);
    const packingList = stringList(generatedItinerary.packingList);

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
        // Stored so a reopened trip still shows them (IOS-DD-TRIP-PLANNER-17).
        tips,
        packing_list: packingList,
      })
      .select()
      .single();

    if (tripError) {
      console.error('Error creating trip plan:', tripError);
      throw new Error('Failed to save trip plan');
    }

    // Insert itinerary items
    const itemsToInsert = sanitizedItems.map((item) => ({
      trip_plan_id: tripPlan.id,
      day_number: item.dayNumber,
      order_index: item.orderIndex,
      item_type: item.itemType,
      event_id: item.contentType === 'event' ? item.contentId : null,
      restaurant_id: item.contentType === 'restaurant' ? item.contentId : null,
      attraction_id: item.contentType === 'attraction' ? item.contentId : null,
      custom_title: item.customTitle,
      custom_description: item.customDescription,
      custom_location: item.customLocation,
      start_time: item.startTime,
      end_time: item.endTime,
      duration_minutes: item.durationMinutes,
      notes: item.notes,
      estimated_cost: item.estimatedCost,
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

    // Record the generation in the ledger the monthly quota counts
    // (IOS-DD-TRIP-PLANNER-06). The owner cannot delete from it, so deleting
    // a plan no longer returns it to the allowance. A failure here is logged
    // and the user still gets the plan they were billed for.
    const { error: ledgerError } = await supabaseClient
      .from('trip_plan_generations')
      .insert({ user_id: user.id, trip_plan_id: tripPlan.id });
    if (ledgerError) {
      console.error('[generate-itinerary] could not record the generation:', ledgerError);
    }

    // Fetch the complete itinerary with item details
    const { data: fullItinerary, error: itineraryError } = await supabaseClient
      .rpc('get_trip_itinerary', { p_trip_id: tripPlan.id });
    if (itineraryError) {
      console.error('[generate-itinerary] get_trip_itinerary failed; returning the plan without items:', itineraryError);
    }

    console.log(`Successfully generated ${numDays}-day itinerary: ${tripPlan.title}`);

    return new Response(JSON.stringify({
      success: true,
      tripPlan: {
        ...tripPlan,
        items: fullItinerary || [],
        tips: tips ?? [],
        packingList: packingList ?? [],
      },
      // Additive: this month's count including this plan, and the tier's
      // limit (-1 unlimited), so a client can update its meter without a
      // second request.
      used: (usedThisMonth ?? 0) + 1,
      limit: monthlyQuota,
      metadata: {
        numDays,
        numItems: sanitizedItems.length,
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
