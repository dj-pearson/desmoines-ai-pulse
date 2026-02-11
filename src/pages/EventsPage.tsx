import React, { useState, useEffect, lazy, Suspense, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Calendar,
  MapPin,
  Tag,
  Search,
  Filter,
  List,
  Map,
  X,
  SlidersHorizontal,
  SearchX,
  Sparkles,
  Navigation,
  AlertCircle,
  RefreshCw,
  Clock,
  Music,
  UtensilsCrossed,
  Palette,
  TreePine,
  Users,
  Ticket,
  ChevronDown,
  Star,
} from "lucide-react";
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
import InteractiveDateSelector from "@/components/InteractiveDateSelector";
import { useToast } from "@/hooks/use-toast";
import { FAQSection } from "@/components/FAQSection";
import {
  createEventSlugWithCentralTime,
  formatInCentralTime,
} from "@/lib/timezone";
import { useBatchEventSocial } from "@/hooks/useBatchEventSocial";
import { BackToTop } from "@/components/BackToTop";
import { useFilterKeyboardShortcuts } from "@/hooks/useFilterKeyboardShortcuts";
import { SmartFilterChips } from "@/components/SmartFilters";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";

// Lazy load heavy map component (includes Leaflet library ~150KB)
const EventsMap = lazy(() => import("@/components/EventsMap"));

