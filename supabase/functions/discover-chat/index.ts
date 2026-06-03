/**
 * Ask Pulse — conversational discovery edge function (IOS-DISCOVER-2026-001).
 *
 * Accepts a chat-style request and replies with 3-5 curated picks (events,
 * restaurants, attractions) plus a one-line "why" caption per pick. Backed
 * by Claude with tool calling so the model can search Postgres on demand
 * instead of being given the entire content catalog up front.
 *
 * Request:
 *   POST {
 *     messages: [{ role: 'user' | 'assistant', content: string }],
 *     userLocation?: { latitude: number, longitude: number },
 *   }
 *
 * Response:
 *   {
 *     picks: [{ itemType: 'event'|'restaurant'|'attraction', itemId: string, reason: string }],
 *     followUpSuggestions: string[],
 *     usage: { remaining: number | 'unlimited', tier: 'free'|'insider'|'vip' }
 *   }
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleCors, getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { checkRateLimit, addRateLimitHeaders } from '../_shared/rateLimit.ts';
import { getAIConfig } from '../_shared/aiConfig.ts';
import { sanitizePostgrestPattern } from '../_shared/validation.ts';
import { resolveEntitledTier } from '../_shared/entitlements.ts';

// ---------------------------------------------------------------------------
// Tier-gated daily quotas — mirror web /trip-planner gating
// ---------------------------------------------------------------------------

const DAILY_QUOTAS: Record<'free' | 'insider' | 'vip', number> = {
  free: 5,
  insider: 50,
  vip: -1, // unlimited
};

// ---------------------------------------------------------------------------
// Tool definitions sent to Claude. We mark these + the system prompt as
// `cache_control: ephemeral` so prompt caching kicks in across requests and
// keeps per-query cost sustainable.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Pulse, the local-friend AI for Des Moines. You help users discover events, restaurants, and attractions through natural conversation. You ALWAYS:

1. Use the provided tools to search the live database — never invent items.
2. Return 3-5 picks max, each with a one-line "reason" explaining why it fits the user's request.
3. End with up to 3 follow-up suggestions that nudge the user further (e.g. "Want me to plan a full evening?", "Looking for kid-friendly options instead?").
4. Skip preamble. Be concise, warm, specific.

Output the final JSON via the return_picks tool — never as plain text.`;

const TOOLS = [
  {
    name: 'search_events',
    description:
      'Search upcoming events. Use category filters when the user names a vibe (music, food, family, sports, arts). Use date filters for "tonight", "this weekend", etc.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search across title and description' },
        category: { type: 'string', description: 'Optional category filter' },
        startsAfter: { type: 'string', description: 'ISO timestamp lower bound' },
        startsBefore: { type: 'string', description: 'ISO timestamp upper bound' },
        limit: { type: 'integer', default: 10 },
      },
    },
  },
  {
    name: 'search_restaurants',
    description: 'Search restaurants. Use cuisine + price filters when the user mentions them.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        cuisine: { type: 'string' },
        priceLevel: { type: 'string', enum: ['$', '$$', '$$$', '$$$$'] },
        openNow: { type: 'boolean' },
        limit: { type: 'integer', default: 10 },
      },
    },
  },
  {
    name: 'search_attractions',
    description: 'Search attractions (museums, parks, family-friendly spots).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        type: { type: 'string' },
        limit: { type: 'integer', default: 10 },
      },
    },
  },
  {
    name: 'return_picks',
    description: 'Return the final curated picks to the user. Call this exactly once at the end.',
    input_schema: {
      type: 'object',
      properties: {
        picks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemType: { type: 'string', enum: ['event', 'restaurant', 'attraction'] },
              itemId: { type: 'string' },
              reason: { type: 'string', description: 'One-line "why" caption shown under the card' },
            },
            required: ['itemType', 'itemId', 'reason'],
          },
        },
        followUpSuggestions: { type: 'array', items: { type: 'string' } },
      },
      required: ['picks'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

interface SupabaseLike {
  from: (table: string) => any;
}

async function execTool(
  supabase: SupabaseLike,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'search_events': {
      const limit = Math.min((input.limit as number | undefined) ?? 10, 20);
      let q = supabase
        .from('events')
        .select('id, title, description, category, date, end_date, venue, location, image_url')
        .limit(limit)
        .order('date', { ascending: true });

      const startsAfter = (input.startsAfter as string | undefined) ?? new Date().toISOString();
      q = q.gte('date', startsAfter);
      if (input.startsBefore) q = q.lte('date', input.startsBefore as string);
      if (input.category) q = q.ilike('category', `%${sanitizePostgrestPattern(input.category as string)}%`);
      if (input.query) {
        const term = sanitizePostgrestPattern(input.query as string);
        q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
      }

      const { data, error } = await q;
      if (error) return { error: error.message };
      return { results: data ?? [] };
    }

    case 'search_restaurants': {
      const limit = Math.min((input.limit as number | undefined) ?? 10, 20);
      let q = supabase
        .from('restaurants')
        .select('id, name, description, cuisine, price_level, hours, location, image_url')
        .limit(limit)
        .order('rating', { ascending: false });

      if (input.cuisine) q = q.ilike('cuisine', `%${sanitizePostgrestPattern(input.cuisine as string)}%`);
      if (input.priceLevel) q = q.eq('price_level', input.priceLevel as string);
      if (input.query) {
        const term = sanitizePostgrestPattern(input.query as string);
        q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }

      const { data, error } = await q;
      if (error) return { error: error.message };
      return { results: data ?? [] };
    }

    case 'search_attractions': {
      const limit = Math.min((input.limit as number | undefined) ?? 10, 20);
      let q = supabase
        .from('attractions')
        .select('id, name, description, category, location, image_url')
        .limit(limit)
        .order('rating', { ascending: false });

      if (input.type) q = q.ilike('category', `%${sanitizePostgrestPattern(input.type as string)}%`);
      if (input.query) {
        const term = sanitizePostgrestPattern(input.query as string);
        q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }

      const { data, error } = await q;
      if (error) return { error: error.message };
      return { results: data ?? [] };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Tier resolution + quota tracking
// ---------------------------------------------------------------------------

// Tier resolution uses the shared _shared/entitlements.ts helper so AI quota
// gating agrees with the rest of the app — including trialing users and the
// past_due grace window (the old local version only counted status=active,
// under-throttling trialing/grace users to the free quota).

async function consumeQuota(
  supabase: SupabaseLike,
  userId: string,
  tier: 'free' | 'insider' | 'vip',
): Promise<{ allowed: boolean; remaining: number | 'unlimited' }> {
  const limit = DAILY_QUOTAS[tier];
  if (limit === -1) return { allowed: true, remaining: 'unlimited' };

  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from('discover_chat_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();

  const currentCount = (existing as { count?: number } | null)?.count ?? 0;
  if (currentCount >= limit) {
    return { allowed: false, remaining: 0 };
  }

  // Upsert atomically — relies on UNIQUE(user_id, usage_date)
  await supabase
    .from('discover_chat_usage')
    .upsert(
      {
        user_id: userId,
        usage_date: today,
        count: currentCount + 1,
      },
      { onConflict: 'user_id,usage_date' },
    );

  return { allowed: true, remaining: limit - (currentCount + 1) };
}

// ---------------------------------------------------------------------------
// Claude orchestration
// ---------------------------------------------------------------------------

interface ClaudeContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
  stop_reason: string;
}

async function runClaudeLoop(
  apiKey: string,
  model: string,
  anthropicVersion: string,
  messages: Array<{ role: string; content: unknown }>,
  supabase: SupabaseLike,
): Promise<{ picks: unknown[]; followUpSuggestions: string[] } | { error: string }> {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': anthropicVersion,
    // Enable prompt caching beta — costs ~25% less on cached prefix.
    'anthropic-beta': 'prompt-caching-2024-07-31',
  };

  const conversation: Array<{ role: string; content: unknown }> = [...messages];

  // Up to 6 turns of tool use before we bail out — guards against runaway loops.
  for (let turn = 0; turn < 6; turn++) {
    const body = {
      model,
      max_tokens: 1024,
      // System + tools are cached so the per-request cost drops sharply on
      // anything past the first user query.
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: TOOLS.map((t, i) =>
        // Mark only the last tool with cache_control — Anthropic caches the
        // whole tools array up to that boundary.
        i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t,
      ),
      messages: conversation,
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { error: `Claude API ${res.status}: ${errBody.slice(0, 300)}` };
    }

    const reply = (await res.json()) as ClaudeResponse;
    conversation.push({ role: 'assistant', content: reply.content });

    // If the model called return_picks, pull the result out and finish.
    const finalCall = reply.content.find(
      (b) => b.type === 'tool_use' && b.name === 'return_picks',
    );
    if (finalCall?.input) {
      const input = finalCall.input as Record<string, unknown>;
      return {
        picks: (input.picks as unknown[]) ?? [],
        followUpSuggestions: (input.followUpSuggestions as string[]) ?? [],
      };
    }

    // Otherwise, run any other tool_use blocks and feed results back.
    const toolUses = reply.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      // No more tool calls and no return_picks → bail
      return { error: 'Model finished without returning picks' };
    }

    const toolResults = [];
    for (const call of toolUses) {
      const result = await execTool(supabase, call.name ?? '', call.input ?? {});
      toolResults.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(result),
      });
    }
    conversation.push({ role: 'user', content: toolResults });
  }

  return { error: 'Conversation exceeded turn limit' };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin') || '';
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Rate limit (per-IP, defense in depth on top of per-user quota)
  const rl = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many discover-chat requests. Please slow down.',
  });
  if (!rl.success && rl.response) return addRateLimitHeaders(rl.response, rl);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Auth — required for tier gating
  const auth = req.headers.get('Authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return new Response(JSON.stringify({ error: 'Authorization required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: userData, error: authErr } = await supabase.auth.getUser(auth.slice(7));
  if (authErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid auth' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = userData.user.id;

  let payload: { messages?: Array<{ role: string; content: string }>; userLocation?: unknown };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const messages = (payload.messages ?? []).filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
  );
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Tier + per-day quota
  const tier = await resolveEntitledTier(supabase, userId);
  const quota = await consumeQuota(supabase, userId, tier);
  if (!quota.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Daily Ask Pulse limit reached',
        tier,
        upgradeHint: tier === 'free' ? 'insider' : tier === 'insider' ? 'vip' : null,
      }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Resolve model from centralized config
  const aiConfig = await getAIConfig(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const model = aiConfig.default_model;

  // Append a location hint as a system-level user message if we have one
  const conversation: Array<{ role: string; content: unknown }> = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (payload.userLocation && typeof payload.userLocation === 'object') {
    const loc = payload.userLocation as { latitude?: number; longitude?: number };
    if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      conversation.unshift({
        role: 'user',
        content: `[context: my approximate location is ${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)}]`,
      });
    }
  }

  const result = await runClaudeLoop(
    apiKey,
    model,
    aiConfig.anthropic_version,
    conversation,
    supabase,
  );

  if ('error' in result) {
    console.error('discover-chat error:', result.error);
    return new Response(JSON.stringify({ error: 'Pulse is taking a breather. Try again in a moment.' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      picks: result.picks,
      followUpSuggestions: result.followUpSuggestions,
      usage: { remaining: quota.remaining, tier },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
