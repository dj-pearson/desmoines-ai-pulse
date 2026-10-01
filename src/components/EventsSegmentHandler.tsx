/**
 * Routes /events/:segment to either MonthlyEventsPage (month-year format)
 * or EventDetails (event slug). Prevents Soft 404 when month-year URLs
 * (e.g. /events/march-2026) were incorrectly showing "Event Not Found".
 *
 * Both branches are lazy (events-pass2 WP3 item 13), behind one Suspense, so
 * an event page doesn't download the month page and a month page doesn't
 * download the detail page with its map, share and calendar code.
 */
import { lazy, Suspense, type ComponentType } from "react";
import { useParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { RouteCanonical } from "@/components/RouteCanonical";

/** One retry on a failed chunk load (a deploy between page load and click). */
function lazyWithRetry<T extends ComponentType>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch(() => load()));
}

const EventDetails = lazyWithRetry(() => import("@/pages/EventDetails"));
const MonthlyEventsPage = lazyWithRetry(() => import("@/pages/MonthlyEventsPage"));

const MONTH_YEAR_PATTERN = /^(january|february|march|april|may|june|july|august|september|october|november|december)-\d{4}$/i;

/**
 * The same shape as EventDetails' own loading state, with the canonical
 * emitted from the route (SEO-028), so a prerender capture that lands while
 * the chunk is still loading still has one.
 */
function SegmentLoadingState({ slug }: { slug: string | undefined }) {
  return (
    <div className="min-h-screen bg-background">
      <RouteCanonical path={`/events/${slug ?? ""}`} />
      <Header />
      <div
        className="container mx-auto px-4 py-8"
        role="status"
        aria-busy="true"
        aria-label="Loading"
      >
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-muted rounded w-1/4" />
          <div className="h-72 md:h-96 bg-muted rounded-2xl" />
          <div className="space-y-4">
            <div className="h-10 bg-muted rounded w-3/4" />
            <div className="h-6 bg-muted rounded w-1/2" />
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default function EventsSegmentHandler() {
  const { slug } = useParams<{ slug: string }>();
  const isMonthYear = slug ? MONTH_YEAR_PATTERN.test(slug) : false;

  return (
    <Suspense fallback={<SegmentLoadingState slug={slug} />}>
      {isMonthYear ? <MonthlyEventsPage /> : <EventDetails />}
    </Suspense>
  );
}
