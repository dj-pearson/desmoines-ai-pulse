import { RelatedLinks } from "@/components/seo/InternalLinks";
import { useParams, Link } from "react-router-dom";
import { RouteCanonical } from "@/components/RouteCanonical";
import { createSlug } from "@/lib/slug";
import { fetchBySlug } from "@/lib/resolveBySlug";
import type { Database } from "@/integrations/supabase/types";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { LazyLocationMap } from "@/components/LazyLocationMap";
import { getDirectionsUrl } from "@/lib/directions";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import ShareDialog from "@/components/ShareDialog";
import { FAQSection } from "@/components/FAQSection";
import { BackToTop } from "@/components/BackToTop";
import EnhancedPlaygroundSEO from "@/components/EnhancedPlaygroundSEO";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { Helmet } from "react-helmet-async";
import { Star, ArrowLeft, Navigation, Check, Zap, TreePine } from "lucide-react";
import { useState } from "react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { OptimizedImage } from "@/components/OptimizedImage";
import { DETAIL_STALE_TIME, detailQueryKey } from "@/lib/detailQueryKeys";
import { isInMetro } from "@/lib/geo";
import { AttractionEventsRail } from "@/components/attractions/AttractionEventsRail";
import {
  formatMilesAway,
  suburbFromLocation,
  useNearbyPlaygrounds,
  useSameAgePlaygrounds,
  type PlaygroundCard,
} from "@/hooks/usePlaygrounds";

type Playground = Database["public"]["Tables"]["playgrounds"]["Row"];

const NOT_CONFIRMED = "Not yet confirmed";

/** A nullable boolean column, read without guessing: null is unknown. */
function yesNo(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return NOT_CONFIRMED;
}

