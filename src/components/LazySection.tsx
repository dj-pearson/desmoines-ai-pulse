import { useEffect, useRef, useState, type ReactNode } from "react";
import { isPrerender } from "@/lib/isPrerender";

interface LazySectionProps {
  children: ReactNode;
  /**
   * Height the placeholder reserves before the section mounts, in px. Match it
   * to the section's usual rendered height so mounting does not shift what is
   * below it.
   */
  minHeight: number;
  /** How far outside the viewport to start mounting. */
  rootMargin?: string;
  /** Rendered in the reserved box until the section mounts. */
  placeholder?: ReactNode;
  className?: string;
  /** Optional label for the placeholder, so the empty box is not announced as nothing. */
  label?: string;
}

/**
 * Mounts its children only once the reserved box comes within `rootMargin` of
 * the viewport (WP1 item 10, docs/page-plans/home.md).
 *
 * Every lazy section on Home used to mount at once, so a dozen Supabase
 * requests fired before first interaction for content nobody had scrolled to.
 * React.lazy only defers the chunk download; it does not defer the mount, so
 * the section's queries still ran on first paint. This defers the mount.
 *
 * Once mounted the children stay mounted: scrolling back up must not refetch
 * or lose state. Where IntersectionObserver is missing the children mount
 * immediately, which is the old behaviour and never a blank page.
 *
 * Content that must be in the initial DOM for indexing (the FAQ) does not go
 * in here.
 *
 * Under the build-time prerender (`isPrerender()`) every section mounts at
 * once, so the static HTML crawlers get carries the snapshot, the
 * neighbourhood links and the dashboard (home-pass2 WP1 item 1). The page never
 * scrolls there, so without this they stayed placeholders.
 *
 * The idle placeholder is not `aria-busy`: nothing is loading, the section is
 * deferred. `aria-busy` also made the prerender wait out its timeout on `/`.
 */
export function LazySection({
  children,
  minHeight,
  rootMargin = "400px",
  placeholder,
  className,
  label,
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(
    () =>
      isPrerender() ||
      (typeof window !== "undefined" && typeof window.IntersectionObserver === "undefined"),
  );

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  if (visible) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ minHeight }}
      aria-label={label}
      role={label ? "region" : undefined}
      data-lazy-section="pending"
    >
      {placeholder}
    </div>
  );
}
