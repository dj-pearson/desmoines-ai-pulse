import { useEffect } from 'react';
import type { RefObject } from 'react';

interface FilterKeyboardShortcutsOptions {
  enabled?: boolean;
  onFocusSearch?: () => void;
  onOpenCategory?: () => void;
  onOpenDate?: () => void;
  /**
   * The page's search input. Esc typed there clears the search text (and
   * nothing else) through `onClearSearch`.
   */
  searchInputRef?: RefObject<HTMLInputElement>;
  /** Clear only the search query (`q`). */
  onClearSearch?: () => void;
  /**
   * @deprecated Ignored. Esc used to clear every filter, so closing a popover,
   * the sort menu or the Save dialog with Esc also wiped category, price and
   * date (docs/page-plans/events.md WP2 item 2). Kept only so a caller that
   * still passes it compiles; stop passing it.
   */
  onClearFilters?: () => void;
}

/**
 * Is a Radix layer (popover, select, menu, dialog, sheet) open? Radix closes
 * its layer on Esc in a capture-phase document listener, but React has not
 * re-rendered by the time the event bubbles to window, so the layer is still
 * in the DOM here. That is what lets this hook stand back from an Esc that
 * belonged to the layer.
 */
function radixLayerOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(
    document.querySelector(
      '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]'
    )
  );
}

/**
 * Keyboard shortcuts for list-page filters: f focuses search, c and d open the
 * category and date controls, Esc in the search box clears the search.
 *
 * Esc never clears filters. The autocomplete calls preventDefault when its Esc
 * closes the suggestion list, so the first Esc closes suggestions and only a
 * second one clears the text.
 */
export function useFilterKeyboardShortcuts({
  enabled = true,
  onFocusSearch,
  onOpenCategory,
  onOpenDate,
  searchInputRef,
  onClearSearch,
}: FilterKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (e.key === 'Escape') {
        if (radixLayerOpen()) return;
        const search = searchInputRef?.current;
        if (search && target === search && onClearSearch && search.value) {
          e.preventDefault();
          onClearSearch();
        }
        return;
      }

      // Don't trigger shortcuts when typing in input fields
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't trigger when focus is on a button, link, or inside a dialog.
      // Prevents accidental filter activation when clicking buttons.
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button, a[href], [role="button"], [role="menuitem"], [role="dialog"]')
      ) {
        return;
      }

      const isMod = e.ctrlKey || e.metaKey || e.altKey;
      if (isMod) return;

      switch (e.key.toLowerCase()) {
        case 'f':
          // Plain f; Ctrl/Cmd + F stays the browser's find.
          if (onFocusSearch) {
            e.preventDefault();
            onFocusSearch();
          }
          break;

        case 'c':
          if (onOpenCategory) {
            e.preventDefault();
            onOpenCategory();
          }
          break;

        case 'd':
          if (onOpenDate) {
            e.preventDefault();
            onOpenDate();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onFocusSearch, onOpenCategory, onOpenDate, searchInputRef, onClearSearch]);
}
