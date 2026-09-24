import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";
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
import RestaurantCard from "@/components/RestaurantCard";
import { FAQSection } from "@/components/FAQSection";
import { BackToTop } from "@/components/BackToTop";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import SpeakableSchema from "@/components/schema/SpeakableSchema";
import { getCanonicalUrl } from "@/lib/brandConfig";
import {
  parseIowaAddress,
  readGeoFaq,
  restaurantLocality,
  restaurantMetaDescription,
  restaurantPageTitle,
} from "@/lib/restaurantMeta";
import { Phone, Star, DollarSign, ArrowLeft, Navigation, MessageCircle, Award, Utensils, Globe, Check, Info, Map, CalendarCheck, RefreshCw } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useContentTracking } from "@/hooks/useContentTracking";
import { useRecordRecentView } from "@/hooks/useRecentlyViewedFeed";
import {
  resolveOpenStatus,
  resolveOpeningHoursSpecification,
  type RestaurantOpenResult,
  type StoredOpeningHours,
} from "@/lib/restaurantHours";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useRestaurantMenu } from "@/hooks/useRestaurantMenu";
import { useTonightNearRestaurant } from "@/hooks/useTonightNearRestaurant";
import { handleError } from "@/lib/errorHandler";
import { LazyLocationMap } from "@/components/LazyLocationMap";
import { getDirectionsUrl } from "@/lib/directions";
import { resolveReservation, safeWebUrl, telHref } from "@/lib/reservations";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import { LastUpdatedBadge } from "@/components/LastUpdatedBadge";
import { NearbyContent, TonightNearRestaurant } from "@/components/NearbyContent";
import { RestaurantMenuSection } from "@/components/RestaurantMenuSection";
import { RatingSystem } from "@/components/RatingSystem";
import { ClaimListingCta } from "@/components/business/ClaimListingCta";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { DETAIL_STALE_TIME, detailQueryKey } from "@/lib/detailQueryKeys";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * restaurants.status values that mean you can't eat there today. "closed" is
 * the original CHECK value and means closed for good, the same reading
 * RestaurantCard's LIFECYCLE_LABEL gives it.
 */
type Lifecycle = "closed" | "temporarily_closed" | "not_open_yet" | null;

function lifecycleOf(status: string | null | undefined): Lifecycle {
  switch (status) {
    case "closed":
    case "permanently_closed":
      return "closed";
    case "temporarily_closed":
      return "temporarily_closed";
    case "opening_soon":
    case "announced":
      return "not_open_yet";
    default:
      return null;
  }
}

/** Rails never recommend a place that is shut (PostgREST `or` filter). */
const NOT_CLOSED_FILTER = "status.is.null,status.not.in.(closed,permanently_closed,temporarily_closed)";

