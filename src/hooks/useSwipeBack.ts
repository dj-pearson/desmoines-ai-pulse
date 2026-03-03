import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isCapacitor, getPlatform } from '@/lib/capacitorUtils';

const EDGE_ZONE = 30; // px from left edge to trigger
const SWIPE_THRESHOLD = 80; // px minimum swipe distance
const VELOCITY_THRESHOLD = 0.3; // px/ms minimum velocity

/**
 * Hook that enables swipe-from-left-edge to go back on Capacitor iOS.
 * Detects edge swipes that start within 30px of the left screen edge
 * and triggers React Router back navigation.
 *
 * Does not conflict with horizontal scrolling elements (maps, carousels)
 * because it only activates on touches starting at the left edge.
 *
 * No-op on web.
 */
export function useSwipeBack() {
  const navigate = useNavigate();
  const location = useLocation();
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    // Only trigger on touches starting at the left edge
    if (touch.clientX <= EDGE_ZONE) {
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    }
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    const deltaTime = Date.now() - touchStartRef.current.time;
    const velocity = deltaX / deltaTime;

    touchStartRef.current = null;

    // Must be primarily horizontal (not vertical scroll)
    if (deltaY > deltaX) return;

    // Must meet distance and velocity thresholds
    if (deltaX >= SWIPE_THRESHOLD && velocity >= VELOCITY_THRESHOLD) {
      navigate(-1);
    }
  }, [navigate]);

  useEffect(() => {
    // Only enable on Capacitor iOS
    if (!isCapacitor() || getPlatform() !== 'ios') return;

    // Don't enable on the home page (nothing to go back to)
    if (location.pathname === '/') return;

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd, location.pathname]);
}
