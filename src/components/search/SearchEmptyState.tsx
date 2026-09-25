import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { loosenQuery, orderExamplesForHour } from "@/hooks/useNLPSearch";
import { nowInCentralTime } from "@/lib/timezone";

const LANDINGS = [
  { href: "/events/today", label: "Events today" },
  { href: "/events/this-weekend", label: "This weekend" },
  { href: "/restaurants/open-now", label: "Restaurants open now" },
] as const;

interface SearchEmptyStateProps {
  /** The search that found nothing. Absent on a bare /search. */
  query?: string;
  /** Re-run the search. Offered only when a search ran. */
  onRetry?: () => void;
  /** Run one of the examples. Offered only on a bare /search. */
  onExample?: (example: string) => void;
}

const chipClass =
  "inline-flex min-h-11 items-center rounded-full border bg-secondary px-4 text-sm text-secondary-foreground transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function Landings() {
  return (
    <nav aria-label="Browse instead" className="flex flex-wrap gap-2">
      {LANDINGS.map((l) => (
        <Link key={l.href} to={l.href} className={chipClass}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Nothing found, or nothing asked yet (search plan WP2 item 10).
 *
 * With a query: one broader query to try (loosenQuery, the same rule the home
 * bar uses), the three landing pages, and a retry. Without one: examples for
 * the Central hour, then the same landings.
 */
export function SearchEmptyState({ query, onRetry, onExample }: SearchEmptyStateProps) {
  if (!query) {
    const examples = orderExamplesForHour(nowInCentralTime().getHours()).slice(0, 6);
    return (
      <div className="space-y-6">
        {onExample && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold">Try one of these</h2>
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <button key={example} type="button" className={chipClass} onClick={() => onExample(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Or browse</h2>
          <Landings />
        </div>
      </div>
    );
  }

  const loosened = loosenQuery(query);
  return (
    <div className="space-y-4 rounded-xl border p-6 sm:p-8">
      <h2 className="text-lg font-semibold">Nothing found for &ldquo;{query}&rdquo;</h2>
      {loosened && (
        <p>
          Try{" "}
          <Link
            to={`/search?q=${encodeURIComponent(loosened)}`}
            className="font-medium text-primary underline underline-offset-2"
          >
            &ldquo;{loosened}&rdquo;
          </Link>
          , or browse what&rsquo;s on.
        </p>
      )}
      {!loosened && <p className="text-muted-foreground">Try fewer words, or browse what&rsquo;s on.</p>}
      <Landings />
      {onRetry && (
        <Button variant="outline" className="min-h-11" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
