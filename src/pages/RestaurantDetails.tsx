import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import SEOHead from "@/components/SEOHead";
import { RouteCanonical } from "@/components/RouteCanonical";
import { ogImageUrl } from "@/lib/ogImage";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { AIWriteup } from "@/components/AIWriteup";
import { RestaurantStatus } from "@/components/RestaurantStatus";
import ShareDialog from "@/components/ShareDialog";
import { FAQSection } from "@/components/FAQSection";
import { BackToTop } from "@/components/BackToTop";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import SpeakableSchema from "@/components/schema/SpeakableSchema";
import { getCanonicalUrl } from "@/lib/brandConfig";
import {
  buildRestaurantSchema,
  currentDescription,
  priceTier,
  restaurantLocality,
  restaurantMetaDescription,
  restaurantPageTitle,
} from "@/lib/restaurantMeta";
import { buildRestaurantFaqs, type RestaurantLifecycle } from "@/lib/restaurantFaqs";
import { Phone, Star, DollarSign, ArrowLeft, Navigation, MessageCircle, Utensils, Globe, Info, Map, CalendarCheck, RefreshCw } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useContentTracking } from "@/hooks/useContentTracking";
import { useRecordRecentView } from "@/hooks/useRecentlyViewedFeed";
import {
  formatOpenStatusLine,
  resolveOpenStatus,
  resolveOpeningHoursSpecification,
  type RestaurantOpenResult,
  type StoredOpeningHours,
} from "@/lib/restaurantHours";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useRestaurantMenu } from "@/hooks/useRestaurantMenu";
import { tonightHeading, useTonightNearRestaurant } from "@/hooks/useTonightNearRestaurant";
import { handleError } from "@/lib/errorHandler";
import { LazyLocationMap } from "@/components/LazyLocationMap";
import { getDirectionsUrl } from "@/lib/directions";
import { resolveReservation, safeWebUrl, telHref } from "@/lib/reservations";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import { SponsoredBadge } from "@/components/SponsoredBadge";
import { AIDisclosureBadge } from "@/components/AIDisclosureBadge";
import { isSponsoredActive } from "@/lib/sponsored";
import { NearbyContent, TonightNearRestaurant } from "@/components/NearbyContent";
import { RestaurantMenuSection } from "@/components/RestaurantMenuSection";
import { RatingSystem } from "@/components/RatingSystem";
import { ClaimListingCta } from "@/components/business/ClaimListingCta";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { DETAIL_STALE_TIME, detailQueryKey } from "@/lib/detailQueryKeys";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Why you can't eat here today, or null when nothing says so. Two columns
 * record it (eat-drink pass 2, WP3.2, first-pass WP8.2):
 *  - `status`, whose CHECK (20250728165446:13) allows open, newly_opened,
 *    opening_soon, announced and closed. "closed" means closed for good, the
 *    reading RestaurantCard gives it. The legacy spellings are for rows
 *    written before the CHECK.
 *  - `business_status`, Google's CLOSED_PERMANENTLY / CLOSED_TEMPORARILY. It
 *    is read off the select("*") row the way hours_json is, so it is undefined
 *    until migration 20260919000009 is applied, and no select names it.
 */
type Lifecycle = RestaurantLifecycle;

function lifecycleOf(status: string | null | undefined, businessStatus?: string | null): Lifecycle {
  const google = (businessStatus ?? "").trim().toUpperCase();
  const own = (status ?? "").trim().toLowerCase();
  if (google === "CLOSED_PERMANENTLY" || own === "closed" || own === "permanently_closed") return "closed";
  if (google === "CLOSED_TEMPORARILY" || own === "temporarily_closed") return "temporarily_closed";
  if (own === "opening_soon" || own === "announced") return "not_open_yet";
  return null;
}

function formatOpeningDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : format(parsed, "MMMM d, yyyy");
}

/**
 * Open/closed for this page, from one evaluation on the shared minute clock,
 * so the hero badge and the hours block cannot disagree (WP8 item 5).
 * hours_json is used when select("*") returns it; nothing adds the column.
 */
function useRestaurantOpenStatus(
  hoursJson: StoredOpeningHours | null | undefined,
  opening: string | null | undefined,
): { status: RestaurantOpenResult; now: Date } {
  const now = useMinuteClock();
  const status = useMemo(() => resolveOpenStatus(hoursJson, opening, now), [hoursJson, opening, now]);
  return { status, now };
}

interface DetailLocationState {
  /** Set by the merge redirect so two rows that point at each other can't loop. */
  mergedFrom?: string[];
  /** Set by RestaurantCard's link: the list URL the visitor came from (WP3.9). */
  from?: string;
}

/** "August 3, 2026" in Central time, or null. */
function centralDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
}

/** hours_json.fetchedAt, written by _shared/placeHours.ts when Google's hours were read. */
function hoursCheckedAt(hoursJson: StoredOpeningHours | null | undefined): string | null {
  const fetchedAt = (hoursJson as { fetchedAt?: unknown } | null | undefined)?.fetchedAt;
  return hoursJson?.periods?.length ? centralDate(fetchedAt) : null;
}

