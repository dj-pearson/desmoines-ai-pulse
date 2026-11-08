import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface HideOnScrollDownOptions {
  /** Off (e.g. on a wide screen) means never hidden. */
  enabled: boolean;
  /**
   * A zero-height element placed right before the sticky element. While its
   * top is below `stuckAt` the sticky element is still in the flow, and it is
   * never hidden there: hiding it would open a hole in the page.
   */
  sentinelRef: RefObject<HTMLElement>;
  /** The sticky element's `top` in px, i.e. where it pins. */
  stuckAt: number;
  /** Scroll movement in px ignored as jitter, so a resting thumb does not flicker it. */
  minDelta?: number;
}

export interface HideOnScrollDownResult {
  hidden: boolean;
  /** Show it now, e.g. when keyboard focus moves into it. */
  reveal: () => void;
}

/**
 * Tucks a pinned bar away while the reader scrolls down and brings it back
 * the moment they scroll up, the way mobile browsers treat their own toolbar.
 * Used by the /events results bar on phones, where header, bar, day header
 * and bottom nav together pinned 41% of a 375x667 screen (WEB-UX-061).
 */
export function useHideOnScrollDown({
  enabled,
  sentinelRef,
  stuckAt,
  minDelta = 6,
}: HideOnScrollDownOptions): HideOnScrollDownResult {
  const [hidden, setHidden] = useState(false);
  const reveal = useCallback(() => setHidden(false), []);
  const lastY = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setHidden(false);
      return;
    }
    lastY.current = window.scrollY;
    let frame = 0;
    let pending = false;

    const update = () => {
      pending = false;
      frame = 0;
      const y = window.scrollY;
      const sentinel = sentinelRef.current;
      if (!sentinel || sentinel.getBoundingClientRect().top > stuckAt) {
        lastY.current = y;
        setHidden(false);
        return;
      }
      const dy = y - lastY.current;
      if (Math.abs(dy) < minDelta) return;
      lastY.current = y;
      setHidden(dy > 0);
    };

    const onScroll = () => {
      if (pending) return;
      pending = true;
      const id = window.requestAnimationFrame(update);
      if (pending) frame = id;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (pending) window.cancelAnimationFrame(frame);
    };
  }, [enabled, sentinelRef, stuckAt, minDelta]);

  return { hidden: enabled && hidden, reveal };
}
