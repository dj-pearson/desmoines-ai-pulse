import { useState, useEffect, useCallback } from 'react';
import { Event } from '@/lib/types';
import { storage } from '@/lib/safeStorage';
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

  // Load from storage on mount
  useEffect(() => {
    const items = storage.get<RecentlyViewedItem[]>(STORAGE_KEY);
    if (items) {
      const sorted = items.sort((a, b) => b.viewedAt - a.viewedAt);
      setRecentlyViewed(sorted);
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

        storage.set(STORAGE_KEY, updated);

        return updated;
      });
    } catch (error) {
      log.error('addToRecentlyViewed', 'Failed to add to recently viewed', { error: String(error) });
    }
  }, []);

  // Clear all recently viewed items
  const clearRecentlyViewed = useCallback(() => {
    setRecentlyViewed([]);
    storage.remove(STORAGE_KEY);
  }, []);

  // Remove a specific item
  const removeFromRecentlyViewed = useCallback((id: string) => {
    setRecentlyViewed((prev) => {
      const filtered = prev.filter((item) => item.id !== id);
      storage.set(STORAGE_KEY, filtered);
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
    const items = storage.get<RecentlyViewedRestaurant[]>(RESTAURANT_STORAGE_KEY);
    if (items) {
      const sorted = items.sort((a, b) => b.viewedAt - a.viewedAt);
      setRecentlyViewed(sorted);
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

        storage.set(RESTAURANT_STORAGE_KEY, updated);

        return updated;
      });
    } catch (error) {
      log.error('addToRecentlyViewed', 'Failed to add restaurant to recently viewed', { error: String(error) });
    }
  }, []);

  const clearRecentlyViewed = useCallback(() => {
    setRecentlyViewed([]);
    storage.remove(RESTAURANT_STORAGE_KEY);
  }, []);

  return {
    recentlyViewed,
    addToRecentlyViewed,
    clearRecentlyViewed,
  };
}
