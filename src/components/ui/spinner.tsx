/**
 * Spinner and LoadingSpinner live in their own module (WEB-PERF-060).
 *
 * ProtectedRoute is eager and renders a Spinner while auth resolves. When the
 * spinner lived in loading-skeleton.tsx, that import put the whole skeleton
 * file in the entry chunk (5.5 KB raw: CardsGridSkeleton, DashboardGroupSkeleton
 * and the rest), because rollup places a module shared by the entry and lazy
 * chunks in the entry. Import the spinner from here in anything eager;
 * loading-skeleton.tsx re-exports both for existing callers.
 */
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