import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Enhanced interfaces for advanced tracking
interface UserInteraction {
  interactionType: 'view' | 'click' | 'hover' | 'scroll' | 'search' | 'filter' | 'share' | 'bookmark';
  elementType?: 'card' | 'button' | 'link' | 'search_input' | 'filter_dropdown' | 'navigation';
  elementId?: string;
  contentType: 'event' | 'restaurant' | 'attraction' | 'playground' | 'page';
  contentId?: string;
  pageContext: string; // Current page/route
  duration?: number; // Time spent in milliseconds
  scrollDepth?: number; // Percentage scrolled
  clickPosition?: 'above_fold' | 'below_fold';
  value?: string; // Search query, filter value, etc.
}

interface UserPreference {
  category: 'cuisine' | 'event_type' | 'price_range' | 'location' | 'time_preference' | 'device_preference';
  value: string;
  confidence: number; // 0-1 confidence score
  implicit: boolean; // Derived from behavior vs explicit choice
}

interface ContextualData {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  deviceType: 'mobile' | 'tablet' | 'desktop';
  viewportSize: string;
  userAgent: string;
  referrer: string;
  location?: string; // If geolocation enabled
}

interface SessionMetrics {
  startTime: Date;
  pageViews: number;
  totalInteractions: number;
  averageTimePerPage: number;
  searchQueries: number;
  filtersUsed: number;
  contentEngaged: number;
  lastActivity: Date;
}

