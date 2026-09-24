import { Link } from "react-router-dom";
import { MapPin, RefreshCw, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTonightPairings } from "@/hooks/useTonightPairings";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { formatCentralTime, formatMiles, type TonightPairing } from "@/lib/tonightPairings";
import { cn } from "@/lib/utils";

/**
 * "Tonight in Des Moines" (home plan WP10): an event tonight paired with a
 * restaurant that will be open nearby at dinner time. Free, no sign-in, no
 * paywall - the whole plan is on the card.
 *
 * Test hooks are data-tonight-* attributes, not data-testid: vite.config.ts
 * strips data-testid from every build, dev included.
 *
 * FIXED HEIGHT. The strip reserves its height before data arrives, and the
 * skeleton, error and content states all fill the same box, so the page below
 * does not move when the rows land (CLS).
 */
const STRIP_HEIGHT = "h-[11.5rem]";
const CARD_WIDTH = "w-[17rem] sm:w-[19rem]";
const SKELETON_CARDS = 3;

function eventHref(pairing: TonightPairing): string {
  return `/events/${createEventSlugWithCentralTime(pairing.event.title, pairing.event)}`;
}

function restaurantHref(id: string, slug: string | null | undefined): string {
  return `/restaurants/${slug || id}`;
}

function venueLabel(pairing: TonightPairing): string | null {
  return pairing.event.venue || pairing.event.location || null;
}

function isFree(price: string | null | undefined): boolean {
  return typeof price === "string" && /^\s*free\b/i.test(price);
}

function TonightCard({ pairing }: { pairing: TonightPairing }) {
  const { event, dinner, startsAt } = pairing;
  const title = event.title || "Event";
  const time = startsAt ? formatCentralTime(startsAt) : null;
  const venue = venueLabel(pairing);

  return (
    <li
      className={cn(
        "snap-start shrink-0 flex flex-col justify-between rounded-xl bg-muted p-4",
        CARD_WIDTH,
      )}
      data-tonight-card=""
      data-paired={dinner ? "true" : "false"}
    >
      {dinner ? (
        <p className="text-base leading-snug text-foreground">
          <span className="text-muted-foreground">Dinner at </span>
          <Link
            to={restaurantHref(dinner.restaurant.id, dinner.restaurant.slug)}
            className="font-semibold underline-offset-4 hover:underline focus-visible:underline"
            data-tonight-link="restaurant"
          >
            {dinner.restaurant.name || "a nearby restaurant"}
          </Link>
          <span className="text-muted-foreground"> ({formatMiles(dinner.distanceMiles)}), then </span>
          <Link
            to={eventHref(pairing)}
            className="font-semibold underline-offset-4 hover:underline focus-visible:underline"
            data-tonight-link="event"
          >
            {title}
          </Link>
          {time && <span className="text-muted-foreground"> at {time}</span>}
        </p>
      ) : (
        <p className="text-base leading-snug text-foreground">
          <Link
            to={eventHref(pairing)}
            className="font-semibold underline-offset-4 hover:underline focus-visible:underline"
            data-tonight-link="event"
          >
            {title}
          </Link>
          <span className="text-muted-foreground">{time ? ` at ${time}` : ", tonight"}</span>
        </p>
      )}

      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
        {venue && (
          <p className="flex items-center gap-1.5 truncate">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{venue}</span>
          </p>
        )}
        {dinner ? (
          <p className="flex items-center gap-1.5 truncate">
            <Utensils className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              Open at {formatCentralTime(dinner.dinnerAt)}
              {dinner.restaurant.cuisine ? `, ${dinner.restaurant.cuisine}` : ""}
            </span>
          </p>
        ) : null}
        {isFree(event.price) && <p className="font-medium text-foreground">Free</p>}
      </div>
    </li>
  );
}

export function TonightRail() {
  const { pairings, isLoading, isError, refetch } = useTonightPairings();

  const showSkeleton = isLoading && pairings.length === 0;
  const showError = !isLoading && isError && pairings.length === 0;
  const showNothing = !isLoading && !isError && pairings.length === 0;

  return (
    <section className="py-6" aria-labelledby="tonight-rail-heading">
      <div className="container mx-auto px-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="tonight-rail-heading" className="text-xl font-semibold">
            Tonight in Des Moines
          </h2>
          <Link
            to="/events/today"
            className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4"
          >
            All of today
          </Link>
        </div>

        <div className={cn("relative", STRIP_HEIGHT)} aria-busy={showSkeleton}>
          {showSkeleton && (
            <ul className="flex h-full gap-4 overflow-hidden -mx-4 px-4" aria-hidden="true">
              {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
                <li
                  key={`tonight-skeleton-${i}`}
                  className={cn("shrink-0 h-full rounded-xl bg-muted p-4", CARD_WIDTH)}
                >
                  <div className="h-4 w-5/6 rounded bg-background/70 animate-pulse motion-reduce:animate-none" />
                  <div className="mt-2 h-4 w-2/3 rounded bg-background/70 animate-pulse motion-reduce:animate-none" />
                  <div className="mt-6 h-3 w-1/2 rounded bg-background/70 animate-pulse motion-reduce:animate-none" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-background/70 animate-pulse motion-reduce:animate-none" />
                </li>
              ))}
            </ul>
          )}

          {showError && (
            <div
              className="flex h-full flex-col items-center justify-center gap-3 rounded-xl bg-muted px-4 text-center"
              role="alert"
              data-tonight-error=""
            >
              <p className="text-sm text-foreground">
                We couldn't load tonight's events.
              </p>
              <Button variant="outline" className="min-h-11" onClick={refetch}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            </div>
          )}

          {showNothing && (
            <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl bg-muted px-4 text-center">
              <p className="text-sm text-foreground">Nothing else is listed for tonight.</p>
              <p className="text-sm text-muted-foreground">
                <Link
                  to="/events/this-weekend"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  See this weekend
                </Link>{" "}
                or{" "}
                <Link
                  to="/restaurants/open-now"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  find somewhere open now
                </Link>
                .
              </p>
            </div>
          )}

          {pairings.length > 0 && (
            <ul
              className="flex h-full gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory"
              aria-label="Plans for tonight"
            >
              {pairings.map((pairing) => (
                <TonightCard key={pairing.event.id} pairing={pairing} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
