import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isCapacitor } from '@/lib/capacitorUtils';

/** Pages with dark hero images that need light (white) status bar text */
const DARK_HERO_ROUTES = [
  '/events/',    // event detail pages
  '/restaurants/',// restaurant detail pages
  '/attractions/',// attraction detail pages
  '/playgrounds/',// playground detail pages
  '/stay/',      // hotel detail pages
];

/**
 * Hook that switches the iOS status bar text color based on the current route.
 * Light text on detail pages (dark hero images), dark text elsewhere.
 *
 * No-op on web.
 */
export function useStatusBarStyle() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isCapacitor()) return;

    const statusBar = window.Capacitor?.Plugins?.StatusBar;
    if (!statusBar?.setStyle) return;

    // Check if the current page has a dark hero image
    const hasDarkHero = DARK_HERO_ROUTES.some(route => {
      // Match detail pages like /events/slug but not list pages like /events
      const parts = pathname.replace(route, '').split('/').filter(Boolean);
      return pathname.startsWith(route) && parts.length > 0;
    }) || pathname === '/';  // Home page also has a dark hero

    statusBar.setStyle({
      style: hasDarkHero ? 'LIGHT' : 'DARK',
    });
  }, [pathname]);
}
