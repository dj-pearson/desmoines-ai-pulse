import { Link } from "react-router-dom";
import {
  SEASONAL_GUIDES,
  SEASONAL_THEMES,
  monthLabelOf,
  monthSlugOf,
  monthsAgo,
  monthSummary,
  seasonalPicks,
  type MonthRef,
} from "@/lib/monthPages";
import { createEventSlugWithCentralTime } from "@/lib/timezone";

interface MonthEvent {
  id: string;
  title: string;
  category?: string | null;
  date?: string | null;
  event_start_utc?: string | null;
  event_start_local?: string | null;
  event_timezone?: string | null;
}

interface MonthSeasonalBlockProps {
  month: MonthRef;
  /** Every event in the month, or undefined while loading. */
  events: MonthEvent[] | undefined;
}

/**
 * SEO-033. The intro above a month page's event list.
 *
 * The H2 uses the phrasing people search ("Things to do in Des Moines in
 * October 2026"). Everything under it is either a generic seasonal sentence from
 * SEASONAL_THEMES, a count derived from the rows on the page, a link to an
 * event on the page, or a link to a published article. Nothing is typed in by
 * hand about a specific venue, date or price.
 */
export function MonthSeasonalBlock({ month, events }: MonthSeasonalBlockProps) {
  const label = monthLabelOf(month);
  const slug = monthSlugOf(month);
  const theme = SEASONAL_THEMES[month.monthIndex];
  const guides = SEASONAL_GUIDES[slug] ?? [];
  const picks = events ? seasonalPicks(events, month.monthIndex) : [];
  const isPast = monthsAgo(month, new Date()) > 0;

  return (
    <section aria-labelledby="month-intro-heading" className="mb-8 max-w-3xl mx-auto">
      <h2 id="month-intro-heading" className="text-2xl font-semibold mb-3">
        Things to do in Des Moines in {label}
      </h2>
      {theme && <p className="text-lg mb-3">{theme.intro}</p>}
      {events && <p className="text-muted-foreground mb-4">{monthSummary(events, label, isPast)}</p>}

      {picks.length > 0 && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Seasonal picks from the {label} calendar</h3>
          <ul className="list-disc pl-5 space-y-1">
            {picks.map((event) => (
              <li key={event.id}>
                <Link
                  to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {event.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {guides.length > 0 && (
        <nav aria-label={`${label} guides`}>
          <h3 className="text-lg font-semibold mb-2">{label} guides</h3>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {guides.map((guide) => (
              <li key={guide.href}>
                <Link to={guide.href} className="text-primary underline-offset-4 hover:underline">
                  {guide.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}