export function useAdvancedAnalytics() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionMetrics, setSessionMetrics] = useState<SessionMetrics>({
    startTime: new Date(),
    pageViews: 0,
    totalInteractions: 0,
    averageTimePerPage: 0,
    searchQueries: 0,
    filtersUsed: 0,
    contentEngaged: 0,
    lastActivity: new Date()
  });

  // Refs for tracking page time and interactions
  const pageStartTime = useRef<Date>(new Date());
  const currentPage = useRef<string>(window.location.pathname);
  const interactionQueue = useRef<UserInteraction[]>([]);
  const preferenceQueue = useRef<UserPreference[]>([]);

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

    // Set up automatic data flushing
    const flushInterval = setInterval(flushQueuedData, 5000); // Flush every 5 seconds

    // Track page visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        flushQueuedData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Track page unload
    const handleBeforeUnload = () => {
      flushQueuedData();
      trackPageExit();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      subscription.unsubscribe();
      clearInterval(flushInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushQueuedData();
    };
  }, []);

  // Get contextual data about user's environment
  const getContextualData = useCallback((): ContextualData => {
    const now = new Date();
    const hour = now.getHours();
    
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' = 'morning';
    if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const month = now.getMonth();
    let season: 'spring' | 'summer' | 'fall' | 'winter' = 'spring';
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'fall';
    else season = 'winter';

    const deviceType = getMobileDetect();
    
    return {
      timeOfDay,
      dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
      season,
      deviceType: deviceType as 'mobile' | 'tablet' | 'desktop',
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent,
      referrer: document.referrer,
    };
  }, []);

  // Track detailed user interactions
  const trackInteraction = useCallback(async (interaction: UserInteraction) => {
    const contextualData = getContextualData();
    
    const enhancedInteraction = {
      ...interaction,
      sessionId,
      userId,
      timestamp: new Date(),
      contextualData,
    };

    // Add to queue for batch processing
    interactionQueue.current.push(interaction);

    // Update session metrics
    setSessionMetrics(prev => ({
      ...prev,
      totalInteractions: prev.totalInteractions + 1,
      lastActivity: new Date(),
      searchQueries: interaction.interactionType === 'search' ? prev.searchQueries + 1 : prev.searchQueries,
      filtersUsed: interaction.interactionType === 'filter' ? prev.filtersUsed + 1 : prev.filtersUsed,
      contentEngaged: ['view', 'click', 'share', 'bookmark'].includes(interaction.interactionType) ? prev.contentEngaged + 1 : prev.contentEngaged,
    }));

    // Derive implicit preferences from interactions
    if (interaction.interactionType === 'view' && interaction.duration && interaction.duration > 3000) {
      // User spent significant time viewing content - indicates interest
      derivePreference(interaction);
    }

    console.log('Advanced interaction tracked:', enhancedInteraction);
  }, [sessionId, userId, getContextualData]);

  // Derive user preferences from behavior
  const derivePreference = useCallback((interaction: UserInteraction) => {
    // This is where AI/ML could be applied to detect preferences
    // For now, using simple heuristics

    if (interaction.contentType === 'restaurant' && interaction.duration && interaction.duration > 5000) {
      // User spent time on restaurant - might like the cuisine
      // This would need to fetch restaurant data to get cuisine type
      const preference: UserPreference = {
        category: 'cuisine',
        value: 'unknown', // Would be populated from restaurant data
        confidence: Math.min(interaction.duration / 10000, 1), // Max confidence of 1
        implicit: true
      };
      
      preferenceQueue.current.push(preference);
    }

    if (interaction.interactionType === 'filter' && interaction.value) {
      // User applied a filter - explicit preference signal
      const preference: UserPreference = {
        category: interaction.elementType === 'filter_dropdown' ? 'cuisine' : 'location', // Simplified
        value: interaction.value,
        confidence: 0.8, // High confidence for explicit actions
        implicit: false
      };
      
      preferenceQueue.current.push(preference);
    }
  }, []);

  // Track page views with detailed metrics
  const trackPageView = useCallback(() => {
    const currentPagePath = window.location.pathname;
    
    // Track time spent on previous page
    if (currentPage.current !== currentPagePath) {
      const timeSpent = Date.now() - pageStartTime.current.getTime();
      
      trackInteraction({
        interactionType: 'view',
        elementType: 'card',
        contentType: 'page',
        pageContext: currentPage.current,
        duration: timeSpent
      });
    }

    // Reset for new page
    pageStartTime.current = new Date();
    currentPage.current = currentPagePath;
    
    setSessionMetrics(prev => ({
      ...prev,
      pageViews: prev.pageViews + 1
    }));
  }, [trackInteraction]);

  // Track when user exits page
  const trackPageExit = useCallback(() => {
    const timeSpent = Date.now() - pageStartTime.current.getTime();
    
    trackInteraction({
      interactionType: 'view',
      elementType: 'card',
      contentType: 'page',
      pageContext: currentPage.current,
      duration: timeSpent
    });
  }, [trackInteraction]);

  // Track scroll depth
  const trackScrollDepth = useCallback((depth: number) => {
    // Only track meaningful scroll milestones
    if (depth >= 25 && depth % 25 === 0) {
      trackInteraction({
        interactionType: 'scroll',
        contentType: 'page',
        pageContext: currentPage.current,
        scrollDepth: depth
      });
    }
  }, [trackInteraction]);

  // Track content engagement (time spent on specific content)
  const trackContentEngagement = useCallback((contentType: 'event' | 'restaurant' | 'attraction' | 'playground', contentId: string, duration: number) => {
    trackInteraction({
      interactionType: 'view',
      elementType: 'card',
      contentType,
      contentId,
      pageContext: currentPage.current,
      duration
    });
  }, [trackInteraction]);

  // Enhanced search tracking with context
  const trackSearchWithContext = useCallback(async (query: string, filters: any, resultsCount: number, clickedResultId?: string) => {
    const contextualData = getContextualData();
    
    try {
      // Track the search in search_analytics table
      await supabase.from('search_analytics').insert({
        session_id: sessionId,
        user_id: userId,
        query: query.trim(),
        category: filters.category,
        location: filters.location,
        date_filter: filters.dateFilter,
        price_filter: filters.priceRange,
        results_count: resultsCount,
        clicked_result_id: clickedResultId,
        contextual_data: contextualData
      });

      // Also track as interaction
      trackInteraction({
        interactionType: 'search',
        elementType: 'search_input',
        contentType: 'page',
        pageContext: currentPage.current,
        value: query
      });

      console.log('Enhanced search tracked:', { query, resultsCount, contextualData });
    } catch (error) {
      console.error('Error tracking enhanced search:', error);
    }
  }, [sessionId, userId, getContextualData, trackInteraction]);

  // Flush queued data to database
  const flushQueuedData = useCallback(async () => {
    if (interactionQueue.current.length === 0 && preferenceQueue.current.length === 0) return;

    try {
      // Flush interactions
      if (interactionQueue.current.length > 0) {
        const interactions = interactionQueue.current.splice(0); // Clear queue
        
        const formattedInteractions = interactions.map(interaction => ({
          session_id: sessionId,
          user_id: userId,
          interaction_type: interaction.interactionType,
          element_type: interaction.elementType,
          element_id: interaction.elementId,
          content_type: interaction.contentType,
          content_id: interaction.contentId,
          page_context: interaction.pageContext,
          duration_ms: interaction.duration,
          scroll_depth: interaction.scrollDepth,
          click_position: interaction.clickPosition,
          interaction_value: interaction.value,
          device_type: getMobileDetect(),
          viewport_size: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: new Date()
        }));

        await supabase.from('user_interactions_enhanced').insert(formattedInteractions);
      }

      // Flush preferences
      if (preferenceQueue.current.length > 0) {
        const preferences = preferenceQueue.current.splice(0); // Clear queue
        
        // Group preferences by user and update preference profile
        const preferenceProfile = {
          user_id: userId,
          session_id: sessionId,
          preference_data: preferences,
          last_updated: new Date()
        };

        await supabase.from('user_preference_profiles').upsert(preferenceProfile, {
          onConflict: userId ? 'user_id' : 'session_id'
        });
      }

      console.log('Queued analytics data flushed successfully');
    } catch (error) {
      console.error('Error flushing analytics data:', error);
    }
  }, [sessionId, userId]);

  // Get user's preference profile
  const getUserPreferences = useCallback(async () => {
    if (!userId && !sessionId) return null;

    try {
      const { data, error } = await supabase
        .from('user_preference_profiles')
        .select('*')
        .eq(userId ? 'user_id' : 'session_id', userId || sessionId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error is OK
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return null;
    }
  }, [userId, sessionId]);

  return {
    sessionId,
    userId,
    sessionMetrics,
    trackInteraction,
    trackPageView,
    trackScrollDepth,
    trackContentEngagement,
    trackSearchWithContext,
    getUserPreferences,
    getContextualData,
    flushQueuedData
  };
}

// Helper function for device detection
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
