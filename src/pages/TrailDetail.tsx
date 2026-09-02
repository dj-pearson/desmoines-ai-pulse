import { useParams, Link } from 'react-router-dom';
import { RouteCanonical } from "@/components/RouteCanonical";
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

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/10 text-green-700 dark:text-green-400',
  moderate: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  difficult: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

export default function TrailDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: trail, isLoading } = useTrail(slug || '');

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

  const directionsUrl = trail.latitude && trail.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${trail.latitude},${trail.longitude}`
    : trail.trailhead_address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trail.trailhead_address)}`
      : null;

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
        <title>{trail.name} — Trail Guide | Des Moines Insider</title>
        <meta name="description" content={trail.description || `${trail.name} — trail in the Des Moines, Iowa metro area.`} />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-muted-foreground mb-6">
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
                  <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <Navigation className="h-4 w-4 mr-1" /> Get Directions
                    </Button>
                  </a>
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

          {trail.website && (
            <div className="mt-6">
              <a href={trail.website} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <SpriteIcon name="external-link" className="h-4 w-4 mr-1" /> More Info
                </Button>
              </a>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