function parsePriceFromText(priceText: string | null): number | null {
  if (!priceText) return null;
  const lowerPrice = priceText.toLowerCase().trim();
  if (lowerPrice.includes('free') || lowerPrice === '$0' || lowerPrice === '0') return 0;
  const numbers = priceText.match(/\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return null;
  const parsedNumbers = numbers.map(n => parseFloat(n)).filter(n => !isNaN(n) && n >= 0);
  if (parsedNumbers.length === 0) return null;
  if (parsedNumbers.length > 1) return parsedNumbers.reduce((a, b) => a + b, 0) / parsedNumbers.length;
  return parsedNumbers[0];
}

function filterEventsByPrice(events: any[], priceRange: string): any[] {
  if (!priceRange || priceRange === 'any-price') return events;
  return events.filter(event => {
    const price = parsePriceFromText(event.price);
    switch (priceRange) {
      case 'free': return price === null || price === 0;
      case 'under-25': return price !== null && price > 0 && price < 25;
      case '25-50': return price !== null && price >= 25 && price <= 50;
      case '50-100': return price !== null && price > 50 && price <= 100;
      case 'over-100': return price !== null && price > 100;
      default: return true;
    }
  });
}

// Quick date presets for prominent display
const DATE_PRESETS = [
  { key: "today", label: "Today", icon: Clock },
  { key: "tomorrow", label: "Tomorrow", icon: Calendar },
  { key: "this-weekend", label: "This Weekend", icon: Star },
  { key: "this-week", label: "This Week", icon: Calendar },
] as const;

// Category icons for filter pills
const CATEGORY_ICONS: Record<string, any> = {
  "Music": Music,
  "Food": UtensilsCrossed,
  "Food & Drink": UtensilsCrossed,
  "Art": Palette,
  "Art & Culture": Palette,
  "Outdoor": TreePine,
  "Family": Users,
  "Sports": Star,
};

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
  const [activeDatePreset, setActiveDatePreset] = useState<string | null>(null);
  const [location, setLocation] = useState("any-location");
  const [priceRange, setPriceRange] = useState("any-price");
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [page, setPage] = useState(1);
  const EVENTS_PER_PAGE = 30;
  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Geolocation state for "Near Me" feature
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isNearMeActive, setIsNearMeActive] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setDateFilter(null);
    setActiveDatePreset(null);
    setLocation("any-location");
    setPriceRange("any-price");
    setIsNearMeActive(false);
    setShowMobileFilters(false);
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  };

  useFilterKeyboardShortcuts({
    enabled: !isMobile,
    onFocusSearch: () => {
      searchInputRef.current?.focus();
      toast({
        title: "Keyboard Shortcut",
        description: "Press 'f' to focus search, 'Esc' to clear filters",
        duration: 2000,
      });
    },
    onClearFilters: handleClearFilters,
  });

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Quick date preset handler
  const handleDatePreset = (preset: string) => {
    if (activeDatePreset === preset) {
      setActiveDatePreset(null);
      setDateFilter(null);
      return;
    }
    setActiveDatePreset(preset);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    switch (preset) {
      case "today":
        setDateFilter({ mode: "preset", preset: "today", start: today, end: today });
        break;
      case "tomorrow":
        setDateFilter({ mode: "preset", preset: "tomorrow", start: tomorrow, end: tomorrow });
        break;
      case "this-weekend": {
        const saturday = new Date(today);
        saturday.setDate(today.getDate() + (6 - today.getDay()));
        const sunday = new Date(saturday);
        sunday.setDate(saturday.getDate() + 1);
        setDateFilter({ mode: "preset", preset: "this-weekend", start: saturday, end: sunday });
        break;
      }
      case "this-week": {
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
        setDateFilter({ mode: "preset", preset: "this-week", start: today, end: endOfWeek });
        break;
      }
    }
  };

  const { data: eventsData, isLoading, error, refetch } = useQuery({
    queryKey: [
      "events",
      debouncedSearchQuery,
      selectedCategory,
      dateFilter,
      location,
      priceRange,
      page,
      isNearMeActive,
      userLocation,
    ],
    queryFn: async () => {
      if (isNearMeActive && userLocation) {
        const { data, error } = await supabase.rpc('search_events_near_location', {
          user_lat: userLocation.latitude,
          user_lon: userLocation.longitude,
          radius_meters: 48280,
          search_limit: EVENTS_PER_PAGE
        });
        if (error) throw error;
        let filteredData = data || [];
        if (selectedCategory && selectedCategory !== "all") {
          filteredData = filteredData.filter((e) => e.category === selectedCategory);
        }
        if (debouncedSearchQuery) {
          const searchLower = debouncedSearchQuery.toLowerCase();
          filteredData = filteredData.filter((e) =>
            e.title?.toLowerCase().includes(searchLower) ||
            e.enhanced_description?.toLowerCase().includes(searchLower) ||
            e.venue?.toLowerCase().includes(searchLower)
          );
        }
        if (priceRange && priceRange !== "any-price") {
          if (priceRange === "free") {
            filteredData = filteredData.filter((e) =>
              !e.price || e.price.toLowerCase().includes('free') || e.price.includes('$0')
            );
          } else {
            filteredData = filteredData.filter((e) =>
              e.price && !e.price.toLowerCase().includes('free')
            );
          }
        }
        return { events: filteredData, totalCount: filteredData.length };
      }

      let query = supabase
        .from("events")
        .select("id, title, date, location, category, image_url, price, venue, is_featured, event_start_utc, event_start_local, city, latitude, longitude, enhanced_description, original_description", { count: 'exact' })
        .gte("date", new Date().toISOString().split("T")[0])
        .order("date", { ascending: true })
        .range((page - 1) * EVENTS_PER_PAGE, page * EVENTS_PER_PAGE - 1);

      if (debouncedSearchQuery) {
        query = query.textSearch('search_vector', debouncedSearchQuery, {
          type: 'websearch',
          config: 'english'
        });
      }

      if (selectedCategory && selectedCategory !== "all") {
        query = query.eq("category", selectedCategory);
      }

      if (dateFilter) {
        if (dateFilter.mode === "single" && dateFilter.start) {
          const centralDate = dateFilter.start.toISOString().split("T")[0];
          query = query.or(
            `event_start_local.gte.${centralDate}T00:00:00,event_start_local.lt.${centralDate}T24:00:00,and(date.eq.${centralDate},event_start_local.is.null)`
          );
        } else if (dateFilter.mode === "range" && dateFilter.start) {
          const startDate = dateFilter.start.toISOString().split("T")[0];
          query = query.gte("date", startDate);
          if (dateFilter.end) {
            const endDate = dateFilter.end.toISOString().split("T")[0];
            query = query.lte("date", endDate);
          }
        } else if (dateFilter.mode === "preset" && dateFilter.preset && dateFilter.preset !== "any-date") {
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
            case "this-week": {
              const endOfWeek = new Date(today);
              endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
              query = query.gte("date", today.toISOString().split("T")[0]).lte("date", endOfWeek.toISOString().split("T")[0]);
              break;
            }
            case "this-weekend": {
              const saturday = new Date(today);
              saturday.setDate(today.getDate() + (6 - today.getDay()));
              const sunday = new Date(saturday);
              sunday.setDate(saturday.getDate() + 1);
              query = query.gte("date", saturday.toISOString().split("T")[0]).lte("date", sunday.toISOString().split("T")[0]);
              break;
            }
            case "next-week": {
              const nextMonday = new Date(today);
              nextMonday.setDate(today.getDate() + (7 - today.getDay()) + 1);
              const nextSunday = new Date(nextMonday);
              nextSunday.setDate(nextMonday.getDate() + 6);
              query = query.gte("date", nextMonday.toISOString().split("T")[0]).lte("date", nextSunday.toISOString().split("T")[0]);
              break;
            }
            case "next_7_days": {
              const next7 = new Date(today);
              next7.setDate(today.getDate() + 7);
              query = query.gte("date", today.toISOString().split("T")[0]).lte("date", next7.toISOString().split("T")[0]);
              break;
            }
          }
        }
      }

      if (location && location !== "any-location") {
        const locationMap: Record<string, string> = {
          'downtown': 'Des Moines',
          'west-des-moines': 'West Des Moines',
          'ankeny': 'Ankeny',
          'urbandale': 'Urbandale',
          'clive': 'Clive'
        };
        const cityName = locationMap[location];
        if (cityName) {
          query = query.or(`city.ilike.%${cityName}%,location.ilike.%${cityName}%`);
        }
      }

      if (priceRange && priceRange !== "any-price") {
        if (priceRange === "free") {
          query = query.or("price.is.null,price.ilike.%free%,price.ilike.%$0%");
        }
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { events: data || [], totalCount: count || 0 };
    },
    staleTime: 5 * 60 * 1000,
  });

  const rawEvents = eventsData?.events || [];
  const events = filterEventsByPrice(rawEvents, priceRange);
  const totalCount = eventsData?.totalCount || 0;
  const hasMore = totalCount > page * EVENTS_PER_PAGE;

  useEffect(() => { setPage(1); }, [debouncedSearchQuery, selectedCategory, dateFilter, location, priceRange]);

  const { data: categories } = useQuery({
    queryKey: ["event-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_event_categories');
      if (error) throw error;
      return (data || []).map((row: { category: string }) => row.category);
    },
    staleTime: 30 * 60 * 1000,
  });

  const eventIds = events?.map(e => e.id) || [];
  const { data: batchSocialData } = useBatchEventSocial(eventIds);

  const handleNearMe = () => {
    if (isNearMeActive) {
      setIsNearMeActive(false);
      setUserLocation(null);
      toast({ title: "Location Filter Removed", description: "Showing all events" });
      return;
    }
    if (!navigator.geolocation) {
      toast({ title: "Geolocation Not Supported", description: "Your browser doesn't support location services", variant: "destructive" });
      return;
    }
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setIsNearMeActive(true);
        setIsLoadingLocation(false);
        toast({ title: "Location Found", description: "Showing events near you (within 30 miles)" });
      },
      (error) => {
        setIsLoadingLocation(false);
        let errorMessage = "Unable to get your location";
        if (error.code === error.PERMISSION_DENIED) errorMessage = "Location permission denied. Please enable location in your browser settings.";
        else if (error.code === error.POSITION_UNAVAILABLE) errorMessage = "Location information unavailable";
        else if (error.code === error.TIMEOUT) errorMessage = "Location request timed out";
        toast({ title: "Location Error", description: errorMessage, variant: "destructive" });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const { elementRef: pullToRefreshRef, isPulling, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      await refetch();
      toast({ title: "Events Refreshed", description: "Event list has been updated" });
    },
  });

  const activeFiltersCount = [
    searchQuery,
    selectedCategory !== "all",
    dateFilter !== null,
    location !== "any-location",
    priceRange !== "any-price",
    isNearMeActive,
  ].filter(Boolean).length;

  // SEO
  const seoTitle = searchQuery
    ? `"${searchQuery}" Events in Des Moines, Iowa`
    : selectedCategory && selectedCategory !== "all"
    ? `${selectedCategory} Events in Des Moines, Iowa - Upcoming ${selectedCategory}`
    : "Events in Des Moines, Iowa - Concerts, Festivals & Things To Do";

  const seoDescription = `Discover ${searchQuery ? `"${searchQuery}" ` : ""}${
    selectedCategory && selectedCategory !== "all" ? selectedCategory.toLowerCase() + " " : ""
  }events in Des Moines, Iowa. Browse ${events?.length || 'upcoming'} concerts, festivals, food events, family activities, and community gatherings. Updated daily with the best things to do in Des Moines.`;

  const eventsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${BRAND.baseUrl}/events#eventlist`,
    name: "Des Moines Events - Local Activities & Entertainment Guide",
    description: seoDescription,
    numberOfItems: events?.length || 0,
    url: `${BRAND.baseUrl}/events`,
    mainEntity: {
      "@type": "WebPage",
      "@id": `${BRAND.baseUrl}/events`,
      name: "Des Moines Events Calendar",
      url: `${BRAND.baseUrl}/events`,
      about: { "@type": "City", name: "Des Moines", sameAs: "https://en.wikipedia.org/wiki/Des_Moines,_Iowa" },
    },
    provider: {
      "@type": "LocalBusiness",
      name: BRAND.name,
      url: BRAND.baseUrl,
      areaServed: { "@type": "City", name: "Des Moines", addressRegion: "Iowa" },
    },
    itemListElement: events?.slice(0, 30).map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Event",
        "@id": `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`,
        name: event.title,
        description: event.enhanced_description || event.original_description || `${event.title} - ${event.category} event in Des Moines, Iowa`,
        startDate: event.event_start_utc || event.date,
        location: {
          "@type": "Place",
          name: event.venue || event.location || "Des Moines Area",
          address: {
            "@type": "PostalAddress",
            addressLocality: event.city || "Des Moines",
            addressRegion: "Iowa",
            addressCountry: "US",
          },
          ...(event.latitude && event.longitude && {
            geo: { "@type": "GeoCoordinates", latitude: event.latitude, longitude: event.longitude },
          }),
        },
        image: [event.image_url || `${BRAND.baseUrl}/default-event-image.jpg`],
        url: `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        offers: event.price && event.price.toLowerCase() !== "free"
          ? { "@type": "Offer", price: event.price.replace(/[^0-9.]/g, "") || "0", priceCurrency: "USD", availability: "https://schema.org/InStock" }
          : { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
        isAccessibleForFree: !event.price || event.price.toLowerCase().includes("free"),
      },
    })) || [],
  };

  // Loading state
  if (isLoading && events.length === 0) {
    return (
      <>
        <SEOHead
          title={`Events in Des Moines - Concerts, Festivals & Things To Do | ${BRAND.name}`}
          description="Discover upcoming events in Des Moines, Iowa. Find concerts, festivals, community gatherings, and entertainment activities happening now."
          type="website"
          keywords={["Des Moines events", "Iowa events", "upcoming events", "things to do Des Moines"]}
        />
        <div className="min-h-screen bg-background">
          <Header />
          <section className="relative bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] overflow-hidden min-h-[340px]" role="status" aria-live="polite" aria-busy="true">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15),transparent_50%)]" />
            <div className="relative container mx-auto px-4 py-16 md:py-20 text-center">
              <div className="animate-pulse space-y-4 motion-reduce:animate-none">
                <div className="h-10 md:h-14 bg-white/10 rounded-lg w-3/4 mx-auto" />
                <div className="h-6 bg-white/10 rounded w-1/2 mx-auto" />
                <div className="h-14 bg-white/10 rounded-xl w-full max-w-2xl mx-auto mt-8" />
                <span className="sr-only">Loading events page...</span>
              </div>
            </div>
          </section>
          <div className="container mx-auto px-4 py-8">
            <CardsGridSkeleton count={9} className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" label="Loading events..." />
          </div>
          <Footer />
        </div>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        <SEOHead title={`Unable to Load Events | ${BRAND.name}`} description="We're having trouble loading events. Please try again." type="website" />
        <div className="min-h-screen bg-background">
          <Header />
          <div className="container mx-auto px-4 py-16">
            <EmptyState
              icon={AlertCircle}
              title="Unable to Load Events"
              description="We're having trouble loading the events list. This might be a temporary issue."
              actions={[
                { label: "Try Again", onClick: () => refetch(), icon: RefreshCw },
                { label: "Go Home", onClick: () => navigate("/"), variant: "outline" as const },
              ]}
            />
          </div>
          <Footer />
        </div>
      </>
    );
  }

  // Filter section content (shared between mobile sheet and desktop panel)
  const filterContent = (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium">Category</label>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className={isMobile ? "input-mobile" : ""}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories?.map((category) => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Date Range</label>
        <InteractiveDateSelector onDateChange={(d) => { setDateFilter(d); setActiveDatePreset(null); }} className="w-full" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Location</label>
        <Select value={location} onValueChange={setLocation}>
          <SelectTrigger className={isMobile ? "input-mobile" : ""}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any-location">Any location</SelectItem>
            <SelectItem value="downtown">Downtown Des Moines</SelectItem>
            <SelectItem value="west-des-moines">West Des Moines</SelectItem>
            <SelectItem value="ankeny">Ankeny</SelectItem>
            <SelectItem value="urbandale">Urbandale</SelectItem>
            <SelectItem value="clive">Clive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Price</label>
        <Select value={priceRange} onValueChange={setPriceRange}>
          <SelectTrigger className={isMobile ? "input-mobile" : ""}>
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
  );

  return (
    <>
      <SEOEnhancedHead
        title={seoTitle}
        description={seoDescription}
        url={getCanonicalUrl('/events')}
        type="website"
        structuredData={eventsSchema}
      />
      <BreadcrumbListSchema items={[{ name: "Home", url: BRAND.baseUrl }, { name: "Events", url: getCanonicalUrl('/events') }]} />

      <div className="min-h-screen bg-background">
        <Header />

        {/* Hero Section - Modern Dark Gradient */}
        <section className="relative bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.15),transparent_50%)]" />
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />

          <div className="relative container mx-auto px-4 py-12 md:py-20">
            <div className="text-center max-w-3xl mx-auto">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-3 tracking-tight leading-tight">
                Des Moines Events
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-white/70 mb-8 max-w-2xl mx-auto">
                Concerts, festivals, food events & things to do in Des Moines, Iowa
              </p>

              {/* Search Bar */}
              <div className="max-w-2xl mx-auto mb-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none z-10" />
                  <Input
                    ref={searchInputRef}
                    type="search"
                    placeholder={isMobile ? "Search events..." : "Search events, venues, or keywords..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 pr-12 h-14 bg-white/10 backdrop-blur-md border-white/20 text-white placeholder:text-white/50 rounded-xl text-base focus:bg-white/15 focus:border-white/40 focus:ring-2 focus:ring-indigo-400/50 transition-all"
                    aria-label="Search events (Press 'f' to focus)"
                    role="searchbox"
                    autoComplete="off"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/10"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Quick Date Presets */}
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {DATE_PRESETS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => handleDatePreset(key)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      activeDatePreset === key
                        ? "bg-white text-slate-900 shadow-lg shadow-white/20"
                        : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white border border-white/10"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Action Row */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  onClick={handleNearMe}
                  variant="secondary"
                  className={`rounded-full ${
                    isNearMeActive
                      ? "bg-indigo-500 text-white hover:bg-indigo-600 border-0"
                      : "bg-white/10 hover:bg-white/20 text-white border-white/10"
                  }`}
                  disabled={isLoadingLocation}
                  size="sm"
                >
                  {isLoadingLocation ? (
                    <LoadingSpinner className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Navigation className={`h-3.5 w-3.5 mr-1.5 ${isNearMeActive ? 'animate-pulse' : ''}`} />
                  )}
                  {isLoadingLocation ? 'Locating...' : isNearMeActive ? 'Near Me' : 'Near Me'}
                </Button>

                {isMobile ? (
                  <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
                    <SheetTrigger asChild>
                      <Button variant="secondary" size="sm" className="bg-white/10 hover:bg-white/20 text-white border-white/10 rounded-full relative">
                        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                        Filters
                        {activeFiltersCount > 0 && (
                          <Badge className="ml-1.5 bg-indigo-500 text-white h-5 w-5 p-0 flex items-center justify-center text-[10px] rounded-full">
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
                      <div className="mt-6 overflow-y-auto max-h-[calc(85vh-120px)] pb-safe">
                        {filterContent}
                        <div className="flex gap-3 mt-6 pt-4 border-t">
                          <Button variant="outline" onClick={handleClearFilters} className="flex-1 btn-mobile">Clear All</Button>
                          <Button onClick={() => setShowMobileFilters(false)} className="flex-1 btn-mobile">Show {events?.length || 0} Events</Button>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                ) : (
                  <Button
                    onClick={() => setShowFilters(!showFilters)}
                    variant="secondary"
                    size="sm"
                    className={`rounded-full ${showFilters ? 'bg-white text-slate-900 shadow-lg' : 'bg-white/10 hover:bg-white/20 text-white border-white/10'}`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                    Filters
                    {activeFiltersCount > 0 && (
                      <Badge className="ml-1.5 bg-indigo-500 text-white h-5 w-5 p-0 flex items-center justify-center text-[10px] rounded-full">
                        {activeFiltersCount}
                      </Badge>
                    )}
                  </Button>
                )}

                <div className="flex items-center rounded-full bg-white/10 p-0.5">
                  <Button
                    onClick={() => setViewMode("list")}
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-full ${viewMode === "list" ? "bg-white/20 text-white" : "text-white/50 hover:text-white hover:bg-white/10"}`}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => setViewMode("map")}
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-full ${viewMode === "map" ? "bg-white/20 text-white" : "text-white/50 hover:text-white hover:bg-white/10"}`}
                    aria-label="Map view"
                  >
                    <Map className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div ref={pullToRefreshRef} className="container mx-auto px-4 py-6 md:py-8 relative">
          {/* Pull to Refresh */}
          {isMobile && (isPulling || isRefreshing) && (
            <div className="ptr-indicator" style={{ transform: `translateY(${Math.min(pullDistance, 80)}px)` }}>
              <div className="bg-background rounded-full p-3 shadow-lg">
                {isRefreshing ? (
                  <LoadingSpinner className="h-6 w-6" />
                ) : (
                  <svg className="h-6 w-6 text-primary" style={{ transform: `rotate(${pullDistance * 2}deg)` }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </div>
            </div>
          )}

          {/* Desktop Filters Panel */}
          {showFilters && !isMobile && (
            <div className="bg-card rounded-2xl shadow-lg border p-6 mb-6 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {filterContent}
              </div>
              <div className="flex items-center justify-between mt-5 pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground">
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Clear Filters
                </Button>
                <span className="text-sm text-muted-foreground">{events?.length || 0} events found</span>
              </div>
            </div>
          )}

          {/* Active Filters Summary */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {searchQuery && (
                <Badge variant="secondary" className="gap-1 pr-1">
                  Search: "{searchQuery}"
                  <button onClick={() => setSearchQuery("")} className="ml-1 hover:bg-accent rounded-full p-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {selectedCategory !== "all" && (
                <Badge variant="secondary" className="gap-1 pr-1">
                  {selectedCategory}
                  <button onClick={() => setSelectedCategory("all")} className="ml-1 hover:bg-accent rounded-full p-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {activeDatePreset && (
                <Badge variant="secondary" className="gap-1 pr-1">
                  {DATE_PRESETS.find(p => p.key === activeDatePreset)?.label || "Custom date"}
                  <button onClick={() => { setActiveDatePreset(null); setDateFilter(null); }} className="ml-1 hover:bg-accent rounded-full p-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {location !== "any-location" && (
                <Badge variant="secondary" className="gap-1 pr-1">
                  {location.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  <button onClick={() => setLocation("any-location")} className="ml-1 hover:bg-accent rounded-full p-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {priceRange !== "any-price" && (
                <Badge variant="secondary" className="gap-1 pr-1">
                  {priceRange === 'free' ? 'Free' : priceRange}
                  <button onClick={() => setPriceRange("any-price")} className="ml-1 hover:bg-accent rounded-full p-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {isNearMeActive && (
                <Badge variant="secondary" className="gap-1 pr-1">
                  Near Me
                  <button onClick={() => { setIsNearMeActive(false); setUserLocation(null); }} className="ml-1 hover:bg-accent rounded-full p-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              )}
              <button onClick={handleClearFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
                Clear all
              </button>
            </div>
          )}

          {/* Category Quick Filters (smart chips) */}
          {!searchQuery && (
            <SmartFilterChips
              onFilterSelect={(category) => setSelectedCategory(category)}
              activeFilters={selectedCategory !== "all" ? [selectedCategory] : []}
              className="mb-5"
              limit={8}
            />
          )}

          {/* Results Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                {searchQuery
                  ? `Results for "${searchQuery}"`
                  : selectedCategory && selectedCategory !== "all"
                  ? `${selectedCategory} Events`
                  : activeDatePreset
                  ? `${DATE_PRESETS.find(p => p.key === activeDatePreset)?.label || "Upcoming"} Events`
                  : "Upcoming Events"}
              </h2>
              {!isLoading && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {events?.length || 0} events in Des Moines{isNearMeActive ? ' near you' : ''}
                </p>
              )}
            </div>
          </div>

          {/* Event Grid / Map */}
          {isLoading && <CardsGridSkeleton count={6} label="Loading events..." />}

          {!isLoading && viewMode === "map" ? (
            <Suspense fallback={<LoadingSpinner label="Loading map..." />}>
              <EventsMap events={events || []} />
            </Suspense>
          ) : !isLoading ? (
            <div className={`grid gap-5 ${isMobile ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {events?.map((event, index) => (
                <SocialEventCard
                  key={event.id}
                  event={event}
                  socialData={batchSocialData?.[event.id]}
                  featured={index === 0 && !searchQuery && selectedCategory === "all" && events.length > 6}
                  onViewDetails={() => {
                    navigate(`/events/${createEventSlugWithCentralTime(event.title, event)}`);
                  }}
                />
              ))}
            </div>
          ) : null}

          {/* Load More */}
          {!isLoading && events && events.length > 0 && hasMore && (
            <div className="flex justify-center mt-10">
              <Button
                onClick={() => setPage(p => p + 1)}
                variant="outline"
                size="lg"
                className="min-w-[200px] rounded-full"
              >
                Load More Events
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {!isLoading && events && events.length > 0 && !hasMore && (
            <div className="flex justify-center mt-8 mb-4 text-sm text-muted-foreground">
              Showing all {events.length} events
            </div>
          )}

          {/* No Results */}
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
                      { label: "Clear All Filters", onClick: handleClearFilters, variant: "outline", icon: X },
                      { label: "Browse All Events", onClick: () => { handleClearFilters(); window.scrollTo({ top: 0, behavior: 'smooth' }); }, icon: Sparkles },
                    ]
                  : undefined
              }
              compact={isMobile}
            />
          )}
        </div>

        {/* SEO Content Section */}
        <section className="border-t bg-muted/30">
          <div className="container mx-auto px-4 py-12 md:py-16">
            {/* SEO-rich content block - visible to crawlers, helpful to users */}
            <div className="max-w-4xl mx-auto mb-12">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">Things To Do in Des Moines, Iowa</h2>
              <div className="prose prose-slate max-w-none text-muted-foreground">
                <p>
                  Des Moines is the capital and most populous city in Iowa, offering a vibrant mix of cultural events, live music, food festivals, outdoor adventures, and family-friendly activities. From the iconic Iowa State Fair to intimate gallery openings in the East Village, there's always something happening in the Greater Des Moines area.
                </p>
                <p>
                  Popular event venues include Hoyt Sherman Place, Wells Fargo Arena, the Iowa Events Center, Des Moines Civic Center, Cowles Commons, and Wooly's. Neighborhoods like Downtown, East Village, Sherman Hill, and the Western Gateway district each host unique community events throughout the year.
                </p>
                <p>
                  Whether you're looking for free events this weekend, live concerts tonight, family activities, or food and drink festivals, our comprehensive events calendar is updated daily with hundreds of local happenings across Des Moines, West Des Moines, Ankeny, Urbandale, and the surrounding metro area.
                </p>
              </div>
            </div>

            {/* Quick Links for SEO */}
            <div className="max-w-4xl mx-auto mb-12">
              <h3 className="text-lg font-semibold mb-4">Browse Events By</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Link to="/events/today" className="flex items-center gap-2 p-3 rounded-lg bg-card border hover:border-primary/50 hover:shadow-sm transition-all text-sm font-medium">
                  <Clock className="h-4 w-4 text-primary" />
                  Events Today
                </Link>
                <Link to="/events/this-weekend" className="flex items-center gap-2 p-3 rounded-lg bg-card border hover:border-primary/50 hover:shadow-sm transition-all text-sm font-medium">
                  <Star className="h-4 w-4 text-primary" />
                  This Weekend
                </Link>
                <Link to="/events/free" className="flex items-center gap-2 p-3 rounded-lg bg-card border hover:border-primary/50 hover:shadow-sm transition-all text-sm font-medium">
                  <Ticket className="h-4 w-4 text-primary" />
                  Free Events
                </Link>
                <Link to="/events/kids" className="flex items-center gap-2 p-3 rounded-lg bg-card border hover:border-primary/50 hover:shadow-sm transition-all text-sm font-medium">
                  <Users className="h-4 w-4 text-primary" />
                  Kids & Family
                </Link>
              </div>
            </div>

            {/* FAQ Section */}
            <div className="max-w-4xl mx-auto">
              <FAQSection
                title="Des Moines Events - Frequently Asked Questions"
                description="Find answers to common questions about events in Des Moines, Iowa."
                faqs={[
                  {
                    question: "What events are happening in Des Moines this weekend?",
                    answer: "Des Moines offers dozens of weekend events including live music at venues like Hoyt Sherman Place and Wooly's, farmers markets, outdoor festivals, sporting events, and family activities. Use our date filter to see all events this weekend, or browse our 'This Weekend' page for a curated list."
                  },
                  {
                    question: "Where can I find free events in Des Moines?",
                    answer: "Des Moines has many free events including the Downtown Farmers Market (Saturdays, April-October), outdoor concerts at Cowles Commons, Sculpture Park at Western Gateway, free museum days, library programs, and community festivals. Filter by 'Free' on our events page to see all upcoming free activities."
                  },
                  {
                    question: "What are the best live music venues in Des Moines?",
                    answer: "Top live music venues in Des Moines include Hoyt Sherman Place (major touring acts), Wooly's (indie/alternative), Val Air Ballroom (large concerts), Gas Lamp (intimate shows), Wells Fargo Arena (arena concerts), and Cowles Commons (free outdoor summer concerts). The East Village and Court Avenue districts also feature many bars with live music."
                  },
                  {
                    question: "What are the biggest annual events in Des Moines?",
                    answer: "Major annual events include the Iowa State Fair (August, 1M+ visitors), 80/35 Music Festival, Des Moines Arts Festival, World Food & Music Festival, RAGBRAI (bike ride), Bacon Fest, and the Des Moines Marathon. Holiday events include Jolly Holiday Lights and the Downtown Winter Market."
                  },
                  {
                    question: "Are there family-friendly events in Des Moines?",
                    answer: "Des Moines offers extensive family-friendly events including programs at Science Center of Iowa, Blank Park Zoo events, library storytimes, seasonal festivals with kids' zones, outdoor movie nights, and playground meetups. Use our 'Kids & Family' filter to find age-appropriate activities."
                  },
                  {
                    question: "How do I find events near me in Des Moines?",
                    answer: "Use the 'Near Me' button on our events page to find events within 30 miles of your location. You can also filter by specific areas including Downtown Des Moines, West Des Moines, Ankeny, Urbandale, and Clive."
                  },
                  {
                    question: "What neighborhoods have the most events in Des Moines?",
                    answer: "Downtown Des Moines has the highest concentration of events with Iowa Events Center, Cowles Commons, and Des Moines Civic Center. The East Village features art walks, live music, and dining events. Other active areas include Gray's Lake, the Drake neighborhood, and Western Gateway near Science Center of Iowa."
                  },
                  {
                    question: "How often is your events calendar updated?",
                    answer: "Our Des Moines events calendar is updated daily using AI-powered scanning of over 50 official sources including venue websites, event organizers, and municipal calendars. We verify event details and display all times in Central Time (CT). New events are typically listed within 24 hours of announcement."
                  }
                ]}
                showSchema={true}
                className="border-0 shadow-lg"
              />
            </div>
          </div>
        </section>

        <Footer />
        <BackToTop />
      </div>
    </>
  );
}
