import { Link } from "react-router-dom";
import { Clock, MapPin, RefreshCw, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RailWeatherLine } from "@/components/WeatherNotice";
import { useTonightPairings } from "@/hooks/useTonightPairings";
import { isFreePrice } from "@/lib/eventPrice";
import { isPrerender } from "@/lib/isPrerender";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import {
  formatCentralShortDate,
  formatCentralTime,
  formatMiles,
  formatTonightDate,
  truncateName,
  type TonightPairing,
} from "@/lib/tonightPairings";
import { cn } from "@/lib/utils";

/**
 * The Tonight rail (home plan WP10, home pass-2 WP2): tonight's events from
 * 16:00 CT on, each paired with a restaurant that will be open nearby at
 * dinner time when one fits. Free, no sign-in, no paywall - the whole plan is
 * on the card.
 *
 * Test hooks are data-tonight-* attributes, not data-testid: vite.config.ts
 * strips data-testid from every build, dev included.
 *
 * FIXED HEIGHT. The strip reserves its height before data arrives, and the
 * skeleton, error and content states all fill the same box, so the page below
 * does not move when the rows land (CLS). Inside a card the dinner line keeps
 * its slot while the restaurants load, and the plan sentence is clamped to
 * three lines with the time and distance on their own rows, so a long title
 * can't push them out of the card.
 *
 * NOT IN THE STATIC HTML. Under the build-time prerender the rail renders its
 * skeleton: cards frozen into dist/index.html would list last night's shows to
 * every crawler until the next build. data-nosnippet keeps the live text out of
 * search snippets for the same reason (as /events' TonightStrip does).
 */
const STRIP_HEIGHT = "h-[11.5rem]";
const CARD_WIDTH = "w-[17rem] sm:w-[19rem] lg:w-auto";
const SKELETON_CARDS = 5;

function eventHref(pairing: TonightPairing): string {
  return `/events/${createEventSlugWithCentralTime(pairing.event.title, pairing.event)}`;
}

function restaurantHref(id: string, slug: string | null | undefined): string {
  return `/restaurants/${slug || id}`;
}

function venueLabel(pairing: TonightPairing): string | null {
  return pairing.event.venue || pairing.event.location || null;
}

const linkClass =
  "font-semibold text-foreground underline-offset-4 hover:underline focus-visible:underline";

/**
 * A name cut to about 40 characters on screen, with the full name for screen
 * readers, so the link's accessible name is never the truncated one.
 */
function CutName({ name }: { name: string }) {
  const shown = truncateName(name);
  if (shown === name.trim()) return <>{shown}</>;
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{name}</span>
    </>
  );
}

/** What follows the event's name when there is no dinner in front of it. */
function whenSuffix(pairing: TonightPairing): string {
  if (pairing.startsAt) return ` at ${formatCentralTime(pairing.startsAt)}`;
  if (pairing.ongoingUntil) return `, on until ${formatCentralShortDate(pairing.ongoingUntil)}`;
  return ", time not listed";
}

interface TonightCardProps {
  pairing: TonightPairing;
  restaurantsLoading: boolean;
}

