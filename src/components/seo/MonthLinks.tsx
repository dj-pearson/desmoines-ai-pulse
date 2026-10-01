import { Link } from "react-router-dom";
import { centralMonthOf, monthName, monthSlug, shiftMonth } from "@/lib/monthPages";

/**
 * SEO-016: links to the upcoming month index pages.
 *
 * /events/september-2026 and its siblings already work - EventsSegmentHandler
 * dispatches a month-year slug on /events/:slug to MonthlyEventsPage, which
 * declares its own canonical and emits EventListJsonLd. They were in no
 * sitemap, in no prerender route, and LINKED FROM NOWHERE, so nothing could
 * reach them. A page that works and cannot be discovered is indistinguishable
 * from one that was never built.
 *
 * The sitemap half is handled in scripts/generate-dynamic-sitemaps.ts, where the
 * month set is derived from real event rows so a month with no events is never
 * published. This is the on-site half: crawlers follow links, and a URL that
 * appears only in a sitemap is a weak signal.
 *
 * "des moines events september 2026" is how somebody searches a calendar, and
 * the demand shows in Search Console before the page exists to serve it:
 * "des moines festivals 2026" already earns 2.51% CTR at position 10.3.
 *
 * WHY THIS COMPONENT DOES NOT CHECK FOR EVENTS. It renders the next N months
 * from today, unconditionally, and that is a deliberate difference from the
 * sitemap. A visitor clicking "October 2026" and finding it quiet is a normal,
 * honest empty state - MonthlyEventsPage handles that. Submitting the same URL
 * to Google is a different act, and that is where the >= 3 events floor lives.
 * Linking is cheap and reversible; sitemapping a thin page is neither.
 */

export interface MonthLink {
  slug: string;
  label: string;
  href: string;
}

/**
 * The next `count` months starting from `from`, inclusive of the current one.
 * Exported so a test can pin the rollover without waiting for December.
 *
 * The current month is the CENTRAL month (events-pass2 WP6 item 3). It used
 * to be the browser's local month, so at 8 PM CDT on Sep 30 a visitor on UTC
 * (and the prerender, which runs on UTC) was offered October first while the
 * month pages and the sitemap still counted it as September.
 */
export function upcomingMonths(from: Date = new Date(), count = 6): MonthLink[] {
  const start = centralMonthOf(from);
  const out: MonthLink[] = [];
  for (let i = 0; i < count; i++) {
    const ref = shiftMonth(start, i);
    const slug = monthSlug(ref);
    out.push({ slug, label: monthName(ref), href: `/events/${slug}` });
  }
  return out;
}

/**
 * Shared pill style for the events directory. min-h-11 is the 44px touch target
 * (the old py-1.5 pill was about 34px tall and failed touch-targets at 375px).
 */
export const DIRECTORY_PILL =
  "inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface MonthLinksProps {
  count?: number;
  className?: string;
  /**
   * Render as a section (h3, no landmark) inside a directory that owns the
   * <nav>. Standalone use keeps its own nav and h2.
   */
  embedded?: boolean;
}

export function MonthLinks({ count = 6, className = "", embedded = false }: MonthLinksProps) {
  const months = upcomingMonths(new Date(), count);
  const list = (
    <ul className="flex flex-wrap gap-2">
      {months.map((m) => (
        <li key={m.slug}>
          <Link to={m.href} className={DIRECTORY_PILL}>
            {m.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  if (embedded) {
    return (
      <section className={className}>
        <h3 className="text-base font-semibold mb-3">Events by month</h3>
        {list}
      </section>
    );
  }

  return (
    <nav aria-label="Events by month" className={className}>
      <h2 className="text-lg font-semibold mb-3">Events by month</h2>
      {list}
    </nav>
  );
}

export default MonthLinks;
