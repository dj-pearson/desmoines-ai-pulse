import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface DetailFetchErrorProps {
  /** What failed to load, lowercase: "venue", "trail", "hotel". */
  entityLabel: string;
  /** Hub to fall back to. */
  backHref: string;
  backLabel: string;
  onRetry?: () => void;
}

/**
 * WEB-SEO-040. The state a detail page renders when its query THREW, as opposed
 * to when it succeeded and returned no row.
 *
 * The distinction is the whole point of this component: the not-found branch
 * carries `noindex`, and until now every detail page fell into that branch on a
 * transient PostgREST error too, so one bad minute of database latency could
 * publish `noindex` on a page that ranks. Nothing here emits a robots meta.
 * A crawler that hits this keeps whatever it already knew about the URL.
 */
export function DetailFetchError({
  entityLabel,
  backHref,
  backLabel,
  onRetry,
}: DetailFetchErrorProps) {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <AlertCircle
        className="h-12 w-12 mx-auto text-muted-foreground mb-4"
        aria-hidden="true"
      />
      <h1 className="text-2xl font-bold mb-2">
        We couldn&apos;t load this {entityLabel}
      </h1>
      <p className="text-muted-foreground mb-6">
        Something went wrong on our end. The page is still here — try again in a
        moment.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
        <Link to={backHref} className="text-primary hover:underline">
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
