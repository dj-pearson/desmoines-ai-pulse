import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useAuthState } from '@/contexts/AuthContext';
import { analyticsGranted } from '@/lib/analyticsConsent';
import { createLogger } from '@/lib/logger';

const log = createLogger('useAnalytics');

/**
 * Ceiling on the in-memory analytics queue when flushes are failing. Prevents a
 * backend outage from growing the queue unboundedly in a long-lived tab; the
 * oldest events are dropped first, since stale analytics matter less than the
 * page staying responsive.
 */
const MAX_QUEUED_EVENTS = 500;

/** How long an event waits in the queue before it is written. */
const FLUSH_DELAY_MS = 10000;

/**
 * One session id per page load, shared by every mounted instance of the hook.
 * It is mounted three times on some routes (AllInclusiveDashboard, MostSearched,
 * SearchResults), and a per-instance id split one visit into that many
 * sessions. In memory only, so nothing is stored on the device for a visitor
 * who has not consented.
 */
let sharedSessionId: string | null = null;
function getSessionId(): string {
  if (!sharedSessionId) sharedSessionId = crypto.randomUUID();
  return sharedSessionId;
}

interface TrackingEvent {
  eventType: 'view' | 'search' | 'click' | 'share' | 'bookmark' | 'hover' | 'scroll' | 'filter';
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground' | 'page' | 'search_result';
  contentId: string;
  searchQuery?: string;
  filters?: Record<string, string | undefined>;
  duration?: number; // Time spent viewing content
  elementType?: 'card' | 'button' | 'link' | 'search_input' | 'filter_dropdown' | 'navigation' | 'image';
  elementId?: string;
  value?: string; // Filter value, search term, etc.
}

interface SessionData {
  startTime: Date;
  pageViews: number;
  interactions: number;
  lastActivity: Date;
  /** Where the visit started. user_journeys.entry_page is NOT NULL. */
  entryPage: string;
  /** What sent them, or 'direct'. user_journeys.entry_point is NOT NULL. */
  entryPoint: string;
}

/** Rows queued for user_interactions_enhanced, typed as that table's Insert. */
type InteractionInsert = Database['public']['Tables']['user_interactions_enhanced']['Insert'];

/**
 * Every write below is gated on analyticsGranted(), the same check
 * usePageTracking, useWebVitals and useContentTracking make: nothing is
 * recorded until the visitor has granted the analytics category.
 */
