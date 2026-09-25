import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/campaignDisplay";

export type SummaryQuoteState =
  | { status: "no_placements" }
  | { status: "no_dates"; fromRate: number | null }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; total: number; days: number };

export interface AdvertiseSummaryBarProps {
  quote: SummaryQuoteState;
  ctaLabel: string;
  onSubmit: () => void;
  disabled: boolean;
  busy: boolean;
  onRetryQuote?: () => void;
  /** One short line under the CTA, e.g. the sign-in note. */
  note?: string | null;
}

/**
 * The live total and the checkout button (business plan WP1 item 8).
 *
 * Under lg it's a bar fixed above BottomNav, which is 4rem tall plus its own
 * safe-area padding (BottomNav.tsx, .safe-area-bottom in index.css), so the
 * total and the CTA are on screen at 390x844 without scrolling. At lg it's a
 * plain block in the sticky sidebar; BottomNav is lg:hidden there.
 *
 * The only total it prints is the server's (useCampaignQuote). It never adds
 * up a rate card itself.
 */
export function AdvertiseSummaryBar({
  quote,
  ctaLabel,
  onSubmit,
  disabled,
  busy,
  onRetryQuote,
  note,
}: AdvertiseSummaryBarProps) {
  return (
    <section
      aria-labelledby="advertise-summary-heading"
      className={cn(
        "fixed inset-x-0 z-40 border-t bg-background px-4 py-3",
        "bottom-[calc(4rem+max(1rem,env(safe-area-inset-bottom)))]",
        "lg:static lg:inset-auto lg:z-auto lg:rounded-xl lg:border lg:p-5",
      )}
    >
      <h2 id="advertise-summary-heading" className="sr-only lg:not-sr-only lg:mb-3 lg:text-lg lg:font-semibold">
        Total
      </h2>
      <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-stretch">
        <div className="min-w-0" aria-live="polite" aria-atomic="true">
          <QuoteText quote={quote} onRetryQuote={onRetryQuote} />
        </div>
        <Button
          onClick={onSubmit}
          disabled={disabled}
          aria-busy={busy}
          size="lg"
          className="shrink-0 lg:w-full"
        >
          {busy ? "Starting checkout..." : ctaLabel}
        </Button>
      </div>
      {note ? <p className="mt-2 text-xs text-muted-foreground lg:text-sm">{note}</p> : null}
    </section>
  );
}

function QuoteText({ quote, onRetryQuote }: { quote: SummaryQuoteState; onRetryQuote?: () => void }) {
  switch (quote.status) {
    case "no_placements":
      return <p className="text-sm text-muted-foreground">Pick a placement to see prices.</p>;
    case "no_dates":
      return (
        <p className="text-sm text-muted-foreground">
          {quote.fromRate !== null ? `From ${formatUSD(quote.fromRate)}/day. ` : ""}
          Pick dates for the total.
        </p>
      );
    case "loading":
      return <p className="text-sm text-muted-foreground">Pricing...</p>;
    case "error":
      return (
        <p className="text-sm text-destructive">
          Prices couldn't load.{" "}
          {onRetryQuote ? (
            <button type="button" onClick={onRetryQuote} className="underline underline-offset-4">
              Try again.
            </button>
          ) : (
            "Try again."
          )}
        </p>
      );
    case "ready":
      return (
        <div>
          <p className="text-xl font-semibold tabular-nums" id="advertise-total">
            {formatUSD(quote.total)}
          </p>
          <p className="text-xs text-muted-foreground">
            {quote.days} {quote.days === 1 ? "day" : "days"}. This is the amount checkout charges.
          </p>
        </div>
      );
  }
}
