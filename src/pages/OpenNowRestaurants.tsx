import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatInTimeZone } from "date-fns-tz";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FAQSection, type FAQItem } from "@/components/FAQSection";
import { RestaurantCard } from "@/components/RestaurantCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import RelatedContent from "@/components/RelatedContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ErrorState } from "@/components/ui/error-state";
import {
  applyOpenNowFilters,
  cuisineValues,
  deriveOpenNow,
  facetCounts,
  OPEN_AT_OPTIONS,
  OPEN_NOW_ROW_LIMIT,
  orderByDistance,
  resolveOpenAt,
  useOpenNowRestaurants,
  type Coordinates,
  type EvaluatedRestaurant,
  type OpenNowRestaurantRow,
} from "@/hooks/useOpenNowRestaurants";
import { DIETS, dietFromParam } from "@/hooks/useDietaryRestaurants";
import { useDishSearch, type DishMatch } from "@/hooks/useDishSearch";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { EVENT_AREAS, findEventArea } from "@/lib/eventAreas";
import { isPrerender } from "@/lib/isPrerender";
import {
  DES_MOINES_TIME_ZONE,
  formatOpenStatusLine,
  getRestaurantOpenStatus,
} from "@/lib/restaurantHours";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";

/**
 * /restaurants/open-now (eat-drink plan WP5; pass 2 WP4.1-4.6).
 *
 * Every restaurant with listed hours is fetched once; which of them is open
 * is re-derived each minute on the Central clock, so a place leaves the list
 * at its close without a refetch. "Open at" re-runs the same evaluator at
 * tonight's 9, 10 or 11 PM or midnight, and the filters narrow the rows
 * already loaded, so neither adds a query. Every filter lives in the URL.
 *
 * In the build-time prerender the page is a description of the method, with
 * no clock, count or list: anything time-bound would be whatever the build saw.
 */

const PAGE_TITLE = `Restaurants Open Now in Des Moines | ${BRAND.name}`;
// Static on purpose: a count here would be whatever the prerender saw.
const PAGE_DESCRIPTION =
  "Which Des Moines restaurants are open right now, checked against each place's listed hours in Central time. Call ahead on holidays.";

const BREADCRUMBS = [
  { name: "Restaurants", url: "/restaurants" },
  { name: "Open Now", url: "/restaurants/open-now" },
];

/**
 * The FAQ ships as FAQPage JSON-LD, so each answer says only what this page
 * does. Pass 2 WP4.6 cut the answers nothing in the data backed: Sunday
 * brunch hours, winter and State Fair hours, "fewer 24-hour options", and
 * delivery windows.
 */
const FAQ_DATA: FAQItem[] = [
  {
    question: "Which restaurants in Des Moines are open right now?",
    answer:
      "This page checks the listed hours of every restaurant we track against the current time in Des Moines (Central time) and shows the ones that are open. Listed hours can be out of date, so call ahead if you're cutting it close.",
  },
  {
    question: "How does this page decide a place is open?",
    answer:
      "It reads the hours text on each restaurant's listing and checks it against the time in Des Moines. When we can't read a place's hours, we don't call it open or closed; it goes in the \"Hours we couldn't read\" list with a link to its page.",
  },
  {
    question: "Can I see what's open later tonight?",
    answer:
      "Yes. Pick a time under \"Open at\" (9 PM, 10 PM, 11 PM or midnight) and the list shows the places whose listed hours have them open then. The time and any filters go in the page address, so the link shares the same view.",
  },
  {
    question: "What restaurants are open late in Des Moines?",
    answer:
      "Pick midnight under \"Open at\". Until midnight, this page also lists every place whose listed hours have it open at 12:30 AM. Hours differ by day, so check the day on the place's own page.",
  },
  {
    question: "Are holiday and seasonal hours included?",
    answer: "No. Holiday and seasonal hours aren't in our listings, so call ahead on a holiday.",
  },
];

/** Cards before the list switches to compact rows (WP4.3). */
const CARD_LIMIT = 24;
/** Compact rows shown before "Show all". */
const ROW_PREVIEW = 36;

