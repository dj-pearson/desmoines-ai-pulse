import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';

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
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    // Load from localStorage on initialization
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_PREFERENCES, ...parsed };
      }
    } catch (error) {
      log.error('init', 'Failed to load preferences', { error });
    }
    return DEFAULT_PREFERENCES;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load preferences from server if authenticated
  // TODO: Implement server-side preferences storage once user_profiles table is created
  useEffect(() => {
    setIsLoading(false);
  }, []);

  // Save preferences to localStorage
  const saveToLocalStorage = useCallback((newPrefs: UserPreferences) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));
    } catch (error) {
      log.error('saveToLocalStorage', 'Failed to save preferences to localStorage', { error });
    }
  }, []);

  // Sync preferences to server if authenticated
  // TODO: Implement server-side preferences storage once user_profiles table is created
  const syncToServer = useCallback(async (newPrefs: UserPreferences) => {
    // Placeholder for future server sync
    setIsSyncing(false);
  }, []);

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
