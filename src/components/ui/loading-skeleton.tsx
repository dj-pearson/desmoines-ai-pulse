import { Skeleton, SkeletonGroup } from "./skeleton";
import { Card, CardContent, CardHeader } from "./card";
import { Spinner } from "./spinner";

// Card skeleton for events, restaurants, attractions
export function CardSkeleton({ showImage = true }: { showImage?: boolean }) {
  return (
    <Card className="overflow-hidden">
      {showImage && (
        <div className="aspect-video">
          <Skeleton className="h-full w-full rounded-none" />
        </div>
      )}
      <CardHeader className="pb-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex justify-between items-center mt-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

// Event card skeleton — matches SocialEventCard layout (image + date badge + category + title + location/time)
export function EventCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden border-0 shadow-md bg-card">
      {/* Image area with overlaid elements */}
      <div className="relative h-52 skeleton-mobile">
        {/* Date badge top-left */}
        <div className="absolute top-3 left-3 z-10">
          <div className="bg-background rounded-lg w-14 h-16 overflow-hidden">
            <Skeleton className="h-4 w-full rounded-none" />
            <div className="p-1 space-y-1">
              <Skeleton className="h-5 w-8 mx-auto" />
              <Skeleton className="h-3 w-6 mx-auto" />
            </div>
          </div>
        </div>
        {/* Badge top-right */}
        <Skeleton className="absolute top-3 right-3 h-5 w-16 rounded-full" />
        {/* Bottom overlay: category badge + title */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          <div className="flex gap-2 mb-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
          <Skeleton className="h-5 w-4/5 mb-1" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      </div>
      {/* Footer: location + time */}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    </div>
  );
}

// Restaurant card skeleton — matches RestaurantCard layout (image + badges + name + rating/price + description + location)
export function RestaurantCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border bg-card shadow-sm">
      {/* Image header */}
      <div className="relative h-48 skeleton-mobile">
        {/* Badge top-left */}
        <Skeleton className="absolute top-3 left-3 h-5 w-20 rounded-full z-10" />
        {/* Price top-right */}
        <Skeleton className="absolute top-3 right-3 h-5 w-10 rounded-full z-10" />
        {/* Bottom overlay: name + cuisine */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          <Skeleton className="h-5 w-3/4 mb-1.5" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3.5 w-3.5 rounded-full" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        </div>
      </div>
      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Rating row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 w-3.5 rounded-sm" />
            ))}
            <Skeleton className="h-4 w-6 ml-1" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        {/* Description */}
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
        {/* Location */}
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3.5 w-3.5 rounded-full" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      </div>
    </div>
  );
}

// Detail page hero skeleton — full-width image with overlaid content
export function DetailHeroSkeleton() {
  return (
    <div className="relative h-72 md:h-96 skeleton-mobile overflow-hidden">
      {/* Back button */}
      <Skeleton className="absolute top-4 left-4 h-9 w-9 rounded-full z-10" />
      {/* Share button */}
      <Skeleton className="absolute top-4 right-4 h-9 w-9 rounded-full z-10" />
      {/* Bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-6 z-10 space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-5 w-3/5" />
      </div>
    </div>
  );
}

// Grid of cards skeleton with accessibility
export function CardsGridSkeleton({
  count = 6,
  showImage = true,
  className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
  label = "Loading content...",
  variant = "default",
}: {
  count?: number;
  showImage?: boolean;
  className?: string;
  label?: string;
  variant?: "default" | "event" | "restaurant";
}) {
  const SkeletonCard = variant === "event"
    ? EventCardSkeleton
    : variant === "restaurant"
      ? RestaurantCardSkeleton
      : () => <CardSkeleton showImage={showImage} />;

  return (
    <SkeletonGroup label={label} className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </SkeletonGroup>
  );
}

// List item skeleton
export function ListItemSkeleton() {
  return (
    <div className="flex items-center space-x-4 p-4 border-b">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

// Table skeleton
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-8 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}

// Hero section skeleton
export function HeroSkeleton() {
  return (
    <div className="relative h-80 bg-muted rounded-lg overflow-hidden">
      <Skeleton className="h-full w-full rounded-none" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-4 w-full max-w-2xl px-4">
          <Skeleton className="h-12 w-3/4 mx-auto" />
          <Skeleton className="h-6 w-1/2 mx-auto" />
          <Skeleton className="h-10 w-32 mx-auto" />
        </div>
      </div>
    </div>
  );
}

// Stats grid skeleton
export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-6 text-center">
          <Skeleton className="h-8 w-12 mx-auto mb-2" />
          <Skeleton className="h-4 w-16 mx-auto" />
        </Card>
      ))}
    </div>
  );
}

// Dashboard skeleton with multiple sections and accessibility
export function DashboardSkeleton() {
  return (
    <SkeletonGroup label="Loading dashboard..." className="space-y-8">
      <HeroSkeleton />
      <StatsGridSkeleton />
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} showImage={true} />
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}

/**
 * One dashboard card's placeholder, laid out like DashboardCard in
 * AllInclusiveDashboard: 16:9 image, then a 40px badge-and-save row, the
 * when/where line, a two-line title and a two-line description.
 */
function DashboardCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex h-10 items-center justify-between">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-6 w-5/6 md:h-7" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

/**
 * A dashboard group's reserved slot (home pass-2 WP3 item 9): three cards on
 * the grid the real group uses. A group shows this while its own query loads,
 * so a table that answers late fills its slot instead of pushing the groups
 * below it down.
 */
export function DashboardGroupSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <DashboardCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Placeholder for the home "Explore Des Moines" block: heading, tab row and
 * five groups of three cards, the shape the block has once every group has
 * rows (home pass-2 WP3 item 9). Laid out on the same section/container/grid
 * classes as AllInclusiveDashboard so the swap to real content does not move
 * the page. Also the Suspense fallback on Index.
 */
export function DashboardGridSkeleton() {
  return (
    <section className="py-8 md:py-16 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SkeletonGroup label="Loading Explore Des Moines..." className="space-y-6 md:space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-8 w-64 md:h-9 md:w-80" />
            <Skeleton className="h-5 w-full max-w-md" />
          </div>
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-24 flex-shrink-0 rounded-md" />
            ))}
          </div>
          <div className="space-y-10 md:space-y-12">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <Skeleton className="h-7 w-40" />
                  <Skeleton className="h-5 w-32" />
                </div>
                <DashboardGroupSkeleton />
              </div>
            ))}
          </div>
        </SkeletonGroup>
      </div>
    </section>
  );
}

// Form skeleton
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-24 mt-6" />
      </div>
    </Card>
  );
}

// Search results skeleton with accessibility
export function SearchResultsSkeleton({ label = "Loading search results..." }: { label?: string }) {
  return (
    <SkeletonGroup label={label} className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex space-x-4 p-4 border rounded-lg">
            <Skeleton className="h-16 w-16 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

// Page loading overlay with accessibility
export function PageLoadingOverlay({ message = "Loading..." }: { message?: string }) {
  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-center space-y-4">
        <Spinner size="lg" className="mx-auto" />
        <p className="text-sm text-muted-foreground animate-pulse motion-reduce:animate-none">{message}</p>
      </div>
    </div>
  );
}

// Spinner and LoadingSpinner moved to ./spinner (WEB-PERF-060). Re-exported
// so existing imports keep working; eager code should import ./spinner directly.
export { Spinner, LoadingSpinner, type SpinnerSize } from "./spinner";
