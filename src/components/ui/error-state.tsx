import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { EmptyState, EmptyStateAction } from '@/components/ui/empty-state';

/**
 * Heuristic: is this failure an offline / network-connectivity problem
 * (vs. a server-side error we should phrase differently)?
 *
 * Checks `navigator.onLine` first (definitive when false), then falls back to
 * matching the common fetch/network error messages browsers and Supabase emit.
 */
export function isOfflineError(error?: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return /failed to fetch|network\s?error|load failed|err_internet|err_network|fetch failed|offline/i.test(
    message
  );
}

export interface ErrorStateProps {
  /** The error to render — used to detect offline vs. server failures. */
  error?: unknown;
  /** Retry handler (e.g. a query `refetch`). Renders the primary "Try Again" button. */
  onRetry?: () => void;
  /** Label for the resource, e.g. "events" → "Unable to load events". Ignored when `title` is set. */
  resourceLabel?: string;
  /** Override the auto-derived title. */
  title?: string;
  /** Override the auto-derived description. */
  description?: string;
  /** Label for the retry button. */
  retryLabel?: string;
  /** Extra actions rendered after the retry button (e.g. "Go Home"). */
  secondaryActions?: EmptyStateAction[];
  compact?: boolean;
  className?: string;
}

/**
 * Shared error card for content list/detail pages. Distinguishes an offline
 * connection from a server-side failure and always offers a working Retry.
 */
export function ErrorState({
  error,
  onRetry,
  resourceLabel = 'content',
  title,
  description,
  retryLabel = 'Try Again',
  secondaryActions,
  compact,
  className,
}: ErrorStateProps) {
  const offline = isOfflineError(error);

  const resolvedTitle =
    title ?? (offline ? "You're offline" : `Unable to load ${resourceLabel}`);
  const resolvedDescription =
    description ??
    (offline
      ? "We can't reach the server. Check your internet connection and try again."
      : 'Something went wrong on our end. This is usually temporary — please try again.');

  const actions: EmptyStateAction[] = [];
  if (onRetry) {
    actions.push({ label: retryLabel, onClick: onRetry, icon: RefreshCw });
  }
  if (secondaryActions) {
    actions.push(...secondaryActions);
  }

  return (
    <EmptyState
      icon={offline ? WifiOff : AlertCircle}
      title={resolvedTitle}
      description={resolvedDescription}
      actions={actions.length > 0 ? actions : undefined}
      compact={compact}
      className={className}
    />
  );
}
