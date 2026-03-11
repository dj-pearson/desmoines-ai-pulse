// Lightweight route prefetch utilities
// We keep this in a separate file to avoid bloating performance.ts

// Map app routes to their lazily-loaded page modules
const routeModuleMap: Record<string, () => Promise<unknown>> = {
  "/events": () => import("@/pages/EventsPage"),
  "/events/today": () => import("@/pages/EventsToday"),
  "/events/free": () => import("@/pages/FreeEvents"),
  "/restaurants": () => import("@/pages/Restaurants"),
  "/attractions": () => import("@/pages/Attractions"),
  "/playgrounds": () => import("@/pages/Playgrounds"),
  "/trip-planner": () => import("@/pages/TripPlanner"),
  "/best-of": () => import("@/pages/BestOf"),
  "/whats-new": () => import("@/pages/WhatsNew"),
};

// Prefetch a route's chunk using a dynamic import (Vite will prefetch/cache it)
export const prefetchRoute = (path: string) => {
  const loader = routeModuleMap[path];
  if (!loader) return;
  // Use requestIdleCallback when available to avoid jank
  const idle = (cb: () => void) =>
    ("requestIdleCallback" in window
      ? (window as any).requestIdleCallback(cb, { timeout: 1500 })
      : setTimeout(cb, 150));

  idle(() => {
    loader().catch(() => {
      // Silently ignore prefetch errors
    });
  });
};
