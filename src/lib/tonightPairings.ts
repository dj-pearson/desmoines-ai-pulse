/**
 * "Tonight in Des Moines": an event tonight plus a restaurant that will be
 * open nearby at dinner time (home plan WP10).
 *
 * Everything here is pure and takes `now` as an argument, so the pairing and
 * ordering rules are tested with a fixed clock
 * (src/lib/__tests__/tonightPairings.test.ts). The hook that fetches rows is
 * src/hooks/useTonightPairings.ts.
 *
 * THE CLOCK IS CENTRAL, NOT THE READER'S. Two definitions of "tonight" live
 * here, and callers pick one:
 *   - "day" (the default, kept for the restaurant and search callers): the
 *     rest of today's America/Chicago calendar day.
 *   - "evening" (the home rail, home pass-2 WP2): events starting between
 *     max(now, 16:00 CT) and 04:00 CT the next morning, plus multi-day events
 *     that started earlier and are still running. Between 00:00 and 04:00 CT
 *     it is what is left of the previous evening. See tonightWindow().
 * A restaurant's hours are checked against Central wall time. getRestaurantOpenStatus takes the instant and does the
 * Central conversion itself, so it is handed `at` unconverted. Passing a
 * toZonedTime() Date here as well would convert twice and put the check
 * five or six hours off.
 */
import { addDays, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { haversineDistance } from "@/lib/geo";
import { getRestaurantOpenStatus, type RestaurantOpenResult } from "@/lib/restaurantHours";
import { reorderForWeather, type WeatherSnapshot } from "@/hooks/useWeather";

const CENTRAL = "America/Chicago";

/** The no-time sentinel ingest writes; mirrors NO_TIME_MARKER in timezone.ts. */
const NO_TIME_MARKER = "19:31:58";

/** A restaurant further than this from the venue is not "nearby". */
export const PAIR_MAX_MILES = 1.5;

/** Dinner starts this long before the event, and the restaurant must be open then. */
export const DINNER_LEAD_MINUTES = 90;

/** "Tonight" in the evening sense starts at this Central hour... */
export const EVENING_START_HOUR = 16;

/** ...and runs until this Central hour the next morning. */
export const NIGHT_END_HOUR = 4;

/**
 * The rail's query reaches this far back from `now`, so a show that started a
 * few minutes ago is still in the rows while the minute clock catches up.
 */
export const QUERY_LOOKBACK_MINUTES = 15;

/**
 * The query's lower bound is floored to this many minutes, so the cache key
 * changes a few times an evening rather than every minute.
 */
export const QUERY_BOUND_STEP_MINUTES = 30;

/** Names on a Tonight card are cut to about this many characters. */
export const TONIGHT_NAME_MAX = 40;

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
  /** Multi-day events: when the run ends (timestamptz). */
  end_date?: string | null;
  city?: string | null;
  is_sponsored?: boolean | null;
  sponsored_until?: string | null;
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
  /**
   * The Central closing time at `dinnerAt` ("10 PM", "midnight"), from
   * getRestaurantOpenStatus. Null when the hours say open around the clock.
   * Optional so callers that build their own TonightDinner still type-check.
   */
  closesAt?: string | null;
}

export interface TonightPairing {
  event: TonightEvent;
  /** Null when the event has no known time, no coordinates, or nothing open nearby. */
  startsAt: Date | null;
  dinner: TonightDinner | null;
  /**
   * Set for a multi-day event that started before tonight's window and is
   * still running (evening mode only): its end instant. Such a card has no
   * start time of its own tonight and gets no dinner.
   */
  ongoingUntil?: Date | null;
}

/** Which definition of "tonight" a caller wants. See the file header. */
export type TonightMode = "day" | "evening";

export interface TonightWindow {
  /** yyyy-MM-dd of the evening in Central. Between 00:00 and 04:00 CT, yesterday. */
  dateKey: string;
  /** 16:00 CT on dateKey, as UTC ISO. */
  eveningStartISO: string;
  /** max(now, eveningStart), as UTC ISO. */
  startISO: string;
  /** 04:00 CT the morning after dateKey, as UTC ISO. */
  endISO: string;
}

