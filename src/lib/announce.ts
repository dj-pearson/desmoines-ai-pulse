/**
 * Announce a message to screen readers through a short-lived live region.
 *
 * One copy for the whole app. useFocusOnRouteChange and useAccessibility each
 * carried their own, and AccessibilityWidget (mounted at the app root) reached
 * useAccessibility only for this function, which put that whole hook in the
 * render-blocking entry chunk (WEB-PERF-066). Keep this file free of React and
 * of other imports so eager code can use it at no cost.
 */
export type AnnouncePriority = "polite" | "assertive";

export function announceToScreenReader(
  message: string,
  priority: AnnouncePriority = "polite",
): void {
  if (typeof document === "undefined" || !document.body) return;

  const announcement = document.createElement("div");
  announcement.setAttribute("aria-live", priority);
  announcement.setAttribute("aria-atomic", "true");
  announcement.setAttribute("role", "status");
  announcement.className = "sr-only";
  // Inline as well as the class, so the region stays visually hidden even if
  // the stylesheet has not applied yet.
  announcement.style.cssText =
    "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after a screen reader has had time to read it.
  setTimeout(() => {
    if (document.body.contains(announcement)) {
      document.body.removeChild(announcement);
    }
  }, 1500);
}
