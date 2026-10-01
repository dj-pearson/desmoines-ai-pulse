import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SocialEventCard } from "@/components/SocialEventCard";
import { WeatherNotice } from "@/components/WeatherNotice";
import { useWeather, reorderForWeather } from "@/hooks/useWeather";
import { useEventIndoorFlags } from "@/hooks/useEventIndoorFlags";
import { useStripDinners } from "@/hooks/useStripDinners";
import type { BatchEventSocialResult } from "@/hooks/useBatchEventSocial";
import { restaurantHref } from "@/lib/dashboardItems";
import { isPrerender } from "@/lib/isPrerender";
import { formatMiles } from "@/lib/tonightPairings";
import { relativeStartLabel, stripHeading, type HubEvent, type TonightItem } from "./eventsHubQuery";

/**
 * The hub's strip (docs/page-plans/events.md WP1 item 9; events-pass2 WP1
 * items 2-4, 11 and 18).
 *
 * Timed events starting in the next three hours, then what is running by its
 * end_date, then today's events with no published time ("Today, time not
 * listed", never a countdown to the 19:31:58 marker). Reordered for the
 * weather when there is a verdict. Titled "Starting soon" before 16:00
 * Central and "Tonight, Fri Sep 25" after.
 *
 * It renders nothing when nothing qualifies, and nothing in the prerender:
 * "Starts in 40 min" frozen into static HTML at 07:00 is wrong all day.
 *
 * The items come from the parent (selectTonight over useTonightStripEvents) so
 * the parent can fold their ids into the social batch and leave them out of
 * the list below.
 */

export interface TonightStripProps {
  items: readonly TonightItem[];
  now: Date;
  socialData?: BatchEventSocialResult;
  socialDataPending?: boolean;
  onViewDetails: (event: HubEvent) => void;
  /** The first N cards load their image eagerly (the page's LCP candidates). */
  priorityCount?: number;
}

export function TonightStrip({
  items,
  now,
  socialData,
  socialDataPending,
  onViewDetails,
  priorityCount = 0,
}: TonightStripProps) {
  const { weather, hasVerdict } = useWeather();
  const ids = useMemo(() => items.map((i) => i.event.id), [items]);
  const indoorFlags = useEventIndoorFlags(ids, hasVerdict && ids.length > 0);
  const ordered = useMemo(
    () => reorderForWeather([...items], (i) => indoorFlags[i.event.id], weather),
    [items, indoorFlags, weather]
  );
  const dinners = useStripDinners(items, now);

  if (isPrerender() || ordered.length === 0) return null;

  const heading = stripHeading(now);

  return (
    <section aria-labelledby="tonight-strip-heading" className="mb-8" data-nosnippet>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="tonight-strip-heading" className="text-xl font-bold text-foreground md:text-2xl">
          {heading}
        </h2>
        <Link
          to="/events/today"
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          All of today
        </Link>
      </div>
      <WeatherNotice weather={weather} hasVerdict={hasVerdict} className="mb-4" />
      <ul
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 scrollbar-hide"
        aria-label={heading}
      >
        {ordered.map((item, index) => {
          const dinner = dinners[item.event.id];
          return (
            <li key={item.event.id} className="flex w-[280px] shrink-0 snap-start flex-col gap-2 sm:w-[320px]">
              <SocialEventCard
                event={item.event}
                relativeStart={relativeStartLabel(item, now)}
                socialData={socialData?.[item.event.id]}
                socialDataPending={socialDataPending}
                onViewDetails={onViewDetails}
                priority={index < priorityCount}
              />
              {dinner && (
                <p className="px-1 text-sm text-muted-foreground">
                  Dinner nearby:{" "}
                  <Link
                    to={restaurantHref(dinner.restaurant)}
                    className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
                  >
                    {dinner.restaurant.name}
                  </Link>
                  , {formatMiles(dinner.distanceMiles)}
                  {dinner.closesAt ? `, open until ${dinner.closesAt}` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
