import { useEffect } from 'react';

interface FilterKeyboardShortcutsOptions {
  enabled?: boolean;
  onFocusSearch?: () => void;
  onOpenCategory?: () => void;
  onOpenDate?: () => void;
  onClearFilters?: () => void;
}

/**
 * Custom hook for filter keyboard shortcuts
 * Provides keyboard navigation for filter panels
 */
export function useFilterKeyboardShortcuts({
  enabled = true,
  onFocusSearch,
  onOpenCategory,
  onOpenDate,
  onClearFilters,
}: FilterKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Escape to work even in input fields
        if (e.key !== 'Escape') {
          return;
        }
      }

      // Check for modifier keys
      const isMod = e.ctrlKey || e.metaKey;

      switch (e.key.toLowerCase()) {
        case 'f':
          // Focus search (Ctrl/Cmd + F is reserved for browser find)
          if (!isMod && onFocusSearch) {
            e.preventDefault();
            onFocusSearch();
          }
          break;

        case 'c':
          // Open category filter
          if (!isMod && onOpenCategory) {
            e.preventDefault();
            onOpenCategory();
          }
          break;

        case 'd':
          // Open date filter
          if (!isMod && onOpenDate) {
            e.preventDefault();
            onOpenDate();
          }
          break;

        case 'escape':
          // Clear filters or close modals
          if (onClearFilters) {
            e.preventDefault();
            onClearFilters();
          }
          break;

        case '?':
          // Show keyboard shortcuts help (implement in parent)
          if (!isMod) {
            e.preventDefault();
            // This can be handled by the parent component to show a help modal
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onFocusSearch, onOpenCategory, onOpenDate, onClearFilters]);
}
