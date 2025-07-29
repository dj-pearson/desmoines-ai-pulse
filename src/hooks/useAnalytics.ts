import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AnalyticsData {
  sessionId: string;
  userId?: string;
}

interface TrackingEvent {
  eventType: 'view' | 'search' | 'click' | 'share' | 'bookmark';
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground';
  contentId: string;
  searchQuery?: string;
  filters?: any;
}

export function useAnalytics() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [userId, setUserId] = useState<string | null>(null);

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

    return () => subscription.unsubscribe();
  }, []);

  const trackEvent = async (event: TrackingEvent) => {
    try {
      // Track user analytics
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

      // Track content metrics (aggregated)
      await supabase.from('content_metrics').upsert({
        content_type: event.contentType,
        content_id: event.contentId,
        metric_type: event.eventType,
        metric_value: 1
      }, {
        onConflict: 'content_type,content_id,metric_type,date,hour',
        ignoreDuplicates: false
      });

      console.log('Analytics event tracked:', event);
    } catch (error) {
      console.error('Error tracking analytics:', error);
    }
  };

  const trackSearch = async (query: string, filters: any, resultsCount: number, clickedResultId?: string) => {
    try {
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

      console.log('Search tracked:', { query, resultsCount });
    } catch (error) {
      console.error('Error tracking search:', error);
    }
  };

  return {
    sessionId,
    userId,
    trackEvent,
    trackSearch
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