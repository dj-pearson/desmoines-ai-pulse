import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Calendar, MapPin, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Helmet } from "react-helmet-async";

export default function EventsPage() {
  const { data: events, isLoading } = useQuery({
    queryKey: ["all-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .gte("date", new Date().toISOString().split('T')[0])
        .order("date", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["event-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("category")
        .gte("date", new Date().toISOString().split('T')[0]);

      if (error) throw error;
      const uniqueCategories = [...new Set(data.map(event => event.category))];
      return uniqueCategories;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Events in Des Moines - Upcoming Activities & Entertainment</title>
        <meta name="description" content="Discover upcoming events in Des Moines. From concerts and festivals to community gatherings and entertainment." />
        <meta property="og:title" content="Events in Des Moines" />
        <meta property="og:description" content="Discover upcoming events in Des Moines. From concerts and festivals to community gatherings and entertainment." />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Breadcrumb */}
        <div className="border-b">
          <div className="container mx-auto px-4 py-3">
            <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Link to="/" className="hover:text-primary transition-colors">Home</Link>
              <span>/</span>
              <span className="text-foreground">Events</span>
            </nav>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="space-y-4 mb-8">
            <h1 className="text-3xl md:text-4xl font-bold">Upcoming Events</h1>
            <p className="text-muted-foreground text-lg">
              Discover the best events happening in Des Moines
            </p>
          </div>

          {/* Categories */}
          {categories && categories.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Browse by Category</h2>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Link
                    key={category}
                    to={`/events/category/${category.toLowerCase()}`}
                    className="hover:scale-105 transition-transform"
                  >
                    <Badge variant="outline" className="text-sm py-2 px-4">
                      <Tag className="h-3 w-3 mr-1" />
                      {category}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Events Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {events?.map((event) => (
              <Link key={event.id} to={`/events/${event.id}`}>
                <Card className="h-full hover:shadow-lg transition-shadow">
                  {event.image_url && (
                    <div className="aspect-video overflow-hidden rounded-t-lg">
                      <img 
                        src={event.image_url} 
                        alt={event.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{event.category}</Badge>
                        {event.is_featured && <Badge>Featured</Badge>}
                      </div>
                      
                      <h3 className="font-semibold text-lg line-clamp-2">{event.title}</h3>
                      
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>{format(new Date(event.date), "MMM d, yyyy")}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span className="line-clamp-1">{event.venue || event.location}</span>
                        </div>
                      </div>
                      
                      {(event.enhanced_description || event.original_description) && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {event.enhanced_description || event.original_description}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {(!events || events.length === 0) && (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium mb-2">No events found</h3>
              <p className="text-muted-foreground">Check back soon for upcoming events!</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}