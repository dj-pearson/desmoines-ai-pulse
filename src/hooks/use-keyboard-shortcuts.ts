import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createLogger } from "@/lib/logger";

const log = createLogger("useKeyboardShortcuts");

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
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    element.getAttribute("contenteditable") === "true"
  );
};

/** True when focus is on an interactive control (button, link, etc.) - shortcuts should not fire */
const isInteractiveElement = (element: Element): boolean => {
  if (isInputElement(element)) return true;
  const tagName = element.tagName.toLowerCase();
  if (tagName === "button" || tagName === "a") return true;
  const role = element.getAttribute("role");
  const interactiveRoles = ["button", "link", "menuitem", "option", "combobox", "listbox", "tab", "gridcell", "searchbox", "textbox"];
  if (role && interactiveRoles.includes(role)) return true;
  if (element.closest("button, a[href], [role='button'], [role='menuitem']")) return true;
  if (element.closest("[role='dialog']")) return true;
  return false;
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
        const shiftMatch =
          shortcut.shiftKey !== undefined
            ? event.shiftKey === shortcut.shiftKey
            : true;
        const altMatch =
          shortcut.altKey !== undefined
            ? event.altKey === shortcut.altKey
            : true;
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
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        // Open command palette (future feature)
        log.debug("handleKeyDown", "Command palette shortcut triggered");
        return;
      }

      // Shortcuts that should not work when typing in inputs
      if (isTyping) return;

      // Don't trigger when focus is on a button, link, or inside a dialog - prevents
      // accidental navigation when clicking filters, searching, or using modals
      if (isInteractiveElement(target)) return;

      // Show keyboard shortcuts help (? works from anywhere except when typing)
      if (event.key === "?" && !event.shiftKey) {
        event.preventDefault();
        onShowHelp?.();
        return;
      }

      // Focus search (only when not in an interactive control)
      if (event.key === "/") {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[role="searchbox"]',
        );
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Navigation shortcuts: require Alt to prevent accidental triggers when typing
      // (e.g. typing "restaurant" or "home" no longer navigates away)
      if (event.altKey && event.key === "h" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        navigate("/");
        return;
      }

      if (event.altKey && event.key === "e" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        navigate("/events");
        return;
      }

      if (event.altKey && event.key === "r" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        navigate("/restaurants");
        return;
      }

      // Escape to close modals/dialogs
      if (event.key === "Escape") {
        // Let the dialog/modal components handle this
        return;
      }
    },
    [enabled, shortcuts, onShowHelp, navigate],
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  return null;
}

// Default shortcuts configuration
export const defaultShortcuts: KeyboardShortcut[] = [
  {
    key: "/",
    description: "Focus search",
    action: () => {
      const searchInput = document.querySelector<HTMLInputElement>(
        'input[type="search"], input[role="searchbox"]',
      );
      searchInput?.focus();
    },
  },
  {
    key: "?",
    description: "Show keyboard shortcuts",
    action: () => {
      log.debug("action", "Show shortcuts modal");
    },
  },
  {
    key: "h",
    altKey: true,
    description: "Go to home (Alt+H)",
    action: () => {
      // Handled by the hook's navigate() — requires Alt to prevent accidental triggers
    },
  },
  {
    key: "e",
    altKey: true,
    description: "Go to events (Alt+E)",
    action: () => {
      // Handled by the hook's navigate() — requires Alt to prevent accidental triggers
    },
  },
  {
    key: "r",
    altKey: true,
    description: "Go to restaurants (Alt+R)",
    action: () => {
      // Handled by the hook's navigate() — requires Alt to prevent accidental triggers
    },
  },
  {
    key: "k",
    ctrlKey: true,
    description: "Open command palette",
    action: () => {
      log.debug("action", "Command palette (future feature)");
    },
  },
  {
    key: "Escape",
    description: "Close modal/dialog",
    action: () => {
      // Handled by individual components
    },
    preventDefault: false,
  },
];
