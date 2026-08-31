import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import ItemListSchema from '@/components/schema/ItemListSchema';
import { FAQSection } from '@/components/FAQSection';
import OutdoorsDestinationSection from '@/components/outdoors/OutdoorsDestinationSection';
import OutdoorsTopicSection from '@/components/outdoors/OutdoorsTopicSection';
import { getCanonicalUrl } from '@/lib/brandConfig';
import {
  OUTDOORS_DESTINATIONS,
  OUTDOORS_TOPICS,
  OUTDOORS_FAQS,
} from '@/data/outdoorsGuide';
import {
  usePlaygroundsNearDestinations,
  useOutdoorAttractions,
} from '@/hooks/useOutdoorsNearby';
import { useTrails, getDifficultyLabel, getSurfaceLabel } from '@/hooks/useTrails';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Ruler, Mountain, Bike, Footprints, Route } from 'lucide-react';

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
 * node - it is never allowed to exceed what the page actually links to.
 */
const SCHEMA_LIMIT = 50;

const DIFFICULTY_FILTERS = ['All', 'Easy', 'Moderate', 'Difficult'];
const ACTIVITY_FILTERS = ['All', 'Biking', 'Hiking', 'Running', 'Walking'];

/**
 * Pages elsewhere on the site that an outdoors reader has a reason to open.
 * Hand-picked rather than generated: the point of the block is that each entry
 * follows from the guide, and a generated list of hubs is a second footer.
 */
const RELATED_GUIDES: Array<{ to: string; label: string; note: string }> = [
  {
    to: '/playgrounds',
    label: 'Des Moines playgrounds',
    note: '69 mapped play spaces, filterable by age, splash pad and shade.',
  },
  {
    to: '/attractions',
    label: 'Attractions',
    note: 'The zoo, the sculpture park, the botanical garden and the rest.',
  },
  {
    to: '/things-to-do',
    label: 'Things to do in Des Moines',
    note: 'Indoor and outdoor, sorted by what is actually open.',
  },
  {
    to: '/events/this-weekend',
    label: 'This weekend',
    note: 'Festivals, races and park events happening in the next few days.',
  },
  {
    to: '/getting-around',
    label: 'Getting around',
    note: 'Driving, parking and transit, including how to reach the trailheads.',
  },
  {
    to: '/restaurants',
    label: 'Restaurants',
    note: 'Where to eat after the ride, by neighborhood and by cuisine.',
  },
  {
    to: '/breweries',
    label: 'Breweries',
    note: 'Several sit on or near the metro trail network.',
  },
  {
    to: '/best-of',
    label: 'Best of Des Moines',
    note: 'The picks, by category, updated through the year.',
  },
];

