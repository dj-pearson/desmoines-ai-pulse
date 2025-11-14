/**
 * Advanced Recommendation Algorithm for Des Moines AI Pulse
 *
 * This algorithm combines multiple signals to generate personalized recommendations:
 * - Explicit user preferences (interests, cuisine, location)
 * - Temporal context (time of day, day of week, season)
 * - Behavioral signals (favorites, views, RSVPs)
 * - Diversity to prevent filter bubbles
 * - Trending and popularity signals
 */

import { Event } from '@/lib/types';
import { UserPreferences, EventCategory } from '@/types/preferences';

export interface ScoredRecommendation<T> {
  item: T;
  score: number;
  reasons: string[];
  confidence: number;
  signals: {
    interestMatch: number;
    locationMatch: number;
    timeMatch: number;
    cuisineMatch: number;
    popularityBoost: number;
    diversityPenalty: number;
    recencyBoost: number;
  };
}

interface TemporalContext {
  hour: number;
  dayOfWeek: number; // 0-6
  isWeekend: boolean;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'late-night';
  season: 'spring' | 'summer' | 'fall' | 'winter';
}

interface BehavioralSignals {
  favoriteCategories: EventCategory[];
  favoriteVenues: string[];
  recentlyViewed: string[];
  previousRSVPs: string[];
}

/**
 * Get current temporal context
 */
export function getTemporalContext(): TemporalContext {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const month = now.getMonth();

  let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'late-night';
  if (hour < 11) timeOfDay = 'morning';
  else if (hour < 17) timeOfDay = 'afternoon';
  else if (hour < 22) timeOfDay = 'evening';
  else timeOfDay = 'late-night';

  let season: 'spring' | 'summer' | 'fall' | 'winter';
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'fall';
  else season = 'winter';

  return {
    hour,
    dayOfWeek,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    timeOfDay,
    season,
  };
}

/**
 * Calculate interest match score
 */
function calculateInterestScore(
  event: Event,
  preferences: UserPreferences
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Check if event category matches user interests
  const eventCategory = event.category?.toLowerCase() as EventCategory;
  if (preferences.interests.categories.includes(eventCategory)) {
    score += 35;
    reasons.push(`Matches your interest in ${eventCategory}`);
  }

  // Check tags/themes
  if (event.tags && preferences.interests.tags.length > 0) {
    const matchingTags = event.tags.filter((tag: string) =>
      preferences.interests.tags.some((userTag) =>
        tag.toLowerCase().includes(userTag.toLowerCase())
      )
    );
    if (matchingTags.length > 0) {
      score += 15 * Math.min(matchingTags.length, 2);
      reasons.push(`Matches your interests: ${matchingTags.slice(0, 2).join(', ')}`);
    }
  }

  // Activity level match
  if (event.metadata?.activityLevel === preferences.interests.activityLevel) {
    score += 10;
  }

  // Environment preference
  const eventEnvironment = event.metadata?.environment || 'both';
  if (
    preferences.interests.environmentPreference === 'both' ||
    eventEnvironment === preferences.interests.environmentPreference ||
    eventEnvironment === 'both'
  ) {
    score += 5;
  }

  return { score, reasons };
}

/**
 * Calculate location match score
 */
function calculateLocationScore(
  event: Event,
  preferences: UserPreferences
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Check if event location matches preferred neighborhoods
  if (event.location && preferences.location.neighborhoods.length > 0) {
    const isInPreferredNeighborhood = preferences.location.neighborhoods.some(
      (neighborhood) =>
        event.location?.toLowerCase().includes(neighborhood.toLowerCase()) ||
        event.venue?.toLowerCase().includes(neighborhood.toLowerCase())
    );

    if (isInPreferredNeighborhood) {
      score += 25;
      reasons.push('In your preferred neighborhood');
    }
  }

  // TODO: Calculate actual distance when event coordinates are available
  // For now, give a small boost to events with locations specified
  if (event.location) {
    score += 5;
  }

  return { score, reasons };
}

/**
 * Calculate temporal/time-based match score
 */
