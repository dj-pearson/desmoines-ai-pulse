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

// Grid of cards skeleton with accessibility
export function CardsGridSkeleton({
  count = 6,
  showImage = true,
  className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6",
  label = "Loading content..."
}: {
  count?: number;
  showImage?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <SkeletonGroup label={label} className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} showImage={showImage} />
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
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto motion-reduce:animate-pulse"
          aria-hidden="true"
        ></div>
        <p className="text-sm text-muted-foreground animate-pulse motion-reduce:animate-none">{message}</p>
      </div>
    </div>
  );
}

// Inline loading spinner with accessibility
export function LoadingSpinner({
  size = "default",
  className = "",
  label = "Loading..."
}: {
  size?: "sm" | "default" | "lg";
  className?: string;
  label?: string;
}) {
  const sizeClasses = {
    sm: "h-4 w-4",
    default: "h-6 w-6",
    lg: "h-8 w-8"
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center justify-center"
    >
      <div
        className={`animate-spin rounded-full border-2 border-muted border-t-primary motion-reduce:animate-pulse ${sizeClasses[size]} ${className}`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}