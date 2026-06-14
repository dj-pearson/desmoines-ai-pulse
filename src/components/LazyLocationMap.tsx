import { lazy, Suspense } from 'react';

/**
 * Lazy wrapper around EventLocationMap so leaflet only loads when a detail page
 * actually renders a map. A fixed-height placeholder reserves the space to
 * avoid layout shift (CLS) while the chunk loads.
 */
const EventLocationMap = lazy(() =>
  import('./EventLocationMap').then((m) => ({ default: m.EventLocationMap }))
);

interface LazyLocationMapProps {
  latitude: number;
  longitude: number;
  venue?: string | null;
  location?: string | null;
  className?: string;
}

export function LazyLocationMap({
  latitude,
  longitude,
  venue,
  location,
  className = 'h-48 w-full rounded-lg',
}: LazyLocationMapProps) {
  return (
    <Suspense
      fallback={
        <div
          className={`${className} animate-pulse bg-muted motion-reduce:animate-none`}
          style={{ minHeight: 192 }}
          aria-hidden="true"
        />
      }
    >
      <EventLocationMap
        latitude={latitude}
        longitude={longitude}
        venue={venue}
        location={location}
        className={className}
      />
    </Suspense>
  );
}