export default function PlaygroundDetails() {
  const { slug } = useParams();
  const [imageError, setImageError] = useState(false);

  const {
    data: playground,
    isLoading,
    error,
  } = useQuery({
    queryKey: detailQueryKey("playground", slug ?? ""),
    // One row by slug, not the whole table (WEB-PERF-031). fetchBySlug keeps
    // the createSlug(name) scan as a fallback for the window between this
    // deploying and migration 20260919000008 being applied.
    queryFn: () => fetchBySlug<Playground>("playgrounds", slug ?? ""),
    enabled: Boolean(slug),
    staleTime: DETAIL_STALE_TIME,
  });

  // Explore plan WP4 item 2. Both side lists were unbounded select=* queries;
  // "nearby" was really "other age ranges, NULL ratings first", and its
  // out-of-state rows linked to Not Found. Both are metro-bounded now, and
  // nearby is a box around this playground sorted by distance.
  const { data: relatedPlaygrounds } = useSameAgePlaygrounds(playground);
  const { data: nearbyCandidates } = useNearbyPlaygrounds(playground);
  // One card per playground across the two sections.
  const relatedIds = new Set((relatedPlaygrounds ?? []).map((p) => p.id));
  const nearbyPlaygrounds = (nearbyCandidates ?? [])
    .filter((p) => !relatedIds.has(p.id))
    .slice(0, 4);

  if (isLoading) {
    return (
      <>
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/playgrounds/${slug}`} />
        <Header />
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="animate-pulse space-y-6">
              <div className="h-6 w-48 bg-muted rounded" />
              <div className="h-80 bg-muted rounded-3xl" />
              <div className="h-24 bg-muted rounded-2xl" />
              <div className="h-48 bg-muted rounded-2xl" />
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  // WEB-SEO-037 AC3. 21 of the 69 playground rows are in Oregon, Washington,
  // Colorado and Missouri (a Google Places import that went wide) and the
  // detail page resolved every one of them - so a URL the hub never links and
  // the sitemap no longer submits still rendered a full page for a park a
  // thousand miles away. Treated as not found, which is also what the
  // noindex below then says about it.
  const outsideMetro = Boolean(playground) && !isInMetro(playground?.latitude, playground?.longitude);

  if (error || !playground || outsideMetro) {
    return (
      <>
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
        <Header />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Card className="max-w-md mx-auto text-center rounded-2xl">
            <CardContent className="p-8">
              <TreePine className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Playground Not Found
              </h2>
              <p className="text-muted-foreground mb-6">
                The playground you're looking for doesn't exist or has been removed.
              </p>
              <Button asChild className="bg-[#2D1B69] hover:bg-[#2D1B69]/90">
                <Link to="/playgrounds">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Playgrounds
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  const showImage = playground.image_url && !imageError;
  const playgroundSlug = createSlug(playground.name);
  const playgroundUrl = `${BRAND.baseUrl}/playgrounds/${playgroundSlug}`;
  // The suburb the row's own location names, or none (WP4 item 3).
  const locality = suburbFromLocation(playground.location);
  const directionsUrl = getDirectionsUrl({
    latitude: playground.latitude,
    longitude: playground.longitude,
    address: `${playground.name} ${playground.location ?? ""}`,
  });

  // SEO-014. Built from this playground's own row and nothing else. The
  // previous answers told every one of these pages - suburban parks run by
  // other cities, and any indoor play space in the table - that it was "a free
  // public playground in Des Moines", "maintained by the Des Moines Parks &
  // Recreation Department", open all day with "free parking". None of
  // that is a column, and FAQPage schema publishes it as a factual claim.
  const playgroundFaqs = [
    ...(playground.age_range
      ? [
          {
            question: `What ages is ${playground.name} suitable for?`,
            answer: `${playground.name} is listed for ages ${playground.age_range}. Always supervise children during play.`,
          },
        ]
      : []),
    ...(playground.location
      ? [
          {
            question: `Where is ${playground.name} located?`,
            answer: `${playground.name} is at ${playground.location}.${playground.latitude ? " The map on this page gives directions." : ""}`,
          },
        ]
      : []),
    ...(playground.amenities && playground.amenities.length > 0
      ? [
          {
            question: `What amenities does ${playground.name} have?`,
            answer: `${playground.name} lists these amenities: ${playground.amenities.join(", ")}.`,
          },
        ]
      : []),
    ...(playground.rating != null
      ? [
          {
            question: `What is the rating for ${playground.name}?`,
            answer: `${playground.name} is rated ${playground.rating.toFixed(1)} out of 5.`,
          },
        ]
      : []),
  ];

  return (
    <>
      <Header />
      <EnhancedPlaygroundSEO
        playground={playground}
        slug={playgroundSlug}
      />
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: BRAND.baseUrl },
          { name: "Playgrounds", url: getCanonicalUrl("/playgrounds") },
          { name: playground.name, url: playgroundUrl },
        ]}
      />

      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 max-w-6xl">
          {/* Breadcrumb Navigation */}
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Playgrounds", href: "/playgrounds" },
              { label: playground.name },
            ]}
            className="mb-4"
          />

          {/* Top Actions Bar */}
          <div className="flex items-center justify-between mb-6">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground -ml-2">
              <Link to="/playgrounds">
                <ArrowLeft className="h-4 w-4 mr-1" />
                All Playgrounds
              </Link>
            </Button>
            <div className="flex gap-2">
              <ShareDialog
                title={playground.name}
                description={playground.description || `${playground.name}, a playground in ${locality ?? "the Des Moines metro"}`}
                url={typeof window !== "undefined" ? window.location.href : ""}
                trigger={
                  <Button variant="outline" size="sm" className="rounded-xl">
                    <SpriteIcon name="share-2" className="h-4 w-4 mr-1.5" />
                    Share
                  </Button>
                }
              />
              <FavoriteButton
                contentType="playground"
                contentId={playground.id}
                variant="outline"
                size="sm"
                showText
                itemName={playground.name}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Hero Card */}
          <Card className="rounded-2xl overflow-hidden mb-8">
            {/* Hero Image / Gradient */}
            <div className="relative h-72 md:h-96 overflow-hidden">
              {showImage ? (
                <OptimizedImage
                  src={playground.image_url}
                  alt={`${playground.name}, playground${locality ? ` in ${locality}` : ""}`}
                  priority
                  sizes="(max-width: 768px) 100vw, 1024px"
                  containerClassName="absolute inset-0"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="absolute inset-0 bg-[#2D1B69]" />
              )}

              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              {/* Badges */}
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                {/* "Featured" is the is_featured column and nothing more: no
                    editors' pick, and no "Free", which no column backs
                    (explore pass 2 WP4 items 2 and 4). */}
                {playground.is_featured && (
                  <Badge className="bg-amber-500 text-white border-0 text-sm font-semibold px-3 py-1">
                    Featured
                  </Badge>
                )}
              </div>

              {/* Hero text */}
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-10">
                <div className="max-w-3xl">
                  <p className="text-white/80 text-sm font-medium mb-2">
                    Playground{locality ? ` in ${locality}` : ""}
                  </p>
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight drop-shadow-lg">
                    {playground.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-white/90">
                    {playground.rating != null && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="font-semibold">{playground.rating.toFixed(1)}</span>
                      </div>
                    )}
                    {playground.age_range && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <SpriteIcon name="users" className="h-4 w-4" />
                        <span className="text-sm">Ages {playground.age_range}</span>
                      </div>
                    )}
                    {playground.location && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <SpriteIcon name="map-pin" className="h-4 w-4" />
                        <span className="text-sm">{playground.location}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <CardContent className="p-6 md:p-10">
              {/* Parent essentials (WP4 items 4 and 9). One facts row in place
                  of the four-tile grid, which spent a tile on "N/A" rating and
                  another on "--" featured. Every value is a column; a null
                  says so instead of guessing. */}
              <section aria-labelledby="essentials-heading" data-playground-essentials>
                <h2 id="essentials-heading" className="text-xl font-bold text-foreground mb-4">
                  Parent essentials
                </h2>
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                  {/* A null age range renders nothing: "All ages" was a guess. */}
                  {playground.age_range && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Ages</dt>
                      <dd className="font-semibold text-foreground">{playground.age_range}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-sm text-muted-foreground">Shade</dt>
                    <dd className="font-semibold text-foreground">{yesNo(playground.has_shade)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Restrooms</dt>
                    <dd className="font-semibold text-foreground">{yesNo(playground.has_restrooms)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Surface</dt>
                    <dd className="font-semibold text-foreground">
                      {playground.surface_type?.trim() || NOT_CONFIRMED}
                    </dd>
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <dt className="text-sm text-muted-foreground">Accessibility</dt>
                    <dd className="text-foreground">
                      {playground.accessibility_notes?.trim() || NOT_CONFIRMED}
                    </dd>
                  </div>
                </dl>
              </section>

              <Separator className="my-8" />

              {/* One Address block with one Directions link and the map
                  (explore pass 2 WP4 item 5). The two tile grids beside it
                  repeated admission, ages and "Area" and asserted a Free and
                  an editors' pick no column backs. */}
              <section aria-labelledby="address-heading" data-playground-address>
                <h2 id="address-heading" className="text-xl font-bold text-foreground mb-4">
                  Address
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    {playground.location ? (
                      <p className="font-medium text-foreground">{playground.location}</p>
                    ) : (
                      <p className="text-muted-foreground">{NOT_CONFIRMED}</p>
                    )}
                    {(playground.location || (playground.latitude != null && playground.longitude != null)) && (
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
                        data-playground-directions
                      >
                        <Navigation className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        Directions
                      </a>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Hours aren't listed for this playground. The city that runs the park sets them.
                    </p>
                  </div>
                  {playground.latitude != null && playground.longitude != null && (
                    <div className="overflow-hidden rounded-xl">
                      <LazyLocationMap
                        latitude={playground.latitude}
                        longitude={playground.longitude}
                        venue={playground.name}
                        location={playground.location}
                        className="h-48 w-full"
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* About Section */}
              {playground.description && (
                <>
                  <Separator className="my-8" />
                  <div>
                    <h2 className="text-xl font-bold text-foreground mb-4">
                      About {playground.name}
                    </h2>
                    <p className="text-foreground leading-relaxed text-lg max-w-[70ch]">
                      {playground.description}
                    </p>
                  </div>
                </>
              )}

              {/* Amenities Section */}
              {playground.amenities && playground.amenities.length > 0 && (
                <>
                  <Separator className="my-8" />
                  <section>
                    <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                      <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
                      Amenities & Features
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {playground.amenities.map((amenity, index) => (
                        <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-xl">
                          <Check className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                          <span className="text-foreground text-sm">{amenity}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </CardContent>
          </Card>

          {/* Events here and within two miles (explore pass 2 WP4 item 8).
              Renders nothing when there are none. */}
          <AttractionEventsRail
            name={playground.name}
            latitude={playground.latitude}
            longitude={playground.longitude}
          />

          {/* Playground-Specific FAQ */}
          <Card className="rounded-2xl mb-8 overflow-hidden">
            <FAQSection
              title={`Frequently Asked Questions About ${playground.name}`}
              description={`Common questions about ${playground.name}.`}
              faqs={playgroundFaqs}
              showSchema={true}
              className="border-0"
            />
          </Card>

          {/* Related Playgrounds - Same Age Range */}
          {relatedPlaygrounds && relatedPlaygrounds.length > 0 && (
            <section className="mb-8" aria-labelledby="related-heading">
              <h2 id="related-heading" className="text-2xl font-bold text-foreground mb-2">
                More Playgrounds for Ages {playground.age_range}
              </h2>
              <p className="text-muted-foreground mb-6">
                Other metro playgrounds listed for the same ages.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {relatedPlaygrounds.map((related) => (
                  <PlaygroundSideCard key={related.id} item={related} />
                ))}
              </div>
            </section>
          )}

          {/* Nearby Playgrounds - by distance from this one */}
          {nearbyPlaygrounds.length > 0 && (
            <section className="mb-8" aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="text-2xl font-bold text-foreground mb-2">
                Playgrounds Near {playground.name}
              </h2>
              <p className="text-muted-foreground mb-6">
                Closest first, by straight-line distance.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {nearbyPlaygrounds.map((nearby) => (
                  <PlaygroundSideCard key={nearby.id} item={nearby} />
                ))}
              </div>
            </section>
          )}

          {/* SEO-014 / SEO-015: the family cluster, linked in both directions.
              /events/kids links back here. */}
          <RelatedLinks
            title="More for families"
            variant="inline"
            className="mb-2 text-center"
            links={[
              { title: "Kids and family events", href: "/events/kids" },
              { title: "Events with free admission", href: "/events/free" },
              { title: "This weekend", href: "/events/this-weekend" },
              { title: "Attractions", href: "/attractions" },
            ]}
          />

          {/* Browse More CTA */}
          <div className="text-center py-8">
            <Button asChild size="lg" className="rounded-xl px-8">
              <Link to="/playgrounds">
                <TreePine className="h-5 w-5 mr-2" aria-hidden="true" />
                Browse All Des Moines Playgrounds
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <Footer />
      <BackToTop />
      <StickyMobileCTA
        variant="playground"
        primaryAction={{
          label: "Directions",
          href: directionsUrl,
          icon: "directions",
          isExternal: true,
        }}
      />
    </>
  );
}

// Below the default export so the page hero is the first OptimizedImage
// in the file, which is what scripts/check-lcp-priority.mjs reads.
interface SideCardProps {
  item: PlaygroundCard;
}

/**
 * A related/nearby card. Linked by name-derived slug: the list columns carry
 * no `slug` until plan D2's column is live, and fetchBySlug resolves the
 * name form.
 */
function PlaygroundSideCard({ item }: SideCardProps) {
  return (
    <Link to={`/playgrounds/${createSlug(item.name)}`} className="block" data-playground-side-card>
      <Card className="h-full hover:shadow-lg transition-shadow duration-300 rounded-2xl overflow-hidden">
        {item.image_url ? (
          <div className="aspect-video overflow-hidden">
            <OptimizedImage
              src={item.image_url}
              alt={item.name}
              className="object-cover"
              containerClassName="w-full h-full"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        ) : (
          <div className="aspect-video bg-muted flex items-center justify-center">
            <TreePine className="h-10 w-10 text-muted-foreground/50" />
          </div>
        )}
        <CardContent className="p-4">
          <h3 className="font-semibold text-base line-clamp-1 mb-1">{item.name}</h3>
          {item.distanceMiles != null && (
            <p className="text-sm font-medium text-foreground mb-1">{formatMilesAway(item.distanceMiles)}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {item.age_range && (
              <Badge variant="outline" className="text-xs">Ages {item.age_range}</Badge>
            )}
            {item.has_shade && <Badge variant="secondary" className="text-xs">Shade</Badge>}
            {item.has_restrooms && <Badge variant="secondary" className="text-xs">Restrooms</Badge>}
            {item.rating != null && (
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                <span>{item.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
