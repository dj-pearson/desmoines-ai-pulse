import { useParams, Link } from 'react-router-dom';
import { RouteCanonical } from "@/components/RouteCanonical";
import { ErrorState } from "@/components/ui/error-state";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useTrail, getDifficultyLabel, getSurfaceLabel } from '@/hooks/useTrails';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Ruler, Navigation, Mountain, TreePine } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { DestinationLogistics } from '@/components/outdoors/DestinationLogistics';
import { destinationForTrailSlug, type OutdoorsDestination } from '@/data/outdoorsGuide';
import type { Trail } from '@/hooks/useTrails';
import { getDirectionsUrl } from '@/lib/directions';
import { toJsonLd } from '@/lib/jsonLd';
import { safeHttpUrl } from '@/lib/safeUrl';
import { getCanonicalUrl } from '@/lib/brandConfig';

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/10 text-green-700 dark:text-green-400',
  moderate: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  difficult: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

function finiteOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * TouristAttraction for a trail page (explore pass 2 WP5 item 8). Stored and
 * guide facts only: the row's coordinates, else the guide's; the guide's
 * street address, else the row's trailhead address. Free only where the guide
 * says so, which is the same sentence the reader sees.
 */
function buildTrailJsonLd(trail: Trail, destination: OutdoorsDestination | undefined) {
  const latitude = finiteOrNull(trail.latitude) ?? destination?.geo.latitude ?? null;
  const longitude = finiteOrNull(trail.longitude) ?? destination?.geo.longitude ?? null;
  const website = safeHttpUrl(trail.website) ?? (destination ? safeHttpUrl(destination.officialUrl) : null);
  const address = destination
    ? {
        '@type': 'PostalAddress',
        ...(destination.address.street ? { streetAddress: destination.address.street } : {}),
        addressLocality: destination.address.city,
        addressRegion: destination.address.state,
        ...(destination.address.zip ? { postalCode: destination.address.zip } : {}),
        addressCountry: 'US',
      }
    : trail.trailhead_address
      ? {
          '@type': 'PostalAddress',
          streetAddress: trail.trailhead_address,
          addressRegion: 'IA',
          addressCountry: 'US',
        }
      : null;
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: trail.name,
    url: getCanonicalUrl(`/outdoors/${trail.slug}`),
    ...(trail.description ? { description: trail.description } : destination ? { description: destination.headline } : {}),
    ...(trail.image_url ? { image: trail.image_url } : {}),
    ...(address ? { address } : {}),
    ...(latitude !== null && longitude !== null
      ? { geo: { '@type': 'GeoCoordinates', latitude, longitude } }
      : {}),
    ...(website ? { sameAs: [website] } : {}),
    ...(destination ? { isAccessibleForFree: destination.logistics.cost.startsWith('Free'), publicAccess: true } : {}),
  };
}

