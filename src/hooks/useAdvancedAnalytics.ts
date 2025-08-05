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
        // Mock tracking since the table doesn't exist
        console.log("Enhanced interaction tracked:", {
          sessionId: sessionId.current,
          userId: userId,
          ...interaction,
          timestamp: new Date().toISOString(),
        });
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
      // Mock enhanced interaction tracking since table doesn't exist
      console.log("Enhanced interaction would be tracked:", {
        sessionId: sessionId.current,
        userId: userId,
        interactionType: "click",
        elementType,
        contentType,
        contentId,
        pageContext: currentPage.current,
        additionalData,
        timestamp: new Date().toISOString(),
      });

      // Mock user preference profile update since table doesn't exist
      console.log("User preference would be updated:", {
        userId: userId,
        contentType,
        interactionType: "click",
        timestamp: new Date().toISOString(),
      });

      // Mock AI insights since table doesn't exist
      const contextualData = getContextualData();
      const aiInsights = null;

      if (userId && !aiInsights) {
        console.log("AI insights would be generated for user:", userId);
      }
    },
    [userId, getContextualData]
  );

  // Get analytics summary
  const getAnalyticsSummary = useCallback(async () => {
    try {
      // Mock analytics summary since table doesn't exist
      return {
        totalInteractions: 0,
        uniqueUsers: 0,
        topPages: [],
        deviceBreakdown: {},
        searchQueries: [],
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