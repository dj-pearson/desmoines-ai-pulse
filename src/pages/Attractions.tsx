import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAttractions } from "@/hooks/useAttractions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star } from "lucide-react";
import { Link } from "react-router-dom";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export default function Attractions() {
  const { attractions, isLoading, error } = useAttractions();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto mobile-padding py-6 md:py-8 safe-area-top">
        {/* Mobile-First Header Section */}
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-mobile-hero md:text-4xl font-bold text-foreground mb-3 md:mb-4">
            Des Moines Attractions
          </h1>
          <p className="text-mobile-body md:text-xl text-muted-foreground max-w-3xl mx-auto px-2">
            Discover museums, parks, entertainment venues, and cultural attractions 
            throughout the Des Moines metro area.
          </p>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-20 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Error loading attractions. Please try again later.</p>
          </div>
        ) : attractions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No attractions found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {attractions.map((attraction) => (
              <Link 
                key={attraction.id} 
                to={`/attractions/${createSlug(attraction.name)}`}
                className="block hover:scale-105 transition-transform duration-200"
              >
                <Card className="h-full hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg leading-tight line-clamp-2">
                        {attraction.name}
                      </CardTitle>
                      {attraction.is_featured && (
                        <Badge variant="secondary" className="shrink-0">Featured</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span className="line-clamp-1">{attraction.type}</span>
                      </div>
                      {attraction.rating && (
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span>{attraction.rating}</span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="line-clamp-3 mb-3">
                      {attraction.description}
                    </CardDescription>
                    {attraction.location && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        📍 {attraction.location}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}