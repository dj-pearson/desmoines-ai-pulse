import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Users } from "lucide-react";
import { Link } from "react-router-dom";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export default function Playgrounds() {
  const { playgrounds, isLoading, error } = usePlaygrounds();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section with DMI Brand Colors */}
      <section className="relative bg-gradient-to-br from-[#2D1B69] via-[#8B0000] to-[#DC143C] overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
            Discover Des Moines Playgrounds
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
            Find the perfect playground for your family with accessible
            equipment and fun activities
          </p>
        </div>
      </section>

      <main className="container mx-auto mobile-padding py-6 md:py-8 safe-area-top">
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
            <p className="text-muted-foreground">
              Error loading playgrounds. Please try again later.
            </p>
          </div>
        ) : playgrounds.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No playgrounds found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {playgrounds.map((playground) => (
              <Link
                key={playground.id}
                to={`/playgrounds/${createSlug(playground.name)}`}
                className="block hover:scale-105 transition-transform duration-200"
              >
                <Card className="h-full hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg leading-tight line-clamp-2">
                        {playground.name}
                      </CardTitle>
                      {playground.is_featured && (
                        <Badge variant="secondary" className="shrink-0">
                          Featured
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {playground.age_range && (
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          <span className="line-clamp-1">
                            {playground.age_range}
                          </span>
                        </div>
                      )}
                      {playground.rating && (
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span>{playground.rating}</span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="line-clamp-3 mb-3">
                      {playground.description}
                    </CardDescription>
                    {playground.location && (
                      <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                        📍 {playground.location}
                      </p>
                    )}
                    {playground.amenities &&
                      playground.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {playground.amenities
                            .slice(0, 3)
                            .map((amenity, index) => (
                              <Badge
                                key={index}
                                variant="outline"
                                className="text-xs"
                              >
                                {amenity}
                              </Badge>
                            ))}
                          {playground.amenities.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{playground.amenities.length - 3} more
                            </Badge>
                          )}
                        </div>
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