export function useAnalytics() {
  const [sessionId] = useState(getSessionId);
  // From the auth context rather than a getUser() round trip per instance. The
  // round trip also resolved after the mount effect had captured a null user,
  // so the mount-time event was always written as anonymous.
  const { user } = useAuthState();
  const userId = user?.id ?? null;
  const [sessionData, setSessionData] = useState<SessionData>(() => ({
    startTime: new Date(),
    pageViews: 0,
    interactions: 0,
    lastActivity: new Date(),
    entryPage: typeof window === 'undefined' ? '/' : window.location.pathname,
    entryPoint:
      typeof document === 'undefined' || !document.referrer ? 'direct' : document.referrer,
  }));

  // Queue for batching analytics events
  // Typed as the destination table's Insert, not Record<string, unknown>. An
  // index-signature type says "this may carry any key", which supabase-js 2.85+
  // rejects on insert - correctly, since an unknown key comes back PGRST204 and
  // the whole batch is lost.
  const eventQueue = useRef<InteractionInsert[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  // Flush queued events to enhanced analytics table
  const flushEventQueue = useCallback(async () => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (eventQueue.current.length === 0) return;
    // Consent can be withdrawn after an event was queued. Drop what is held
    // rather than send it.
    if (!analyticsGranted()) {
      eventQueue.current = [];
      return;
    }

    const eventsToFlush = [...eventQueue.current];
    eventQueue.current = [];

    // supabase-js resolves with { error } instead of throwing, so the old
    // try/catch re-queue path never ran and a rejected batch was simply lost.
    //
    // There is no user_analytics fallback any more: trackEvent already writes
    // every event to user_analytics directly, so copying a failed batch there
    // recorded each of those events twice.
    let failed = false;
    try {
      const { error } = await supabase.from('user_interactions_enhanced').insert(eventsToFlush);
      if (error) {
        failed = true;
        log.warn('flushEventQueue', 'user_interactions_enhanced insert rejected; re-queueing', {
          count: eventsToFlush.length,
          message: error.message,
          code: error.code,
        });
      }
    } catch (error) {
      failed = true;
      log.error('flushEventQueue', 'Error flushing analytics queue', { error });
    }

    if (failed) {
      // Re-queue the events that failed, ahead of anything enqueued while the
      // flush was in flight. Bounded so a persistent outage cannot grow the
      // queue without limit; dropping the oldest analytics events is strictly
      // better than pinning the tab's memory.
      const requeued = [...eventsToFlush, ...eventQueue.current];
      eventQueue.current = requeued.slice(-MAX_QUEUED_EVENTS);
      scheduleFlush();
      // Content metrics go out only for a batch that was stored, so a retried
      // batch is not counted twice.
      return;
    }
    log.debug('flushEventQueue', `Flushed ${eventsToFlush.length} enhanced analytics events`);

    // Batch content metrics to Edge Function (reduces overhead)
    try {
      const isUuid = (v: unknown) => typeof v === 'string' && /[0-9a-fA-F-]{36}/.test(v);
      const allowedTypes = new Set(['view','search','click','share','bookmark','favorite','hover','scroll','filter']);
      const allowedContent = new Set(['event','restaurant','attraction','playground','page','search_result']);

      const metricEvents = eventsToFlush
        .map(e => ({
          content_type: e.content_type,
          content_id: e.content_id,
          metric_type: e.interaction_type,
          metric_value: 1,
        }))
        .filter(e => allowedTypes.has(e.metric_type as string) && allowedContent.has(e.content_type as string) && isUuid(e.content_id));

      if (metricEvents.length > 0) {
        const { error } = await supabase.functions.invoke('log-content-metrics', {
          body: { events: metricEvents },
        });
        if (error) {
          log.warn('flushEventQueue', 'Batch metrics logging failed (edge function)', { error });
        }
      }
    } catch (e) {
      log.warn('flushEventQueue', 'Batch metrics logging failed (edge function)', { error: e });
    }
    // scheduleFlush only reads refs and calls back into this function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arm one delayed flush when something is waiting, instead of a standing
  // 10s interval per instance that ran whether or not anything was queued.
  // After unmount the cleanup has already done the final flush, so nothing new
  // is armed.
  function scheduleFlush() {
    if (flushTimer.current || unmounted.current) return;
    if (eventQueue.current.length === 0) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      void flushEventQueue();
    }, FLUSH_DELAY_MS);
  }

  // No page view on mount. usePageTracking (App.tsx) already records the real
  // page_view for every route, behind consent; this hook recorded another one
  // per mounted instance, so the homepage counted three views per visit.
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      void flushEventQueue(); // Final flush
    };
  }, [flushEventQueue]);

  // Enhanced event tracking with batching
  const trackEvent = async (event: TrackingEvent) => {
    if (!analyticsGranted()) return;
    try {
      // Update session data
      setSessionData(prev => ({
        ...prev,
        interactions: prev.interactions + 1,
        lastActivity: new Date()
      }));

      // Create enhanced interaction record
      const enhancedEvent: InteractionInsert = {
        session_id: sessionId,
        user_id: userId,
        interaction_type: event.eventType,
        element_type: event.elementType,
        element_id: event.elementId,
        content_type: event.contentType,
        content_id: event.contentId,
        page_context: window.location.pathname,
        duration_ms: event.duration,
        interaction_value: event.value || event.searchQuery,
        device_type: getMobileDetect(),
        viewport_size: `${window.innerWidth}x${window.innerHeight}`,
        user_agent: navigator.userAgent,
        referrer: document.referrer
      };

      // Add to queue for batching
      eventQueue.current.push(enhancedEvent);
      scheduleFlush();

      // Also maintain backward compatibility with existing tables. A rejected
      // insert resolves with { error }; it does not throw into the catch.
      const { error: legacyError } = await supabase.from('user_analytics').insert({
        session_id: sessionId,
        user_id: userId,
        event_type: event.eventType,
        content_type: event.contentType,
        content_id: event.contentId,
        search_query: event.searchQuery,
        filters_used: event.filters,
        device_type: getMobileDetect(),
        user_agent: navigator.userAgent,
        referrer: document.referrer,
        page_url: window.location.href
      });
      if (legacyError) {
        log.warn('trackEvent', 'user_analytics insert rejected', {
          message: legacyError.message,
          code: legacyError.code,
        });
        return;
      }

      log.debug('trackEvent', 'Analytics event tracked', { eventType: event.eventType, contentType: event.contentType });
    } catch (error) {
      log.error('trackEvent', 'Error tracking analytics', { error });
    }
  };

  // Track page views with enhanced data. Not called on mount (see above); kept
  // for callers that want to record a view of something other than the route.
  const trackPageView = async () => {
    if (!analyticsGranted()) return;
    setSessionData(prev => ({
      ...prev,
      pageViews: prev.pageViews + 1,
      lastActivity: new Date()
    }));

    await trackEvent({
      eventType: 'view',
      contentType: 'page',
      contentId: crypto.randomUUID(), // Generate proper UUID for pages
    });
  };

  // Enhanced search tracking with user journey data
  const trackSearch = async (query: string, filters: Record<string, string | undefined>, resultsCount: number, clickedResultId?: string) => {
    if (!analyticsGranted()) return;
    try {
      // Track in existing search analytics table.
      //
      // The facet values (category/location/date/price) and the session id have
      // no dedicated columns - they belong in the `search_filters` JSON column.
      // This insert previously named them as top-level columns and was silenced
      // by an `as never` cast, so it failed with 42703 on every search and no
      // search analytics was ever recorded (WEB-QA-012).
      //
      // clickedResultId is deliberately NOT written to `clicked_event_id`: that
      // column is a foreign key to events, and a search result can be a
      // restaurant or attraction, which would violate the constraint. It stays
      // in search_filters until a content-type-agnostic column exists.
      const { error: searchError } = await supabase.from('search_analytics').insert({
        user_id: userId ?? null,
        search_query: query,
        results_count: resultsCount,
        search_filters: {
          sessionId,
          category: filters.category ?? null,
          location: filters.location ?? null,
          dateFilter: filters.dateFilter ?? null,
          priceRange: filters.priceRange ?? null,
          clickedResultId: clickedResultId ?? null,
        },
      });
      if (searchError) {
        log.warn('trackSearch', 'search_analytics insert rejected', {
          message: searchError.message,
          code: searchError.code,
        });
      }

      // Track as enhanced interaction
      await trackEvent({
        eventType: 'search',
        contentType: 'search_result',
        contentId: `search-${Date.now()}`,
        searchQuery: query,
        filters: filters,
        elementType: 'search_input',
        value: query
      });

      log.debug('trackSearch', 'Search tracked', { query, resultsCount });
    } catch (error) {
      log.error('trackSearch', 'Error tracking search', { error });
    }
  };

  // Track user preferences based on behavior
  // CATEGORY IS A CLOSED SET, because the line below builds a COLUMN NAME from
  // it (`preferred_${category}s`). user_preference_profiles has exactly five
  // such columns; any other category named a column that does not exist and the
  // upsert came back PGRST204 with the preference silently lost. `string` let
  // every caller pick one - there are none today, which is the only reason this
  // has not bitten anyone.
  const trackPreference = async (
    category: 'cuisine' | 'event_type' | 'location' | 'price_range' | 'time',
    value: string,
    confidence: number = 0.5,
  ) => {
    if (!analyticsGranted()) return;
    try {
      // Try to use enhanced preference profiles table. A rejection resolves
      // with { error } rather than throwing, so it is rethrown to reach the
      // fallback below.
      try {
        const { error: preferenceError } = await supabase.from('user_preference_profiles').upsert({
          user_id: userId,
          session_id: userId ? null : sessionId,
          [`preferred_${category}s`]: [value],
          preference_confidence: { [category]: confidence },
          last_updated: new Date().toISOString()
        }, {
          onConflict: userId ? 'user_id' : 'session_id'
        });
        if (preferenceError) throw preferenceError;
      } catch {
        log.debug('trackPreference', 'Enhanced preference table not available, tracking as analytics event');
        // Fallback to tracking as a regular analytics event
        await trackEvent({
          eventType: 'click',
          contentType: 'page',
          contentId: 'preference',
          value: `${category}:${value}`,
          elementType: 'button'
        });
      }
    } catch (error) {
      log.error('trackPreference', 'Error tracking preference', { error });
    }
  };

  // Track conversion events (phone calls, website visits, etc.)
  const trackConversion = async (conversionType: 'website_visit' | 'phone_call' | 'direction_request' | 'email', contentType: string, contentId: string) => {
    if (!analyticsGranted()) return;
    try {
      // Try to update user journey with conversion
      try {
        // entry_page AND entry_point ARE NOT NULL AND WERE NOT BEING SENT.
        // This hook is the only writer of user_journeys in the repo, so no row
        // ever existed for the upsert to update: every conversion insert
        // violated both NOT NULLs and the table has never received a row. The
        // values come from where the session actually started, captured at
        // mount. supabase-js 2.85+ is what surfaced it - the old types let a
        // missing required column through.
        const { error: journeyError } = await supabase.from('user_journeys').upsert({
          session_id: sessionId,
          user_id: userId,
          entry_page: sessionData.entryPage,
          entry_point: sessionData.entryPoint,
          converted: true,
          conversion_type: conversionType,
          conversion_content_type: contentType,
          conversion_content_id: contentId,
          session_end: new Date().toISOString(),
          session_duration: Math.floor((new Date().getTime() - sessionData.startTime.getTime()) / 1000)
        }, {
          onConflict: 'session_id'
        });
        if (journeyError) throw journeyError;
      } catch {
        log.debug('trackConversion', 'Enhanced journey table not available, tracking as analytics event');
      }

      // Always track as regular event too
      await trackEvent({
        eventType: 'click',
        contentType: contentType as TrackingEvent['contentType'],
        contentId: contentId,
        elementType: 'button',
        value: conversionType
      });
    } catch (error) {
      log.error('trackConversion', 'Error tracking conversion', { error });
    }
  };

  return {
    sessionId,
    userId,
    sessionData,
    trackEvent,
    trackSearch,
    trackPageView,
    trackPreference,
    trackConversion,
    flushEventQueue
  };
}

function getMobileDetect(): string {
  const userAgent = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
    return 'mobile';
  }
  return 'desktop';
}
