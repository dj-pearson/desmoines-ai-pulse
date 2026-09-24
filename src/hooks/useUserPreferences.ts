import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { createLogger } from '@/lib/logger';
import {
  UserPreferences,
  defaultPreferences,
  EventCategory,
  DietaryRestriction,
} from '@/types/preferences';
import {
  ANONYMOUS_USER_ID,
  forgetGuestPreferences,
  readLocalPreferences,
  writeLocalPreferences,
} from '@/lib/userPreferencesStore';

const log = createLogger('useUserPreferences');


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

  const existing = (current?.communication_preferences as Json & object) ?? {};

  // The cast is on `prefs`, not on the whole payload, and it is narrow on
  // purpose: UserPreferences is an interface, and an interface has no implicit
  // index signature, so TypeScript will not accept one as `Json` even though
  // every field in it is JSON-safe. Casting the enclosing object instead would
  // also silence a genuinely wrong `existing`.
  const bag: Json = { ...existing, [SERVER_KEY]: prefs as unknown as Json };

  const { error } = await supabase
    .from('profiles')
    .update({ communication_preferences: bag })
    .eq('user_id', userId);

  if (error) {
    log.warn('writeToServer', 'Failed to sync preferences', { error: error.message });
  }
}

/** Query key shared by every instance of the hook, so a save reaches them all. */
export function userPreferencesQueryKey(userId: string | null | undefined) {
  return ['user-preferences', userId || ANONYMOUS_USER_ID] as const;
}

function freshDefaults(userId: string): UserPreferences {
  return { ...defaultPreferences, userId, lastUpdated: new Date().toISOString() };
}

/**
 * Resolve the preferences for `userId` (empty = guest).
 *
 * Local first, always: it is the offline copy and the guest copy. For a
 * signed-in account the server value wins when there is one. When there is
 * none, a local copy is uploaded only if `canAdoptLocal` allowed it into
 * `readLocalPreferences` - that is, it is the guest's own copy or already this
 * account's. A copy written by a different account is never read here, which
 * is what stopped A's interests landing in B's profile.
 */
async function loadPreferences(userId: string | null | undefined): Promise<UserPreferences> {
  const local = readLocalPreferences(userId);

  if (!userId) {
    if (local.prefs) return local.prefs;
    const fresh = freshDefaults(ANONYMOUS_USER_ID);
    writeLocalPreferences(null, fresh);
    return fresh;
  }

  const own = local.source === 'own' ? local.prefs : null;

  const { data, error } = await supabase
    .from('profiles')
    .select('communication_preferences')
    .eq('user_id', userId)
    .single();

  if (error) {
    // Keep the local copy rather than falling back to defaults. A read failure
    // must not look like "this user has no preferences", which is how a sync
    // feature ends up wiping the thing it was added to protect. A guest copy
    // is NOT adopted on this branch: without the server answer there is no way
    // to know the account does not already have its own.
    log.warn('loadPreferences', 'Server read failed; keeping local copy', {
      error: error.message,
    });
    return own ?? freshDefaults(userId);
  }

  const bag = (data?.communication_preferences as Record<string, unknown> | null) ?? {};
  const remote = bag[SERVER_KEY] as Partial<UserPreferences> | undefined;

  if (remote) {
    // Server wins, merged over defaults so a field added since the value was
    // written is present rather than undefined.
    const merged: UserPreferences = { ...defaultPreferences, ...remote, userId };
    writeLocalPreferences(userId, merged);
    return merged;
  }

  if (local.prefs) {
    // AC3: first authenticated load for someone who already had settings on
    // this browser, either as a guest or under this account. Push them up
    // rather than losing them, then take the guest copy out of reach of the
    // next account.
    const adopted: UserPreferences = { ...local.prefs, userId };
    writeLocalPreferences(userId, adopted);
    await writeToServer(userId, adopted);
    if (local.source === 'guest') forgetGuestPreferences();
    return adopted;
  }

  const fresh = freshDefaults(userId);
  writeLocalPreferences(userId, fresh);
  return fresh;
}

/**
 * Hook for managing user preferences across the application.
 *
 * SYNCED for signed-in users, local-only for guests. Local storage (scoped per
 * account, see @/lib/userPreferencesStore) is the immediate store, so a guest
 * keeps working and a signed-in user sees no write latency; the value is
 * mirrored into `profiles.communication_preferences.taste_preferences` so it
 * follows the account to another browser (WEB-QA-015).
 *
 * ONE SHARED QUERY. Every instance reads `['user-preferences', userId]`, so a
 * save in onboarding reaches the For You rail in the same render instead of on
 * the next reload, and four mounted instances make one profiles read, not
 * four. The local copy is `initialData`, so a returning user never sees the
 * defaults flash before their real settings arrive.
 *
 * NO NEW TABLE. The `user_preferences` table the hook originally read has never
 * existed, and `user_preference_profiles` is inferred behavioural data, not
 * user-set settings.
 */
