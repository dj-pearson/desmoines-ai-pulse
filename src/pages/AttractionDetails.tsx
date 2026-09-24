import { NearbyHotels } from "@/components/venues/NearbyHotels";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ATTRACTION_LIST_COLUMNS } from "@/lib/listColumns";
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
import { STATUS_BADGE } from "@/lib/categoryStyles";
import { OpenStatusChip } from "@/components/OpenStatusChip";
import ShareDialog from "@/components/ShareDialog";
import { FAQSection } from "@/components/FAQSection";
import { RatingSystem } from "@/components/RatingSystem";
import { ClaimListingCta } from "@/components/business/ClaimListingCta";
import { BackToTop } from "@/components/BackToTop";
import EnhancedAttractionSEO from "@/components/EnhancedAttractionSEO";
import SEOHead from "@/components/SEOHead";
import { RouteCanonical } from "@/components/RouteCanonical";
import { AttractionEventsRail } from "@/components/attractions/AttractionEventsRail";
import { BRAND } from "@/lib/brandConfig";
import { Star, ArrowLeft, Navigation, Landmark } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useContentTracking } from "@/hooks/useContentTracking";
import { useRecordRecentView } from "@/hooks/useRecentlyViewedFeed";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import { LastUpdatedBadge } from "@/components/LastUpdatedBadge";
import { NearbyContent } from "@/components/NearbyContent";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { createSlug } from "@/lib/slug";
import { fetchBySlug } from "@/lib/resolveBySlug";
import { attractionOpenStatus, weeklyHoursRows } from "@/lib/attractionHours";
import { formatMiles, nearby } from "@/lib/venuePages";
import type { Database } from "@/integrations/supabase/types";
import { OptimizedImage } from "@/components/OptimizedImage";
import { DETAIL_STALE_TIME, detailQueryKey } from "@/lib/detailQueryKeys";

type Attraction = Database["public"]["Tables"]["attractions"]["Row"];

// Estimated visit duration by attraction type (in minutes)
const VISIT_DURATION_BY_TYPE: Record<string, { min: number; max: number }> = {
  'Museum': { min: 60, max: 180 },
  'Park': { min: 30, max: 120 },
  'Garden': { min: 30, max: 90 },
  'Zoo': { min: 120, max: 240 },
  'Historic Site': { min: 30, max: 90 },
  'Theater': { min: 90, max: 180 },
  'Art Gallery': { min: 45, max: 120 },
  'Stadium': { min: 120, max: 240 },
  'Landmark': { min: 15, max: 60 },
  'Trail': { min: 60, max: 180 },
  'Recreation': { min: 60, max: 180 },
  'Shopping': { min: 30, max: 120 },
  'Entertainment': { min: 60, max: 180 },
};
const DEFAULT_DURATION = { min: 30, max: 120 };

function getEstimatedDuration(type: string | null): string {
  const duration = (type && VISIT_DURATION_BY_TYPE[type]) || DEFAULT_DURATION;
  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };
  return `${formatTime(duration.min)} - ${formatTime(duration.max)}`;
}

// The "Near X" rail's search box: about ten miles each way at Des Moines'
// latitude. The distance filter below trims it to a radius.
const NEAR_LAT_PAD = 0.15;
const NEAR_LNG_PAD = 0.2;
const NEAR_MAX_MILES = 10;

type AttractionCardRow = Pick<Attraction, "id" | "name" | "type" | "image_url" | "rating" | "latitude" | "longitude">;