/** The restaurant row by slug, falling back to the id only when the param is a uuid. */
function useRestaurantDetail(slug: string | undefined) {
  return useQuery({
    queryKey: detailQueryKey("restaurant", slug ?? ""),
    queryFn: async () => {
      let { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      // Fall back to the id only when the param IS a uuid. Comparing a uuid
      // column with a slug raises 22P02, which surfaced as the error page for
      // any unknown slug instead of not-found.
      if (!data && !error && UUID_RE.test(slug ?? "")) {
        const result = await supabase
          .from("restaurants")
          .select("*")
          .eq("id", slug)
          .maybeSingle();
        data = result.data;
        error = result.error;
      }

      if (error) throw error;
      return data;
    },
    staleTime: DETAIL_STALE_TIME,
  });
}

interface ProvenanceProps {
  rating: number | null | undefined;
  menuCapturedAt: string | null;
  menuFromTheirSite: boolean;
  hoursCheckedOn: string | null;
}

/**
 * Where the facts on this page came from, each with its source and date
 * (WP3.6, bet 4). It replaced a blanket freshness badge that measured when
 * any column last changed, not whether anyone checked anything.
 */
function RestaurantProvenance({ rating, menuCapturedAt, menuFromTheirSite, hoursCheckedOn }: ProvenanceProps) {
  const lines = [
    rating ? "Rating: Google rating" : null,
    menuCapturedAt ? `Menu captured ${menuCapturedAt}${menuFromTheirSite ? " from their site" : ""}` : null,
    hoursCheckedOn ? `Hours from Google, checked ${hoursCheckedOn}` : null,
  ].filter((l): l is string => !!l);
  if (lines.length === 0) return null;
  return (
    <section aria-labelledby="sources-heading" className="mt-2 px-4 pb-8 text-center">
      <h2 id="sources-heading" className="text-sm font-semibold text-foreground">
        Where this comes from
      </h2>
      <ul className="mt-1 text-sm text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

export default function RestaurantDetails() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [imageError, setImageError] = useState(false);
  const locationState = location.state as DetailLocationState | null;

  const { data: restaurant, isLoading, error, refetch, isFetching } = useRestaurantDetail(slug);

  // Track page view and content interactions
  const { trackShare, trackClick } = useContentTracking(restaurant?.id, 'restaurant');
  // Record into the unified recently-viewed feed (WEB-FEAT-007). Only
  // EventDetails used to, so the home rail could never resume a restaurant.
  useRecordRecentView(
    restaurant
      ? {
          id: restaurant.id,
          type: "restaurant",
          title: restaurant.name,
          href: `/restaurants/${restaurant.slug || restaurant.id}`,
          image_url: restaurant.image_url ?? undefined,
          subtitle: restaurant.cuisine ?? undefined,
        }
      : null,
  );

  // An error is not a missing page: log it here, and the render below shows a
  // retry state without noindex (WP8 item 8).
  useEffect(() => {
    if (error) {
      handleError(error, { component: "RestaurantDetails", action: "fetchRestaurant", metadata: { slug } });
    }
  }, [error, slug]);

  // A merged duplicate sends the visitor to the row it was merged into. The
  // state trail stops a pair of rows that point at each other from looping.
  const mergedInto = restaurant?.is_merged && restaurant.merged_into ? restaurant.merged_into : null;
  const mergedFrom = locationState?.mergedFrom ?? [];
  const { data: survivorPath, isLoading: survivorLoading } = useQuery({
    queryKey: ["restaurant-merge-target", mergedInto],
    enabled: !!mergedInto,
    staleTime: DETAIL_STALE_TIME,
    queryFn: async () => {
      const target = mergedInto as string;
      const lookup = supabase.from("restaurants").select("id, slug");
      const { data, error } = await (UUID_RE.test(target)
        ? lookup.eq("id", target)
        : lookup.eq("slug", target)
      ).maybeSingle();
      if (error) throw error;
      return data ? `/restaurants/${data.slug || data.id}` : null;
    },
  });
  const redirectTo =
    mergedInto && survivorPath && !mergedFrom.includes(survivorPath) ? survivorPath : null;
  useEffect(() => {
    if (!redirectTo || !restaurant) return;
    const here = `/restaurants/${restaurant.slug || restaurant.id}`;
    // `from` rides along so "Back to results" survives the redirect.
    const state: DetailLocationState = { mergedFrom: [...mergedFrom, here], from: locationState?.from };
    navigate(redirectTo, { replace: true, state });
    // mergedFrom is read from location.state, which the navigate replaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectTo, restaurant, navigate]);

  const hoursJson = (restaurant as { hours_json?: StoredOpeningHours | null } | null | undefined)?.hours_json;
  const { status: openStatus, now } = useRestaurantOpenStatus(hoursJson, restaurant?.opening);

  // Same query key as RestaurantMenuSection's, so this is one request.
  const { data: menuData } = useRestaurantMenu(restaurant?.id, { includeVersions: false });
  const hasCapturedMenu = !!menuData?.menu && menuData.sections.length > 0;

  // The minute clock, so an event that has started leaves the list (WP3.7).
  const tonight = useTonightNearRestaurant(restaurant?.latitude, restaurant?.longitude, now);

  if (isLoading || (mergedInto && (survivorLoading || redirectTo))) {
    return (
      <>
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/restaurants/${slug}`} />
        <Header />
        <div className="min-h-screen bg-gray-50 dark:bg-background" role="status" aria-live="polite" aria-busy="true">
          <div className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="animate-pulse space-y-6 motion-reduce:animate-none">
              <div className="h-6 w-48 bg-gray-200 rounded" />
              <div className="h-80 bg-gray-200 rounded-3xl" />
              <div className="grid md:grid-cols-3 gap-4">
                <div className="h-24 bg-gray-200 rounded-2xl relative">
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 font-medium">Restaurant Info</span>
                </div>
                <div className="h-24 bg-gray-200 rounded-2xl relative">
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 font-medium">Hours & Location</span>
                </div>
                <div className="h-24 bg-gray-200 rounded-2xl relative">
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-500 font-medium">Reviews & Rating</span>
                </div>
              </div>
              <div className="h-48 bg-gray-200 rounded-2xl" />
              <span className="sr-only">Loading restaurant details...</span>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (error) {
    // Not "not found", and no noindex: a failed fetch says nothing about
    // whether the page exists, and a crawler that hit it during an outage
    // must not be told to drop it (WP8 item 8).
    return (
      <>
        <RouteCanonical path={`/restaurants/${slug}`} />
        <Header />
        {/* A div: App.tsx already provides the one <main>. */}
        <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center px-4">
          <div className="max-w-md text-center" role="alert">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              We couldn't load this restaurant
            </h1>
            <p className="text-muted-foreground mb-6">
              Something went wrong on our side or with your connection. Try again in a moment.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                onClick={() => void refetch()}
                disabled={isFetching}
                className="min-h-11 bg-[#2D1B69] hover:bg-[#2D1B69]/90"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} />
                {isFetching ? "Trying again" : "Try again"}
              </Button>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/restaurants">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  All restaurants
                </Link>
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (!restaurant) {
    return (
      <>
        <Helmet>
          <meta name="robots" content="noindex, follow" />
        </Helmet>
        <Header />
        <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center px-4">
          <Card className="max-w-md mx-auto text-center shadow-lg rounded-2xl">
            <CardContent className="p-8">
              <Utensils className="h-16 w-16 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Restaurant Not Found
              </h1>
              <p className="text-muted-foreground mb-6">
                The restaurant you're looking for doesn't exist or has been removed.
              </p>
              <Button asChild className="min-h-11 bg-[#2D1B69] hover:bg-[#2D1B69]/90">
                <Link to="/restaurants">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Restaurants
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  // WP8 items 1 and 2. Every scraped URL goes through safeWebUrl before it
  // reaches an href or the schema, and a closed place makes no open claim.
  const safeWebsite = safeWebUrl(restaurant.website);
  const safeMenuUrl = safeWebUrl(restaurant.menu_url);
  const phoneHref = telHref(restaurant.phone);
  const lifecycle = lifecycleOf(
    restaurant.status,
    (restaurant as { business_status?: string | null }).business_status,
  );
  const isShut = lifecycle === "closed" || lifecycle === "temporarily_closed";
  const liveStatus = lifecycle ? null : openStatus;
  const tier = priceTier(restaurant.price_range);
  const openingDateLabel = formatOpeningDate(restaurant.opening_date);
  const sponsored = isSponsoredActive(restaurant);
  // Pre-opening copy on a place that has opened is left out everywhere (WP3.4).
  const aboutText = currentDescription(restaurant);
  const hoursSpec = resolveOpeningHoursSpecification(hoursJson, restaurant.opening);

  const showImage = restaurant.image_url && !imageError;
  // The address's city, not the `city` column: the column says "Des Moines" for
  // rows whose address is in West Des Moines (Bonchon, Dave's Hot Chicken).
  const cityName = restaurantLocality(restaurant) || "Des Moines";
  // `location` is already the full address; appending the city used to print
  // "..., West Des Moines, IA 50266, USA, Des Moines".
  const neighborhoodText = restaurant.location || cityName;

  // One builder for this page and the edge shell (functions/_middleware.ts), so
  // a crawler that misses the prerender sees the same title. The template
  // replaces seo_title: those were AI-written, never said "menu" or "hours",
  // and the 33 listings ranking inside the top 12 at under 1% CTR all used
  // them. See src/lib/restaurantMeta.ts for the GSC numbers.
  // "Menu" and "Hours" only when this page shows them (WP3.5).
  const metaInput = {
    ...restaurant,
    hasMenu: hasCapturedMenu || !!safeMenuUrl,
    hasHours: lifecycle !== "closed" && (!!hoursSpec || !!restaurant.opening?.trim()),
    hasPhone: !isShut && !!phoneHref,
  };
  const seoTitle = restaurantPageTitle(metaInput);
  const seoDescription = restaurantMetaDescription(metaInput);

  const seoKeywords = [
    ...(restaurant.seo_keywords || []),
    restaurant.name,
    `${restaurant.name} Des Moines`,
    `${restaurant.name} menu`,
    `${restaurant.name} menu with prices`,
    `${restaurant.name} menu prices`,
    `${restaurant.name} food menu`,
    `${restaurant.name} hours`,
    `${restaurant.name} reviews`,
    restaurant.cuisine ? `${restaurant.cuisine} restaurant Des Moines` : "",
    restaurant.cuisine ? `${restaurant.cuisine} menu Des Moines` : "",
    `restaurants in ${cityName}`,
    `${cityName} dining`,
    "Des Moines restaurants",
    "Iowa restaurants",
  ].filter(Boolean);

  // WEB-SEO-016: getEstimatedReviewCount() used to synthesise a review count
  // from the rating and popularity score (rating >= 4.5 ? 150 : 100 : 50 : 25,
  // scaled by popularity) and feed it to aggregateRating on all ~480 restaurant
  // pages. Google requires ratingCount/reviewCount to reflect real reviews;
  // inventing one is a review-snippet policy breach. There is no reviews table
  // in the schema, so there is no real count to use and the block is gone.

  // The Restaurant node, from one pure builder (WP3.14). The rules it keeps
  // are written there: no invented hours, pin, price tier or menu claim.
  const canonicalUrl = getCanonicalUrl(`/restaurants/${restaurant.slug || restaurant.id}`);
  const restaurantSchema = buildRestaurantSchema(restaurant, {
    url: canonicalUrl,
    description: aboutText || seoDescription,
    locality: cityName,
    website: safeWebsite,
    menuUrl: safeMenuUrl,
    hasCapturedMenu,
    openingHoursSpecification: hoursSpec,
    // A closed or not-yet-open place publishes no hours.
    openForBusiness: !lifecycle,
  });

  // WEB-SEO-027: the BreadcrumbList this used to build lived here AND in the
  // <BreadcrumbListSchema> below, with DIFFERENT urls - relative here, absolute
  // through getCanonicalUrl there - so the page shipped two competing trails
  // and the prerenderer's dedupeJsonLd kept whichever came last. One emitter
  // now, and it is the typed schema component, which is the one with the
  // absolute URLs a crawler can resolve.

  // Fact-only answers for the FAQPage schema; geo_faq comes back separately
  // and is shown as AI-assisted, outside the schema (WP3.1).
  const { faqs: restaurantFaqs, aiFaqs } = buildRestaurantFaqs(restaurant, {
    lifecycle,
    locality: cityName,
    hoursJson,
    website: safeWebsite,
    menuUrl: safeMenuUrl,
    hasCapturedMenu,
  });

  // WEB-FEAT-024. Resolved once and used by both the in-page action bar and the
  // sticky mobile CTA, so the two can never disagree about whether this place
  // takes reservations.
  const reservation = resolveReservation(restaurant);
  const showReserve =
    !isShut && (reservation.kind === "booking" || reservation.kind === "call_to_reserve");
  const directionsHref = getDirectionsUrl({
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    address: `${restaurant.name} ${restaurant.location}`,
  });
  // The Menu action goes to the captured menu when there is one, to their own
  // menu page when there isn't, and is hidden when neither exists (WP8 item 3).
  const menuAction = hasCapturedMenu
    ? { href: "#menu", label: "Menu", external: false }
    : safeMenuUrl
      ? { href: safeMenuUrl, label: "Menu (on their site)", external: true }
      : null;
  // Back to the filtered list the visitor came from (WP3.9). Only a
  // /restaurants?... URL counts: anything else is not "results".
  const backToResults =
    typeof locationState?.from === "string" && locationState.from.startsWith("/restaurants?")
      ? locationState.from
      : null;

  // Tonight nearby sits under the hours (WP3.7). Not for a place you can't eat at.
  const showTonight = !lifecycle && tonight.events.length > 0;
  const statusLine = liveStatus ? formatOpenStatusLine(liveStatus) : null;
  const restaurantHoursLine =
    statusLine && (liveStatus?.closesAt || liveStatus?.nextOpensAt) ? `${statusLine} CT` : statusLine;
  const showLocalGuide =
    !isShut && !!(restaurant.geo_summary || (restaurant.geo_key_facts && restaurant.geo_key_facts.length > 0));
  const menuCapturedAt = hasCapturedMenu ? centralDate(menuData?.menu?.captured_at) : null;
  const menuFromTheirSite =
    !!menuData?.menu && (menuData.menu.source_type === "scraped" || !!safeWebUrl(menuData.menu.source_url));

  const chipClass =
    "inline-flex min-h-11 items-center text-xs px-3 bg-gray-100 text-gray-800 dark:bg-muted dark:text-foreground hover:bg-[#2D1B69]/10 hover:text-[#2D1B69] rounded-full transition-colors whitespace-nowrap font-medium";

  return (
    <>
      <Header />
      <SEOHead
        title={seoTitle}
        description={seoDescription}
        type="restaurant"
        keywords={seoKeywords}
        structuredData={restaurantSchema}
        url={`/restaurants/${restaurant.slug || restaurant.id}`}
        imageUrl={ogImageUrl("restaurant", restaurant.id)}
        // No `location` prop: it emitted a second, unlinked Place node for the
        // same business alongside restaurantSchema, which already carries the
        // address and geo.
        modifiedTime={restaurant.updated_at}
        // A place that has closed for good should leave search results.
        // noindex, follow: the related-restaurant links stay followable.
        robots={lifecycle === "closed" ? "noindex, follow" : undefined}
      />
      {/* No cuisine crumb here: /restaurants?cuisine= is a filtered view, not
          a page of its own. The visible trail below keeps it as a link. */}
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: getCanonicalUrl("/") },
          { name: "Restaurants", url: getCanonicalUrl("/restaurants") },
          { name: restaurant.name, url: getCanonicalUrl(`/restaurants/${restaurant.slug || restaurant.id}`) },
        ]}
      />
      <SpeakableSchema
        name={seoTitle}
        description={seoDescription}
        url={getCanonicalUrl(`/restaurants/${restaurant.slug || restaurant.id}`)}
        dateModified={restaurant.updated_at}
      />

      <div className="min-h-screen bg-gray-50 dark:bg-background">
        <div className="container mx-auto px-4 py-6 max-w-6xl">
          {/* Breadcrumb Navigation */}
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Restaurants", href: "/restaurants" },
              ...(restaurant.cuisine ? [{ label: restaurant.cuisine, href: `/restaurants?cuisine=${encodeURIComponent(restaurant.cuisine)}` }] : []),
              { label: restaurant.name },
            ]}
            className="mb-4"
          />

          {/* Top Actions Bar */}
          <div className="flex items-center justify-between mb-6">
            <Button asChild variant="ghost" size="sm" className="min-h-11 text-muted-foreground hover:text-foreground -ml-2">
              <Link to={backToResults ?? "/restaurants"}>
                <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                {backToResults ? "Back to results" : "All restaurants"}
              </Link>
            </Button>
            <div className="flex gap-2">
              <ShareDialog
                title={restaurant.name}
                description={
                  aboutText ||
                  `${restaurant.name}${restaurant.cuisine ? `, ${restaurant.cuisine}` : ""} in ${cityName}`
                }
                url={typeof window !== 'undefined' ? window.location.href : ''}
                onShare={trackShare}
                trigger={
                  <Button variant="outline" size="sm" className="min-h-11 rounded-xl">
                    <SpriteIcon name="share-2" className="h-4 w-4 mr-1.5" />
                    Share
                  </Button>
                }
              />
              <FavoriteButton
                contentType="restaurant"
                contentId={restaurant.id}
                variant="outline"
                size="sm"
                showText
                itemName={restaurant.name}
                className="min-h-11 rounded-xl"
              />
            </div>
          </div>

          {/* Hero Card */}
          <Card className="shadow-xl rounded-3xl overflow-hidden border-0 mb-8">
            {/* Hero Image, or a flat brand surface */}
            <div className="relative h-72 md:h-96 overflow-hidden bg-[#2D1B69]">
              {showImage && (
                <>
                  <OptimizedImage
                    src={restaurant.image_url}
                    alt={`${restaurant.name} - ${restaurant.cuisine || "Restaurant"} in ${cityName}, Iowa`}
                    className="object-cover"
                    containerClassName="absolute inset-0"
                    priority
                    sizes="(max-width: 768px) 100vw, 1024px"
                    onError={() => setImageError(true)}
                  />
                  {/* Scrim so the white title stays readable over any photo */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                </>
              )}

              {/* Badges */}
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                {/* is_featured is not shown: only sponsored rows kept it
                    (20260902000004:20-24), so it was a paid flag reading as
                    an editorial one (WP3.3). */}
                {sponsored && <SponsoredBadge className="shadow-lg text-sm px-3 py-1" />}
                {lifecycle === "closed" && (
                  <Badge className="bg-gray-900 text-white border-0 shadow-lg text-sm font-semibold px-3 py-1">
                    Permanently closed
                  </Badge>
                )}
                {lifecycle === "temporarily_closed" && (
                  <Badge className="bg-gray-900 text-white border-0 shadow-lg text-sm font-semibold px-3 py-1">
                    Temporarily closed
                  </Badge>
                )}
                {lifecycle === "not_open_yet" && (
                  <Badge className="bg-gray-900 text-white border-0 shadow-lg text-sm font-semibold px-3 py-1">
                    Not open yet
                  </Badge>
                )}
                {liveStatus?.isOpen && (
                  <Badge className={`${liveStatus.closingSoon ? 'bg-amber-700' : 'bg-emerald-700'} text-white border-0 shadow-lg text-sm font-semibold px-3 py-1`}>
                    <span className="relative flex h-2 w-2 mr-1.5" aria-hidden="true">
                      <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    {liveStatus.closingSoon ? 'Closing Soon' : 'Open Now'}
                  </Badge>
                )}
              </div>

              {/* Hero text */}
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-10">
                <div className="max-w-3xl">
                  {restaurant.cuisine && (
                    <div className="flex items-center gap-2 mb-2">
                      <SpriteIcon name="chef-hat" className="h-4 w-4 text-white/80" />
                      <span className="text-white/90 text-sm font-medium">
                        {restaurant.cuisine} cuisine
                      </span>
                    </div>
                  )}
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight drop-shadow-lg">
                    {restaurant.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-white">
                    {restaurant.rating ? (
                      <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                        <span className="font-semibold">{restaurant.rating.toFixed(1)}</span>
                        <span className="text-sm">Google rating</span>
                      </div>
                    ) : null}
                    {tier && (
                      <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
                        <DollarSign className="h-4 w-4" aria-hidden="true" />
                        <span className="font-semibold">{tier}</span>
                      </div>
                    )}
                    {restaurant.location && (
                      <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
                        <SpriteIcon name="map-pin" className="h-4 w-4" />
                        <span className="text-sm">{neighborhoodText}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Closed or not-yet-open notice (WP8 item 2) */}
            {lifecycle && (
              <div className="px-4 md:px-6 pt-4">
                <div role="note" className="rounded-xl border bg-gray-100 p-4 text-gray-900">
                  {lifecycle === "closed" && (
                    <p>
                      <strong>{restaurant.name} has closed permanently.</strong>{" "}
                      {restaurant.cuisine ? (
                        <Link
                          to={`/restaurants?cuisine=${encodeURIComponent(restaurant.cuisine)}`}
                          className="font-medium text-[#2D1B69] underline"
                        >
                          See other {restaurant.cuisine} restaurants
                        </Link>
                      ) : (
                        <Link to="/restaurants" className="font-medium text-[#2D1B69] underline">
                          See restaurants that are open
                        </Link>
                      )}
                    </p>
                  )}
                  {lifecycle === "temporarily_closed" && (
                    <p>
                      <strong>{restaurant.name} is temporarily closed.</strong> We don't have a reopening
                      date. Check with the restaurant before you go.
                    </p>
                  )}
                  {lifecycle === "not_open_yet" && (
                    <p>
                      <strong>{restaurant.name} hasn't opened yet.</strong>{" "}
                      {openingDateLabel
                        ? `Expected ${openingDateLabel}.`
                        : restaurant.opening_timeframe
                          ? `Expected ${restaurant.opening_timeframe}.`
                          : "We don't have an opening date."}{" "}
                      <Link to="/restaurants/new" className="font-medium text-[#2D1B69] underline">
                        More new openings
                      </Link>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap gap-3 p-4 md:p-6 bg-gray-50 border-b">
              {/* WEB-FEAT-024: booking is the highest-intent action on this
                  page and previously had no path at all. Only rendered when
                  there is real evidence the place takes reservations, and
                  never for a place that is closed. */}
              {showReserve && reservation.href && (
                <Button asChild className="min-h-11 bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white rounded-xl">
                  <a
                    href={reservation.href}
                    {...(reservation.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    <CalendarCheck className="h-4 w-4 mr-2" />
                    {reservation.label}
                  </a>
                </Button>
              )}
              {!isShut && phoneHref && (
                <Button asChild className="min-h-11 bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white rounded-xl">
                  <a href={phoneHref}>
                    <Phone className="h-4 w-4 mr-2" />
                    Call
                  </a>
                </Button>
              )}
              {safeWebsite && (
                <Button asChild variant="outline" className="min-h-11 rounded-xl">
                  <a href={safeWebsite} target="_blank" rel="noopener noreferrer">
                    <Globe className="h-4 w-4 mr-2" />
                    Website
                  </a>
                </Button>
              )}
              {restaurant.location && !isShut && (
                <Button asChild variant="outline" className="min-h-11 rounded-xl">
                  <a href={directionsHref} target="_blank" rel="noopener noreferrer">
                    <Navigation className="h-4 w-4 mr-2" />
                    Directions
                  </a>
                </Button>
              )}
              {menuAction && (
                <Button asChild variant="outline" className="min-h-11 rounded-xl">
                  <a
                    href={menuAction.href}
                    {...(menuAction.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    <Utensils className="h-4 w-4 mr-2" />
                    {menuAction.label}
                  </a>
                </Button>
              )}
              <Button asChild variant="outline" className="min-h-11 rounded-xl">
                <a href="#reviews">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Rate this place
                </a>
              </Button>
            </div>

            {/* On-page section navigation for quick jumping */}
            <nav className="flex flex-wrap gap-2 px-4 md:px-6 py-3 bg-white border-b overflow-x-auto" aria-label="Page sections">
              {aboutText && (
                <a href="#about" className={chipClass}>
                  About
                </a>
              )}
              {lifecycle !== "closed" && (
                <a href="#hours" className={chipClass}>
                  Hours
                </a>
              )}
              {showTonight && (
                <a href="#tonight" className={chipClass}>
                  Tonight nearby
                </a>
              )}
              {menuAction && (
                <a
                  href={menuAction.href}
                  {...(menuAction.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={chipClass}
                >
                  <Utensils className="w-3 h-3 inline mr-1" aria-hidden="true" />
                  {menuAction.label}
                </a>
              )}
              {restaurant.ai_writeup && (
                <a href="#writeup" className={chipClass}>
                  Our take
                </a>
              )}
              {showLocalGuide && (
                <a href="#local-guide" className={chipClass}>
                  Local Guide
                </a>
              )}
              <a href="#faq" className={chipClass}>
                FAQ
              </a>
            </nav>

            <CardContent className="p-6 md:p-10">
              {/* Hours: one block, one evaluation (WP8 items 5 and 9) */}
              {lifecycle !== "closed" && (
                <div className="mb-8 scroll-mt-20">
                  <RestaurantStatus
                    hours={restaurant.opening}
                    hoursJson={hoursJson}
                    openStatus={liveStatus}
                    now={now}
                  />
                </div>
              )}

              {/* Your evening from here (WP3.7, bet 5): tonight's events next
                  to this place's own closing time, right under the hours. */}
              {showTonight && (
                <TonightNearRestaurant
                  events={tonight.events}
                  heading={tonightHeading(tonight.events, liveStatus?.closesAt, now)}
                  restaurantName={restaurant.name}
                  restaurantHoursLine={restaurantHoursLine}
                  className="mb-8 scroll-mt-20"
                />
              )}

              <Separator className="my-8" />

              {/* Details Grid */}
              <div className="grid md:grid-cols-2 gap-8">
                {/* Contact & Location */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <SpriteIcon name="map-pin" className="h-5 w-5 text-[#2D1B69]" />
                    Location & Contact
                  </h2>
                  <div className="space-y-3">
                    {restaurant.location && (
                      <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                        <SpriteIcon name="map-pin" className="h-5 w-5 text-gray-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-gray-900 font-medium">{restaurant.location}</p>
                          <p className="text-sm text-gray-700">{cityName}, Iowa</p>
                          {!isShut && (
                            <a
                              href={directionsHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 items-center text-sm text-[#2D1B69] hover:underline"
                            >
                              <Navigation className="h-3.5 w-3.5 mr-1" />
                              Get Directions
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                    {restaurant.latitude && restaurant.longitude && (
                      <div className="overflow-hidden rounded-xl">
                        <LazyLocationMap
                          latitude={restaurant.latitude}
                          longitude={restaurant.longitude}
                          venue={restaurant.name}
                          location={restaurant.location}
                          className="h-48 w-full"
                        />
                      </div>
                    )}
                    {!isShut && phoneHref && (
                      <a
                        href={phoneHref}
                        className="flex min-h-11 items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <Phone className="h-5 w-5 text-gray-600 shrink-0" />
                        <span className="text-gray-900">{restaurant.phone}</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Restaurant Details */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Utensils className="h-5 w-5 text-[#2D1B69]" />
                    Restaurant Details
                  </h2>
                  <div className="space-y-3">
                    {restaurant.cuisine && (
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <span className="text-gray-700">Cuisine</span>
                        <span className="rounded-full bg-[#2D1B69]/10 px-2.5 py-0.5 text-sm font-medium text-[#2D1B69]">
                          {restaurant.cuisine}
                        </span>
                      </div>
                    )}
                    {tier && (
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <span className="text-gray-700">Price level</span>
                        <div className="text-right">
                          <span className="text-gray-900 font-semibold">{tier}</span>
                          <p className="text-xs text-gray-700">on Google</p>
                        </div>
                      </div>
                    )}
                    {restaurant.rating ? (
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <span className="text-gray-700">Google rating</span>
                        <span className="flex items-center gap-1 font-semibold text-gray-900">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
                          {restaurant.rating.toFixed(1)} of 5
                        </span>
                      </div>
                    ) : null}
                    {sponsored && (
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <span className="text-gray-700">Paid placement</span>
                        <SponsoredBadge />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* About section, collapsible */}
              {aboutText && (
                <>
                  <Separator className="my-8" />
                  <CollapsibleSection
                    id="about"
                    title={`About ${restaurant.name}`}
                    icon={<Info className="h-5 w-5 text-[#2D1B69]" />}
                    defaultOpen={true}
                  >
                    <div className="pt-2">
                      <p className="text-gray-700 leading-relaxed text-lg">
                        {aboutText}
                      </p>
                      {/* AI-friendly summary paragraph */}
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl border">
                        <p className="text-sm text-gray-700 leading-relaxed">
                          <strong>{restaurant.name}</strong> is a {restaurant.cuisine || "local"} restaurant
                          located {restaurant.location ? `at ${restaurant.location} in` : "in"} {cityName}, Iowa.
                          {lifecycle === "closed" ? " It has closed permanently." : ""}
                          {lifecycle === "temporarily_closed" ? " It is temporarily closed." : ""}
                          {restaurant.rating ? ` Google rating: ${restaurant.rating.toFixed(1)} out of 5.` : ""}
                          {tier ? ` Google lists its price level as ${tier}.` : ""}
                          {!isShut && reservation.detail ? ` ${reservation.detail}.` : ""}
                        </p>
                      </div>
                    </div>
                  </CollapsibleSection>
                </>
              )}

              {/* Menu: a section of its own, not a card inside this card (WP3.14) */}
              <Separator className="my-8" />
              <RestaurantMenuSection
                restaurantId={restaurant.id}
                restaurantName={restaurant.name}
                restaurantSlug={restaurant.slug || restaurant.id}
                restaurantDescription={aboutText ?? undefined}
                city={cityName}
                cuisine={restaurant.cuisine}
                menuUrl={restaurant.menu_url}
              />

              {/* Our take (AI-assisted) */}
              {restaurant.ai_writeup && (
                <>
                  <Separator className="my-8" />
                  <div id="writeup" className="scroll-mt-20">
                    <AIWriteup
                      writeup={restaurant.ai_writeup}
                      generatedAt={restaurant.writeup_generated_at}
                      headingLevel={2}
                    />
                  </div>
                </>
              )}

              {/* Local guide: AI-written, labelled as such, and not shown for
                  a place that is closed (WP3.6). */}
              {showLocalGuide && (
                <>
                  <Separator className="my-8" />
                  <CollapsibleSection
                    id="local-guide"
                    title={`${restaurant.name} - Local Dining Guide`}
                    icon={<Map className="h-5 w-5 text-[#2D1B69]" />}
                    defaultOpen={true}
                  >
                    <div className="pt-2">
                      <AIDisclosureBadge
                        label="AI-assisted"
                        tooltip="Drafted with AI from public information. It can be wrong or out of date, so check hours, prices and details with the restaurant."
                      />
                      {restaurant.geo_summary && (
                        <p className="mt-3 text-gray-700 leading-relaxed">{restaurant.geo_summary}</p>
                      )}
                      {restaurant.geo_key_facts && restaurant.geo_key_facts.length > 0 && (
                        <div className="mt-4">
                          <h3 className="text-lg font-semibold text-gray-900 mb-3">Key facts</h3>
                          <ul className="list-disc space-y-2 pl-5 text-gray-700">
                            {restaurant.geo_key_facts.map((fact, index) => (
                              <li key={index}>{fact}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>
                </>
              )}
            </CardContent>
          </Card>

          {/* Own this business? (WEB-ADS-009). Not for a place that has closed. */}
          {!isShut && (
            <div className="mb-8">
              <ClaimListingCta
                listingType="restaurant"
                listingId={restaurant.id}
                listingName={restaurant.name}
              />
            </div>
          )}

          {/* Ratings & Reviews (WEB-FEAT-010) */}
          <div id="reviews" className="mb-8 scroll-mt-20">
            <RatingSystem contentType="restaurant" contentId={restaurant.id} showReviews />
          </div>

          {/* Restaurant-Specific FAQ. FAQSection draws its own card. */}
          <div id="faq" className="mb-8 scroll-mt-20">
            <FAQSection
              title={`Frequently Asked Questions About ${restaurant.name}`}
              description={`Answered from the details on this page for ${restaurant.name} in ${cityName}, Iowa.`}
              faqs={restaurantFaqs}
              showSchema={true}
              className="rounded-2xl border-0 shadow-lg"
            />
          </div>

          {/* geo_faq: AI-written, shown as such, and kept out of the FAQPage
              schema (WP3.1). Not for a place that has closed. */}
          {!isShut && aiFaqs.length > 0 && (
            <section aria-labelledby="ai-answers-heading" className="mb-8 rounded-2xl bg-card p-6 shadow-lg">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="ai-answers-heading" className="text-xl font-semibold text-foreground">
                  AI-assisted answers
                </h2>
                <AIDisclosureBadge
                  label="AI-assisted"
                  tooltip="Written with AI from public information. Check anything that matters with the restaurant."
                />
              </div>
              <dl className="mt-4 divide-y divide-border">
                {aiFaqs.map((faq) => (
                  <div key={faq.question} className="py-3">
                    <dt className="font-medium text-foreground">{faq.question}</dt>
                    <dd className="mt-1 max-w-prose text-muted-foreground">{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* One restaurant rail (WP3.8): within two miles, same cuisine
              first, closed and merged places left out. */}
          <div onClick={trackClick}>
            <NearbyContent
              variant="restaurants-near-restaurant"
              excludeId={restaurant.id}
              latitude={restaurant.latitude}
              longitude={restaurant.longitude}
              preferCuisine={restaurant.cuisine}
              limit={4}
            />
          </div>

          {/* Any-date events nearby, only when nothing is on tonight. It asks
              once tonight's answer is in, so the page never makes both event
              requests for the same spot. */}
          {tonight.events.length === 0 && tonight.isSettled ? (
            <NearbyContent
              variant="events-near-restaurant"
              city={restaurant.city || "Des Moines"}
              excludeId={restaurant.id}
              latitude={restaurant.latitude}
              longitude={restaurant.longitude}
            />
          ) : null}

          {/* Browse More CTA */}
          <div className="text-center py-8">
            <Button asChild size="lg" className="min-h-11 bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white rounded-xl px-8">
              <Link to="/restaurants">
                <Utensils className="h-5 w-5 mr-2" />
                Browse All Des Moines Restaurants
              </Link>
            </Button>
          </div>
        </div>

        <RestaurantProvenance
          rating={restaurant.rating}
          menuCapturedAt={menuCapturedAt}
          menuFromTheirSite={menuFromTheirSite}
          hoursCheckedOn={lifecycle !== "closed" ? hoursCheckedAt(hoursJson) : null}
        />
      </div>
      <Footer />
      <BackToTop />

      {/* No sticky actions for a closed place: every one of them (reserve,
          call, website, directions) sends someone to a business that isn't
          serving. */}
      {!isShut && (
        <StickyMobileCTA
          variant="restaurant"
          primaryAction={
            // WEB-FEAT-024: this said "Call to Reserve" for every restaurant with
            // a phone number, asserting that a counter-service taco shop takes
            // bookings. resolveReservation only makes that claim on evidence.
            reservation.href && reservation.kind !== "website"
              ? {
                  label: reservation.label,
                  href: reservation.href,
                  icon: reservation.kind === "booking" ? "website" : "phone",
                  isExternal: reservation.external,
                }
              : safeWebsite
              ? {
                  label: "Website",
                  href: safeWebsite,
                  icon: "website",
                  isExternal: true,
                }
              : undefined
          }
          secondaryAction={
            restaurant.location
              ? {
                  label: "Directions",
                  href: directionsHref,
                  icon: "directions",
                  isExternal: true,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
