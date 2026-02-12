import { useState, useEffect, useCallback } from 'react';
import { Event } from '@/lib/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('useRecentlyViewed');

interface RecentlyViewedItem {
  id: string;
  title: string;
  image_url?: string;
  category: string;
  date: string;
  venue?: string;
  location: string;
  viewedAt: number;
}

const STORAGE_KEY = 'desmoines_recently_viewed';
const MAX_ITEMS = 10;

export function useRecentlyViewed() {
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const items: RecentlyViewedItem[] = JSON.parse(stored);
        // Sort by most recent first
        const sorted = items.sort((a, b) => b.viewedAt - a.viewedAt);
        setRecentlyViewed(sorted);
      }
    } catch (error) {
      log.error('Failed to load recently viewed items', { action: 'loadFromStorage', metadata: { error } });
    }
  }, []);

  // Add an event to recently viewed
  const addToRecentlyViewed = useCallback((event: Event) => {
    try {
      const newItem: RecentlyViewedItem = {
        id: event.id,
        title: event.title,
        image_url: event.image_url,
        category: event.category,
        date: event.date,
        venue: event.venue,
        location: event.location,
        viewedAt: Date.now(),
      };

      setRecentlyViewed((prev) => {
        // Remove if already exists (to update timestamp)
        const filtered = prev.filter((item) => item.id !== event.id);

        // Add to front and limit to MAX_ITEMS
        const updated = [newItem, ...filtered].slice(0, MAX_ITEMS);

        // Save to localStorage
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
          log.error('Failed to save recently viewed', { action: 'addToRecentlyViewed', metadata: { error } });
        }

        return updated;
      });
    } catch (error) {
      log.error('Failed to add to recently viewed', { action: 'addToRecentlyViewed', metadata: { error } });
    }
  }, []);

  // Clear all recently viewed items
  const clearRecentlyViewed = useCallback(() => {
    setRecentlyViewed([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      log.error('Failed to clear recently viewed', { action: 'clearRecentlyViewed', metadata: { error } });
    }
  }, []);

  // Remove a specific item
  const removeFromRecentlyViewed = useCallback((id: string) => {
    setRecentlyViewed((prev) => {
      const filtered = prev.filter((item) => item.id !== id);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      } catch (error) {
        log.error('Failed to update recently viewed', { action: 'removeFromRecentlyViewed', metadata: { error } });
      }

      return filtered;
    });
  }, []);

  return {
    recentlyViewed,
    addToRecentlyViewed,
    clearRecentlyViewed,
    removeFromRecentlyViewed,
  };
}

// Hook for restaurants
interface RecentlyViewedRestaurant {
  id: string;
  name: string;
  image_url?: string;
  cuisine: string;
  location: string;
  rating?: number;
  viewedAt: number;
}

const RESTAURANT_STORAGE_KEY = 'desmoines_recently_viewed_restaurants';

export function useRecentlyViewedRestaurants() {
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedRestaurant[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RESTAURANT_STORAGE_KEY);
      if (stored) {
        const items: RecentlyViewedRestaurant[] = JSON.parse(stored);
        const sorted = items.sort((a, b) => b.viewedAt - a.viewedAt);
        setRecentlyViewed(sorted);
      }
    } catch (error) {
      log.error('Failed to load recently viewed restaurants', { action: 'loadFromStorage', metadata: { error } });
    }
  }, []);

  const addToRecentlyViewed = useCallback((restaurant: any) => {
    try {
      const newItem: RecentlyViewedRestaurant = {
        id: restaurant.id,
        name: restaurant.name,
        image_url: restaurant.image_url,
        cuisine: restaurant.cuisine || restaurant.cuisine_type,
        location: restaurant.location || restaurant.address,
        rating: restaurant.rating,
        viewedAt: Date.now(),
      };

      setRecentlyViewed((prev) => {
        const filtered = prev.filter((item) => item.id !== restaurant.id);
        const updated = [newItem, ...filtered].slice(0, MAX_ITEMS);

        try {
          localStorage.setItem(RESTAURANT_STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
          log.error('Failed to save recently viewed restaurants', { action: 'addToRecentlyViewed', metadata: { error } });
        }

        return updated;
      });
    } catch (error) {
      log.error('Failed to add restaurant to recently viewed', { action: 'addToRecentlyViewed', metadata: { error } });
    }
  }, []);

  const clearRecentlyViewed = useCallback(() => {
    setRecentlyViewed([]);
    try {
      localStorage.removeItem(RESTAURANT_STORAGE_KEY);
    } catch (error) {
      log.error('Failed to clear recently viewed restaurants', { action: 'clearRecentlyViewed', metadata: { error } });
    }
  }, []);

  return {
    recentlyViewed,
    addToRecentlyViewed,
    clearRecentlyViewed,
  };
}
