import { useState, useEffect, useCallback, lazy, Suspense, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  List,
  Map as MapIcon,
  RefreshCw,
  SearchX,
  Tag,
  X,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import NoIndexMeta from "@/components/schema/NoIndexMeta";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import { HubArticles } from "@/components/seo/HubArticles";
import { EventsHubDirectory } from "@/components/seo/EventsHubDirectory";
import { AdBanner } from "@/components/AdBanner";
import { FAQSection } from "@/components/FAQSection";
import { BackToTop } from "@/components/BackToTop";
import { ListFreshness } from "@/components/ListFreshness";
import { SocialEventCard } from "@/components/SocialEventCard";
import { EventSmartPresets } from "@/components/EventSmartPresets";
import type { EventPresetFilters } from "@/lib/eventPresets";
import type { EventDateChange } from "@/components/EventInlineFilters";
import { EventFiltersSheet } from "@/components/events/EventFiltersSheet";
import { EventsStickyBar } from "@/components/events/EventsStickyBar";
import { TonightStrip } from "@/components/events/TonightStrip";
import { DayGroupedList } from "@/components/events/DayGroupedList";
import { EventsHubHero } from "@/components/events/EventsHubHero";
import { buildHubFaqs } from "@/components/events/eventsHubFaqs";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CardsGridSkeleton, LoadingSpinner } from "@/components/ui/loading-skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { useToast } from "@/hooks/use-toast";
import { useBatchEventSocial } from "@/hooks/useBatchEventSocial";
import { useAnnounce } from "@/hooks/use-announce";
import { useFilterKeyboardShortcuts } from "@/hooks/useFilterKeyboardShortcuts";
import { useEventsMapData } from "@/hooks/useEventsMapData";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { arrangeSponsored, isSponsoredActive, SPONSORED_CAP } from "@/lib/sponsored";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { buildEventItemList } from "@/lib/eventSchema";
import { isCanonicalCategory } from "@/lib/eventCategories";
import { findEventArea } from "@/lib/eventAreas";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import {
  EVENTS_PER_PAGE,
  countHub,
  countLabel,
  fetchHubPage,
  fetchNearMe,
  flattenPages,
  parseHubSort,
  pickedDay,
  resolveHubDate,
  useTonightStripEvents,
  type HubEvent,
  type HubFilters,
  type HubPageParam,
} from "@/components/events/eventsHubQuery";

// Leaflet is ~150KB; the map loads only when someone switches to it.
const EventsMap = lazy(() => import("@/components/EventsMap"));

/** A `?page=N` deep link loads pages 1..N in one request, capped. */
const MAX_DEEP_LINK_PAGES = 10;
/** The top_banner slot sits after this many cards (0-based index 5). */
const AD_AFTER_INDEX = 5;

type Origin = { latitude: number; longitude: number };

const HUB_FAQS = buildHubFaqs();

