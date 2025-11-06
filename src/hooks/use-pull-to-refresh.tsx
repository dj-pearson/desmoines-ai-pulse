import { useRef, useEffect, useCallback, useState } from 'react';

export interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPullDistance?: number;
  resistance?: number;
}

export interface PullToRefreshState {
  isPulling: boolean;
  isRefreshing: boolean;
  pullDistance: number;
}

/**
 * Custom hook for implementing pull-to-refresh functionality
 * @param options - Pull-to-refresh configuration
 * @returns Ref and state for the pull-to-refresh container
 */
export function usePullToRefresh<T extends HTMLElement = HTMLDivElement>(
  options: PullToRefreshOptions
) {
  const {
    onRefresh,
    threshold = 80,
    maxPullDistance = 120,
    resistance = 2.5,
  } = options;

  const elementRef = useRef<T>(null);
  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
  });

  const touchStartY = useRef<number>(0);
  const currentPullDistance = useRef<number>(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const element = elementRef.current;
    if (!element) return;

    // Only trigger if scrolled to the top
    if (element.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const element = elementRef.current;
    if (!element || state.isRefreshing) return;

    // Only proceed if at the top
    if (element.scrollTop === 0 && touchStartY.current > 0) {
      const touchY = e.touches[0].clientY;
      const pullDistance = (touchY - touchStartY.current) / resistance;

      if (pullDistance > 0) {
        // Prevent default scroll behavior while pulling
        e.preventDefault();

        const limitedDistance = Math.min(pullDistance, maxPullDistance);
        currentPullDistance.current = limitedDistance;

        setState(prev => ({
          ...prev,
          isPulling: true,
          pullDistance: limitedDistance,
        }));
      }
    }
  }, [resistance, maxPullDistance, state.isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (state.isRefreshing) return;

    const shouldRefresh = currentPullDistance.current >= threshold;

    if (shouldRefresh) {
      setState(prev => ({
        ...prev,
        isPulling: false,
        isRefreshing: true,
        pullDistance: threshold,
      }));

      try {
        await onRefresh();
      } finally {
        setState({
          isPulling: false,
          isRefreshing: false,
          pullDistance: 0,
        });
      }
    } else {
      setState({
        isPulling: false,
        isRefreshing: false,
        pullDistance: 0,
      });
    }

    touchStartY.current = 0;
    currentPullDistance.current = 0;
  }, [onRefresh, threshold, state.isRefreshing]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { elementRef, ...state };
}
