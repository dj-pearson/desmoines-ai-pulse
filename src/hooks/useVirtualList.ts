import { useState, useEffect, useRef, useCallback } from 'react';

interface UseVirtualListOptions {
  /** Total number of items */
  itemCount: number;
  /** Estimated height of each item in pixels */
  itemHeight: number;
  /** Number of screens to buffer above and below the viewport */
  overscan?: number;
  /** Only virtualize when item count exceeds this threshold */
  threshold?: number;
}

interface UseVirtualListReturn {
  /** Container ref — attach to the scrollable parent */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Start index of visible items */
  startIndex: number;
  /** End index of visible items (exclusive) */
  endIndex: number;
  /** Total height of the virtual list (for spacer element) */
  totalHeight: number;
  /** Top offset for the visible items (for positioning) */
  offsetTop: number;
  /** Whether virtualization is active */
  isVirtualized: boolean;
}

/**
 * Lightweight virtual list hook using IntersectionObserver-style approach.
 * Only renders items within the viewport + overscan buffer.
 *
 * Usage:
 * ```tsx
 * const { startIndex, endIndex, totalHeight, offsetTop, isVirtualized } = useVirtualList({
 *   itemCount: items.length,
 *   itemHeight: 200,
 * });
 *
 * const visibleItems = isVirtualized ? items.slice(startIndex, endIndex) : items;
 * ```
 */
export function useVirtualList(options: UseVirtualListOptions): UseVirtualListReturn {
  const {
    itemCount,
    itemHeight,
    overscan = 2,
    threshold = 50,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 800
  );
  const rafRef = useRef<number>();

  const isVirtualized = itemCount > threshold;

  const handleScroll = useCallback(() => {
    if (!isVirtualized) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setScrollTop(window.scrollY);
    });
  }, [isVirtualized]);

  useEffect(() => {
    if (!isVirtualized) return;

    setViewportHeight(window.innerHeight);
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', () => setViewportHeight(window.innerHeight));

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', () => setViewportHeight(window.innerHeight));
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [handleScroll, isVirtualized]);

  if (!isVirtualized) {
    return {
      containerRef,
      startIndex: 0,
      endIndex: itemCount,
      totalHeight: 0,
      offsetTop: 0,
      isVirtualized: false,
    };
  }

  // Calculate the container's position relative to the viewport
  const containerTop = containerRef.current?.offsetTop || 0;
  const relativeScroll = Math.max(0, scrollTop - containerTop);

  const bufferSize = viewportHeight * overscan;
  const startIndex = Math.max(0, Math.floor((relativeScroll - bufferSize) / itemHeight));
  const endIndex = Math.min(
    itemCount,
    Math.ceil((relativeScroll + viewportHeight + bufferSize) / itemHeight)
  );

  const totalHeight = itemCount * itemHeight;
  const offsetTop = startIndex * itemHeight;

  return {
    containerRef,
    startIndex,
    endIndex,
    totalHeight,
    offsetTop,
    isVirtualized,
  };
}
