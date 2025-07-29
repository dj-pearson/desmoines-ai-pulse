import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MapPin, 
  Star, 
  Share2, 
  ArrowLeft,
  Users,
  Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

export default function PlaygroundDetails() {
  const { slug } = useParams();
  const { toast } = useToast();

  // Fetch playground by matching slug
  const { data: playground, isLoading, error } = useQuery({
    queryKey: ["playground", slug],
    queryFn: async () => {
      const { data: playgrounds, error } = await supabase
        .from("playgrounds")
        .select("*");
      
      if (error) throw error;
      
      // Find playground by matching slug
      const foundPlayground = playgrounds?.find(p => createSlug(p.name) === slug);
      return foundPlayground || null;
    },
  });

  // Fetch related playgrounds by age range
  const { data: relatedPlaygrounds } = useQuery({
    queryKey: ["related-playgrounds", playground?.age_range],
    queryFn: async () => {
      if (!playground?.age_range) return [];
      
      const { data, error } = await supabase
        .from("playgrounds")
        .select("*")
        .eq("age_range", playground.age_range)
        .neq("id", playground.id)
        .limit(3);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!playground?.age_range,
  });

  const handleShare = async () => {
    const url = window.location.href;
    const text = `Check out ${playground?.name} - ${playground?.description}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: playground?.name, text, url });
      } catch (error) {
        console.error("Error sharing:", error);
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link copied!",
          description: "Playground link copied to clipboard",
        });
      } catch (error) {
        console.error("Error copying to clipboard:", error);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-64 w-full mb-6" />
        <Skeleton className="h-6 w-full mb-2" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    );
  }

  if (error || !playground) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Playground Not Found</h1>
        <p className="text-muted-foreground mb-6">
          Sorry, we couldn't find the playground you're looking for.
        </p>
        <Link to="/">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <HelmetProvider>
      <div className="container mx-auto px-4 py-8">
        <Helmet>
          <title>{playground.name} - Des Moines Insider</title>
          <meta name="description" content={playground.description || `Discover ${playground.name}, a playground in Des Moines, Iowa for ages ${playground.age_range}.`} />
          <meta property="og:title" content={`${playground.name} - Des Moines Insider`} />
          <meta property="og:description" content={playground.description || `Discover ${playground.name}, a playground in Des Moines, Iowa for ages ${playground.age_range}.`} />
          <meta property="og:type" content="place" />
          <meta property="og:image" content={playground.image_url || "https://desmoinesinsider.com/og-image.jpg"} />
          
          {/* JSON-LD Structured Data */}
          <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Park",
              "name": playground.name,
              "description": playground.description,
              "image": playground.image_url,
              "address": {
                "@type": "PostalAddress",
                "addressLocality": "Des Moines",
                "addressRegion": "Iowa",
                "addressCountry": "US"
              },
              "geo": {
                "@type": "GeoCoordinates",
                "latitude": "41.5868",
                "longitude": "-93.6250"
              },
              "aggregateRating": playground.rating ? {
                "@type": "AggregateRating",
                "ratingValue": playground.rating,
                "ratingCount": "1"
              } : undefined
            })}
          </script>
        </Helmet>

        {/* Breadcrumbs */}
        <nav className="mb-6">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary">Home</Link>
            <span>/</span>
            <Link to="/playgrounds" className="hover:text-primary">Playgrounds</Link>
            <span>/</span>
            <span className="text-foreground">{playground.name}</span>
          </div>
        </nav>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">{playground.name}</h1>
                <div className="flex items-center gap-2 text-muted-foreground">
                  {playground.age_range && (
                    <Badge variant="secondary">
                      <Users className="h-3 w-3 mr-1" />
                      Ages {playground.age_range}
                    </Badge>
                  )}
                  {playground.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span>{playground.rating}</span>
                    </div>
                  )}
                </div>
              </div>
              <Button onClick={handleShare} variant="outline" size="sm">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            </div>

            {/* Image */}
            {playground.image_url && (
              <div className="mb-6">
                <img
                  src={playground.image_url}
                  alt={playground.name}
                  className="w-full h-64 object-cover rounded-lg"
                />
              </div>
            )}

            {/* Description */}
            {playground.description && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3">About</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {playground.description}
                </p>
              </div>
            )}

            {/* Amenities */}
            {playground.amenities && playground.amenities.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3">Amenities</h2>
                <div className="flex flex-wrap gap-2">
                  {playground.amenities.map((amenity, index) => (
                    <Badge key={index} variant="outline">
                      <Zap className="h-3 w-3 mr-1" />
                      {amenity}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Playground Details */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Details</h3>
                <div className="space-y-3">
                  {playground.location && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">Location</div>
                        <div className="text-sm text-muted-foreground">
                          {playground.location}
                        </div>
                      </div>
                    </div>
                  )}

                  {playground.age_range && (
                    <div className="flex items-start gap-3">
                      <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">Age Range</div>
                        <div className="text-sm text-muted-foreground">
                          {playground.age_range}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Related Playgrounds */}
            {relatedPlaygrounds && relatedPlaygrounds.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4">Similar Playgrounds</h3>
                  <div className="space-y-3">
                    {relatedPlaygrounds.map((related) => (
                      <Link
                        key={related.id}
                        to={`/playgrounds/${createSlug(related.name)}`}
                        className="block p-3 rounded-lg border hover:bg-accent transition-colors"
                      >
                        <div className="font-medium">{related.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Ages {related.age_range}
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </HelmetProvider>
  );
}
