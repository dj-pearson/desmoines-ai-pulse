import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/lib/logger';
import { storage } from '@/lib/safeStorage';
import { hasConsent } from '@/lib/cookieConsent';
import { ADVERTISER_FUNNEL_STEPS } from '@/lib/advertiserFunnel';

const log = createLogger('useConversionFunnel');

const SESSION_KEY = 'dmi-session-id';

function getSessionId(): string {
  let sessionId = storage.get<string>(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    storage.set(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export type FunnelEvent =
  | 'funnel_pricing_page_viewed'
  | 'funnel_plan_selected'
  | 'funnel_checkout_started'
  | 'funnel_checkout_completed'
  | 'funnel_checkout_abandoned';

/**
 * Hook for tracking conversion funnel events in the subscription flow.
 *
 * Records events to user_analytics with event_type prefix 'funnel_'.
 *
 * Analytics are non-essential, so nothing is recorded, and no session id is
 * written to storage, unless the visitor granted the analytics category. Same
 * gate as usePageTracking; hasConsent() is false when no choice was made.
 */
export function useConversionFunnel() {
  const { user } = useAuth();

  const trackFunnelEvent = useCallback(
    async (event: FunnelEvent, details?: Record<string, unknown>) => {
      if (!hasConsent('analytics')) return;

      try {
        const sessionId = getSessionId();
        const { error } = await supabase
          .from('user_analytics')
          .insert({
            event_type: event,
            content_type: 'subscription',
            // WEB-QA-026: content_id is uuid NOT NULL. This passed the plan
            // NAME ("insider"/"vip" — see Pricing.tsx:217, `planId === "free"`)
            // or the literal 'none', so EVERY funnel event was rejected with
            // 22P02 and the subscription funnel has recorded zero rows. The
            // real uuid is plan.id, which callers already send separately as
            // planDbId; both survive in filters_used below.
            content_id: crypto.randomUUID(),
            session_id: sessionId,
            user_id: user?.id || null,
            page_url: window.location.pathname,
            filters_used: details ? JSON.parse(JSON.stringify(details)) : null,
          });

        // A lost funnel row is not the visitor's problem, so it is reported in
        // development only and never surfaced on the page.
        if (error && import.meta.env.DEV) {
          log.warn('trackFunnelEvent', 'Failed to track funnel event', { error: error.message });
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          log.error('trackFunnelEvent', 'Unexpected error tracking funnel event', { err });
        }
      }
    },
    [user?.id]
  );

  return { trackFunnelEvent };
}

export interface FunnelStep {
  name: string;
  event: string;
  count: number;
  dropOff: number;
  dropOffPercent: number;
}

export type FunnelKind = 'subscription' | 'advertiser';

const SUBSCRIPTION_FUNNEL_STEPS: ReadonlyArray<{ event: FunnelEvent; name: string }> = [
  { event: 'funnel_pricing_page_viewed', name: 'Pricing Page Viewed' },
  { event: 'funnel_plan_selected', name: 'Plan Selected' },
  { event: 'funnel_checkout_started', name: 'Checkout Started' },
  { event: 'funnel_checkout_completed', name: 'Checkout Completed' },
];

export const FUNNEL_STEPS: Record<FunnelKind, ReadonlyArray<{ event: string; name: string }>> = {
  subscription: SUBSCRIPTION_FUNNEL_STEPS,
  advertiser: ADVERTISER_FUNNEL_STEPS,
};

/** Turn ordered counts into steps with the drop from the step before. */
export function toFunnelSteps(
  defs: ReadonlyArray<{ event: string; name: string }>,
  counts: Record<string, number>
): FunnelStep[] {
  return defs.map(({ event, name }, i) => {
    const current = counts[event] || 0;
    const previous = i > 0 ? counts[defs[i - 1].event] || 0 : current;
    const dropOff = previous > 0 ? Math.max(previous - current, 0) : 0;
    const dropOffPercent = previous > 0 ? Math.round((dropOff / previous) * 100) : 0;
    return { name, event, count: current, dropOff, dropOffPercent };
  });
}

/**
 * Hook for fetching conversion funnel data for the admin dashboard.
 *
 * A failed count throws instead of counting as 0. It used to be logged and
 * zeroed, so an RLS or network failure rendered "No funnel data yet" - an
 * empty funnel that was really an unread one.
 */
export function useConversionFunnelData(days = 30, funnel: FunnelKind = 'subscription') {
  return useQuery<FunnelStep[]>({
    queryKey: ['conversion-funnel', funnel, days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const defs = FUNNEL_STEPS[funnel];
      const counts: Record<string, number> = {};

      for (const { event } of defs) {
        const { count, error } = await supabase
          .from('user_analytics')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', event)
          .gte('created_at', since.toISOString());

        if (error) throw error;
        counts[event] = count || 0;
      }

      return toFunnelSteps(defs, counts);
    },
    staleTime: 5 * 60 * 1000,
  });
}
