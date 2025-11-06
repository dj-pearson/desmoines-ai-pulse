import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
      console.error('Failed to load preferences:', error);
    }
    return DEFAULT_PREFERENCES;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load preferences from server if authenticated
  useEffect(() => {
    const loadServerPreferences = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        setIsLoading(true);
        const { data, error } = await supabase
          .from('user_profiles')
          .select('preferences')
          .eq('id', user.id)
          .single();

        if (error) {
          if (error.code !== 'PGRST116') { // Not found error is ok
            console.error('Failed to load server preferences:', error);
          }
          return;
        }

        if (data?.preferences) {
          const serverPrefs = { ...DEFAULT_PREFERENCES, ...data.preferences };
          setPreferences(serverPrefs);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(serverPrefs));
        }
      } catch (error) {
        console.error('Error loading server preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadServerPreferences();
  }, []);

  // Save preferences to localStorage
  const saveToLocalStorage = useCallback((newPrefs: UserPreferences) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));
    } catch (error) {
      console.error('Failed to save preferences to localStorage:', error);
    }
  }, []);

  // Sync preferences to server if authenticated
  const syncToServer = useCallback(async (newPrefs: UserPreferences) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setIsSyncing(true);
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          preferences: newPrefs,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Failed to sync preferences to server:', error);
      }
    } catch (error) {
      console.error('Error syncing preferences:', error);
    } finally {
      setIsSyncing(false);
    }
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
