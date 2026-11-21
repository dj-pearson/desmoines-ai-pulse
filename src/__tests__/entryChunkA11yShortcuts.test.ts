import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-066 AC3. Two app-root pieces dragged whole modules into the entry
 * chunk for one small job each:
 * - AccessibilityWidget imported useAccessibility (focus trap, list keyboard
 *   navigation, reduced motion) only for announceToScreenReader, which now
 *   lives in lib/announce.ts.
 * - KeyboardShortcutsProvider called useKeyboardShortcuts directly; the
 *   listener is now the lazy KeyboardShortcutListener.
 * Together they took the critical path from 175.8 to 174.7 KB gz.
 */
const LAZY_ONLY = ["hooks/useAccessibility.ts", "hooks/use-keyboard-shortcuts.ts"];

describe("entry chunk: accessibility and shortcut helpers (WEB-PERF-066)", () => {
  const graph = eagerGraph(join(SRC, "main.tsx"));

  it("still reaches the widget and the shared announcer", () => {
    // Negative control: if the walker stopped reaching these, the assertions
    // below would pass vacuously.
    expect(graph.has(join(SRC, "components/AccessibilityWidget.tsx"))).toBe(true);
    expect(graph.has(join(SRC, "lib/announce.ts"))).toBe(true);
    expect(graph.has(join(SRC, "hooks/useFocusOnRouteChange.ts"))).toBe(true);
  });

  it("would catch a static import (walker control)", () => {
    // The lazy listener really does import the shortcut hook, so a static
    // import of it from App.tsx would put the hook back in the entry.
    const listener = eagerGraph(join(SRC, "components/KeyboardShortcutListener.tsx"));
    expect(listener.has(join(SRC, "hooks/use-keyboard-shortcuts.ts"))).toBe(true);
  });

  it.each(LAZY_ONLY)("does not statically reach %s", (rel) => {
    const file = join(SRC, rel);
    const reached = graph.has(file) ? chain(graph, file) : "";
    expect(
      reached,
      "eager code: import announceToScreenReader from @/lib/announce; mount shortcuts via the lazy KeyboardShortcutListener",
    ).toBe("");
  });
});
