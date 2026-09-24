import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatInTimeZone } from "date-fns-tz";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FAQSection } from "@/components/FAQSection";
import { RestaurantCard } from "@/components/RestaurantCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import RelatedContent from "@/components/RelatedContent";
import { Card, CardContent } from "@/components/ui/card";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ErrorState } from "@/components/ui/error-state";
import {
  deriveOpenNow,
  OPEN_NOW_ROW_LIMIT,
  useOpenNowRestaurants,
  type EvaluatedRestaurant,
} from "@/hooks/useOpenNowRestaurants";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { DES_MOINES_TIME_ZONE, formatOpenStatusLine } from "@/lib/restaurantHours";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";

/**
 * /restaurants/open-now (eat-drink plan WP5).
 *
 * Every restaurant with listed hours is fetched once; which of them is open
 * is re-derived each minute on the Central clock, so a place leaves the list
 * at its close without a refetch. The copy claims no more than the data
 * backs: the hours are listing text, and the page says so.
 */

const PAGE_TITLE = `Restaurants Open Now in Des Moines | ${BRAND.name}`;
// Static on purpose: a count here would be whatever the prerender saw.
const PAGE_DESCRIPTION =
  "Which Des Moines restaurants are open right now, checked against each place's listed hours in Central time. Call ahead on holidays.";

const BREADCRUMBS = [
  { name: "Restaurants", url: "/restaurants" },
  { name: "Open Now", url: "/restaurants/open-now" },
];

const FAQ_DATA = [
  {
    question: "Which restaurants in Des Moines are open right now?",
    answer:
      "This page checks the listed hours of every restaurant we track against the current time in Des Moines (Central time) and shows the ones that are open. Listed hours can be out of date, especially around holidays, so call ahead if you're cutting it close.",
  },
  {
    question: "What restaurants are open late in Des Moines?",
    answer:
      "Late in the evening this page lists every place whose listed hours run past midnight tonight. Weekend hours usually run later than weekday hours, and fast food drive-thrus tend to stay open latest. Check individual hours, as they vary.",
  },
  {
    question: "Are restaurants open on Sundays in Des Moines?",
    answer:
      "Most Des Moines restaurants open on Sundays, though hours often differ from weekdays and brunch (roughly 10 AM - 2 PM) is common. Some locally owned restaurants close Sundays or Mondays. On a Sunday, this page shows which places with listed hours are open.",
  },
  {
    question: "What time do most Des Moines restaurants close?",
    answer:
      "Lunch spots often close by 2-3 PM. Casual dining usually closes 9-10 PM on weekdays and 10-11 PM on weekends, and bars and late-night spots close between midnight and 2 AM. Des Moines has fewer 24-hour options than larger cities.",
  },
  {
    question: "Can I order delivery from restaurants open now?",
    answer:
      "Many open restaurants deliver through DoorDash, Uber Eats or Grubhub, and some run their own delivery. Delivery hours can end 30-60 minutes before the kitchen closes, so check the restaurant's website or delivery app.",
  },
  {
    question: "Do restaurant hours change seasonally in Des Moines?",
    answer:
      "Yes. Many restaurants cut hours in winter (November-March), some extend hours during the Iowa State Fair in August, and most close or shorten hours on Thanksgiving, Christmas and New Year's Day. Holiday hours aren't in our listings, so call ahead.",
  },
];

function centralHour(now: Date): number {
  return Number(formatInTimeZone(now, DES_MOINES_TIME_ZONE, "H"));
}

function timeOfDayHeading(hour: number): string {
  if (hour >= 5 && hour < 11) return "Breakfast and brunch spots open now";
  if (hour >= 11 && hour < 16) return "Lunch spots open now";
  if (hour >= 16 && hour < 21) return "Dinner options open now";
  return "Late-night food open now";
}

function RestaurantGrid({ items }: { items: readonly EvaluatedRestaurant[] }) {
  return (
    <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" role="list">
      {items.map(({ restaurant }, index) => (
        <li key={restaurant.id} className="content-auto">
          <RestaurantCard restaurant={restaurant} priority={index < 3} />
        </li>
      ))}
    </ul>
  );
}

