/**
 * Sponsored pick — server-driven sponsored placement for the native AI
 * discovery flows (IOS-ADS-015).
 *
 * Returns AT MOST ONE clearly-labeled sponsored listing for a given AI surface
 * (Ask Pulse, Surprise Me, Trip Planner). Relevance + labeling rules live HERE,
 * with the existing campaign system, not hard-coded in the app — so eligibility
 * can evolve (targeting, frequency, flight dates) without an app release.
 *
 * Eligibility mirrors `get_active_ads` / `process-campaign-lifecycle`:
 *   campaign.status = 'active' AND today BETWEEN start_date AND end_date,
 *   joined to `sponsored_listing_links` (the authoritative sponsored inventory).
 *
 * Free-tier only: if a valid Bearer token resolves to an entitled (Insider/VIP)
 * user, the function returns `{ pick: null }` — premium users never see ads.
 * Anonymous / free callers are eligible. Sponsored listings are public content,
 * so this function runs with `verify_jwt = false` (see supabase/config.toml) and
 * resolves tier opportunistically from the Authorization header when present.
 *
 * Request:
 *   POST {
 *     surface: 'ask_pulse' | 'surprise_me' | 'trip_planner',
 *     query?: string,          // free-text intent, used for light relevance match
 *   }
 *
 * Response:
 *   {
 *     pick: {
 *       itemType: 'event' | 'restaurant',
 *       itemId: string,
 *       title: string,
 *       reason: string,         // labeled "why" caption
 *       imageUrl: string | null,
 *       campaignId: string,
 *     } | null
 *   }
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleCors, getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { checkRateLimit, addRateLimitHeaders } from '../_shared/rateLimit.ts';
import { resolveEntitledTier } from '../_shared/entitlements.ts';
import { sanitizePostgrestPattern } from '../_shared/validation.ts';
import {
  buildReason,
  centralToday,
  isEventStillOn,
  isRestaurantOpenForBusiness,
} from '../_shared/sponsoredPickFilters.ts';

type Surface = 'ask_pulse' | 'surprise_me' | 'trip_planner';
const VALID_SURFACES: Surface[] = ['ask_pulse', 'surprise_me', 'trip_planner'];

interface SponsoredLink {
  listing_type: 'event' | 'restaurant';
  listing_id: string;
  campaign_id: string;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin') || '';
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const rl = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: 'Too many sponsored-pick requests. Please slow down.',
  });
  if (!rl.success && rl.response) return addRateLimitHeaders(rl.response, rl);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server configuration error' }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  // Parse request
  let payload: { surface?: string; query?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const surface = (payload.surface ?? '') as Surface;
  if (!VALID_SURFACES.includes(surface)) {
    return json({ error: 'Valid surface required' }, 400);
  }
  const query = typeof payload.query === 'string' ? payload.query.slice(0, 200).trim() : '';

  // Premium users never see ads — resolve tier opportunistically from the token.
  const auth = req.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    const { data: userData } = await supabase.auth.getUser(auth.slice(7));
    const userId = userData?.user?.id;
    if (userId) {
      const tier = await resolveEntitledTier(supabase, userId);
      if (tier !== 'free') {
        return json({ pick: null });
      }
    }
  }

  // 1. Active campaigns (same predicate as get_active_ads). Central date, as
  // get_active_ads uses since 20261003000002 (IOS-DD-MONETIZATION-19).
  const today = centralToday();
  const { data: campaigns, error: campErr } = await supabase
    .from('campaigns')
    .select('id')
    .eq('status', 'active')
    .lte('start_date', today)
    .gte('end_date', today);

  if (campErr || !campaigns || campaigns.length === 0) {
    return json({ pick: null });
  }
  const campaignIds = campaigns.map((c: { id: string }) => c.id);

  // 2. Sponsored listings tied to those campaigns.
  const { data: links, error: linkErr } = await supabase
    .from('sponsored_listing_links')
    .select('listing_type, listing_id, campaign_id')
    .in('campaign_id', campaignIds);

  if (linkErr || !links || links.length === 0) {
    return json({ pick: null });
  }

  // 3. Resolve listing details, applying a light relevance filter on `query`.
  const eventLinks = (links as SponsoredLink[]).filter((l) => l.listing_type === 'event');
  const restaurantLinks = (links as SponsoredLink[]).filter((l) => l.listing_type === 'restaurant');

  const pick = await resolvePick(supabase, eventLinks, restaurantLinks, query);
  return json({ pick });
});

// ---------------------------------------------------------------------------

async function resolvePick(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  eventLinks: SponsoredLink[],
  restaurantLinks: SponsoredLink[],
  query: string,
): Promise<Record<string, unknown> | null> {
  // Try both pools; shuffle so rotation isn't biased toward events.
  const pools = Math.random() < 0.5
    ? [{ type: 'event', links: eventLinks }, { type: 'restaurant', links: restaurantLinks }]
    : [{ type: 'restaurant', links: restaurantLinks }, { type: 'event', links: eventLinks }];

  for (const pool of pools) {
    if (pool.links.length === 0) continue;
    const ids = pool.links.map((l) => l.listing_id);
    const isEvent = pool.type === 'event';
    const table = isEvent ? 'events' : 'restaurants';
    const titleCol = isEvent ? 'title' : 'name';
    const catCol = isEvent ? 'category' : 'cuisine';
    // Columns the eligibility filters below read (IOS-DD-MONETIZATION-19).
    const extraCols = isEvent ? 'date, end_date' : 'business_status, status';
    let columns = `id, ${titleCol}, ${catCol}, image_url, ${extraCols}`;
    // restaurants.business_status arrives with migration 20260919000009. If
    // this function is deployed before that migration is applied, selecting
    // it answers 42703 and every restaurant pick would silently vanish, so
    // fall back to the columns that already exist.
    const fallbackColumns = `id, ${titleCol}, ${catCol}, image_url, ${isEvent ? extraCols : 'status'}`;

    // Never send a paid click to a merged duplicate, a hidden or archived
    // event, a past event or a closed restaurant.
    // deno-lint-ignore no-explicit-any
    const baseQuery = (): any => {
      let q = supabase.from(table).select(columns).in('id', ids).neq('is_merged', true);
      if (isEvent) q = q.neq('is_hidden', true).is('archived_at', null);
      return q.limit(10);
    };
    // deno-lint-ignore no-explicit-any
    const eligible = (rows: any[] | null | undefined): any[] =>
      (rows ?? []).filter((row) => (isEvent ? isEventStillOn(row) : isRestaurantOpenForBusiness(row)));
    // deno-lint-ignore no-explicit-any
    const pickOne = (rows: any[]) => (rows.length > 0 ? rows[Math.floor(Math.random() * rows.length)] : null);

    // Light relevance: prefer rows whose title/category match the user's intent.
    const relevantQuery = () => {
      let q = baseQuery();
      if (query) {
        const pattern = sanitizePostgrestPattern(query);
        if (pattern) {
          q = q.or(`${titleCol}.ilike.%${pattern}%,${catCol}.ilike.%${pattern}%`);
        }
      }
      return q;
    };

    const first = await relevantQuery();
    let rows = first.data;
    if (first.error?.code === '42703' && columns !== fallbackColumns) {
      columns = fallbackColumns;
      rows = (await relevantQuery()).data;
    }
    let chosen = pickOne(eligible(rows));

    // Fall back to an unfiltered pick if the relevance filter matched nothing.
    if (!chosen && query) {
      const { data: anyRows } = await baseQuery();
      chosen = pickOne(eligible(anyRows));
    }

    if (chosen) {
      const link = pool.links.find((l) => l.listing_id === chosen.id) ?? pool.links[0];
      const title = chosen[titleCol] ?? (isEvent ? 'Featured event' : 'Featured spot');
      const category = chosen[catCol];
      return {
        itemType: pool.type,
        itemId: chosen.id,
        title,
        reason: buildReason(pool.type as 'event' | 'restaurant', category),
        imageUrl: chosen.image_url ?? null,
        campaignId: link.campaign_id,
      };
    }
  }

  return null;
}
