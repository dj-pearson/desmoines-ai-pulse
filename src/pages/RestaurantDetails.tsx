import { useParams, Link } from "react-router-dom";
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
import AIWriteup from "@/components/AIWriteup";
import RestaurantStatus from "@/components/RestaurantStatus";
import ShareDialog from "@/components/ShareDialog";
import RestaurantCard from "@/components/RestaurantCard";
import { FAQSection } from "@/components/FAQSection";
import { BackToTop } from "@/components/BackToTop";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import SpeakableSchema from "@/components/schema/SpeakableSchema";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { qualifyTitleWithCity } from "@/lib/seoTitleLocation";
import { Phone, Star, DollarSign, ArrowLeft, Navigation, Heart, MessageCircle, Award, Utensils, Globe, Check, BookOpen, Info, Map } from "lucide-react";
import { useState, useMemo } from "react";
import { useContentTracking } from "@/hooks/useContentTracking";
import { getRestaurantOpenStatus, getOpeningHoursSpecification } from "@/lib/restaurantHours";
import { LazyLocationMap } from "@/components/LazyLocationMap";
import { getDirectionsUrl } from "@/lib/directions";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import { LastUpdatedBadge } from "@/components/LastUpdatedBadge";
import { NearbyContent } from "@/components/NearbyContent";
import { RestaurantMenuSection } from "@/components/RestaurantMenuSection";
import { RatingSystem } from "@/components/RatingSystem";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