export interface TonightQueryBounds {
  dateKey: string;
  /**
   * Lower bound on `date` for events starting tonight:
   * max(eveningStart, now - QUERY_LOOKBACK_MINUTES), floored to
   * QUERY_BOUND_STEP_MINUTES (never below eveningStart). Also the bound an
   * ongoing row's end_date must reach.
   */
  fromISO: string;
  /** Upper bound (exclusive): 04:00 CT the next morning. */
  toISO: string;
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

function shiftDateKey(dateKey: string, days: number): string {
  return formatInTimeZone(
    addDays(parseISO(`${dateKey}T12:00:00Z`), days),
    "UTC",
    "yyyy-MM-dd",
  );
}

function hh(hour: number): string {
  return String(hour).padStart(2, "0");
}

/**
 * Tonight, the evening sense: from max(now, 16:00 CT) to 04:00 CT the next
 * morning. From 00:00 to 04:00 CT it is the rest of the previous evening, so
 * at 00:30 on Saturday "tonight" is still Friday night.
 */
export function tonightWindow(now: Date): TonightWindow {
  const todayKey = formatInTimeZone(now, CENTRAL, "yyyy-MM-dd");
  const hour = Number(formatInTimeZone(now, CENTRAL, "H"));
  const dateKey = hour < NIGHT_END_HOUR ? shiftDateKey(todayKey, -1) : todayKey;
  const eveningStart = fromZonedTime(`${dateKey}T${hh(EVENING_START_HOUR)}:00:00`, CENTRAL);
  const end = fromZonedTime(`${shiftDateKey(dateKey, 1)}T${hh(NIGHT_END_HOUR)}:00:00`, CENTRAL);
  const start = Math.max(now.getTime(), eveningStart.getTime());
  return {
    dateKey,
    eveningStartISO: eveningStart.toISOString(),
    startISO: new Date(start).toISOString(),
    endISO: end.toISOString(),
  };
}

/**
 * The bounds the rail's events query uses. Bounded on the evening, not on
 * Central midnight, so morning rows cannot use up the row limit. The lower
 * bound moves in QUERY_BOUND_STEP_MINUTES steps so the cache key rolls over a
 * few times an evening; selectTonightEvents drops anything already started.
 */
export function tonightQueryBounds(now: Date): TonightQueryBounds {
  const w = tonightWindow(now);
  const eveningStart = Date.parse(w.eveningStartISO);
  const step = QUERY_BOUND_STEP_MINUTES * 60_000;
  const lookback = now.getTime() - QUERY_LOOKBACK_MINUTES * 60_000;
  const floored = Math.floor(lookback / step) * step;
  return {
    dateKey: w.dateKey,
    fromISO: new Date(Math.max(eveningStart, floored)).toISOString(),
    toISO: w.endISO,
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
 * The fallback when events.is_indoor is not available (useEventIndoorFlags
 * fails open until migration 20260908000001 is applied, and most rows carry
 * null there anyway): this reads the category, title and venue.
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

function parseInstant(value: string | null | undefined): number {
  return value ? Date.parse(value) : NaN;
}

/**
 * A multi-day event that started before tonight's evening window and is still
 * running after `now`. Evening mode only: in day mode a row is either today or
 * not. A row with no end_date is never "ongoing"; an end_date written as
 * midnight of the last day ends at that midnight, which is the conservative
 * reading.
 */
export function isOngoingTonight(event: TonightEvent, now: Date): boolean {
  const started = parseInstant(event.event_start_utc ?? event.date);
  const ends = parseInstant(event.end_date);
  if (!Number.isFinite(started) || !Number.isFinite(ends)) return false;
  const eveningStart = Date.parse(tonightWindow(now).eveningStartISO);
  return started < eveningStart && ends > now.getTime();
}

/**
 * The start time a Tonight card may print. For an ongoing event that is only
 * a time the source gives for tonight itself (event_start_local dated on
 * tonight's evening, still ahead); otherwise null, so no dinner is invented
 * against yesterday's opening hour.
 */
export function tonightStartInstant(event: TonightEvent, now: Date, mode: TonightMode = "day"): Date | null {
  if (mode === "evening" && isOngoingTonight(event, now)) {
    if (event.time_tbd) return null;
    const local = event.event_start_local ?? "";
    const [datePart, timePart] = local.split("T");
    if (!timePart || timePart.substring(0, 8) === NO_TIME_MARKER) return null;
    if (datePart !== tonightWindow(now).dateKey) return null;
    const at = fromZonedTime(local.substring(0, 19), CENTRAL);
    return Number.isNaN(at.getTime()) || at.getTime() <= now.getTime() ? null : at;
  }
  return eventStartInstant(event);
}

export interface SelectTonightOptions {
  /** "day" (default) or "evening". See the file header. */
  mode?: TonightMode;
  /**
   * Indoor classifier for the weather reorder. Defaults to eventIsIndoor; the
   * home rail passes the is_indoor flag first with eventIsIndoor as fallback.
   */
  isIndoor?: (event: TonightEvent) => boolean | null | undefined;
}

/**
 * Tonight's events from `now` on, ordered for the weather.
 *
 * The query already bounds the rows, but they are filtered again here so a
 * cached result from an hour ago does not list a show that has started, and so
 * the rule is testable without a database. Timed events come in start order;
 * ongoing and no-time events sit after them. The weather reorder is stable, so
 * start order survives within each indoor/outdoor group: weather rank first,
 * start time second.
 */
export function selectTonightEvents(
  events: readonly TonightEvent[],
  now: Date,
  weather: WeatherSnapshot,
  options: SelectTonightOptions = {},
): TonightEvent[] {
  const mode = options.mode ?? "day";
  let lower: number;
  let upper: number;
  if (mode === "evening") {
    const w = tonightWindow(now);
    lower = Date.parse(w.eveningStartISO);
    upper = Date.parse(w.endISO);
  } else {
    const { startISO, endISO } = centralDayWindow(now);
    lower = Date.parse(startISO);
    upper = Date.parse(endISO);
  }
  const nowMs = now.getTime();

  const seen = new Set<string>();
  const kept: Array<{ event: TonightEvent; start: number | null }> = [];
  for (const event of events) {
    if (!event?.id || seen.has(event.id)) continue;
    const at = parseInstant(event.event_start_utc ?? event.date);
    if (!Number.isFinite(at) || at >= upper) continue;
    if (at < lower) {
      if (mode !== "evening" || !isOngoingTonight(event, now)) continue;
      const tonightStart = tonightStartInstant(event, now, mode);
      seen.add(event.id);
      kept.push({ event, start: tonightStart ? tonightStart.getTime() : null });
      continue;
    }
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
    options.isIndoor ?? eventIsIndoor,
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
 * Returns the open-status result (so the card can print "open until 10 PM"
 * from its closesAt), or null when the answer is no. "open" only:
 * "closing-soon" means it shuts within the hour, which is not a dinner, and
 * "unknown" (unparseable or missing hours) is not a claim we can print as
 * "open".
 */
export function isOpenForDinner(
  restaurant: TonightRestaurant,
  at: Date,
  now: Date,
): RestaurantOpenResult | null {
  if (restaurant.status && NOT_SERVING.has(restaurant.status)) return null;
  if (restaurant.opening_date) {
    const opens = Date.parse(restaurant.opening_date);
    if (Number.isFinite(opens) && opens > now.getTime()) return null;
  }
  if (typeof restaurant.opening !== "string") return null;
  const result = getRestaurantOpenStatus(restaurant.opening, at);
  return result.status === "open" ? result : null;
}

export interface PickDinnerOptions {
  /**
   * Home's rule (home pass-2 WP2 item 1): refuse a dinner that starts before
   * 16:00 CT on tonight's evening or has already passed. Off by default, so
   * the Eat & Drink and Events callers keep their behaviour.
   */
  eveningOnly?: boolean;
}

/** Does a dinner at `dinnerAt` pass the evening rule? */
export function isEveningDinner(dinnerAt: Date, now: Date): boolean {
  const eveningStart = Date.parse(tonightWindow(now).eveningStartISO);
  return dinnerAt.getTime() >= eveningStart && dinnerAt.getTime() > now.getTime();
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
  options: PickDinnerOptions = {},
): TonightDinner | null {
  if (!startsAt || !hasCoords(event)) return null;
  const dinnerAt = new Date(startsAt.getTime() - DINNER_LEAD_MINUTES * 60_000);
  if (options.eveningOnly && !isEveningDinner(dinnerAt, now)) return null;
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
    const open = isOpenForDinner(restaurant, dinnerAt, now);
    if (!open) continue;
    const candidate: TonightDinner = { restaurant, distanceMiles, dinnerAt, closesAt: open.closesAt };
    if (!best || distanceMiles < best.distanceMiles) best = candidate;
    if (!used.has(restaurant.id) && (!bestFresh || distanceMiles < bestFresh.distanceMiles)) {
      bestFresh = candidate;
    }
  }
  return bestFresh ?? best;
}

export interface BuildTonightOptions extends PickDinnerOptions {
  /** "day" (default) or "evening"; evening marks ongoing events and gives them no dinner. */
  mode?: TonightMode;
}

/**
 * Tonight's cards: ordered events, each with a dinner when one fits.
 *
 * The order is the one selectTonightEvents produced (weather rank first, start
 * time second). Having a dinner is only a tie-break between cards that start
 * at the same time, so a paired card never jumps over the weather order the
 * rail's header explains. An event that cannot pair is still shown on its
 * own, so the rail is never empty while anything is on tonight.
 */
export function buildTonightPairings(
  orderedEvents: readonly TonightEvent[],
  restaurants: readonly TonightRestaurant[],
  now: Date,
  limit: number = MAX_TONIGHT_CARDS,
  options: BuildTonightOptions = {},
): TonightPairing[] {
  const mode = options.mode ?? "day";
  const used = new Set<string>();
  const all: TonightPairing[] = orderedEvents.slice(0, MAX_PAIRING_CANDIDATES).map((event) => {
    const ongoing = mode === "evening" && isOngoingTonight(event, now);
    const startsAt = tonightStartInstant(event, now, mode);
    const dinner = pickDinner(event, startsAt, restaurants, now, used, options);
    if (dinner) used.add(dinner.restaurant.id);
    const pairing: TonightPairing = { event, startsAt, dinner };
    if (ongoing) pairing.ongoingUntil = new Date(parseInstant(event.end_date));
    return pairing;
  });

  // Tie-break only: within a run of cards with the same start (and the same
  // place in the weather order, since the run is contiguous), paired first.
  const keyOf = (p: TonightPairing) => (p.startsAt ? p.startsAt.getTime() : null);
  const out: TonightPairing[] = [];
  let i = 0;
  while (i < all.length) {
    let j = i + 1;
    while (j < all.length && keyOf(all[j]) === keyOf(all[i])) j += 1;
    const run = all.slice(i, j);
    out.push(...run.filter((p) => p.dinner), ...run.filter((p) => !p.dinner));
    i = j;
  }
  return out.slice(0, limit);
}

/**
 * Put `items` in the order of `frozenIds`, for a rail that must not move a
 * card under a thumb once it has rendered. Ids not in the frozen list keep
 * their relative order after the frozen ones; frozen ids no longer present
 * (a show that started) simply drop out.
 */
export function applyFrozenOrder<T>(
  items: readonly T[],
  getId: (item: T) => string,
  frozenIds: readonly string[] | null,
): T[] {
  if (!frozenIds || frozenIds.length === 0) return [...items];
  const rank = new Map(frozenIds.map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, index, rank: rank.get(getId(item)) }))
    .sort((a, b) => {
      const ra = a.rank ?? Number.POSITIVE_INFINITY;
      const rb = b.rank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
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
    const open = isOpenForDinner(restaurant, dinnerAt, now);
    if (!open) continue;
    seen.add(restaurant.id);
    picks.push({ restaurant, distanceMiles, dinnerAt, closesAt: open.closesAt });
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

/** "Friday, Sep 25" for a yyyy-MM-dd Central date key (the rail heading). */
export function formatTonightDate(dateKey: string): string {
  return formatInTimeZone(parseISO(`${dateKey}T12:00:00Z`), "UTC", "EEEE, MMM d");
}

/** "Sat, Sep 26" in Central, for an ongoing event's end. */
export function formatCentralShortDate(at: Date): string {
  return formatInTimeZone(at, CENTRAL, "EEE, MMM d");
}

/**
 * A name cut to `max` characters on a word boundary where one is close, with
 * an ellipsis, so the time and distance beside it always fit on the card.
 */
export function truncateName(name: string, max: number = TONIGHT_NAME_MAX): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const base = space >= max * 0.6 ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s,.;:-]+$/, "")}...`;
}
