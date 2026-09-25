import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Beer, CheckCircle2, Circle, Star } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import ItemListSchema from '@/components/schema/ItemListSchema';
import NoIndexMeta from '@/components/schema/NoIndexMeta';
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
  breweryEventNotOver,
  splitBreweries,
  useBreweries,
  useBreweryCheckins,
  useBreweryEvents,
  useCheckinMutation,
  useUpdateCheckinMutation,
  type BreweryCheckin,
  type BreweryEvent,
} from '@/hooks/useBreweryTrail';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { handleError } from '@/lib/errorHandler';
import { isPrerender } from '@/lib/isPrerender';
import { openingLabel } from '@/lib/restaurantOpenings';
import { formatOpenStatusLine, resolveOpenStatus } from '@/lib/restaurantHours';
import { createEventSlugWithCentralTime, formatEventDateShort } from '@/lib/timezone';


type BreweryRow = NonNullable<ReturnType<typeof useBreweries>['data']>[number];

/** Cards in the grid's first row at lg (three columns). The taproom strip goes after them. */
const FIRST_ROW = 3;

/** This week's events at the trail's taprooms. Renders nothing when there are none. */
function TaproomsThisWeek({ events, pending }: { events: BreweryEvent[]; pending: boolean }) {
  if (pending) {
    // Fixed height, so the grid below does not jump when the list arrives.
    return (
      <div className="my-10 max-w-3xl" aria-busy="true" aria-label="Loading taproom events">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (events.length === 0) return null;
  return (
    <section aria-labelledby="taprooms-week-heading" className="my-10">
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

interface BreweryCardProps {
  brewery: BreweryRow;
  index: number;
  /** Null under prerender and for upcoming places: no frozen "Open until". */
  statusLine: string | null;
  checkin: BreweryCheckin | undefined;
  /** True only once the visitor's check-ins have loaded. */
  showCheckinControls: boolean;
  onCheckin: (id: string) => void;
  onEdit: (checkin: BreweryCheckin) => void;
}

function BreweryCard({ brewery, index, statusLine, checkin, showCheckinControls, onCheckin, onEdit }: BreweryCardProps) {
  const isCheckedIn = checkin !== undefined;
  return (
    <Card
      className={`transition-colors h-full ${isCheckedIn ? 'border-primary/50' : 'hover:border-foreground/30'}`}
      data-brewery-card
    >
      {brewery.image_url && (
        <div className="h-40 overflow-hidden rounded-t-xl relative">
          {/* The first row of a three-column grid. Chrome does not start a lazy
              image's fetch until layout has run, so the LCP candidate on a listing
              page must not be lazy (WEB-SEO-032). Decorative: the name is the
              heading right below it. */}
          <OptimizedImage
            src={brewery.image_url}
            alt=""
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
          ) : showCheckinControls ? (
            <Circle className="h-6 w-6 text-muted-foreground/40 flex-shrink-0" aria-hidden="true" />
          ) : null}
        </div>

        {checkin?.beer_name && (
          <p className="text-sm text-muted-foreground mb-1">
            <Beer className="h-3 w-3 inline mr-1" aria-hidden="true" />
            {checkin.beer_name}
          </p>
        )}
        {checkin?.rating ? (
          <div className="flex items-center gap-1 mb-2" role="img" aria-label={`Your rating: ${checkin.rating} of 5`}>
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
            <Link to={`/restaurants/${brewery.slug || brewery.id}`}>
              View details<span className="sr-only"> for {brewery.name}</span>
            </Link>
          </Button>
          {showCheckinControls &&
            (checkin ? (
              <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => onEdit(checkin)}>
                Edit visit<span className="sr-only"> to {brewery.name}</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                onClick={() => onCheckin(brewery.id)}
                aria-label={`Check in at ${brewery.name}`}
              >
                Check in
              </Button>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Which dialog is open: a first visit, or a change to a recorded one. */
type DialogState = { mode: 'checkin'; breweryId: string } | { mode: 'edit'; breweryId: string; checkinId: string } | null;

export default function BreweryTrail() {
  const { user } = useAuth();
  const prerender = isPrerender();
  const { data: breweries, isLoading, isError, error, refetch } = useBreweries();
  const checkinsQuery = useBreweryCheckins();
  const { visitable, upcoming } = useMemo(() => splitBreweries(breweries ?? []), [breweries]);
  const eventsQuery = useBreweryEvents(visitable.map((b) => b.name));
  const checkinMutation = useCheckinMutation();
  const updateMutation = useUpdateCheckinMutation();
  const now = useMinuteClock();

  const [dialog, setDialog] = useState<DialogState>(null);
  const [beerName, setBeerName] = useState('');
  const [rating, setRating] = useState(0);
  const formId = useId();
  const beerInputId = `${formId}-beer`;
  const ratingLabelId = `${formId}-rating`;

  // WP4.9: the passport and every Check in button wait for the visitor's
  // check-ins. When that read failed, the page used to show a Check in button
  // on every card, and the write then replaced the first visit.
  const checkinsReady = !!user && checkinsQuery.isSuccess;
  const checkins = checkinsReady ? checkinsQuery.data : [];
  const checkinByBrewery = new Map(checkins.map((c) => [c.restaurant_id, c]));
  const totalBreweries = visitable.length;
  const visitedCount = visitable.filter((b) => checkinByBrewery.has(b.id)).length;
  const progress = totalBreweries > 0 ? Math.round((visitedCount / totalBreweries) * 100) : 0;
  const dialogBrewery = dialog ? (breweries ?? []).find((b) => b.id === dialog.breweryId) ?? null : null;
  const taproomEvents = (eventsQuery.data ?? []).filter((event) => breweryEventNotOver(event, now));
  const pending = checkinMutation.isPending || updateMutation.isPending;

  // Closing the dialog, by any route, clears what was typed so the next
  // brewery's dialog does not open with the last one's beer and stars.
  const closeDialog = () => {
    setDialog(null);
    setBeerName('');
    setRating(0);
  };

  const openEdit = (checkin: BreweryCheckin) => {
    setBeerName(checkin.beer_name ?? '');
    setRating(checkin.rating ?? 0);
    setDialog({ mode: 'edit', breweryId: checkin.restaurant_id, checkinId: checkin.id });
  };

  const handleSubmit = async () => {
    if (!dialog || !dialogBrewery) return;
    const fields = { beerName: beerName.trim() || undefined, rating: rating > 0 ? rating : undefined };
    try {
      if (dialog.mode === 'edit') {
        await updateMutation.mutateAsync({ checkinId: dialog.checkinId, ...fields });
        toast.success(`Updated your visit to ${dialogBrewery.name}`);
      } else {
        const result = await checkinMutation.mutateAsync({ restaurantId: dialogBrewery.id, ...fields });
        if (result.alreadyCheckedIn) {
          toast.info(`You'd already checked in at ${dialogBrewery.name}. Your first visit is kept.`);
        } else {
          toast.success(`Checked in at ${dialogBrewery.name}`);
        }
      }
      closeDialog();
    } catch (err) {
      handleError(err, { component: 'BreweryTrail', action: dialog.mode === 'edit' ? 'edit-checkin' : 'checkin' });
      toast.error(dialog.mode === 'edit' ? "Your changes didn't save. Try again." : "Check-in didn't save. Try again.");
    }
  };

  const canonicalUrl = getCanonicalUrl('/breweries');

  // SEO-022. Every brewery card on the page, with the same href the card uses,
  // so the schema URL and the link cannot drift apart.
  const schemaItems = [...visitable, ...upcoming].map((brewery) => ({
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

  const renderCard = (brewery: BreweryRow, index: number) => (
    <BreweryCard
      key={brewery.id}
      brewery={brewery}
      index={index}
      // WP4.10: no open/closed line in static HTML; it would be whatever the
      // build saw.
      statusLine={prerender ? null : formatOpenStatusLine(resolveOpenStatus(undefined, brewery.opening, now))}
      checkin={checkinByBrewery.get(brewery.id)}
      showCheckinControls={checkinsReady}
      onCheckin={(id) => setDialog({ mode: 'checkin', breweryId: id })}
      onEdit={openEdit}
    />
  );

  const gridClass = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6';
  const breweriesLoaded = !isLoading && breweries !== undefined;

  return (
    <>
      <SEOHead
        title="Des Moines Brewery Trail - Craft Beer"
        description="Craft breweries and taprooms across the Des Moines metro, with their listed hours and a passport to track the ones you've visited."
        url={canonicalUrl}
        canonicalUrl={canonicalUrl}
        keywords={['Des Moines breweries', 'craft beer Des Moines', 'brewery tour Des Moines', 'Iowa craft beer']}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Breweries', url: '/breweries' },
        ]}
      />
      {/* WP4.10: a failed read with nothing to show is not a page to index. */}
      {isError && !breweries && <NoIndexMeta />}
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
            <p className="text-lg text-muted-foreground max-w-prose" data-brewery-intro>
              {breweriesLoaded && totalBreweries > 0
                ? `${totalBreweries} craft ${totalBreweries === 1 ? 'brewery or taproom' : 'breweries and taprooms'} we list in the metro. `
                : "The metro's craft breweries and taprooms in one list. "}
              Check in when you visit and keep track of the ones you&apos;ve been to.{' '}
              <Link to="/contact" className="font-semibold text-primary hover:underline">
                Missing one? Tell us
              </Link>
              .
            </p>
          </div>

          {user && !prerender && (
            <div className="mb-10 max-w-3xl" data-brewery-passport>
              {checkinsQuery.isError ? (
                <ErrorState
                  error={checkinsQuery.error}
                  compact
                  title="We couldn't load your check-ins"
                  description="Your passport and the Check in buttons come back once they load, so nothing overwrites a visit you've already logged."
                  onRetry={() => void checkinsQuery.refetch()}
                />
              ) : !checkinsReady || !breweriesLoaded ? (
                <Skeleton className="h-36 rounded-xl" aria-label="Loading your passport" />
              ) : totalBreweries > 0 ? (
                <Card>
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
                        ? `You've visited all ${totalBreweries} breweries open on the trail.`
                        : `${visitedCount} of ${totalBreweries} visited, ${totalBreweries - visitedCount} to go.`}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}

          <section aria-labelledby="breweries-heading">
            <h2 id="breweries-heading" className="text-2xl font-bold mb-4">
              Breweries on the trail
            </h2>
            {isLoading ? (
              <div className={gridClass}>
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 rounded-xl" />
                ))}
              </div>
            ) : visitable.length > 0 ? (
              <>
                <div className={gridClass}>{visitable.slice(0, FIRST_ROW).map(renderCard)}</div>
                {/* WP4.10: below the first row, so a late answer cannot push the
                    grid down after it paints. */}
                <TaproomsThisWeek events={taproomEvents} pending={eventsQuery.isLoading} />
                {visitable.length > FIRST_ROW && (
                  <div className={`${gridClass} mt-6`}>
                    {visitable.slice(FIRST_ROW).map((brewery, i) => renderCard(brewery, i + FIRST_ROW))}
                  </div>
                )}
              </>
            ) : isError ? (
              // WEB-QA-031: a failed fetch must not read as "there are no
              // breweries", which is a claim about Des Moines rather than
              // about the request.
              <ErrorState error={error} compact onRetry={() => void refetch()} />
            ) : (
              <p className="text-muted-foreground">No breweries listed yet.</p>
            )}
          </section>

          {upcoming.length > 0 && (
            <section aria-labelledby="breweries-upcoming-heading" className="mt-12" data-brewery-upcoming>
              <h2 id="breweries-upcoming-heading" className="text-2xl font-bold mb-2">
                Opening soon
              </h2>
              <p className="text-sm text-muted-foreground mb-4 max-w-prose">
                Not open yet, so not on the passport. They join it when they open.
              </p>
              <ul className="divide-y rounded-xl border bg-card max-w-3xl">
                {upcoming.map((brewery) => (
                  <li key={brewery.id} className="relative px-4 py-3 hover:bg-muted/50 focus-within:bg-muted/50">
                    <Link
                      to={`/restaurants/${brewery.slug || brewery.id}`}
                      className="font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      {brewery.name}
                    </Link>
                    <span className="block text-sm text-muted-foreground">
                      {openingLabel(brewery, now) ?? 'Opening soon'}
                      {brewery.location ? ` - ${brewery.location}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!user && (
            <div className="mt-10 p-6 bg-muted/50 rounded-xl max-w-3xl">
              <p className="text-muted-foreground mb-3">
                Sign in to check in at breweries and keep track of the ones you&apos;ve visited.
              </p>
              <Button asChild className="min-h-11">
                <Link to="/auth?redirect=%2Fbreweries">Sign in to start the trail</Link>
              </Button>
            </div>
          )}
        </div>
        <Footer />
      </div>

      {/* One dialog for the page, not one per card. */}
      <Dialog
        open={dialogBrewery !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'edit' ? `Your visit to ${dialogBrewery?.name}` : `Check in at ${dialogBrewery?.name}`}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
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
            <Button type="submit" className="w-full min-h-11" disabled={pending}>
              {pending ? 'Saving...' : dialog?.mode === 'edit' ? 'Save changes' : 'Check in'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
