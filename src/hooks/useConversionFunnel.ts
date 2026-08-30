import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/lib/logger';
import { storage } from '@/lib/safeStorage';

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
 */
export function useConversionFunnel() {
  const { user } = useAuth();

  const trackFunnelEvent = useCallback(
    async (event: FunnelEvent, details?: Record<string, unknown>) => {
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

        if (error) {
          log.warn('trackFunnelEvent', 'Failed to track funnel event', { error: error.message });
        }
      } catch (err) {
        log.error('trackFunnelEvent', 'Unexpected error tracking funnel event', { err });
      }
    },
    [user?.id]
  );

  return { trackFunnelEvent };
}

interface FunnelStep {
  name: string;
  event: FunnelEvent;
  count: number;
  dropOff: number;
  dropOffPercent: number;
}

/**
 * Hook for fetching conversion funnel data for the admin dashboard.
 */
export function useConversionFunnelData(days = 30) {
  return useQuery<FunnelStep[]>({
    queryKey: ['conversion-funnel', days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const funnelEvents: FunnelEvent[] = [
        'funnel_pricing_page_viewed',
        'funnel_plan_selected',
        'funnel_checkout_started',
        'funnel_checkout_completed',
      ];

      const counts: Record<string, number> = {};

      for (const event of funnelEvents) {
        const { count, error } = await supabase
          .from('user_analytics')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', event)
          .gte('created_at', since.toISOString());

        if (error) {
          log.warn('useConversionFunnelData', `Failed to count ${event}`, { error: error.message });
          counts[event] = 0;
        } else {
          counts[event] = count || 0;
        }
      }

      const steps: FunnelStep[] = funnelEvents.map((event, i) => {
        const current = counts[event] || 0;
        const previous = i > 0 ? (counts[funnelEvents[i - 1]] || 0) : current;
        const dropOff = previous > 0 ? previous - current : 0;
        const dropOffPercent = previous > 0 ? Math.round((dropOff / previous) * 100) : 0;

        const nameMap: Record<string, string> = {
          funnel_pricing_page_viewed: 'Pricing Page Viewed',
          funnel_plan_selected: 'Plan Selected',
          funnel_checkout_started: 'Checkout Started',
          funnel_checkout_completed: 'Checkout Completed',
        };

        return {
          name: nameMap[event] || event,
          event,
          count: current,
          dropOff,
          dropOffPercent,
        };
      });

      return steps;
    },
    staleTime: 5 * 60 * 1000,
  });
}
