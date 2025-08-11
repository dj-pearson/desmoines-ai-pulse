import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
const ENABLE_DIRECT_CONTENT_METRICS = false;

interface AnalyticsData {
  sessionId: string;
  userId?: string;
}

interface TrackingEvent {
  eventType: 'view' | 'search' | 'click' | 'share' | 'bookmark' | 'hover' | 'scroll' | 'filter';
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground' | 'page' | 'search_result';
  contentId: string;
  searchQuery?: string;
  filters?: any;
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
  const eventQueue = useRef<any[]>([]);
  const flushTimer = useRef<NodeJS.Timeout | null>(null);

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

      // Server-side metrics logging via Edge Function (bypasses RLS safely)
      try {
        await supabase.functions.invoke('log-content-metrics', {
          body: {
            events: [{
              content_type: event.contentType,
              content_id: event.contentId,
              metric_type: event.eventType,
              metric_value: 1,
            }],
          },
        });
      } catch (e) {
        console.warn('Metrics logging failed (edge function):', e);
      }

      console.log('Analytics event tracked:', event);
    } catch (error) {
      console.error('Error tracking analytics:', error);
    }
  };

  // Flush queued events to enhanced analytics table
  const flushEventQueue = useCallback(async () => {
    if (eventQueue.current.length === 0) return;

    try {
      const eventsToFlush = [...eventQueue.current];
      eventQueue.current = []; // Clear queue

      // Try to insert to enhanced analytics table (graceful fallback if table doesn't exist yet)
      try {
        await supabase.from('user_interactions_enhanced' as any).insert(eventsToFlush);
        console.log(`Flushed ${eventsToFlush.length} enhanced analytics events`);
      } catch (enhancedError) {
        console.log('Enhanced analytics table not available yet, using fallback');
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
          await supabase.from('user_analytics').insert(event);
        }
        console.log(`Flushed ${fallbackEvents.length} analytics events to fallback table`);
      }
    } catch (error) {
      console.error('Error flushing analytics queue:', error);
      // If flush fails, keep events in queue for next attempt
      eventQueue.current = [...eventQueue.current, ...eventQueue.current];
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
  const trackSearch = async (query: string, filters: any, resultsCount: number, clickedResultId?: string) => {
    try {
      // Track in existing search analytics table
      await supabase.from('search_analytics').insert({
        session_id: sessionId,
        user_id: userId,
        query: query,
        category: filters.category,
        location: filters.location,
        date_filter: filters.dateFilter,
        price_filter: filters.priceRange,
        results_count: resultsCount,
        clicked_result_id: clickedResultId
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

      console.log('Search tracked:', { query, resultsCount });
    } catch (error) {
      console.error('Error tracking search:', error);
    }
  };

  // Track user preferences based on behavior
  const trackPreference = async (category: string, value: string, confidence: number = 0.5) => {
    try {
      // Try to use enhanced preference profiles table
      try {
        await supabase.from('user_preference_profiles' as any).upsert({
          user_id: userId,
          session_id: userId ? null : sessionId,
          [`preferred_${category}s`]: [value],
          preference_confidence: { [category]: confidence },
          last_updated: new Date().toISOString()
        }, {
          onConflict: userId ? 'user_id' : 'session_id'
        });
      } catch (enhancedError) {
        console.log('Enhanced preference table not available, tracking as analytics event');
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
      console.error('Error tracking preference:', error);
    }
  };

  // Track conversion events (phone calls, website visits, etc.)
  const trackConversion = async (conversionType: 'website_visit' | 'phone_call' | 'direction_request' | 'email', contentType: string, contentId: string) => {
    try {
      // Try to update user journey with conversion
      try {
        await supabase.from('user_journeys' as any).upsert({
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
        console.log('Enhanced journey table not available, tracking as analytics event');
      }

      // Always track as regular event too
      await trackEvent({
        eventType: 'click',
        contentType: contentType as any,
        contentId: contentId,
        elementType: 'button',
        value: conversionType
      });
    } catch (error) {
      console.error('Error tracking conversion:', error);
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