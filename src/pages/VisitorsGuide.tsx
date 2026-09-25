import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { NewsletterSignup } from '@/components/NewsletterSignup';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Hotel, Navigation, Utensils } from 'lucide-react';
import type { LandingEvent } from '@/hooks/useEventLanding';
import { ongoingLabel, useEventsInRange } from '@/hooks/useEventsInRange';
import { useHotels } from '@/hooks/useHotels';
import { deriveOpenNow, useOpenNowRestaurants } from '@/hooks/useOpenNowRestaurants';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { handleError } from '@/lib/errorHandler';
import { hotelRateLabel } from '@/lib/hotelBooking';
import { isPrerender } from '@/lib/isPrerender';
import {
  addCentralDays,
  centralDateOf,
  centralWeekday,
  centralWindow,
  createEventSlugWithCentralTime,
  formatEventDateShort,
  type CentralDate,
} from '@/lib/timezone';
import { AIRPORT_TO_DOWNTOWN } from '@/lib/transitFacts';

/*
 * plan-stay WP3 items 1 and 4. This page used to sell a "2026 Edition" guide:
 * a download-by-email form that said "Check your email" and a mailing-address
 * form that said "Your free guide is on its way!". No code sends that email,
 * public/ has no PDF, nothing reads guide_requests, and both handlers ignored
 * supabase-js's { error }, so the success toast fired even when the insert
 * failed. The page is now the guide: live modules that open onto our own
 * listings, and email capture through NewsletterSignup, which already does
 * double opt-in and rate limiting.
 */

const WEEKEND_LIMIT = 6;
const HOTEL_LIMIT = 3;
const OPEN_NOW_LIMIT = 3;

/**
 * The rest of this weekend, as Central dates: from today (or the coming
 * Friday, Monday to Thursday) through Sunday. On a Saturday that is Saturday
 * and Sunday, never Friday's finished shows (plan-stay-pass2 WP3 item 2).
 */
function weekendRemainder(now: Date): { from: CentralDate; to: CentralDate } {
  const today = centralDateOf(now);
  const weekday = centralWeekday(today);
  if (weekday === 0) return { from: today, to: today };
  const sunday = addCentralDays(today, 7 - weekday);
  const from = weekday >= 5 ? today : addCentralDays(sunday, -2);
  return { from, to: sunday };
}

/**
 * When a row stops being worth listing. With an end_date, the end of that
 * Central day for a date-only value, else the instant itself. Without one,
 * the start: a 7 PM show with no end time is behind us at 7:01.
 */
function endsAt(event: LandingEvent): number {
  if (event.end_date) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(event.end_date)) {
      return new Date(centralWindow({ kind: 'single', date: event.end_date }).end).getTime();
    }
    const t = new Date(event.end_date).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return event.date ? new Date(event.date).getTime() : Number.NEGATIVE_INFINITY;
}

/** True once the element has come within 200px of the viewport. Stays true. */
function useSeen<T extends Element>(): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(
    () => typeof window !== 'undefined' && typeof window.IntersectionObserver === 'undefined',
  );
  useEffect(() => {
    if (seen) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen];
}

interface GuideModuleProps {
  id: string;
  title: string;
  icon: ReactNode;
  cta: { to: string; label: string };
  children?: ReactNode;
}

