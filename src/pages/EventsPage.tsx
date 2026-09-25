import { useState, useEffect, useCallback, lazy, Suspense, useRef, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AlertCircle, Calendar, ChevronDown, RefreshCw, SearchX, Tag, X } from "lucide-react";
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
import { QuickPicks } from "@/components/EventSmartPresets";
import { LazySection } from "@/components/LazySection";
import type { EventPresetFilters } from "@/lib/eventPresets";
import {
  EventFiltersSheet,
  type EventDateChange,
  type SheetWriteOptions,
} from "@/components/events/EventFiltersSheet";
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
import { useBatchEventSocialGroups } from "@/hooks/useBatchEventSocial";
import { useNow } from "@/hooks/useNow";
import { useAnnounce } from "@/hooks/use-announce";
import { useFilterKeyboardShortcuts } from "@/hooks/useFilterKeyboardShortcuts";
import { useEventsMapData } from "@/hooks/useEventsMapData";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { arrangeSponsored, isSponsoredActive, SPONSORED_CAP } from "@/lib/sponsored";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { buildEventItemList } from "@/lib/eventSchema";
import { EVENT_CATEGORIES, isCanonicalCategory } from "@/lib/eventCategories";
import { findEventArea } from "@/lib/eventAreas";
import { isPrerender } from "@/lib/isPrerender";
import { centralDateOf, createEventSlugWithCentralTime } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import {
  EVENTS_PER_PAGE,
  countHub,
  countLabel,
  fetchHubPage,
  fetchNearMe,
  fetchSponsoredLead,
  flattenPages,
  nearMeCountLabel,
  parseHubSort,
  pickedDay,
  resolveHubDate,
  selectTonight,
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
/** No empty state or noindex until the search box has been still this long. */
const SEARCH_SETTLE_MS = 800;
/** Where the FAQ's "Music venues" link lands. */
const DIRECTORY_ID = "events-directory";
/** Near me is in distance order; the sort control says so. */
const DISTANCE_SORT_OPTIONS = [{ value: "distance", label: "Distance" }];
/** Every URL key Clear all removes. */
const FILTER_KEYS = ["q", "search", "category", "preset", "from", "to", "location", "area", "price", "sort", "near"];

type Origin = { latitude: number; longitude: number };

const HUB_FAQS = buildHubFaqs();

export default function EventsPage() {
  const navigate = useNavigate();
  const { hash } = useLocation();
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

  // One clock for the page: the strip's labels, "not over yet" and the day
  // headers. Paused while the tab is hidden, re-read when it comes back.
  const now = useNow(60 * 1000);
  const today = centralDateOf(now);

  const area = findEventArea(location);
  // Keyed on the Central date too, so a tab left open over midnight rolls
  // "Today" over to the new day (events-pass2 WP1 item 6).
  const resolvedDate = useMemo(
    () => resolveHubDate(presetParam, fromParam, toParam),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` is the rollover trigger
    [presetParam, fromParam, toParam, today]
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
        if (error.code === error.PERMISSION_DENIED) {
          // Denied is not a dead end (item 8): the Near Me page lets you pick
          // a starting point, and it reads the same window and category.
          // A ?near=1 entry is replaced, so Back doesn't ask again.
          const params = new URLSearchParams();
          if (activePreset) params.set("when", activePreset);
          if (selectedCategory !== "all") params.set("category", selectedCategory);
          const qs = params.toString();
          navigate(`/events/near-me${qs ? `?${qs}` : ""}`, { replace: nearParam });
          return;
        }
        toast({ title: "Near me is off", description: "We couldn't get your location." });
        setParam("near", "", { resetsPage: true, replace: true });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, [setParam, toast, navigate, activePreset, selectedCategory, nearParam]);

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
  // The sheet passes { replace } on every write after its first, so one sheet
  // session is one history entry (WP2 item 8). The hero's chips pass nothing
  // and push, as a tap on the page should.
  const setSelectedCategory = (v: string, o?: SheetWriteOptions) =>
    setParam("category", v, { def: "all", resetsPage: true, replace: o?.replace });
  const setLocation = (v: string, o?: SheetWriteOptions) =>
    setMany({ location: v === "any-location" ? null : v, area: null }, { replace: o?.replace });
  const setPriceRange = (v: string, o?: SheetWriteOptions) =>
    setParam("price", v, { def: "any-price", resetsPage: true, replace: o?.replace });
  const setSortBy = (v: string, o?: SheetWriteOptions) => {
    if (v === "distance") return; // near me's only order; nothing to write
    setParam("sort", v, { def: "date_asc", resetsPage: true, replace: o?.replace });
  };
  const setView = (v: "list" | "map") => setParam("view", v, { def: "list", replace: true });
  const setDatePreset = (preset: string, o?: SheetWriteOptions) =>
    setMany({ preset: preset || null, from: null, to: null }, { replace: o?.replace });

  const toggleDatePreset = (preset: string) => setDatePreset(activePreset === preset ? "" : preset);

  const handleDateChange = (d: EventDateChange, o?: SheetWriteOptions) => {
    if (!d) {
      setMany({ preset: null, from: null, to: null }, { replace: o?.replace });
    } else if (d.mode === "preset") {
      setDatePreset(d.preset && d.preset !== "any-date" ? d.preset : "", o);
    } else if (d.start) {
      const from = pickedDay(d.start);
      const to = d.mode === "range" && d.end ? pickedDay(d.end) : null;
      setMany({ preset: null, from, to: to && to !== from ? to : null }, { replace: o?.replace });
    }
  };

  const handleClearFilters = (o?: SheetWriteOptions) => {
    setSearchQuery("");
    setUserLocation(null);
    if (o?.replace) {
      setMany(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), { replace: true });
    } else {
      clearParams(FILTER_KEYS);
    }
  };

  /** A preset writes category, price and date in ONE navigation (WP1 item 5). */
  const handleEventPreset = (filters: EventPresetFilters, o?: SheetWriteOptions) => {
    const entries: Record<string, string | null> = {};
    if (filters.category) entries.category = filters.category;
    if (filters.priceRange) entries.price = filters.priceRange;
    if (filters.datePreset) {
      entries.preset = filters.datePreset;
      entries.from = null;
      entries.to = null;
    }
    setMany(entries, { defaults: { category: "all", price: "any-price" }, replace: o?.replace });
  };

  const handleClearPreset = (filters: EventPresetFilters, o?: SheetWriteOptions) => {
    const entries: Record<string, string | null> = {};
    if (filters.category) entries.category = null;
    if (filters.priceRange) entries.price = null;
    if (filters.datePreset) entries.preset = null;
    setMany(entries, { replace: o?.replace });
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

  // "No results" and noindex wait until the box has been still for
  // SEARCH_SETTLE_MS (item 12), so "ja" on the way to "jazz" never flashes an
  // empty state. A shared ?q= link is settled from the first render.
  const [searchSettled, setSearchSettled] = useState(true);
  const typedOnce = useRef(false);
  useEffect(() => {
    if (!typedOnce.current) {
      typedOnce.current = true;
      return;
    }
    setSearchSettled(false);
    const timer = setTimeout(() => setSearchSettled(true), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ---------------------------------------------------------------------
  // The list. Pages APPEND (WP1 item 3): Load More used to swap page 1 for
  // page 2, and the header printed the page length as the total.
  // ---------------------------------------------------------------------
  const waitingForLocation = nearParam && !userLocation;
  const filterKey = {
    search: debouncedSearchQuery,
    category: selectedCategory,
    windowStart: hubFilters.window?.start ?? null,
    windowEnd: hubFilters.window?.end ?? null,
    area: area?.slug ?? null,
    free: hubFilters.freeOnly,
  };
  const listQuery = useInfiniteQuery({
    // WEB-PERF-032: nested under ["events","list"] so one invalidation reaches
    // every events list. `page` is deliberately not in the key: it only says
    // how much of this list to load first.
    queryKey: queryKeys.events.list({
      hub: "list",
      ...filterKey,
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
      // Near me answers in one page, capped or not.
      if (lastPage.complete || lastPage.capped !== undefined) return undefined;
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
  const nearMeCapped = Boolean(isNearMeActive && firstPage?.capped);
  // The list is showing the previous filters' rows while the new ones load.
  const isUpdating = listQuery.isPlaceholderData;

  // Paid placement (item 9): up to SPONSORED_CAP active sponsored rows that
  // match the filters lead the list, wherever they sit in organic order. The
  // placement is sold as "moved to the top of the list"; this used to move
  // only a row already on page 1. Position only - the price is server-side.
  const sponsoredQuery = useQuery({
    queryKey: queryKeys.events.list({ hub: "sponsored", ...filterKey }),
    queryFn: () => fetchSponsoredLead(hubFilters, new Date()),
    enabled: viewMode === "list" && !nearParam,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const { pinned, listEvents, allEvents } = useMemo(() => {
    // arrangeSponsored is the shared lift rule (active first, SPONSORED_CAP),
    // the same call every sponsored_listing page makes (placementSpecs.test).
    const lead =
      !nearParam && firstPage
        ? arrangeSponsored(sponsoredQuery.data)
            .filter(isSponsoredActive)
            .slice(0, SPONSORED_CAP)
        : [];
    const leadIds = new Set(lead.map((e) => e.id));
    const organic = flattenPages(pages, leadIds);
    return { pinned: lead, listEvents: organic, allEvents: [...lead, ...organic] };
  }, [nearParam, firstPage, sponsoredQuery.data, pages]);

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
    const nextPage = pages.length + (initialPage - 1) + 1;
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

  // The strip: only on the unfiltered list, and never in the prerender, whose
  // HTML would freeze "Starts in 40 min" (item 6).
  const tonightEnabled = activeFiltersCount === 0 && viewMode === "list" && !isPrerender();
  const tonightQuery = useTonightStripEvents(tonightEnabled, now);
  const stripItems = useMemo(
    () => (tonightEnabled ? selectTonight(tonightQuery.data ?? [], now) : []),
    [tonightEnabled, tonightQuery.data, now]
  );
  // Strip rows are already on screen; the list leaves them out (item 14).
  const stripIds = useMemo(() => new Set(stripItems.map((i) => i.event.id)), [stripItems]);
  // One LCP priority (item 11): the strip's first two cards when it shows,
  // otherwise the list's first three.
  const stripCount = stripItems.length;

  // Announce the count once per change. The visible count is NOT a live
  // region; announcing it twice was the old behaviour.
  const countText = isNearMeActive
    ? nearMeCountLabel(loadedCount, nearMeCapped)
    : countLabel(loadedCount, Math.max(totalCount, loadedCount));
  useEffect(() => {
    if (isInitialLoading || firstPageFailed || isUpdating) return;
    announce(`${countText}${debouncedSearchQuery ? ` matching "${debouncedSearchQuery}"` : ""}`);
  }, [countText, isInitialLoading, firstPageFailed, isUpdating, debouncedSearchQuery, announce]);

  // Categories load when someone opens the sheet or arrives with a category
  // (item 15), not on every visit. The canonical list stands in on error.
  const wantCategories = filtersOpen || selectedCategory !== "all";
  const categoriesQuery = useQuery({
    queryKey: ["event-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_categories");
      if (error) throw error;
      return (data || []).map((row: { category: string }) => row.category);
    },
    enabled: wantCategories,
    staleTime: 30 * 60 * 1000,
  });
  const categories = useMemo(() => {
    const rows = categoriesQuery.data;
    if (rows && rows.length > 0) return rows;
    return EVENT_CATEGORIES.filter(isCanonicalCategory);
  }, [categoriesQuery.data]);

  // Social counts, one query per loaded page plus one for the strip (item
  // 10). Load More adds a query; it doesn't refetch what's on screen.
  const socialGroups = useMemo(
    () => [
      pinned.map((e) => e.id),
      ...pages.map((p) => p.events.map((e) => e.id)),
      stripItems.map((i) => i.event.id),
    ],
    [pinned, pages, stripItems]
  );
  const { data: batchSocialData, isPending: batchSocialPending } =
    useBatchEventSocialGroups(socialGroups);

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

  // The FAQ's "Music venues" link is /events#events-directory. The router
  // doesn't scroll to a hash, so this does.
  useEffect(() => {
    if (hash !== `#${DIRECTORY_ID}`) return;
    document.getElementById(DIRECTORY_ID)?.scrollIntoView({ block: "start" });
  }, [hash]);

  // ---------------------------------------------------------------------
  // Empty state: offer ONE relaxation, measured by count-only HEAD queries.
  // ---------------------------------------------------------------------
  const isEmpty =
    !isInitialLoading && !firstPageFailed && !isUpdating && searchSettled && loadedCount === 0;
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
    firstPageFailed ||
    (Boolean(debouncedSearchQuery) && searchSettled) ||
    (selectedCategory !== "all" && !canonicalCategory);

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

  const renderCard = (event: HubEvent, index: number, options: { headingLevel: 3 | 4 }) => (
    <SocialEventCard
      priority={stripCount === 0 && index < 3}
      key={event.id}
      event={event}
      headingLevel={options.headingLevel}
      socialData={batchSocialData?.[event.id]}
      socialDataPending={batchSocialPending && !batchSocialData?.[event.id]}
      onViewDetails={handleViewEventDetails}
    />
  );

  const shownCardCount =
    pinned.filter((e) => !stripIds.has(e.id)).length +
    listEvents.filter((e) => !stripIds.has(e.id)).length;
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

  const barCountLabel = isInitialLoading
    ? "Loading events..."
    : firstPageFailed
    ? "Events unavailable"
    : isUpdating
    ? "Updating..."
    : isNearMeActive
    ? countText
    : `${countText} in Des Moines`;

  const sheetResultLabel = isInitialLoading
    ? undefined
    : isUpdating
    ? "Updating..."
    : isNearMeActive
    ? `Show ${countText}`
    : `Show ${countLabel(totalCount, totalCount)}`;

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
        />

        <EventFiltersSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          categories={categories}
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
          onApplyPreset={handleEventPreset}
          onClearPreset={handleClearPreset}
          activeFiltersCount={activeFiltersCount}
          onClearAll={handleClearFilters}
          resultLabel={sheetResultLabel}
          resultPending={isUpdating}
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
              items={stripItems}
              now={now}
              socialData={batchSocialData}
              socialDataPending={batchSocialPending}
              onViewDetails={handleViewEventDetails}
              priorityCount={2}
            />
          )}

          <div {...regionProps}>{announcement}</div>

          <div className="mb-3 min-w-0">
            <h2 className="text-xl font-bold text-foreground md:text-2xl">{resultsHeading}</h2>
            <ListFreshness rows={allEvents} className="mt-1" />
          </div>

          <EventsStickyBar
            className="mb-4"
            countLabel={barCountLabel}
            chips={eventChips}
            onClearAll={() => handleClearFilters()}
            onOpenFilters={() => setFiltersOpen(true)}
            activeFiltersCount={activeFiltersCount}
            sortBy={isNearMeActive ? "distance" : sortBy}
            onSortChange={setSortBy}
            sortOptions={isNearMeActive ? DISTANCE_SORT_OPTIONS : undefined}
            viewMode={viewMode}
            onViewChange={setView}
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

          {!isInitialLoading && !firstPageFailed && loadedCount > 0 && viewMode === "list" && (
            <div
              aria-busy={isUpdating || undefined}
              className={cn("transition-opacity", isUpdating && "opacity-60")}
              data-hub-list=""
            >
              <DayGroupedList
                events={listEvents}
                pinned={pinned}
                grouped={sortBy === "date_asc" && !isNearMeActive}
                now={now}
                relative={!isPrerender()}
                renderEvent={renderCard}
                insertAfter={{ index: Math.min(AD_AFTER_INDEX, shownCardCount - 1), node: adSlot }}
                hiddenIds={stripIds}
              />
            </div>
          )}

          {viewMode === "list" && listQuery.hasNextPage && loadedCount > 0 && (
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

          {viewMode === "list" && !listQuery.hasNextPage && loadedCount > 0 && !isNearMeActive && (
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
                  ? [{ label: "Clear all filters", onClick: () => handleClearFilters(), variant: "outline", icon: X }]
                  : undefined
              }
              compact={isMobile}
            >
              <div className="flex flex-col items-center gap-4">
                <QuickPicks
                  title="Or try one of these"
                  headingLevel={3}
                  className="flex flex-col items-center"
                  current={{
                    category: selectedCategory !== "all" ? selectedCategory : undefined,
                    priceRange: priceRange !== "any-price" ? priceRange : undefined,
                    datePreset: activePreset || undefined,
                  }}
                  onApplyPreset={handleEventPreset}
                  onClearPreset={handleClearPreset}
                />
                <Link
                  to="/events/this-weekend"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  See what's on this weekend
                </Link>
              </div>
            </EmptyState>
          )}
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

            {/* Below the fold: mounted when scrolled near (item 15). The
                prerender mounts both, so crawlers keep every link. */}
            <div id={DIRECTORY_ID} className="mx-auto mb-12 max-w-4xl scroll-mt-20">
              <LazySection minHeight={900} label="Browse Des Moines events">
                <EventsHubDirectory />
              </LazySection>
            </div>

            <div className="mx-auto mb-12 max-w-4xl">
              <LazySection minHeight={360} label="Guides and articles">
                <HubArticles hub="events" />
              </LazySection>
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
