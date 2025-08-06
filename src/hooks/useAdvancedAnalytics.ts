import { useCallback, useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface AnalyticsData {
  sessionId: string;
  userId?: string;
  deviceInfo: {
    userAgent: string;
    screen: string;
    language: string;
    timezone: string;
  };
  currentPage: string;
  interactions: number;
}

export function useAdvancedAnalytics() {
  const { user } = useAuth();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const sessionId = useRef(crypto.randomUUID());
  const currentPage = useRef("");
  const userId = user?.id;

  // Initialize analytics
  useEffect(() => {
    const initAnalytics = () => {
      const data: AnalyticsData = {
        sessionId: sessionId.current,
        userId: userId,
        deviceInfo: {
          userAgent: navigator.userAgent,
          screen: `${window.screen.width}x${window.screen.height}`,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        currentPage: window.location.pathname,
        interactions: 0,
      };
      
      setAnalyticsData(data);
      currentPage.current = window.location.pathname;
    };

    initAnalytics();
  }, [userId]);

  // Get contextual data
  const getContextualData = useCallback(() => {
    return {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      referrer: document.referrer,
      sessionDuration: Date.now() - parseInt(sessionId.current.substring(0, 8), 16),
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    };
  }, []);

  // Track user interactions
  const trackInteraction = useCallback(
    async (interaction: {
      interactionType: string;
      elementType: string;
      contentType: string;
      pageContext: string;
      value?: string;
      duration?: number;
    }) => {
      if (!analyticsData) return;

      try {
        // Track interaction to user_analytics table
        const { error } = await supabase
          .from('user_analytics')
          .insert({
            session_id: sessionId.current,
            user_id: userId,
            event_type: interaction.interactionType,
            content_type: interaction.contentType,
            content_id: interaction.value || null,
            page_url: window.location.href,
            metadata: {
              elementType: interaction.elementType,
              pageContext: interaction.pageContext,
              duration: interaction.duration,
              timestamp: new Date().toISOString(),
            },
          });

        if (error) {
          console.error('Error tracking interaction:', error);
        }
      } catch (error) {
        console.error("Error tracking interaction:", error);
      }
    },
    [analyticsData, userId]
  );

  // Track page views
  const trackPageView = useCallback(
    async (page: string, metadata: any = {}) => {
      currentPage.current = page;
      
      await trackInteraction({
        interactionType: "page_view",
        elementType: "page",
        contentType: "page",
        pageContext: page,
        value: page,
      });
    },
    [trackInteraction]
  );

  // Track content views
  const trackContentView = useCallback(
    async (
      contentType: string,
      contentId: string,
      duration?: number
    ) => {
      await trackInteraction({
        interactionType: "view",
        elementType: "content",
        contentType,
        pageContext: currentPage.current,
        value: contentId,
        duration,
      });
    },
    [trackInteraction]
  );

  // Enhanced search tracking with context
  const trackSearchWithContext = useCallback(
    async (
      query: string,
      filters: any,
      resultsCount: number,
      clickedResultId?: string
    ) => {
      const contextualData = getContextualData();

      try {
        // Track the search in search_analytics table
        await supabase.from("search_analytics").insert({
          session_id: sessionId.current,
          user_id: userId,
          query: query.trim(),
          category: filters.category,
          location: filters.location,
          date_filter: filters.dateFilter,
          price_filter: filters.priceRange,
          results_count: resultsCount,
          clicked_result_id: clickedResultId,
        });

        // Also track as interaction
        trackInteraction({
          interactionType: "search",
          elementType: "search_input",
          contentType: "page",
          pageContext: currentPage.current,
          value: query,
        });

        console.log("Enhanced search tracked:", {
          query,
          resultsCount,
          contextualData,
        });
      } catch (error) {
        console.error("Error tracking search:", error);
      }
    },
    [userId, getContextualData, trackInteraction]
  );

  // Track clicks with enhanced context
  const trackClickWithContext = useCallback(
    async (
      elementType: string,
      contentType: string,
      contentId: string,
      additionalData: any = {}
    ) => {
      try {
        // Track enhanced interaction to user_analytics table
        const { error } = await supabase
          .from('user_analytics')
          .insert({
            session_id: sessionId.current,
            user_id: userId,
            event_type: 'click',
            content_type: contentType,
            content_id: contentId,
            page_url: window.location.href,
            metadata: {
              elementType,
              pageContext: currentPage.current,
              additionalData,
              timestamp: new Date().toISOString(),
            },
          });

        if (error) {
          console.error('Error tracking click:', error);
        }

        // Update content metrics for this content
        await supabase
          .from('content_metrics')
          .insert({
            content_type: contentType,
            content_id: contentId,
            metric_type: 'click',
            metric_value: 1,
          });

      } catch (error) {
        console.error('Error tracking enhanced click:', error);
      }
    },
    [userId, getContextualData]
  );

  // Get analytics summary from database
  const getAnalyticsSummary = useCallback(async () => {
    try {
      // Get total interactions from user_analytics
      const { data: interactions, error: interactionsError } = await supabase
        .from('user_analytics')
        .select('*');

      if (interactionsError) throw interactionsError;

      // Get unique users count
      const { data: uniqueUsers, error: usersError } = await supabase
        .from('user_analytics')
        .select('user_id')
        .not('user_id', 'is', null);

      if (usersError) throw usersError;

      // Get search queries from search_analytics
      const { data: searches, error: searchError } = await supabase
        .from('search_analytics')
        .select('query')
        .order('created_at', { ascending: false })
        .limit(10);

      if (searchError) throw searchError;

      // Get top pages from user_analytics
      const { data: pageViews, error: pagesError } = await supabase
        .from('user_analytics')
        .select('page_url')
        .eq('event_type', 'page_view')
        .order('created_at', { ascending: false })
        .limit(100);

      if (pagesError) throw pagesError;

      // Process page views to get counts
      const topPages = pageViews?.reduce((acc: any, item) => {
        const url = new URL(item.page_url || '', window.location.origin);
        const path = url.pathname;
        acc[path] = (acc[path] || 0) + 1;
        return acc;
      }, {});

      return {
        totalInteractions: interactions?.length || 0,
        uniqueUsers: new Set(uniqueUsers?.map(u => u.user_id)).size || 0,
        topPages: Object.entries(topPages || {})
          .map(([page, count]) => ({ page, count }))
          .sort((a: any, b: any) => b.count - a.count)
          .slice(0, 5),
        deviceBreakdown: {},
        searchQueries: searches?.map(s => s.query) || [],
      };
    } catch (error) {
      console.error("Error fetching analytics summary:", error);
      return null;
    }
  }, []);

  return {
    sessionId: sessionId.current,
    userId,
    analyticsData,
    trackInteraction,
    trackPageView,
    trackContentView,
    trackSearchWithContext,
    trackClickWithContext,
    getAnalyticsSummary,
    getContextualData,
  };
}