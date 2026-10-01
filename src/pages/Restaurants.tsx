import { HubArticles } from "@/components/seo/HubArticles";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { AdBanner } from "@/components/AdBanner";
import SEOHead from "@/components/SEOHead";
import { RestaurantOpenings } from "@/components/RestaurantOpenings";
import {
  type RestaurantFilterOptions,
} from "@/components/RestaurantFilters";
import { RestaurantSmartPresets } from "@/components/RestaurantSmartPresets";
import { RestaurantInlineFilters } from "@/components/RestaurantInlineFilters";
import { RestaurantsTonightStrip } from "@/components/RestaurantsTonightStrip";
import { RestaurantsHubDirectory } from "@/components/seo/RestaurantsHubDirectory";
import { RestaurantsHubFaq, RestaurantsHubGuide } from "@/components/RestaurantsHubGuide";
import {
  useRestaurants,
  useInfiniteRestaurants,
  useRestaurantFilterOptions,
  useCuisineCounts,
  initialRestaurantPageParam,
  RESTAURANT_PAGE_SIZE,
} from "@/hooks/useRestaurants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardsGridSkeleton, LoadingSpinner } from "@/components/ui/loading-skeleton";
import { Star, DollarSign, Search, SearchX, Utensils, X, Sparkles, Clock, List, Map, SlidersHorizontal, TrendingUp, ChevronDown, ChevronUp, Shuffle, Loader2 } from "lucide-react";
import { useState, lazy, Suspense, useMemo, useCallback, useRef, useEffect, useSyncExternalStore, type MouseEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { BackToTop } from "@/components/BackToTop";
import { useAnnounce } from "@/hooks/use-announce";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import RestaurantCard from "@/components/RestaurantCard";
import { SPONSORED_CAP, arrangeSponsored, isSponsoredActive } from "@/lib/sponsored";
import { getRestaurantRotationSeed, pickDailySponsors } from "@/lib/restaurantRotation";
import { parseIowaAddress, restaurantLocality } from "@/lib/restaurantMeta";
import { isVisitableStatus } from "@/lib/restaurantHours";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { ActiveFilterChips } from "@/components/filters/ActiveFilterChips";
import { SearchAutocomplete, addRecentSearch } from "@/components/SearchAutocomplete";
import { DIETARY_OPTIONS } from "@/lib/restaurantPresets";
import { BRAND } from "@/lib/brandConfig";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

// Lazy load map component to prevent react-leaflet bundling issues
const RestaurantsMap = lazy(() => import("@/components/RestaurantsMap"));


const sortOptions = [
  // Labeled "Recommended", not "Most Popular" (WEB-QA-004). This option routes
  // through get_rotated_restaurants, which shuffles by a rotation seed so the
  // top of the list varies between visits — it is deliberately NOT a popularity
  // ranking, and calling it "Most Popular" told visitors the three venues at the
  // top were the city's favourites when the order was largely arbitrary.
  // "Highest Rated" below remains the deterministic quality sort.
  { value: "popularity", label: "Recommended", icon: TrendingUp },
  { value: "rating", label: "Highest Rated", icon: Star },
  // "Recently added", not "Newest" (pass 2 WP1 item 9): the sort is
  // created_at, which is when we scraped the row, not when it opened.
  // ?sort=newest is still the value, so shared links keep working.
  { value: "newest", label: "Recently added", icon: Clock },
  { value: "alphabetical", label: "A-Z", icon: SlidersHorizontal },
  { value: "price_low", label: "Price: Low-High", icon: DollarSign },
  { value: "price_high", label: "Price: High-Low", icon: DollarSign },
];

const ITEMS_PER_PAGE = RESTAURANT_PAGE_SIZE;

/**
 * Sponsored rows fetched for the two boosted slots (pass 2 WP1 item 8). The
 * query used to take the top two by popularity_score, so a third sponsor never
 * got the slot; pickDailySponsors rotates through up to this many.
 */
const SPONSOR_POOL = 10;

/** Search box to URL (pass 2 WP1 item 10). */
const SEARCH_DEBOUNCE_MS = 400;
/** No "No results" until typing has stopped this long, so it cannot flash mid-word. */
const SEARCH_IDLE_MS = 800;

/** Cards above the Tonight strip on a phone (pass 2 WP1 item 3). */
const CARDS_BEFORE_TONIGHT = 3;

/**
 * Cards before the openings strip, guides and the featured_spot ad. Nine is
 * three rows on desktop, so the first thing under the filters is results
 * (eat-drink plan WP1 item 6).
 */
const RESULTS_BEFORE_INTERSTITIAL = 9;

/** How many restaurants go into the ItemList. Both fields must use it. */
const RESTAURANT_SCHEMA_LIMIT = 20;


const FILTER_KEYS = ["q", "cuisine", "price", "rmin", "rmax", "location", "sort", "featured", "open", "tags"];

const DIETARY_LABELS: Record<string, string> = Object.fromEntries(
  DIETARY_OPTIONS.map((d) => [d.value, d.label])
);

/** A plain left click, which the router should handle; anything else is the browser's. */
function isPlainClick(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * A media query read synchronously on the first render. useIsMobile starts at
 * false and corrects in an effect, which on a phone fired the desktop list
 * query first and then the mobile one; a hub that picks its query by width
 * needs the width before the first fetch.
 */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false
  );
}

function scrollToResults() {
  document.getElementById("all-restaurants-heading")?.scrollIntoView({ behavior: "smooth" });
}