export default function AttractionDetails() {
  const { slug } = useParams();
  const [imageError, setImageError] = useState(false);

  const {
    data: attraction,
    isLoading,
    error,
  } = useQuery({
    queryKey: detailQueryKey("attraction", slug ?? ""),
    // attractions now has a slug column (migration 20260919000008), so this is
    // one row by unique key. The (id, name) scan this replaces is still in
    // fetchBySlug as the fallback for the window before that migration is
    // applied (WEB-PERF-031).
    queryFn: () => fetchBySlug<Attraction>("attractions", slug ?? ""),
    enabled: Boolean(slug),
    // Shared with usePrefetchAttraction through detailQueryKeys, or the
    // prefetch is discarded as stale the instant the page mounts and the hover
    // cost bought nothing.
    staleTime: DETAIL_STALE_TIME,
  });

  // Track page view and content interactions
  const { trackShare, trackClick } = useContentTracking(attraction?.id, 'attraction');
  // Record into the unified recently-viewed feed (WEB-FEAT-007). Only
  // EventDetails used to, so the home rail could never resume an attraction.
  // The href is the param that just resolved this row, so it resolves again.
  useRecordRecentView(
    attraction && slug
      ? {
          id: attraction.id,
          type: "attraction",
          title: attraction.name,
          href: `/attractions/${slug}`,
          image_url: attraction.image_url ?? undefined,
          subtitle: attraction.type ?? undefined,
        }
      : null,
  );
  // Both rails read is_active (Explore plan WP3 item 5): an inactive row 404s
  // on its own page, so linking it from a rail was a dead end.
  const { data: relatedAttractions } = useQuery({
    queryKey: ["related-attractions", attraction?.type, attraction?.id],
    queryFn: async () => {
      if (!attraction) return [];
      const { data, error } = await supabase
        .from("attractions")
        .select(ATTRACTION_LIST_COLUMNS)
        .eq("is_active", true)
        .eq("type", attraction.type)
        .neq("id", attraction.id)
        .limit(4);

      if (error) throw error;
      return (data || []) as unknown as AttractionCardRow[];
    },
    enabled: !!attraction,
  });

  const lat = attraction?.latitude ?? null;
  const lng = attraction?.longitude ?? null;
  const located = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);

  // Geographic when the attraction has coordinates: a bounding box around it,
  // nearest first. Without coordinates it falls back to the highest-rated
  // active attractions, and the heading says so rather than calling them near.
  const { data: nearbyAttractions } = useQuery({
    queryKey: ["nearby-attractions", attraction?.id, located ? lat?.toFixed(3) : null, located ? lng?.toFixed(3) : null],
    queryFn: async (): Promise<Array<{ row: AttractionCardRow; miles?: number }>> => {
      if (!attraction) return [];
      if (located && lat != null && lng != null) {
        const { data, error } = await supabase
          .from("attractions")
          .select(ATTRACTION_LIST_COLUMNS)
          .eq("is_active", true)
          .neq("id", attraction.id)
          .gte("latitude", lat - NEAR_LAT_PAD)
          .lte("latitude", lat + NEAR_LAT_PAD)
          .gte("longitude", lng - NEAR_LNG_PAD)
          .lte("longitude", lng + NEAR_LNG_PAD)
          .limit(40);
        if (error) throw error;
        const rows = (data || []) as unknown as AttractionCardRow[];
        return nearby({ latitude: lat, longitude: lng }, rows, { maxMiles: NEAR_MAX_MILES, limit: 8 }).map(
          ({ item, miles }) => ({ row: item, miles }),
        );
      }
      const { data, error } = await supabase
        .from("attractions")
        .select(ATTRACTION_LIST_COLUMNS)
        .eq("is_active", true)
        .neq("id", attraction.id)
        .order("rating", { ascending: false, nullsFirst: false })
        .limit(8);
      if (error) throw error;
      return ((data || []) as unknown as AttractionCardRow[]).map((row) => ({ row }));
    },
    enabled: !!attraction,
  });


  if (isLoading) {
    return (
      <>
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/attractions/${slug}`} />
        <Header />
        <div className="min-h-screen bg-gray-50">
          <div className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="animate-pulse space-y-6">
              <div className="h-6 w-48 bg-gray-200 rounded" />
              <div className="h-80 bg-gray-200 rounded-3xl" />
              <div className="grid md:grid-cols-4 gap-4">
                <div className="h-24 bg-gray-200 rounded-2xl" />
                <div className="h-24 bg-gray-200 rounded-2xl" />
                <div className="h-24 bg-gray-200 rounded-2xl" />
                <div className="h-24 bg-gray-200 rounded-2xl" />
              </div>
              <div className="h-48 bg-gray-200 rounded-2xl" />
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  // WEB-SEO-037 AC2. The hub (useAttractions) and functions/_middleware.ts
  // both filter is_active; this page resolved any row, so an attraction taken
  // off the site stayed reachable by its own URL and kept its indexable page.
  const inactive = Boolean(attraction) && attraction?.is_active === false;

  if (error || !attraction || inactive) {
    return (
      <>
        <Helmet>
          <meta name="robots" content="noindex, follow" />
        </Helmet>
        <Header />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Card className="max-w-md mx-auto text-center shadow-lg rounded-2xl">
            <CardContent className="p-8">
              <Landmark className="h-16 w-16 text-gray-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Attraction Not Found
              </h2>
              <p className="text-gray-600 mb-6">
                The attraction you're looking for doesn't exist or has been removed.
              </p>
              <Link to="/attractions">
                <Button className="bg-[#2D1B69] hover:bg-[#2D1B69]/90">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Attractions
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  const showImage = attraction.image_url && !imageError;
  const attractionSlug = createSlug(attraction.name);
  const directionsUrl = getDirectionsUrl({
    latitude: attraction.latitude,
    longitude: attraction.longitude,
    address: `${attraction.name} ${attraction.location ?? ""}`.trim(),
  });

  // Explore plan WP3 item 3. attractions.hours is per-day JSONB; the chip used
  // to be handed that object and always fell back to "check official site".
  const openStatus = attractionOpenStatus(attraction.hours, attraction.hours_summary);
  const weeklyHours = weeklyHoursRows(attraction.hours);
  const typeLabel = attraction.type?.toLowerCase() || "attraction";

  // Rows for "Plan your visit". Each renders only with data behind it.
  const admission =
    attraction.is_free === true
      ? "Free"
      : attraction.is_free === false
        ? "Paid admission. Prices are on the official site."
        : null;
  const setting =
    attraction.is_indoor === true ? "Indoor" : attraction.is_indoor === false ? "Outdoor" : null;
  const kidFriendly =
    attraction.is_kid_friendly === true ? "Yes" : attraction.is_kid_friendly === false ? "No" : null;

  // SEO-011. From this attraction's row only. The previous answers placed
  // every attraction "in Des Moines, Iowa" (Altoona and Urbandale included),
  // gave every one the same interstate, parking and DART directions that
  // WEB-SEO-022 removed from event pages for the same reason, called ratings
  // "based on visitor reviews" with no source for that, and called each one
  // "popular among families". FAQPage schema publishes each as a claim.
  const attractionFaqs = [
    ...(attraction.description
      ? [
          {
            question: `What is ${attraction.name}?`,
            answer: attraction.description.slice(0, 300),
          },
        ]
      : []),
    ...(attraction.location
      ? [
          {
            question: `Where is ${attraction.name} located?`,
            answer: `${attraction.name} is at ${attraction.location}.${attraction.latitude ? " The map on this page gives directions." : ""}`,
          },
        ]
      : []),
    ...(attraction.is_free != null
      ? [
          {
            question: `Is ${attraction.name} free?`,
            answer: attraction.is_free
              ? `Yes, admission to ${attraction.name} is free.`
              : `No, ${attraction.name} charges admission. Check its official site for current prices.`,
          },
        ]
      : []),
    {
      question: `How long should I spend at ${attraction.name}?`,
      answer: `Plan on ${getEstimatedDuration(attraction.type)}. That is a rough estimate for a ${attraction.type?.toLowerCase() || "visit like this"}, not a figure from ${attraction.name}; check its official site for anything time-sensitive.`,
    },
  ];

  const relatedShown = relatedAttractions && relatedAttractions.length >= 3 ? relatedAttractions : [];
  const relatedIds = new Set(relatedShown.map((r) => r.id));
  const nearShown = (nearbyAttractions ?? []).filter(({ row }) => !relatedIds.has(row.id)).slice(0, 4);

  return (
    <>
      <Header />
      <EnhancedAttractionSEO
        attraction={attraction}
        slug={attractionSlug}
      />
      {/* No `location` prop: EnhancedAttractionSEO's TouristAttraction is the
          one place entity this page publishes (Explore plan WP3 item 4). */}
      <SEOHead
        title={`${attraction.name} - ${attraction.type} in ${BRAND.city}, ${BRAND.state}`}
        description={
          attraction.description
            ? attraction.description.slice(0, 160)
            : `${attraction.name}, a ${typeLabel} in the ${BRAND.city} area: hours, directions and what's on nearby.`
        }
        type="website"
        imageUrl={attraction.image_url || undefined}
        url={`/attractions/${attractionSlug}`}
        keywords={[
          attraction.name,
          attraction.type,
          `${BRAND.city} attractions`,
          `things to do ${BRAND.city}`,
          `${attraction.type} ${BRAND.city}`,
        ].filter(Boolean) as string[]}
        modifiedTime={attraction.updated_at}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Attractions", url: "/attractions" },
          { name: attraction.type, url: `/attractions?type=${encodeURIComponent(attraction.type)}` },
          { name: attraction.name, url: `/attractions/${attractionSlug}` },
        ]}
      />

      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-6 max-w-6xl">
          {/* Breadcrumb Navigation */}
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Attractions", href: "/attractions" },
              { label: attraction.type, href: `/attractions?type=${encodeURIComponent(attraction.type)}` },
              { label: attraction.name },
            ]}
            className="mb-4"
          />

          {/* Top Actions Bar: the page's one Share control. */}
          <div className="flex items-center justify-between mb-6">
            <Link to="/attractions">
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 -ml-2">
                <ArrowLeft className="h-4 w-4 mr-1" />
                All Attractions
              </Button>
            </Link>
            <div className="flex gap-2">
              <ShareDialog
                title={attraction.name}
                description={attraction.description || `${attraction.name}, a ${typeLabel} in the ${BRAND.city} area`}
                url={typeof window !== "undefined" ? window.location.href : ""}
                onShare={trackShare}
                trigger={
                  <Button variant="outline" size="sm" className="rounded-xl">
                    <SpriteIcon name="share-2" className="h-4 w-4 mr-1.5" />
                    Share
                  </Button>
                }
              />
              <FavoriteButton
                contentType="attraction"
                contentId={attraction.id}
                variant="outline"
                size="sm"
                showText
                itemName={attraction.name}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Hero Card */}
          <Card className="shadow-sm rounded-2xl overflow-hidden border mb-8">
            {/* A photo gets the tall hero; without one, a solid band at about
                half the height (Explore plan WP3 item 11). */}
            <div className={`relative overflow-hidden ${showImage ? "h-72 md:h-96" : "h-44 md:h-52 bg-[#2D1B69]"}`}>
              {showImage && (
                <>
                  <OptimizedImage
                    src={attraction.image_url}
                    alt={`${attraction.name} - ${attraction.type}`}
                    priority
                    sizes="(max-width: 768px) 100vw, 1024px"
                    containerClassName="absolute inset-0"
                    onError={() => setImageError(true)}
                  />
                  {/* Legibility scrim for the white title over a photo. */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                </>
              )}

              {attraction.is_featured && (
                <div className="absolute top-4 left-4 flex gap-2 z-10">
                  <Badge className={`${STATUS_BADGE.featured} border-0 text-sm font-semibold px-3 py-1`}>
                    <SpriteIcon name="sparkles" className="h-3.5 w-3.5 mr-1.5" />
                    Featured
                  </Badge>
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-10">
                <div className="max-w-3xl">
                  {attraction.type && (
                    <p className="flex items-center gap-2 mb-2 text-white/85 text-sm font-medium">
                      <Landmark className="h-4 w-4" aria-hidden="true" />
                      {attraction.type}
                    </p>
                  )}
                  <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-3 tracking-tight">
                    {attraction.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-white/90">
                    {attraction.rating != null && (
                      <a
                        href="#reviews"
                        className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 hover:bg-white/30"
                        aria-label={`Rated ${attraction.rating.toFixed(1)} out of 5. Go to reviews`}
                      >
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                        <span className="font-semibold">{attraction.rating.toFixed(1)}</span>
                      </a>
                    )}
                    {attraction.location && (
                      <span className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-sm">
                        <SpriteIcon name="map-pin" className="h-4 w-4" />
                        {attraction.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Today's status, computed from the row (or the hours text). */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-4 md:px-10 bg-gray-50 border-b">
              <OpenStatusChip
                status={openStatus}
                website={attraction.website}
                fallbackLabel={attraction.hours_summary || "Check official site for hours"}
              />
            </div>

            <CardContent className="p-6 md:p-10">
              {/* Plan your visit (Explore plan WP3 item 6): one list in place
                  of the stat tiles and the two detail blocks. */}
              <section aria-labelledby="plan-visit-heading">
                <h2 id="plan-visit-heading" className="text-xl font-bold text-gray-900 mb-2">
                  Plan your visit
                </h2>
                <dl className="divide-y">
                  {weeklyHours.length > 0 ? (
                    <VisitRow term="Hours">
                      <table className="w-full max-w-sm text-sm">
                        <caption className="sr-only">Opening hours by day</caption>
                        <tbody>
                          {weeklyHours.map((row) => (
                            <tr
                              key={row.label}
                              className={row.isToday ? "font-semibold text-amber-950 bg-amber-50" : undefined}
                              aria-current={row.isToday ? "date" : undefined}
                            >
                              <th scope="row" className="py-1 pr-4 pl-2 text-left font-[inherit]">
                                {row.label}
                                {row.isToday && <span className="sr-only"> (today)</span>}
                              </th>
                              <td className="py-1 pr-2">{row.text ?? "Not listed"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </VisitRow>
                  ) : attraction.hours_summary ? (
                    <VisitRow term="Hours">{attraction.hours_summary}</VisitRow>
                  ) : null}
                  {admission && <VisitRow term="Admission">{admission}</VisitRow>}
                  {setting && <VisitRow term="Indoor / outdoor">{setting}</VisitRow>}
                  {kidFriendly && <VisitRow term="Kid-friendly">{kidFriendly}</VisitRow>}
                  {attraction.accessibility_notes && (
                    <VisitRow term="Accessibility">{attraction.accessibility_notes}</VisitRow>
                  )}
                  {attraction.location && (
                    <VisitRow term="Address">
                      <p>{attraction.location}</p>
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center text-sm font-medium text-[#2D1B69] hover:underline"
                      >
                        <Navigation className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        Directions
                      </a>
                      {attraction.latitude && attraction.longitude && (
                        <div className="mt-2 overflow-hidden rounded-xl">
                          <LazyLocationMap
                            latitude={attraction.latitude}
                            longitude={attraction.longitude}
                            venue={attraction.name}
                            location={attraction.location}
                            className="h-48 w-full"
                          />
                        </div>
                      )}
                    </VisitRow>
                  )}
                  <VisitRow term="Est. visit time">
                    {getEstimatedDuration(attraction.type)}
                    <span className="block text-sm text-gray-500">
                      Our estimate for a {typeLabel}, not a figure from {attraction.name}.
                    </span>
                  </VisitRow>
                  {attraction.website && (
                    <VisitRow term="Website">
                      <a
                        href={attraction.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-1 font-medium text-[#2D1B69] hover:underline"
                      >
                        Official site
                        <SpriteIcon name="external-link" className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </VisitRow>
                  )}
                </dl>
              </section>

              {/* About. The summary paragraph is geo_summary when the row has
                  one; the old one was a template ("vibrant", "must-visit")
                  stamped on every attraction. */}
              {(attraction.description || attraction.geo_summary) && (
                <>
                  <Separator className="my-8" />
                  <section>
                    <h2 className="text-xl font-bold text-gray-900 mb-4">
                      About {attraction.name}
                    </h2>
                    {attraction.description && (
                      <p className="text-gray-700 leading-relaxed text-lg max-w-prose">
                        {attraction.description}
                      </p>
                    )}
                    {attraction.geo_summary && (
                      <p
                        className="attraction-summary mt-4 text-gray-700 leading-relaxed max-w-prose"
                        itemProp="description"
                      >
                        {attraction.geo_summary}
                      </p>
                    )}
                  </section>
                </>
              )}
            </CardContent>
          </Card>

          {/* Own this business? (WEB-ADS-009) */}
          <div className="mb-8">
            <ClaimListingCta
              listingType="attraction"
              listingId={attraction.id}
              listingName={attraction.name}
            />
          </div>

          {/* Events at this attraction and within two miles (WP3 item 8). */}
          <AttractionEventsRail
            name={attraction.name}
            latitude={attraction.latitude}
            longitude={attraction.longitude}
          />

          {/* Ratings & Reviews (WEB-FEAT-010) */}
          <div id="reviews" className="mb-8">
            <RatingSystem contentType="attraction" contentId={attraction.id} showReviews />
          </div>

          {/* Attraction-Specific FAQ */}
          <Card className="shadow-sm rounded-2xl mb-8 overflow-hidden">
            <FAQSection
              title={`Frequently Asked Questions About ${attraction.name}`}
              description={`Common questions about ${attraction.name}.`}
              faqs={attractionFaqs}
              showSchema={true}
              className="border-0"
            />
          </Card>

          {/* Same type - hidden when fewer than 3 matches */}
          {relatedShown.length > 0 && (
            <section className="mb-8" aria-labelledby="related-heading">
              <h2 id="related-heading" className="text-2xl font-bold text-gray-900 mb-6">
                More {typeLabel} attractions
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" onClick={trackClick}>
                {relatedShown.map((related) => (
                  <AttractionMiniCard key={related.id} row={related} />
                ))}
              </div>
            </section>
          )}

          {nearShown.length > 0 && (
            <section className="mb-8" aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="text-2xl font-bold text-gray-900 mb-2">
                {located ? `Near ${attraction.name}` : "Highest-rated attractions"}
              </h2>
              <p className="text-gray-600 mb-6">
                {located
                  ? `Within ${NEAR_MAX_MILES} miles, closest first. Distances are straight-line.`
                  : "Sorted by rating, since this attraction has no map location."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {nearShown.map(({ row, miles }) => (
                  <AttractionMiniCard key={row.id} row={row} miles={miles} />
                ))}
              </div>
            </section>
          )}

          <NearbyHotels
            latitude={attraction.latitude}
            longitude={attraction.longitude}
            placeName={attraction.name}
            limit={3}
          />

          {/* Cross-Content: Nearby Restaurants */}
          <NearbyContent
            variant="restaurants-near-attraction"
            city="Des Moines"
            excludeId={attraction.id}
            latitude={attraction.latitude}
            longitude={attraction.longitude}
          />

          {/* Browse More CTA */}
          <div className="text-center py-8">
            <Link to="/attractions">
              <Button size="lg" className="bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white rounded-xl px-8">
                <Landmark className="h-5 w-5 mr-2" />
                Browse all attractions
              </Button>
            </Link>
          </div>
        </div>

        <LastUpdatedBadge updatedAt={attraction.updated_at} className="mt-6 justify-center" />
      </div>
      <Footer />
      <BackToTop />

      <StickyMobileCTA
        variant="attraction"
        primaryAction={
          attraction.location
            ? {
                label: "Get Directions",
                href: directionsUrl,
                icon: "directions",
                isExternal: true,
              }
            : undefined
        }
        secondaryAction={
          attraction.website
            ? {
                label: "Visit Website",
                href: attraction.website,
                icon: "website",
                isExternal: true,
              }
            : undefined
        }
      />
    </>
  );
}

// Below the page on purpose: scripts/check-lcp-priority.mjs reads the first
// <OptimizedImage> in this file as the hero.
interface AttractionMiniCardProps {
  row: AttractionCardRow;
  /** A distance line, when the rail is geographic. */
  miles?: number;
}

function AttractionMiniCard({ row, miles }: AttractionMiniCardProps) {
  return (
    <Link to={`/attractions/${createSlug(row.name)}`} className="block">
      <Card className="h-full hover:shadow-md transition-shadow rounded-2xl overflow-hidden">
        {row.image_url ? (
          <div className="aspect-video overflow-hidden">
            <OptimizedImage
              src={row.image_url}
              alt={`${row.name} - ${row.type}`}
              className="object-cover"
              containerClassName="w-full h-full"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          </div>
        ) : (
          <div className="aspect-video bg-muted flex items-center justify-center">
            <Landmark className="h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
          </div>
        )}
        <CardContent className="p-4">
          <h3 className="font-semibold text-base line-clamp-1 mb-1">{row.name}</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="text-xs">{row.type}</Badge>
            {row.rating != null && (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                <span>{row.rating.toFixed(1)}</span>
              </span>
            )}
            {miles != null && <span>{formatMiles(miles)}</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface VisitRowProps {
  term: string;
  children: ReactNode;
}

function VisitRow({ term, children }: VisitRowProps) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-gray-900">{term}</dt>
      <dd className="text-gray-700">{children}</dd>
    </div>
  );
}
