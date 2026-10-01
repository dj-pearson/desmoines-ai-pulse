import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { RouteCanonical } from "@/components/RouteCanonical";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useVenue, useVenueEvents } from "@/hooks/useVenues";
import { useHotelPins } from "@/hooks/useHotels";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { HOTELS_NEAR_MILES, coordinatesOf, hotelsNear, hotelsNearPath, isHotelsNearIndexable } from "@/lib/hotelsNear";
import { currentVenueName, formatMiles, venueCity } from "@/lib/venuePages";
import { toJsonLd } from "@/lib/jsonLd";
import { createEventSlugWithCentralTime, formatEventPart } from "@/lib/timezone";
import type { Event } from "@/lib/types";

/** Events shown under the hotel list: enough to say why someone is staying. */
const EVENTS_SHOWN = 4;

/**
 * /stay/near/:slug - hotels near one venue, nearest first (SEO-045, SEO-013).
 *
 * The operator scoped the stay module to one question: which hotel is near the
 * venue I just bought a ticket for. Booking engines answer "hotels in Des
 * Moines"; this page answers it for a building, and links back to what is on
 * there, which is the half a booking engine does not have.
 *
 * Every distance is a straight line between two stored, geocoded coordinates
 * (see supabase/migrations/20261018000045_venues_top30_and_hotel_coordinates.sql)
 * and the page says so above the list. It is not a walking time, and nothing
 * here calls a hotel walkable.
 *
 * Fewer than HOTELS_NEAR_MIN_INDEXABLE hotels in range: the page still renders
 * for a reader who followed a link, but is noindexed, and the sitemap
 * generator leaves it out by the same rule (isHotelsNearIndexable).
 */
export default function HotelsNearVenue() {
  const { slug = "" } = useParams<{ slug: string }>();
  const path = hotelsNearPath(slug);
  const { data: venue, isLoading, error: venueError, refetch: refetchVenue } = useVenue(slug);
  const { data: hotels, error: hotelsError, refetch: refetchHotels, isPending: hotelsPending } = useHotelPins();
  const { data: events, status: eventsStatus } = useVenueEvents(venue ? { name: venue.name, slug: venue.slug } : "");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <RouteCanonical path={path} />
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="mb-4 h-9 w-72" />
          <Skeleton className="mb-8 h-5 w-full max-w-2xl" />
          <Skeleton className="h-64 w-full max-w-3xl" />
        </div>
        <Footer />
      </div>
    );
  }

  if (venueError) {
    return (
      <div className="min-h-screen bg-background">
        <RouteCanonical path={path} />
        <Header />
        <div className="container mx-auto px-4 py-16">
          <ErrorState error={venueError} onRetry={() => refetchVenue()} />
        </div>
        <Footer />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen bg-background">
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="mb-4 text-2xl font-bold">Venue not found</h1>
          <Link to="/stay" className="text-primary hover:underline">All hotels</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const venueName = currentVenueName(venue.name);
  const city = venueCity(venue.address) || BRAND.city;
  const located = coordinatesOf(venue) !== null;
  const near = hotelsNear(venue, hotels ?? []);
  const indexable = located && !hotelsPending && !hotelsError && isHotelsNearIndexable(near.length);
  const closest = near[0];
  const upcoming = ((events ?? []) as unknown as Event[]).slice(0, EVENTS_SHOWN);

  const title = venueName.length <= 34 ? `Hotels Near ${venueName}, ${city}` : `Hotels Near ${venueName}`;
  const description = closest
    ? `${near.length} hotel${near.length === 1 ? "" : "s"} within ${HOTELS_NEAR_MILES} miles of ${venueName}, nearest first by straight-line distance. Closest: ${closest.item.name}, ${formatMiles(closest.miles)}.`
    : `Hotels near ${venueName} in ${city}, ${BRAND.state}, by straight-line distance, with what's on at the venue.`;

  const summary = !located
    ? `We don't have a map location for ${venueName} yet, so we can't measure which hotels are near it.`
    : closest
      ? `${near.length === 1 ? "One hotel" : `${near.length} hotels`} in our listings ${near.length === 1 ? "is" : "are"} within ${HOTELS_NEAR_MILES} miles of ${venueName} in a straight line. The closest is ${closest.item.name}, ${formatMiles(closest.miles)} away.`
      : `No hotel in our listings is within ${HOTELS_NEAR_MILES} miles of ${venueName} in a straight line.`;

  const itemList = near.length > 0 && {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${getCanonicalUrl(path)}#hotels`,
    name: `Hotels near ${venueName}`,
    numberOfItems: near.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: near.map(({ item }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: getCanonicalUrl(`/stay/${item.slug}`),
    })),
  };

  return (
    <>
      <RouteCanonical path={path} />
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {!indexable && !hotelsPending && <meta name="robots" content="noindex, follow" />}
        {itemList && <script type="application/ld+json">{toJsonLd(itemList)}</script>}
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
            <Link to="/stay" className="hover:text-primary">Stay</Link>
            <span className="mx-2" aria-hidden="true">/</span>
            <Link to={`/music/venues/${venue.slug}`} className="hover:text-primary">{venueName}</Link>
            <span className="mx-2" aria-hidden="true">/</span>
            <span>Hotels nearby</span>
          </nav>

          <h1 className="mb-3 text-3xl font-bold md:text-4xl">Hotels near {venueName}</h1>
          {!hotelsPending && <p className="mb-2 max-w-[68ch] text-lg text-foreground">{summary}</p>}
          <p className="mb-8 max-w-[68ch] text-sm text-muted-foreground">
            Distances are straight lines between each hotel&apos;s map pin and the venue&apos;s. They aren&apos;t walking or
            driving routes, so check the way before you set off on foot.
          </p>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section aria-labelledby="hotels-heading">
              <h2 id="hotels-heading" className="mb-3 text-xl font-semibold">
                {near.length > 0 || hotelsPending ? "Nearest first" : "Other hotels"}
              </h2>
              {hotelsPending ? (
                <div className="space-y-2" aria-busy="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : hotelsError ? (
                <ErrorState error={hotelsError} compact onRetry={() => refetchHotels()} />
              ) : near.length > 0 ? (
                <ol className="divide-y divide-border rounded-xl border border-border">
                  {near.map(({ item, miles }) => (
                    <li key={item.id}>
                      <Link
                        to={`/stay/${item.slug}`}
                        className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span>
                          <span className="block font-medium">{item.name}</span>
                          {item.city && <span className="block text-sm text-muted-foreground">{item.city}</span>}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{formatMiles(miles)}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground">
                  <Link to="/stay" className="font-medium text-primary hover:underline">Browse every hotel in the area</Link> instead.
                </p>
              )}
            </section>

            <aside aria-labelledby="venue-events-heading">
              <h2 id="venue-events-heading" className="mb-3 text-xl font-semibold">On at {venueName}</h2>
              {upcoming.length > 0 ? (
                <ul className="mb-3 space-y-3">
                  {upcoming.map((event) => (
                    <li key={event.id}>
                      <Link
                        to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
                        className="block hover:text-primary"
                      >
                        <span className="block text-sm text-muted-foreground">{formatEventPart(event, "EEE, MMM d")}</span>
                        <span className="block font-medium">{event.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : eventsStatus === "success" ? (
                <p className="mb-3 text-sm text-muted-foreground">Nothing listed at {venueName} right now.</p>
              ) : null}
              <Link
                to={`/music/venues/${venue.slug}`}
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
              >
                Everything on at {venueName}
              </Link>
            </aside>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
