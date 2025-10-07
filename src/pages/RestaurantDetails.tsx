import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AIWriteup from "@/components/AIWriteup";
import {
  MapPin,
  Phone,
  ExternalLink,
  Star,
  Clock,
  DollarSign,
  ArrowLeft,
  Navigation,
  Share2,
  Heart,
  MessageCircle,
  Award,
  Users,
  Calendar,
  Utensils,
  Wifi,
  Car,
  CreditCard,
} from "lucide-react";

// Helper function to get image URL - test direct Google Places loading
const getImageUrl = (originalUrl: string | null): string | null => {
  if (!originalUrl) return null;

  console.log("Original image URL:", originalUrl);

  // Let's test if Google Places images actually work directly
  // since the related restaurants are showing images successfully
  return originalUrl;

  // Google Places images have CORS restrictions and need server-side proxy
  // For now, we'll skip them and use gradient fallback
  // if (
  //   originalUrl.includes("places.googleapis.com") ||
  //   originalUrl.includes("googleusercontent.com")
  // ) {
  //   console.log("Google Places image detected - will use gradient fallback");
  //   return null; // This will trigger the gradient fallback
  // }

  // For other URLs (uploaded images, etc.), use as-is
  // return originalUrl;
};

export default function RestaurantDetails() {
  const { slug } = useParams();

  const {
    data: restaurant,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["restaurant", slug],
    queryFn: async () => {
      // First try to find by slug, then fall back to ID for backward compatibility
      let { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      // If not found by slug, try by ID (backward compatibility)
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

  const { data: relatedRestaurants } = useQuery({
    queryKey: ["related-restaurants", restaurant?.cuisine, restaurant?.id],
    queryFn: async () => {
      if (!restaurant) return [];
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("cuisine", restaurant.cuisine)
        .neq("id", restaurant.id)
        .limit(3);

      if (error) throw error;
      return data || [];
    },
    enabled: !!restaurant,
  });

  const handleShare = async () => {
    if (navigator.share && restaurant) {
      try {
        await navigator.share({
          title: restaurant.name,
          text: `Check out ${restaurant.name} - ${restaurant.cuisine} cuisine in Des Moines`,
          url: window.location.href,
        });
      } catch (error) {
        // Fallback to clipboard
        navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied to clipboard!");
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    }
  };

  const formatPrice = (price: string) => {
    const count = price?.length || 1;
    return "$".repeat(Math.min(count, 4));
  };

  const formatRating = (rating: number) => {
    return rating ? rating.toFixed(1) : "N/A";
  };

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100">
          <div className="container mx-auto px-4 py-8">
            <div className="animate-pulse">
              <div className="h-8 w-32 bg-gray-300 rounded mb-6"></div>
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="h-64 bg-gray-300"></div>
                <div className="p-8">
                  <div className="h-8 bg-gray-300 rounded mb-4"></div>
                  <div className="h-4 bg-gray-300 rounded mb-2"></div>
                  <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                </div>
              </div>
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
        <Header />
        <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center">
          <Card className="max-w-md mx-auto text-center">
            <CardContent className="p-8">
              <Utensils className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Restaurant Not Found
              </h2>
              <p className="text-gray-600 mb-6">
                The restaurant you're looking for doesn't exist or has been
                removed.
              </p>
              <Link to="/restaurants">
                <Button className="bg-amber-600 hover:bg-amber-700">
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

  // Debug logging for image URL
  const imageUrl = getImageUrl(restaurant?.image_url);
  console.log("Restaurant data:", {
    name: restaurant?.name,
    image_url: restaurant?.image_url,
    processed_url: imageUrl,
    hasImageUrl: !!restaurant?.image_url,
  });

  // Generate comprehensive SEO data
  const seoTitle = `${restaurant?.name} - ${
    restaurant?.cuisine || "Restaurant"
  } in Des Moines`;
  const seoDescription = restaurant?.description
    ? `${restaurant.description.slice(0, 150)}... Located at ${
        restaurant.location || "Des Moines"
      }.`
    : `Experience ${restaurant?.name}, a ${
        restaurant?.cuisine || "restaurant"
      } located in Des Moines, Iowa. View menu, hours, reviews and more.`;

  const seoKeywords = [
    restaurant?.name || "",
    restaurant?.cuisine || "",
    "restaurant",
    "dining",
    "food",
    restaurant?.location || "",
    "Des Moines restaurants",
    "Iowa dining",
    ...(restaurant?.cuisine ? [restaurant.cuisine + " restaurant"] : []),
  ].filter(Boolean);

  const restaurantSchema = restaurant
    ? {
        "@context": "https://schema.org",
        "@type": "Restaurant",
        name: restaurant.name,
        description: restaurant.description || seoDescription,
        servesCuisine: restaurant.cuisine,
        address: {
          "@type": "PostalAddress",
          streetAddress: restaurant.location,
          addressLocality: "Des Moines",
          addressRegion: "Iowa",
          addressCountry: "US",
        },
        telephone: restaurant.phone,
        url: restaurant.website,
        priceRange: restaurant.price_range,
        aggregateRating: restaurant.rating
          ? {
              "@type": "AggregateRating",
              ratingValue: restaurant.rating,
              ratingCount: "100",
              bestRating: "5",
              worstRating: "1",
            }
          : undefined,
        geo: {
          "@type": "GeoCoordinates",
          latitude: "41.5868",
          longitude: "-93.6250",
        },
        openingHours: "Mo-Su 11:00-22:00",
        paymentAccepted: "Cash, Credit Card",
        hasMenu: restaurant.website,
      }
    : null;

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Restaurants", url: "/restaurants" },
    {
      name: restaurant?.name || "Restaurant",
      url: `/restaurants/${restaurant?.slug || restaurant?.id}`,
    },
  ];

  return (
    <>
      <Header />
      {restaurant && (
        <SEOHead
          title={seoTitle}
          description={seoDescription}
          type="business"
          keywords={seoKeywords}
          structuredData={restaurantSchema}
          url={`/restaurants/${restaurant.slug || restaurant.id}`}
          imageUrl={restaurant.image_url}
          breadcrumbs={breadcrumbs}
          location={{
            name: restaurant.name,
            address: restaurant.location || "Des Moines, IA",
          }}
          modifiedTime={restaurant.updated_at}
        />
      )}
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Header Navigation */}
          <div className="flex items-center justify-between mb-8">
            <Link to="/restaurants">
              <Button
                variant="outline"
                className="bg-white border-2 border-gray-800 text-gray-800 hover:bg-gray-800 hover:text-white shadow-lg"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Restaurants
              </Button>
            </Link>

            <div className="flex gap-2">
              <Button
                onClick={handleShare}
                variant="outline"
                size="sm"
                className="bg-white border-2 border-gray-800 text-gray-800 hover:bg-gray-800 hover:text-white shadow-lg"
              >
                <Share2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-white border-2 border-gray-800 text-gray-800 hover:bg-gray-800 hover:text-white shadow-lg"
              >
                <Heart className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Main Restaurant Card */}
          <Card className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-3xl overflow-hidden border-0 mb-8">
            {/* Hero Section with Image or Gradient */}
            <div className="relative h-80 overflow-hidden">
              {imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt={restaurant.name}
                    className="absolute inset-0 w-full h-full object-cover z-20"
                    loading="eager"
                    decoding="async"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      console.error("Image failed to load:", {
                        imageUrl: imageUrl,
                        originalUrl: restaurant.image_url,
                        error: e,
                      });

                      // Try original URL as fallback if proxy failed
                      if (
                        restaurant.image_url &&
                        e.currentTarget.src !== restaurant.image_url
                      ) {
                        console.log("Trying original URL as fallback...");
                        e.currentTarget.src = restaurant.image_url;
                        return;
                      }

                      // If both failed, show gradient fallback
                      console.log(
                        "Both proxied and original URLs failed, showing gradient"
                      );
                      // Hide the image and show gradient fallback
                      e.currentTarget.style.display = "none";
                      const gradientFallback =
                        e.currentTarget.parentElement?.querySelector(
                          ".gradient-fallback"
                        ) as HTMLElement;
                      if (gradientFallback) {
                        gradientFallback.style.display = "block";
                      }
                    }}
                    onLoad={(e) => {
                      console.log("Image loaded successfully:", {
                        imageUrl: imageUrl,
                        originalUrl: restaurant.image_url,
                      });
                      // Ensure gradient is hidden when image loads
                      const gradientFallback =
                        e.currentTarget.parentElement?.querySelector(
                          ".gradient-fallback"
                        ) as HTMLElement;
                      if (gradientFallback) {
                        gradientFallback.style.display = "none";
                      }
                    }}
                  />
                  {/* Gradient fallback - shows when image fails */}
                  <div
                    className="gradient-fallback absolute inset-0 bg-gradient-to-r from-amber-600 via-orange-500 to-red-500 z-10"
                    style={{ display: "none" }}
                  ></div>
                  {/* Much lighter overlay to preserve image visibility */}
                  <div className="absolute inset-0 bg-black/15 z-25"></div>
                </>
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-600 via-orange-500 to-red-500"></div>
                  <div className="absolute inset-0 bg-black/20"></div>
                </>
              )}
              <div className="absolute inset-0 flex items-center justify-center z-30">
                <div className="text-center text-white">
                  {!imageUrl && (
                    <div className="flex items-center justify-center mb-4">
                      <Utensils className="h-16 w-16 text-white/80" />
                    </div>
                  )}
                  <h1 className="text-5xl font-bold mb-2 tracking-tight drop-shadow-xl">
                    {restaurant.name}
                  </h1>
                  <p className="text-xl text-white/90 font-medium drop-shadow-lg">
                    {restaurant.cuisine} Cuisine
                  </p>
                </div>
              </div>
              {/* Decorative elements only when no image */}
              {!imageUrl && (
                <>
                  <div className="absolute top-10 left-10 w-20 h-20 bg-white/10 rounded-full animate-pulse"></div>
                  <div className="absolute bottom-10 right-10 w-32 h-32 bg-white/5 rounded-full animate-pulse delay-1000"></div>
                </>
              )}
            </div>

            {/* Restaurant Info */}
            <CardContent className="p-8">
              {/* Key Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="text-center p-4 bg-amber-50 rounded-xl">
                  <Star className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-800">
                    {formatRating(restaurant.rating)}
                  </div>
                  <div className="text-sm text-gray-600">Rating</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <DollarSign className="h-6 w-6 text-green-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-800">
                    {formatPrice(restaurant.price_range)}
                  </div>
                  <div className="text-sm text-gray-600">Price Range</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <Users className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-800">N/A</div>
                  <div className="text-sm text-gray-600">Reviews</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-xl">
                  <Award className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-800">
                    {restaurant.is_featured ? "Yes" : "No"}
                  </div>
                  <div className="text-sm text-gray-600">Featured</div>
                </div>
              </div>

              <Separator className="my-8" />

              {/* Details Grid */}
              <div className="grid md:grid-cols-2 gap-8">
                {/* Contact & Location */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                      <MapPin className="h-5 w-5 mr-2 text-amber-600" />
                      Location & Contact
                    </h3>
                    <div className="space-y-3">
                      {restaurant.location && (
                        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <MapPin className="h-5 w-5 text-gray-500 mt-0.5" />
                          <div>
                            <p className="text-gray-800">
                              {restaurant.location}
                            </p>
                            <Button
                              variant="link"
                              className="h-auto p-0 text-amber-600 hover:text-amber-700"
                            >
                              <Navigation className="h-4 w-4 mr-1" />
                              Get Directions
                            </Button>
                          </div>
                        </div>
                      )}

                      {restaurant.phone && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <Phone className="h-5 w-5 text-gray-500" />
                          <a
                            href={`tel:${restaurant.phone}`}
                            className="text-gray-800 hover:text-amber-600 transition-colors"
                          >
                            {restaurant.phone}
                          </a>
                        </div>
                      )}

                      {restaurant.website && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <ExternalLink className="h-5 w-5 text-gray-500" />
                          <a
                            href={restaurant.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-600 hover:text-amber-700 transition-colors"
                          >
                            Visit Website
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Restaurant Info */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                      <Utensils className="h-5 w-5 mr-2 text-amber-600" />
                      Restaurant Details
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600">Cuisine Type</span>
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-800"
                        >
                          {restaurant.cuisine}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600">Price Range</span>
                        <span className="text-gray-800 font-medium">
                          {formatPrice(restaurant.price_range)}
                        </span>
                      </div>

                      {restaurant.opening && (
                        <div className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-gray-600 flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            Hours
                          </span>
                          <span className="text-gray-800 text-right">
                            {restaurant.opening}
                          </span>
                        </div>
                      )}

                      {restaurant.is_featured && (
                        <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200">
                          <div className="flex items-center text-amber-700">
                            <Award className="h-5 w-5 mr-2" />
                            <span className="font-medium">
                              Featured Restaurant
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              {restaurant.description && (
                <>
                  <Separator className="my-8" />
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">
                      About {restaurant.name}
                    </h3>
                    <p className="text-gray-700 leading-relaxed text-lg">
                      {restaurant.description}
                    </p>
                  </div>
                </>
              )}

              {/* AI Writeup Section */}
              {restaurant.ai_writeup && (
                <>
                  <Separator className="my-8" />
                  <AIWriteup
                    writeup={restaurant.ai_writeup}
                    generatedAt={restaurant.writeup_generated_at}
                    prompt={restaurant.writeup_prompt_used}
                  />
                </>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-4 mt-8 pt-6 border-t border-gray-100">
                {restaurant.phone && (
                  <Button className="bg-amber-600 hover:bg-amber-700 text-white">
                    <Phone className="h-4 w-4 mr-2" />
                    Call Now
                  </Button>
                )}
                {restaurant.website && (
                  <Button
                    variant="outline"
                    className="border-amber-200 text-amber-700 hover:bg-amber-50"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visit Website
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-amber-200 text-amber-700 hover:bg-amber-50"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Write Review
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Related Restaurants */}
          {relatedRestaurants && relatedRestaurants.length > 0 && (
            <Card className="bg-white/95 backdrop-blur-sm shadow-xl rounded-2xl border-0">
              <CardHeader>
                <h3 className="text-2xl font-bold text-gray-800">
                  More {restaurant.cuisine} Restaurants
                </h3>
                <p className="text-gray-600">
                  Discover other great {restaurant.cuisine} options in Des
                  Moines
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-6">
                  {relatedRestaurants.map((related) => (
                    <Link
                      key={related.id}
                      to={`/restaurants/${related.slug || related.id}`}
                      className="group"
                    >
                      <Card className="h-full hover:shadow-lg transition-all duration-300 group-hover:scale-105 border border-gray-200 overflow-hidden">
                        {/* Restaurant Image */}
                        {related.image_url && (
                          <div className="relative h-32 overflow-hidden bg-gradient-to-r from-gray-200 to-gray-300">
                            <img
                              src={
                                getImageUrl(related.image_url) ||
                                related.image_url
                              }
                              alt={related.name}
                              className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              onError={(e) => {
                                // Hide image container if image fails to load
                                e.currentTarget.parentElement.style.display =
                                  "none";
                              }}
                            />
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors z-10"></div>
                          </div>
                        )}
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-gray-800 group-hover:text-amber-600 transition-colors">
                              {related.name}
                            </h4>
                            <div className="flex items-center text-sm text-gray-600">
                              <Star className="h-4 w-4 text-amber-400 mr-1" />
                              {formatRating(related.rating)}
                            </div>
                          </div>
                          <p className="text-gray-600 text-sm mb-2">
                            {related.location}
                          </p>
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-xs">
                              {related.cuisine}
                            </Badge>
                            <span className="text-sm font-medium text-gray-700">
                              {formatPrice(related.price_range)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
