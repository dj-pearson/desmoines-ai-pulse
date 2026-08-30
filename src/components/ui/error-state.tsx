import { AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  /** The caught error, used to distinguish offline vs server failures. */
  error?: unknown;
  /** Retry handler — wire to the query's refetch. */
  onRetry?: () => void;
  /** Override the heading. */
  title?: string;
  /** Override the body copy. */
  description?: string;
  className?: string;
  compact?: boolean;
}

/**
 * True when the failure looks network-related — either the browser reports no
 * connection, or the error message matches a fetch/network failure (so we can
 * distinguish a connectivity problem from a server error where detectable).
 */
function looksOffline(error?: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /network|failed to fetch|fetch failed|connection|offline/i.test(msg);
}

/**
 * Shared error card for list/content pages. Distinguishes an offline client
 * from a server error where detectable, and offers a Retry that re-runs the
 * underlying query.
 */
export function ErrorState({
  error,
  onRetry,
  title,
  description,
  className,
  compact = false,
}: ErrorStateProps) {
  const offline = looksOffline(error);
  const Icon = offline ? WifiOff : AlertTriangle;

  const resolvedTitle =
    title ?? (offline ? "You're offline" : 'Something went wrong');
  const resolvedDescription =
    description ??
    (offline
      ? 'Check your internet connection and try again.'
      : "We couldn't load this content. This is usually temporary — please try again.");

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8' : 'py-12 md:py-16',
        className
      )}
    >
      <div
        className={cn(
          'rounded-full bg-destructive/10 flex items-center justify-center mb-4',
          compact ? 'w-12 h-12' : 'w-16 h-16 md:w-20 md:h-20'
        )}
      >
        <Icon
          className={cn(
            'text-destructive',
            compact ? 'w-6 h-6' : 'w-8 h-8 md:w-10 md:h-10'
          )}
          aria-hidden="true"
        />
      </div>

      <h3
        className={cn(
          'font-semibold text-foreground mb-2',
          compact ? 'text-base' : 'text-lg md:text-xl'
        )}
      >
        {resolvedTitle}
      </h3>

      <p
        className={cn(
          'text-muted-foreground max-w-md mx-auto',
          compact ? 'text-sm' : 'text-sm md:text-base'
        )}
      >
        {resolvedDescription}
      </p>

      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-6">
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}
