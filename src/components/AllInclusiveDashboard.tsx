import { useState } from "react";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurantOpenings } from "@/hooks/useSupabase";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Calendar, MapPin, ExternalLink, Utensils, Palette, TreePine } from "lucide-react";
import { format, isToday, isTomorrow, isThisWeek, isWeekend, addWeeks, isWithinInterval, startOfWeek, endOfWeek, addDays, startOfDay, endOfDay } from "date-fns";
import { useAnalytics } from "@/hooks/useAnalytics";

interface AllInclusiveDashboardProps {
  onViewEventDetails?: (event: any) => void;
  filters?: {
    query?: string;
    category?: string;
    dateFilter?: { start?: Date; end?: Date; mode: 'single' | 'range' | 'preset'; preset?: string } | null;
    location?: string;
    priceRange?: string;
  };
}

export default function AllInclusiveDashboard({ onViewEventDetails, filters }: AllInclusiveDashboardProps) {
  // Get base data without filtering first
  const { events: allEvents, isLoading: eventsLoading } = useEvents({ limit: 100 });
  const { data: allRestaurantOpenings = [], isLoading: restaurantsLoading } = useRestaurantOpenings();
  const { attractions: allAttractions, isLoading: attractionsLoading } = useAttractions({ limit: 100 });
  const { playgrounds: allPlaygrounds, isLoading: playgroundsLoading } = usePlaygrounds({ limit: 100 });

  const [activeTab, setActiveTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;
  const { trackEvent } = useAnalytics();

  // Comprehensive filtering function
  const applyFilters = (items: any[], itemType: string, dateField: string = 'date') => {
    if (!filters) return items; // Return all items for pagination

    let filtered = [...items];

    // Text search filter
    if (filters.query && filters.query.trim() !== '') {
      const searchQuery = filters.query.toLowerCase().trim();
      console.log('Applying text search filter:', searchQuery);
      
      filtered = filtered.filter(item => {
        const searchableText = [
          item.title || item.name || '',
          item.description || item.enhanced_description || item.original_description || '',
          item.location || '',
          item.venue || '',
          item.cuisine || '',
          item.category || ''
        ].join(' ').toLowerCase();
        
        const matches = searchableText.includes(searchQuery);
        if (!matches) {
          console.log('Filtered out:', item.title || item.name, 'because it does not contain:', searchQuery);
        }
        return matches;
      });
      
      console.log('After text filter, items remaining:', filtered.length);
    } else {
      console.log('No text search filter applied, showing all items');
    }

    // Category filter
    if (filters.category && filters.category !== 'All') {
      const categoryFilter = filters.category.toLowerCase();
      filtered = filtered.filter(item => {
        if (categoryFilter === 'events') return itemType === 'event';
        if (categoryFilter === 'restaurants') return itemType === 'restaurant';
        if (categoryFilter === 'attractions') return itemType === 'attraction';
        if (categoryFilter === 'playgrounds') return itemType === 'playground';
        return true;
      });
    }

    // Location filter
    if (filters.location && filters.location !== 'any-location' && filters.location.trim()) {
      const locationFilter = filters.location.toLowerCase();
      filtered = filtered.filter(item => {
        const itemLocation = (item.location || '').toLowerCase();
        if (locationFilter === 'downtown') return itemLocation.includes('downtown');
        if (locationFilter === 'west-des-moines') return itemLocation.includes('west des moines');
        if (locationFilter === 'ankeny') return itemLocation.includes('ankeny');
        if (locationFilter === 'urbandale') return itemLocation.includes('urbandale');
        if (locationFilter === 'clive') return itemLocation.includes('clive');
        return itemLocation.includes(locationFilter);
      });
    }

    // Price filter
    if (filters.priceRange && filters.priceRange !== 'any-price' && filters.priceRange.trim()) {
      filtered = filtered.filter(item => {
        const price = item.price || '';
        const priceText = price.toLowerCase();
        
        switch (filters.priceRange) {
          case 'free':
            return priceText.includes('free') || priceText.includes('$0') || price === '';
          case 'under-25':
            return priceText.includes('$') && !priceText.match(/\$([2-9]\d|[1-9]\d\d+)/);
          case '25-50':
            return priceText.match(/\$(2[5-9]|[34]\d|50)/);
          case '50-100':
            return priceText.match(/\$(5\d|[6-9]\d|100)/);
          case 'over-100':
            return priceText.match(/\$([1-9]\d{2,})/);
          default:
            return true;
        }
      });
    }

    // Date filter
    if (filters.dateFilter) {
      const dateFilter = filters.dateFilter;
      const now = new Date();

      filtered = filtered.filter(item => {
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
          const today = startOfDay(now);
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
    }

    return filtered; // Return all filtered results for pagination
  };

  // Apply filters to each data type
  const events = applyFilters(allEvents || [], 'event');
  const restaurantOpenings = applyFilters(allRestaurantOpenings || [], 'restaurant', 'opening_date');
  const attractions = applyFilters(allAttractions || [], 'attraction');
  const playgrounds = applyFilters(allPlaygrounds || [], 'playground');

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
  ];

  // Pagination logic
  const getItemsForTab = (tabItems: any[]) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return tabItems.slice(startIndex, endIndex);
  };

  const getTotalPages = (totalItems: number) => {
    return Math.ceil(totalItems / itemsPerPage);
  };

  const getCurrentTabItems = () => {
    switch (activeTab) {
      case 'event': return events;
      case 'restaurant': return restaurantOpenings;
      case 'attraction': return attractions;
      case 'playground': return playgrounds;
      default: return allItems;
    }
  };

  const currentTabItems = getCurrentTabItems();
  const paginatedItems = getItemsForTab(currentTabItems);
  const totalPages = getTotalPages(currentTabItems.length);

  // Reset pagination when switching tabs
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="mt-8 flex justify-center">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage > 1) setCurrentPage(currentPage - 1);
                }}
                className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
            
            {[...Array(totalPages)].map((_, index) => {
              const page = index + 1;
              const showPage = page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1);
              
              if (!showPage) {
                if (page === currentPage - 2 || page === currentPage + 2) {
                  return (
                    <PaginationItem key={page}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  );
                }
                return null;
              }
              
              return (
                <PaginationItem key={page}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrentPage(page);
                    }}
                    isActive={currentPage === page}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            
            <PaginationItem>
              <PaginationNext 
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                }}
                className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };

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
    
    const handleCardClick = () => {
      // Track view event
      trackEvent({
        eventType: 'view',
        contentType: item.type as any,
        contentId: item.id
      });
      
      if (item.type === 'event' && onViewEventDetails) {
        onViewEventDetails(item);
      }
    };
    
    const handleLinkClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      // Track click event
      trackEvent({
        eventType: 'click',
        contentType: item.type as any,
        contentId: item.id
      });
    };
    
    return (
      <Card key={`${item.type}-${item.id}`} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={handleCardClick}>
        <CardHeader className="pb-3 px-4 py-4 md:px-6">
          <div className="flex items-center justify-between mb-2">
            <Badge className={getTypeColor(item.type)}>
              <Icon className="h-3 w-3 mr-1 flex-shrink-0" />
              <span className="truncate">{item.type}</span>
            </Badge>
          </div>
          <CardTitle className="text-mobile-title md:text-lg mobile-safe-text pr-2 leading-relaxed">
            {item.title || item.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-6">
          <div className="space-y-2">
            {item.location && (
              <div className="flex items-start text-mobile-caption text-muted-foreground">
                <MapPin className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                <span className="mobile-safe-text">{item.location}</span>
              </div>
            )}
            {item.date && (
              <div className="flex items-start text-mobile-caption text-muted-foreground">
                <Calendar className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                <span className="mobile-safe-text">{formatDate(item.date)}</span>
              </div>
            )}
            {(item.opening_date || item.openingTimeframe) && (
              <div className="flex items-start text-mobile-caption text-muted-foreground">
                <Calendar className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                <span className="mobile-safe-text">
                  Opens: {item.opening_date ? formatDate(item.opening_date) : item.openingTimeframe}
                </span>
              </div>
            )}
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.enhanced_description || item.original_description || item.description}
            </p>
            {item.type === 'event' && onViewEventDetails && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardClick();
                }}
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
                <a 
                  href={item.source_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={handleLinkClick}
                >
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
    <section className="py-8 md:py-16 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="text-mobile-title md:text-3xl font-bold text-foreground mb-3 md:mb-4 mobile-safe-text">
            What's Happening in Des Moines
          </h2>
          <p className="text-mobile-body md:text-lg text-muted-foreground mobile-safe-text">
            Events, new restaurants, attractions, and family activities all in one place
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6 md:mb-8 h-auto">
            <TabsTrigger value="all" className="text-xs md:text-sm py-2 px-1 md:px-3">
              All ({allItems.length})
            </TabsTrigger>
            <TabsTrigger value="event" className="text-xs md:text-sm py-2 px-1 md:px-3">
              Events ({events.length})
            </TabsTrigger>
            <TabsTrigger value="restaurant" className="text-xs md:text-sm py-2 px-1 md:px-3">
              Restaurants ({restaurantOpenings.length})
            </TabsTrigger>
            <TabsTrigger value="attraction" className="text-xs md:text-sm py-2 px-1 md:px-3">
              Attractions ({attractions.length})
            </TabsTrigger>
            <TabsTrigger value="playground" className="text-xs md:text-sm py-2 px-1 md:px-3">
              Playgrounds ({playgrounds.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedItems.map(renderCard)}
            </div>
            {renderPagination()}
          </TabsContent>

          <TabsContent value="event">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedItems.map(event => renderCard({ ...event, type: 'event', icon: Calendar }))}
            </div>
            {renderPagination()}
          </TabsContent>

          <TabsContent value="restaurant">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedItems.map(opening => renderCard({ ...opening, type: 'restaurant', icon: Utensils }))}
            </div>
            {renderPagination()}
          </TabsContent>

          <TabsContent value="attraction">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedItems.map(attraction => renderCard({ ...attraction, type: 'attraction', icon: Palette }))}
            </div>
            {renderPagination()}
          </TabsContent>

          <TabsContent value="playground">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedItems.map(playground => renderCard({ ...playground, type: 'playground', icon: TreePine }))}
            </div>
            {renderPagination()}
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}