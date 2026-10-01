import { Link } from "react-router-dom";
import { DIRECTORY_PILL } from "@/components/seo/MonthLinks";
import { EVENT_SERIES, seriesAmong, seriesPath, type SeriesMatchInput } from "@/lib/eventSeries";

/**
 * Links to the annual event series pages (SEO-043).
 *
 * Without `events`, every series: the /events hub's directory. With `events`,
 * only the series that have a row among them (seriesAmong): a month page links
 * the annual events it actually lists, so October links Panda Fest and Pumpkin
 * Fest, and a month with none renders nothing.
 */

interface AnnualEventLinksProps {
  events?: readonly SeriesMatchInput[];
  title?: string;
  /** Inside EventsHubDirectory's <nav>: an h3 section, no landmark of its own. */
  embedded?: boolean;
  className?: string;
}

export function AnnualEventLinks({
  events,
  title = "Annual events",
  embedded = false,
  className = "",
}: AnnualEventLinksProps) {
  const series = events ? seriesAmong(events) : [...EVENT_SERIES];
  if (series.length === 0) return null;

  const list = (
    <ul className="flex flex-wrap gap-2">
      {series.map((s) => (
        <li key={s.slug}>
          <Link to={seriesPath(s)} className={DIRECTORY_PILL}>
            {s.name}
          </Link>
        </li>
      ))}
    </ul>
  );

  if (embedded) {
    return (
      <section className={className}>
        <h3 className="text-base font-semibold mb-3">{title}</h3>
        {list}
      </section>
    );
  }

  return (
    <nav aria-label={title} className={className}>
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      {list}
    </nav>
  );
}
