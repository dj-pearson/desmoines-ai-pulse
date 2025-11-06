import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, MapPin, Tag, Search, Filter, List, Map, X, SlidersHorizontal, SearchX, Sparkles } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CardsGridSkeleton,
  LoadingSpinner,
} from "@/components/ui/loading-skeleton";
import { SocialEventCard } from "@/components/SocialEventCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { SEOEnhancedHead } from "@/components/SEOEnhancedHead";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import InteractiveDateSelector from "@/components/InteractiveDateSelector";
import { useToast } from "@/hooks/use-toast";
import {
  createEventSlugWithCentralTime,
  formatInCentralTime,
} from "@/lib/timezone";
import EventsMap from "@/components/EventsMap";

export default function EventsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [dateFilter, setDateFilter] = useState<{
    start?: Date;
    end?: Date;
    mode: "single" | "range" | "preset";
    preset?: string;
  } | null>(null);
  const [location, setLocation] = useState("any-location");
  const [priceRange, setPriceRange] = useState("any-price");
  const [showFilters, setShowFilters] = useState(!isMobile); // Hide filters by default on mobile
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const { toast } = useToast();

  // Debounce search query to prevent excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: [
      "events",
      debouncedSearchQuery,
      selectedCategory,
      dateFilter,
      location,
      priceRange,
    ],
    queryFn: async () => {
      let query = supabase
        .from("events")
        .select("*")
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true });

      // Apply filters
      if (debouncedSearchQuery) {
        query = query.or(
          `title.ilike.%${debouncedSearchQuery}%,original_description.ilike.%${debouncedSearchQuery}%,enhanced_description.ilike.%${debouncedSearchQuery}%`
        );
      }

      if (selectedCategory && selectedCategory !== "all") {
        query = query.eq("category", selectedCategory);
      }

      if (dateFilter) {
        if (dateFilter.mode === "single" && dateFilter.start) {
          // For single date selection, filter by event_start_local date or fallback to legacy date field
          const centralDate = dateFilter.start.toISOString().split("T")[0];
          query = query.or(
            `event_start_local.gte.${centralDate}T00:00:00,event_start_local.lt.${centralDate}T24:00:00,and(date.eq.${centralDate},event_start_local.is.null)`
          );
        } else if (dateFilter.mode === "range" && dateFilter.start) {
          // For date range, show events within the range
          const startDate = dateFilter.start.toISOString().split("T")[0];
          query = query.gte("date", startDate);

          if (dateFilter.end) {
            const endDate = dateFilter.end.toISOString().split("T")[0];
            query = query.lte("date", endDate);
          }
        } else if (
          dateFilter.mode === "preset" &&
          dateFilter.preset &&
          dateFilter.preset !== "any-date"
        ) {
          // Handle preset date ranges
          const today = new Date();
          const tomorrow = new Date(today);
          tomorrow.setDate(today.getDate() + 1);

          switch (dateFilter.preset) {
            case "today":
              query = query.eq("date", today.toISOString().split("T")[0]);
              break;
            case "tomorrow":
              query = query.eq("date", tomorrow.toISOString().split("T")[0]);
              break;
            case "this-week":
              const endOfWeek = new Date(today);
              endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
              query = query
                .gte("date", today.toISOString().split("T")[0])
                .lte("date", endOfWeek.toISOString().split("T")[0]);
              break;
            case "this-weekend":
              const saturday = new Date(today);
              saturday.setDate(today.getDate() + (6 - today.getDay()));
              const sunday = new Date(saturday);
              sunday.setDate(saturday.getDate() + 1);
              query = query
                .gte("date", saturday.toISOString().split("T")[0])
                .lte("date", sunday.toISOString().split("T")[0]);
              break;
            case "next-week":
              const nextMonday = new Date(today);
              nextMonday.setDate(today.getDate() + (7 - today.getDay()) + 1);
              const nextSunday = new Date(nextMonday);
              nextSunday.setDate(nextMonday.getDate() + 6);
              query = query
                .gte("date", nextMonday.toISOString().split("T")[0])
                .lte("date", nextSunday.toISOString().split("T")[0]);
              break;
          }
        }
      }

      const { data, error } = await query;
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
        .gte("date", new Date().toISOString().split("T")[0]);

      if (error) throw error;
      const uniqueCategories = [
        ...new Set(data.map((event) => event.category)),
      ].filter(Boolean);
      return uniqueCategories.sort();
    },
  });

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setDateFilter(null);
    setLocation("any-location");
    setPriceRange("any-price");
    setShowMobileFilters(false);
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  };

  // Pull to refresh functionality
  const { elementRef: pullToRefreshRef, isPulling, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      await refetch();
      toast({
        title: "Events Refreshed",
        description: "Event list has been updated",
      });
    },
  });

  // Count active filters
  const activeFiltersCount = [
    searchQuery,
    selectedCategory !== "all",
    dateFilter !== null,
    location !== "any-location",
    priceRange !== "any-price",
  ].filter(Boolean).length;

  // SEO data
  const seoTitle = searchQuery
    ? `"${searchQuery}" Events in Des Moines`
    : selectedCategory && selectedCategory !== "all"
    ? `${selectedCategory} Events in Des Moines`
    : "Events in Des Moines - Upcoming Activities & Entertainment";

  const seoDescription = `Discover ${searchQuery ? `"${searchQuery}" ` : ""}${
    selectedCategory && selectedCategory !== "all"
      ? selectedCategory.toLowerCase() + " "
      : ""
  }events in Des Moines, Iowa. Find concerts, festivals, community gatherings, and entertainment activities happening now.`;

  const eventKeywords = [
    "Des Moines events",
    "Iowa events",
    "upcoming events",
    "things to do Des Moines",
    "entertainment",
    "concerts",
    "festivals",
    "community events",
    ...(selectedCategory && selectedCategory !== "all"
      ? [selectedCategory.toLowerCase()]
      : []),
    ...(searchQuery ? [searchQuery] : []),
  ];

  // AI-Optimized Events List Schema with Enhanced Local SEO
  const eventsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": "https://desmoinesinsider.com/events#eventlist",
    name: "Des Moines Events - Local Activities & Entertainment Guide",
    description: `${seoDescription} Find the best events happening in Des Moines, Iowa and surrounding areas.`,
    numberOfItems: events?.length || 0,
    url: "https://desmoinesinsider.com/events",
    mainEntity: {
      "@type": "WebPage",
      "@id": "https://desmoinesinsider.com/events",
      name: "Des Moines Events Calendar",
      url: "https://desmoinesinsider.com/events",
      about: {
        "@type": "City",
        name: "Des Moines",
        sameAs: "https://en.wikipedia.org/wiki/Des_Moines,_Iowa",
      },
    },
    provider: {
      "@type": "LocalBusiness",
      name: "Des Moines Insider",
      url: "https://desmoinesinsider.com",
      areaServed: {
        "@type": "City",
        name: "Des Moines",
        addressRegion: "Iowa",
      },
    },
    itemListElement:
      events?.slice(0, 30).map((event, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Event",
          "@id": `https://desmoinesinsider.com/events/${createEventSlugWithCentralTime(
            event.title,
            event
          )}`,
          name: event.title,
          description:
            event.enhanced_description ||
            event.original_description ||
            `${event.title} - ${event.category} event in Des Moines, Iowa`,
          startDate: event.event_start_utc || event.date,
          endDate: event.event_start_utc
            ? new Date(
                new Date(event.event_start_utc).getTime() + 3 * 60 * 60 * 1000
              ).toISOString()
            : new Date(
                new Date(event.date).getTime() + 3 * 60 * 60 * 1000
              ).toISOString(),
          location: {
            "@type": "Place",
            name: event.venue || event.location || "Des Moines Area",
            address: {
              "@type": "PostalAddress",
              streetAddress: event.location || "",
              addressLocality: event.city || "Des Moines",
              addressRegion: "Iowa",
              addressCountry: "US",
              postalCode: event.city === "Des Moines" ? "50309" : undefined,
            },
            ...(event.latitude &&
              event.longitude && {
                geo: {
                  "@type": "GeoCoordinates",
                  latitude: event.latitude,
                  longitude: event.longitude,
                },
              }),
          },
          image: [
            event.image_url ||
              "https://desmoinesinsider.com/default-event-image.jpg",
          ],
          url: `https://desmoinesinsider.com/events/${createEventSlugWithCentralTime(
            event.title,
            event
          )}`,
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          organizer: {
            "@type": "Organization",
            "@id": "https://desmoinesinsider.com/#organization",
            name: "Des Moines Insider",
            url: "https://desmoinesinsider.com",
            logo: {
              "@type": "ImageObject",
              url: "https://desmoinesinsider.com/DMI-Logo.png",
            },
          },
          offers:
            event.price && event.price.toLowerCase() !== "free"
              ? {
                  "@type": "Offer",
                  price: event.price.replace(/[^0-9.]/g, "") || "0",
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                  category: event.category,
                }
              : {
                  "@type": "Offer",
                  price: "0",
                  priceCurrency: "USD",
                  availability: "https://schema.org/InStock",
                },
          keywords: [
            event.category,
            "Des Moines events",
            "Iowa events",
            "things to do Des Moines",
            event.venue || "",
            "Central Iowa activities",
          ]
            .filter(Boolean)
            .join(", "),
          about: [
            {
              "@type": "Thing",
              name: event.category,
            },
            {
              "@type": "Place",
              name: "Des Moines, Iowa",
            },
          ],
          inLanguage: "en-US",
          isAccessibleForFree:
            !event.price || event.price.toLowerCase().includes("free"),
          audience: {
            "@type": "Audience",
            audienceType: "local residents and visitors",
            geographicArea: {
              "@type": "AdministrativeArea",
              name: "Greater Des Moines Area",
            },
          },
        },
      })) || [],
  };

  if (isLoading) {
    return (
      <>
        <SEOHead
          title="Loading Events..."
          description="Loading upcoming events in Des Moines"
          type="website"
        />
        <div className="min-h-screen bg-background">
          <Header />

          {/* Hero Section Skeleton */}
          <section className="relative bg-gradient-to-br from-[#2D1B69] via-[#8B0000] to-[#DC143C] overflow-hidden min-h-[400px]">
            <div className="absolute inset-0 bg-black/20"></div>
            <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
              <div className="animate-pulse space-y-4">
                <div className="h-12 md:h-16 bg-white/20 rounded w-3/4 mx-auto"></div>
                <div className="h-6 md:h-8 bg-white/20 rounded w-1/2 mx-auto"></div>
                <div className="h-12 bg-white/20 rounded w-full max-w-2xl mx-auto mt-8"></div>
              </div>
            </div>
          </section>

          <div className="container mx-auto px-4 py-8">
            <CardsGridSkeleton
              count={9}
              className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
            />
          </div>
          <Footer />
        </div>
      </>
    );
  }

  return (
    <>
      <SEOEnhancedHead
        title={seoTitle}
        description={seoDescription}
        url="https://desmoinesinsider.com/events"
        type="website"
        structuredData={eventsSchema}
      />

      <div className="min-h-screen bg-background">
        <Header />

        {/* Hero Section with DMI Brand Colors */}
        <section className="relative bg-gradient-to-br from-[#2D1B69] via-[#8B0000] to-[#DC143C] overflow-hidden min-h-[400px]">
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
              Discover Des Moines Events
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
              Find concerts, festivals, community gatherings, and entertainment
              activities happening now
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="search"
                    placeholder={isMobile ? "Search events..." : "Search for events, venues, or keywords..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`${isMobile ? 'search-mobile pl-12' : 'text-base pl-12 bg-white/95 backdrop-blur border-0 focus:ring-2 focus:ring-white h-12'}`}
                    aria-label="Search events"
                    role="searchbox"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-white/20"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isMobile ? (
                    <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
                      <SheetTrigger asChild>
                        <Button
                          variant="secondary"
                          className="bg-white/20 hover:bg-white/30 text-white border-white/30 btn-mobile flex-1 relative"
                        >
                          <SlidersHorizontal className="h-4 w-4 mr-2" />
                          Filters
                          {activeFiltersCount > 0 && (
                            <Badge className="ml-2 bg-primary text-primary-foreground h-5 w-5 p-0 flex items-center justify-center text-xs">
                              {activeFiltersCount}
                            </Badge>
                          )}
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="bottom" className="h-[85vh] sheet-mobile">
                        <SheetHeader>
                          <SheetTitle className="text-xl">Filter Events</SheetTitle>
                        </SheetHeader>
                        <div className="sheet-handle" />
                        <div className="mt-6 space-y-6 overflow-y-auto max-h-[calc(85vh-120px)] pb-safe">
                          {/* Mobile Filter Content - Same as desktop */}
                          <div className="space-y-6">
                            {/* Category Filter */}
                            <div className="space-y-2">
                              <label className="text-base font-medium">Category</label>
                              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger className="input-mobile">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Categories</SelectItem>
                                  {categories?.map((category) => (
                                    <SelectItem key={category} value={category}>
                                      {category}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Date Filter */}
                            <div className="space-y-2">
                              <label className="text-base font-medium">Date</label>
                              <InteractiveDateSelector onDateChange={setDateFilter} className="w-full" />
                            </div>

                            {/* Location Filter */}
                            <div className="space-y-2">
                              <label className="text-base font-medium">Location</label>
                              <Select value={location} onValueChange={setLocation}>
                                <SelectTrigger className="input-mobile">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="any-location">Any location</SelectItem>
                                  <SelectItem value="downtown">Downtown</SelectItem>
                                  <SelectItem value="west-des-moines">West Des Moines</SelectItem>
                                  <SelectItem value="ankeny">Ankeny</SelectItem>
                                  <SelectItem value="urbandale">Urbandale</SelectItem>
                                  <SelectItem value="clive">Clive</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Price Filter */}
                            <div className="space-y-2">
                              <label className="text-base font-medium">Price Range</label>
                              <Select value={priceRange} onValueChange={setPriceRange}>
                                <SelectTrigger className="input-mobile">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="any-price">Any price</SelectItem>
                                  <SelectItem value="free">Free</SelectItem>
                                  <SelectItem value="under-25">Under $25</SelectItem>
                                  <SelectItem value="25-50">$25 - $50</SelectItem>
                                  <SelectItem value="50-100">$50 - $100</SelectItem>
                                  <SelectItem value="over-100">Over $100</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Mobile Filter Actions */}
                          <div className="bottom-actions-mobile flex gap-3">
                            <Button variant="outline" onClick={handleClearFilters} className="flex-1 btn-mobile">
                              Clear All
                            </Button>
                            <Button onClick={() => setShowMobileFilters(false)} className="flex-1 btn-mobile">
                              Show {events?.length || 0} Events
                            </Button>
                          </div>
                        </div>
                      </SheetContent>
                    </Sheet>
                  ) : (
                    <Button
                      onClick={() => setShowFilters(!showFilters)}
                      variant="secondary"
                      className="bg-white/20 hover:bg-white/30 text-white border-white/30 h-12"
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      Filters
                    </Button>
                  )}
                  <div className="flex items-center rounded-md bg-white/20 p-0.5">
                    <Button
                      onClick={() => setViewMode("list")}
                      variant={viewMode === "list" ? "secondary" : "ghost"}
                      size="icon"
                      className={`${isMobile ? 'touch-feedback' : ''} ${
                        viewMode === "list"
                          ? "bg-white/30 text-white h-11"
                          : "text-white/70 hover:bg-white/30 hover:text-white h-11"
                      }`}
                      aria-label="Switch to list view"
                      title="Switch to list view"
                    >
                      <List className="h-5 w-5" />
                    </Button>
                    <Button
                      onClick={() => setViewMode("map")}
                      variant={viewMode === "map" ? "secondary" : "ghost"}
                      size="icon"
                      className={`${isMobile ? 'touch-feedback' : ''} ${
                        viewMode === "map"
                          ? "bg-white/30 text-white h-11"
                          : "text-white/70 hover:bg-white/30 hover:text-white h-11"
                      }`}
                      aria-label="Switch to map view"
                      title="Switch to map view"
                    >
                      <Map className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <main ref={pullToRefreshRef} className="container mx-auto px-4 py-8 ptr-content relative">
          {/* Pull to Refresh Indicator */}
          {isMobile && (isPulling || isRefreshing) && (
            <div
              className="ptr-indicator"
              style={{
                transform: `translateY(${Math.min(pullDistance, 80)}px)`,
              }}
            >
              <div className="bg-background rounded-full p-3 shadow-lg">
                {isRefreshing ? (
                  <LoadingSpinner className="h-6 w-6" />
                ) : (
                  <svg
                    className="h-6 w-6 text-primary"
                    style={{ transform: `rotate(${pullDistance * 2}deg)` }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                )}
              </div>
            </div>
          )}

          {/* Filters Section */}
          {showFilters && !isMobile && (
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Category Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Category
                  </label>
                  <Select
                    value={selectedCategory}
                    onValueChange={setSelectedCategory}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories?.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Date
                  </label>
                  <InteractiveDateSelector
                    onDateChange={setDateFilter}
                    className="w-full"
                  />
                </div>

                {/* Location Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Location
                  </label>
                  <Select value={location} onValueChange={setLocation}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any-location">Any location</SelectItem>
                      <SelectItem value="downtown">Downtown</SelectItem>
                      <SelectItem value="west-des-moines">
                        West Des Moines
                      </SelectItem>
                      <SelectItem value="ankeny">Ankeny</SelectItem>
                      <SelectItem value="urbandale">Urbandale</SelectItem>
                      <SelectItem value="clive">Clive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Price Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Price Range
                  </label>
                  <Select value={priceRange} onValueChange={setPriceRange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any-price">Any price</SelectItem>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="under-25">Under $25</SelectItem>
                      <SelectItem value="25-50">$25 - $50</SelectItem>
                      <SelectItem value="50-100">$50 - $100</SelectItem>
                      <SelectItem value="over-100">Over $100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={handleClearFilters}>
                  Clear Filters
                </Button>
                <div className="text-sm text-gray-500 min-w-[120px] text-right">
                  {isLoading
                    ? "Loading..."
                    : `${events?.length || 0} events found`}
                </div>
              </div>
            </div>
          )}

          {/* Results Header (single instance) */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">
              {searchQuery
                ? `Search results for "${searchQuery}"`
                : selectedCategory && selectedCategory !== "all"
                ? `${selectedCategory} Events`
                : "Upcoming Events"}
            </h2>
            <div className="text-sm text-gray-500 min-w-[120px] text-right">
              {isLoading ? "Loading..." : `${events?.length || 0} events`}
            </div>
          </div>

          {isLoading && <CardsGridSkeleton count={6} />}

          {!isLoading && viewMode === "map" ? (
            <EventsMap events={events || []} />
          ) : !isLoading ? (
            <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'md:grid-cols-2 lg:grid-cols-3'} ${isMobile ? 'mobile-grid' : 'gap-6'}`}>
              {events?.map((event) => (
                <SocialEventCard
                  key={event.id}
                  event={event}
                  onViewDetails={() => {
                    // Navigate to event details using React Router
                    navigate(
                      `/events/${createEventSlugWithCentralTime(
                        event.title,
                        event
                      )}`
                    );
                  }}
                />
              ))}
            </div>
          ) : null}

          {/* No Results State */}
          {!isLoading && (!events || events.length === 0) && (
            <EmptyState
              icon={searchQuery || selectedCategory !== "all" || dateFilter || location !== "any-location" || priceRange !== "any-price" ? SearchX : Calendar}
              title={searchQuery ? `No results for "${searchQuery}"` : "No events found"}
              description={
                searchQuery || selectedCategory !== "all" || dateFilter || location !== "any-location" || priceRange !== "any-price"
                  ? "Try adjusting your search criteria or filters to find more events"
                  : "Check back soon for upcoming events! New events are added regularly."
              }
              actions={
                (searchQuery || selectedCategory !== "all" || dateFilter || location !== "any-location" || priceRange !== "any-price")
                  ? [
                      {
                        label: "Clear All Filters",
                        onClick: handleClearFilters,
                        variant: "outline",
                        icon: X,
                      },
                      {
                        label: "Browse All Events",
                        onClick: () => {
                          handleClearFilters();
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        },
                        icon: Sparkles,
                      },
                    ]
                  : undefined
              }
              compact={isMobile}
              className={isMobile ? 'section-mobile' : ''}
            />
          )}
        </main>

        <Footer />
      </div>
    </>
  );
}
