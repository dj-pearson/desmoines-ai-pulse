import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  MapPin,
  Clock,
  Tag,
  TrendingUp,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
} from "lucide-react";
import { Database } from "@/integrations/supabase/types";

type Event = Database["public"]["Tables"]["events"]["Row"];
import { useEvents } from "@/hooks/useEvents";
import { format, addDays, isToday, isTomorrow, isThisWeek } from "date-fns";

interface SmartEventNavigationProps {
  onViewEventDetails: (event: Event) => void;
}

export const SmartEventNavigation: React.FC<SmartEventNavigationProps> = ({
  onViewEventDetails,
}) => {
  const { events } = useEvents();
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState("all");
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);

  // Smart event clusters
  const [eventClusters, setEventClusters] = useState({
    happeningNow: [] as Event[],
    trending: [] as Event[],
    thisWeek: [] as Event[],
    weekend: [] as Event[],
    free: [] as Event[],
    featured: [] as Event[],
  });

  // Generate smart tags from events
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [popularTags, setPopularTags] = useState<string[]>([]);

  useEffect(() => {
    if (events.length > 0) {
      generateSmartClusters();
      generateSmartTags();
    }
  }, [events]);

  useEffect(() => {
    applyFilters();
  }, [events, selectedTags, searchQuery, selectedDateRange]);

  const generateSmartClusters = () => {
    const now = new Date();
    const todayEvents = events.filter(event => isToday(new Date(event.date)));
    const trendingEvents = events.filter(event => event.is_featured).slice(0, 6);
    const weekEvents = events.filter(event => isThisWeek(new Date(event.date)));
    const weekendEvents = events.filter(event => {
      const eventDate = new Date(event.date);
      const day = eventDate.getDay();
      return (day === 5 || day === 6 || day === 0) && eventDate >= now;
    });
    const freeEvents = events.filter(event => 
      event.price?.toLowerCase().includes('free') || 
      event.price?.toLowerCase().includes('$0')
    );
    const featuredEvents = events.filter(event => event.is_featured);

    setEventClusters({
      happeningNow: todayEvents.slice(0, 4),
      trending: trendingEvents,
      thisWeek: weekEvents.slice(0, 6),
      weekend: weekendEvents.slice(0, 4),
      free: freeEvents.slice(0, 4),
      featured: featuredEvents.slice(0, 6),
    });
  };

  const generateSmartTags = () => {
    const tagMap = new Map<string, number>();
    
    events.forEach(event => {
      // Extract tags from category, title, and description
      const category = event.category?.toLowerCase() || '';
      const title = event.title?.toLowerCase() || '';
      const description = (event.enhanced_description || event.original_description || '').toLowerCase();
      
      // Add category as tag
      if (category) tagMap.set(category, (tagMap.get(category) || 0) + 1);
      
      // Extract keywords from title and description
      const keywords = [
        'music', 'concert', 'live', 'band', 'show', 'performance',
        'food', 'dining', 'restaurant', 'bar', 'drink',
        'family', 'kids', 'children', 'outdoor', 'indoor',
        'free', 'sports', 'art', 'festival', 'market',
        'comedy', 'theater', 'dance', 'fitness', 'yoga',
        'workshop', 'class', 'tour', 'exhibit', 'museum'
      ];
      
      keywords.forEach(keyword => {
        if (title.includes(keyword) || description.includes(keyword)) {
          tagMap.set(keyword, (tagMap.get(keyword) || 0) + 1);
        }
      });
      
      // Add location-based tags
      if (event.location?.toLowerCase().includes('downtown')) {
        tagMap.set('downtown', (tagMap.get('downtown') || 0) + 1);
      }
    });

    const sortedTags = Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

    setAvailableTags(sortedTags);
    setPopularTags(sortedTags.slice(0, 8));
  };

  const applyFilters = () => {
    let filtered = [...events];

    // Apply search query
    if (searchQuery) {
      filtered = filtered.filter(event =>
        event.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (event.enhanced_description || event.original_description || '')
          .toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply tag filters
    if (selectedTags.length > 0) {
      filtered = filtered.filter(event => {
        const eventText = `${event.title} ${event.category} ${event.location} ${
          event.enhanced_description || event.original_description || ''
        }`.toLowerCase();
        
        return selectedTags.some(tag => eventText.includes(tag.toLowerCase()));
      });
    }

    // Apply date range filter
    if (selectedDateRange !== 'all') {
      const now = new Date();
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.date);
        
        switch (selectedDateRange) {
          case 'today':
            return isToday(eventDate);
          case 'tomorrow':
            return isTomorrow(eventDate);
          case 'week':
            return isThisWeek(eventDate);
          case 'weekend':
            const day = eventDate.getDay();
            return (day === 5 || day === 6 || day === 0) && eventDate >= now;
          default:
            return true;
        }
      });
    }

    setFilteredEvents(filtered);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSelectedTags([]);
    setSearchQuery("");
    setSelectedDateRange("all");
  };

  // Timeline dates for horizontal scrolling
  const timelineDates = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i));

  const formatEventDate = (date: string | Date) => {
    try {
      const eventDate = new Date(date);
      if (isToday(eventDate)) return "Today";
      if (isTomorrow(eventDate)) return "Tomorrow";
      return format(eventDate, "MMM d");
    } catch {
      return "TBD";
    }
  };

  const formatEventTime = (date: string | Date) => {
    try {
      return format(new Date(date), "h:mm a");
    } catch {
      return "";
    }
  };

  return (
    <div className="space-y-8">
      {/* Smart Search with Live Filtering */}
      <div className="bg-card rounded-lg p-6 shadow-sm border">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search events... try 'music tonight' or 'free outdoor'"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              aria-label="Search events by keyword or category"
              role="searchbox"
            />
          </div>
          {(selectedTags.length > 0 || searchQuery || selectedDateRange !== 'all') && (
            <Button variant="outline" onClick={clearFilters} size="sm">
              Clear Filters
            </Button>
          )}
        </div>

        {/* Timeline Filter */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4" />
            <span className="text-sm font-medium">Quick Date Filter:</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[
              { key: 'all', label: 'All Events' },
              { key: 'today', label: 'Today' },
              { key: 'tomorrow', label: 'Tomorrow' },
              { key: 'week', label: 'This Week' },
              { key: 'weekend', label: 'Weekend' },
            ].map((option) => (
              <Button
                key={option.key}
                variant={selectedDateRange === option.key ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDateRange(option.key)}
                className="whitespace-nowrap"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Smart Tags */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            <span className="text-sm font-medium">Popular Tags:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {popularTags.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/80"
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Active Filters Display */}
        {(selectedTags.length > 0 || searchQuery) && (
          <div className="mt-4 p-3 bg-muted rounded">
            <p className="text-sm text-muted-foreground">
              Found <strong>{filteredEvents.length}</strong> events
              {searchQuery && <span> matching "{searchQuery}"</span>}
              {selectedTags.length > 0 && (
                <span> with tags: {selectedTags.join(", ")}</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Smart Event Clusters */}
      {searchQuery === "" && selectedTags.length === 0 && (
        <div className="space-y-8">
          {/* Happening Now */}
          {eventClusters.happeningNow.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <h3 className="text-xl font-semibold">Happening Today</h3>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {eventClusters.happeningNow.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onViewDetails={onViewEventDetails}
                    hoveredEvent={hoveredEvent}
                    setHoveredEvent={setHoveredEvent}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Trending This Week */}
          {eventClusters.trending.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-orange-500" />
                <h3 className="text-xl font-semibold">Trending This Week</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {eventClusters.trending.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onViewDetails={onViewEventDetails}
                    hoveredEvent={hoveredEvent}
                    setHoveredEvent={setHoveredEvent}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Free Events */}
          {eventClusters.free.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-green-500" />
                <h3 className="text-xl font-semibold">Free Events</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {eventClusters.free.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onViewDetails={onViewEventDetails}
                    hoveredEvent={hoveredEvent}
                    setHoveredEvent={setHoveredEvent}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtered Results */}
      {(searchQuery || selectedTags.length > 0) && (
        <div>
          <h3 className="text-xl font-semibold mb-4">
            Search Results ({filteredEvents.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onViewDetails={onViewEventDetails}
                hoveredEvent={hoveredEvent}
                setHoveredEvent={setHoveredEvent}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Event Card Component with Hover Effects
const EventCard: React.FC<{
  event: Event;
  onViewDetails: (event: Event) => void;
  hoveredEvent: string | null;
  setHoveredEvent: (id: string | null) => void;
}> = ({ event, onViewDetails, hoveredEvent, setHoveredEvent }) => {
  const isHovered = hoveredEvent === event.id;

  return (
    <Card
      className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${
        isHovered ? 'ring-2 ring-primary/20' : ''
      }`}
      onMouseEnter={() => setHoveredEvent(event.id)}
      onMouseLeave={() => setHoveredEvent(null)}
      onClick={() => onViewDetails(event)}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <h4 className="font-semibold text-sm leading-tight line-clamp-2">
              {event.title}
            </h4>
            {event.is_featured && (
              <Sparkles className="h-4 w-4 text-yellow-500 flex-shrink-0 ml-2" />
            )}
          </div>

          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(event.date), "MMM d")}</span>
              <Clock className="h-3 w-3 ml-2" />
              <span>{format(new Date(event.date), "h:mm a")}</span>
            </div>
            
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="line-clamp-1">{event.location}</span>
            </div>
          </div>

          <Badge variant="outline" className="text-xs">
            {event.category}
          </Badge>

          {/* Hover Reveal Details */}
          {isHovered && (
            <div className="pt-2 border-t space-y-2 animate-in fade-in duration-200">
              <p className="text-xs text-muted-foreground line-clamp-3">
                {event.enhanced_description || event.original_description}
              </p>
              {event.price && (
                <p className="text-xs font-medium">{event.price}</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartEventNavigation;