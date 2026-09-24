import { Skeleton, SkeletonGroup } from "./skeleton";
import { Card, CardContent, CardHeader } from "./card";

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
 * Placeholder for the home "This week in Des Moines" block (home plan WP3
 * item 8): heading, tab row and a 3x3 card grid, laid out on the same
 * section/container/grid classes as AllInclusiveDashboard so the swap to
 * real content does not move the page. Also the Suspense fallback on Index.
 */
export function DashboardGridSkeleton() {
  return (
    <section className="py-8 md:py-16 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SkeletonGroup label="Loading this week in Des Moines..." className="space-y-6 md:space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-8 w-64 md:h-9 md:w-80" />
            <Skeleton className="h-5 w-full max-w-md" />
          </div>
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 flex-shrink-0 rounded-md" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="space-y-3 p-4">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-6 w-5/6" />
                  <Skeleton className="h-4 w-full" />
                </div>
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

export type SpinnerSize = "sm" | "default" | "lg" | "xl";

const SPINNER_SIZES: Record<SpinnerSize, string> = {
  sm: "h-4 w-4",
  default: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

/**
 * The spinner ring, with no ARIA of its own (WEB-UX-034).
 *
 * TWELVE COPIES of the same hand-rolled spinner - a spin animation on a
 * rounded box with a single thick bottom border - were pasted across the admin
 * and CMS screens. (The class string is not written out here: quoting it made
 * impeccable's border-accent-on-rounded rule fire on this very comment.)
 * A single thick border on one
 * edge of a rounded box is what impeccable's border-accent-on-rounded rule
 * flags, and it was the largest group in the report - not because twelve
 * screens each made a design choice, but because one snippet was copied twelve
 * times. A full ring with a tinted top reads as a spinner at any angle; a
 * bottom-only border reads as a rounded box with a stray edge until it moves.
 *
 * This is the visual half only. It is aria-hidden, so it can sit inside a
 * container that already carries role="status" without announcing twice -
 * which PageLoadingOverlay above does. Use LoadingSpinner when the spinner is
 * the whole status region.
 */
export function Spinner({
  size = "default",
  tone = "primary",
  className = "",
}: {
  size?: SpinnerSize;
  /** "current" inherits the surrounding text colour, for spinners inside buttons. */
  tone?: "primary" | "current";
  className?: string;
}) {
  const ring =
    tone === "current"
      ? "border-current border-t-transparent"
      : "border-muted border-t-primary";

  return (
    <div
      className={`animate-spin rounded-full border-2 motion-reduce:animate-pulse ${ring} ${SPINNER_SIZES[size]} ${className}`}
      aria-hidden="true"
    />
  );
}

// Inline loading spinner with accessibility
export function LoadingSpinner({
  size = "default",
  className = "",
  label = "Loading..."
}: {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center justify-center"
    >
      <Spinner size={size} className={className} />
      <span className="sr-only">{label}</span>
    </div>
  );
}