import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { storage } from '@/lib/safeStorage';

const STORAGE_KEY = 'a11y-preferences';

interface AccessibilityPreferences {
  fontSize: number; // -2 to +4 (0 = default)
  highContrast: boolean;
  reducedMotion: boolean;
  dyslexiaFont: boolean;
  highlightLinks: boolean;
  largeCursor: boolean;
  highlightFocus: boolean;
  textSpacing: boolean;
}

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  fontSize: 0,
  highContrast: false,
  reducedMotion: false,
  dyslexiaFont: false,
  highlightLinks: false,
  largeCursor: false,
  highlightFocus: false,
  textSpacing: false,
};

interface AccessibilityContextValue {
  preferences: AccessibilityPreferences;
  setPreference: <K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) => void;
  togglePreference: (key: keyof Omit<AccessibilityPreferences, 'fontSize'>) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetPreferences: () => void;
  hasCustomPreferences: boolean;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

function applyPreferences(prefs: AccessibilityPreferences) {
  const root = document.documentElement;

  // Font size: apply a CSS variable that scales rem
  const scale = 1 + prefs.fontSize * 0.125; // each step = 12.5%
  root.style.setProperty('--a11y-font-scale', String(scale));
  root.classList.toggle('a11y-scaled-text', prefs.fontSize !== 0);

  // Boolean class toggles
  root.classList.toggle('a11y-high-contrast', prefs.highContrast);
  root.classList.toggle('a11y-reduced-motion', prefs.reducedMotion);
  root.classList.toggle('a11y-dyslexia-font', prefs.dyslexiaFont);
  root.classList.toggle('a11y-highlight-links', prefs.highlightLinks);
  root.classList.toggle('a11y-large-cursor', prefs.largeCursor);
  root.classList.toggle('a11y-highlight-focus', prefs.highlightFocus);
  root.classList.toggle('a11y-text-spacing', prefs.textSpacing);
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(() => {
    const saved = storage.get<AccessibilityPreferences>(STORAGE_KEY);
    return saved ? { ...DEFAULT_PREFERENCES, ...saved } : DEFAULT_PREFERENCES;
  });

  // Apply preferences to the DOM whenever they change
  useEffect(() => {
    applyPreferences(preferences);
    storage.set(STORAGE_KEY, preferences);
  }, [preferences]);

  const setPreference = useCallback(<K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }, []);

  const togglePreference = useCallback((key: keyof Omit<AccessibilityPreferences, 'fontSize'>) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const increaseFontSize = useCallback(() => {
    setPreferences(prev => ({
      ...prev,
      fontSize: Math.min(prev.fontSize + 1, 4),
    }));
  }, []);

  const decreaseFontSize = useCallback(() => {
    setPreferences(prev => ({
      ...prev,
      fontSize: Math.max(prev.fontSize - 1, -2),
    }));
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  const hasCustomPreferences = Object.entries(preferences).some(
    ([key, value]) => value !== DEFAULT_PREFERENCES[key as keyof AccessibilityPreferences]
  );

  return (
    <AccessibilityContext.Provider
      value={{
        preferences,
        setPreference,
        togglePreference,
        increaseFontSize,
        decreaseFontSize,
        resetPreferences,
        hasCustomPreferences,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibilityPreferences() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibilityPreferences must be used within an AccessibilityProvider');
  }
  return context;
}
