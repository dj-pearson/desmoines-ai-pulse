import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether this skeleton represents a loading state that should be announced */
  isLoading?: boolean;
}

/**
 * Skeleton component for loading placeholders
 * - Uses aria-hidden by default since skeletons are decorative
 * - Supports reduced motion preference via motion-reduce
 * - Set isLoading=true for the parent container to handle announcements
 */
function Skeleton({
  className,
  isLoading,
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted motion-reduce:animate-none",
        className
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

/**
 * Wrapper component for skeleton groups that need accessibility announcements
 */
function SkeletonGroup({
  children,
  label = "Loading content...",
  className,
  ...props
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={className}
      {...props}
    >
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export { Skeleton, SkeletonGroup }
