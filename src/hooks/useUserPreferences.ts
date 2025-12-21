import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  UserPreferences,
  defaultPreferences,
  EventCategory,
  DietaryRestriction,
} from '@/types/preferences';

const STORAGE_KEY = 'desmoines_user_preferences';

/**
 * Hook for managing user preferences across the application
 * Syncs with localStorage and Supabase (when available)
 */
export function useUserPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);

      // Try to load from Supabase if user is authenticated
      if (user) {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (data && !error) {
          setPreferences(data as UserPreferences);
          // Also save to localStorage as backup
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          setIsLoading(false);
          return;
        }
      }

      // Fallback to localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setPreferences(parsed);
      } else {
        // Create default preferences for new users
        const newPreferences: UserPreferences = {
          ...defaultPreferences,
          userId: user?.id || 'anonymous',
        };
        setPreferences(newPreferences);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences));
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
      // Use defaults on error
      const newPreferences: UserPreferences = {
        ...defaultPreferences,
        userId: user?.id || 'anonymous',
      };
      setPreferences(newPreferences);
    } finally {
      setIsLoading(false);
    }
  };

  // Save preferences
  const savePreferences = useCallback(
    async (updates: Partial<UserPreferences>) => {
      try {
        setIsSaving(true);

        const updated: UserPreferences = {
          ...preferences!,
          ...updates,
          lastUpdated: new Date().toISOString(),
        };

        setPreferences(updated);

        // Save to localStorage immediately
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

        // Try to save to Supabase if authenticated
        if (user) {
          const { error } = await supabase.from('user_preferences').upsert({
            user_id: user.id,
            ...updated,
          });

          if (error) {
            console.debug('Could not sync preferences to Supabase:', error);
            // Not critical - localStorage backup exists
          }
        }

        return updated;
      } catch (error) {
        console.error('Failed to save preferences:', error);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [preferences, user]
  );

  // Update specific preference sections
  const updateInterests = useCallback(
    (categories: EventCategory[]) => {
      if (!preferences) return;
      return savePreferences({
        interests: { ...preferences.interests, categories },
      });
    },
    [preferences, savePreferences]
  );

  const updateCuisine = useCallback(
    (updates: Partial<typeof preferences.cuisine>) => {
      if (!preferences) return;
      return savePreferences({
        cuisine: { ...preferences.cuisine, ...updates },
      });
    },
    [preferences, savePreferences]
  );

  const updateLocation = useCallback(
    (updates: Partial<typeof preferences.location>) => {
      if (!preferences) return;
      return savePreferences({
        location: { ...preferences.location, ...updates },
      });
    },
    [preferences, savePreferences]
  );

  const updateNotifications = useCallback(
    (updates: Partial<typeof preferences.notifications>) => {
      if (!preferences) return;
      return savePreferences({
        notifications: { ...preferences.notifications, ...updates },
      });
    },
    [preferences, savePreferences]
  );

  const completeOnboarding = useCallback(() => {
    return savePreferences({ onboardingCompleted: true });
  }, [savePreferences]);

  // Helper to check if user has specific interest
  const hasInterest = useCallback(
    (category: EventCategory) => {
      return preferences?.interests.categories.includes(category) || false;
    },
    [preferences]
  );

  // Helper to check if user has dietary restriction
  const hasDietaryRestriction = useCallback(
    (restriction: DietaryRestriction) => {
      return preferences?.cuisine.dietary.includes(restriction) || false;
    },
    [preferences]
  );

  // Reset to defaults
  const resetPreferences = useCallback(() => {
    const newPreferences: UserPreferences = {
      ...defaultPreferences,
      userId: user?.id || 'anonymous',
    };
    setPreferences(newPreferences);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newPreferences));
  }, [user]);

  return {
    preferences,
    isLoading,
    isSaving,
    savePreferences,
    updateInterests,
    updateCuisine,
    updateLocation,
    updateNotifications,
    completeOnboarding,
    hasInterest,
    hasDietaryRestriction,
    resetPreferences,
    reload: loadPreferences,
  };
}
