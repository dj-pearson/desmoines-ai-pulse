import { Link, useLocation } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Home, 
  Search, 
  Calendar, 
  Utensils, 
  MapPin, 
  Camera,
  ArrowRight,
  Clock
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Enhanced404() {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  // Get some popular content to show as suggestions
  const { data: popularEvents } = useQuery({
    queryKey: ["popular-events-404"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, date, category")
        .gte("date", new Date().toISOString().split("T")[0])
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) throw error;
      return data || [];
    },
  });

  const { data: popularRestaurants } = useQuery({
    queryKey: ["popular-restaurants-404"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, cuisine, city")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) throw error;
      return data || [];
    },
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
    }
  };

  const currentPath = location.pathname;
  const suggestedPath = currentPath.includes('/events') 
    ? '/events' 
    : currentPath.includes('/restaurants') 
    ? '/restaurants'
    : currentPath.includes('/attractions')
    ? '/attractions'
    : '/';

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Page Not Found - Des Moines Insider"
        description="The page you're looking for doesn't exist. Find events, restaurants, attractions, and activities in Des Moines with our search and recommendations."
        keywords={["Des Moines", "page not found", "search", "events", "restaurants"]}
        type="website"
      />

      <Header />

      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="text-8xl font-bold text-muted-foreground/20 mb-4">404</div>
          <h1 className="text-4xl font-bold mb-4">
            Oops! Page Not Found
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            The page you're looking for doesn't exist, but don't worry – 
            there's plenty to discover in Des Moines!
          </p>

          {/* Search Bar */}
          <Card className="max-w-2xl mx-auto mb-8">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Input
                  type="text"
                  placeholder="Search events, restaurants, attractions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button onClick={handleSearch} className="px-6">
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Link to="/" className="group">
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <Home className="h-8 w-8 mx-auto mb-3 text-primary group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold mb-2">Home</h3>
                <p className="text-sm text-muted-foreground">
                  Back to the main page
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/events/today" className="group">
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <Clock className="h-8 w-8 mx-auto mb-3 text-primary group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold mb-2">Today's Events</h3>
                <p className="text-sm text-muted-foreground">
                  See what's happening today
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/restaurants" className="group">
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <Utensils className="h-8 w-8 mx-auto mb-3 text-primary group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold mb-2">Restaurants</h3>
                <p className="text-sm text-muted-foreground">
                  Find great places to eat
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link to="/attractions" className="group">
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6 text-center">
                <Camera className="h-8 w-8 mx-auto mb-3 text-primary group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold mb-2">Attractions</h3>
                <p className="text-sm text-muted-foreground">
                  Explore Des Moines sights
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Popular Content Suggestions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Popular Events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Events
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {popularEvents?.slice(0, 4).map((event) => (
                <div key={event.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex-1">
                    <h4 className="font-medium truncate">{event.title}</h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{event.date}</span>
                      {event.category && (
                        <Badge variant="outline" className="text-xs">
                          {event.category}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Link 
                    to={`/events/${event.id}`}
                    className="text-primary hover:text-primary/80 ml-2"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
              <Link to="/events">
                <Button variant="outline" className="w-full">
                  View All Events
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Popular Restaurants */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Utensils className="h-5 w-5" />
                Popular Restaurants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {popularRestaurants?.slice(0, 4).map((restaurant) => (
                <div key={restaurant.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex-1">
                    <h4 className="font-medium truncate">{restaurant.name}</h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span>{restaurant.city}</span>
                      {restaurant.cuisine && (
                        <Badge variant="outline" className="text-xs">
                          {restaurant.cuisine}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Link 
                    to={`/restaurants/${restaurant.id}`}
                    className="text-primary hover:text-primary/80 ml-2"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
              <Link to="/restaurants">
                <Button variant="outline" className="w-full">
                  View All Restaurants
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Help Section */}
        <Card className="mt-12">
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-3">Need Help?</h3>
              <p className="text-muted-foreground mb-4">
                Looking for something specific? Try these helpful links:
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/guides">
                  <Button variant="outline" size="sm">
                    Local Guides
                  </Button>
                </Link>
                <Link to="/events/this-weekend">
                  <Button variant="outline" size="sm">
                    This Weekend
                  </Button>
                </Link>
                <Link to="/neighborhoods">
                  <Button variant="outline" size="sm">
                    Neighborhoods
                  </Button>
                </Link>
                <Link to={suggestedPath}>
                  <Button variant="outline" size="sm">
                    Similar Content
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}