export function useUserPreferences() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const queryKey = userPreferencesQueryKey(userId);
  const [isSaving, setIsSaving] = useState(false);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await loadPreferences(userId);
      } catch (error) {
        log.error('loadPreferences', 'Failed to load preferences', { error: String(error) });
        const local = readLocalPreferences(userId);
        return local.source === 'own' && local.prefs
          ? local.prefs
          : freshDefaults(userId ?? ANONYMOUS_USER_ID);
      }
    },
    initialData: () => {
      const local = readLocalPreferences(userId);
      return local.source === 'own' ? local.prefs ?? undefined : undefined;
    },
    // The local copy is shown at once but is not the last word for an account:
    // marking it as old makes the server read run on mount.
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60 * 1000,
  });

  const preferences = query.data ?? null;

  // Save preferences. Reads the current value from the cache rather than from
  // a render closure, so two quick saves (interests, then food) do not undo
  // each other.
  const savePreferences = useCallback(
    async (updates: Partial<UserPreferences>) => {
      try {
        setIsSaving(true);
        // With a value in the cache, a load still in flight (the mount read,
        // which initialDataUpdatedAt: 0 always starts) would land after this
        // save and put the pre-save server value back, so the next save would
        // build on that and drop this one. Cancel it. With nothing cached yet,
        // wait for that load instead: saving over bare defaults would write
        // them over the account's real preferences on the server.
        const cached = queryClient.getQueryData<UserPreferences>(queryKey);
        if (cached) await queryClient.cancelQueries({ queryKey });
        const loaded =
          cached ??
          (await queryClient
            .fetchQuery({ queryKey, queryFn: () => loadPreferences(userId) })
            .catch(() => undefined));
        const current = loaded ?? freshDefaults(userId ?? ANONYMOUS_USER_ID);

        const updated: UserPreferences = {
          ...current,
          ...updates,
          userId: userId ?? ANONYMOUS_USER_ID,
          lastUpdated: new Date().toISOString(),
        };

        queryClient.setQueryData(queryKey, updated);
        writeLocalPreferences(userId, updated);

        // Then mirror to the account. A failed write leaves the local copy in
        // place and is logged, not thrown: losing a sync is worth far less
        // than blocking a settings change on the network.
        if (userId) await writeToServer(userId, updated);

        return updated;
      } catch (error) {
        log.error('savePreferences', 'Failed to save preferences', { error: String(error) });
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    // queryKey is derived from userId; listing userId covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, userId]
  );

  const currentPrefs = useCallback(
    () => queryClient.getQueryData<UserPreferences>(queryKey) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, userId]
  );

  // Update specific preference sections
  const updateInterests = useCallback(
    (categories: EventCategory[]) => {
      const prefs = currentPrefs();
      if (!prefs) return;
      return savePreferences({ interests: { ...prefs.interests, categories } });
    },
    [currentPrefs, savePreferences]
  );

  const updateInterestTags = useCallback(
    (tags: string[]) => {
      const prefs = currentPrefs();
      if (!prefs) return;
      return savePreferences({ interests: { ...prefs.interests, tags } });
    },
    [currentPrefs, savePreferences]
  );

  const updateCuisine = useCallback(
    (updates: Partial<UserPreferences['cuisine']>) => {
      const prefs = currentPrefs();
      if (!prefs) return;
      return savePreferences({ cuisine: { ...prefs.cuisine, ...updates } });
    },
    [currentPrefs, savePreferences]
  );

  const updateLocation = useCallback(
    (updates: Partial<UserPreferences['location']>) => {
      const prefs = currentPrefs();
      if (!prefs) return;
      return savePreferences({ location: { ...prefs.location, ...updates } });
    },
    [currentPrefs, savePreferences]
  );

  const updateNotifications = useCallback(
    (updates: Partial<UserPreferences['notifications']>) => {
      const prefs = currentPrefs();
      if (!prefs) return;
      return savePreferences({ notifications: { ...prefs.notifications, ...updates } });
    },
    [currentPrefs, savePreferences]
  );

  const completeOnboarding = useCallback(() => {
    return savePreferences({ onboardingCompleted: true });
  }, [savePreferences]);

  // Helper to check if user has specific interest
  const hasInterest = useCallback(
    (category: EventCategory) => preferences?.interests.categories.includes(category) || false,
    [preferences]
  );

  // Helper to check if user has dietary restriction
  const hasDietaryRestriction = useCallback(
    (restriction: DietaryRestriction) => preferences?.cuisine.dietary.includes(restriction) || false,
    [preferences]
  );

  // Reset to defaults
  const resetPreferences = useCallback(async () => {
    const fresh = freshDefaults(userId ?? ANONYMOUS_USER_ID);
    queryClient.setQueryData(userPreferencesQueryKey(userId), fresh);
    writeLocalPreferences(userId, fresh);
    // A reset that only cleared the local copy would come straight back on the
    // next load from the server, which reads as the reset button not working.
    if (userId) await writeToServer(userId, fresh);
  }, [queryClient, userId]);

  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    preferences,
    // Pending only while there is nothing to show; a background refetch over
    // the local copy is not "loading".
    isLoading: query.isPending,
    isSaving,
    savePreferences,
    updateInterests,
    updateInterestTags,
    updateCuisine,
    updateLocation,
    updateNotifications,
    completeOnboarding,
    hasInterest,
    hasDietaryRestriction,
    resetPreferences,
    reload,
  };
}
