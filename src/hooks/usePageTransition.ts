import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isCapacitor } from '@/lib/capacitorUtils';

/**
 * Hook that applies a CSS fade-in animation on route changes in Capacitor.
 * Returns a ref to attach to the page content container.
 *
 * Uses a lightweight CSS class approach — no heavy animation libraries.
 * Respects prefers-reduced-motion via CSS (the animation is suppressed).
 * No-op on web.
 */
export function usePageTransition<T extends HTMLElement = HTMLElement>() {
  const { pathname } = useLocation();
  const ref = useRef<T>(null);
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    if (!isCapacitor() || !ref.current) return;
    if (prevPathRef.current === pathname) return;

    const el = ref.current;
    // Remove then re-add the animation class to trigger it
    el.classList.remove('cap-page-enter');
    // Force reflow so removing + adding the class triggers the animation
    void el.offsetWidth;
    el.classList.add('cap-page-enter');

    prevPathRef.current = pathname;
  }, [pathname]);

  return ref;
}
