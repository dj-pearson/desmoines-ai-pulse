import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Hook that manages focus when route changes for accessibility.
 * Moves focus to the main content area when navigating between pages,
 * which helps screen reader users understand that the page has changed.
 *
 * @param mainContentId - The ID of the main content element (default: "main-content")
 * @param announcePageChange - Whether to announce the page change to screen readers
 */
export function useFocusOnRouteChange(
  mainContentId: string = "main-content",
  announcePageChange: boolean = true
) {
  const location = useLocation();
  const previousPathname = useRef<string | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip focus management on first render (initial page load)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      previousPathname.current = location.pathname;
      return;
    }

    // Only run if the pathname actually changed
    if (previousPathname.current === location.pathname) {
      return;
    }

    previousPathname.current = location.pathname;

    // Small delay to ensure the new page content has rendered
    const timeoutId = setTimeout(() => {
      // Try to focus the main content area
      const mainContent = document.getElementById(mainContentId);

      if (mainContent) {
        // Temporarily make it focusable if it isn't
        const originalTabIndex = mainContent.getAttribute("tabindex");
        mainContent.setAttribute("tabindex", "-1");
        mainContent.focus({ preventScroll: false });

        // Restore original tabindex after focus
        if (originalTabIndex === null) {
          mainContent.removeAttribute("tabindex");
        } else {
          mainContent.setAttribute("tabindex", originalTabIndex);
        }

        // Announce page change to screen readers
        if (announcePageChange) {
          announceToScreenReader(getPageTitle());
        }
      } else {
        // Fallback: focus the first h1 element if main content not found
        const heading = document.querySelector("h1");
        if (heading instanceof HTMLElement) {
          const originalTabIndex = heading.getAttribute("tabindex");
          heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: false });

          if (originalTabIndex === null) {
            heading.removeAttribute("tabindex");
          }

          if (announcePageChange) {
            announceToScreenReader(heading.textContent || getPageTitle());
          }
        }
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [location.pathname, mainContentId, announcePageChange]);
}

/**
 * Gets a human-readable page title from the document or URL
 */
function getPageTitle(): string {
  // Try to get the document title first
  const title = document.title;
  if (title && !title.includes("Loading")) {
    // Remove site name suffix if present
    const cleanTitle = title.split("|")[0].trim();
    return `Navigated to ${cleanTitle}`;
  }

  // Fall back to deriving from URL
  const pathname = window.location.pathname;
  const pageName = pathname === "/"
    ? "Home"
    : pathname
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) || "page";

  return `Navigated to ${pageName}`;
}

/**
 * Announces a message to screen readers using a live region
 */
function announceToScreenReader(
  message: string,
  priority: "polite" | "assertive" = "polite"
) {
  const announcement = document.createElement("div");
  announcement.setAttribute("aria-live", priority);
  announcement.setAttribute("aria-atomic", "true");
  announcement.setAttribute("role", "status");
  announcement.className = "sr-only";
  announcement.style.cssText = `
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  `;
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after screen reader has had time to read it
  setTimeout(() => {
    if (document.body.contains(announcement)) {
      document.body.removeChild(announcement);
    }
  }, 1500);
}

export default useFocusOnRouteChange;