export default function Restaurants() {
  const navigate = useNavigate();
  const location = useLocation();
  // Same breakpoint as useIsMobile (768), read before the first query.
  const isMobile = useMediaQuery("(max-width: 767px)");
  // Tailwind's sm. Below it the Tonight strip moves under the third card.
  const isAboveSm = useMediaQuery("(min-width: 640px)");
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Filters are URL-synced (WEB-UX-001): shareable + survive back/forward.
  const { getStr, getNum, getList, setParam, setMany, clearParams } = useUrlFilters();

  // OPEN NOW IS NOT A FILTER HERE (eat-drink plan WP1 item 2). `?open=1` was a
  // flag nothing downstream read, while the banner reported the full total as
  // the open count. The hub no longer writes it, and a shared link that still
  // carries it gets a one-line pointer to /restaurants/open-now instead of a
  // chip that claims a filter is applied. Plan D2 brings a real one back.
  const legacyOpenNow = getStr("open", "") === "1";

  const filters: RestaurantFilterOptions = useMemo(
    () => ({
      search: getStr("q", ""),
      cuisine: getList("cuisine"),
      priceRange: getList("price"),
      rating: [getNum("rmin", 0), getNum("rmax", 5)],
      // Still read so old ?location= links keep filtering for one release
      // (URL rule in CLAUDE.md). Nothing on the hub writes a new value.
      location: getList("location"),
      sortBy: getStr("sort", "popularity") as RestaurantFilterOptions["sortBy"],
      featuredOnly: getStr("featured", "") === "1",
      openNow: false,
      tags: getList("tags"),
    }),
    [getStr, getNum, getList]
  );

  // setFilters-compatible writer (accepts an object or an updater) that persists
  // the whole filter object into the URL and resets pagination.
  const setFilters = useCallback(
    (
      update:
        | RestaurantFilterOptions
        | ((prev: RestaurantFilterOptions) => RestaurantFilterOptions)
    ) => {
      const next = typeof update === "function" ? update(filters) : update;
      setMany({
        q: next.search,
        cuisine: next.cuisine,
        price: next.priceRange,
        rmin: next.rating[0] !== 0 ? next.rating[0] : "",
        rmax: next.rating[1] !== 5 ? next.rating[1] : "",
        location: next.location,
        sort: next.sortBy !== "popularity" ? next.sortBy : "",
        featured: next.featuredOnly ? "1" : "",
        // Never written, and any filter change drops a legacy ?open=1.
        open: "",
        tags: next.tags,
      });
    },
    [filters, setMany]
  );

  const [searchInput, setSearchInput] = useState(() => getStr("q", ""));

  // Active-filter chips (WEB-UX-003) — each removal updates the URL via setFilters.
  const restaurantChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (filters.search)
      chips.push({ key: "q", label: `Search: "${filters.search}"`, onRemove: () => { setSearchInput(""); setParam("q", "", { resetsPage: true }); } });
    filters.cuisine.forEach((c) =>
      chips.push({ key: `cuisine-${c}`, label: c, onRemove: () => setFilters((p) => ({ ...p, cuisine: p.cuisine.filter((x) => x !== c) })) })
    );
    filters.priceRange.forEach((c) =>
      chips.push({ key: `price-${c}`, label: c, onRemove: () => setFilters((p) => ({ ...p, priceRange: p.priceRange.filter((x) => x !== c) })) })
    );
    filters.tags.forEach((t) =>
      // "Mentions vegan", not "Vegan" (pass 2 WP1 item 9): the filter is a
      // keyword match on the listing text, not a menu or a certification.
      chips.push({ key: `tag-${t}`, label: DIETARY_LABELS[t] ? `Mentions ${DIETARY_LABELS[t].toLowerCase()}` : t, onRemove: () => setFilters((p) => ({ ...p, tags: p.tags.filter((x) => x !== t) })) })
    );
    // ONE chip for the whole legacy ?location= value, never one per value.
    // The old Area pill wrote street addresses, and useUrlFilters splits list
    // params on commas, so "123 Grand Ave, Des Moines, IA" came back as three
    // meaningless chips. The filter is still applied, so it still needs a way
    // to be seen and removed.
    if (filters.location.length > 0)
      chips.push({ key: "location", label: "Area (from an old link)", onRemove: () => setFilters((p) => ({ ...p, location: [] })) });
    // ?featured=1 is read for one more release (URL rule in CLAUDE.md) and
    // nothing on the hub writes it any more. is_featured on restaurants is
    // set only on sponsored rows (20260902000004), so the chip says what the
    // filter actually selects (pass 2 WP1 item 2).
    if (filters.featuredOnly)
      chips.push({ key: "featured", label: "Sponsored only", onRemove: () => setFilters((p) => ({ ...p, featuredOnly: false })) });
    if (filters.rating[0] !== 0 || filters.rating[1] !== 5)
      chips.push({ key: "rating", label: `Rating ${filters.rating[0]}-${filters.rating[1]}`, onRemove: () => setFilters((p) => ({ ...p, rating: [0, 5] })) });
    return chips;
  }, [filters, setFilters, setParam]);

  // View is in the URL (item 11), so a shared map link opens on the map.
  const viewMode: "list" | "map" = getStr("view", "list") === "map" ? "map" : "list";
  const setViewMode = (mode: "list" | "map") => {
    setParam("view", mode, { def: "list" });
    if (mode === "map") requestAnimationFrame(scrollToResults);
  };
  const { toast } = useToast();

  const page = Math.max(1, Math.floor(getNum("page", 1)));
  /** Accepts a number OR a React-style updater. Three call sites below pass an
   *  updater (Load More / Previous / Next), and before this signature existed
   *  that function was handed straight to setParam, which does String(value) —
   *  serialising the function SOURCE into the ?page= param. getNum then parsed
   *  NaN and fell back to 1, so those controls silently did nothing. Surfaced by
   *  the strict type-check (WEB-CI-007). */
  const setPage = (v: number | ((prev: number) => number)) =>
    setParam("page", typeof v === "function" ? v(page) : v, { def: 1 });

  // WEB-PERF-029. THE PAGE ASKS FOR THE PAGE NOW. Desktop asks for one page
  // of thirty by offset.
  //
  // THE PHONE ASKS FOR THE NEXT THIRTY, NOT ALL OF THEM AGAIN (pass 2 WP1
  // item 7). Mobile asked for limit=page*30 from row 0 on every Load More, so
  // reaching row 478 moved about 4,000 rows. It is an infinite query of
  // offset pages now, keyed on the filters and the rotation seed; a cold
  // ?page=N loads at most two pages and offers "Load earlier results".
  const desktopQuery = useMemo(
    () => ({ ...filters, limit: ITEMS_PER_PAGE, offset: (page - 1) * ITEMS_PER_PAGE }),
    [filters, page]
  );
  const desktop = useRestaurants(desktopQuery, { enabled: !isMobile });
  const mobile = useInfiniteRestaurants(filters, { enabled: isMobile, startPage: page });

  const restaurants = isMobile ? mobile.restaurants : desktop.restaurants;
  const isLoading = isMobile ? mobile.isLoading : desktop.isLoading;
  const error = isMobile ? mobile.error : desktop.error;
  const totalCount = isMobile ? mobile.totalCount : desktop.totalCount;
  const suggestions = isMobile ? mobile.suggestions : desktop.suggestions;
  const refetch = isMobile ? mobile.refetch : desktop.refetch;
  /** 0-based index of the first row on screen. */
  const firstOffset = isMobile ? mobile.firstOffset : (page - 1) * ITEMS_PER_PAGE;

  // Load More writes ?page= with replace (pass 2 WP1 item 7), so a reload
  // restores the place and Back leaves the page instead of stepping through
  // every Load More. The key does not include the page, so this starts no
  // new query.
  const mobilePagesThrough = mobile.pagesThrough;
  useEffect(() => {
    if (!isMobile || mobilePagesThrough <= 0 || mobilePagesThrough === page) return;
    setParam("page", mobilePagesThrough, { def: 1, replace: true });
  }, [isMobile, mobilePagesThrough, page, setParam]);

  // Does the top of the visible list sit at row 1? Only then do sponsors go
  // above it. Before the mobile list has loaded, it is where it will start.
  const listStartsAtTop = isMobile
    ? mobile.restaurants.length > 0
      ? mobile.firstOffset === 0
      : initialRestaurantPageParam(page).offset === 0
    : page === 1;
  const boostsSponsored = listStartsAtTop;

  // PAID PLACEMENT CANNOT COME FROM A PAGE OF THIRTY.
  //
  // arrangeSponsored boosts up to two sponsored rows to the top of whatever
  // array it is handed, and that only worked because the array used to be every
  // restaurant -- a sponsored listing ranked 400th by rotation was still pulled
  // onto page 1. Bounding the fetch without this would have quietly ended that,
  // which is a contract question and not a performance decision.
  //
  // THE SPONSORED QUERY CARRIES THE VISITOR'S FILTERS (eat-drink plan WP1 item
  // 3). Boosting in place is the paid contract; relevance is what makes it
  // worth anything.
  //
  // SPONSORS ROTATE BY DAY (pass 2 WP1 item 8). Up to ten matching sponsors
  // in the same request, two picked with the daily Central seed, so a third
  // sponsor gets the slot on some days instead of never. Skipped entirely
  // where nothing is boosted (desktop pages 2+).
  const { restaurants: sponsoredPool } = useRestaurants(
    useMemo(
      () => ({ ...filters, sponsoredOnly: true, limit: SPONSOR_POOL, offset: 0 }),
      [filters]
    ),
    { enabled: boostsSponsored }
  );
  const rotationSeed = getRestaurantRotationSeed();
  const sponsoredRestaurants = useMemo(
    () => pickDailySponsors(sponsoredPool.filter(isSponsoredActive), rotationSeed, SPONSORED_CAP),
    [sponsoredPool, rotationSeed]
  );
  const filterOptions = useRestaurantFilterOptions();
  const { cuisineCounts } = useCuisineCounts();
  const { announce, announcement, regionProps } = useAnnounce();

  const handleSurpriseMe = useCallback(() => {
    // announced counts as not visitable now (pass 2 WP1 item 5): it could
    // send a visitor to a place that has not opened.
    const candidates = restaurants.filter((r) =>
      isVisitableStatus((r as { status?: string | null }).status)
    );
    if (candidates.length === 0) {
      toast({
        title: "Nothing to pick from",
        description: "None of the restaurants on this page are open for business yet. Try another page or clear a filter.",
      });
      return;
    }
    const random = candidates[Math.floor(Math.random() * candidates.length)];
    navigate(`/restaurants/${random.slug || random.id}`);
  }, [restaurants, navigate, toast]);

  // Boost up to 2 active sponsored listings to the top (WEB-FEAT-005), organic
  // order otherwise.
  //
  // NOTHING UNTIL THE ORGANIC ROWS ARE HERE (pass 2 WP1 item 1). The sponsored
  // query is cheaper and lands first, so this held two rows while the list
  // was still loading; the skeleton gate saw a non-empty array and the page
  // rendered "No restaurants available at the moment" over a list that was
  // on its way.
  const arrangedRestaurants = useMemo(() => {
    if (restaurants.length === 0) return [];
    if (!boostsSponsored || sponsoredRestaurants.length === 0) return restaurants;
    // De-duplicate: a sponsored restaurant that is also in this page's rotation
    // must appear once, at the top, not twice.
    const boostedIds = new Set(sponsoredRestaurants.map((r) => r.id));
    return arrangeSponsored([...sponsoredRestaurants, ...restaurants.filter((r) => !boostedIds.has(r.id))]);
  }, [restaurants, sponsoredRestaurants, boostsSponsored]);

  // The slicing is gone: the query returned this page. totalCount is the
  // unpaginated match count the RPC computes with a window function, so the
  // result counter and the page controls read the same numbers as before.
  const total = totalCount || 0;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
  const paginatedRestaurants = arrangedRestaurants;

  // A Load More in flight: the grid stays mounted and only the button spins.
  const isLoadingMore = isMobile && mobile.isFetchingNextPage;
  const isLoadingEarlier = isMobile && mobile.isFetchingPreviousPage;

  // Page reset on filter change is handled by setMany/setParam (resetsPage).

  // Debounced search -> URL (WEB-UX-001). Writing only the 'q' param avoids
  // history spam; setParam(replace) keeps typing out of the back stack.
  useEffect(() => {
    if (searchInput === filters.search) return;
    const timer = setTimeout(() => {
      setParam("q", searchInput, { def: "", resetsPage: true, replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, setParam]);

  // "No results" waits for typing to stop (pass 2 WP1 item 10). Until then an
  // empty list shows the skeleton, so "No results for 'har'" cannot flash
  // on the way to "harbinger".
  const [searchIdle, setSearchIdle] = useState(true);
  const lastTypedRef = useRef(searchInput);
  useEffect(() => {
    if (lastTypedRef.current === searchInput) return;
    lastTypedRef.current = searchInput;
    setSearchIdle(false);
    const timer = setTimeout(() => setSearchIdle(true), SEARCH_IDLE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Back/forward & shared links: pull URL search back into the input.
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  // Announce result count to screen readers
  useEffect(() => {
    if (!isLoading && restaurants) {
      // WEB-PERF-029: totalCount, not restaurants.length. The query returns one
      // page now, so counting the array would announce "Found 30 restaurants"
      // to a screen-reader user while the visible counter said 480.
      const count = totalCount || 0;
      const context = filters.search ? ` matching "${filters.search}"` : '';
      announce(`Found ${count} restaurant${count !== 1 ? 's' : ''}${context}`);
    }
  }, [totalCount, isLoading, filters.search, announce, restaurants]);

  const handleClearFilters = useCallback(() => {
    clearParams(FILTER_KEYS);
    setSearchInput("");
    toast({
      title: "Filters Cleared",
      description: "All filters have been reset",
    });
  }, [toast, clearParams]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    count += filters.cuisine.length;
    count += filters.priceRange.length;
    if (filters.location.length > 0) count++;
    count += filters.tags.length;
    if (filters.featuredOnly) count++;
    if (filters.rating[0] !== 0 || filters.rating[1] !== 5) count++;
    return count;
  }, [filters]);

  const hasActiveFilters = activeFiltersCount > 0;

  // THE COUNT IN THE COPY IS THE UNFILTERED TOTAL (item 5). Remembered from
  // the last unfiltered load, so filtering does not turn the guide's "470+"
  // into "12+", and null until one has loaded, so nothing is guessed.
  const [hubTotal, setHubTotal] = useState<number | null>(null);
  useEffect(() => {
    if (!hasActiveFilters && !isLoading && !error && totalCount > 0) setHubTotal(totalCount);
  }, [hasActiveFilters, isLoading, error, totalCount]);

  /** `?page=N` on top of whatever else is in the URL, so a page link is crawlable and shareable. */
  const pageHref = useCallback(
    (n: number) => {
      const params = new URLSearchParams(location.search);
      params.set("page", String(n));
      return `${location.pathname}?${params.toString()}`;
    },
    [location.pathname, location.search]
  );

  /** Router navigation for a plain click; a modified click opens the real href. */
  const goToPage = (n: number) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    setPage(n);
    scrollToResults();
  };

  // SEO data
  const restaurantsKeywords = [
    "Des Moines restaurants",
    "best restaurants Des Moines",
    "Des Moines dining guide",
    "restaurants near me Des Moines",
    "where to eat Des Moines Iowa",
    "Des Moines food",
    "Iowa restaurants",
    "Des Moines restaurant reviews",
    "new restaurants Des Moines",
    "Des Moines restaurant openings",
    "best food Des Moines",
    "downtown Des Moines restaurants",
    "West Des Moines restaurants",
    "East Village restaurants Des Moines",
    "cheap eats Des Moines",
    "fine dining Des Moines",
    "family restaurants Des Moines",
    "Des Moines brunch",
    "late night food Des Moines",
  ];

  // ONLY THE CANONICAL LIST GETS AN ItemList (item 12): page 1 with no
  // filters, which is the one URL a crawler should treat as this collection.
  // A filtered or paged view is a different list under the same canonical.
  const emitItemList = !hasActiveFilters && page === 1 && restaurants.length > 0;
  const schemaRows = restaurants.slice(0, RESTAURANT_SCHEMA_LIMIT);

  const restaurantsSchema = emitItemList
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Restaurants in Des Moines, Iowa",
        description:
          "Restaurants in Des Moines, Iowa, with menus, hours, prices and photos.",
        // numberOfItems COUNTS THE ITEMS ACTUALLY LISTED, not the collection the
        // page was drawn from. This read `totalCount || restaurants.length` while
        // itemListElement was sliced to 20, so the prerendered page declared an
        // ItemList of 478 and then supplied 20 - the only route of the ten emitting
        // an ItemList where the two numbers disagreed. Structured data that
        // contradicts itself is worse than none: it is a claim a crawler can check.
        numberOfItems: schemaRows.length,
        itemListElement: schemaRows.map((restaurant, index) => {
          // The same address reading as the detail page (pass 2 WP1 item 13):
          // `location` is the full address and `city` says "Des Moines" for
          // rows in West Des Moines, so both used to be wrong here.
          const parsed = parseIowaAddress(restaurant.location);
          // Each entry points at OUR page for the restaurant. It pointed at
          // the restaurant's own website, which told a crawler this list was
          // a list of other people's sites; the website is sameAs now.
          const pageUrl = `${BRAND.baseUrl}/restaurants/${restaurant.slug || restaurant.id}`;
          return {
            "@type": "ListItem",
            position: index + 1,
            url: pageUrl,
            item: {
              "@type": "Restaurant",
              "@id": pageUrl,
              url: pageUrl,
              name: restaurant.name,
              description: restaurant.description,
              servesCuisine: restaurant.cuisine,
              priceRange: restaurant.price_range,
              address: {
                "@type": "PostalAddress",
                streetAddress: parsed?.streetAddress || restaurant.location,
                addressLocality: restaurantLocality(restaurant) || "Des Moines",
                addressRegion: "IA",
                ...(parsed?.postalCode && { postalCode: parsed.postalCode }),
                addressCountry: "US",
              },
              ...(restaurant.image_url && { image: restaurant.image_url }),
              // WEB-SEO-025: no aggregateRating is emitted here.
              //
              // This block asserted a review count of Math.round(popularity_score * 2)
              // for the first 20 restaurants on the site's highest-impression page.
              // Google requires ratingCount to reflect real reviews; deriving one from
              // a popularity score is a review-snippet policy breach. WEB-SEO-016
              // removed the same invention from the detail page and left the reason in
              // RestaurantDetails.tsx; the hub kept doing it.
              //
              // aggregateRating may only come from content_rating_aggregates, and only
              // when total_ratings > 0. That table is not read here because the hub
              // renders 20 cards and would need a second query on the heaviest page in
              // the app (WEB-PERF-029) to publish a rating snippet nobody asked for.
              // Emitting nothing is correct until real counts are worth that cost;
              // emitting an invented one never was. scripts/check-duplicate-schema.mjs
              // fails the build if a computed ratingCount comes back.
              ...(restaurant.phone && { telephone: restaurant.phone }),
              ...(restaurant.website && { sameAs: restaurant.website }),
              geo: restaurant.latitude
                ? {
                    "@type": "GeoCoordinates",
                    latitude: restaurant.latitude,
                    longitude: restaurant.longitude,
                  }
                : undefined,
            },
          };
        }),
      }
    : undefined;

  // THE COUNTER COUNTS THE CARDS ON SCREEN (item 3). Boosted sponsored rows
  // are extra cards on top of the page's thirty, so they are named rather
  // than folded into a range that would then be off by two.
  const organicShown = restaurants.length;
  const sponsoredExtra = Math.max(0, paginatedRestaurants.length - organicShown);
  const firstShown = firstOffset + 1;
  const lastShown = firstShown + organicShown - 1;
  // A phone list that starts at row 1 says "Showing 60"; one restored from a
  // later page says which rows it holds.
  const shownRange = isMobile && firstOffset === 0 ? String(organicShown) : `${firstShown}-${lastShown}`;
  const counterText =
    isLoading
      ? "Searching..."
      : organicShown === 0
        ? `0 of ${total} restaurants`
        : `Showing ${shownRange} of ${total} restaurants${
            sponsoredExtra > 0 ? `, plus ${sponsoredExtra} sponsored` : ""
          }`;

  // PAST THE LAST PAGE (pass 2 WP1 item 10). A ?page=40 link on a list of
  // sixteen pages came back empty and said "Check back soon", as if there
  // were no restaurants. The RPC reports no total on an empty page, so one
  // row is asked for from the top to learn where the end is.
  const pastEnd = !isLoading && !error && restaurants.length === 0 && firstOffset > 0;
  const endProbe = useRestaurants(
    useMemo(() => ({ ...filters, limit: 1, offset: 0 }), [filters]),
    { enabled: pastEnd }
  );
  const lastPage = Math.max(1, Math.ceil((endProbe.totalCount || 0) / ITEMS_PER_PAGE));
  const showPastEnd = pastEnd && !endProbe.isLoading && endProbe.totalCount > 0;

  // Mobile Load More / Load earlier.
  const hasMorePages = isMobile ? !!mobile.hasNextPage : page < totalPages;
  const hasEarlierPages = isMobile && !!mobile.hasPreviousPage;

  // Nothing on screen yet: loading, or a search still being typed.
  const showSkeleton =
    (isLoading && paginatedRestaurants.length === 0) ||
    (!searchIdle && !error && paginatedRestaurants.length === 0) ||
    (pastEnd && endProbe.isLoading);

  // THE TONIGHT STRIP IS NOT THE FIRST THING ON A PHONE (pass 2 WP1 item 3).
  // Above sm it sits over the grid; below it goes after the third card, so
  // the first card title clears the bottom nav.
  const showTonight = !hasActiveFilters && viewMode === "list";
  const tonightInGrid = showTonight && !isAboveSm;

  // Openings, guides and the featured_spot ad sit AFTER the first results,
  // and only on the unfiltered hub: a visitor who searched wants results.
  const showInterstitial = !hasActiveFilters && viewMode === "list" && listStartsAtTop;
  const firstCards = paginatedRestaurants.slice(0, RESULTS_BEFORE_INTERSTITIAL);
  const restCards = paginatedRestaurants.slice(RESULTS_BEFORE_INTERSTITIAL);
  const cardsBeforeTonight = tonightInGrid ? firstCards.slice(0, CARDS_BEFORE_TONIGHT) : firstCards;
  const cardsAfterTonight = tonightInGrid ? firstCards.slice(CARDS_BEFORE_TONIGHT) : [];

  const suggestionLinks = suggestions.filter((sg): sg is typeof sg & { slug: string } => !!sg.slug);

  // An unfiltered ?page=N is its own canonical (pass 2 WP1 item 10): it is a
  // different slice of the list, and pointing it at page 1 told crawlers
  // rows 31-478 were duplicates of rows 1-30.
  const canonicalPath = !hasActiveFilters && page > 1 ? `/restaurants?page=${page}` : "/restaurants";

  const heroPill =
    "rounded-full text-sm min-h-11 sm:min-h-9 bg-white/15 hover:bg-white/25 text-white border-white/20";

  return (
    <>
      <SEOHead
        title="Best Restaurants in Des Moines, Iowa"
        description="Des Moines restaurants with menus, hours, prices and photos. Filter by cuisine, price or dietary need, or see what's open now."
        type="website"
        keywords={restaurantsKeywords}
        structuredData={restaurantsSchema}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Restaurants", url: "/restaurants" },
        ]}
        url={canonicalPath}
        // A search results page is thin and endless; keep it out of the index
        // but let crawlers follow through to the restaurants it lists.
        robots={filters.search ? "noindex, follow" : undefined}
      />
      {/* WEB-UX-030: bg-gray-50 had no dark counterpart, so in dark mode the
          dark:text-gray-100 section headings below rendered near-white on
          near-white (3.0:1 at best). */}
      <div className="min-h-screen bg-gray-50 dark:bg-background">
        <Header />

        {/* Hero. One flat brand surface (WP1 item 13): the gradient and three
            blurred orbs cost paint time and said nothing. Compact on a phone
            so the first card is in the first viewport (item 6). */}
        <section className="relative bg-[#2D1B69]">
          <div className="relative container mx-auto px-4 pt-5 pb-6 sm:pt-8 sm:pb-10 md:pt-12 md:pb-16">
            {/* Title */}
            <div className="text-center mb-3 sm:mb-5 md:mb-10">
              {/*
                SEO-026. Two things were wrong here and both were only visible
                from outside the component.

                The rendered text was "Des MoinesRestaurant Guide" - a block
                span directly after a text node, so the accessible name and
                every crawler read it with no space. It looked correct in the
                browser because the span is display:block.

                And it did not contain the term the page is titled for. The
                <title> says "Best Restaurants in Des Moines, Iowa" while the
                H1 said "Restaurant Guide", so the page's two strongest signals
                disagreed on what it is about. "des moines restaurants" and
                "best restaurants in des moines" are both 50,000-bucket at
                competition index 11, against 87 for the things-to-do terms -
                this is the head term worth agreeing on.
              */}
              <h1 className="text-2xl leading-[1.1] sm:text-3xl sm:leading-9 md:leading-none md:text-5xl lg:text-6xl font-extrabold text-white sm:mb-4 tracking-tight">
                Best Restaurants in{' '}
                {/* WEB-UX-034: was a bg-clip-text gradient. Gradient text is
                    decorative rather than meaningful, and on an h1 it costs
                    legibility for nothing - emphasis here comes from the block
                    break and the weight the heading already carries.
                    whitespace-nowrap (pass 2 WP1 item 3): at 390px the line
                    broke inside the city name, "Des / Moines". */}
                <span className="whitespace-nowrap sm:block text-amber-300">
                  Des Moines
                </span>
              </h1>
              <p className="hidden sm:block text-lg md:text-xl text-white/80 max-w-2xl mx-auto">
                Search by cuisine, price or dietary need, see what opened this month, and find
                dinner near tonight's show.
              </p>
            </div>

            {/* Search Bar - The Main Event */}
            <div className="max-w-3xl mx-auto">
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 z-10" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder={isMobile ? "Search restaurants..." : "Search restaurants or cuisines..."}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchInput.trim()) {
                      addRecentSearch('restaurants', searchInput);
                    }
                  }}
                  className="w-full h-12 sm:h-14 pl-14 pr-36 text-base md:text-lg bg-white border-0 rounded-2xl focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-0 placeholder:text-slate-500"
                  aria-label="Search restaurants"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {searchInput && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 sm:h-8 sm:w-8 text-slate-500 hover:text-slate-900"
                      onClick={() => {
                        setSearchInput("");
                        setFilters((prev) => ({ ...prev, search: "" }));
                        searchInputRef.current?.focus();
                      }}
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    className="h-10 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-5 font-semibold"
                    onClick={() => {
                      if (searchInput.trim()) addRecentSearch('restaurants', searchInput);
                      setFilters((prev) => ({ ...prev, search: searchInput }));
                    }}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
                <SearchAutocomplete
                  contentType="restaurants"
                  value={searchInput}
                  onSelect={(val) => {
                    setSearchInput(val);
                    setFilters((prev) => ({ ...prev, search: val }));
                  }}
                  onSelectCuisine={(c) => {
                    setSearchInput("");
                    setFilters((prev) => ({ ...prev, search: "", cuisine: [c] }));
                  }}
                  inputRef={searchInputRef}
                />
              </div>

              {/* Quick action pills below search */}
              <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSurpriseMe}
                  disabled={restaurants.length === 0}
                  className={`${heroPill} min-w-11`}
                >
                  <Shuffle className="h-3.5 w-3.5 sm:mr-1.5" aria-hidden="true" />
                  {/* Icon-only on a phone, so the whole row fits on one line
                      and the first card stays in the first viewport. */}
                  <span className="sr-only sm:not-sr-only">Surprise Me</span>
                </Button>
                {/* A link, not a toggle (item 2): the open-now page is the one
                    place that checks hours against the clock. */}
                <Button asChild variant="secondary" size="sm" className={heroPill}>
                  <Link to="/restaurants/open-now">
                    <SpriteIcon name="clock" className="hidden sm:inline h-3.5 w-3.5 mr-1.5" />
                    Open Now
                  </Link>
                </Button>
                {/* No Featured pill (pass 2 WP1 item 2). Nothing editorial
                    sets is_featured on restaurants; only sponsored rows kept
                    it (20260902000004), so the pill was a paid filter under
                    an editorial name. An old ?featured=1 link still works and
                    shows a "Sponsored only" chip. */}

                {/* View Mode Toggle - 44px at every breakpoint (item 11) */}
                <div className="flex items-center rounded-full bg-white/15 p-0.5" role="group" aria-label="Results view">
                  <Button
                    onClick={() => setViewMode("list")}
                    variant="ghost"
                    size="icon"
                    aria-pressed={viewMode === "list"}
                    className={`h-11 w-11 rounded-full ${
                      viewMode === "list"
                        ? "bg-white/30 text-white"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => setViewMode("map")}
                    variant="ghost"
                    size="icon"
                    aria-pressed={viewMode === "map"}
                    className={`h-11 w-11 rounded-full ${
                      viewMode === "map"
                        ? "bg-white/30 text-white"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                    aria-label="Map view"
                  >
                    <Map className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Curved bottom edge. currentColor, so it matches the page in both
              themes; a literal #f9fafb left a pale band in dark mode. */}
          <div className="absolute bottom-0 left-0 right-0 text-gray-50 dark:text-background" aria-hidden="true">
            <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full block">
              <path d="M0 60L1440 60L1440 0C1440 0 1080 60 720 60C360 60 0 0 0 0L0 60Z" fill="currentColor" />
            </svg>
          </div>
        </section>

        <div className="container mx-auto px-4 pt-3 pb-4 md:py-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Restaurants" },
            ]}
            className="hidden sm:flex mb-4"
          />
          <div className="space-y-2 sm:space-y-6">
            {/* Smart Preset Filters - one-tap scenarios */}
            <RestaurantSmartPresets onApplyPreset={setFilters} filters={filters} />

            {/* ONE sticky bar (item 6): filter pills, sort, the count and the
                removable chips, in list and map view alike. */}
            <div className="sticky top-16 z-30 -mx-4 px-4 py-1.5 sm:py-2 space-y-1.5 bg-gray-50/95 dark:bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80 dark:supports-[backdrop-filter]:bg-background/80">
              {/* Pills and sort share one row at every width; the pills
                  scroll inside their own box, so the bar is two short lines
                  on a phone rather than three. */}
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <RestaurantInlineFilters
                    filters={filters}
                    onFiltersChange={setFilters}
                    availableCuisines={filterOptions.cuisines}
                  />
                </div>
                <Select
                  value={filters.sortBy}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, sortBy: value as RestaurantFilterOptions["sortBy"] }))
                  }
                >
                  <SelectTrigger aria-label="Sort restaurants" className="w-36 sm:w-40 min-h-11 shrink-0 bg-white dark:bg-card rounded-xl text-sm">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Results count — visible at all viewports (WEB-UX-003).
                  WEB-PERF-029: the "of N" is totalCount, not the length of
                  the fetched array, which is one page. */}
              {/* In map view the map carries its own count ("N of M mapped"),
                  so there is one total on screen, not two (pass 2 WP1 item 11). */}
              {viewMode === "list" && (
                <p className="text-sm text-muted-foreground" data-results-count="">
                  {counterText}
                </p>
              )}
              {restaurantChips.length > 0 && (
                <ActiveFilterChips onClearAll={handleClearFilters} chips={restaurantChips} />
              )}
            </div>

            {legacyOpenNow && (
              <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground" role="status">
                This list doesn't filter by hours.{" "}
                <Link to="/restaurants/open-now" className="font-semibold text-primary underline-offset-4 hover:underline">
                  See restaurants open now
                </Link>
              </p>
            )}

            {showTonight && isAboveSm && <RestaurantsTonightStrip />}

            {/* Main Restaurant Grid */}
            <section aria-labelledby="all-restaurants-heading">
              <h2
                id="all-restaurants-heading"
                className="sr-only sm:not-sr-only sm:mb-4 text-2xl font-bold text-foreground scroll-mt-40"
              >
                {hasActiveFilters ? "Search Results" : "All Restaurants"}
              </h2>

              {showSkeleton ? (
                <CardsGridSkeleton
                  count={9}
                  variant="restaurant"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
                  label={filters.search ? `Searching for "${filters.search}"...` : filters.cuisine.length > 0 ? `Loading ${filters.cuisine.join(', ')} restaurants...` : "Loading restaurants..."}
                />
              ) : error ? (
                <ErrorState error={error} onRetry={() => refetch()} />
              ) : showPastEnd ? (
                <EmptyState
                  icon={SearchX}
                  title="That page is past the end"
                  description={`This list has ${lastPage} page${lastPage === 1 ? "" : "s"}.`}
                >
                  <p className="mt-2 text-sm">
                    <Link
                      to={pageHref(lastPage)}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      Go to page {lastPage}
                    </Link>
                  </p>
                </EmptyState>
              ) : restaurants.length === 0 ? (
                <EmptyState
                  icon={hasActiveFilters ? SearchX : Utensils}
                  title={
                    filters.search
                      ? `No results for "${filters.search}"`
                      : "No restaurants found"
                  }
                  description={
                    hasActiveFilters
                      ? "Try adjusting your search criteria or filters to find more restaurants."
                      : "No restaurants are listed right now."
                  }
                  actions={
                    hasActiveFilters
                      ? [
                          {
                            label: "Clear All Filters",
                            onClick: handleClearFilters,
                            variant: "outline",
                            icon: X,
                          },
                          {
                            label: "Browse All",
                            onClick: () => {
                              handleClearFilters();
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            },
                            icon: Sparkles,
                          },
                        ]
                      : undefined
                  }
                >
                  {/* Slugs only (pass 2 WP1 item 5): the fuzzy RPC returns no
                      slug, so every link went to /restaurants/<uuid>. The hook
                      looks the ids up again; a row with no slug is left out. */}
                  {filters.search && suggestionLinks.length > 0 && (
                    <p className="mt-2 text-sm text-muted-foreground" data-did-you-mean="">
                      Did you mean{" "}
                      {suggestionLinks.map((s, i) => (
                        <span key={s.id}>
                          {i > 0 && ", "}
                          <Link
                            to={`/restaurants/${s.slug}`}
                            className="font-semibold text-primary underline-offset-4 hover:underline"
                          >
                            {s.name}
                          </Link>
                        </span>
                      ))}
                      ?
                    </p>
                  )}
                </EmptyState>
              ) : viewMode === "map" ? (
                <Suspense fallback={<LoadingSpinner label="Loading map..." />}>
                  <RestaurantsMap restaurants={restaurants} filters={filters} />
                </Suspense>
              ) : (
                <>
                  {hasEarlierPages && (
                    <div className="mb-6">
                      <Button
                        variant="outline"
                        className="w-full min-h-11"
                        disabled={isLoadingEarlier}
                        aria-busy={isLoadingEarlier}
                        onClick={() => void mobile.fetchPreviousPage()}
                      >
                        {isLoadingEarlier ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        ) : (
                          <ChevronUp className="h-4 w-4 mr-2" aria-hidden="true" />
                        )}
                        {isLoadingEarlier ? "Loading earlier results..." : "Load earlier results"}
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {cardsBeforeTonight.map((restaurant, index) => (
                      <RestaurantCard
                        priority={index < 3}
                        key={restaurant.id}
                        restaurant={restaurant}
                      />
                    ))}
                  </div>

                  {tonightInGrid && <RestaurantsTonightStrip className="mt-6" />}

                  {cardsAfterTonight.length > 0 && (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {cardsAfterTonight.map((restaurant) => (
                        <RestaurantCard key={restaurant.id} restaurant={restaurant} />
                      ))}
                    </div>
                  )}

                  {showInterstitial && (
                    <div className="my-10 space-y-8">
                      <div>
                        {/* Renders its own heading and /restaurants/new link. */}
                        <RestaurantOpenings />
                      </div>
                      <HubArticles hub="restaurants" />
                      <AdBanner placement="featured_spot" />
                    </div>
                  )}

                  {restCards.length > 0 && (
                    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 ${showInterstitial ? "" : "mt-6"}`}>
                      {restCards.map((restaurant) => (
                        <RestaurantCard key={restaurant.id} restaurant={restaurant} />
                      ))}
                    </div>
                  )}

                  {/* Pagination controls. Gated on the TOTAL: the old gate
                      compared a 30-row page against 30, so it never showed and
                      447 of 477 restaurants were unreachable (item 1). */}
                  {isMobile ? (
                    hasMorePages && (
                      <div className="mt-8">
                        <Button
                          variant="outline"
                          className="w-full min-h-11"
                          disabled={isLoadingMore}
                          aria-busy={isLoadingMore}
                          onClick={() => void mobile.fetchNextPage()}
                        >
                          {isLoadingMore ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-4 w-4 mr-2" aria-hidden="true" />
                          )}
                          {isLoadingMore ? "Loading more restaurants..." : "Load More Restaurants"}
                        </Button>
                      </div>
                    )
                  ) : (
                    totalPages > 1 && (
                      <div className="mt-8">
                        <Pagination>
                          <PaginationContent>
                            {page > 1 && (
                              <PaginationItem>
                                <PaginationPrevious
                                  href={pageHref(page - 1)}
                                  onClick={goToPage(page - 1)}
                                />
                              </PaginationItem>
                            )}
                            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                              let pageNum: number;
                              if (totalPages <= 5) {
                                pageNum = i + 1;
                              } else if (page <= 3) {
                                pageNum = i + 1;
                              } else if (page >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                              } else {
                                pageNum = page - 2 + i;
                              }
                              return (
                                <PaginationItem key={pageNum}>
                                  <PaginationLink
                                    href={pageHref(pageNum)}
                                    isActive={pageNum === page}
                                    onClick={goToPage(pageNum)}
                                  >
                                    {pageNum}
                                  </PaginationLink>
                                </PaginationItem>
                              );
                            })}
                            {totalPages > 5 && page < totalPages - 2 && (
                              <PaginationItem>
                                <PaginationEllipsis />
                              </PaginationItem>
                            )}
                            {page < totalPages && (
                              <PaginationItem>
                                <PaginationNext
                                  href={pageHref(page + 1)}
                                  onClick={goToPage(page + 1)}
                                />
                              </PaginationItem>
                            )}
                          </PaginationContent>
                        </Pagination>
                      </div>
                    )
                  )}
                </>
              )}
            </section>

            {/* Below-Fold Ad */}
            <div className="my-8">
              <AdBanner placement="below_fold" />
            </div>

            {/* Every way in: open now, new, dietary, breweries, neighborhoods
                and cuisines, as crawlable links (item 8). */}
            <RestaurantsHubDirectory
              cuisineCounts={cuisineCounts}
              onCuisineClick={scrollToResults}
              className="py-8"
            />

            <RestaurantsHubGuide restaurantCount={hubTotal} cuisineCount={cuisineCounts.length} />
          </div>
        </div>

        {/* Screen reader announcement for result count changes. Outside the
            spaced column, where an empty live region still took a gap. */}
        <div {...regionProps}>{announcement}</div>

        <RestaurantsHubFaq restaurantCount={hubTotal} cuisineCount={cuisineCounts.length} />

        <Footer />
        <BackToTop />
      </div>
    </>
  );
}
