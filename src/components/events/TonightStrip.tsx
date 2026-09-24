import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SocialEventCard } from "@/components/SocialEventCard";
import { WeatherNotice } from "@/components/WeatherNotice";
import { useWeather, reorderForWeather } from "@/hooks/useWeather";
import { useEventIndoorFlags } from "@/hooks/useEventIndoorFlags";
import type { BatchEventSocialResult } from "@/hooks/useBatchEventSocial";
import {
  relativeStartLabel,
  selectTonight,
  type HubEvent,
} from "./eventsHubQuery";

/**
 * "Tonight in Des Moines" (docs/page-plans/events.md WP1 item 9, bet 2).
 *
 * What starts in the next three hours, then what is running now by its
 * end_date, reordered for the weather when there is a verdict, with the one
 * line that says why. It reuses the /events/today machinery (useWeather,
 * reorderForWeather, useEventIndoorFlags), and the indoor lookup already
 * degrades to "no reorder" when is_indoor isn't deployed.
 *
 * It renders nothing when nothing qualifies. An empty "Tonight" box on a
 * Tuesday afternoon says less than no box.
 *
 * The rows come from the parent (useTonightStripEvents) so the parent can fold
 * their ids into the one social batch the list already makes.
 */

export interface TonightStripProps {
  /** Candidate rows from useTonightStripEvents. */
  rows: readonly HubEvent[];
  now: Date;
  socialData?: BatchEventSocialResult;
  socialDataPending?: boolean;
  onViewDetails: (event: HubEvent) => void;
}

export function TonightStrip({
  rows,
  now,
  socialData,
  socialDataPending,
  onViewDetails,
}: TonightStripProps) {
  const items = useMemo(() => selectTonight(rows, now), [rows, now]);
  const { weather, hasVerdict } = useWeather();
  const ids = useMemo(() => items.map((i) => i.event.id), [items]);
  const indoorFlags = useEventIndoorFlags(ids, hasVerdict && ids.length > 0);
  const ordered = useMemo(
    () => reorderForWeather(items, (i) => indoorFlags[i.event.id], weather),
    [items, indoorFlags, weather]
  );

  if (ordered.length === 0) return null;

  return (
    <section aria-labelledby="tonight-strip-heading" className="mb-8" data-nosnippet>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="tonight-strip-heading" className="text-xl font-bold text-foreground md:text-2xl">
          Tonight in Des Moines
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
        aria-label="Starting soon and happening now"
      >
        {ordered.map((item) => (
          <li key={item.event.id} className="w-[280px] shrink-0 snap-start sm:w-[320px]">
            <SocialEventCard
              event={item.event}
              relativeStart={relativeStartLabel(item, now)}
              socialData={socialData?.[item.event.id]}
              socialDataPending={socialDataPending}
              onViewDetails={onViewDetails}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
