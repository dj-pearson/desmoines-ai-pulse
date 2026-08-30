import { Link } from "react-router-dom";

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

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthLink {
  slug: string;
  label: string;
  href: string;
}

/**
 * The next `count` months starting from `from`, inclusive of the current one.
 * Exported so a test can pin the rollover without waiting for December.
 */
export function upcomingMonths(from: Date = new Date(), count = 6): MonthLink[] {
  const out: MonthLink[] = [];
  const year = from.getFullYear();
  const month = from.getMonth();
  for (let i = 0; i < count; i++) {
    const d = new Date(year, month + i, 1);
    const slug = `${MONTH_NAMES[d.getMonth()]}-${d.getFullYear()}`;
    out.push({
      slug,
      label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
      href: `/events/${slug}`,
    });
  }
  return out;
}

export function MonthLinks({
  count = 6,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  const months = upcomingMonths(new Date(), count);
  return (
    <nav aria-label="Events by month" className={className}>
      <h2 className="text-lg font-semibold mb-3">Events by month</h2>
      <ul className="flex flex-wrap gap-2">
        {months.map((m) => (
          <li key={m.slug}>
            <Link
              to={m.href}
              className="inline-block rounded-full border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
            >
              {m.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default MonthLinks;
