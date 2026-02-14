import { useState, useEffect, useRef } from "react";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurantOpenings } from "@/hooks/useSupabase";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSkeleton } from "@/components/ui/loading-skeleton";
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
import { Event, RestaurantOpening } from "@/lib/types";
import {
  Calendar,
  MapPin,
  ExternalLink,
  Utensils,
  Palette,
  TreePine,
  Search,
  X,
} from "lucide-react";
import {
  format,
  isToday,
  isTomorrow,
  isThisWeek,
  isWeekend,
  addWeeks,
  isWithinInterval,
  startOfWeek,
  endOfWeek,
  addDays,
  startOfDay,
  endOfDay,
} from "date-fns";
import { useNavigate } from "react-router-dom";
import { useAnalytics } from "@/hooks/useAnalytics";
import { FavoriteButton } from "@/components/FavoriteButton";
import { openExternalUrl } from "@/lib/capacitorUtils";

// Type definitions for dashboard items
type DashboardItem = {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  location?: string;
  type?: string;
  date?: string | Date;
  category?: string;
  cuisine?: string;
  venue?: string;
  price?: string;
  rating?: number;
  enhanced_description?: string;
  original_description?: string;
  opening_date?: string;
  openingTimeframe?: string;
  source_url?: string;
  sourceUrl?: string;
  icon?: React.ComponentType;
  [key: string]: unknown;
};

// Helper function to get item type safely
const getItemType = (
  item: DashboardItem
):
  | "event"
  | "attraction"
  | "restaurant"
  | "playground"
  | "page"
  | "search_result" => {
  if (item.type) {
    switch (item.type) {
      case "event":
        return "event";
      case "restaurant":
        return "restaurant";
      case "attraction":
        return "attraction";
      case "playground":
        return "playground";
      default:
        return "page";
    }
  }
  if (item.date) return "event";
  if (item.cuisine || item.opening_date || item.openingTimeframe)
    return "restaurant";
  return "page";
};

interface AllInclusiveDashboardProps {
  onViewEventDetails?: (event: Event) => void;
  filters?: {
    query?: string;
    category?: string;
    subcategory?: string;
    dateFilter?: {
      start?: Date;
      end?: Date;
      mode: "single" | "range" | "preset";
      preset?: string;
    } | null;
    location?: string;
    priceRange?: string;
  };
  onClearFilters?: () => void;
}

