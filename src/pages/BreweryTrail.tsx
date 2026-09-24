import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Beer, CheckCircle2, Circle, Star } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import ItemListSchema from '@/components/schema/ItemListSchema';
import { OptimizedImage } from '@/components/OptimizedImage';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SpriteIcon } from '@/components/ui/SpriteIcon';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/contexts/AuthContext';
import {
  useBreweries,
  useBreweryCheckins,
  useBreweryEvents,
  useCheckinMutation,
  type BreweryEvent,
} from '@/hooks/useBreweryTrail';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { handleError } from '@/lib/errorHandler';
import { formatOpenStatusLine, resolveOpenStatus } from '@/lib/restaurantHours';
import { createEventSlugWithCentralTime, formatEventDateShort } from '@/lib/timezone';

const UPCOMING_LABEL: Record<string, string> = {
  opening_soon: 'Opening soon',
  announced: 'Announced',
};

/** This week's events at the trail's taprooms. Renders nothing when there are none. */
function TaproomsThisWeek({ events }: { events: BreweryEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section aria-labelledby="taprooms-week-heading" className="mb-10">
      <h2 id="taprooms-week-heading" className="text-2xl font-bold mb-4">
        This week at the taprooms
      </h2>
      <ul className="divide-y rounded-xl border bg-card max-w-3xl">
        {events.map((event) => (
          <li
            key={event.id}
            className="relative flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4 hover:bg-muted/50 focus-within:bg-muted/50"
          >
            <span className="text-sm font-medium tabular-nums text-muted-foreground sm:w-44 sm:flex-shrink-0">
              {formatEventDateShort(event)}
            </span>
            <span className="min-w-0 flex-1">
              <Link
                to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
                className="font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                {event.title}
              </Link>
              {event.venue && (
                <span className="block text-sm text-muted-foreground sm:inline sm:ml-2">{event.venue}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function BreweryTrail() {
  const { user } = useAuth();
  const { data: breweries, isLoading, isError, error, refetch } = useBreweries();
  const { data: checkins } = useBreweryCheckins();
  const { data: taproomEvents = [] } = useBreweryEvents((breweries ?? []).map((b) => b.name));
  const checkinMutation = useCheckinMutation();
  const now = useMinuteClock();

  const [checkinBreweryId, setCheckinBreweryId] = useState<string | null>(null);
  const [beerName, setBeerName] = useState('');
  const [rating, setRating] = useState(0);
  const formId = useId();
  const beerInputId = `${formId}-beer`;
  const ratingLabelId = `${formId}-rating`;

  const checkedInIds = new Set(checkins?.map((c) => c.restaurant_id) || []);
  const totalBreweries = breweries?.length || 0;
  const visitedCount = (breweries ?? []).filter((b) => checkedInIds.has(b.id)).length;
  const progress = totalBreweries > 0 ? Math.round((visitedCount / totalBreweries) * 100) : 0;
  const checkinBrewery = breweries?.find((b) => b.id === checkinBreweryId) ?? null;

  // Closing the dialog, by any route, clears what was typed so the next
  // brewery's dialog does not open with the last one's beer and stars.
  const closeCheckin = () => {
    setCheckinBreweryId(null);
    setBeerName('');
    setRating(0);
  };

  const handleCheckin = async () => {
    if (!checkinBrewery) return;
    try {
      await checkinMutation.mutateAsync({
        restaurantId: checkinBrewery.id,
        beerName: beerName || undefined,
        rating: rating > 0 ? rating : undefined,
      });
      toast.success(`Checked in at ${checkinBrewery.name}`);
      closeCheckin();
    } catch (err) {
      handleError(err, { component: 'BreweryTrail', action: 'checkin' });
      toast.error("Check-in didn't save. Try again.");
    }
  };

  const canonicalUrl = getCanonicalUrl('/breweries');

  // SEO-022. Every brewery card on the page, with the same href the card uses,
  // so the schema URL and the link cannot drift apart.
  const schemaItems = (breweries ?? []).map((brewery) => ({
    name: brewery.name,
    url: getCanonicalUrl(`/restaurants/${brewery.slug || brewery.id}`),
    ...(brewery.image_url && { image: brewery.image_url }),
    ...(brewery.description && { description: brewery.description }),
    itemProps: {
      // `location` is the street address column on restaurants; there is no
      // `address` column, and addressLocality is omitted rather than defaulted
      // to Des Moines for the same reason eventSchema.ts omits it.
      ...((brewery.location || brewery.city) && {
        address: {
          '@type': 'PostalAddress',
          ...(brewery.location && { streetAddress: brewery.location }),
          ...(brewery.city && { addressLocality: brewery.city }),
          addressRegion: 'IA',
          addressCountry: 'US',
        },
      }),
      ...(brewery.latitude != null &&
        brewery.longitude != null && {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: brewery.latitude,
            longitude: brewery.longitude,
          },
        }),
    },
  }));

  return (
    <>
      <SEOHead
        title="Des Moines Brewery Trail - Craft Beer"
        description="Craft breweries and taprooms across the Des Moines metro, what's on at them this week, and a passport to track the ones you've visited."
        url={canonicalUrl}
        canonicalUrl={canonicalUrl}
        keywords={[
          'Des Moines breweries',
          'craft beer Des Moines',
          'brewery tour Des Moines',
          'Iowa craft beer',
        ]}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Breweries', url: '/breweries' },
        ]}
      />
      <ItemListSchema
        name="Breweries on the Des Moines Brewery Trail"
        description="Craft breweries and taprooms across the Des Moines metro."
        items={schemaItems}
        itemType="Place"
      />
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="mb-10 max-w-3xl">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
              <Beer className="h-4 w-4" aria-hidden="true" />
              Craft beer trail
            </p>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">Des Moines Brewery Trail</h1>
            <p className="text-lg text-muted-foreground max-w-prose">
              The metro&apos;s craft breweries and taprooms in one list. Check in when you visit and keep track of the
              ones you&apos;ve been to.
            </p>
          </div>

          {user && totalBreweries > 0 && (
            <Card className="mb-10 max-w-3xl">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className="text-xl font-bold">Your brewery passport</h2>
                  <Badge variant="outline" className="text-base px-3 py-1 tabular-nums">
                    {visitedCount} / {totalBreweries}
                  </Badge>
                </div>
                <div
                  className="w-full bg-muted rounded-full h-3 mb-2 overflow-hidden"
                  role="progressbar"
                  aria-label="Breweries visited"
                  aria-valuemin={0}
                  aria-valuemax={totalBreweries}
                  aria-valuenow={visitedCount}
                  aria-valuetext={`${visitedCount} of ${totalBreweries} breweries visited`}
                >
                  <div
                    className="bg-primary h-3 rounded-full transition-[width] duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {visitedCount === totalBreweries
                    ? `You've visited all ${totalBreweries} breweries on the trail.`
                    : `${visitedCount} of ${totalBreweries} visited, ${totalBreweries - visitedCount} to go.`}
                </p>
              </CardContent>
            </Card>
          )}

          <TaproomsThisWeek events={taproomEvents} />

          <section aria-labelledby="breweries-heading">
            <h2 id="breweries-heading" className="text-2xl font-bold mb-4">
              Breweries on the trail
            </h2>
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 rounded-xl" />
                ))}
              </div>
            ) : breweries && breweries.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {breweries.map((brewery, index) => {
                  const isCheckedIn = checkedInIds.has(brewery.id);
                  const checkin = checkins?.find((c) => c.restaurant_id === brewery.id);
                  const statusLine =
                    UPCOMING_LABEL[brewery.status ?? ''] ??
                    formatOpenStatusLine(resolveOpenStatus(undefined, brewery.opening, now));
                  return (
                    <Card
                      key={brewery.id}
                      className={`transition-colors h-full ${isCheckedIn ? 'border-primary/50' : 'hover:border-foreground/30'}`}
                    >
                      {brewery.image_url && (
                        <div className="h-40 overflow-hidden rounded-t-xl relative">
                          {/* The first row of a three-column grid. Chrome does not start a lazy
                              image's fetch until layout has run, so the LCP candidate on a listing
                              page must not be lazy (WEB-SEO-032). */}
                          <OptimizedImage
                            src={brewery.image_url}
                            alt={brewery.name}
                            className="object-cover"
                            containerClassName="w-full h-full"
                            priority={index < 3}
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        </div>
                      )}
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0">
                            <h3 className="text-lg font-semibold">{brewery.name}</h3>
                            {brewery.location && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <SpriteIcon name="map-pin" className="h-3 w-3" aria-hidden="true" /> {brewery.location}
                              </p>
                            )}
                            {statusLine && <p className="text-sm font-medium mt-1">{statusLine}</p>}
                          </div>
                          {isCheckedIn ? (
                            <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0" aria-label="Visited" role="img" />
                          ) : (
                            <Circle className="h-6 w-6 text-muted-foreground/40 flex-shrink-0" aria-hidden="true" />
                          )}
                        </div>

                        {checkin?.beer_name && (
                          <p className="text-sm text-muted-foreground mb-1">
                            <Beer className="h-3 w-3 inline mr-1" aria-hidden="true" />
                            {checkin.beer_name}
                          </p>
                        )}
                        {checkin?.rating ? (
                          <div
                            className="flex items-center gap-1 mb-2"
                            role="img"
                            aria-label={`Your rating: ${checkin.rating} of 5`}
                          >
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                aria-hidden="true"
                                className={`h-3 w-3 ${i < (checkin.rating ?? 0) ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'}`}
                              />
                            ))}
                          </div>
                        ) : null}

                        <div className="flex gap-2 mt-3">
                          <Button asChild variant="outline" size="sm" className="flex-1 min-h-11">
                            <Link to={`/restaurants/${brewery.slug || brewery.id}`}>View details</Link>
                          </Button>
                          {user && !isCheckedIn && (
                            <Button
                              type="button"
                              size="sm"
                              className="min-h-11"
                              onClick={() => setCheckinBreweryId(brewery.id)}
                              aria-label={`Check in at ${brewery.name}`}
                            >
                              Check in
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : isError ? (
              // WEB-QA-031: a failed fetch must not read as "there are no
              // breweries", which is a claim about Des Moines rather than
              // about the request.
              <ErrorState error={error} compact onRetry={() => void refetch()} />
            ) : (
              <p className="text-muted-foreground">No breweries listed yet.</p>
            )}
          </section>

          {!user && (
            <div className="mt-10 p-6 bg-muted/50 rounded-xl max-w-3xl">
              <p className="text-muted-foreground mb-3">
                Sign in to check in at breweries and keep track of the ones you&apos;ve visited.
              </p>
              <Button asChild>
                <Link to="/auth">Sign in to start the trail</Link>
              </Button>
            </div>
          )}
        </div>
        <Footer />
      </div>

      {/* One dialog for the page, not one per card. */}
      <Dialog
        open={checkinBrewery !== null}
        onOpenChange={(open) => {
          if (!open) closeCheckin();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check in at {checkinBrewery?.name}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCheckin();
            }}
          >
            <div>
              <label htmlFor={beerInputId} className="text-sm font-medium mb-1 block">
                What are you drinking? (optional)
              </label>
              <Input
                id={beerInputId}
                placeholder="e.g. Des Moines IPA"
                value={beerName}
                onChange={(e) => setBeerName(e.target.value)}
              />
            </div>
            <div>
              <p id={ratingLabelId} className="text-sm font-medium mb-1">
                Rating (optional)
              </p>
              <div role="radiogroup" aria-labelledby={ratingLabelId} className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => {
                  const value = i + 1;
                  return (
                    <label key={value} className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center">
                      <input
                        type="radio"
                        name={`${formId}-stars`}
                        value={value}
                        checked={rating === value}
                        onChange={() => setRating(value)}
                        className="peer sr-only"
                      />
                      <span className="sr-only">{`${value} star${value > 1 ? 's' : ''}`}</span>
                      <Star
                        aria-hidden="true"
                        className={`h-7 w-7 rounded-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
                          value <= rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40'
                        }`}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
            <Button type="submit" className="w-full min-h-11" disabled={checkinMutation.isPending}>
              {checkinMutation.isPending ? 'Checking in...' : 'Check in'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
