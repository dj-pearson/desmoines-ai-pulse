/**
 * True only inside the build-time prerender (scripts/prerender.mjs), which sets
 * `window.__DMI_PRERENDER__` before the app's first script runs.
 *
 * Deliberately not `navigator.webdriver`: Playwright sets that too, and the
 * request-budget spec needs the lazy sections to stay lazy under Playwright.
 * Components use this to mount crawler content that would otherwise wait for a
 * scroll (LazySection), and to leave out text that goes stale the moment the
 * HTML is frozen (the hero's "N events today", the Tonight cards).
 */
export function isPrerender(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as { __DMI_PRERENDER__?: boolean }).__DMI_PRERENDER__ === true
  );
}