function calculateTimeScore(
  event: Event,
  preferences: UserPreferences,
  context: TemporalContext
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Check if event date is within user's planning horizon
  const eventDate = new Date(event.date);
  const daysUntilEvent = Math.floor(
    (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  let isWithinHorizon = false;
  if (preferences.time.planningHorizon === 'spontaneous' && daysUntilEvent <= 3) {
    isWithinHorizon = true;
    score += 15;
    reasons.push('Happening soon');
  } else if (
    preferences.time.planningHorizon === 'week-ahead' &&
    daysUntilEvent <= 7
  ) {
    isWithinHorizon = true;
    score += 10;
    reasons.push('Perfect for your planning timeline');
  } else if (
    preferences.time.planningHorizon === 'month-ahead' &&
    daysUntilEvent <= 30
  ) {
    isWithinHorizon = true;
    score += 5;
  }

  // Check if event day matches preferred days
  const eventDayOfWeek = eventDate.getDay();
  if (preferences.time.preferredDays.includes(eventDayOfWeek)) {
    score += 8;
  }

  // Time of day matching (if event has time info)
  if (event.time) {
    const eventHour = parseInt(event.time.split(':')[0]);
    let eventTimeOfDay: string;
    if (eventHour < 11) eventTimeOfDay = 'morning';
    else if (eventHour < 17) eventTimeOfDay = 'afternoon';
    else if (eventHour < 22) eventTimeOfDay = 'evening';
    else eventTimeOfDay = 'late-night';

    if (preferences.time.preferredTimes.includes(eventTimeOfDay as any)) {
      score += 12;
      reasons.push(`Perfect for ${eventTimeOfDay}`);
    }
  }

  // Boost events happening on weekends if it's currently the weekend
  if (context.isWeekend && (eventDayOfWeek === 0 || eventDayOfWeek === 6)) {
    score += 10;
    reasons.push('Great weekend activity');
  }

  return { score, reasons };
}

/**
 * Calculate popularity/social proof boost
 */
function calculatePopularityBoost(event: Event): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Featured events
  if (event.is_featured) {
    score += 15;
    reasons.push('Featured event');
  }

  // View count (if available from analytics)
  if (event.metadata?.viewCount) {
    const viewCount = event.metadata.viewCount;
    if (viewCount > 500) {
      score += 20;
      reasons.push('Very popular');
    } else if (viewCount > 200) {
      score += 12;
      reasons.push('Trending');
    } else if (viewCount > 50) {
      score += 6;
    }
  }

  // RSVP count
  if (event.metadata?.rsvpCount) {
    const rsvpCount = event.metadata.rsvpCount;
    if (rsvpCount > 100) {
      score += 15;
      reasons.push('Highly attended');
    } else if (rsvpCount > 50) {
      score += 8;
    }
  }

  return { score, reasons };
}

/**
 * Calculate recency boost (favor newer events)
 */
function calculateRecencyBoost(event: Event): number {
  if (!event.created_at) return 0;

  const createdDate = new Date(event.created_at);
  const daysOld = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

  // Boost recently added events
  if (daysOld <= 3) return 12;
  if (daysOld <= 7) return 6;
  if (daysOld <= 14) return 3;

  return 0;
}

/**
 * Calculate diversity penalty to prevent filter bubbles
 * Penalize items too similar to recently viewed
 */
function calculateDiversityPenalty(
  event: Event,
  recentlyViewed: string[],
  alreadyRecommended: Event[]
): number {
  let penalty = 0;

  // Penalize if recently viewed
  if (recentlyViewed.includes(event.id)) {
    penalty += 20;
  }

  // Penalize if same category as many already recommended items
  const sameCategory = alreadyRecommended.filter(
    (e) => e.category?.toLowerCase() === event.category?.toLowerCase()
  );
  if (sameCategory.length >= 2) {
    penalty += 15;
  }

  // Penalize if same venue as recently recommended
  const sameVenue = alreadyRecommended.filter((e) => e.venue === event.venue);
  if (sameVenue.length >= 1) {
    penalty += 10;
  }

  return penalty;
}

/**
 * Main recommendation scoring function
 */
export function scoreEvent(
  event: Event,
  preferences: UserPreferences,
  context: TemporalContext,
  behavioral: BehavioralSignals,
  alreadyRecommended: Event[] = []
): ScoredRecommendation<Event> {
  const reasons: string[] = [];

  // Calculate individual signal scores
  const interestSignal = calculateInterestScore(event, preferences);
  const locationSignal = calculateLocationScore(event, preferences);
  const timeSignal = calculateTimeScore(event, preferences, context);
  const popularitySignal = calculatePopularityBoost(event);
  const recencyBoost = calculateRecencyBoost(event);
  const diversityPenalty = calculateDiversityPenalty(
    event,
    behavioral.recentlyViewed,
    alreadyRecommended
  );

  // Combine all signals
  const baseScore = 20; // Minimum score
  const totalScore =
    baseScore +
    interestSignal.score +
    locationSignal.score +
    timeSignal.score +
    popularitySignal.score +
    recencyBoost -
    diversityPenalty;

  // Collect all reasons
  reasons.push(
    ...interestSignal.reasons,
    ...locationSignal.reasons,
    ...timeSignal.reasons,
    ...popularitySignal.reasons
  );

  // Calculate confidence (0-1) based on signal strength
  const maxPossibleScore = 200;
  const confidence = Math.min(totalScore / maxPossibleScore, 1);

  return {
    item: event,
    score: Math.max(0, totalScore),
    reasons: reasons.slice(0, 3), // Top 3 reasons
    confidence,
    signals: {
      interestMatch: interestSignal.score,
      locationMatch: locationSignal.score,
      timeMatch: timeSignal.score,
      cuisineMatch: 0, // For events, cuisine doesn't apply
      popularityBoost: popularitySignal.score,
      diversityPenalty,
      recencyBoost,
    },
  };
}

/**
 * Score and rank a list of events
 */
export function scoreAndRankEvents(
  events: Event[],
  preferences: UserPreferences,
  behavioral: BehavioralSignals,
  limit: number = 10
): ScoredRecommendation<Event>[] {
  const context = getTemporalContext();
  const scored: ScoredRecommendation<Event>[] = [];

  for (const event of events) {
    const scoredEvent = scoreEvent(event, preferences, context, behavioral, scored.map(s => s.item));
    scored.push(scoredEvent);
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

/**
 * Get default behavioral signals (when no user history available)
 */
export function getDefaultBehavioralSignals(): BehavioralSignals {
  return {
    favoriteCategories: [],
    favoriteVenues: [],
    recentlyViewed: [],
    previousRSVPs: [],
  };
}
