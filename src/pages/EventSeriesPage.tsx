import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { RouteCanonical } from "@/components/RouteCanonical";
import NoIndexMeta from "@/components/schema/NoIndexMeta";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import { DIRECTORY_PILL } from "@/components/seo/MonthLinks";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { useEventSeriesPage } from "@/hooks/useEventSeriesPage";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { EVENT_SERIES, getEventSeries, seriesPath, type EventSeriesDef } from "@/lib/eventSeries";
import {
  buildEventSeriesJsonLd,
  buildSeriesView,
  centralDayWords,
  editionDateLabel,
  seriesPageUrl,
  unannouncedLabel,
  type SeriesEdition,
  type SeriesInstance,
} from "@/lib/eventSeriesView";
import { eventRunLabel, eventTimeLabel } from "@/lib/eventTiming";
import { toJsonLd } from "@/lib/jsonLd";
import { monthName, monthSlug } from "@/lib/monthPages";

/**
 * /events/series/:slug (SEO-043). One URL per annual event that outlives
 * each year's dated URL. The 20 series are EVENT_SERIES in
 * src/lib/eventSeries.ts; the dates are whatever the `events` rows say, and
 * nothing else: with no row for next year the page says so rather than
 * guessing a date.
 */

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function InstanceLine({ instance, now }: { instance: SeriesInstance; now: Date }) {
  const { row, day, href } = instance;
  const when = centralDayWords(day, "EEE, MMM d");
  const time = eventTimeLabel(row);
  const run = eventRunLabel(row, now);
  const place = row.venue?.trim() || row.location?.trim() || null;
  return (
    <li className="py-3">
      <p className="font-medium">
        {href ? (
          <Link to={href} className="text-primary hover:underline inline-flex min-h-11 items-center">
            {when}: {row.title}
          </Link>
        ) : (
          <span>
            {when}: {row.title}
          </span>
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {[run ?? time, place].filter(Boolean).join(" - ")}
      </p>
    </li>
  );
}

function EditionDates({ edition, now }: { edition: SeriesEdition; now: Date }) {
  return (
    <ul className="divide-y">
      {edition.instances.map((instance) => (
        <InstanceLine key={instance.row.id} instance={instance} now={now} />
      ))}
    </ul>
  );
}

function OtherSeries({ current }: { current: EventSeriesDef }) {
  const others = EVENT_SERIES.filter((s) => s.slug !== current.slug);
  return (
    <nav aria-label="Other annual Des Moines events" className="mt-12">
      <h2 className="text-xl font-semibold mb-4">Other annual events in Des Moines</h2>
      <ul className="flex flex-wrap gap-2">
        {others.map((s) => (
          <li key={s.slug}>
            <Link to={seriesPath(s)} className={DIRECTORY_PILL}>
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SeriesNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <NoIndexMeta />
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
        <h1 className="text-2xl font-bold mb-3">No annual event by that name</h1>
        <p className="text-muted-foreground mb-6">The events calendar lists everything coming up in Des Moines.</p>
        <Button asChild className="min-h-11">
          <Link to="/events">Browse events</Link>
        </Button>
      </div>
      <Footer />
    </div>
  );
}

export default function EventSeriesPage() {
  const { slug } = useParams<{ slug: string }>();
  const def = getEventSeries(slug);
  const { rows, isLoading, error, refetch } = useEventSeriesPage(def);
  const now = useMemo(() => new Date(), []);
  const view = useMemo(() => (def ? buildSeriesView(def, rows, now) : null), [def, rows, now]);

  if (!def) return <SeriesNotFound />;

  const path = seriesPath(def);
  const url = seriesPageUrl(def);
  const breadcrumbSchema = [
    { name: "Home", url: BRAND.baseUrl },
    { name: "Events", url: getCanonicalUrl("/events") },
    { name: def.name, url },
  ];

  if (isLoading || !view) {
    return (
      <div className="min-h-screen bg-background">
        <RouteCanonical path={path} />
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-3xl" role="status" aria-busy="true">
          <p className="sr-only">Loading annual event dates...</p>
          <Skeleton className="h-10 w-2/3 mb-4" />
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Footer />
      </div>
    );
  }

  if (error && rows.length === 0) {
    // A failed read is not "no dates on file": no noindex here.
    return (
      <div className="min-h-screen bg-background">
        <RouteCanonical path={path} />
        <Header />
        <div className="container mx-auto px-4 py-16">
          <ErrorState error={error} onRetry={() => void refetch()} />
        </div>
        <Footer />
      </div>
    );
  }

  const { current, past, unannouncedYear, officialUrl, venue, total } = view;
  const latestPast = past[0] ?? null;
  const headingYear = current ? ` ${current.year}` : "";
  const title = current
    ? `${def.name} ${current.year} in Des Moines: Dates and Venue`
    : `${def.name} in Des Moines: Past Dates and What's Next`;

  // "on Friday, October 2, 2026" or "from Thursday, July 30 to Sunday, August 2, 2026".
  const when = (edition: SeriesEdition) =>
    `${edition.firstDay === edition.lastDay ? "on" : "from"} ${editionDateLabel(edition)}`;
  const summary = current
    ? `${def.name} ${current.year} is ${when(current)}${venue ? ` at ${venue}` : ""}.`
    : latestPast
      ? `${def.name} was last held ${when(latestPast)}${venue ? ` at ${venue}` : ""}. ${unannouncedLabel(unannouncedYear as number)}.`
      : `${unannouncedLabel(unannouncedYear as number)}.`;
  // The tail only when it still fits Google's ~160-character snippet.
  const tail = " Every year's dates and the venue.";
  const description = summary.length + tail.length <= 160 ? `${summary}${tail}` : summary;

  // Nothing on file at all is a thin page; it stays out of the index.
  const noindex = total === 0;

  return (
    <>
      <RouteCanonical path={path} />
      {noindex && <NoIndexMeta />}
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{toJsonLd(buildEventSeriesJsonLd(def, view))}</script>
      </Helmet>
      <BreadcrumbListSchema items={breadcrumbSchema} />

      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Breadcrumbs
            className="mb-4"
            items={[
              { label: "Home", href: "/" },
              { label: "Events", href: "/events" },
              { label: def.name },
            ]}
          />

          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            {def.name}
            {headingYear}
          </h1>
          <p id="series-summary" className="text-lg mb-2 max-w-prose">
            {summary}
          </p>
          <p className="text-muted-foreground mb-6 max-w-prose">{def.about}</p>

          {officialUrl && (
            <p className="mb-8">
              <a
                href={officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 text-primary hover:underline"
              >
                <SpriteIcon name="external-link" className="h-4 w-4" />
                Official site: {hostLabel(officialUrl)}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          )}

          <section aria-labelledby="series-current" className="mb-10">
            <h2 id="series-current" className="text-2xl font-bold mb-2">
              {current ? `${current.year} dates` : `${unannouncedYear} dates`}
            </h2>
            {current ? (
              <>
                <EditionDates edition={current} now={now} />
                <p className="mt-3 text-sm">
                  <Link
                    to={`/events/${monthSlug({ year: current.year, month: Number(current.firstDay.slice(5, 7)) })}`}
                    className="inline-flex min-h-11 items-center text-primary hover:underline"
                  >
                    Everything else on in{" "}
                    {monthName({ year: current.year, month: Number(current.firstDay.slice(5, 7)) })}
                  </Link>
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                {unannouncedLabel(unannouncedYear as number)}. This page lists the date once the organiser
                publishes it and it reaches our calendar.
              </p>
            )}
          </section>

          {past.length > 0 && (
            <section aria-labelledby="series-past" className="mb-10">
              <h2 id="series-past" className="text-2xl font-bold mb-4">
                Past years
              </h2>
              {past.map((edition) => (
                <div key={edition.year} className="mb-6">
                  <h3 className="text-lg font-semibold">{edition.year}</h3>
                  <p className="text-sm text-muted-foreground">
                    {editionDateLabel(edition)}
                    {edition.venues.length > 0 ? `, ${edition.venues.join(" and ")}` : ""}
                  </p>
                  <EditionDates edition={edition} now={now} />
                </div>
              ))}
            </section>
          )}

          <p className="text-sm text-muted-foreground">
            <Link to="/events" className="inline-flex min-h-11 items-center text-primary hover:underline">
              All upcoming Des Moines events
            </Link>
          </p>

          <OtherSeries current={def} />
        </div>
        <Footer />
      </div>
    </>
  );
}