export default function OutdoorsHub() {
  const { data: allTrails, isLoading } = useTrails();
  const { data: playgroundsByDestination } = usePlaygroundsNearDestinations();
  const { data: outdoorAttractions } = useOutdoorAttractions();
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const [activityFilter, setActivityFilter] = useState('All');

  const filteredTrails = allTrails?.filter((trail) => {
    if (difficultyFilter !== 'All' && trail.difficulty !== difficultyFilter.toLowerCase()) return false;
    if (activityFilter !== 'All' && !trail.activities?.includes(activityFilter.toLowerCase())) return false;
    return true;
  });

  const canonicalUrl = getCanonicalUrl('/outdoors');

  /**
   * SEO-024. The guide's eight destinations, as typed Place nodes.
   *
   * `itemType` is "Place" and each element overrides it through `itemProps`
   * with its own narrower type - Park for the parks, TouristAttraction for the
   * trails. ItemListSchema spreads `itemProps` last, so the override is by
   * design rather than by accident, and both types are subtypes of Place, so
   * the list-level declaration stays true either way.
   *
   * ONE ItemList ships, not two, and that is not a style preference. A first
   * build of this page emitted a destinations list and a trails list; the
   * prerenderer's dedupeJsonLd (scripts/lazy-preload-patterns.mjs) keeps only
   * the LAST Helmet-managed block of any given @type, so the destinations list
   * - the whole point of the story - was dropped from the shipped HTML and the
   * build said so in one line: "dropped 1 duplicate JSON-LD block(s) on
   * /outdoors (ItemList)". Two legitimately different lists of the same @type
   * cannot both survive a prerender. They are merged below instead.
   */
  const destinationItems = OUTDOORS_DESTINATIONS.map((destination) => ({
    name: destination.name,
    url: destination.internalPath
      ? getCanonicalUrl(destination.internalPath)
      : `${canonicalUrl}#${destination.id}`,
    description: destination.headline,
    itemProps: {
      '@type': destination.schemaType,
      address: {
        '@type': 'PostalAddress',
        ...(destination.address.street && { streetAddress: destination.address.street }),
        addressLocality: destination.address.city,
        addressRegion: destination.address.state,
        ...(destination.address.zip && { postalCode: destination.address.zip }),
        addressCountry: 'US',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: destination.geo.latitude,
        longitude: destination.geo.longitude,
      },
      // Every destination states its cost in the guide. "Free." is the literal
      // first word wherever admission is free, and the Raccoon River Valley
      // Trail - the one place on the list that charges - starts "Trail pass
      // required", so this reads the same fact the visitor is shown.
      isAccessibleForFree: destination.logistics.cost.startsWith('Free'),
      publicAccess: true,
      sameAs: destination.officialUrl,
    },
  }));

  // SEO-022 built this from allTrails, not filteredTrails: the schema has to
  // describe the page a crawler is actually served, and that is always the
  // unfiltered default - the filters are client state and never survive a
  // prerender.
  const trailItems = (allTrails ?? []).map((trail) => ({
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

  /**
   * The page's one list: the eight guide destinations, then every mapped trail
   * that is not already one of them.
   *
   * Five of the eight destinations ARE rows in `trails` and point at the same
   * /outdoors/<slug> URL, so a naive concatenation would list the High Trestle
   * Trail twice under one number. Deduplicating on url keeps numberOfItems
   * equal to the count of distinct places, which is the one claim in an
   * ItemList a crawler can check against the page without judgement.
   */
  const listedUrls = new Set(destinationItems.map((item) => item.url));
  const outdoorItems = [
    ...destinationItems,
    ...trailItems.filter((item) => !listedUrls.has(item.url)),
  ].slice(0, SCHEMA_LIMIT);

  return (
    <>
      <SEOHead
        title="Trails, Parks and Hiking Near Des Moines"
        description="Where to hike, bike, paddle and camp around Des Moines: Gray's Lake, Ledges State Park, the High Trestle bridge, Big Creek and Jester Park, with parking, dog rules and what stays open in winter."
        url={canonicalUrl}
        canonicalUrl={canonicalUrl}
        keywords={[
          'best hiking near Des Moines',
          'best bike trails Des Moines',
          'state parks near Des Moines',
          "Gray's Lake Park Des Moines",
          'Ledges State Park',
          'High Trestle Trail parking',
          'dog parks Des Moines',
        ]}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Outdoors', url: '/outdoors' },
        ]}
      />
      <ItemListSchema
        name="Outdoor destinations and trails around Des Moines"
        description="State parks, county parks and rail trails within about 40 minutes of downtown Des Moines, with parking, trailheads, dog rules and winter access."
        items={outdoorItems}
        itemType="Place"
      />
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-10">
          <header className="max-w-[70ch]">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Trails, parks and hiking near Des Moines
            </h1>
            <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Des Moines is flatter than it is boring. There are about 800 miles of
                connected trail in the metro, a sandstone canyon 40 minutes northwest, an
                866-acre lake 30 minutes north, and a bridge 13 stories above the Des
                Moines River that is lit blue every night of the year.
              </p>
              <p>
                This is the practical version of that. Eight destinations that are worth
                the drive, then the answers to the things people actually ask before they
                go: where to park, which trailhead, whether the dog can come, and what is
                still open in February.
              </p>
            </div>
          </header>

          <nav aria-label="Jump to a destination" className="mt-8 max-w-4xl">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              The eight, and how far each one is
            </h2>
            <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {OUTDOORS_DESTINATIONS.map((destination) => (
                <li key={destination.id} className="text-sm">
                  <a
                    href={`#${destination.id}`}
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    {destination.name}
                  </a>
                  <span className="text-muted-foreground">
                    {' '}
                    {destination.logistics.fromDowntown}
                  </span>
                </li>
              ))}
            </ul>
          </nav>

          <section className="mt-14" aria-labelledby="destinations-heading">
            <h2 id="destinations-heading" className="text-3xl font-bold mb-8">
              Where to go
            </h2>
            <div className="space-y-12">
              {OUTDOORS_DESTINATIONS.map((destination) => (
                <OutdoorsDestinationSection
                  key={destination.id}
                  destination={destination}
                  nearbyPlaygrounds={playgroundsByDestination?.[destination.id]}
                />
              ))}
            </div>
          </section>

          <section className="mt-16" aria-labelledby="activities-heading">
            <h2 id="activities-heading" className="text-3xl font-bold mb-8">
              Dogs, discs, boats, fish and everything else
            </h2>
            <div className="space-y-12">
              {OUTDOORS_TOPICS.map((topic) => (
                <OutdoorsTopicSection key={topic.id} topic={topic} />
              ))}
            </div>
          </section>

          <section className="mt-16" aria-labelledby="trails-heading">
            <h2 id="trails-heading" className="text-3xl font-bold mb-2">
              Every trail we have mapped
            </h2>
            <p className="text-muted-foreground max-w-[70ch] mb-6">
              Length, difficulty, surface and what each one is good for. Filter by how
              hard you want it to be or by what you are bringing.
            </p>

            <div className="flex flex-wrap gap-6 mb-6">
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

          {outdoorAttractions && outdoorAttractions.length > 0 && (
            <section className="mt-16" aria-labelledby="outdoor-attractions-heading">
              <h2 id="outdoor-attractions-heading" className="text-3xl font-bold mb-2">
                More of the metro that is outdoors
              </h2>
              <p className="text-muted-foreground max-w-[70ch] mb-6">
                Parks, gardens, the zoo and the courses. Each has its own page with hours,
                address and what it costs.
              </p>
              <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {outdoorAttractions.map((attraction) => (
                  <li key={attraction.path} className="text-sm">
                    <Link to={attraction.path} className="text-primary underline underline-offset-4">
                      {attraction.name}
                    </Link>
                    <span className="text-muted-foreground"> {attraction.type}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-16" aria-labelledby="playgrounds-heading">
            <h2 id="playgrounds-heading" className="text-3xl font-bold mb-2">
              Bringing kids
            </h2>
            <div className="max-w-[70ch] space-y-4 leading-relaxed text-muted-foreground">
              <p>
                Most of the parks on this page have a playground inside them or within a
                few minutes, and each destination above lists the closest ones. Two are
                worth planning around on their own: the natural playscape at Jester Park,
                built out of logs, sand and water rather than molded plastic, and the
                playground at Big Creek State Park, which sits close enough to the beach
                to do both in one trip.
              </p>
              <p>
                The full metro list runs to 69 mapped play spaces with age ranges, splash
                pads, shade and accessibility on each, and it is the best-ranking part of
                this site for a reason.
              </p>
            </div>
            <p className="mt-4">
              <Link
                to="/playgrounds"
                className="font-medium text-primary underline underline-offset-4"
              >
                Every playground in the Des Moines metro
              </Link>
            </p>
          </section>

          <section className="mt-16" aria-labelledby="related-heading">
            <h2 id="related-heading" className="text-3xl font-bold mb-6">
              Keep going
            </h2>
            <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {RELATED_GUIDES.map((guide) => (
                <li key={guide.to}>
                  <Link
                    to={guide.to}
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    {guide.label}
                  </Link>
                  <p className="text-sm text-muted-foreground mt-0.5">{guide.note}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-16 max-w-4xl" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="sr-only">
              Frequently asked questions about the outdoors in Des Moines
            </h2>
            <FAQSection
              title="Outdoors in Des Moines: common questions"
              description="Parking, dogs, fees and winter access, answered for the places people search for most."
              faqs={OUTDOORS_FAQS}
              showSchema={true}
            />
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
