import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export interface KeyboardShortcutListenerProps {
  onShowHelp: () => void;
}

/**
 * The global keydown listener (Alt+H/E/R, "/", "?"), as a headless component
 * so App.tsx can load it with React.lazy. It used to be a hook call in the
 * app-root KeyboardShortcutsProvider, which put the whole shortcut table in
 * the render-blocking entry chunk for every visitor (WEB-PERF-066). Arriving
 * a moment after first paint costs nothing: nobody presses Alt+E before the
 * page has drawn.
 */
export default function KeyboardShortcutListener({ onShowHelp }: KeyboardShortcutListenerProps): null {
  useKeyboardShortcuts({ enabled: true, onShowHelp });
  return null;
}
