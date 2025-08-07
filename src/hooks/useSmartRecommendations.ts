import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { useFeedback } from './useFeedback';
import { Event } from '@/lib/types';

interface SmartRecommendation {
  event: Event;
  score: number;
  reasoning: string[];
  confidence: number;
  recommendationType: 'collaborative' | 'content_based' | 'trending' | 'hybrid';
}

interface UserPreferences {
  interests: string[];
  location?: string;
  pricePreference?: string;
  recentFeedback: Array<{ event_id: string; feedback_type: string }>;
}

// Research-based optimal weights: 60% collaborative, 25% content-based, 15% trending
const ALGORITHM_WEIGHTS = {
  collaborative: 0.6,
  contentBased: 0.25,
  trending: 0.15
};

export function useSmartRecommendations() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { userFeedback, getFeedbackStats } = useFeedback();
  
  const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);

  // Generate hybrid recommendations using research-based approach
  const generateRecommendations = async (limit: number = 10) => {
    if (!user) return [];

    try {
      setIsLoading(true);
      setError(null);

      const userPreferences = extractUserPreferences();
      
      // Phase 1: Generate candidates from each algorithm
      const [collaborativeRecs, contentBasedRecs, trendingRecs] = await Promise.all([
        generateCollaborativeRecommendations(userPreferences, limit * 2),
        generateContentBasedRecommendations(userPreferences, limit * 2),
        generateTrendingRecommendations(limit)
      ]);

      // Phase 2: Combine using weighted hybrid approach (LinkedIn model)
      const hybridRecs = combineRecommendations(
        collaborativeRecs,
        contentBasedRecs,
        trendingRecs,
        limit
      );

      // Phase 3: Apply temporal factors and geographic proximity
      const finalRecs = await applyContextualFactors(hybridRecs, userPreferences);

      // Calculate confidence based on available data
      const calculatedConfidence = calculateConfidence(userPreferences, finalRecs);
      
      setRecommendations(finalRecs);
      setConfidence(calculatedConfidence);
      
      return finalRecs;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate recommendations';
      setError(errorMessage);
      console.error('Smart recommendations error:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Extract user preferences from profile and feedback patterns
  const extractUserPreferences = (): UserPreferences => {
    const recentFeedback = Object.entries(userFeedback).map(([eventId, feedback]) => ({
      event_id: eventId,
      feedback_type: feedback.feedback_type
    }));

    return {
      interests: profile?.interests || [],
      location: profile?.location,
      pricePreference: determinePricePreference(recentFeedback),
      recentFeedback
    };
  };

  // Collaborative filtering - find users with similar preferences and get their liked events
  const generateCollaborativeRecommendations = async (
    preferences: UserPreferences,
    limit: number
  ): Promise<SmartRecommendation[]> => {
    if (preferences.recentFeedback.length < 2) return []; // Need minimum feedback for collaborative

    try {
      // Find users with similar feedback patterns
      const userLikes = preferences.recentFeedback
        .filter(f => f.feedback_type === 'thumbs_up' || f.feedback_type === 'interested')
        .map(f => f.event_id);

      if (userLikes.length === 0) return [];

      // Get users who liked similar events
      const { data: similarUsers } = await supabase
        .from('user_event_feedback')
        .select('user_id, event_id')
        .in('event_id', userLikes)
        .eq('feedback_type', 'thumbs_up')
        .neq('user_id', user!.id);

      if (!similarUsers || similarUsers.length === 0) return [];

      // Calculate user similarity scores using Jaccard coefficient
      const userSimilarities = calculateUserSimilarities(userLikes, similarUsers);
      
      // Get top similar users
      const topSimilarUsers = Array.from(userSimilarities.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId]) => userId);

      // Get events liked by similar users that current user hasn't seen
      const { data: recommendedEvents } = await supabase
        .from('user_event_feedback')
        .select(`
          event_id,
          events (*)
        `)
        .in('user_id', topSimilarUsers)
        .eq('feedback_type', 'thumbs_up')
        .not('event_id', 'in', `(${userLikes.join(',')})`)
        .limit(limit);

      if (!recommendedEvents) return [];

      return recommendedEvents
        .filter(item => item.events && Array.isArray(item.events) && item.events.length > 0)
        .map(item => ({
          event: Array.isArray(item.events) ? item.events[0] as Event : item.events as Event,
          score: 0.8, // High score for collaborative matches
          reasoning: ['Liked by users with similar tastes'],
          confidence: 0.8,
          recommendationType: 'collaborative' as const
        }));

    } catch (error) {
      console.error('Collaborative filtering error:', error);
      return [];
    }
  };

  // Content-based filtering using event metadata and user interests
  const generateContentBasedRecommendations = async (
    preferences: UserPreferences,
    limit: number
  ): Promise<SmartRecommendation[]> => {
    try {
      let query = supabase
        .from('events')
        .select('*')
        .gte('date', new Date().toISOString()); // Future events only

      // Apply interest-based filtering
      if (preferences.interests.length > 0) {
        const categoryMappings = mapInterestsToCategories(preferences.interests);
        if (categoryMappings.length > 0) {
          const categoryFilter = categoryMappings.map(cat => `category.ilike.%${cat}%`).join(',');
          query = query.or(categoryFilter);
        }
      }

      const { data: events } = await query.limit(limit);

      if (!events) return [];

      return events.map(event => ({
        event,
        score: calculateContentBasedScore(event, preferences),
        reasoning: generateContentBasedReasoning(event, preferences),
        confidence: 0.7,
        recommendationType: 'content_based' as const
      })).sort((a, b) => b.score - a.score);

    } catch (error) {
      console.error('Content-based filtering error:', error);
      return [];
    }
  };

  // Trending recommendations with velocity scoring
  const generateTrendingRecommendations = async (limit: number): Promise<SmartRecommendation[]> => {
    try {
      const { data: trendingScores } = await supabase
        .from('trending_scores')
        .select(`
          *,
          events (*)
        `)
        .eq('content_type', 'event')
        .eq('date', new Date().toISOString().split('T')[0])
        .order('score', { ascending: false })
        .limit(limit);

      if (!trendingScores) return [];

      // Fallback to getting events separately if relationship doesn't work
      const eventsToRecommend: SmartRecommendation[] = [];
      
      for (const trendingScore of trendingScores) {
        const { data: event } = await supabase
          .from('events')
          .select('*')
          .eq('id', trendingScore.content_id)
          .single();
          
        if (event) {
          eventsToRecommend.push({
            event: event as Event,
            score: trendingScore.score * 0.7,
            reasoning: [
              `Trending with ${trendingScore.views_24h} views today`,
              `Rising popularity (velocity: ${trendingScore.velocity_score})`
            ],
            confidence: 0.6,
            recommendationType: 'trending' as const
          });
        }
      }
      
      return eventsToRecommend;

    } catch (error) {
      console.error('Trending recommendations error:', error);
      return [];
    }
  };

  // Combine recommendations using weighted linear combination (LinkedIn model)
  const combineRecommendations = (
    collaborative: SmartRecommendation[],
    contentBased: SmartRecommendation[],
    trending: SmartRecommendation[],
    limit: number
  ): SmartRecommendation[] => {
    const combined = new Map<string, SmartRecommendation>();

    // Apply weights to each recommendation type
    const addRecommendations = (recs: SmartRecommendation[], weight: number) => {
      recs.forEach(rec => {
        const key = rec.event.id;
        const weightedScore = rec.score * weight;
        
        if (combined.has(key)) {
          const existing = combined.get(key)!;
          existing.score += weightedScore;
          existing.reasoning.push(...rec.reasoning);
          existing.recommendationType = 'hybrid';
        } else {
          combined.set(key, {
            ...rec,
            score: weightedScore,
            recommendationType: 'hybrid'
          });
        }
      });
    };

    addRecommendations(collaborative, ALGORITHM_WEIGHTS.collaborative);
    addRecommendations(contentBased, ALGORITHM_WEIGHTS.contentBased);
    addRecommendations(trending, ALGORITHM_WEIGHTS.trending);

    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  };

  // Apply contextual factors: geographic proximity, time decay, freshness boost
  const applyContextualFactors = async (
    recommendations: SmartRecommendation[],
    preferences: UserPreferences
  ): Promise<SmartRecommendation[]> => {
    return recommendations.map(rec => {
      let contextBoost = 1.0;
      const newReasoning = [...rec.reasoning];

      // Geographic proximity boost
      if (preferences.location && rec.event.location?.toLowerCase().includes(preferences.location.toLowerCase())) {
        contextBoost += 0.2;
        newReasoning.push(`Near ${preferences.location}`);
      }

      // Freshness boost for recently added events
      if (rec.event.created_at) {
        const daysSinceCreated = (Date.now() - new Date(rec.event.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreated < 7) {
          contextBoost += 0.15;
          newReasoning.push('Recently added');
        }
      }

      // Featured content boost
      if (rec.event.is_featured) {
        contextBoost += 0.1;
        newReasoning.push('Featured event');
      }

      return {
        ...rec,
        score: rec.score * contextBoost,
        reasoning: newReasoning
      };
    });
  };

  // Helper functions
  const mapInterestsToCategories = (interests: string[]): string[] => {
    const categoryMap: { [key: string]: string[] } = {
      food: ['Food', 'Restaurant', 'Dining', 'Culinary'],
      music: ['Music', 'Concert', 'Live Music', 'Performance'],
      sports: ['Sports', 'Recreation', 'Fitness', 'Athletic'],
      arts: ['Arts', 'Culture', 'Art', 'Gallery', 'Theater'],
      nightlife: ['Nightlife', 'Entertainment', 'Bar', 'Club'],
      outdoor: ['Outdoor', 'Nature', 'Park', 'Adventure'],
      family: ['Family', 'Kids', 'Children', 'Youth'],
      networking: ['Business', 'Networking', 'Professional', 'Workshop']
    };
    
    return interests.flatMap(interest => categoryMap[interest.toLowerCase()] || []);
  };

  const calculateContentBasedScore = (event: Event, preferences: UserPreferences): number => {
    let score = 0.5; // Base score

    // Interest matching
    if (preferences.interests.length > 0 && event.category) {
      const categoryMappings = mapInterestsToCategories(preferences.interests);
      const matches = categoryMappings.filter(cat => 
        event.category.toLowerCase().includes(cat.toLowerCase())
      );
      score += (matches.length / categoryMappings.length) * 0.4;
    }

    // Featured boost
    if (event.is_featured) score += 0.2;

    // Recent events boost
    if (event.date) {
      const daysUntilEvent = (new Date(event.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilEvent <= 7 && daysUntilEvent >= 0) {
        score += 0.1; // Boost events happening soon
      }
    }

    return Math.min(score, 1.0);
  };

  const generateContentBasedReasoning = (event: Event, preferences: UserPreferences): string[] => {
    const reasons: string[] = [];

    if (preferences.interests.length > 0 && event.category) {
      const matchingInterests = preferences.interests.filter(interest => 
        mapInterestsToCategories([interest]).some(cat => 
          event.category.toLowerCase().includes(cat.toLowerCase())
        )
      );
      if (matchingInterests.length > 0) {
        reasons.push(`Matches your interest in ${matchingInterests.join(', ')}`);
      }
    }

    if (event.is_featured) reasons.push('Featured event');

    if (event.date) {
      const daysUntilEvent = Math.ceil((new Date(event.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilEvent <= 7 && daysUntilEvent > 0) {
        reasons.push(`Happening in ${daysUntilEvent} days`);
      }
    }

    return reasons;
  };

  const calculateUserSimilarities = (userLikes: string[], similarUsers: any[]): Map<string, number> => {
    const similarities = new Map<string, number>();
    const userLikesSet = new Set(userLikes);
    
    // Group by user ID
    const userGroups = new Map<string, Set<string>>();
    similarUsers.forEach(item => {
      if (!userGroups.has(item.user_id)) {
        userGroups.set(item.user_id, new Set());
      }
      userGroups.get(item.user_id)!.add(item.event_id);
    });

    // Calculate Jaccard similarity for each user
    userGroups.forEach((otherLikes, userId) => {
      const intersection = new Set([...userLikesSet].filter(x => otherLikes.has(x)));
      const union = new Set([...userLikesSet, ...otherLikes]);
      const similarity = intersection.size / union.size;
      similarities.set(userId, similarity);
    });

    return similarities;
  };

  const determinePricePreference = (feedback: Array<{ event_id: string; feedback_type: string }>): string => {
    // Could analyze user's price preferences based on feedback patterns
    return 'moderate'; // Default for now
  };

  const calculateConfidence = (preferences: UserPreferences, recommendations: SmartRecommendation[]): number => {
    let confidence = 0.4; // Base confidence

    // More feedback = higher confidence
    if (preferences.recentFeedback.length > 5) confidence += 0.3;
    else if (preferences.recentFeedback.length > 2) confidence += 0.2;
    else if (preferences.recentFeedback.length > 0) confidence += 0.1;

    // More interests = higher confidence
    if (preferences.interests.length > 2) confidence += 0.2;
    else if (preferences.interests.length > 0) confidence += 0.1;

    // More recommendations found = higher confidence
    if (recommendations.length >= 8) confidence += 0.1;

    return Math.min(confidence, 1.0);
  };

  useEffect(() => {
    if (user && profile) {
      generateRecommendations();
    }
  }, [user, profile, userFeedback]);

  return {
    recommendations,
    isLoading,
    error,
    confidence,
    generateRecommendations,
    refreshRecommendations: () => generateRecommendations()
  };
}