import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, ExternalLink, Phone, Star, DollarSign, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

export default function RestaurantDetails() {
  const { slug } = useParams();

  const { data: restaurant, isLoading, error } = useQuery({
    queryKey: ["restaurant", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", slug)
        .maybeSingle();

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
      return data;
    },
    enabled: !!restaurant?.cuisine,
  });

  const handleShare = async () => {
    if (navigator.share && restaurant) {
      try {
        await navigator.share({
          title: restaurant.name,
          text: restaurant.description || `Check out ${restaurant.name} in Des Moines`,
          url: window.location.href,
        });
      } catch (error) {
        console.log("Error sharing:", error);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-3/4"></div>
            <div className="h-64 bg-muted rounded"></div>
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-destructive">Restaurant Not Found</h1>
          <p className="text-muted-foreground">The restaurant you're looking for doesn't exist.</p>
          <Button asChild>
            <Link to="/">Return Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{restaurant.name} - Des Moines Restaurants</title>
        <meta name="description" content={restaurant.description || `${restaurant.name} - ${restaurant.cuisine} restaurant in Des Moines`} />
        <meta property="og:title" content={restaurant.name} />
        <meta property="og:description" content={restaurant.description || `${restaurant.name} - ${restaurant.cuisine} restaurant in Des Moines`} />
        <meta property="og:type" content="restaurant" />
        <meta property="og:url" content={window.location.href} />
        {restaurant.image_url && <meta property="og:image" content={restaurant.image_url} />}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Restaurant",
            name: restaurant.name,
            description: restaurant.description,
            image: restaurant.image_url,
            address: restaurant.location,
            telephone: restaurant.phone,
            url: restaurant.website,
            servesCuisine: restaurant.cuisine,
            priceRange: restaurant.price_range,
            aggregateRating: restaurant.rating ? {
              "@type": "AggregateRating",
              ratingValue: restaurant.rating,
              ratingCount: 1,
            } : undefined,
          })}
        </script>
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Breadcrumb */}
        <div className="border-b">
          <div className="container mx-auto px-4 py-3">
            <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Link to="/" className="hover:text-primary transition-colors">Home</Link>
              <span>/</span>
              <Link to="/restaurants" className="hover:text-primary transition-colors">Restaurants</Link>
              {restaurant.cuisine && (
                <>
                  <span>/</span>
                  <Link to={`/restaurants/cuisine/${restaurant.cuisine.toLowerCase()}`} className="hover:text-primary transition-colors">{restaurant.cuisine}</Link>
                </>
              )}
              <span>/</span>
              <span className="text-foreground">{restaurant.name}</span>
            </nav>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-3xl md:text-4xl font-bold leading-tight">{restaurant.name}</h1>
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="flex items-center gap-4">
                  {restaurant.cuisine && (
                    <Badge variant="outline">{restaurant.cuisine}</Badge>
                  )}
                  {restaurant.is_featured && (
                    <Badge>Featured</Badge>
                  )}
                  {restaurant.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm font-medium">{restaurant.rating}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Restaurant Image */}
              {restaurant.image_url && (
                <div className="aspect-video rounded-lg overflow-hidden">
                  <img 
                    src={restaurant.image_url} 
                    alt={restaurant.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Description */}
              {restaurant.description && (
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold mb-4">About {restaurant.name}</h2>
                    <div className="prose prose-sm max-w-none text-muted-foreground">
                      {restaurant.description}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Restaurant Details */}
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-lg">Restaurant Info</h3>
                  
                  <div className="space-y-3">
                    {restaurant.location && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <p className="font-medium">Location</p>
                          <p className="text-sm text-muted-foreground">{restaurant.location}</p>
                        </div>
                      </div>
                    )}

                    {restaurant.phone && (
                      <div className="flex items-start gap-3">
                        <Phone className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <p className="font-medium">Phone</p>
                          <a href={`tel:${restaurant.phone}`} className="text-sm text-primary hover:underline">
                            {restaurant.phone}
                          </a>
                        </div>
                      </div>
                    )}

                    {restaurant.price_range && (
                      <div className="flex items-start gap-3">
                        <DollarSign className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <p className="font-medium">Price Range</p>
                          <p className="text-sm text-muted-foreground">{restaurant.price_range}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {restaurant.website && (
                    <div className="pt-4">
                      <Button asChild className="w-full">
                        <a href={restaurant.website} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Visit Website
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Related Restaurants */}
              {relatedRestaurants && relatedRestaurants.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-lg mb-4">Similar Restaurants</h3>
                    <div className="space-y-3">
                      {relatedRestaurants.map((relatedRestaurant) => (
                        <Link 
                          key={relatedRestaurant.id}
                          to={`/restaurants/${relatedRestaurant.id}`}
                          className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <h4 className="font-medium text-sm">{relatedRestaurant.name}</h4>
                          <p className="text-xs text-muted-foreground mt-1">{relatedRestaurant.cuisine}</p>
                        </Link>
                      ))}
                    </div>
                    {restaurant.cuisine && (
                      <Button asChild variant="outline" className="w-full mt-4">
                        <Link to={`/restaurants/cuisine/${restaurant.cuisine.toLowerCase()}`}>
                          View All {restaurant.cuisine} Restaurants
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}