/** "$" to "$$$$" only. Anything else ("Moderate", "$10-20") is not shown as a tier. */
function formatPrice(price: string | null | undefined): string | null {
  return typeof price === "string" && /^\${1,4}$/.test(price.trim()) ? price.trim() : null;
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

interface MergeRedirectState {
  mergedFrom?: string[];
}

export default function RestaurantDetails() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [imageError, setImageError] = useState(false);

  const {
    data: restaurant,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
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
  const mergedFrom = (location.state as MergeRedirectState | null)?.mergedFrom ?? [];
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
    navigate(redirectTo, { replace: true, state: { mergedFrom: [...mergedFrom, here] } });
    // mergedFrom is read from location.state, which the navigate replaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectTo, restaurant, navigate]);

  const { data: relatedRestaurants } = useQuery({
    queryKey: ["related-restaurants", restaurant?.cuisine, restaurant?.id],
    queryFn: async () => {
      if (!restaurant) return [];
      const { data, error } = await supabase
        .from("restaurants")
        .select(RESTAURANT_LIST_COLUMNS)
        .eq("cuisine", restaurant.cuisine)
        .neq("id", restaurant.id)
        .neq("is_merged", true)
        .or(NOT_CLOSED_FILTER)
        .limit(4);

      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurant,
  });

  const { data: nearbyRestaurants } = useQuery({
    queryKey: ["nearby-restaurants", restaurant?.city, restaurant?.id],
    queryFn: async () => {
      if (!restaurant) return [];
      const { data, error } = await supabase
        .from("restaurants")
        .select(RESTAURANT_LIST_COLUMNS)
        .eq("city", restaurant.city || "Des Moines")
        .neq("id", restaurant.id)
        .neq("cuisine", restaurant.cuisine)
        .neq("is_merged", true)
        .or(NOT_CLOSED_FILTER)
        .order("popularity_score", { ascending: false })
        .limit(4);

      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurant,
  });

  const hoursJson = (restaurant as { hours_json?: StoredOpeningHours | null } | null | undefined)?.hours_json;
  const { status: openStatus, now } = useRestaurantOpenStatus(hoursJson, restaurant?.opening);

  const { data: menuData } = useRestaurantMenu(restaurant?.id);
  const hasCapturedMenu = !!menuData?.menu && menuData.sections.length > 0;

  const tonight = useTonightNearRestaurant(restaurant?.latitude, restaurant?.longitude);

  const getPriceDescription = (priceRange: string) => {
    switch (priceRange) {
      case "$": return "Under $15 per person";
      case "$$": return "$15-30 per person";
      case "$$$": return "$30-50 per person";
      case "$$$$": return "Over $50 per person";
      default: return priceRange;
    }
  };

  if (isLoading || (mergedInto && (survivorLoading || redirectTo))) {
    return (
      <>
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/restaurants/${slug}`} />
        <Header />
        <div className="min-h-screen bg-gray-50" role="status" aria-live="polite" aria-busy="true">
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
        <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md text-center" role="alert">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              We couldn't load this restaurant
            </h1>
            <p className="text-gray-700 mb-6">
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
        </main>
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
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Card className="max-w-md mx-auto text-center shadow-lg rounded-2xl">
            <CardContent className="p-8">
              <Utensils className="h-16 w-16 text-gray-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Restaurant Not Found
              </h2>
              <p className="text-gray-600 mb-6">
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
  const lifecycle = lifecycleOf(restaurant.status);
  const isShut = lifecycle === "closed" || lifecycle === "temporarily_closed";
  const liveStatus = lifecycle ? null : openStatus;
  const priceTier = formatPrice(restaurant.price_range);
  const openingDateLabel = formatOpeningDate(restaurant.opening_date);

  const showImage = restaurant.image_url && !imageError;
  // The address's city, not the `city` column: the column says "Des Moines" for
  // rows whose address is in West Des Moines (Bonchon, Dave's Hot Chicken).
  const cityName = restaurantLocality(restaurant) || "Des Moines";
  const parsedAddress = parseIowaAddress(restaurant.location);
  // `location` is already the full address; appending the city used to print
  // "..., West Des Moines, IA 50266, USA, Des Moines".
  const neighborhoodText = restaurant.location || cityName;

  // One builder for this page and the edge shell (functions/_middleware.ts), so
  // a crawler that misses the prerender sees the same title. The template
  // replaces seo_title: those were AI-written, never said "menu" or "hours",
  // and the 33 listings ranking inside the top 12 at under 1% CTR all used
  // them. See src/lib/restaurantMeta.ts for the GSC numbers.
  const seoTitle = restaurantPageTitle(restaurant);
  const seoDescription = restaurantMetaDescription(restaurant);

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
    restaurant.cuisine ? `best ${restaurant.cuisine} food Des Moines` : "",
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

  // Comprehensive Restaurant schema for AI search engines
  const restaurantSchema = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    // WEB-SEO-023. Was hard-coded to the OLD brand domain on ~480 pages. @id is
    // how a crawler reconciles one entity across pages, so pointing it at
    // another origin does not make a broken link -- it makes a different entity.
    "@id": getCanonicalUrl(`/restaurants/${restaurant.slug || restaurant.id}`),
    name: restaurant.name,
    description: restaurant.description || seoDescription,
    servesCuisine: restaurant.cuisine,
    address: {
      "@type": "PostalAddress",
      streetAddress: parsedAddress?.streetAddress || restaurant.location,
      addressLocality: cityName,
      addressRegion: "IA",
      ...(parsedAddress?.postalCode && { postalCode: parsedAddress.postalCode }),
      addressCountry: "US",
    },
    ...(restaurant.phone && { telephone: restaurant.phone }),
    // url is this page; the restaurant's own site is sameAs. url used to be the
    // owner's site, which told Google this node described a page we don't host.
    url: getCanonicalUrl(`/restaurants/${restaurant.slug || restaurant.id}`),
    ...(safeWebsite && { sameAs: [safeWebsite] }),
    ...(safeMenuUrl && { hasMenu: safeMenuUrl }),
    ...(restaurant.price_range && { priceRange: restaurant.price_range }),
    ...(restaurant.image_url && { image: [restaurant.image_url] }),
    // WEB-SEO-024. The fallback was 41.5868,-93.6250 -- the middle of downtown
    // Des Moines -- so a restaurant without coordinates was published as being
    // at a street corner it is not on. A wrong pin is worse than no pin,
    // because a user navigates to it.
    ...(restaurant.latitude != null && restaurant.longitude != null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: restaurant.latitude,
            longitude: restaurant.longitude,
          },
        }
      : {}),
    // WEB-BE-045: hours_json first, the free-text `opening` parser second.
    // The structured column is what Google returned; the text parser is a best
    // effort over strings nobody writes. Omitted entirely when neither yields
    // anything, because inventing hours is the WEB-SEO-024 rule this whole
    // object is built around. Note the column is absent until migration
    // 20260919000009 is applied - select('*') makes that undefined rather than
    // an error, and the text path carries the page until then.
    // A closed place publishes no hours: they describe a business that is gone.
    ...(!isShut && resolveOpeningHoursSpecification(hoursJson, restaurant.opening)
      ? {
          openingHoursSpecification: resolveOpeningHoursSpecification(hoursJson, restaurant.opening),
        }
      : {}),
    // paymentAccepted IS GONE (WEB-SEO-024). No column backs it, and it claimed
    // card acceptance for every restaurant in the set including the cash-only
    // ones -- which is exactly the claim a diner would act on.
    // currenciesAccepted stays: every restaurant in Des Moines takes dollars,
    // which is the difference between a safe default and an invented fact.
    currenciesAccepted: "USD",
    // hasMenu IS GONE FROM HERE (WEB-SEO-023 AC2). It was unconditional, so every
    // restaurant claimed a menu at #menu whether one existed or not, and where
    // one did exist the claim was a second Menu node competing with the real
    // one. RestaurantMenuSection renders MenuSchema only when a menu with
    // sections has actually been captured, and that node carries
    // mainEntityOfPage back to this restaurant. One owner, and only when true.
    areaServed: {
      "@type": "City",
      name: "Des Moines",
      containedInPlace: {
        "@type": "State",
        name: "Iowa",
      },
    },
  };

  // WEB-SEO-027: the BreadcrumbList this used to build lived here AND in the
  // <BreadcrumbListSchema> below, with DIFFERENT urls - relative here, absolute
  // through getCanonicalUrl there - so the page shipped two competing trails
  // and the prerenderer's dedupeJsonLd kept whichever came last. One emitter
  // now, and it is the typed schema component, which is the one with the
  // absolute URLs a crawler can resolve.

  // Generate dynamic FAQ for this specific restaurant
  const restaurantFaqs = [
    {
      question: `What type of food does ${restaurant.name} serve?`,
      answer: `${restaurant.name} serves ${restaurant.cuisine || "a variety of"} cuisine in ${cityName}, Iowa. ${restaurant.description ? restaurant.description.slice(0, 200) : `Located at ${restaurant.location || cityName}, it's a popular dining destination in the Des Moines metro area.`}`,
    },
    {
      question: `What are the hours for ${restaurant.name}?`,
      answer:
        lifecycle === "closed"
          ? `${restaurant.name} has closed permanently.`
          : lifecycle === "temporarily_closed"
            ? `${restaurant.name} is temporarily closed. Check with the restaurant before you go.`
            : restaurant.opening
              ? `${restaurant.name} is typically open ${restaurant.opening}. Hours may vary on holidays and special occasions. We recommend calling ahead at ${restaurant.phone || "the restaurant"} to confirm current hours, especially for holiday dining.`
              : `For the most current hours at ${restaurant.name}, please call the restaurant directly${restaurant.phone ? ` at ${restaurant.phone}` : ""} or visit their website${safeWebsite ? ` at ${safeWebsite}` : ""}. Hours may vary by season and holidays.`,
    },
    {
      question: `How much does it cost to eat at ${restaurant.name}?`,
      answer: priceTier
        ? `${restaurant.name} is in the ${restaurant.price_range} price range, which means approximately ${getPriceDescription(restaurant.price_range)}. This is ${restaurant.price_range === "$" ? "one of the most affordable" : restaurant.price_range === "$$" ? "a moderately priced" : restaurant.price_range === "$$$" ? "an upscale" : "a fine dining"} option in the ${cityName} area.`
        : `Contact ${restaurant.name} directly for current pricing and menu information.`,
    },
    {
      question: `Where is ${restaurant.name} located?`,
      answer: `${restaurant.name} is located at ${restaurant.location || cityName + ", Iowa"}. ${restaurant.latitude ? "You can find directions using the map on this page." : "Visit our restaurants page for a map of all Des Moines dining locations."}`,
    },
    {
      // This answered "Yes, the full menu with prices is on this page" for every
      // restaurant, including the ones with no menu captured (Atlas Cafe).
      question: `Does ${restaurant.name} have an online menu?`,
      answer: safeMenuUrl
        ? `Yes. ${restaurant.name}'s menu is online at ${safeMenuUrl}. Any menu we have captured is in the Menu section on this page.`
        : safeWebsite
          ? `Check ${restaurant.name}'s website at ${safeWebsite} for the current menu. Any menu we have captured is in the Menu section on this page.`
          : `We don't have a menu link for ${restaurant.name} yet.${restaurant.phone ? ` Call ${restaurant.phone} for current offerings and prices.` : ""}`,
    },
    ...(restaurant.rating ? [{
      question: `What is the rating for ${restaurant.name}?`,
      answer: `${restaurant.name} has a Google rating of ${restaurant.rating.toFixed(1)} out of 5. ${restaurant.rating >= 4.5 ? "It's one of the highest-rated restaurants in the Des Moines area." : restaurant.rating >= 4.0 ? "It's a highly-rated restaurant in Des Moines." : "Diners appreciate its " + (restaurant.cuisine || "diverse") + " cuisine offerings."} ${restaurant.is_featured ? "It's also featured as an editor's pick on Des Moines Insider." : ""}`,
    }] : []),
  ];
  // geo_faq was generated for every row by generate-seo-content and never
  // rendered. Questions the templates above already answer are skipped.
  const askedAlready = new Set(restaurantFaqs.map((f) => f.question.toLowerCase()));
  restaurantFaqs.push(
    ...readGeoFaq(restaurant.geo_faq).filter((f) => !askedAlready.has(f.question.toLowerCase())),
  );

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
  const chipClass =
    "inline-flex min-h-11 items-center text-xs px-3 bg-gray-100 text-gray-800 hover:bg-[#2D1B69]/10 hover:text-[#2D1B69] rounded-full transition-colors whitespace-nowrap font-medium";

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

      <div className="min-h-screen bg-gray-50">
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
            <Button asChild variant="ghost" size="sm" className="min-h-11 text-gray-700 hover:text-gray-900 -ml-2">
              <Link to="/restaurants">
                <ArrowLeft className="h-4 w-4 mr-1" />
                All Restaurants
              </Link>
            </Button>
            <div className="flex gap-2">
              <ShareDialog
                title={restaurant.name}
                description={restaurant.description || `Check out ${restaurant.name} - ${restaurant.cuisine} cuisine in Des Moines`}
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
                {restaurant.is_featured && (
                  <Badge className="bg-amber-700 text-white border-0 shadow-lg text-sm font-semibold px-3 py-1">
                    <SpriteIcon name="sparkles" className="h-3.5 w-3.5 mr-1.5" />
                    Featured
                  </Badge>
                )}
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
                    {priceTier && (
                      <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
                        <DollarSign className="h-4 w-4" aria-hidden="true" />
                        <span className="font-semibold">{priceTier}</span>
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
                  Write Review
                </a>
              </Button>
            </div>

            {/* On-page section navigation for quick jumping */}
            <nav className="flex flex-wrap gap-2 px-4 md:px-6 py-3 bg-white border-b overflow-x-auto" aria-label="Page sections">
              {restaurant.description && (
                <a href="#about" className={chipClass}>
                  About
                </a>
              )}
              <a href="#hours" className={chipClass}>
                Hours
              </a>
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
              {(restaurant.geo_summary || (restaurant.geo_key_facts && restaurant.geo_key_facts.length > 0)) && (
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
                    {priceTier && (
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <span className="text-gray-700">Price range</span>
                        <div className="text-right">
                          <span className="text-gray-900 font-semibold">{priceTier}</span>
                          <p className="text-xs text-gray-700">{getPriceDescription(priceTier)}</p>
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
                    {restaurant.is_featured && (
                      <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                        <div className="flex items-center text-amber-800">
                          <Award className="h-5 w-5 mr-2" />
                          <span className="font-medium">Editor's Pick</span>
                        </div>
                        <p className="text-sm text-amber-800 mt-1">
                          Picked by our editors as one to try.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* About Section — collapsible */}
              {restaurant.description && (
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
                        {restaurant.description}
                      </p>
                      {/* AI-friendly summary paragraph */}
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl border">
                        <p className="text-sm text-gray-700 leading-relaxed">
                          <strong>{restaurant.name}</strong> is a {restaurant.cuisine || "local"} restaurant
                          located {restaurant.location ? `at ${restaurant.location} in` : "in"} {cityName}, Iowa.
                          {lifecycle === "closed" ? " It has closed permanently." : ""}
                          {lifecycle === "temporarily_closed" ? " It is temporarily closed." : ""}
                          {restaurant.rating ? ` Google rating: ${restaurant.rating.toFixed(1)} out of 5.` : ""}
                          {priceTier ? ` The price range is ${priceTier} (${getPriceDescription(priceTier)}).` : ""}
                          {!isShut && reservation.detail ? ` ${reservation.detail}.` : ""}
                          {restaurant.is_featured ? " This restaurant is an editor's pick on Des Moines Insider." : ""}
                        </p>
                      </div>
                    </div>
                  </CollapsibleSection>
                </>
              )}

              {/* Menu Section — collapsible, with enhanced SEO props */}
              <Separator className="my-8" />
              <RestaurantMenuSection
                restaurantId={restaurant.id}
                restaurantName={restaurant.name}
                restaurantSlug={restaurant.slug || restaurant.id}
                restaurantDescription={restaurant.description}
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

              {/* Geo Summary / Key Facts — collapsible */}
              {(restaurant.geo_summary || (restaurant.geo_key_facts && restaurant.geo_key_facts.length > 0)) && (
                <>
                  <Separator className="my-8" />
                  <CollapsibleSection
                    id="local-guide"
                    title={`${restaurant.name} - Local Dining Guide`}
                    icon={<Map className="h-5 w-5 text-[#2D1B69]" />}
                    defaultOpen={true}
                  >
                    <div className="pt-2">
                      {restaurant.geo_summary && (
                        <p className="text-gray-700 leading-relaxed">{restaurant.geo_summary}</p>
                      )}
                      {restaurant.geo_key_facts && restaurant.geo_key_facts.length > 0 && (
                        <div className="mt-4">
                          <h3 className="text-lg font-semibold text-gray-900 mb-3">Key Facts</h3>
                          <ul className="space-y-2">
                            {restaurant.geo_key_facts.map((fact, index) => (
                              <li key={index} className="flex items-start gap-2 text-gray-700">
                                <Check className="h-4 w-4 text-emerald-700 mt-1 shrink-0" />
                                <span>{fact}</span>
                              </li>
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

          {/* Own this business? (WEB-ADS-009) */}
          <div className="mb-8">
            <ClaimListingCta
              listingType="restaurant"
              listingId={restaurant.id}
              listingName={restaurant.name}
            />
          </div>

          {/* Ratings & Reviews (WEB-FEAT-010) */}
          <div id="reviews" className="mb-8 scroll-mt-20">
            <RatingSystem contentType="restaurant" contentId={restaurant.id} showReviews />
          </div>

          {/* Restaurant-Specific FAQ */}
          <Card id="faq" className="shadow-lg rounded-2xl border-0 mb-8 overflow-hidden">
            <FAQSection
              title={`Frequently Asked Questions About ${restaurant.name}`}
              description={`Common questions about ${restaurant.name} in ${cityName}, Iowa.`}
              faqs={restaurantFaqs}
              showSchema={true}
              className="border-0"
            />
          </Card>

          {/* Related Restaurants - Same Cuisine — hidden when fewer than 3 matches */}
          {relatedRestaurants && relatedRestaurants.length >= 3 && (
            <section className="mb-8" aria-labelledby="related-heading">
              <h2 id="related-heading" className="text-2xl font-bold text-gray-900 mb-2">
                More {restaurant.cuisine} Restaurants in Des Moines
              </h2>
              <p className="text-gray-700 mb-6">
                Explore other {restaurant.cuisine} dining options near {cityName}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" onClick={trackClick}>
                {relatedRestaurants.map((related) => (
                  <RestaurantCard
                    key={related.id}
                    restaurant={related}
                    variant="compact"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Nearby Restaurants - Different Cuisine */}
          {nearbyRestaurants && nearbyRestaurants.length > 0 && (
            <section className="mb-8" aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="text-2xl font-bold text-gray-900 mb-2">
                Other Popular Restaurants in {cityName}
              </h2>
              <p className="text-gray-700 mb-6">
                Discover more dining options in the {cityName} area
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {nearbyRestaurants.map((nearby) => (
                  <RestaurantCard
                    key={nearby.id}
                    restaurant={nearby}
                    variant="compact"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Tonight near this restaurant (WP8 item 6). The any-date distance
              rail is the fallback, and only asks once tonight's answer is in,
              so the page never makes both event requests for the same spot. */}
          {tonight.events.length > 0 ? (
            <TonightNearRestaurant events={tonight.events} />
          ) : tonight.isSettled ? (
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

        <LastUpdatedBadge updatedAt={restaurant.updated_at} className="mt-6 justify-center" />
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
