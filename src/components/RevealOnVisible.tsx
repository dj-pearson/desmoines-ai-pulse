import { useRef, useState, useEffect, type ReactNode } from "react";

interface RevealOnVisibleProps {
  /** Rendered once the wrapper scrolls into view (e.g. a lazy heavy component). */
  children: ReactNode;
  /** Shown until the wrapper intersects the viewport. Should reserve the same height to avoid CLS. */
  placeholder: ReactNode;
  /** How far ahead of the viewport to start loading. Defaults to 200px. */
  rootMargin?: string;
  className?: string;
}

/**
 * Defers rendering of heavy children (maps, charts, embeds) until the wrapper
 * scrolls into view. The dynamic import behind a lazy child therefore fires on
 * intersection rather than on first paint, keeping heavy vendor chunks off the
 * critical path. Falls back to immediate render where IntersectionObserver is
 * unavailable. Once revealed it stays mounted.
 */
export function RevealOnVisible({
  children,
  placeholder,
  rootMargin = "200px",
  className,
}: RevealOnVisibleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? children : placeholder}
    </div>
  );
}
