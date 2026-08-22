import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { storage } from '@/lib/safeStorage';
import { createLogger } from '@/lib/logger';
import {
  UserPreferences,
  defaultPreferences,
  EventCategory,
  DietaryRestriction,
} from '@/types/preferences';

const log = createLogger('useUserPreferences');

const STORAGE_KEY = 'desmoines_user_preferences';

/**
 * Hook for managing user preferences across the application.
 *
 * LOCAL-ONLY. Preferences live in localStorage via @/lib/safeStorage and are
 * not synced anywhere — they do not follow a user to another browser and do
 * not survive clearing site data. See the NOTE in loadPreferences for why, and
 * WEB-QA-015 for restoring real sync.
 *
 * This docstring used to claim it "syncs with localStorage and Supabase (when
 * available)", which contradicted the note twenty lines below it and had been
 * false for every user since the hook was written.
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

      // NOTE: preferences are LOCAL-ONLY, by necessity (WEB-QA-015).
      //
      // This used to read from a `user_preferences` table that does not exist in
      // the schema and never has. Every call failed, the failure was swallowed as
      // non-critical, and the localStorage path below silently did all the real
      // work — so preferences have never synced across devices or survived
      // clearing site data, for any user.
      //
      // The dead call is removed rather than left in place: it produced a
      // guaranteed error on every load and made the strict type-check
      // unresolvable (the unknown table name forced Supabase to consider all 245
      // table overloads, giving TS2589 "excessively deep"). Restoring real sync
      // needs a table and a shape decision — tracked as WEB-QA-015.

      // Load from safeStorage
      const stored = storage.get<UserPreferences>(STORAGE_KEY);
      if (stored) {
        setPreferences(stored);
      } else {
        // Create default preferences for new users
        const newPreferences: UserPreferences = {
          ...defaultPreferences,
          userId: user?.id || 'anonymous',
        };
        setPreferences(newPreferences);
        storage.set(STORAGE_KEY, newPreferences);
      }
    } catch (error) {
      log.error('loadPreferences', 'Failed to load preferences', { error: String(error) });
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

        // Save to safeStorage immediately
        storage.set(STORAGE_KEY, updated);

        // No remote write: there is no `user_preferences` table. See the note in
        // loadPreferences and WEB-QA-015.

        return updated;
      } catch (error) {
        log.error('savePreferences', 'Failed to save preferences', { error: String(error) });
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
    (updates: Partial<UserPreferences['cuisine']>) => {
      if (!preferences) return;
      return savePreferences({
        cuisine: { ...preferences.cuisine, ...updates },
      });
    },
    [preferences, savePreferences]
  );

  const updateLocation = useCallback(
    (updates: Partial<UserPreferences['location']>) => {
      if (!preferences) return;
      return savePreferences({
        location: { ...preferences.location, ...updates },
      });
    },
    [preferences, savePreferences]
  );

  const updateNotifications = useCallback(
    (updates: Partial<UserPreferences['notifications']>) => {
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
    storage.set(STORAGE_KEY, newPreferences);
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
