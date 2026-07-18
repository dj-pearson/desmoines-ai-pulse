import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('useAnalytics');
const ENABLE_DIRECT_CONTENT_METRICS = false;

/**
 * Ceiling on the in-memory analytics queue when flushes are failing. Prevents a
 * backend outage from growing the queue unboundedly in a long-lived tab; the
 * oldest events are dropped first, since stale analytics matter less than the
 * page staying responsive.
 */
const MAX_QUEUED_EVENTS = 500;

interface AnalyticsData {
  sessionId: string;
  userId?: string;
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
}

export function useAnalytics() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData>({
    startTime: new Date(),
    pageViews: 0,
    interactions: 0,
    lastActivity: new Date()
  });
  
  // Queue for batching analytics events
  const eventQueue = useRef<Record<string, unknown>[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Get current user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user?.id || null);
    });

    // Track page view on mount
    trackPageView();

    // Set up periodic flush of queued events
    flushTimer.current = setInterval(flushEventQueue, 10000); // Flush every 10 seconds

    // Cleanup
    return () => {
      subscription.unsubscribe();
      if (flushTimer.current) {
        clearInterval(flushTimer.current);
      }
      flushEventQueue(); // Final flush
    };
  }, []);

  // Enhanced event tracking with batching
  const trackEvent = async (event: TrackingEvent) => {
    try {
      // Update session data
      setSessionData(prev => ({
        ...prev,
        interactions: prev.interactions + 1,
        lastActivity: new Date()
      }));

      // Create enhanced interaction record
      const enhancedEvent = {
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

      // Also maintain backward compatibility with existing tables
      await supabase.from('user_analytics').insert({
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


      log.debug('trackEvent', 'Analytics event tracked', { eventType: event.eventType, contentType: event.contentType });
    } catch (error) {
      log.error('trackEvent', 'Error tracking analytics', { error });
    }
  };

  // Flush queued events to enhanced analytics table
  const flushEventQueue = useCallback(async () => {
    if (eventQueue.current.length === 0) return;

    // Hoisted out of the try so the catch can actually re-queue what failed.
    // While it was scoped inside, the error path could not see it (see below).
    const eventsToFlush = [...eventQueue.current];

    try {
      eventQueue.current = []; // Clear queue

      // Try to insert to enhanced analytics table (graceful fallback if table doesn't exist yet)
      try {
        await supabase.from('user_interactions_enhanced').insert(eventsToFlush);
        log.debug('flushEventQueue', `Flushed ${eventsToFlush.length} enhanced analytics events`);
      } catch (enhancedError) {
        log.debug('flushEventQueue', 'Enhanced analytics table not available yet, using fallback');
        // Fallback to existing user_analytics table with simplified data
        const fallbackEvents = eventsToFlush.map(event => ({
          session_id: event.session_id,
          user_id: event.user_id,
          event_type: event.interaction_type,
          content_type: event.content_type,
          content_id: event.content_id,
          device_type: event.device_type,
          user_agent: event.user_agent,
          referrer: event.referrer,
          page_url: window.location.href
        }));
        
        for (const event of fallbackEvents) {
          // Queue items are loosely typed (Record<string, unknown>); the row
          // shape is correct at runtime, so bypass the generated-row check.
          await supabase.from('user_analytics').insert(event as never);
        }
        log.debug('flushEventQueue', `Flushed ${fallbackEvents.length} analytics events to fallback table`);
      }

      // Batch content metrics to Edge Function (reduces overhead)
      try {
        const isUuid = (v: unknown) => typeof v === 'string' && /[0-9a-fA-F-]{36}/.test(v);
        const allowedTypes = new Set(['view','search','click','share','bookmark','hover','scroll','filter']);
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
          await supabase.functions.invoke('log-content-metrics', {
            body: { events: metricEvents },
          });
        }
      } catch (e) {
        log.warn('flushEventQueue', 'Batch metrics logging failed (edge function)', { error: e });
      }
    } catch (error) {
      log.error('flushEventQueue', 'Error flushing analytics queue', { error });
      // Re-queue the events that actually failed, ahead of anything enqueued
      // while the flush was in flight.
      //
      // This previously read `[...eventQueue.current, ...eventQueue.current]`,
      // which did the opposite of its comment: eventsToFlush had already been
      // cleared from the queue and was out of scope here, so the failed events
      // were LOST while whatever arrived during the flush was DUPLICATED — and
      // duplicated again on every subsequent failure, doubling the queue each
      // time. A backend outage therefore produced exponential memory growth and
      // inflated counts for the events that survived.
      //
      // Bounded so a persistent outage cannot grow the queue without limit;
      // dropping the oldest analytics events is strictly better than pinning
      // the tab's memory.
      const requeued = [...eventsToFlush, ...eventQueue.current];
      eventQueue.current = requeued.slice(-MAX_QUEUED_EVENTS);
    }
  }, []);

  // Track page views with enhanced data
  const trackPageView = useCallback(async () => {
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
  }, [sessionId, userId]);

  // Enhanced search tracking with user journey data
  const trackSearch = async (query: string, filters: Record<string, string | undefined>, resultsCount: number, clickedResultId?: string) => {
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
      await supabase.from('search_analytics').insert({
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
  const trackPreference = async (category: string, value: string, confidence: number = 0.5) => {
    try {
      // Try to use enhanced preference profiles table
      try {
        await supabase.from('user_preference_profiles').upsert({
          user_id: userId,
          session_id: userId ? null : sessionId,
          [`preferred_${category}s`]: [value],
          preference_confidence: { [category]: confidence },
          last_updated: new Date().toISOString()
        }, {
          onConflict: userId ? 'user_id' : 'session_id'
        });
      } catch (enhancedError) {
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
    try {
      // Try to update user journey with conversion
      try {
        await supabase.from('user_journeys').upsert({
          session_id: sessionId,
          user_id: userId,
          converted: true,
          conversion_type: conversionType,
          conversion_content_type: contentType,
          conversion_content_id: contentId,
          session_end: new Date().toISOString(),
          session_duration: Math.floor((new Date().getTime() - sessionData.startTime.getTime()) / 1000)
        }, {
          onConflict: 'session_id'
        });
      } catch (enhancedError) {
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