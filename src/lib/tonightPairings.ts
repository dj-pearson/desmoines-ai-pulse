/**
 * "Tonight in Des Moines": an event tonight plus a restaurant that will be
 * open nearby at dinner time (home plan WP10).
 *
 * Everything here is pure and takes `now` as an argument, so the pairing and
 * ordering rules are tested with a fixed clock
 * (src/lib/__tests__/tonightPairings.test.ts). The hook that fetches rows is
 * src/hooks/useTonightPairings.ts.
 *
 * THE CLOCK IS CENTRAL, NOT THE READER'S. "Tonight" is the rest of today's
 * America/Chicago calendar day, and a restaurant's hours are checked against
 * Central wall time. getRestaurantOpenStatus reads getDay()/getHours() off the
 * Date it is given, which is the browser's zone, so it is handed a
 * toZonedTime() Date whose local fields ARE Central wall time. Without that a
 * reader in London would be told a place is open at 1am.
 */
import { addDays, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { haversineDistance } from "@/lib/geo";
import { getRestaurantOpenStatus } from "@/lib/restaurantHours";
import { reorderForWeather, type WeatherSnapshot } from "@/hooks/useWeather";

const CENTRAL = "America/Chicago";

/** The no-time sentinel ingest writes; mirrors NO_TIME_MARKER in timezone.ts. */
const NO_TIME_MARKER = "19:31:58";

/** A restaurant further than this from the venue is not "nearby". */
export const PAIR_MAX_MILES = 1.5;

/** Dinner starts this long before the event, and the restaurant must be open then. */
export const DINNER_LEAD_MINUTES = 90;

/** The rail shows at most this many cards. */
export const MAX_TONIGHT_CARDS = 5;

/**
 * How many of tonight's events get a restaurant lookup. More than the cards
 * shown, so an event that cannot pair can give its slot to one that can.
 */
export const MAX_PAIRING_CANDIDATES = 10;

/** Degrees of padding that cover PAIR_MAX_MILES at Des Moines' latitude (41.6N). */
export const LAT_PAD_DEG = PAIR_MAX_MILES / 69;
export const LNG_PAD_DEG = PAIR_MAX_MILES / 51.6;

/** Restaurant `status` values that mean it is not serving dinner tonight. */
const NOT_SERVING = new Set([
  "opening_soon",
  "closed",
  "permanently_closed",
  "temporarily_closed",
]);

export interface TonightEvent {
  id: string;
  title: string | null;
  date: string | null;
  event_start_utc?: string | null;
  event_start_local?: string | null;
  venue?: string | null;
  location?: string | null;
  category?: string | null;
  price?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  time_tbd?: boolean | null;
}

export interface TonightRestaurant {
  id: string;
  name: string | null;
  slug?: string | null;
  cuisine?: string | null;
  price_range?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Free-text hours. Typed loosely because a bad row can carry a non-string. */
  opening?: unknown;
  opening_date?: string | null;
  status?: string | null;
}

export interface TonightDinner {
  restaurant: TonightRestaurant;
  distanceMiles: number;
  /** The instant dinner starts: event start minus DINNER_LEAD_MINUTES. */
  dinnerAt: Date;
}

export interface TonightPairing {
  event: TonightEvent;
  /** Null when the event has no known time, no coordinates, or nothing open nearby. */
  startsAt: Date | null;
  dinner: TonightDinner | null;
}

export interface CentralDayWindow {
  /** Midnight at the start of `now`'s Central calendar day, as UTC ISO. */
  startISO: string;
  /** Midnight at the start of the next Central day, as UTC ISO. */
  endISO: string;
  /** yyyy-MM-dd in Central, for cache keys. */
  dateKey: string;
}

/** Today's Central calendar day, as a UTC half-open interval. */
export function centralDayWindow(now: Date): CentralDayWindow {
  const dateKey = formatInTimeZone(now, CENTRAL, "yyyy-MM-dd");
  const nextKey = formatInTimeZone(
    addDays(parseISO(`${dateKey}T12:00:00Z`), 1),
    "UTC",
    "yyyy-MM-dd",
  );
  return {
    startISO: fromZonedTime(`${dateKey}T00:00:00`, CENTRAL).toISOString(),
    endISO: fromZonedTime(`${nextKey}T00:00:00`, CENTRAL).toISOString(),
    dateKey,
  };
}

/**
 * The event's start instant, or null when no specific time is known.
 *
 * Same rule as hasSpecificTime in timezone.ts: the source's own time_tbd flag
 * first, the 19:31:58 sentinel second. A no-time event printed as "7:31 PM"
 * would also get a made-up 6:01 PM dinner slot.
 */
export function eventStartInstant(event: TonightEvent): Date | null {
  if (event.time_tbd) return null;
  const local = event.event_start_local ?? event.date ?? "";
  if (local.split("T")[1]?.substring(0, 8) === NO_TIME_MARKER) return null;
  const source = event.event_start_utc ?? event.date;
  if (!source) return null;
  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const OUTDOOR_RE =
  /\b(outdoor|outdoors|outside|trail|trails|hike|hiking|garden|gardens|park|picnic|patio|farmers market|festival|fest|parade|fireworks|5k|10k|fun run|cycling|bike ride|camping|nature|lawn|riverfront|amphitheater)\b/i;
const INDOOR_RE =
  /\b(theater|theatre|museum|gallery|library|comedy|trivia|karaoke|bowling|arena|civic center|hall|lounge|brewery|taproom|cinema|movie|indoor)\b/i;

/**
 * Is this event indoors? true / false, or null when the text does not say.
 *
 * events has no is_indoor column, so this reads the category, title and venue.
 * Null is the honest answer for most rows and reorderForWeather keeps unknowns
 * in place between the two known groups. Outdoor wins a tie ("Jazz in the
 * Gardens at the Botanical Hall") because a wet evening is the costly miss.
 */
export function eventIsIndoor(event: TonightEvent): boolean | null {
  const text = [event.category, event.title, event.venue].filter(Boolean).join(" ");
  if (!text) return null;
  if (OUTDOOR_RE.test(text)) return false;
  if (INDOOR_RE.test(text)) return true;
  return null;
}

function hasCoords(row: { latitude?: number | null; longitude?: number | null }): boolean {
  return (
    typeof row.latitude === "number" &&
    typeof row.longitude === "number" &&
    Number.isFinite(row.latitude) &&
    Number.isFinite(row.longitude) &&
    !(row.latitude === 0 && row.longitude === 0)
  );
}

/**
 * Tonight's events from `now` on, ordered for the weather.
 *
 * The query already bounds on the Central day, but the rows are filtered again
 * here so a cached result from an hour ago does not list a show that has
 * started, and so the rule is testable without a database. Timed events come
 * in start order; no-time events sit after them. The weather reorder is stable,
 * so start order survives within each indoor/outdoor group.
 */
export function selectTonightEvents(
  events: readonly TonightEvent[],
  now: Date,
  weather: WeatherSnapshot,
): TonightEvent[] {
  const { startISO, endISO } = centralDayWindow(now);
  const dayStart = Date.parse(startISO);
  const dayEnd = Date.parse(endISO);
  const nowMs = now.getTime();

  const seen = new Set<string>();
  const kept: Array<{ event: TonightEvent; start: number | null }> = [];
  for (const event of events) {
    if (!event?.id || seen.has(event.id)) continue;
    const source = event.event_start_utc ?? event.date;
    const at = source ? Date.parse(source) : NaN;
    if (!Number.isFinite(at) || at < dayStart || at >= dayEnd) continue;
    const start = eventStartInstant(event);
    if (start && start.getTime() < nowMs) continue;
    seen.add(event.id);
    kept.push({ event, start: start ? start.getTime() : null });
  }

  kept.sort((a, b) => {
    if (a.start === null && b.start === null) return 0;
    if (a.start === null) return 1;
    if (b.start === null) return -1;
    return a.start - b.start;
  });

  return reorderForWeather(
    kept.map((k) => k.event),
    eventIsIndoor,
    weather,
  );
}

/**
 * One tight box per event venue, for a single PostgREST `or=` filter.
 * Events without coordinates contribute nothing; no boxes means no query.
 */
export function restaurantBoxes(events: readonly TonightEvent[]): string[] {
  const boxes = new Set<string>();
  for (const event of events) {
    if (!hasCoords(event)) continue;
    const lat = event.latitude as number;
    const lng = event.longitude as number;
    boxes.add(
      `and(latitude.gte.${(lat - LAT_PAD_DEG).toFixed(4)},latitude.lte.${(lat + LAT_PAD_DEG).toFixed(4)},` +
        `longitude.gte.${(lng - LNG_PAD_DEG).toFixed(4)},longitude.lte.${(lng + LNG_PAD_DEG).toFixed(4)})`,
    );
  }
  return [...boxes].sort();
}

/**
 * Will this restaurant be open, with time to eat, at `at`?
 *
 * "open" only. "closing-soon" means it shuts within the hour, which is not a
 * dinner, and "unknown" (unparseable or missing hours) is not a claim we can
 * print as "open".
 */
export function isOpenForDinner(restaurant: TonightRestaurant, at: Date, now: Date): boolean {
  if (restaurant.status && NOT_SERVING.has(restaurant.status)) return false;
  if (restaurant.opening_date) {
    const opens = Date.parse(restaurant.opening_date);
    if (Number.isFinite(opens) && opens > now.getTime()) return false;
  }
  if (typeof restaurant.opening !== "string") return false;
  const wallClock = toZonedTime(at, CENTRAL);
  return getRestaurantOpenStatus(restaurant.opening, wallClock).status === "open";
}

/**
 * The nearest restaurant within PAIR_MAX_MILES that is open for dinner before
 * this event, preferring one not already used by an earlier card.
 */
export function pickDinner(
  event: TonightEvent,
  startsAt: Date | null,
  restaurants: readonly TonightRestaurant[],
  now: Date,
  used: ReadonlySet<string> = new Set(),
): TonightDinner | null {
  if (!startsAt || !hasCoords(event)) return null;
  const dinnerAt = new Date(startsAt.getTime() - DINNER_LEAD_MINUTES * 60_000);
  const venue = { latitude: event.latitude as number, longitude: event.longitude as number };

  let best: TonightDinner | null = null;
  let bestFresh: TonightDinner | null = null;
  for (const restaurant of restaurants) {
    if (!restaurant?.id || !hasCoords(restaurant)) continue;
    const distanceMiles = haversineDistance(venue, {
      latitude: restaurant.latitude as number,
      longitude: restaurant.longitude as number,
    });
    if (distanceMiles > PAIR_MAX_MILES) continue;
    if (!isOpenForDinner(restaurant, dinnerAt, now)) continue;
    const candidate = { restaurant, distanceMiles, dinnerAt };
    if (!best || distanceMiles < best.distanceMiles) best = candidate;
    if (!used.has(restaurant.id) && (!bestFresh || distanceMiles < bestFresh.distanceMiles)) {
      bestFresh = candidate;
    }
  }
  return bestFresh ?? best;
}

/**
 * Tonight's cards: ordered events, each with a dinner when one fits.
 *
 * Paired events come first so the top of the rail is a complete plan; within
 * the paired and unpaired groups the weather-and-time order from
 * selectTonightEvents holds. An event that cannot pair is still shown on its
 * own, so the rail is never empty while anything is on tonight.
 */
export function buildTonightPairings(
  orderedEvents: readonly TonightEvent[],
  restaurants: readonly TonightRestaurant[],
  now: Date,
  limit: number = MAX_TONIGHT_CARDS,
): TonightPairing[] {
  const used = new Set<string>();
  const all: TonightPairing[] = orderedEvents.slice(0, MAX_PAIRING_CANDIDATES).map((event) => {
    const startsAt = eventStartInstant(event);
    const dinner = pickDinner(event, startsAt, restaurants, now, used);
    if (dinner) used.add(dinner.restaurant.id);
    return { event, startsAt, dinner };
  });
  const paired = all.filter((p) => p.dinner);
  const alone = all.filter((p) => !p.dinner);
  return [...paired, ...alone].slice(0, limit);
}

/** The detail page's "Before the show" block lists at most this many. */
export const MAX_DINNER_BEFORE_SHOW = 3;

/**
 * "Before the show" on event detail (events plan WP8 item 6).
 *
 * Up to MAX_DINNER_BEFORE_SHOW restaurants within PAIR_MAX_MILES of the venue
 * that are open at start minus DINNER_LEAD_MINUTES, nearest first. Empty when
 * the event has no announced time, no coordinates, or has already started:
 * a dinner slot computed from a placeholder hour, or one in the past, is not
 * advice. Same rules as pickDinner, which returns only the nearest one.
 */
export function pickDinnerBeforeShow(
  event: TonightEvent,
  restaurants: readonly TonightRestaurant[],
  now: Date,
  limit: number = MAX_DINNER_BEFORE_SHOW,
): TonightDinner[] {
  const startsAt = eventStartInstant(event);
  if (!startsAt || startsAt.getTime() <= now.getTime() || !hasCoords(event)) return [];
  const dinnerAt = new Date(startsAt.getTime() - DINNER_LEAD_MINUTES * 60_000);
  const venue = { latitude: event.latitude as number, longitude: event.longitude as number };

  const seen = new Set<string>();
  const picks: TonightDinner[] = [];
  for (const restaurant of restaurants) {
    if (!restaurant?.id || seen.has(restaurant.id) || !hasCoords(restaurant)) continue;
    const distanceMiles = haversineDistance(venue, {
      latitude: restaurant.latitude as number,
      longitude: restaurant.longitude as number,
    });
    if (distanceMiles > PAIR_MAX_MILES) continue;
    if (!isOpenForDinner(restaurant, dinnerAt, now)) continue;
    seen.add(restaurant.id);
    picks.push({ restaurant, distanceMiles, dinnerAt });
  }
  return picks.sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, limit);
}

/** "0.3 mi", or "under 0.1 mi" so a same-block pair never reads "0.0 mi". */
export function formatMiles(miles: number): string {
  if (miles < 0.1) return "under 0.1 mi";
  return `${miles.toFixed(1)} mi`;
}

/** "7:30 PM" in Central. */
export function formatCentralTime(at: Date): string {
  return formatInTimeZone(at, CENTRAL, "h:mm a");
}
