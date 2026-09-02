/**
 * track-ad-event — the only way an ad impression or click gets recorded on web.
 *
 * WEB-ADS-002. src/lib/tracking.ts inserted straight into ad_impressions and
 * ad_clicks from the browser. Neither table has an INSERT policy in any
 * migration, so every one of those writes was refused by RLS and every
 * advertiser dashboard read zero. The client's own frequency cap SELECTed the
 * same tables and failed the same way, so it capped nothing, and useActiveAds
 * passed p_session_id: null, which switched off the server cap inside
 * get_active_ads as well. An advertiser was billed for a product with no
 * reporting and no frequency control.
 *
 * The write happens here, on the service role, so RLS is satisfied by design
 * rather than by opening those tables to anonymous callers -- which is what a
 * client-side insert would have required, and which would have let anyone
 * inflate any advertiser's numbers.
 *
 * WHAT THIS REFUSES TO RECORD
 *   - a campaign that is not active, or a creative that belongs to a different
 *     campaign: billing data must not accrue against something nobody bought;
 *   - a request whose User-Agent looks like a crawler. Bots render ads and
 *     would otherwise be billed as reach.
 * Both refusals answer 200. A tracking endpoint that tells the caller it
 * declined is a tracking endpoint that teaches a caller how not to be declined.
 *
 * IDEMPOTENCY: client_event_id is a uuid the browser mints per event, and the
 * unique indexes from 20260823000003 make a retry a no-op. Without it a flaky
 * network turned one impression into several, and every one of them was
 * billable.
 *
 * MOBILE IS NOT CHANGED. iOS and Android keep writing to the tables directly,
 * per this story's constraint. Their writes are refused by the same RLS that
 * refused the browser's, so their analytics stay at zero until they move to
 * this endpoint -- stated plainly here because "web is fixed" is easy to read
 * as "ad tracking is fixed".
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { looksAutomated, UUID_RE } from '../_shared/adEventFilters.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // One page view legitimately produces a handful of these; a flood is abuse.
  const limited = checkRateLimit(req, { max: 120, message: 'Too many tracking events.' });
  if (!limited.success && limited.response) return limited.response;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      kind,
      campaign_id: campaignId,
      creative_id: creativeId,
      placement_type: placementType,
      session_id: sessionId,
      client_event_id: clientEventId,
      page_url: pageUrl,
      referrer_url: referrerUrl,
      impression_id: impressionId,
    } = body ?? {};

    if (kind !== 'impression' && kind !== 'click') {
      return json({ error: 'kind must be "impression" or "click"' }, 400);
    }
    if (!UUID_RE.test(String(campaignId ?? '')) || !UUID_RE.test(String(creativeId ?? ''))) {
      return json({ error: 'campaign_id and creative_id must be uuids' }, 400);
    }

    const userAgent = req.headers.get('user-agent');

    // Recorded as accepted so a crawler learns nothing from the response.
    if (looksAutomated(userAgent)) {
      return json({ recorded: false, reason: 'automated' });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // The creative must exist, be approved, and belong to a campaign that is
    // actually running. Anything else is not billable reach.
    const { data: creative, error: creativeError } = await supabase
      .from('campaign_creatives')
      .select('id, campaign_id, is_approved, campaigns!inner(id, status)')
      .eq('id', creativeId)
      .eq('campaign_id', campaignId)
      .maybeSingle();

    if (creativeError) {
      console.error('[track-ad-event] creative lookup failed', creativeError);
      return json({ recorded: false, reason: 'lookup_failed' });
    }

    const campaignStatus = (creative as { campaigns?: { status?: string } } | null)?.campaigns?.status;
    if (!creative || creative.is_approved !== true || campaignStatus !== 'active') {
      return json({ recorded: false, reason: 'not_billable' });
    }

    // The caller's own id when it sent a session-scoped JWT; null for anonymous
    // traffic, which is most of it.
    let userId: string | null = null;
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token && token !== Deno.env.get('SUPABASE_ANON_KEY')) {
      const { data } = await supabase.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }

    const eventId = UUID_RE.test(String(clientEventId ?? '')) ? clientEventId : crypto.randomUUID();
    const today = new Date().toISOString().split('T')[0];

    if (kind === 'impression') {
      const { data, error } = await supabase
        .from('ad_impressions')
        .upsert(
          {
            campaign_id: campaignId,
            creative_id: creativeId,
            placement_type: placementType ?? null,
            user_id: userId,
            session_id: sessionId ?? null,
            user_agent: userAgent,
            page_url: pageUrl ?? null,
            referrer_url: referrerUrl ?? null,
            client_event_id: eventId,
            date: today,
          },
          { onConflict: 'client_event_id', ignoreDuplicates: true },
        )
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('[track-ad-event] impression insert failed', error);
        return json({ recorded: false, reason: 'write_failed' });
      }
      return json({ recorded: true, id: data?.id ?? null, client_event_id: eventId });
    }

    const { error } = await supabase.from('ad_clicks').upsert(
      {
        impression_id: UUID_RE.test(String(impressionId ?? '')) ? impressionId : null,
        campaign_id: campaignId,
        creative_id: creativeId,
        client_event_id: eventId,
        date: today,
      },
      { onConflict: 'client_event_id', ignoreDuplicates: true },
    );

    if (error) {
      console.error('[track-ad-event] click insert failed', error);
      return json({ recorded: false, reason: 'write_failed' });
    }
    return json({ recorded: true, client_event_id: eventId });
  } catch (err) {
    console.error('[track-ad-event] unhandled', err);
    // Never fail a page because a metric did not land.
    return json({ recorded: false, reason: 'error' });
  }
});