export default function EventsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { announce, announcement, regionProps } = useAnnounce();

  // ---------------------------------------------------------------------
  // URL state (WEB-UX-001). The URL is the source of truth for every filter.
  // ---------------------------------------------------------------------
  const { getStr, getNum, setParam, setMany, clearParams } = useUrlFilters();
  // 'search' is read as an alias for 'q' (WEB-SEO-029): the WebSite
  // SearchAction advertised /events?search={term} for as long as it was
  // indexed. 'q' wins when both are present, since that is the one we write.
  const debouncedSearchQuery = getStr("q", "") || getStr("search", "");
  const selectedCategory = getStr("category", "all");
  // `location` is the key the page has always written; `area` is accepted too.
  const location = getStr("location", "") || getStr("area", "") || "any-location";
  // Numeric price ranges are gone until events carry a numeric price (plan D2);
  // an old ?price=under-25 link is read as no price filter, not as an error.
  const priceParam = getStr("price", "any-price");
  const priceRange = priceParam === "free" ? "free" : "any-price";
  const sortBy = parseHubSort(getStr("sort", "date_asc"));
  const presetParam = getStr("preset", "") || null;
  const fromParam = getStr("from", "") || null;
  const toParam = getStr("to", "") || null;
  const nearParam = getStr("near", "") === "1";
  const viewMode = getStr("view", "list") === "map" ? "map" : "list";
  const initialPage = Math.min(Math.max(1, Math.floor(getNum("page", 1))), MAX_DEEP_LINK_PAGES);

  const area = findEventArea(location);
  const resolvedDate = useMemo(
    () => resolveHubDate(presetParam, fromParam, toParam),
    [presetParam, fromParam, toParam]
  );
  const activePreset = resolvedDate?.source === "preset" ? resolvedDate.preset ?? "" : "";

  const hubFilters: HubFilters = useMemo(
    () => ({
      search: debouncedSearchQuery,
      category: selectedCategory,
      window: resolvedDate?.window ?? null,
      area,
      freeOnly: priceRange === "free",
      sort: sortBy,
    }),
    [debouncedSearchQuery, selectedCategory, resolvedDate, area, priceRange, sortBy]
  );

  // Local immediate search input; writes to URL 'q' debounced.
  const [searchQuery, setSearchQuery] = useState(() => debouncedSearchQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Clock for the Tonight strip's "starts in 40 min" labels.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  // ---------------------------------------------------------------------
  // Near me. `?near=1` is in the URL; coordinates stay in memory only.
  // ---------------------------------------------------------------------
  const [userLocation, setUserLocation] = useState<Origin | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const isNearMeActive = nearParam && userLocation !== null;

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast({ title: "Location isn't available", description: "This browser doesn't share location." });
      setParam("near", "", { resetsPage: true, replace: true });
      return;
    }
    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setIsLoadingLocation(false);
        setParam("near", "1", { resetsPage: true });
      },
      (error) => {
        setIsLoadingLocation(false);
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. The Near Me page lets you pick a starting point instead."
            : "We couldn't get your location.";
        toast({ title: "Near me is off", description: message });
        setParam("near", "", { resetsPage: true, replace: true });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, [setParam, toast]);

  // A shared or reloaded ?near=1 link asks for the location once.
  const askedForLocation = useRef(false);
  useEffect(() => {
    if (nearParam && !userLocation && !isLoadingLocation && !askedForLocation.current) {
      askedForLocation.current = true;
      requestLocation();
    }
  }, [nearParam, userLocation, isLoadingLocation, requestLocation]);

  const clearNearMe = useCallback(() => {
    setUserLocation(null);
    setParam("near", "", { resetsPage: true });
  }, [setParam]);

  const handleNearMe = () => {
    if (nearParam) clearNearMe();
    else requestLocation();
  };

  // ---------------------------------------------------------------------
  // Filter writers. Each one navigates once.
  // ---------------------------------------------------------------------
  const setSelectedCategory = (v: string) => setParam("category", v, { def: "all", resetsPage: true });
  const setLocation = (v: string) =>
    setMany({ location: v === "any-location" ? null : v, area: null });
  const setPriceRange = (v: string) => setParam("price", v, { def: "any-price", resetsPage: true });
  const setSortBy = (v: string) => setParam("sort", v, { def: "date_asc", resetsPage: true });
  const setView = (v: "list" | "map") => setParam("view", v, { def: "list", replace: true });
  const setDatePreset = (preset: string) =>
    setMany({ preset: preset || null, from: null, to: null });

  const toggleDatePreset = (preset: string) => setDatePreset(activePreset === preset ? "" : preset);

  const handleDateChange = (d: EventDateChange) => {
    if (!d) {
      setMany({ preset: null, from: null, to: null });
    } else if (d.mode === "preset") {
      setDatePreset(d.preset && d.preset !== "any-date" ? d.preset : "");
    } else if (d.start) {
      const from = pickedDay(d.start);
      const to = d.mode === "range" && d.end ? pickedDay(d.end) : null;
      setMany({ preset: null, from, to: to && to !== from ? to : null });
    }
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setUserLocation(null);
    clearParams(["q", "search", "category", "preset", "from", "to", "location", "area", "price", "sort", "near"]);
  };

  /** A preset writes category, price and date in ONE navigation (WP1 item 5). */
  const handleEventPreset = (filters: EventPresetFilters) => {
    const entries: Record<string, string | null> = {};
    if (filters.category) entries.category = filters.category;
    if (filters.priceRange) entries.price = filters.priceRange;
    if (filters.datePreset) {
      entries.preset = filters.datePreset;
      entries.from = null;
      entries.to = null;
    }
    setMany(entries, { defaults: { category: "all", price: "any-price" } });
  };

  const handleClearPreset = (filters: EventPresetFilters) => {
    const entries: Record<string, string | null> = {};
    if (filters.category) entries.category = null;
    if (filters.priceRange) entries.price = null;
    if (filters.datePreset) entries.preset = null;
    setMany(entries);
  };

  useFilterKeyboardShortcuts({
    enabled: !isMobile,
    onFocusSearch: () => searchInputRef.current?.focus(),
    searchInputRef,
    onClearSearch: () => {
      setSearchQuery("");
      setParam("q", "", { resetsPage: true, replace: true });
    },
  });

  // Debounced search -> URL 'q' (replace, so typing stays out of history).
  useEffect(() => {
    if (searchQuery === debouncedSearchQuery) return;
    const timer = setTimeout(
      () => setParam("q", searchQuery, { def: "", resetsPage: true, replace: true }),
      300
    );
    return () => clearTimeout(timer);
  }, [searchQuery, debouncedSearchQuery, setParam]);

  // Back/forward & shared links: pull URL search back into the input.
  useEffect(() => {
    setSearchQuery(debouncedSearchQuery);
  }, [debouncedSearchQuery]);

  // ---------------------------------------------------------------------
  // The list. Pages APPEND (WP1 item 3): Load More used to swap page 1 for
  // page 2, and the header printed the page length as the total.
  // ---------------------------------------------------------------------
  const waitingForLocation = nearParam && !userLocation;
  const listQuery = useInfiniteQuery({
    // WEB-PERF-032: nested under ["events","list"] so one invalidation reaches
    // every events list. `page` is deliberately not in the key: it only says
    // how much of this list to load first.
    queryKey: queryKeys.events.list({
      hub: "list",
      search: debouncedSearchQuery,
      category: selectedCategory,
      windowStart: hubFilters.window?.start ?? null,
      windowEnd: hubFilters.window?.end ?? null,
      area: area?.slug ?? null,
      free: hubFilters.freeOnly,
      sort: sortBy,
      near: isNearMeActive && userLocation
        ? [userLocation.latitude.toFixed(2), userLocation.longitude.toFixed(2)]
        : null,
    }),
    initialPageParam: { offset: 0, limit: initialPage * EVENTS_PER_PAGE } as HubPageParam,
    queryFn: ({ pageParam }) =>
      isNearMeActive && userLocation
        ? fetchNearMe(hubFilters, userLocation, new Date())
        : fetchHubPage(hubFilters, pageParam, new Date()),
    getNextPageParam: (lastPage, allPages): HubPageParam | undefined => {
      if (lastPage.complete) return undefined;
      const total = allPages[0]?.total ?? 0;
      const offset = lastPage.offset + lastPage.limit;
      return offset < total ? { offset, limit: EVENTS_PER_PAGE } : undefined;
    },
    placeholderData: keepPreviousData,
    enabled: !waitingForLocation,
    staleTime: 5 * 60 * 1000,
  });

  const pages = useMemo(() => listQuery.data?.pages ?? [], [listQuery.data]);
  const firstPage = pages[0];
  const totalCount = firstPage?.total ?? 0;

  // Paid placement: up to SPONSORED_CAP active sponsored rows from PAGE 1 lead
  // the list (WEB-FEAT-005). Later pages are organic order only.
  const { pinned, listEvents, allEvents } = useMemo(() => {
    if (!firstPage) return { pinned: [], listEvents: [], allEvents: [] };
    const arranged = arrangeSponsored(firstPage.events);
    const lead: HubEvent[] = [];
    for (const event of arranged) {
      if (lead.length >= SPONSORED_CAP || !isSponsoredActive(event)) break;
      lead.push(event);
    }
    const leadIds = new Set(lead.map((e) => e.id));
    const flat = flattenPages(pages);
    return {
      pinned: lead,
      listEvents: flat.filter((e) => !leadIds.has(e.id)),
      allEvents: flat,
    };
  }, [firstPage, pages]);

  const loadedCount = allEvents.length;

  // The map runs its own query over every match with coordinates (WP4), not
  // the page of 30 the list happens to have loaded.
  const mapQuery = useEventsMapData(hubFilters, {
    enabled: viewMode === "map" && !isNearMeActive && !waitingForLocation,
    now,
  });
  // While ?near=1 waits on the browser for a position, the list is loading, not empty.
  const isInitialLoading = waitingForLocation || listQuery.isPending;
  const firstPageFailed = listQuery.isError && !listQuery.data;

  // Keep ?page= in step with what is loaded, so a reload or a shared link
  // comes back to the same place.
  const loadMore = () => {
    const nextPage = Math.ceil(loadedCount / EVENTS_PER_PAGE) + 1;
    void listQuery.fetchNextPage();
    setParam("page", nextPage, { def: 1, replace: true });
  };

  const activeFiltersCount = [
    debouncedSearchQuery,
    selectedCategory !== "all",
    resolvedDate !== null,
    location !== "any-location",
    priceRange !== "any-price",
    nearParam,
  ].filter(Boolean).length;

  // Tonight strip: only on the unfiltered list view.
  const tonightEnabled = activeFiltersCount === 0 && viewMode === "list";
  const tonightQuery = useTonightStripEvents(tonightEnabled, now);
  const tonightRows = useMemo(
    () => (tonightEnabled ? tonightQuery.data ?? [] : []),
    [tonightEnabled, tonightQuery.data]
  );

  // Announce the count once per change. The visible count is NOT a live
  // region; announcing it twice was the old behaviour.
  const countText = countLabel(loadedCount, totalCount);
  useEffect(() => {
    if (isInitialLoading || firstPageFailed) return;
    announce(`${countText}${debouncedSearchQuery ? ` matching "${debouncedSearchQuery}"` : ""}`);
  }, [countText, isInitialLoading, firstPageFailed, debouncedSearchQuery, announce]);

  const { data: categories } = useQuery({
    queryKey: ["event-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_categories");
      if (error) throw error;
      return (data || []).map((row: { category: string }) => row.category);
    },
    staleTime: 30 * 60 * 1000,
  });

  // One social batch for the strip and the list. isPending is forwarded so
  // cards don't each fall back to their own fetch (WEB-PERF-024).
  const socialIds = useMemo(() => {
    const ids = new Set<string>(allEvents.map((e) => e.id));
    for (const row of tonightRows) ids.add(row.id);
    return Array.from(ids);
  }, [allEvents, tonightRows]);
  const { data: batchSocialData, isPending: batchSocialPending } = useBatchEventSocial(socialIds);

  const handleViewEventDetails = useCallback(
    (event: HubEvent) => {
      navigate(`/events/${createEventSlugWithCentralTime(event.title, event)}`);
    },
    [navigate]
  );

  const { elementRef: pullToRefreshRef, isPulling, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      await listQuery.refetch();
    },
  });

  // ---------------------------------------------------------------------
  // Empty state: offer ONE relaxation, measured by count-only HEAD queries.
  // ---------------------------------------------------------------------
  const isEmpty = !isInitialLoading && !firstPageFailed && loadedCount === 0;
  const relaxable =
    isEmpty && !isNearMeActive && (selectedCategory !== "all" || resolvedDate !== null);
  const relaxQuery = useQuery({
    queryKey: queryKeys.events.list({
      hub: "relax",
      search: debouncedSearchQuery,
      category: selectedCategory,
      windowStart: hubFilters.window?.start ?? null,
      area: area?.slug ?? null,
      free: hubFilters.freeOnly,
    }),
    enabled: relaxable,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<{ drop: "category" | "date"; count: number } | null> => {
      const nowDate = new Date();
      if (selectedCategory !== "all") {
        const count = await countHub({ ...hubFilters, category: "all" }, nowDate);
        if (count > 0) return { drop: "category", count };
      }
      if (hubFilters.window) {
        const count = await countHub({ ...hubFilters, window: null }, nowDate);
        if (count > 0) return { drop: "date", count };
      }
      return null;
    },
  });

  // ---------------------------------------------------------------------
  // Chips and labels
  // ---------------------------------------------------------------------
  const eventChips: { key: string; label: string; onRemove: () => void }[] = [
    ...(debouncedSearchQuery
      ? [{
          key: "q",
          label: `Search: "${debouncedSearchQuery}"`,
          onRemove: () => {
            setSearchQuery("");
            setMany({ q: null, search: null });
          },
        }]
      : []),
    ...(selectedCategory !== "all"
      ? [{ key: "category", label: selectedCategory, onRemove: () => setSelectedCategory("all") }]
      : []),
    ...(resolvedDate
      ? [{ key: "date", label: resolvedDate.label, onRemove: () => setMany({ preset: null, from: null, to: null }) }]
      : []),
    ...(location !== "any-location"
      ? [{ key: "location", label: area?.label ?? "Area", onRemove: () => setLocation("any-location") }]
      : []),
    ...(priceRange !== "any-price"
      ? [{ key: "price", label: "Free", onRemove: () => setPriceRange("any-price") }]
      : []),
    ...(nearParam ? [{ key: "near", label: "Near me", onRemove: clearNearMe }] : []),
  ];

  const canonicalCategory = selectedCategory !== "all" && isCanonicalCategory(selectedCategory);
  const noIndex =
    firstPageFailed || Boolean(debouncedSearchQuery) || (selectedCategory !== "all" && !canonicalCategory);

  const resultsHeading = debouncedSearchQuery
    ? `Results for "${debouncedSearchQuery}"`
    : canonicalCategory
    ? `${selectedCategory} events`
    : resolvedDate
    ? `Events: ${resolvedDate.label}`
    : "Upcoming events";

  // SEO: the title uses the debounced query and a whitelisted category only.
  const seoTitle = debouncedSearchQuery
    ? `"${debouncedSearchQuery}" Events in Des Moines, Iowa`
    : canonicalCategory
    ? `${selectedCategory} Events in Des Moines, Iowa`
    : "Events in Des Moines, Iowa - Concerts, Festivals & Things To Do";
  const seoDescription = `Upcoming ${
    canonicalCategory ? `${selectedCategory.toLowerCase()} ` : ""
  }events in Des Moines, Iowa and its suburbs: concerts, festivals, food, family and community events, with Central Time start times and venues. New events are collected daily.`;

  // ItemList for the unfiltered hub only, in organic order (no sponsored
  // boost), built by the shared builder so /events and the landings agree.
  const eventsSchema = useMemo(() => {
    if (activeFiltersCount > 0 || !firstPage || firstPage.events.length === 0) return undefined;
    return buildEventItemList(
      firstPage.events,
      {
        name: "Upcoming events in Des Moines",
        description: seoDescription,
        url: getCanonicalUrl("/events"),
      },
      EVENTS_PER_PAGE
    );
  }, [activeFiltersCount, firstPage, seoDescription]);


  const renderCard = (event: HubEvent, index: number) => (
    <SocialEventCard
      priority={index < 3}
      key={event.id}
      event={event}
      socialData={batchSocialData?.[event.id]}
      socialDataPending={batchSocialPending}
      onViewDetails={handleViewEventDetails}
    />
  );

  const cardCount = pinned.length + listEvents.length;
  const adSlot = (
    <div className="py-1">
      <AdBanner placement="top_banner" />
    </div>
  );

  const relaxAction = relaxQuery.data
    ? relaxQuery.data.drop === "category"
      ? {
          label: `Show ${relaxQuery.data.count.toLocaleString()} in all categories`,
          onClick: () => setSelectedCategory("all"),
          icon: Tag,
        }
      : {
          label: `Show ${relaxQuery.data.count.toLocaleString()} on any date`,
          onClick: () => setMany({ preset: null, from: null, to: null }),
          icon: Calendar,
        }
    : null;

  return (
    <>
      <SEOHead
        title={seoTitle}
        description={seoDescription}
        url="/events"
        canonicalUrl={getCanonicalUrl("/events")}
        type="website"
        structuredData={eventsSchema}
      />
      {/* noindex for search results, non-canonical categories, and a failed
          first page (WEB-A11Y-002: a backend blip must not get the hub indexed
          as an error). noindex,follow, so the links still pass. */}
      {noIndex && <NoIndexMeta />}
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: BRAND.baseUrl },
          { name: "Events", url: getCanonicalUrl("/events") },
        ]}
      />

      <div className="min-h-screen bg-background">
        <Header />

        <EventsHubHero
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchInputRef={searchInputRef}
          isMobile={isMobile}
          activePreset={activePreset}
          onTogglePreset={toggleDatePreset}
          isFree={priceRange === "free"}
          onToggleFree={() => setPriceRange(priceRange === "free" ? "any-price" : "free")}
          isNearMe={nearParam}
          isLocating={isLoadingLocation}
          onToggleNearMe={handleNearMe}
          activeFiltersCount={activeFiltersCount}
          onOpenFilters={() => setFiltersOpen(true)}
        />

        <EventFiltersSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          categories={categories || []}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          location={location}
          onLocationChange={setLocation}
          priceRange={priceRange}
          onPriceRangeChange={setPriceRange}
          datePreset={activePreset}
          onDatePresetChange={setDatePreset}
          onDateChange={handleDateChange}
          customDateLabel={resolvedDate?.source === "custom" ? resolvedDate.label : undefined}
          sortBy={sortBy}
          onSortChange={setSortBy}
          activeFiltersCount={activeFiltersCount}
          onClearAll={handleClearFilters}
          resultLabel={isInitialLoading ? undefined : `Show ${countLabel(totalCount, totalCount)}`}
        />

        <div ref={pullToRefreshRef} className="container relative mx-auto px-4 pb-6 pt-4 md:py-8">
          {isMobile && (isPulling || isRefreshing) && (
            <div className="ptr-indicator" style={{ transform: `translateY(${Math.min(pullDistance, 80)}px)` }}>
              <div className="rounded-full bg-background p-3 shadow-lg">
                {isRefreshing ? (
                  <LoadingSpinner className="h-6 w-6" />
                ) : (
                  <RefreshCw
                    className="h-6 w-6 text-primary"
                    style={{ transform: `rotate(${pullDistance * 2}deg)` }}
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>
          )}

          {tonightEnabled && (
            <TonightStrip
              rows={tonightRows}
              now={now}
              socialData={batchSocialData}
              socialDataPending={batchSocialPending}
              onViewDetails={handleViewEventDetails}
            />
          )}

          <div {...regionProps}>{announcement}</div>

          {/* Results header: heading, freshness, list/map. */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground md:text-2xl">{resultsHeading}</h2>
              <ListFreshness rows={allEvents} className="mt-1" />
            </div>
            <div
              role="group"
              aria-label="View"
              className="inline-flex rounded-full border bg-background p-0.5"
            >
              {(["list", "map"] as const).map((mode) => {
                const Icon = mode === "list" ? List : MapIcon;
                const pressed = viewMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setView(mode)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      pressed ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {mode === "list" ? "List" : "Map"}
                  </button>
                );
              })}
            </div>
          </div>

          <EventsStickyBar
            className="mb-4"
            countLabel={
              isInitialLoading
                ? "Loading events..."
                : firstPageFailed
                ? "Events unavailable"
                : `${countText} in Des Moines${isNearMeActive ? " near you" : ""}`
            }
            chips={eventChips}
            onClearAll={handleClearFilters}
            onOpenFilters={() => setFiltersOpen(true)}
            activeFiltersCount={activeFiltersCount}
            sortBy={sortBy}
            onSortChange={setSortBy}
          />


          {isInitialLoading && (
            <CardsGridSkeleton
              count={6}
              variant="event"
              label={debouncedSearchQuery ? `Searching for "${debouncedSearchQuery}"...` : "Loading events..."}
            />
          )}

          {firstPageFailed && (
            <EmptyState
              icon={AlertCircle}
              title="We couldn't load events"
              description="The events list didn't load. This is usually temporary."
              actions={[{ label: "Try again", onClick: () => void listQuery.refetch(), icon: RefreshCw }]}
              compact={isMobile}
            />
          )}

          {viewMode === "map" && !isInitialLoading && !firstPageFailed && (
            <Suspense fallback={<LoadingSpinner label="Loading map..." />}>
              {isNearMeActive ? (
                // Near me: the map plots the rows the near-me query returned,
                // since the map-data query has no notion of distance.
                <EventsMap
                  events={allEvents.map((e) => ({
                    id: e.id,
                    title: e.title,
                    date: String(e.date),
                    event_start_utc: e.event_start_utc,
                    end_date: e.end_date,
                    venue: e.venue,
                    location: e.location,
                    city: e.city,
                    price: e.price,
                    category: e.category,
                    latitude: e.latitude,
                    longitude: e.longitude,
                  }))}
                  userLocation={userLocation}
                  onShowList={() => setView("list")}
                  now={now}
                />
              ) : mapQuery.isError ? (
                <EmptyState
                  icon={AlertCircle}
                  title="We couldn't load the map"
                  description="The map didn't load. This is usually temporary."
                  actions={[{ label: "Try again", onClick: () => void mapQuery.refetch(), icon: RefreshCw }]}
                  compact={isMobile}
                />
              ) : mapQuery.isPending ? (
                <LoadingSpinner label="Loading map..." />
              ) : (
                <EventsMap
                  events={mapQuery.data?.events ?? []}
                  totalCount={mapQuery.data?.totalCount}
                  mappedCount={mapQuery.data?.mappedCount}
                  onShowList={() => setView("list")}
                  now={now}
                />
              )}
            </Suspense>
          )}

          {!isInitialLoading && !firstPageFailed && cardCount > 0 && viewMode === "list" && (
            <DayGroupedList
              events={listEvents}
              pinned={pinned}
              grouped={sortBy === "date_asc"}
              now={now}
              renderEvent={renderCard}
              insertAfter={{ index: Math.min(AD_AFTER_INDEX, cardCount - 1), node: adSlot }}
              stickyTopClass={eventChips.length > 0 ? "top-44 sm:top-32" : "top-32"}
            />
          )}

          {viewMode === "list" && listQuery.hasNextPage && cardCount > 0 && (
            <div className="mt-10 flex flex-col items-center gap-2">
              {listQuery.isFetchNextPageError && (
                <p className="text-sm text-muted-foreground" role="status">
                  The next page didn't load.
                </p>
              )}
              <Button
                onClick={loadMore}
                variant="outline"
                size="lg"
                className="min-h-11 min-w-[200px] rounded-full"
                disabled={listQuery.isFetchingNextPage}
              >
                {listQuery.isFetchingNextPage
                  ? "Loading..."
                  : listQuery.isFetchNextPageError
                  ? "Try again"
                  : "Load more events"}
                {!listQuery.isFetchingNextPage && <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          )}

          {viewMode === "list" && !listQuery.hasNextPage && cardCount > 0 && (
            <p className="mb-4 mt-8 text-center text-sm text-muted-foreground">
              Showing all {countLabel(loadedCount, loadedCount)}
            </p>
          )}

          {isEmpty && viewMode === "list" && (
            <EmptyState
              icon={activeFiltersCount > 0 ? SearchX : Calendar}
              title={debouncedSearchQuery ? `No results for "${debouncedSearchQuery}"` : "No events match"}
              description={
                activeFiltersCount > 0
                  ? "Nothing on the calendar matches every filter you've set."
                  : "Nothing upcoming is on the calendar yet. New events are collected daily."
              }
              actions={
                relaxAction
                  ? [relaxAction]
                  : activeFiltersCount > 0
                  ? [{ label: "Clear all filters", onClick: handleClearFilters, variant: "outline", icon: X }]
                  : undefined
              }
              compact={isMobile}
            >
              <Link
                to="/events/this-weekend"
                className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                See what's on this weekend
              </Link>
            </EmptyState>
          )}

          {/* Quick picks: one tap sets category, price and date in one
              navigation. Interim dark tray: EventSmartPresets is still styled
              for the old dark hero (white text); drop the tray once it uses
              surface tokens. */}
          <div className="mt-10 rounded-2xl bg-slate-900 p-3">
            <EventSmartPresets
              current={{
                category: selectedCategory !== "all" ? selectedCategory : undefined,
                priceRange: priceRange !== "any-price" ? priceRange : undefined,
                datePreset: activePreset || undefined,
              }}
              onApplyPreset={handleEventPreset}
              onClearPreset={handleClearPreset}
            />
          </div>
        </div>

        <div className="bg-muted/10 py-6">
          <div className="container mx-auto px-4">
            <AdBanner placement="below_fold" />
          </div>
        </div>

        <section className="border-t bg-muted/30">
          <div className="container mx-auto px-4 py-12 md:py-16">
            <div className="mx-auto mb-12 max-w-4xl">
              <h2 className="mb-4 text-2xl font-bold md:text-3xl">About this events calendar</h2>
              {/* SEO-009: no claim here that the data can't back. */}
              <div className="prose prose-slate max-w-none text-muted-foreground">
                <p>
                  This calendar lists concerts, theater, festivals, food and drink events, sports, family activities and community events across Des Moines and its suburbs. Every event has its own page with the date, the start time in Central Time, the venue, the price when it is published, and a link to the official listing.
                </p>
                <p>
                  New events are collected daily from venue and organizer calendars. Narrow the list by day, by suburb, by venue or by month with the links below, or use the filters at the top of the page. For restaurants, attractions and parks as well as events, see{" "}
                  <Link to="/things-to-do" className="font-medium text-primary underline-offset-4 hover:underline">
                    things to do in Des Moines
                  </Link>
                  .
                </p>
              </div>
            </div>

            <div className="mx-auto mb-12 max-w-4xl">
              <EventsHubDirectory />
            </div>

            <div className="mx-auto mb-12 max-w-4xl">
              <HubArticles hub="events" />
            </div>

            <div className="mx-auto max-w-4xl">
              <FAQSection
                title="Des Moines Events - Frequently Asked Questions"
                description="Answers about the events calendar for Des Moines, Iowa."
                faqs={HUB_FAQS}
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
