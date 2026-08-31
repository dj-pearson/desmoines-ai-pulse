import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import ItemListSchema from '@/components/schema/ItemListSchema';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { useTrails, useFeaturedTrails, getDifficultyLabel, getSurfaceLabel } from '@/hooks/useTrails';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { TreePine, Ruler, Mountain, Bike, Footprints, Route } from "lucide-react";

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-500/10 text-green-700 dark:text-green-400',
  moderate: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  difficult: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

const ACTIVITY_ICONS: Record<string, typeof Bike> = {
  biking: Bike,
  hiking: Mountain,
  walking: Footprints,
  running: Route,
};

/**
 * Cap on ItemList elements. The page renders every trail it has (8 today), so
 * this is only a ceiling against the list growing past what belongs in one
 * node — it is never allowed to exceed what the page actually links to.
 */
const SCHEMA_LIMIT = 50;

const DIFFICULTY_FILTERS = ['All', 'Easy', 'Moderate', 'Difficult'];
const ACTIVITY_FILTERS = ['All', 'Biking', 'Hiking', 'Running', 'Walking'];

export default function OutdoorsHub() {
  const { data: allTrails, isLoading } = useTrails();
  const { data: featuredTrails } = useFeaturedTrails();
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const [activityFilter, setActivityFilter] = useState('All');

  const filteredTrails = allTrails?.filter((trail) => {
    if (difficultyFilter !== 'All' && trail.difficulty !== difficultyFilter.toLowerCase()) return false;
    if (activityFilter !== 'All' && !trail.activities?.includes(activityFilter.toLowerCase())) return false;
    return true;
  });

  const canonicalUrl = getCanonicalUrl('/outdoors');

  // SEO-022. Built from allTrails, not filteredTrails: the schema has to
  // describe the page a crawler is actually served, and that is always the
  // unfiltered default — the filters are client state and never survive a
  // prerender.
  const schemaItems = (allTrails ?? []).slice(0, SCHEMA_LIMIT).map((trail) => ({
    name: trail.name,
    url: getCanonicalUrl(`/outdoors/${trail.slug}`),
    ...(trail.image_url && { image: trail.image_url }),
    ...(trail.description && { description: trail.description }),
    itemProps: {
      ...(trail.trailhead_address && {
        address: {
          '@type': 'PostalAddress',
          streetAddress: trail.trailhead_address,
          addressRegion: 'IA',
          addressCountry: 'US',
        },
      }),
      ...(trail.latitude != null &&
        trail.longitude != null && {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: trail.latitude,
            longitude: trail.longitude,
          },
        }),
    },
  }));

  return (
    <>
      <SEOHead
        title="Trails & Outdoor Recreation in Des Moines"
        description="Explore 800+ miles of trails in the Des Moines metro area. Trail maps, difficulty ratings, and seasonal guides for hiking, biking, and running."
        url={canonicalUrl}
        canonicalUrl={canonicalUrl}
        keywords={[
          'Des Moines trails',
          'hiking near Des Moines',
          'bike trails Des Moines',
          'Des Moines parks',
        ]}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Outdoors', url: '/outdoors' },
        ]}
      />
      <ItemListSchema
        name="Trails and outdoor recreation in the Des Moines metro"
        description="Paved and natural-surface trails, state parks and outdoor recreation areas around Des Moines, Iowa."
        items={schemaItems}
        itemType="Place"
      />
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-4 py-2 rounded-full mb-4">
              <TreePine className="h-5 w-5" />
              <span className="font-semibold">800+ Miles of Trails</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Trails &amp; Outdoors
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Explore the Des Moines metro&apos;s incredible trail system — from the iconic High Trestle Trail Bridge to peaceful urban loops.
            </p>
          </div>

          {/* Featured Trails */}
          {featuredTrails && featuredTrails.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold mb-4">Featured Trails</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {featuredTrails.map((trail) => (
                  <Link key={trail.id} to={`/outdoors/${trail.slug}`}>
                    <Card className="hover:border-primary transition-colors h-full">
                      {trail.image_url && (
                        <div className="h-36 overflow-hidden rounded-t-lg">
                          <img src={trail.image_url} alt={trail.name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      )}
                      <CardContent className="p-4">
                        <h3 className="font-semibold mb-2">{trail.name}</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          {trail.difficulty && (
                            <Badge className={DIFFICULTY_COLORS[trail.difficulty]}>
                              {getDifficultyLabel(trail.difficulty)}
                            </Badge>
                          )}
                          {trail.length_miles && (
                            <Badge variant="outline">
                              <Ruler className="h-3 w-3 mr-1" />
                              {trail.length_miles} mi
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Filters */}
          <section className="mb-8">
            <div className="flex flex-wrap gap-4 mb-4">
              <div>
                <p className="text-sm font-medium mb-2">Difficulty</p>
                <div className="flex gap-2 flex-wrap">
                  {DIFFICULTY_FILTERS.map((f) => (
                    <Button
                      key={f}
                      variant={difficultyFilter === f ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDifficultyFilter(f)}
                    >
                      {f}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Activity</p>
                <div className="flex gap-2 flex-wrap">
                  {ACTIVITY_FILTERS.map((f) => (
                    <Button
                      key={f}
                      variant={activityFilter === f ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setActivityFilter(f)}
                    >
                      {f}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* All Trails */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">
              All Trails
              {filteredTrails && <span className="text-muted-foreground font-normal text-lg ml-2">({filteredTrails.length})</span>}
            </h2>
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-lg" />
                ))}
              </div>
            ) : filteredTrails && filteredTrails.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTrails.map((trail) => (
                  <Link key={trail.id} to={`/outdoors/${trail.slug}`}>
                    <Card className="hover:border-primary transition-colors h-full">
                      {trail.image_url && (
                        <div className="h-40 overflow-hidden rounded-t-lg">
                          <img src={trail.image_url} alt={trail.name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      )}
                      <CardContent className="p-5">
                        <h3 className="text-lg font-semibold mb-2">{trail.name}</h3>
                        {trail.description && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{trail.description}</p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {trail.difficulty && (
                            <Badge className={DIFFICULTY_COLORS[trail.difficulty]}>
                              {getDifficultyLabel(trail.difficulty)}
                            </Badge>
                          )}
                          {trail.length_miles && (
                            <Badge variant="outline">
                              <Ruler className="h-3 w-3 mr-1" />
                              {trail.length_miles} mi
                            </Badge>
                          )}
                          {trail.surface_type && (
                            <Badge variant="outline">{getSurfaceLabel(trail.surface_type)}</Badge>
                          )}
                        </div>
                        {trail.activities && trail.activities.length > 0 && (
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {trail.activities.map((activity) => {
                              const Icon = ACTIVITY_ICONS[activity] || Footprints;
                              return (
                                <span key={activity} className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Icon className="h-3 w-3" /> {activity}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No trails match the selected filters.</p>
            )}
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
