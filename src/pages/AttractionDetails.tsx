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
  ExternalLink, 
  Share2, 
  ArrowLeft,
  Camera
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

export default function AttractionDetails() {
  const { slug } = useParams();
  const { toast } = useToast();

  // Fetch attraction by matching slug
  const { data: attraction, isLoading, error } = useQuery({
    queryKey: ["attraction", slug],
    queryFn: async () => {
      const { data: attractions, error } = await supabase
        .from("attractions")
        .select("*");
      
      if (error) throw error;
      
      // Find attraction by matching slug
      const foundAttraction = attractions?.find(a => createSlug(a.name) === slug);
      return foundAttraction || null;
    },
  });

  // Fetch related attractions by type
  const { data: relatedAttractions } = useQuery({
    queryKey: ["related-attractions", attraction?.type],
    queryFn: async () => {
      if (!attraction?.type) return [];
      
      const { data, error } = await supabase
        .from("attractions")
        .select("*")
        .eq("type", attraction.type)
        .neq("id", attraction.id)
        .limit(3);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!attraction?.type,
  });

  const handleShare = async () => {
    const url = window.location.href;
    const text = `Check out ${attraction?.name} - ${attraction?.description}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: attraction?.name, text, url });
      } catch (error) {
        console.error("Error sharing:", error);
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link copied!",
          description: "Attraction link copied to clipboard",
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

  if (error || !attraction) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Attraction Not Found</h1>
        <p className="text-muted-foreground mb-6">
          Sorry, we couldn't find the attraction you're looking for.
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
          <title>{attraction.name} - Des Moines Insider</title>
          <meta name="description" content={attraction.description || `Discover ${attraction.name}, a ${attraction.type} in Des Moines, Iowa.`} />
          <meta property="og:title" content={`${attraction.name} - Des Moines Insider`} />
          <meta property="og:description" content={attraction.description || `Discover ${attraction.name}, a ${attraction.type} in Des Moines, Iowa.`} />
          <meta property="og:type" content="place" />
          <meta property="og:image" content={attraction.image_url || "https://desmoinesinsider.com/og-image.jpg"} />
          
          {/* JSON-LD Structured Data */}
          <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "TouristAttraction",
              "name": attraction.name,
              "description": attraction.description,
              "image": attraction.image_url,
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
              "url": attraction.website,
              "aggregateRating": attraction.rating ? {
                "@type": "AggregateRating",
                "ratingValue": attraction.rating,
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
            <Link to="/attractions" className="hover:text-primary">Attractions</Link>
            <span>/</span>
            <span className="text-foreground">{attraction.name}</span>
          </div>
        </nav>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">{attraction.name}</h1>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant="secondary">{attraction.type}</Badge>
                  {attraction.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span>{attraction.rating}</span>
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
            {attraction.image_url && (
              <div className="mb-6">
                <img
                  src={attraction.image_url}
                  alt={attraction.name}
                  className="w-full h-64 object-cover rounded-lg"
                />
              </div>
            )}

            {/* Description */}
            {attraction.description && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3">About</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {attraction.description}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Attraction Details */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Details</h3>
                <div className="space-y-3">
                  {attraction.location && (
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="font-medium">Location</div>
                        <div className="text-sm text-muted-foreground">
                          {attraction.location}
                        </div>
                      </div>
                    </div>
                  )}

                  {attraction.website && (
                    <div className="pt-4">
                      <a
                        href={attraction.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full"
                      >
                        <Button className="w-full">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Visit Website
                        </Button>
                      </a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Related Attractions */}
            {relatedAttractions && relatedAttractions.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4">Similar Attractions</h3>
                  <div className="space-y-3">
                    {relatedAttractions.map((related) => (
                      <Link
                        key={related.id}
                        to={`/attractions/${createSlug(related.name)}`}
                        className="block p-3 rounded-lg border hover:bg-accent transition-colors"
                      >
                        <div className="font-medium">{related.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {related.type}
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