export default function AllInclusiveDashboard({
  onViewEventDetails,
  filters,
  onClearFilters,
}: AllInclusiveDashboardProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;
  const { trackEvent } = useAnalytics();
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLDivElement>(null);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters?.query, filters?.category, filters?.subcategory, filters?.location, filters?.priceRange, filters?.dateFilter]);

  // Check if any filters are active
  const hasActiveFilters = Boolean(
    filters?.query?.trim() ||
    (filters?.category && filters.category !== "All") ||
    filters?.subcategory?.trim() ||
    (filters?.location && filters.location !== "any-location") ||
    (filters?.priceRange && filters.priceRange !== "any-price") ||
    filters?.dateFilter
  );

  // Load events first (critical for homepage)
  const { events: allEvents, isLoading: eventsLoading } = useEvents({
    limit: 100,
  });

  // Load other data sources - React Query will handle caching
  const { data: allRestaurantOpenings = [], isLoading: restaurantsLoading } =
    useRestaurantOpenings();
  const { attractions: allAttractions, isLoading: attractionsLoading } =
    useAttractions({ limit: 100 });
  const { playgrounds: allPlaygrounds, isLoading: playgroundsLoading } =
    usePlaygrounds({ limit: 100 });

  // Comprehensive filtering function
  const applyFilters = (
    items: DashboardItem[],
    itemType: string,
    dateField: string = "date"
  ) => {
    if (!filters) return items; // Return all items for pagination

    let filtered = [...items];

    // Text search filter
    if (filters.query && filters.query.trim() !== "") {
      const searchQuery = filters.query.toLowerCase().trim();

      filtered = filtered.filter((item) => {
        const searchableText = [
          item.title || item.name || "",
          item.description ||
            item.enhanced_description ||
            item.original_description ||
            "",
          item.location || "",
          item.venue || "",
          item.cuisine || "",
          item.category || "",
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(searchQuery);
      });
    }

    // Category filter
    if (filters.category && filters.category !== "All") {
      const categoryFilter = filters.category.toLowerCase();
      filtered = filtered.filter((item) => {
        if (categoryFilter === "events") return itemType === "event";
        if (categoryFilter === "restaurants") return itemType === "restaurant";
        if (categoryFilter === "attractions") return itemType === "attraction";
        if (categoryFilter === "playgrounds") return itemType === "playground";
        return true;
      });
    }

    // Subcategory filter (for events and restaurants)
    if (filters.subcategory && filters.subcategory.trim() !== "") {
      const subcategoryFilter = filters.subcategory.toLowerCase();

      filtered = filtered.filter((item) => {
        if (itemType === "event") {
          // For events, filter by category field
          const eventCategory = (item.category || "").toLowerCase();
          return eventCategory === subcategoryFilter;
        } else if (itemType === "restaurant") {
          // For restaurants, filter by cuisine field
          const restaurantCuisine = (item.cuisine || "").toLowerCase();
          return restaurantCuisine === subcategoryFilter;
        }
        return true; // No subcategory filtering for other types
      });
    }

    // Location filter
    if (
      filters.location &&
      filters.location !== "any-location" &&
      filters.location.trim()
    ) {
      const locationFilter = filters.location.toLowerCase();
      filtered = filtered.filter((item) => {
        const itemLocation = (item.location || "").toLowerCase();
        if (locationFilter === "downtown")
          return itemLocation.includes("downtown");
        if (locationFilter === "west-des-moines")
          return itemLocation.includes("west des moines");
        if (locationFilter === "ankeny") return itemLocation.includes("ankeny");
        if (locationFilter === "urbandale")
          return itemLocation.includes("urbandale");
        if (locationFilter === "clive") return itemLocation.includes("clive");
        return itemLocation.includes(locationFilter);
      });
    }

    // Price filter
    if (
      filters.priceRange &&
      filters.priceRange !== "any-price" &&
      filters.priceRange.trim()
    ) {
      filtered = filtered.filter((item) => {
        const price = item.price || "";
        const priceText = price.toLowerCase();

        switch (filters.priceRange) {
          case "free":
            return (
              priceText.includes("free") ||
              priceText.includes("$0") ||
              price === ""
            );
          case "under-25":
            return (
              priceText.includes("$") &&
              !priceText.match(/\$([2-9]\d|[1-9]\d\d+)/)
            );
          case "25-50":
            return priceText.match(/\$(2[5-9]|[34]\d|50)/);
          case "50-100":
            return priceText.match(/\$(5\d|[6-9]\d|100)/);
          case "over-100":
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

      filtered = filtered.filter((item) => {
        const itemDate = new Date(item[dateField] as string | Date);

        if (dateFilter.mode === "single" && dateFilter.start) {
          const filterDate = startOfDay(dateFilter.start);
          const itemDateOnly = startOfDay(itemDate);
          return itemDateOnly.getTime() === filterDate.getTime();
        }

        if (dateFilter.mode === "range" && dateFilter.start) {
          if (dateFilter.end) {
            return isWithinInterval(itemDate, {
              start: startOfDay(dateFilter.start),
              end: endOfDay(dateFilter.end),
            });
          } else {
            return itemDate >= startOfDay(dateFilter.start);
          }
        }

        if (dateFilter.mode === "preset" && dateFilter.preset) {
          const today = startOfDay(now);
          const thisWeekStart = startOfWeek(now, { weekStartsOn: 0 });
          const thisWeekEnd = endOfWeek(now, { weekStartsOn: 0 });
          const nextWeekStart = addDays(thisWeekStart, 7);
          const nextWeekEnd = addDays(thisWeekEnd, 7);

          switch (dateFilter.preset) {
            case "today":
              return isToday(itemDate);
            case "tomorrow":
              return isTomorrow(itemDate);
            case "this-week":
              return isWithinInterval(itemDate, {
                start: thisWeekStart,
                end: thisWeekEnd,
              });
            case "this-weekend": {
              const saturday = addDays(thisWeekStart, 6);
              const sunday = addDays(thisWeekStart, 7);
              return isWithinInterval(itemDate, {
                start: saturday,
                end: sunday,
              });
            }
            case "next-week":
              return isWithinInterval(itemDate, {
                start: nextWeekStart,
                end: nextWeekEnd,
              });
            default:
              return true;
          }
        }

        return true;
      });
    }

    return filtered; // Return all filtered results for pagination
  };

  // Transform data to add type field for consistency
  const eventsWithType = (allEvents || []).map((event) => ({
    ...event,
    type: "event",
  }));
  const restaurantOpeningsWithType = (allRestaurantOpenings || []).map(
    (item) => ({ ...item, type: "restaurant" })
  );
  const attractionsWithType = (allAttractions || []).map((item) => ({
    ...item,
    type: "attraction",
  }));
  const playgroundsWithType = (allPlaygrounds || []).map((item) => ({
    ...item,
    type: "playground",
  }));

  // Apply filters to each data type
  const events = applyFilters(eventsWithType, "event");
  const restaurantOpenings = applyFilters(
    restaurantOpeningsWithType,
    "restaurant",
    "opening_date"
  );
  const attractions = applyFilters(attractionsWithType, "attraction");
  const playgrounds = applyFilters(playgroundsWithType, "playground");

  const formatDate = (date: string | Date) => {
    try {
      return format(new Date(date), "MMM d, yyyy");
    } catch {
      return "TBA";
    }
  };

  const isLoading =
    eventsLoading ||
    restaurantsLoading ||
    attractionsLoading ||
    playgroundsLoading;

  if (isLoading) {
    return (
      <section className="py-8 md:py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-mobile-title md:text-3xl font-bold text-foreground mb-3 md:mb-4">
              What's Happening in Des Moines
            </h2>
            <p className="text-mobile-body md:text-lg text-muted-foreground">
              Events, new restaurants, attractions, and family activities all in one place
            </p>
          </div>
          <DashboardSkeleton />
        </div>
      </section>
    );
  }

  const allItems = [
    ...events.map((event) => ({ ...event, type: "event", icon: Calendar })),
    ...restaurantOpenings.map((opening) => ({
      ...opening,
      type: "restaurant",
      icon: Utensils,
    })),
    ...attractions.map((attraction) => ({
      ...attraction,
      type: "attraction",
      icon: Palette,
    })),
    ...playgrounds.map((playground) => ({
      ...playground,
      type: "playground",
      icon: TreePine,
    })),
  ];

  // Pagination logic
  const getItemsForTab = (tabItems: DashboardItem[]) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return tabItems.slice(startIndex, endIndex);
  };

  const getTotalPages = (totalItems: number) => {
    return Math.ceil(totalItems / itemsPerPage);
  };

  const getCurrentTabItems = () => {
    switch (activeTab) {
      case "event":
        return events;
      case "restaurant":
        return restaurantOpenings;
      case "attraction":
        return attractions;
      case "playground":
        return playgrounds;
      default:
        return allItems;
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
                href="javascript:void(0)"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage > 1) setCurrentPage(currentPage - 1);
                }}
                className={
                  currentPage <= 1 ? "pointer-events-none opacity-50" : ""
                }
              />
            </PaginationItem>

            {[...Array(totalPages)].map((_, index) => {
              const page = index + 1;
              const showPage =
                page === 1 ||
                page === totalPages ||
                (page >= currentPage - 1 && page <= currentPage + 1);

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
                    href="javascript:void(0)"
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
                href="javascript:void(0)"
                onClick={(e) => {
                  e.preventDefault();
                  if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                }}
                className={
                  currentPage >= totalPages
                    ? "pointer-events-none opacity-50"
                    : ""
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "event":
        return "bg-[#DC143C] text-white";
      case "restaurant":
        return "bg-orange-500 text-white";
      case "attraction":
        return "bg-purple-500 text-white";
      case "playground":
        return "bg-green-500 text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // Generate filter description for display
  const getFilterDescription = () => {
    const parts: string[] = [];
    if (filters?.query?.trim()) {
      parts.push(`"${filters.query}"`);
    }
    if (filters?.subcategory?.trim()) {
      parts.push(filters.subcategory);
    }
    if (filters?.location && filters.location !== "any-location") {
      const locationLabels: Record<string, string> = {
        downtown: "Downtown",
        "west-des-moines": "West Des Moines",
        ankeny: "Ankeny",
        urbandale: "Urbandale",
        clive: "Clive",
      };
      parts.push(locationLabels[filters.location] || filters.location);
    }
    if (filters?.dateFilter?.preset) {
      const presetLabels: Record<string, string> = {
        today: "Today",
        tomorrow: "Tomorrow",
        "this-week": "This Week",
        "this-weekend": "This Weekend",
        "next-week": "Next Week",
      };
      parts.push(presetLabels[filters.dateFilter.preset] || filters.dateFilter.preset);
    }
    if (filters?.priceRange && filters.priceRange !== "any-price") {
      const priceLabels: Record<string, string> = {
        free: "Free",
        "under-25": "Under $25",
        "25-50": "$25-$50",
        "50-100": "$50-$100",
        "over-100": "Over $100",
      };
      parts.push(priceLabels[filters.priceRange] || filters.priceRange);
    }
    return parts.join(" • ");
  };

  // Render search results summary
  const renderSearchSummary = () => {
    if (!hasActiveFilters) return null;

    const totalResults = currentTabItems.length;
    const filterDesc = getFilterDescription();

    return (
      <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <div>
              <span className="font-medium text-foreground">
                {totalResults} result{totalResults !== 1 ? 's' : ''} found
              </span>
              {filterDesc && (
                <span className="text-muted-foreground ml-2">
                  for {filterDesc}
                </span>
              )}
            </div>
          </div>
          {onClearFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearFilters}
              className="flex items-center gap-1"
            >
              <X className="h-4 w-4" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Render empty state when no results
  const renderEmptyState = () => {
    if (currentTabItems.length > 0) return null;

    return (
      <div className="text-center py-12 px-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          No results found
        </h3>
        <p className="text-muted-foreground mb-4 max-w-md mx-auto">
          {hasActiveFilters
            ? `We couldn't find anything matching your search. Try adjusting your filters or search terms.`
            : `No items available in this category right now.`}
        </p>
        {hasActiveFilters && onClearFilters && (
          <Button onClick={onClearFilters} variant="outline">
            <X className="h-4 w-4 mr-2" />
            Clear All Filters
          </Button>
        )}
      </div>
    );
  };

  // Generate a URL-friendly slug from a name
  const createSlug = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const renderCard = (item: DashboardItem) => {
    // Ensure icon exists, provide default based on type if missing
    const Icon =
      item.icon ||
      (item.type === "event"
        ? Calendar
        : item.type === "restaurant"
        ? Utensils
        : item.type === "attraction"
        ? Palette
        : item.type === "playground"
        ? TreePine
        : Calendar);

    const handleCardClick = () => {
      // Track view event
      trackEvent({
        eventType: "view",
        contentType: getItemType(item),
        contentId: item.id,
      });

      if (item.type === "event" && onViewEventDetails) {
        onViewEventDetails(item as Event);
      } else if (item.type === "restaurant") {
        const slug = createSlug(item.title || item.name || item.id);
        navigate(`/restaurants/${slug}`);
      } else if (item.type === "attraction") {
        const slug = createSlug(item.title || item.name || item.id);
        navigate(`/attractions/${slug}`);
      } else if (item.type === "playground") {
        const slug = createSlug(item.title || item.name || item.id);
        navigate(`/playgrounds/${slug}`);
      }
    };

    const handleLinkClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      // Track click event
      trackEvent({
        eventType: "click",
        contentType: getItemType(item),
        contentId: item.id,
      });
    };

    return (
      <Card
        key={`${item.type}-${item.id}`}
        className="hover:shadow-lg transition-shadow cursor-pointer border border-border/60 shadow-sm bg-card"
        onClick={handleCardClick}
      >
        <CardHeader className="pb-3 px-4 py-4 md:px-6">
          <div className="flex items-center justify-between mb-2">
            <Badge className={`${getTypeColor(item.type)} text-xs font-medium`}>
              <Icon className="h-3 w-3 mr-1 flex-shrink-0" />
              <span className="truncate capitalize">{item.type}</span>
            </Badge>
            {item.type === "event" && (
              <FavoriteButton
                eventId={item.id}
                size="icon"
                variant="ghost"
              />
            )}
          </div>
          <CardTitle className="text-base md:text-lg pr-2 leading-relaxed line-clamp-2">
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
                <span className="mobile-safe-text">
                  {formatDate(item.date)}
                </span>
              </div>
            )}
            {(item.opening_date || item.openingTimeframe) && (
              <div className="flex items-start text-mobile-caption text-muted-foreground">
                <Calendar className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                <span className="mobile-safe-text">
                  Opens:{" "}
                  {item.opening_date
                    ? formatDate(item.opening_date)
                    : item.openingTimeframe}
                </span>
              </div>
            )}
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.enhanced_description ||
                item.original_description ||
                item.description}
            </p>
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
            {item.source_url && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLinkClick(e);
                  openExternalUrl(item.source_url!);
                }}
                aria-label={`Learn more about ${item.title || item.name}`}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                <span aria-hidden="true">Learn More</span>
                <span className="sr-only"> about {item.title || item.name}</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <section ref={sectionRef} className="py-8 md:py-16 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="text-mobile-title md:text-3xl font-bold text-foreground mb-3 md:mb-4 mobile-safe-text">
            What's Happening in Des Moines
          </h2>
          <p className="text-mobile-body md:text-lg text-muted-foreground mobile-safe-text">
            Events, new restaurants, attractions, and family activities all in
            one place
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="w-full"
        >
          {/* Mobile-optimized scrollable tabs */}
          <div className="w-full overflow-x-auto mb-6 md:mb-8 -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="inline-flex w-max min-w-full justify-start h-auto p-1 gap-1 md:grid md:grid-cols-5 md:w-full md:gap-0">
              <TabsTrigger
                value="all"
                className="text-xs md:text-sm py-2.5 px-3 md:px-3 whitespace-nowrap flex-shrink-0 rounded-md"
              >
                All ({allItems.length})
              </TabsTrigger>
              <TabsTrigger
                value="event"
                className="text-xs md:text-sm py-2.5 px-3 md:px-3 whitespace-nowrap flex-shrink-0 rounded-md"
              >
                Events ({events.length})
              </TabsTrigger>
              <TabsTrigger
                value="restaurant"
                className="text-xs md:text-sm py-2.5 px-3 md:px-3 whitespace-nowrap flex-shrink-0 rounded-md"
              >
                Restaurants ({restaurantOpenings.length})
              </TabsTrigger>
              <TabsTrigger
                value="attraction"
                className="text-xs md:text-sm py-2.5 px-3 md:px-3 whitespace-nowrap flex-shrink-0 rounded-md"
              >
                Attractions ({attractions.length})
              </TabsTrigger>
              <TabsTrigger
                value="playground"
                className="text-xs md:text-sm py-2.5 px-3 md:px-3 whitespace-nowrap flex-shrink-0 rounded-md"
              >
                Playgrounds ({playgrounds.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Search results summary */}
          {renderSearchSummary()}

          <TabsContent value="all">
            {paginatedItems.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedItems.map(renderCard)}
                </div>
                {renderPagination()}
              </>
            ) : (
              renderEmptyState()
            )}
          </TabsContent>

          <TabsContent value="event">
            {paginatedItems.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedItems.map((event) =>
                    renderCard({ ...event, type: "event", icon: Calendar })
                  )}
                </div>
                {renderPagination()}
              </>
            ) : (
              renderEmptyState()
            )}
          </TabsContent>

          <TabsContent value="restaurant">
            {paginatedItems.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedItems.map((opening) =>
                    renderCard({ ...opening, type: "restaurant", icon: Utensils })
                  )}
                </div>
                {renderPagination()}
              </>
            ) : (
              renderEmptyState()
            )}
          </TabsContent>

          <TabsContent value="attraction">
            {paginatedItems.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedItems.map((attraction) =>
                    renderCard({ ...attraction, type: "attraction", icon: Palette })
                  )}
                </div>
                {renderPagination()}
              </>
            ) : (
              renderEmptyState()
            )}
          </TabsContent>

          <TabsContent value="playground">
            {paginatedItems.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedItems.map((playground) =>
                    renderCard({
                      ...playground,
                      type: "playground",
                      icon: TreePine,
                    })
                  )}
                </div>
                {renderPagination()}
              </>
            ) : (
              renderEmptyState()
            )}
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
