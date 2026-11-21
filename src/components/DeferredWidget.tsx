import { Suspense, type ReactNode } from "react";
import { LazySection } from "@/components/LazySection";

interface DeferredWidgetProps {
  /** Height reserved before the widget mounts, in px. */
  minHeight: number;
  /** Names the reserved box, so the empty placeholder is not announced as nothing. */
  label: string;
  children: ReactNode;
}

/**
 * A below-the-fold widget that fires its own requests on mount. Pair it with a
 * React.lazy component: lazy defers the chunk, LazySection defers the mount
 * until the reader scrolls near it, and the fixed-height box stands in for
 * both waits so mounting adds no layout shift.
 *
 * Used by the event, restaurant, attraction and playground detail pages.
 */
export function DeferredWidget({ minHeight, label, children }: DeferredWidgetProps) {
  const reserve = <div style={{ minHeight }} aria-hidden="true" />;
  return (
    <LazySection minHeight={minHeight} label={label} placeholder={reserve}>
      <Suspense fallback={reserve}>{children}</Suspense>
    </LazySection>
  );
}
