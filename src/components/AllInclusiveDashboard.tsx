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
import { format, isToday, isTomorrow, isThisWeek, isWeekend, addWeeks, isWithinInterval, startOfWeek, endOfWeek, addDays, startOfDay, endOfDay } from "date-fns";

interface AllInclusiveDashboardProps {
  onViewEventDetails?: (event: any) => void;
  dateFilter?: { start?: Date; end?: Date; mode: 'single' | 'range' | 'preset'; preset?: string } | null;
}

export default function AllInclusiveDashboard({ onViewEventDetails, dateFilter }: AllInclusiveDashboardProps) {
  // Get base data without date filtering first
  const { events: allEvents, isLoading: eventsLoading } = useEvents({ limit: 50 });
  const { restaurantOpenings: allRestaurantOpenings, isLoading: restaurantsLoading } = useRestaurantOpenings({ limit: 50 });
  const { attractions, isLoading: attractionsLoading } = useAttractions({ limit: 50 });
  const { playgrounds, isLoading: playgroundsLoading } = usePlaygrounds({ limit: 50 });

  const [activeTab, setActiveTab] = useState("all");

  // Enhanced date filtering with proper preset handling
  const filterByDate = (items: any[], dateField: string = 'date') => {
    if (!dateFilter) return items;

    const now = new Date();

    return items.filter(item => {
      const itemDate = new Date(item[dateField]);
      
      if (dateFilter.mode === 'single' && dateFilter.start) {
        const filterDate = startOfDay(dateFilter.start);
        const itemDateOnly = startOfDay(itemDate);
        return itemDateOnly.getTime() === filterDate.getTime();
      }
      
      if (dateFilter.mode === 'range' && dateFilter.start) {
        if (dateFilter.end) {
          return isWithinInterval(itemDate, { 
            start: startOfDay(dateFilter.start), 
            end: endOfDay(dateFilter.end) 
          });
        } else {
          return itemDate >= startOfDay(dateFilter.start);
        }
      }
      
      if (dateFilter.mode === 'preset' && dateFilter.preset) {
        // Implement actual preset filtering
        const today = startOfDay(now);
        const tomorrow = startOfDay(addDays(now, 1));
        const thisWeekStart = startOfWeek(now, { weekStartsOn: 0 });
        const thisWeekEnd = endOfWeek(now, { weekStartsOn: 0 });
        const nextWeekStart = addDays(thisWeekStart, 7);
        const nextWeekEnd = addDays(thisWeekEnd, 7);
        
        switch (dateFilter.preset) {
          case 'today':
            return isToday(itemDate);
          case 'tomorrow':
            return isTomorrow(itemDate);
          case 'this-week':
            return isWithinInterval(itemDate, { start: thisWeekStart, end: thisWeekEnd });
          case 'this-weekend':
            const saturday = addDays(thisWeekStart, 6);
            const sunday = addDays(thisWeekStart, 7);
            return isWithinInterval(itemDate, { start: saturday, end: sunday });
          case 'next-week':
            return isWithinInterval(itemDate, { start: nextWeekStart, end: nextWeekEnd });
          default:
            return true;
        }
      }
      
      return true;
    });
  };

  const events = filterByDate(allEvents || []);
  const restaurantOpenings = filterByDate(allRestaurantOpenings || [], 'opening_date');

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