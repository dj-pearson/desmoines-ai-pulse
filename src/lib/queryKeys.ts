/**
 * Centralized query key factory and cache tier configuration for TanStack Query.
 *
 * Usage:
 *   import { queryKeys, CACHE_TIERS } from '@/lib/queryKeys';
 *
 *   useQuery({
 *     queryKey: queryKeys.events.list({ category: 'Music' }),
 *     queryFn: () => fetchEvents({ category: 'Music' }),
 *     ...CACHE_TIERS.standard,
 *   });
 */

// ── Cache Tiers ──────────────────────────────────────────────────────────────

/** Predefined staleTime / gcTime combos for different data freshness needs */
export const CACHE_TIERS = {
  /** Rarely changes — config, static content (10 min stale, 30 min gc) */
  static: { staleTime: 10 * 60 * 1000, gcTime: 30 * 60 * 1000 },

  /** Standard content — events, restaurants, attractions (2 min stale, 10 min gc) */
  standard: { staleTime: 2 * 60 * 1000, gcTime: 10 * 60 * 1000 },

  /** Frequently updated — social data, votes, checkins (30 s stale, 5 min gc) */
  frequent: { staleTime: 30 * 1000, gcTime: 5 * 60 * 1000 },

  /** Real-time-ish — admin dashboards, analytics (15 s stale, 2 min gc) */
  realtime: { staleTime: 15 * 1000, gcTime: 2 * 60 * 1000 },
} as const;

// ── Query Key Factory ────────────────────────────────────────────────────────

export const queryKeys = {
  events: {
    all: ['events'] as const,
    lists: () => [...queryKeys.events.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.events.lists(), filters] as const,
    details: () => [...queryKeys.events.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.events.details(), id] as const,
    social: (id: string) => [...queryKeys.events.all, 'social', id] as const,
  },

  restaurants: {
    all: ['restaurants'] as const,
    lists: () => [...queryKeys.restaurants.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.restaurants.lists(), filters] as const,
    details: () => [...queryKeys.restaurants.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.restaurants.details(), id] as const,
  },

  attractions: {
    all: ['attractions'] as const,
    lists: () => [...queryKeys.attractions.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.attractions.lists(), filters] as const,
    details: () => [...queryKeys.attractions.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.attractions.details(), id] as const,
  },

  playgrounds: {
    all: ['playgrounds'] as const,
    lists: () => [...queryKeys.playgrounds.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.playgrounds.lists(), filters] as const,
    details: () => [...queryKeys.playgrounds.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.playgrounds.details(), id] as const,
  },

  hotels: {
    all: ['hotels'] as const,
    lists: () => [...queryKeys.hotels.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.hotels.lists(), filters] as const,
    details: () => [...queryKeys.hotels.all, 'detail'] as const,
    detail: (slug: string) => [...queryKeys.hotels.details(), slug] as const,
  },

  articles: {
    all: ['articles'] as const,
    lists: () => [...queryKeys.articles.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.articles.lists(), filters] as const,
    details: () => [...queryKeys.articles.all, 'detail'] as const,
    detail: (slug: string) => [...queryKeys.articles.details(), slug] as const,
  },

  favorites: {
    all: ['favorites'] as const,
    list: (userId?: string) => [...queryKeys.favorites.all, userId] as const,
  },

  ratings: {
    all: ['ratings'] as const,
    list: (entityId: string) => [...queryKeys.ratings.all, entityId] as const,
    user: (userId: string, entityId: string) => [...queryKeys.ratings.all, 'user', userId, entityId] as const,
  },

  search: {
    all: ['search'] as const,
    results: (query: string, filters?: Record<string, unknown>) => [...queryKeys.search.all, query, filters] as const,
  },

  admin: {
    all: ['admin'] as const,
    analytics: () => [...queryKeys.admin.all, 'analytics'] as const,
    campaigns: () => [...queryKeys.admin.all, 'campaigns'] as const,
    auditLog: () => [...queryKeys.admin.all, 'audit-log'] as const,
  },

  user: {
    all: ['user'] as const,
    profile: (userId: string) => [...queryKeys.user.all, 'profile', userId] as const,
    preferences: (userId: string) => [...queryKeys.user.all, 'preferences', userId] as const,
    subscription: (userId: string) => [...queryKeys.user.all, 'subscription', userId] as const,
  },
} as const;
