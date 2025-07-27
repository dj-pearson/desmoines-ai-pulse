import { useState } from "react";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurantOpenings } from "@/hooks/useRestaurantOpenings";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, MapPin, ExternalLink, Utensils, Palette, TreePine } from "lucide-react";
import { format } from "date-fns";

interface AllInclusiveDashboardProps {
  onViewEventDetails?: (event: any) => void;
}

export default function AllInclusiveDashboard({ onViewEventDetails }: AllInclusiveDashboardProps) {
  const { events, isLoading: eventsLoading } = useEvents({ limit: 6 });
  const { restaurantOpenings, isLoading: restaurantsLoading } = useRestaurantOpenings({ limit: 6 });
  const { attractions, isLoading: attractionsLoading } = useAttractions({ limit: 6 });
  const { playgrounds, isLoading: playgroundsLoading } = usePlaygrounds({ limit: 6 });

  const [activeTab, setActiveTab] = useState("all");

  const formatDate = (date: string | Date) => {
    try {
      return format(new Date(date), "MMM d, yyyy");
    } catch {
      return "TBA";
    }
  };

  const isLoading = eventsLoading || restaurantsLoading || attractionsLoading || playgroundsLoading;

  if (isLoading) {
    return (
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              What's Happening in Des Moines
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-3 bg-muted rounded"></div>
                      <div className="h-3 bg-muted rounded w-2/3"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const allItems = [
    ...events.map(event => ({ ...event, type: 'event', icon: Calendar })),
    ...restaurantOpenings.map(opening => ({ ...opening, type: 'restaurant', icon: Utensils })),
    ...attractions.map(attraction => ({ ...attraction, type: 'attraction', icon: Palette })),
    ...playgrounds.map(playground => ({ ...playground, type: 'playground', icon: TreePine }))
  ].slice(0, 12);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'event': return 'bg-primary text-primary-foreground';
      case 'restaurant': return 'bg-orange-500 text-white';
      case 'attraction': return 'bg-purple-500 text-white';
      case 'playground': return 'bg-green-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const renderCard = (item: any) => {
    const Icon = item.icon;
    return (
      <Card key={`${item.type}-${item.id}`} className="hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Badge className={getTypeColor(item.type)}>
              <Icon className="h-3 w-3 mr-1" />
              {item.type}
            </Badge>
          </div>
          <CardTitle className="text-lg">{item.title || item.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {item.location && (
              <div className="flex items-center text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 mr-1" />
                {item.location}
              </div>
            )}
            {item.date && (
              <div className="flex items-center text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 mr-1" />
                {formatDate(item.date)}
              </div>
            )}
            {item.opening_date && (
              <div className="flex items-center text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 mr-1" />
                Opens: {formatDate(item.opening_date)}
              </div>
            )}
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.enhanced_description || item.original_description || item.description}
            </p>
            {item.type === 'event' && onViewEventDetails && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewEventDetails(item)}
                className="w-full mt-2"
              >
                View Details
              </Button>
            )}
            {item.source_url && (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="w-full mt-2"
              >
                <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Learn More
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <section className="py-16 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            What's Happening in Des Moines
          </h2>
          <p className="text-lg text-muted-foreground">
            Events, new restaurants, attractions, and family activities all in one place
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-8">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="event">Events</TabsTrigger>
            <TabsTrigger value="restaurant">Restaurants</TabsTrigger>
            <TabsTrigger value="attraction">Attractions</TabsTrigger>
            <TabsTrigger value="playground">Playgrounds</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allItems.map(renderCard)}
            </div>
          </TabsContent>

          <TabsContent value="event">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.slice(0, 9).map(event => renderCard({ ...event, type: 'event', icon: Calendar }))}
            </div>
          </TabsContent>

          <TabsContent value="restaurant">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {restaurantOpenings.slice(0, 9).map(opening => renderCard({ ...opening, type: 'restaurant', icon: Utensils }))}
            </div>
          </TabsContent>

          <TabsContent value="attraction">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {attractions.slice(0, 9).map(attraction => renderCard({ ...attraction, type: 'attraction', icon: Palette }))}
            </div>
          </TabsContent>

          <TabsContent value="playground">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {playgrounds.slice(0, 9).map(playground => renderCard({ ...playground, type: 'playground', icon: TreePine }))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}