export default function TrailDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: trail, isLoading, error, refetch } = useTrail(slug || '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/outdoors/${slug}`} />
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-48 w-full mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Footer />
      </div>
    );
  }

  /**
   * WEB-SEO-040. A FAILED LOAD AND A MISSING ROW ARE DIFFERENT ANSWERS.
   * This used to fall straight through to the not-found branch below, which
   * renders "not found" AND a noindex - so Googlebot arriving during a
   * PostgREST blip was told a real page should not be indexed. No query here
   * sets throwOnError, so RouteErrorBoundary never sees these either.
   *
   * The retry state carries NO robots meta: the page is fine, the fetch was
   * not, and saying nothing leaves whatever is already indexed alone.
   */
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <RouteCanonical path={`/outdoors/${slug}`} />
        <Header />
        <div className="container mx-auto px-4 py-16">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
        <Footer />
      </div>
    );
  }

  if (!trail) {
    return (
      <div className="min-h-screen bg-background">
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Trail Not Found</h1>
          <Link to="/outdoors" className="text-primary hover:underline">Back to Trails &amp; Outdoors</Link>
        </div>
        <Footer />
      </div>
    );
  }

  // Item 8: the five trails that are /outdoors guide destinations carry the
  // guide's parking, dogs and winter facts here too.
  const destination = destinationForTrailSlug(trail.slug);
  const latitude = finiteOrNull(trail.latitude) ?? destination?.geo.latitude ?? null;
  const longitude = finiteOrNull(trail.longitude) ?? destination?.geo.longitude ?? null;
  const directionsUrl =
    latitude !== null && longitude !== null
      ? getDirectionsUrl({ latitude, longitude })
      : trail.trailhead_address
        ? getDirectionsUrl({ address: trail.trailhead_address })
        : null;
  // Item 11: admin-written, so only http(s) becomes a link.
  const websiteUrl = safeHttpUrl(trail.website);

  return (
    <>
      {/* WEB-SEO-033. RouteCanonical was only in the LOADING branch, so the
          canonical existed for the few hundred milliseconds before the fetch
          resolved and then vanished. A crawler that executes JS sees the
          settled DOM, which had none -- and SEO-028 put it in the loading
          branch precisely because the canonical must not wait for data, not
          because it should stop existing once data arrives. It belongs in
          both. */}
      <RouteCanonical path={`/outdoors/${slug}`} />
      <Helmet>
        <title>{`${trail.name} - Trail Guide | Des Moines Insider`}</title>
        <meta name="description" content={trail.description || destination?.headline || `${trail.name}, a trail in the Des Moines, Iowa metro area.`} />
        <script type="application/ld+json">{toJsonLd(buildTrailJsonLd(trail, destination))}</script>
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-6">
            <Link to="/outdoors" className="hover:text-primary">Trails &amp; Outdoors</Link>
            <span className="mx-2">/</span>
            <span>{trail.name}</span>
          </nav>

          {/* Trail Header */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">{trail.name}</h1>
            <div className="flex items-center gap-3 flex-wrap mb-4">
              {trail.difficulty && (
                <Badge className={DIFFICULTY_COLORS[trail.difficulty]}>
                  {getDifficultyLabel(trail.difficulty)}
                </Badge>
              )}
              {trail.length_miles && (
                <Badge variant="outline">
                  <Ruler className="h-3 w-3 mr-1" />
                  {trail.length_miles} miles
                </Badge>
              )}
              {trail.surface_type && (
                <Badge variant="outline">{getSurfaceLabel(trail.surface_type)}</Badge>
              )}
              {trail.is_featured && (
                <Badge variant="secondary">
                  <TreePine className="h-3 w-3 mr-1" /> Featured
                </Badge>
              )}
            </div>
            {trail.description && (
              <p className="text-lg text-muted-foreground max-w-3xl">{trail.description}</p>
            )}
          </div>

          {/* Trail Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {/* Activities */}
            {trail.activities && trail.activities.length > 0 && (
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2"><Mountain className="h-4 w-4" /> Activities</h3>
                  <div className="flex flex-wrap gap-2">
                    {trail.activities.map((activity) => (
                      <Badge key={activity} variant="secondary" className="capitalize">{activity}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Location */}
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><SpriteIcon name="map-pin" className="h-4 w-4" /> Trailhead</h3>
                {trail.trailhead_address && (
                  <p className="text-sm text-muted-foreground mb-3">{trail.trailhead_address}</p>
                )}
                {directionsUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                      <Navigation className="h-4 w-4 mr-1" aria-hidden="true" /> Get directions
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Highlights */}
            {trail.highlights && (
              <Card className="md:col-span-2">
                <CardContent className="p-5">
                  <h3 className="font-semibold mb-3">Trail Highlights</h3>
                  <p className="text-muted-foreground">{trail.highlights}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {destination && (
            <section className="mb-10" aria-labelledby="trail-before-you-go">
              <h2 id="trail-before-you-go" className="text-2xl font-bold mb-4">
                Before you go
              </h2>
              <DestinationLogistics logistics={destination.logistics} />
              <p className="mt-4 text-sm">
                <Link
                  to={`/outdoors#${destination.id}`}
                  className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
                >
                  {destination.name} in the outdoors guide
                </Link>
              </p>
            </section>
          )}

          {websiteUrl && (
            <div className="mt-6">
              <Button asChild variant="outline">
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                  <SpriteIcon name="external-link" className="h-4 w-4 mr-1" /> More info
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