export default function RestaurantDetails() {
  const { slug } = useParams();
  const [imageError, setImageError] = useState(false);

  const {
    data: restaurant,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["restaurant", slug],
    queryFn: async () => {
      let { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (!data && !error) {
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
  });

  // Track page view and content interactions
  const { trackShare, trackClick } = useContentTracking(restaurant?.id, 'restaurant');

  const { data: relatedRestaurants } = useQuery({
    queryKey: ["related-restaurants", restaurant?.cuisine, restaurant?.id],
    queryFn: async () => {
      if (!restaurant) return [];
      const { data, error } = await supabase
        .from("restaurants")
        .select(RESTAURANT_LIST_COLUMNS)
        .eq("cuisine", restaurant.cuisine)
        .neq("id", restaurant.id)
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
        .order("popularity_score", { ascending: false })
        .limit(4);

      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurant,
  });

  const openStatus = useMemo(
    () => getRestaurantOpenStatus(restaurant?.opening),
    [restaurant?.opening]
  );

  const formatPrice = (price: string) => {
    const count = price?.length || 1;
    return "$".repeat(Math.min(count, 4));
  };

  const formatRating = (rating: number) => {
    return rating ? rating.toFixed(1) : "N/A";
  };

  const getPriceDescription = (priceRange: string) => {
    switch (priceRange) {
      case "$": return "Under $15 per person";
      case "$$": return "$15-30 per person";
      case "$$$": return "$30-50 per person";
      case "$$$$": return "Over $50 per person";
      default: return priceRange;
    }
  };

  if (isLoading) {
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

  if (error || !restaurant) {
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
              <Link to="/restaurants">
                <Button className="bg-[#2D1B69] hover:bg-[#2D1B69]/90">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Restaurants
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  const showImage = restaurant.image_url && !imageError;
  const cityName = restaurant.city || "Des Moines";
  const neighborhoodText = restaurant.location
    ? `${restaurant.location}, ${cityName}`
    : cityName;

  // Comprehensive SEO
  //
  // SEO-005: a hand-set seo_title overrides the generated fallback, and the
  // fallback is the only one of the two that names the city. Texas Roadhouse has
  // two real Des Moines-area locations - Johnston and Mills Civic Pkwy in West
  // Des Moines - and BOTH rows carry seo_title "Texas Roadhouse", so two
  // different restaurants served one identical title and neither told a searcher
  // which branch they had found.
  //
  // qualifyTitleWithCity fills that gap and never overrides an editor: a title
  // that already names a place is returned untouched, and a row with no city
  // gets nothing appended rather than an invented one.
  //
  // This is worth doing beyond the one collision. The suburb-qualified branded
  // lookup is one of the most common query shapes this site receives -
  // "dave's hot chicken west des moines" at 1,184 impressions, "bonchon west
  // des moines" at 1,391, "atlas cafe west des moines" at 282, plus marvs
  // norwalk, bubbies bbq pleasant hill and others - and a title with no suburb
  // in it cannot match any of them well.
  const seoTitle = qualifyTitleWithCity(
    restaurant.seo_title ||
      `${restaurant.name} - ${restaurant.cuisine || "Restaurant"} in ${cityName}, Iowa | Menu, Hours & Reviews`,
    restaurant.city,
  );

  const seoDescription = restaurant.seo_description ||
    (restaurant.description
      ? `${restaurant.description.slice(0, 140)}... ${restaurant.name} serves ${restaurant.cuisine || "diverse"} cuisine at ${neighborhoodText}. ${restaurant.price_range ? `Price: ${getPriceDescription(restaurant.price_range)}.` : ""} ${restaurant.rating ? `Rated ${restaurant.rating}/5.` : ""}`
      : `${restaurant.name} is a ${restaurant.cuisine || "local"} restaurant in ${cityName}, Iowa. View menu, hours, ratings, photos, and directions. ${restaurant.price_range ? `Price range: ${getPriceDescription(restaurant.price_range)}.` : ""}`);

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
    "@id": `https://desmoinespulse.com/restaurants/${restaurant.slug || restaurant.id}`,
    name: restaurant.name,
    description: restaurant.description || seoDescription,
    servesCuisine: restaurant.cuisine,
    address: {
      "@type": "PostalAddress",
      streetAddress: restaurant.location,
      addressLocality: cityName,
      addressRegion: "Iowa",
      addressCountry: "US",
    },
    ...(restaurant.phone && { telephone: restaurant.phone }),
    ...(restaurant.website && { url: restaurant.website }),
    priceRange: restaurant.price_range,
    ...(restaurant.image_url && { image: [restaurant.image_url] }),
    geo: {
      "@type": "GeoCoordinates",
      latitude: restaurant.latitude || 41.5868,
      longitude: restaurant.longitude || -93.6250,
    },
    // Derived from the same parser as the visible open/closed badge; omitted
    // entirely when the free-form hours can't be parsed (no fabricated hours).
    ...(getOpeningHoursSpecification(restaurant.opening)
      ? { openingHoursSpecification: getOpeningHoursSpecification(restaurant.opening) }
      : {}),
    paymentAccepted: "Cash, Credit Card, Debit Card",
    currenciesAccepted: "USD",
    hasMenu: {
      "@type": "Menu",
      "@id": `https://desmoinespulse.com/restaurants/${restaurant.slug || restaurant.id}#menu`,
      name: `${restaurant.name} Menu`,
      url: `https://desmoinespulse.com/restaurants/${restaurant.slug || restaurant.id}#menu`,
    },
    areaServed: {
      "@type": "City",
      name: "Des Moines",
      containedInPlace: {
        "@type": "State",
        name: "Iowa",
      },
    },
  };

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Restaurants", url: "/restaurants" },
    ...(restaurant.cuisine ? [{ name: restaurant.cuisine, url: `/restaurants?cuisine=${encodeURIComponent(restaurant.cuisine)}` }] : []),
    {
      name: restaurant.name,
      url: `/restaurants/${restaurant.slug || restaurant.id}`,
    },
  ];

  // Generate dynamic FAQ for this specific restaurant
  const restaurantFaqs = [
    {
      question: `What type of food does ${restaurant.name} serve?`,
      answer: `${restaurant.name} serves ${restaurant.cuisine || "a variety of"} cuisine in ${cityName}, Iowa. ${restaurant.description ? restaurant.description.slice(0, 200) : `Located at ${restaurant.location || cityName}, it's a popular dining destination in the Des Moines metro area.`}`,
    },
    {
      question: `What are the hours for ${restaurant.name}?`,
      answer: restaurant.opening
        ? `${restaurant.name} is typically open ${restaurant.opening}. Hours may vary on holidays and special occasions. We recommend calling ahead at ${restaurant.phone || "the restaurant"} to confirm current hours, especially for holiday dining.`
        : `For the most current hours at ${restaurant.name}, please call the restaurant directly${restaurant.phone ? ` at ${restaurant.phone}` : ""} or visit their website${restaurant.website ? ` at ${restaurant.website}` : ""}. Hours may vary by season and holidays.`,
    },
    {
      question: `How much does it cost to eat at ${restaurant.name}?`,
      answer: restaurant.price_range
        ? `${restaurant.name} is in the ${restaurant.price_range} price range, which means approximately ${getPriceDescription(restaurant.price_range)}. This is ${restaurant.price_range === "$" ? "one of the most affordable" : restaurant.price_range === "$$" ? "a moderately priced" : restaurant.price_range === "$$$" ? "an upscale" : "a fine dining"} option in the ${cityName} area.`
        : `Contact ${restaurant.name} directly for current pricing and menu information.`,
    },
    {
      question: `Where is ${restaurant.name} located?`,
      answer: `${restaurant.name} is located at ${restaurant.location || cityName + ", Iowa"}. ${restaurant.latitude ? "You can find directions using the map on this page." : "Visit our restaurants page for a map of all Des Moines dining locations."}`,
    },
    {
      question: `Does ${restaurant.name} have an online menu?`,
      answer: `Yes, you can view the full ${restaurant.name} menu with prices on this page. Scroll down to the Menu section or click the "Menu" button to see all menu categories and items${restaurant.cuisine ? ` featuring ${restaurant.cuisine} cuisine` : ''}. The menu is regularly updated to reflect current offerings. ${restaurant.website ? `You can also visit ${restaurant.name}'s official website for their latest menu.` : ''}`,
    },
    ...(restaurant.rating ? [{
      question: `What is the rating for ${restaurant.name}?`,
      answer: `${restaurant.name} has a rating of ${restaurant.rating.toFixed(1)} out of 5 stars based on local reviews. ${restaurant.rating >= 4.5 ? "It's one of the highest-rated restaurants in the Des Moines area." : restaurant.rating >= 4.0 ? "It's a highly-rated restaurant in Des Moines." : "Diners appreciate its " + (restaurant.cuisine || "diverse") + " cuisine offerings."} ${restaurant.is_featured ? "It's also featured as an editor's pick on Des Moines Insider." : ""}`,
    }] : []),
  ];

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
        breadcrumbs={breadcrumbs}
        location={{
          name: restaurant.name,
          address: restaurant.location || `${cityName}, IA`,
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
        }}
        modifiedTime={restaurant.updated_at}
      />
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: getCanonicalUrl("/") },
          { name: "Restaurants", url: getCanonicalUrl("/restaurants") },
          ...(restaurant.cuisine ? [{ name: restaurant.cuisine, url: getCanonicalUrl(`/restaurants?cuisine=${encodeURIComponent(restaurant.cuisine)}`) }] : []),
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
            <Link to="/restaurants">
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 -ml-2">
                <ArrowLeft className="h-4 w-4 mr-1" />
                All Restaurants
              </Button>
            </Link>
            <div className="flex gap-2">
              <ShareDialog
                title={restaurant.name}
                description={restaurant.description || `Check out ${restaurant.name} - ${restaurant.cuisine} cuisine in Des Moines`}
                url={typeof window !== 'undefined' ? window.location.href : ''}
                onShare={trackShare}
                trigger={
                  <Button variant="outline" size="sm" className="rounded-xl">
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
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Hero Card */}
          <Card className="shadow-xl rounded-3xl overflow-hidden border-0 mb-8">
            {/* Hero Image / Gradient */}
            <div className="relative h-72 md:h-96 overflow-hidden">
              {showImage ? (
                <img
                  src={restaurant.image_url}
                  alt={`${restaurant.name} - ${restaurant.cuisine || "Restaurant"} in ${cityName}, Iowa`}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#2D1B69] via-[#5B2D8E] to-[#DC143C]">
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-10 right-10 w-40 h-40 border-2 border-white/30 rounded-full" />
                    <div className="absolute bottom-10 left-10 w-64 h-64 border border-white/20 rounded-full" />
                  </div>
                </div>
              )}

              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              {/* Badges */}
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                {restaurant.is_featured && (
                  <Badge className="bg-amber-500 text-white border-0 shadow-lg text-sm font-semibold px-3 py-1">
                    <SpriteIcon name="sparkles" className="h-3.5 w-3.5 mr-1.5" />
                    Featured
                  </Badge>
                )}
                {openStatus.isOpen && (
                  <Badge className={`${openStatus.closingSoon ? 'bg-amber-500' : 'bg-emerald-500'} text-white border-0 shadow-lg text-sm font-semibold px-3 py-1`}>
                    <span className="relative flex h-2 w-2 mr-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    {openStatus.closingSoon ? 'Closing Soon' : 'Open Now'}
                  </Badge>
                )}
              </div>

              {/* Hero text */}
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-10">
                <div className="max-w-3xl">
                  {restaurant.cuisine && (
                    <div className="flex items-center gap-2 mb-2">
                      <SpriteIcon name="chef-hat" className="h-4 w-4 text-white/70" />
                      <span className="text-white/80 text-sm font-medium uppercase tracking-wider">
                        {restaurant.cuisine} Cuisine
                      </span>
                    </div>
                  )}
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight drop-shadow-lg">
                    {restaurant.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-white/90">
                    {restaurant.rating && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="font-semibold">{formatRating(restaurant.rating)}</span>
                      </div>
                    )}
                    {restaurant.price_range && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <DollarSign className="h-4 w-4" />
                        <span className="font-semibold">{formatPrice(restaurant.price_range)}</span>
                      </div>
                    )}
                    {restaurant.location && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <SpriteIcon name="map-pin" className="h-4 w-4" />
                        <span className="text-sm">{neighborhoodText}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap gap-3 p-4 md:p-6 bg-gray-50 border-b">
              {restaurant.phone && (
                <a href={`tel:${restaurant.phone}`}>
                  <Button className="bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white rounded-xl">
                    <Phone className="h-4 w-4 mr-2" />
                    Call
                  </Button>
                </a>
              )}
              {restaurant.website && (
                <a href={restaurant.website} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="rounded-xl">
                    <Globe className="h-4 w-4 mr-2" />
                    Website
                  </Button>
                </a>
              )}
              {restaurant.location && (
                <a
                  href={getDirectionsUrl({ latitude: restaurant.latitude, longitude: restaurant.longitude, address: `${restaurant.name} ${restaurant.location}` })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="rounded-xl">
                    <Navigation className="h-4 w-4 mr-2" />
                    Directions
                  </Button>
                </a>
              )}
              <a href="#menu">
                <Button variant="outline" className="rounded-xl">
                  <Utensils className="h-4 w-4 mr-2" />
                  Menu
                </Button>
              </a>
              <Button variant="outline" className="rounded-xl">
                <MessageCircle className="h-4 w-4 mr-2" />
                Write Review
              </Button>
            </div>

            {/* On-page section navigation for quick jumping */}
            <nav className="flex flex-wrap gap-2 px-4 md:px-6 py-3 bg-white border-b overflow-x-auto" aria-label="Page sections">
              <a href="#about" className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-[#2D1B69]/10 hover:text-[#2D1B69] rounded-full transition-colors whitespace-nowrap font-medium">
                About
              </a>
              <a href="#menu" className="text-xs px-3 py-1.5 bg-[#2D1B69]/10 text-[#2D1B69] hover:bg-[#2D1B69]/20 rounded-full transition-colors whitespace-nowrap font-medium">
                <Utensils className="w-3 h-3 inline mr-1" />
                Menu
              </a>
              {restaurant.ai_writeup && (
                <a href="#writeup" className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-[#2D1B69]/10 hover:text-[#2D1B69] rounded-full transition-colors whitespace-nowrap font-medium">
                  Review
                </a>
              )}
              {(restaurant.geo_summary || (restaurant.geo_key_facts && restaurant.geo_key_facts.length > 0)) && (
                <a href="#local-guide" className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-[#2D1B69]/10 hover:text-[#2D1B69] rounded-full transition-colors whitespace-nowrap font-medium">
                  Local Guide
                </a>
              )}
              <a href="#faq" className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-[#2D1B69]/10 hover:text-[#2D1B69] rounded-full transition-colors whitespace-nowrap font-medium">
                FAQ
              </a>
            </nav>

            <CardContent className="p-6 md:p-10">
              {/* Key Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="text-center p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <Star className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {formatRating(restaurant.rating)}
                  </div>
                  <div className="text-sm text-gray-600">Rating</div>
                </div>
                <div className="text-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <DollarSign className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {formatPrice(restaurant.price_range)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {restaurant.price_range ? getPriceDescription(restaurant.price_range) : "Price Range"}
                  </div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <SpriteIcon name="chef-hat" className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                  <div className="text-lg font-bold text-gray-900 line-clamp-1">
                    {restaurant.cuisine || "Various"}
                  </div>
                  <div className="text-sm text-gray-600">Cuisine</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-2xl border border-purple-100">
                  <Award className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {restaurant.is_featured ? (
                      <Check className="h-7 w-7 text-purple-500 mx-auto" />
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    {restaurant.is_featured ? "Editor's Pick" : "Featured"}
                  </div>
                </div>
              </div>

              {/* Real-Time Status */}
              <div className="mb-8">
                <RestaurantStatus
                  restaurant={{
                    name: restaurant.name,
                    phone: restaurant.phone,
                    website: restaurant.website,
                    hours: restaurant.opening,
                  }}
                />
              </div>

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
                        <SpriteIcon name="map-pin" className="h-5 w-5 text-gray-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-gray-900 font-medium">{restaurant.location}</p>
                          <p className="text-sm text-gray-500">{cityName}, Iowa</p>
                          <a
                            href={getDirectionsUrl({ latitude: restaurant.latitude, longitude: restaurant.longitude, address: `${restaurant.name} ${restaurant.location}` })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-sm text-[#2D1B69] hover:underline mt-1"
                          >
                            <Navigation className="h-3.5 w-3.5 mr-1" />
                            Get Directions
                          </a>
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
                    {restaurant.phone && (
                      <a
                        href={`tel:${restaurant.phone}`}
                        className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <Phone className="h-5 w-5 text-gray-500 shrink-0" />
                        <span className="text-gray-900">{restaurant.phone}</span>
                      </a>
                    )}
                    {restaurant.website && (
                      <a
                        href={restaurant.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <SpriteIcon name="external-link" className="h-5 w-5 text-gray-500 shrink-0" />
                        <span className="text-[#2D1B69] hover:underline">Visit Website</span>
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
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <span className="text-gray-600">Cuisine Type</span>
                      <Badge variant="secondary" className="bg-[#2D1B69]/10 text-[#2D1B69] font-medium">
                        {restaurant.cuisine || "Various"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <span className="text-gray-600">Price Range</span>
                      <div className="text-right">
                        <span className="text-gray-900 font-semibold">
                          {formatPrice(restaurant.price_range)}
                        </span>
                        {restaurant.price_range && (
                          <p className="text-xs text-gray-500">{getPriceDescription(restaurant.price_range)}</p>
                        )}
                      </div>
                    </div>
                    {restaurant.opening && (
                      <div className="flex items-start justify-between p-4 bg-gray-50 rounded-xl">
                        <span className="text-gray-600 flex items-center gap-1.5">
                          <SpriteIcon name="clock" className="h-4 w-4" />
                          Hours
                        </span>
                        <span className="text-gray-900 text-right text-sm">
                          {restaurant.opening}
                        </span>
                      </div>
                    )}
                    {restaurant.is_featured && (
                      <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                        <div className="flex items-center text-amber-700">
                          <Award className="h-5 w-5 mr-2" />
                          <span className="font-medium">Editor's Pick - Featured Restaurant</span>
                        </div>
                        <p className="text-sm text-amber-600 mt-1">
                          Selected by our editors for exceptional quality and dining experience.
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
                      <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <p className="text-sm text-gray-700 leading-relaxed">
                          <strong>{restaurant.name}</strong> is a {restaurant.cuisine || "local"} restaurant
                          located {restaurant.location ? `at ${restaurant.location} in` : "in"} {cityName}, Iowa.
                          {restaurant.rating ? ` Rated ${restaurant.rating.toFixed(1)} out of 5 stars by local diners.` : ""}
                          {restaurant.price_range ? ` The price range is ${restaurant.price_range} (${getPriceDescription(restaurant.price_range)}).` : ""}
                          {restaurant.phone ? ` Call ${restaurant.phone} for reservations.` : ""}
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
              />

              {/* AI Writeup Section — collapsible */}
              {restaurant.ai_writeup && (
                <>
                  <Separator className="my-8" />
                  <CollapsibleSection
                    id="writeup"
                    title={`${restaurant.name} Review & Insights`}
                    icon={<BookOpen className="h-5 w-5 text-[#2D1B69]" />}
                    defaultOpen={true}
                  >
                    <div className="pt-2">
                      <AIWriteup
                        writeup={restaurant.ai_writeup}
                        generatedAt={restaurant.writeup_generated_at}
                        prompt={restaurant.writeup_prompt_used}
                      />
                    </div>
                  </CollapsibleSection>
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
                                <Check className="h-4 w-4 text-emerald-500 mt-1 shrink-0" />
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

          {/* Ratings & Reviews (WEB-FEAT-010) */}
          <div id="reviews" className="mb-8">
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
              <p className="text-gray-600 mb-6">
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
              <p className="text-gray-600 mb-6">
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

          {/* Cross-Content: Nearby Events */}
          <NearbyContent
            variant="events-near-restaurant"
            city={restaurant.city || "Des Moines"}
            excludeId={restaurant.id}
          />

          {/* Browse More CTA */}
          <div className="text-center py-8">
            <Link to="/restaurants">
              <Button size="lg" className="bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white rounded-xl px-8">
                <Utensils className="h-5 w-5 mr-2" />
                Browse All Des Moines Restaurants
              </Button>
            </Link>
          </div>
        </div>

        <LastUpdatedBadge updatedAt={restaurant.updated_at} className="mt-6 justify-center" />
      </div>
      <Footer />
      <BackToTop />

      <StickyMobileCTA
        variant="restaurant"
        primaryAction={
          restaurant.phone
            ? {
                label: "Call to Reserve",
                href: `tel:${restaurant.phone}`,
                icon: "phone",
              }
            : restaurant.website
            ? {
                label: "Website",
                href: restaurant.website,
                icon: "website",
                isExternal: true,
              }
            : undefined
        }
        secondaryAction={
          restaurant.location
            ? {
                label: "Directions",
                href: getDirectionsUrl({ latitude: restaurant.latitude, longitude: restaurant.longitude, address: `${restaurant.name} ${restaurant.location}` }),
                icon: "directions",
                isExternal: true,
              }
            : undefined
        }
      />
    </>
  );
}
