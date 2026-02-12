import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createLogger } from '@/lib/logger';

const log = createLogger('useKeyboardShortcuts');

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  description: string;
  action: () => void;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  shortcuts?: KeyboardShortcut[];
  onShowHelp?: () => void;
}

const isInputElement = (element: Element): boolean => {
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    element.getAttribute('contenteditable') === 'true'
  );
};

export function useKeyboardShortcuts({
  enabled = true,
  shortcuts = [],
  onShowHelp,
}: UseKeyboardShortcutsOptions = {}) {
  const navigate = useNavigate();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const target = event.target as Element;
      const isTyping = isInputElement(target);

      // Check for custom shortcuts first
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrlKey ? event.ctrlKey : true;
        const metaMatch = shortcut.metaKey ? event.metaKey : true;
        const shiftMatch = shortcut.shiftKey !== undefined ? event.shiftKey === shortcut.shiftKey : true;
        const altMatch = shortcut.altKey !== undefined ? event.altKey === shortcut.altKey : true;
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

        if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.action();
          return;
        }
      }

      // Global shortcuts (work even when typing in inputs)
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        // Open command palette (future feature)
        log.debug('Command palette shortcut triggered', { action: 'shortcut' });
        return;
      }

      // Shortcuts that should not work when typing
      if (isTyping) return;

      // Show keyboard shortcuts help
      if (event.key === '?' && !event.shiftKey) {
        event.preventDefault();
        onShowHelp?.();
        return;
      }

      // Focus search
      if (event.key === '/') {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[role="searchbox"]'
        );
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Navigation shortcuts
      if (event.key === 'h' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        navigate('/');
        return;
      }

      if (event.key === 'e' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        navigate('/events');
        return;
      }

      if (event.key === 'r' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        navigate('/restaurants');
        return;
      }

      // Escape to close modals/dialogs
      if (event.key === 'Escape') {
        // Let the dialog/modal components handle this
        return;
      }
    },
    [enabled, shortcuts, onShowHelp, navigate]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);

  return null;
}

// Default shortcuts configuration
export const defaultShortcuts: KeyboardShortcut[] = [
  {
    key: '/',
    description: 'Focus search',
    action: () => {
      const searchInput = document.querySelector<HTMLInputElement>(
        'input[type="search"], input[role="searchbox"]'
      );
      searchInput?.focus();
    },
  },
  {
    key: '?',
    description: 'Show keyboard shortcuts',
    action: () => {
      log.debug('Show shortcuts modal', { action: 'shortcut' });
    },
  },
  {
    key: 'h',
    description: 'Go to home',
    action: () => {
      window.location.href = '/';
    },
  },
  {
    key: 'e',
    description: 'Go to events',
    action: () => {
      window.location.href = '/events';
    },
  },
  {
    key: 'r',
    description: 'Go to restaurants',
    action: () => {
      window.location.href = '/restaurants';
    },
  },
  {
    key: 'k',
    ctrlKey: true,
    description: 'Open command palette',
    action: () => {
      log.debug('Command palette (future feature)', { action: 'shortcut' });
    },
  },
  {
    key: 'Escape',
    description: 'Close modal/dialog',
    action: () => {
      // Handled by individual components
    },
    preventDefault: false,
  },
];
