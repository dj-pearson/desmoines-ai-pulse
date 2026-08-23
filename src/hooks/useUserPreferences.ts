import { useState, useEffect, useCallback, useRef } from 'react';
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
 * The JSONB sub-key inside `profiles.communication_preferences` that carries
 * these preferences.
 *
 * DELIBERATELY NOT `ui_preferences`, which src/hooks/use-user-preferences.ts
 * already owns in the same column. Two hooks with the same name and different
 * shapes writing one key would silently overwrite each other; separate keys
 * plus the read-before-write merge below keeps both intact (WEB-QA-015).
 */
const SERVER_KEY = 'taste_preferences';

/**
 * Writes `prefs` into the account's JSONB bag under SERVER_KEY.
 *
 * Reads the current bag first and spreads it, so the sibling key
 * use-user-preferences.ts owns survives this update. Never throws: a sync
 * failure must not block a settings change the user already sees applied.
 */
async function writeToServer(userId: string, prefs: UserPreferences): Promise<void> {
  const { data: current, error: readError } = await supabase
    .from('profiles')
    .select('communication_preferences')
    .eq('user_id', userId)
    .single();

  if (readError) {
    // Writing without the read would drop every other key in the bag, so a
    // failed read has to abort the write rather than proceed with {}.
    log.warn('writeToServer', 'Skipped sync: could not read current preferences', {
      error: readError.message,
    });
    return;
  }

  const existing = (current?.communication_preferences as Record<string, unknown>) ?? {};

  const { error } = await supabase
    .from('profiles')
    .update({ communication_preferences: { ...existing, [SERVER_KEY]: prefs } })
    .eq('user_id', userId);

  if (error) {
    log.warn('writeToServer', 'Failed to sync preferences', { error: error.message });
  }
}

/**
 * Hook for managing user preferences across the application.
 *
 * SYNCED for signed-in users, local-only for guests. localStorage via
 * @/lib/safeStorage remains the immediate store, so a guest keeps working and
 * a signed-in user sees no write latency; the value is mirrored into
 * `profiles.communication_preferences.taste_preferences` so it follows the
 * account to another browser and survives clearing site data (WEB-QA-015).
 *
 * NO NEW TABLE. The story asked to decide a storage shape and add a table for
 * it; the shape was already decided and working in this repo on an existing
 * JSONB column, so this converges onto it rather than adding a second answer.
 * The `user_preferences` table the hook originally read has never existed, and
 * `user_preference_profiles` is inferred behavioural data - session counts and
 * confidence scores - not user-set settings.
 */
export function useUserPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  /// The signed-in user whose server value has already been merged in, so a
  /// re-render does not re-fetch and a sign-out followed by a different
  /// sign-in does.
  const loadedForUser = useRef<string | null>(null);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);

      // Local first, always. It is the offline copy and the guest copy, and
      // reading it before the network means a signed-in user never sees the
      // defaults flash before their real settings arrive.
      const stored = storage.get<UserPreferences>(STORAGE_KEY);
      const local: UserPreferences = stored ?? {
        ...defaultPreferences,
        userId: user?.id || 'anonymous',
      };
      setPreferences(local);
      if (!stored) storage.set(STORAGE_KEY, local);

      if (!user?.id) {
        loadedForUser.current = null;
        return;
      }
      if (loadedForUser.current === user.id) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('communication_preferences')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // Keep the local copy rather than falling back to defaults. A read
        // failure must not look like "this user has no preferences", which is
        // how a sync feature ends up wiping the thing it was added to protect.
        log.warn('loadPreferences', 'Server read failed; keeping local copy', {
          error: error.message,
        });
        return;
      }

      const bag = (data?.communication_preferences as Record<string, unknown> | null) ?? {};
      const remote = bag[SERVER_KEY] as Partial<UserPreferences> | undefined;

      if (remote) {
        // Server wins, merged over defaults so a field added since the value
        // was written is present rather than undefined.
        const merged: UserPreferences = { ...defaultPreferences, ...remote, userId: user.id };
        setPreferences(merged);
        storage.set(STORAGE_KEY, merged);
      } else if (stored) {
        // AC3: first authenticated load for someone who already had local
        // settings. Push them up rather than losing them.
        await writeToServer(user.id, { ...local, userId: user.id });
      }

      loadedForUser.current = user.id;
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

        // Then mirror to the account. A failed write leaves the local copy in
        // place and is logged, not thrown: losing a sync is worth far less
        // than blocking a settings change on the network.
        if (user?.id) await writeToServer(user.id, updated);

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
  const resetPreferences = useCallback(async () => {
    const newPreferences: UserPreferences = {
      ...defaultPreferences,
      userId: user?.id || 'anonymous',
    };
    setPreferences(newPreferences);
    storage.set(STORAGE_KEY, newPreferences);
    // A reset that only cleared the local copy would come straight back on the
    // next load from the server, which reads as the reset button not working.
    if (user?.id) await writeToServer(user.id, newPreferences);
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
