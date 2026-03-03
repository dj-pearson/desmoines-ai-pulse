import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isCapacitor } from '@/lib/capacitorUtils';

/**
 * Hook that listens for incoming deep link URLs via the Capacitor App plugin.
 * When the app is opened via a Universal Link (e.g. desmoinespulse.com/events/xyz),
 * this navigates to the corresponding route.
 *
 * No-op on web.
 */
export function useDeepLinks() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isCapacitor()) return;

    const appPlugin = window.Capacitor?.Plugins?.App;
    if (!appPlugin?.addListener) return;

    // Listen for deep link events
    const listener = appPlugin.addListener('appUrlOpen', (data: unknown) => {
      const event = data as { url?: string };
      if (!event?.url) return;

      try {
        const url = new URL(event.url);
        const path = url.pathname + url.search + url.hash;

        // Only navigate if the path looks like a valid app route
        if (path && path !== '/') {
          navigate(path);
        }
      } catch {
        // If URL parsing fails, try using the raw value as a path
        if (typeof event.url === 'string' && event.url.startsWith('/')) {
          navigate(event.url);
        }
      }
    });

    return () => {
      listener?.remove?.();
    };
  }, [navigate]);
}
