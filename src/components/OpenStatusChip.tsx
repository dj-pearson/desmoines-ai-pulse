import { Clock, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getRestaurantOpenStatus } from '@/lib/restaurantHours';

interface OpenStatusChipProps {
  /** Free-form hours text (same format the open/closed parser understands). */
  hours?: string | null;
  /** Optional official site for the "check hours" fallback link. */
  website?: string | null;
  /** Fallback copy shown when no structured hours are available. */
  fallbackLabel?: string;
  className?: string;
}

const STATUS_STYLES = {
  open: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  'closing-soon': 'bg-amber-100 text-amber-700 border-amber-300',
  closed: 'bg-red-100 text-red-700 border-red-300',
} as const;

const STATUS_LABELS = {
  open: 'Open now',
  'closing-soon': 'Closing soon',
  closed: 'Closed',
} as const;

/**
 * Compact open/closed status chip for place detail pages. Renders a real-time
 * status when the hours text can be parsed; otherwise shows an explicit
 * "check hours" fallback (a link when an official site is known) — never a
 * fabricated or hardcoded time.
 */
export function OpenStatusChip({
  hours,
  website,
  fallbackLabel = 'Check official site for hours',
  className,
}: OpenStatusChipProps) {
  const { status } = getRestaurantOpenStatus(hours);

  if (status !== 'unknown') {
    return (
      <Badge variant="outline" className={cn('gap-1', STATUS_STYLES[status], className)}>
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        {STATUS_LABELS[status]}
      </Badge>
    );
  }

  if (website) {
    return (
      <a
        href={website}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary hover:underline',
          className
        )}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        {fallbackLabel}
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1 text-sm text-muted-foreground', className)}>
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {fallbackLabel}
    </span>
  );
}