function TonightCard({ pairing, restaurantsLoading }: TonightCardProps) {
  const { event, dinner, startsAt } = pairing;
  const title = event.title || "Event";
  const venue = venueLabel(pairing);
  const free = isFreePrice(event.price) === true;
  const eventLink = (
    <Link to={eventHref(pairing)} className={linkClass} data-tonight-link="event">
      <CutName name={title} />
    </Link>
  );

  return (
    <li
      className={cn(
        "snap-start shrink-0 flex flex-col justify-between overflow-hidden rounded-xl bg-muted p-4",
        CARD_WIDTH,
      )}
      data-tonight-card=""
      data-paired={dinner ? "true" : "false"}
    >
      <p className="line-clamp-3 text-sm leading-snug text-foreground" data-tonight-plan="">
        {dinner ? (
          <>
            <span className="text-muted-foreground">
              Dinner {formatCentralTime(dinner.dinnerAt)} at{" "}
            </span>
            <Link
              to={restaurantHref(dinner.restaurant.id, dinner.restaurant.slug)}
              className={linkClass}
              data-tonight-link="restaurant"
            >
              <CutName name={dinner.restaurant.name || "a nearby restaurant"} />
            </Link>
            <span className="text-muted-foreground">, then </span>
            {eventLink}
            {startsAt && (
              <span className="text-muted-foreground"> at {formatCentralTime(startsAt)}</span>
            )}
          </>
        ) : (
          <>
            {eventLink}
            <span className="text-muted-foreground">{whenSuffix(pairing)}</span>
          </>
        )}
      </p>

      <div className="mt-2 space-y-1 text-sm text-muted-foreground">
        <p className="flex h-5 items-center gap-1.5">
          {startsAt ? (
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : venue ? (
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : null}
          <span className="truncate">
            {startsAt ? formatCentralTime(startsAt) : null}
            {startsAt && venue ? ", " : null}
            {venue}
          </span>
        </p>
        {/* The dinner slot: filled, loading or empty, always the same height. */}
        <p className="flex h-5 items-center gap-1.5" data-tonight-dinner-line="">
          {dinner ? (
            <>
              <Utensils className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {formatMiles(dinner.distanceMiles)} from the venue
                {dinner.closesAt ? `, open until ${dinner.closesAt}` : ""}
                {dinner.restaurant.cuisine ? `, ${dinner.restaurant.cuisine}` : ""}
              </span>
            </>
          ) : restaurantsLoading && startsAt ? (
            <span
              className="block h-3 w-1/2 rounded bg-background/70 animate-pulse motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : null}
        </p>
        <p className="h-5 font-medium text-foreground">{free ? "Free" : null}</p>
      </div>
    </li>
  );
}

export function TonightRail() {
  const prerender = isPrerender();
  const {
    pairings,
    dateKey,
    weatherPicks,
    isLoading,
    restaurantsLoading,
    isError,
    refetch,
  } = useTonightPairings({ eveningOnly: true });

  const showSkeleton = prerender || (isLoading && pairings.length === 0);
  const showError = !prerender && !isLoading && isError && pairings.length === 0;
  const showNothing = !prerender && !isLoading && !isError && pairings.length === 0;
  const showCards = !prerender && pairings.length > 0;

  return (
    <section className="py-6" aria-labelledby="tonight-rail-heading" data-nosnippet="">
      <div className="container mx-auto px-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="tonight-rail-heading" className="text-xl font-semibold">
            {prerender ? (
              "Tonight in Des Moines"
            ) : (
              <>
                Tonight, <time dateTime={dateKey}>{formatTonightDate(dateKey)}</time>
              </>
            )}
          </h2>
          <Link
            to="/events/today"
            className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4"
          >
            All of today
          </Link>
        </div>
        {/* Fixed h-6 slot: a late or missing forecast changes text, not layout. */}
        <RailWeatherLine className="mb-3" picks={prerender ? null : weatherPicks} />

        <div className={cn("relative", STRIP_HEIGHT)} aria-busy={showSkeleton && !prerender}>
          {showSkeleton && (
            <ul
              className="flex h-full gap-4 overflow-hidden -mx-4 px-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:px-0"
              aria-hidden="true"
            >
              {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
                <li
                  key={`tonight-skeleton-${i}`}
                  className={cn(
                    "shrink-0 h-full rounded-xl bg-muted p-4",
                    CARD_WIDTH,
                    i >= 3 && "hidden lg:block",
                  )}
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
            <div
              className="flex h-full flex-col items-center justify-center gap-1 rounded-xl bg-muted px-4 text-center"
              data-tonight-empty=""
            >
              <p className="text-sm text-foreground">Nothing more is listed for tonight.</p>
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

          {showCards && (
            <ul
              className="flex h-full gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:pb-0"
              aria-label="Plans for tonight"
            >
              {pairings.map((pairing) => (
                <TonightCard
                  key={pairing.event.id}
                  pairing={pairing}
                  restaurantsLoading={restaurantsLoading}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