function GuideModule({ id, title, icon, cta, children }: GuideModuleProps) {
  return (
    <section aria-labelledby={id} className="mb-12">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 id={id} className="text-2xl font-bold">
          {title}
        </h2>
      </div>
      {children}
      <Button asChild variant="outline" className="min-h-11 mt-4">
        <Link to={cta.to}>{cta.label}</Link>
      </Button>
    </section>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i}>
          <Skeleton className="h-12 w-full rounded-lg" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Up to six events still ahead this weekend, including ones already running
 * (a Fri-Sun festival shows on Saturday). Hides itself when there are none or
 * the read fails. The prerendered HTML carries only the heading and the link:
 * a list frozen at build time is wrong by the weekend.
 */
function ThisWeekendModule() {
  const prerender = isPrerender();
  const [now] = useState(() => new Date());
  const { from, to } = weekendRemainder(now);
  const { data, isLoading, isError, error } = useEventsInRange(prerender ? null : from, prerender ? null : to);

  useEffect(() => {
    if (isError) handleError(error, { component: 'VisitorsGuide', action: 'loadWeekendEvents' });
  }, [isError, error]);

  const events = useMemo(() => {
    const cutoff = now.getTime();
    return (data ?? []).filter((event) => endsAt(event) >= cutoff).slice(0, WEEKEND_LIMIT);
  }, [data, now]);

  const module = (children?: ReactNode) => (
    <GuideModule
      id="guide-weekend"
      title="This weekend"
      icon={<Calendar className="h-5 w-5 text-primary" aria-hidden="true" />}
      cta={{ to: '/events/this-weekend', label: 'Everything on this weekend' }}
    >
      {children}
    </GuideModule>
  );

  if (prerender) return module();
  if (isError || (!isLoading && events.length === 0)) return null;

  const today = centralDateOf(now);
  return module(
    isLoading ? (
      <ListSkeleton rows={3} />
    ) : (
      <ul className="divide-y divide-border rounded-xl border bg-card">
        {events.map((event) => (
          <li key={event.id} className="p-4">
            <Link
              to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
              className="font-semibold hover:underline"
            >
              {event.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              {ongoingLabel(event, today) ?? formatEventDateShort(event)}
              {event.venue ? ` - ${event.venue}` : ''}
            </p>
          </li>
        ))}
      </ul>
    ),
  );
}

/**
 * Three restaurants open right now, with their closing time
 * (plan-stay-pass2 WP3 item 7). Fetches only once the module is near the
 * viewport, never in the prerender. Same query key as /restaurants/open-now,
 * so the tap-through is already cached. The list hides when nothing is open;
 * the heading and the link stay.
 */
function OpenNowModule() {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const enabled = seen && !isPrerender();
  const { data, isError, error } = useOpenNowRestaurants({ enabled });

  useEffect(() => {
    if (isError) handleError(error, { component: 'VisitorsGuide', action: 'loadOpenNow' });
  }, [isError, error]);

  const open = useMemo(() => {
    if (!data) return [];
    const view = deriveOpenNow(data, new Date(), 0);
    return [...view.open, ...view.closingSoon].slice(0, OPEN_NOW_LIMIT);
  }, [data]);

  return (
    <div ref={ref}>
      <GuideModule
        id="guide-open-now"
        title="Open now"
        icon={<Utensils className="h-5 w-5 text-primary" aria-hidden="true" />}
        cta={{ to: '/restaurants/open-now', label: 'Restaurants open right now' }}
      >
        <p className="text-muted-foreground max-w-prose">
          Worked out from each restaurant&apos;s posted hours in Central time, so it changes through the day.
        </p>
        {open.length > 0 && (
          <ul className="mt-4 divide-y divide-border rounded-xl border bg-card" data-open-now-list>
            {open.map(({ restaurant, status }) => (
              <li key={restaurant.id} className="p-4">
                <Link
                  to={`/restaurants/${restaurant.slug ?? restaurant.id}`}
                  className="font-semibold hover:underline"
                >
                  {restaurant.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {[restaurant.cuisine, status.closesAt ? `closes ${status.closesAt}` : 'open now']
                    .filter(Boolean)
                    .join(' - ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </GuideModule>
    </div>
  );
}

/** Three hotels, featured first. The list hides when empty or failed; the link to /stay stays. */
function WhereToStayModule() {
  const { hotels, isLoading, error } = useHotels({ sortBy: 'featured', limit: HOTEL_LIMIT, countMode: 'none' });

  useEffect(() => {
    if (error) handleError(new Error(error), { component: 'VisitorsGuide', action: 'loadHotels' });
  }, [error]);

  const showList = !error && (isLoading || hotels.length > 0);

  return (
    <GuideModule
      id="guide-stay"
      title="Where to stay"
      icon={<Hotel className="h-5 w-5 text-primary" aria-hidden="true" />}
      cta={{ to: '/stay', label: 'Browse Des Moines hotels' }}
    >
      <p className="text-muted-foreground mb-4 max-w-prose">
        Downtown puts you on the skywalk and within walking distance of most venues. West Des Moines is
        closer to Jordan Creek and Valley Junction.
      </p>
      {showList &&
        (isLoading ? (
          <ListSkeleton rows={HOTEL_LIMIT} />
        ) : (
          <ul className="divide-y divide-border rounded-xl border bg-card">
            {hotels.map((hotel) => {
              const rate = hotelRateLabel(hotel.avg_nightly_rate);
              return (
                <li key={hotel.id} className="p-4">
                  <Link to={`/stay/${hotel.slug}`} className="font-semibold hover:underline">
                    {hotel.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {[hotel.area, rate].filter(Boolean).join(' - ')}
                  </p>
                </li>
              );
            })}
          </ul>
        ))}
    </GuideModule>
  );
}

export default function VisitorsGuide() {
  return (
    <>
      <SEOHead
        title="Des Moines Visitor Guide"
        description="Plan a visit to Des Moines: what's on this weekend, restaurants open right now, where to stay and how to get around, from live listings."
        url={getCanonicalUrl('/visitors-guide')}
        canonicalUrl={getCanonicalUrl('/visitors-guide')}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Visitor Guide', url: '/visitors-guide' },
        ]}
      />
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-3">Des Moines Visitor Guide</h1>
            <p className="text-lg text-muted-foreground max-w-prose">
              What&apos;s on, where to eat, where to sleep and how to get around, pulled from the same
              listings as the rest of the site. Start with{' '}
              <Link to="/events" className="underline">
                all events
              </Link>{' '}
              if you already know what you&apos;re after, or{' '}
              <Link to="/trip-planner" className="underline">
                pick your dates
              </Link>{' '}
              to see what&apos;s on each day you&apos;re here.
            </p>
          </div>

          <ThisWeekendModule />

          <OpenNowModule />

          <WhereToStayModule />

          <GuideModule
            id="guide-getting-here"
            title="Getting here and around"
            icon={<Navigation className="h-5 w-5 text-primary" aria-hidden="true" />}
            cta={{ to: '/getting-around', label: 'Parking, skywalk, DART and the airport' }}
          >
            <p className="text-muted-foreground max-w-prose">
              {AIRPORT_TO_DOWNTOWN.summary} Parking, the skywalk, DART fares and bike share are on one page;
              fares carry their source and check date.
            </p>
          </GuideModule>

          <section aria-labelledby="guide-newsletter" className="mb-12 max-w-xl">
            <h2 id="guide-newsletter" className="text-2xl font-bold mb-2">
              Get the weekly Des Moines picks
            </h2>
            <p className="text-muted-foreground mb-4">
              One email a week with what&apos;s worth doing. You confirm your address before anything is sent.
            </p>
            <NewsletterSignup variant="compact" source="website" />
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