function RestaurantLinkList({ items }: { items: readonly EvaluatedRestaurant[] }) {
  return (
    <ul className="divide-y divide-border rounded-xl border">
      {items.map(({ restaurant, status }) => (
        <li key={restaurant.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
          <Link
            to={`/restaurants/${restaurant.slug || restaurant.id}`}
            className="font-semibold text-foreground hover:text-primary hover:underline"
          >
            {restaurant.name}
          </Link>
          <span className="text-sm text-muted-foreground">{formatOpenStatusLine(status)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function OpenNowRestaurants() {
  const now = useMinuteClock();
  const { data: rows, isLoading, error, refetch } = useOpenNowRestaurants();

  const view = useMemo(() => (rows ? deriveOpenNow(rows, now) : null), [rows, now]);

  const hour = centralHour(now);
  const isLateNight = hour >= 21 || hour < 6;
  const showPastMidnight = hour >= 18 || hour < 6;
  const clockLabel = `${formatInTimeZone(now, DES_MOINES_TIME_ZONE, "h:mm a")} CT`;
  const dateLabel = formatInTimeZone(now, DES_MOINES_TIME_ZONE, "EEEE, MMMM d, yyyy");

  const openCount = view ? view.open.length + view.closingSoon.length : 0;
  const listedCount = view ? view.withListedHours : 0;
  const atLimit = (rows?.length ?? 0) >= OPEN_NOW_ROW_LIMIT;

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={PAGE_TITLE}
        pageDescription={PAGE_DESCRIPTION}
        canonicalUrl={getCanonicalUrl("/restaurants/open-now")}
        pageType="website"
        breadcrumbs={BREADCRUMBS}
        faqData={FAQ_DATA}
        isTimeSensitive={true}
        keywords={[
          "restaurants open now Des Moines",
          "open restaurants Des Moines",
          "restaurants open late Des Moines",
          "24 hour restaurants Des Moines",
          "late night food Des Moines",
          "restaurants open Sunday Des Moines",
          "delivery restaurants open now",
          "breakfast open now Des Moines",
        ]}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Restaurants", href: "/restaurants" },
            { label: "Open Now" },
          ]}
          className="mb-4"
        />

        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <SpriteIcon name="clock" className="h-6 w-6 text-primary animate-pulse motion-reduce:animate-none" />
            <h1 className="text-3xl font-bold">Restaurants Open Now in Des Moines</h1>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
            <span className="flex items-center gap-1">
              <SpriteIcon name="calendar" className="h-4 w-4" />
              {dateLabel}
            </span>
            <span className="flex items-center gap-1">
              <SpriteIcon name="clock" className="h-4 w-4" />
              <time className="font-semibold text-green-700 dark:text-green-400" data-open-now-clock>
                {clockLabel}
              </time>
            </span>
            <span className="flex items-center gap-1">
              <SpriteIcon name="map-pin" className="h-4 w-4" />
              Des Moines Metro
            </span>
          </div>

          <p className="mb-2 max-w-[70ch] text-lg text-muted-foreground" data-open-now-summary>
            {view ? (
              <strong className="text-foreground">
                {openCount} of {listedCount}
                {atLimit ? "+" : ""} restaurants with listed hours are open right now.
              </strong>
            ) : (
              <strong className="text-foreground">Checking listed hours against the time in Des Moines.</strong>
            )}{" "}
            Planning a <Link to="/events/date-night" className="font-semibold text-primary hover:underline">date night</Link>? Check hours before your event.
          </p>
          <p className="max-w-[70ch] text-sm text-muted-foreground">
            Hours come from each restaurant's listing and can be out of date. Call ahead to confirm, especially on holidays.
          </p>
        </div>

        {view && (
          <dl className="mb-8 grid grid-cols-2 gap-4 rounded-xl bg-muted/60 px-4 py-5 text-center">
            <div>
              <dt className="text-sm text-muted-foreground">Open now</dt>
              <dd className="text-2xl font-bold text-green-700 dark:text-green-400">{openCount}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">With listed hours</dt>
              <dd className="text-2xl font-bold text-foreground">
                {listedCount}
                {atLimit ? "+" : ""}
              </dd>
            </div>
          </dl>
        )}

        {error && !isLoading ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading || !view ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse motion-reduce:animate-none">
                <div className="mb-4 h-48 rounded-lg bg-muted"></div>
                <div className="mb-2 h-4 w-3/4 rounded bg-muted"></div>
                <div className="h-4 w-1/2 rounded bg-muted"></div>
              </div>
            ))}
          </div>
        ) : openCount > 0 ? (
          <>
            {view.open.length > 0 && (
              <section aria-labelledby="open-now-heading" className="mb-10">
                <h2 id="open-now-heading" className="mb-6 text-2xl font-bold">
                  {timeOfDayHeading(hour)} ({view.open.length})
                </h2>
                <RestaurantGrid items={view.open} />
              </section>
            )}
            {view.closingSoon.length > 0 && (
              <section aria-labelledby="closing-soon-heading" className="mb-10">
                <h2 id="closing-soon-heading" className="mb-6 text-2xl font-bold">
                  Closing within the hour ({view.closingSoon.length})
                </h2>
                <RestaurantGrid items={view.closingSoon} />
              </section>
            )}
          </>
        ) : (
          <section aria-labelledby="none-open-heading" className="mb-10" data-open-now-empty>
            <h2 id="none-open-heading" className="mb-4 text-2xl font-bold">
              Nothing we have hours for is open right now ({clockLabel})
            </h2>
            {view.nextToOpen.length > 0 ? (
              <>
                <p className="mb-4 text-muted-foreground">Next to open:</p>
                <RestaurantLinkList items={view.nextToOpen} />
              </>
            ) : (
              <p className="text-muted-foreground">
                Browse <Link to="/restaurants" className="font-semibold text-primary hover:underline">all restaurants</Link> instead.
              </p>
            )}
          </section>
        )}

        {view && showPastMidnight && view.openPastMidnight.length > 0 && (
          <section aria-labelledby="past-midnight-heading" className="mb-10">
            <h2 id="past-midnight-heading" className="mb-2 text-xl font-semibold">
              Open past midnight tonight ({view.openPastMidnight.length})
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Places whose listed hours have them open at 12:30 AM.
            </p>
            <RestaurantLinkList items={view.openPastMidnight} />
          </section>
        )}

        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="mb-4 text-xl font-semibold">Des Moines Restaurant Hours Guide</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-semibold">Breakfast and brunch (6 AM - 11 AM)</h3>
                <p className="text-sm text-muted-foreground">
                  Diners and bakeries open earliest. Sunday brunch is busiest from 10 AM to noon, so arrive early or reserve.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Lunch (11 AM - 2 PM)</h3>
                <p className="text-sm text-muted-foreground">
                  The downtown lunch rush runs 11:30 AM - 1 PM. Suburban spots are less crowded. Lunch service usually ends 2-3 PM.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Dinner (5 PM - 10 PM)</h3>
                <p className="text-sm text-muted-foreground">
                  Prime dinner hours are 6-8 PM. Reserve for upscale dining; most casual restaurants take walk-ins. Last seating is often 30-60 minutes before close.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Late night (after 10 PM)</h3>
                <p className="text-sm text-muted-foreground">
                  {isLateNight
                    ? "It's late. The list above only shows places whose listed hours run this late."
                    : "Late-night dining is limited compared to larger cities. Court Avenue and the East Village stay open latest, and fast food drive-thrus later still."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-8">
          <CardContent className="pt-6">
            <h2 className="mb-4 text-xl font-semibold">Ordering from Restaurants Open Now</h2>
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <h3 className="mb-2 font-semibold">Delivery apps</h3>
                <p className="text-sm text-muted-foreground">
                  DoorDash, Uber Eats and Grubhub serve Des Moines. Ordering direct from the restaurant is often cheaper.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Pickup and takeout</h3>
                <p className="text-sm text-muted-foreground">
                  Call ahead for faster service; many restaurants offer curbside pickup. Browse our{" "}
                  <Link to="/restaurants/dietary" className="font-semibold text-primary hover:underline">dietary-friendly restaurants</Link>{" "}
                  for specialized options.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold">Kitchen close times</h3>
                <p className="text-sm text-muted-foreground">
                  Kitchens often close 30-60 minutes before the dining room, and delivery orders may be refused near close. Call if you're cutting it close.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SEO-003: the FAQ is rendered here, so the FAQPage block FAQSection
            emits matches what visitors see. The answers are static text, so
            the prerender and the live render emit the same block. */}
        <FAQSection faqs={FAQ_DATA} />

        <RelatedContent currentPath="/restaurants/open-now" title="More Des Moines Dining & Activities" />
      </div>

      <Footer />
    </div>
  );
}