const FILTER_KEYS = ["at", "cuisine", "city", "hour", "area", "diet", "dish"];

function centralHour(now: Date): number {
  return Number(formatInTimeZone(now, DES_MOINES_TIME_ZONE, "H"));
}

function timeOfDayHeading(hour: number): string {
  if (hour >= 5 && hour < 11) return "Breakfast and brunch spots open now";
  if (hour >= 11 && hour < 16) return "Lunch spots open now";
  if (hour >= 16 && hour < 21) return "Dinner options open now";
  return "Late-night food open now";
}

function restaurantHref(restaurant: Pick<OpenNowRestaurantRow, "slug" | "id">): string {
  return `/restaurants/${restaurant.slug || restaurant.id}`;
}

/** `grid` is 0 for the first grid on the page, whose first row is the LCP candidate. */
function RestaurantGrid({ items, grid }: { items: readonly EvaluatedRestaurant[]; grid: number }) {
  return (
    <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" role="list">
      {items.map(({ restaurant }, index) => (
        <li key={restaurant.id} className="content-auto" data-open-now-card>
          <RestaurantCard restaurant={restaurant} priority={grid === 0 && index < 3} />
        </li>
      ))}
    </ul>
  );
}

function RestaurantLinkList({ items }: { items: readonly EvaluatedRestaurant[] }) {
  return (
    <ul className="divide-y divide-border rounded-xl border">
      {items.map(({ restaurant, status }) => {
        const detail = [cuisineValues(restaurant)[0], restaurant.city?.trim()].filter(Boolean).join(", ");
        return (
          <li
            key={restaurant.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
            data-open-now-row
          >
            <span className="min-w-0">
              <Link to={restaurantHref(restaurant)} className="font-semibold text-foreground hover:text-primary hover:underline">
                {restaurant.name}
              </Link>
              {detail && <span className="ml-2 text-sm text-muted-foreground">{detail}</span>}
            </span>
            <span className="text-sm text-muted-foreground">{formatOpenStatusLine(status)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Cards for the first `cards` items, then compact rows with "Show all". */
function CappedList({
  items,
  cards,
  grid,
  label,
}: {
  items: readonly EvaluatedRestaurant[];
  cards: number;
  grid: number;
  label: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const cardItems = items.slice(0, cards);
  const rows = items.slice(cards);
  const shownRows = showAll ? rows : rows.slice(0, ROW_PREVIEW);
  return (
    <>
      {cardItems.length > 0 && <RestaurantGrid items={cardItems} grid={grid} />}
      {rows.length > 0 && (
        <div className={cardItems.length > 0 ? "mt-6" : undefined}>
          <RestaurantLinkList items={shownRows} />
          {rows.length > shownRows.length && (
            <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={() => setShowAll(true)}>
              Show all {rows.length} more {label}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function priceText(price: string | null): string | null {
  const p = price?.trim();
  if (!p) return null;
  return /^\d+(\.\d{1,2})?$/.test(p) ? `$${p}` : p;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "Pho tai $13 at X, open until 9 PM" for the matches open at `at`. Nothing when the menus have nothing. */
function DishResults({
  term,
  matches,
  rowsById,
  at,
  whenLabel,
}: {
  term: string;
  matches: readonly DishMatch[];
  rowsById: ReadonlyMap<string, OpenNowRestaurantRow>;
  at: Date;
  whenLabel: string;
}) {
  if (matches.length === 0) return null;
  const places = new Set(matches.map((m) => m.restaurant_id));
  const open = matches
    .map((match) => {
      const row = rowsById.get(match.restaurant_id);
      const status = row ? getRestaurantOpenStatus(row.opening, at) : null;
      return row && status?.isOpen ? { match, row, line: formatOpenStatusLine(status) } : null;
    })
    .filter((x): x is { match: DishMatch; row: OpenNowRestaurantRow; line: string | null } => x !== null)
    .slice(0, 12);

  return (
    <section aria-labelledby="dish-results-heading" className="mb-8 max-w-3xl" data-open-now-dishes>
      <h2 id="dish-results-heading" className="mb-2 text-xl font-semibold">
        &ldquo;{term}&rdquo; on menus we have
      </h2>
      {open.length === 0 ? (
        <p className="text-muted-foreground">
          {places.size} {places.size === 1 ? "place lists" : "places list"} it; none is open {whenLabel}.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border">
          {open.map(({ match, row, line }) => (
            <li key={match.item_id} className="px-4 py-3">
              <span className="font-medium">{match.item_name}</span>
              {priceText(match.price) && <> <span className="tabular-nums">{priceText(match.price)}</span></>} at{" "}
              <Link to={restaurantHref(row)} className="font-semibold text-primary hover:underline">
                {row.name}
              </Link>
              {line ? `, ${lowerFirst(line)}` : ""}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-muted-foreground">From menus we've captured. Prices and dishes change, so check with the place.</p>
    </section>
  );
}

/** A single-select row of chips. Pressing the pressed chip clears it. */
function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; count: number }>;
  value: string;
  onChange: (value: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-medium text-muted-foreground">{label}</span>
      {options.map((option) => {
        const pressed = option.value.toLowerCase() === value.toLowerCase();
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={pressed ? "default" : "outline"}
            aria-pressed={pressed}
            className="min-h-11"
            onClick={() => onChange(pressed ? "" : option.value)}
          >
            {option.value}
          </Button>
        );
      })}
    </div>
  );
}

const SELECT_CLASS =
  "h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type NearMeState = { kind: "off" } | { kind: "locating" } | { kind: "on"; origin: Coordinates } | { kind: "failed"; message: string };

/** The static page: the method, not a snapshot. */
function PrerenderedMethod() {
  return (
    <div className="mb-10 max-w-[70ch] space-y-4 text-lg text-muted-foreground" data-open-now-static>
      <p>
        This page checks each place's listed hours against the time in Des Moines when you open it, and lists the ones
        that are open. You can also pick a time later tonight, up to midnight, and narrow the list by cuisine, city, area
        or diet.
      </p>
      <p className="text-base">
        Or browse <Link to="/restaurants" className="font-semibold text-primary hover:underline">all Des Moines restaurants</Link>{" "}
        and <Link to="/restaurants/new" className="font-semibold text-primary hover:underline">new restaurants</Link>.
      </p>
    </div>
  );
}

function HowThisWorks() {
  return (
    <section aria-labelledby="how-open-now-heading" className="mb-10 max-w-[70ch]">
      <h2 id="how-open-now-heading" className="mb-3 text-xl font-semibold">
        How this page works
      </h2>
      <p className="mb-3 text-muted-foreground">
        Each restaurant's listing carries its hours as text. We read that text and check it against the time in Des Moines,
        once a minute while the page is open. A place whose hours we can't read isn't counted as open or closed.
      </p>
      <p className="mb-3 text-muted-foreground">
        Holiday and seasonal hours aren't in our listings, and a kitchen can stop taking orders before the posted close.
        Call ahead if you're cutting it close.
      </p>
      <p className="text-muted-foreground">
        Looking for a diet? See{" "}
        <Link to="/restaurants/dietary" className="font-semibold text-primary hover:underline">
          restaurants by diet
        </Link>
        , or use the diet filter above.
      </p>
    </section>
  );
}

export default function OpenNowRestaurants() {
  const prerender = isPrerender();
  const now = useMinuteClock();
  const { data: rows, isLoading, error, refetch } = useOpenNowRestaurants({ enabled: !prerender });
  const { getStr, setParam, clearParams } = useUrlFilters();
  const formId = useId();
  const [nearMe, setNearMe] = useState<NearMeState>({ kind: "off" });

  const atParam = getStr("at", "");
  const cuisine = getStr("cuisine", "");
  const city = getStr("city", "");
  const oneMoreHour = getStr("hour", "") === "1";
  const area = findEventArea(getStr("area", "")) ?? null;
  const diet = dietFromParam(getStr("diet", ""));
  const dish = getStr("dish", "");

  const openAt = resolveOpenAt(atParam, now);
  const evalAt = openAt?.instant ?? now;
  const whenLabel = openAt ? `at ${openAt.clock} ${openAt.when}` : "right now";

  const filtered = useMemo(
    () => (rows ? applyOpenNowFilters(rows, { cuisine, city, area, diet }) : null),
    [rows, cuisine, city, area, diet],
  );
  const view = useMemo(
    () => (filtered ? deriveOpenNow(filtered, evalAt, 5, oneMoreHour ? 60 : 0) : null),
    [filtered, evalAt, oneMoreHour],
  );
  const cuisineOptions = useMemo(() => (rows ? facetCounts(rows, cuisineValues, 10) : []), [rows]);
  const cityOptions = useMemo(
    () => (rows ? facetCounts(rows, (r) => (r.city?.trim() ? [r.city.trim()] : []), 8) : []),
    [rows],
  );
  const rowsById = useMemo(() => new Map((filtered ?? []).map((r) => [r.id, r])), [filtered]);
  const allowedIds = useMemo(() => new Set(rowsById.keys()), [rowsById]);
  const dishSearch = useDishSearch(dish, allowedIds);

  const origin = nearMe.kind === "on" ? nearMe.origin : null;
  const open = view ? (origin ? orderByDistance(view.open, origin, evalAt) : view.open) : [];
  const closingSoon = view ? (origin ? orderByDistance(view.closingSoon, origin, evalAt) : view.closingSoon) : [];

  const hour = centralHour(now);
  // WP4.6: only in the evening; after midnight its 12:30 AM has passed.
  const showPastMidnight = !openAt && hour >= 18;
  const clockLabel = `${formatInTimeZone(now, DES_MOINES_TIME_ZONE, "h:mm a")} CT`;
  const dateLabel = formatInTimeZone(now, DES_MOINES_TIME_ZONE, "EEEE, MMMM d, yyyy");

  const openCount = open.length + closingSoon.length;
  const readableCount = view ? view.withReadableHours : 0;
  const atLimit = (rows?.length ?? 0) >= OPEN_NOW_ROW_LIMIT;
  const filtersOn = Boolean(cuisine || city || area || diet || oneMoreHour);
  const openCards = Math.min(open.length, CARD_LIMIT);
  const closingCards = Math.max(0, CARD_LIMIT - openCards);

  const atOptions: string[] = [...OPEN_AT_OPTIONS];
  if (openAt && !atOptions.includes(atParam)) atOptions.push(atParam);

  const findNearMe = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNearMe({ kind: "failed", message: "This browser can't share a location." });
      return;
    }
    setNearMe({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setNearMe({ kind: "on", origin: { latitude: position.coords.latitude, longitude: position.coords.longitude } }),
      () => setNearMe({ kind: "failed", message: "We couldn't get your location, so the list keeps its usual order." }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={PAGE_TITLE}
        pageDescription={PAGE_DESCRIPTION}
        canonicalUrl={getCanonicalUrl("/restaurants/open-now")}
        pageType="website"
        breadcrumbs={BREADCRUMBS}
        faqData={FAQ_DATA}
        isTimeSensitive={true}
        keywords={[
          "restaurants open now Des Moines",
          "open restaurants Des Moines",
          "restaurants open late Des Moines",
          "late night food Des Moines",
          "breakfast open now Des Moines",
        ]}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Restaurants", href: "/restaurants" },
            { label: "Open Now" },
          ]}
          className="mb-4"
        />

        <div className="mb-6">
          <div className="mb-4 flex items-center gap-2">
            <SpriteIcon name="clock" className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-3xl font-bold">Restaurants Open Now in Des Moines</h1>
          </div>

          {prerender ? (
            <PrerenderedMethod />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <SpriteIcon name="calendar" className="h-4 w-4" aria-hidden="true" />
                  {dateLabel}
                </span>
                <span className="flex items-center gap-1">
                  <SpriteIcon name="clock" className="h-4 w-4" aria-hidden="true" />
                  <time
                    dateTime={now.toISOString()}
                    className="font-semibold text-foreground"
                    data-open-now-clock
                  >
                    {clockLabel}
                  </time>
                </span>
              </div>

              <p className="mb-2 max-w-[70ch] text-lg text-muted-foreground" data-open-now-summary>
                {view ? (
                  <strong className="text-foreground">
                    {openCount} of {readableCount}
                    {atLimit ? "+" : ""} places whose hours we can read {openCount === 1 ? "is" : "are"} open{" "}
                    {whenLabel}
                    {filtersOn ? ", with your filters" : ""}.
                  </strong>
                ) : (
                  <strong className="text-foreground">Checking listed hours against the time in Des Moines.</strong>
                )}
              </p>
              <p className="max-w-[70ch] text-sm text-muted-foreground">
                Hours come from each restaurant's listing and can be out of date. Call ahead to confirm, especially on
                holidays.
              </p>
            </>
          )}
        </div>

        {!prerender && (
          <>
            <form
              className="mb-8 space-y-4 rounded-xl bg-muted/50 p-4"
              aria-label="Filter restaurants"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${formId}-at`} className="text-sm font-medium">
                    Open at
                  </label>
                  <select
                    id={`${formId}-at`}
                    className={SELECT_CLASS}
                    value={openAt ? atParam : ""}
                    onChange={(e) => setParam("at", e.target.value)}
                  >
                    <option value="">Now</option>
                    {atOptions.map((value) => {
                      const resolved = resolveOpenAt(value, now);
                      return (
                        <option key={value} value={value}>
                          {resolved ? `${resolved.clock} ${resolved.when}` : value}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${formId}-area`} className="text-sm font-medium">
                    Area
                  </label>
                  <select
                    id={`${formId}-area`}
                    className={SELECT_CLASS}
                    value={area?.slug ?? ""}
                    onChange={(e) => setParam("area", e.target.value)}
                  >
                    <option value="">Anywhere in the metro</option>
                    {EVENT_AREAS.map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${formId}-diet`} className="text-sm font-medium">
                    Diet mentioned
                  </label>
                  <select
                    id={`${formId}-diet`}
                    className={SELECT_CLASS}
                    value={diet?.id ?? ""}
                    onChange={(e) => setParam("diet", e.target.value)}
                  >
                    <option value="">Any</option>
                    {DIETS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant={oneMoreHour ? "default" : "outline"}
                  aria-pressed={oneMoreHour}
                  className="min-h-11"
                  onClick={() => setParam("hour", oneMoreHour ? "" : "1")}
                >
                  Open 1+ more hour
                </Button>
                <Button
                  type="button"
                  variant={nearMe.kind === "on" ? "default" : "outline"}
                  aria-pressed={nearMe.kind === "on"}
                  className="min-h-11"
                  disabled={nearMe.kind === "locating"}
                  onClick={() => (nearMe.kind === "on" ? setNearMe({ kind: "off" }) : findNearMe())}
                >
                  <SpriteIcon name="map-pin" className="mr-1 h-4 w-4" aria-hidden="true" />
                  {nearMe.kind === "locating" ? "Finding you..." : "Near me"}
                </Button>
                {(filtersOn || openAt || dish) && (
                  <Button type="button" variant="ghost" className="min-h-11" onClick={() => clearParams(FILTER_KEYS)}>
                    Clear filters
                  </Button>
                )}
              </div>
              {nearMe.kind === "failed" && (
                <p className="text-sm text-muted-foreground" role="status">
                  {nearMe.message}
                </p>
              )}
              {nearMe.kind === "on" && (
                <p className="text-sm text-muted-foreground" role="status">
                  Nearest first. Your location stays in this browser tab.
                </p>
              )}
              <ChipGroup label="Cuisine" options={cuisineOptions} value={cuisine} onChange={(v) => setParam("cuisine", v)} />
              <ChipGroup label="City" options={cityOptions} value={city} onChange={(v) => setParam("city", v)} />
              <div className="flex max-w-md flex-col gap-1">
                <label htmlFor={`${formId}-dish`} className="text-sm font-medium">
                  Find a dish
                </label>
                <Input
                  id={`${formId}-dish`}
                  type="search"
                  placeholder="e.g. pho, tacos, cheese curds"
                  value={dish}
                  className="h-11"
                  onChange={(e) => setParam("dish", e.target.value, { replace: true })}
                />
              </div>
            </form>

            {dishSearch.term && view && (
              <DishResults
                term={dishSearch.term}
                matches={dishSearch.matches}
                rowsById={rowsById}
                at={evalAt}
                whenLabel={whenLabel}
              />
            )}

            {error && !isLoading ? (
              <ErrorState error={error} onRetry={() => void refetch()} />
            ) : isLoading || !view ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="animate-pulse motion-reduce:animate-none">
                    <div className="mb-4 h-48 rounded-lg bg-muted"></div>
                    <div className="mb-2 h-4 w-3/4 rounded bg-muted"></div>
                    <div className="h-4 w-1/2 rounded bg-muted"></div>
                  </div>
                ))}
              </div>
            ) : openCount > 0 ? (
              <>
                {open.length > 0 && (
                  <section aria-labelledby="open-now-heading" className="mb-10">
                    <h2 id="open-now-heading" className="mb-6 text-2xl font-bold">
                      {openAt ? `Open at ${openAt.clock} ${openAt.when}` : timeOfDayHeading(hour)} ({open.length})
                    </h2>
                    <CappedList items={open} cards={openCards} grid={0} label="open" />
                  </section>
                )}
                {closingSoon.length > 0 && (
                  <section aria-labelledby="closing-soon-heading" className="mb-10">
                    <h2 id="closing-soon-heading" className="mb-6 text-2xl font-bold">
                      {openAt ? `Closing within the hour after ${openAt.clock}` : "Closing within the hour"} (
                      {closingSoon.length})
                    </h2>
                    <CappedList items={closingSoon} cards={closingCards} grid={openCards === 0 ? 0 : 1} label="closing soon" />
                  </section>
                )}
              </>
            ) : (
              <section aria-labelledby="none-open-heading" className="mb-10" data-open-now-empty>
                <h2 id="none-open-heading" className="mb-4 text-2xl font-bold">
                  {filtersOn
                    ? `Nothing matching your filters is open ${whenLabel}`
                    : openAt
                      ? `Nothing we have hours for is open ${whenLabel}`
                      : `Nothing we have hours for is open right now (${clockLabel})`}
                </h2>
                {view.nextToOpen.length > 0 ? (
                  <>
                    <p className="mb-4 text-muted-foreground">Next to open:</p>
                    <RestaurantLinkList items={view.nextToOpen} />
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Browse <Link to="/restaurants" className="font-semibold text-primary hover:underline">all restaurants</Link> instead.
                  </p>
                )}
              </section>
            )}

            {view && showPastMidnight && view.openPastMidnight.length > 0 && (
              <section aria-labelledby="past-midnight-heading" className="mb-10">
                <h2 id="past-midnight-heading" className="mb-2 text-xl font-semibold">
                  Open past midnight tonight ({view.openPastMidnight.length})
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">Places whose listed hours have them open at 12:30 AM.</p>
                <RestaurantLinkList items={view.openPastMidnight} />
              </section>
            )}

            {view && view.unreadable.length > 0 && (
              <details className="mb-10 max-w-3xl rounded-xl border px-4 py-3" data-open-now-unreadable>
                <summary className="cursor-pointer font-semibold">
                  Hours we couldn't read ({view.unreadable.length})
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  These places list hours in a form we can't check, so they aren't counted above. Their pages show the text
                  as listed.
                </p>
                <ul className="mt-2 columns-1 gap-6 sm:columns-2">
                  {view.unreadable.map((row) => (
                    <li key={row.id} className="py-1">
                      <Link to={restaurantHref(row)} className="text-primary hover:underline">
                        {row.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        <HowThisWorks />

        {/* SEO-003: the FAQ is rendered here, so the FAQPage block FAQSection
            emits matches what visitors see. The answers are static text, so
            the prerender and the live render emit the same block. */}
        <FAQSection faqs={FAQ_DATA} />

        <RelatedContent currentPath="/restaurants/open-now" title="More Des Moines Dining & Activities" />
      </div>

      <Footer />
    </div>
  );
}
