import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';
import { storage } from '@/lib/safeStorage';

const log = createLogger('useUserPreferences');

export interface UserPreferences {
  // Display preferences
  defaultViewMode: 'list' | 'grid' | 'map';
  itemsPerPage: number;
  compactMode: boolean;

  // Notification preferences
  emailNotifications: boolean;
  pushNotifications: boolean;

  // Filter defaults
  defaultLocation: string;
  defaultCategory: string;
  defaultSortOrder: string;

  // Theme
  theme: 'light' | 'dark' | 'system';

  // Accessibility
  reducedMotion: boolean;
  fontSize: 'small' | 'medium' | 'large';

  // Privacy
  analyticsEnabled: boolean;

  // Feature flags
  onboardingCompleted: boolean;
  welcomeSeen: boolean;
  tourCompleted: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  defaultViewMode: 'list',
  itemsPerPage: 12,
  compactMode: false,
  emailNotifications: true,
  pushNotifications: false,
  defaultLocation: 'any-location',
  defaultCategory: 'all',
  defaultSortOrder: 'date',
  theme: 'system',
  reducedMotion: false,
  fontSize: 'medium',
  analyticsEnabled: true,
  onboardingCompleted: false,
  welcomeSeen: false,
  tourCompleted: false,
};

const STORAGE_KEY = 'dmi-user-preferences';

export function useUserPreferences() {
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    const stored = storage.get<Partial<UserPreferences>>(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...stored };
    }
    return DEFAULT_PREFERENCES;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const hasLoadedFromServer = useRef(false);

  // Load preferences from server on login
  useEffect(() => {
    if (!isAuthenticated || !user?.id || hasLoadedFromServer.current) return;

    const loadFromServer = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('communication_preferences')
          .eq('user_id', user.id)
          .single();

        if (error) {
          log.warn('loadFromServer', 'Failed to load server preferences', { error: error.message });
          setIsLoading(false);
          return;
        }

        const serverPrefs = data?.communication_preferences as Record<string, unknown> | null;
        if (serverPrefs?.ui_preferences) {
          // Server wins on conflict — merge with defaults for any missing keys
          const merged = {
            ...DEFAULT_PREFERENCES,
            ...serverPrefs.ui_preferences as Partial<UserPreferences>,
          };
          setPreferences(merged);
          storage.set(STORAGE_KEY, merged);
          log.info('loadFromServer', 'Loaded preferences from server');
        }
        hasLoadedFromServer.current = true;
      } catch (err) {
        log.error('loadFromServer', 'Unexpected error loading preferences', { err });
      } finally {
        setIsLoading(false);
      }
    };

    loadFromServer();
  }, [isAuthenticated, user?.id]);

  // Reset server-loaded flag on logout
  useEffect(() => {
    if (!isAuthenticated) {
      hasLoadedFromServer.current = false;
    }
  }, [isAuthenticated]);

  // Save preferences to safeStorage
  const saveToLocalStorage = useCallback((newPrefs: UserPreferences) => {
    storage.set(STORAGE_KEY, newPrefs);
  }, []);

  // Sync preferences to server if authenticated
  const syncToServer = useCallback(async (newPrefs: UserPreferences) => {
    if (!isAuthenticated || !user?.id) {
      setIsSyncing(false);
      return;
    }

    setIsSyncing(true);
    try {
      // Read current communication_preferences to preserve other fields
      const { data: current } = await supabase
        .from('profiles')
        .select('communication_preferences')
        .eq('user_id', user.id)
        .single();

      const existing = (current?.communication_preferences as Record<string, unknown>) || {};

      const { error } = await supabase
        .from('profiles')
        .update({
          communication_preferences: {
            ...existing,
            ui_preferences: newPrefs,
          },
        })
        .eq('user_id', user.id);

      if (error) {
        log.warn('syncToServer', 'Failed to sync preferences', { error: error.message });
      } else {
        log.info('syncToServer', 'Preferences synced to server');
      }
    } catch (err) {
      log.error('syncToServer', 'Unexpected error syncing preferences', { err });
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated, user?.id]);

  // Update preferences
  const updatePreferences = useCallback(
    async (updates: Partial<UserPreferences>) => {
      const newPrefs = { ...preferences, ...updates };
      setPreferences(newPrefs);
      saveToLocalStorage(newPrefs);

      // Debounced sync to server (don't await to keep UI responsive)
      setTimeout(() => {
        syncToServer(newPrefs);
      }, 1000);
    },
    [preferences, saveToLocalStorage, syncToServer]
  );

  // Reset to defaults
  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
    saveToLocalStorage(DEFAULT_PREFERENCES);
    syncToServer(DEFAULT_PREFERENCES);
    toast({
      title: 'Preferences Reset',
      description: 'All preferences have been reset to defaults',
    });
  }, [saveToLocalStorage, syncToServer, toast]);

  // Export preferences as JSON
  const exportPreferences = useCallback(() => {
    const dataStr = JSON.stringify(preferences, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'desmoines-insider-preferences.json';
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Preferences Exported',
      description: 'Your preferences have been downloaded',
    });
  }, [preferences, toast]);

  // Import preferences from JSON
  const importPreferences = useCallback((jsonString: string) => {
    try {
      const imported = JSON.parse(jsonString);
      const newPrefs = { ...DEFAULT_PREFERENCES, ...imported };
      setPreferences(newPrefs);
      saveToLocalStorage(newPrefs);
      syncToServer(newPrefs);
      toast({
        title: 'Preferences Imported',
        description: 'Your preferences have been restored',
      });
    } catch (error) {
      toast({
        title: 'Import Failed',
        description: 'Invalid preferences file',
        variant: 'destructive',
      });
    }
  }, [saveToLocalStorage, syncToServer, toast]);

  return {
    preferences,
    updatePreferences,
    resetPreferences,
    exportPreferences,
    importPreferences,
    isLoading,
    isSyncing,
  };
}
