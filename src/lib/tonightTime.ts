/**
 * The clock half of "Tonight in Des Moines" (WEB-PERF-079): what
 * tonight means in Central time, an event's start instant, and the small
 * formatters a Tonight card prints.
 *
 * Split out of tonightPairings.ts because most of its importers wanted only
 * this half. The event hubs, the landing pages and the hotel/venue pages ask
 * for tonightWindow, EVENING_START_HOUR or eventStartInstant, and importing
 * them from tonightPairings also put the pairing logic, the free-text hours
 * parser (restaurantHours.ts) and the weather hook in those routes. Nothing
 * here may import from tonightPairings, restaurantHours or a hook;
 * tonightTimeSplit.test.ts holds that line. tonightPairings.ts re-exports all
 * of it, so either import path gives the same function.
 *
 * Same clock rule as there: every function takes `now` (or an instant) and
 * reads Central wall time with date-fns-tz, never the reader's zone.
 */
import { addDays, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const CENTRAL = "America/Chicago";

/** The no-time sentinel ingest writes; mirrors NO_TIME_MARKER in timezone.ts. */
export const NO_TIME_MARKER = "19:31:58";

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
