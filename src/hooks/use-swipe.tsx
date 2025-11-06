import { useRef, useEffect, useCallback } from 'react';

export interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  velocityThreshold?: number;
}

interface TouchData {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
}

/**
 * Custom hook for detecting swipe gestures on mobile devices
 * @param options - Swipe configuration options
 * @returns Ref to attach to the swipeable element
 */
export function useSwipe<T extends HTMLElement = HTMLDivElement>(
  options: SwipeOptions
) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50, // Minimum distance for swipe
    velocityThreshold = 0.3, // Minimum velocity for swipe
  } = options;

  const elementRef = useRef<T>(null);
  const touchData = useRef<TouchData | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchData.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      currentX: touch.clientX,
      currentY: touch.clientY,
    };
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchData.current) return;

    const touch = e.touches[0];
    touchData.current.currentX = touch.clientX;
    touchData.current.currentY = touch.clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchData.current) return;

    const { startX, startY, currentX, currentY, startTime } = touchData.current;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    const deltaTime = Date.now() - startTime;

    const velocityX = Math.abs(deltaX) / deltaTime;
    const velocityY = Math.abs(deltaY) / deltaTime;

    // Determine if swipe is primarily horizontal or vertical
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);

    if (isHorizontalSwipe) {
      // Horizontal swipe
      if (
        Math.abs(deltaX) > threshold &&
        velocityX > velocityThreshold
      ) {
        if (deltaX > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      }
    } else {
      // Vertical swipe
      if (
        Math.abs(deltaY) > threshold &&
        velocityY > velocityThreshold
      ) {
        if (deltaY > 0) {
          onSwipeDown?.();
        } else {
          onSwipeUp?.();
        }
      }
    }

    touchData.current = null;
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold, velocityThreshold]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return elementRef;
}
