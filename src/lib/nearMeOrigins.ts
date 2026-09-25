/**
 * Starting points for /events/near-me (docs/page-plans/events.md WP6, bet 5).
 *
 * A visitor who denies location, or is planning from a hotel room, still needs
 * "1.2 mi from Downtown" rather than a distance from nowhere. Each origin is a
 * named point the visitor picks; the page never guesses one silently.
 *
 * The points are the commonly used centre of each place (city hall or the main
 * street of the district), to three decimals. They only have to be good enough
 * to say "about a mile"; nothing is sorted across origins.
 *
 * Also here: the near-me time windows, the radius and its bounding box,
 * coordinate rounding and the one distance formatter, so the list card, the
 * map popup and any future surface agree.
 */
import { centralWindow, type CentralWindow } from "@/lib/timezone";

export interface NearMeOrigin {
  slug: string;
  label: string;
  latitude: number;
  longitude: number;
}

export const NEAR_ME_ORIGINS: readonly NearMeOrigin[] = [
  { slug: "downtown", label: "Downtown", latitude: 41.587, longitude: -93.625 },
  { slug: "east-village", label: "East Village", latitude: 41.589, longitude: -93.611 },
  { slug: "ingersoll", label: "Ingersoll", latitude: 41.584, longitude: -93.659 },
  { slug: "valley-junction", label: "Valley Junction", latitude: 41.572, longitude: -93.711 },
  { slug: "west-des-moines", label: "West Des Moines", latitude: 41.577, longitude: -93.745 },
  { slug: "ankeny", label: "Ankeny", latitude: 41.73, longitude: -93.6 },
  { slug: "urbandale", label: "Urbandale", latitude: 41.627, longitude: -93.712 },
  { slug: "johnston", label: "Johnston", latitude: 41.673, longitude: -93.698 },
  { slug: "clive", label: "Clive", latitude: 41.603, longitude: -93.724 },
  { slug: "windsor-heights", label: "Windsor Heights", latitude: 41.598, longitude: -93.708 },
  { slug: "altoona", label: "Altoona", latitude: 41.644, longitude: -93.465 },
  // Hickman Rd at 6th St, the old town centre (events-pass2 WP5 item 8).
  { slug: "waukee", label: "Waukee", latitude: 41.612, longitude: -93.885 },
];

export const DEFAULT_NEAR_ME_ORIGIN = "downtown";

/** safeStorage key. Holds an origin slug only, never coordinates. */
export const NEAR_ME_ORIGIN_STORAGE_KEY = "nearMeOrigin";

export function findNearMeOrigin(slug: string | null | undefined): NearMeOrigin | undefined {
  if (!slug) return undefined;
  return NEAR_ME_ORIGINS.find((origin) => origin.slug === slug);
}

/**
 * Round a coordinate to 2 decimals (about 0.7 mi of latitude, 0.5 mi of
 * longitude here) before it becomes a query key or an RPC argument. Enough for
 * "events within 25 miles"; not enough to find someone's house.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The near-me windows. The chips offer the first four; the hub hands off its
 * own presets when a visitor denies location there (events-pass2 WP1 item 8),
 * so `tomorrow`, `this-week` and `next-week` are understood too and show as a
 * fifth, pressed chip when they arrive in the URL.
 *
 * "Today" was labelled "Tonight" while covering the whole Central day. It is
 * the same window under its honest name (WP5 item 8); `?when=tonight` links
 * already out there still land on it.
 */
export type NearMeWindow =
  | "today"
  | "tomorrow"
  | "this-weekend"
  | "this-week"
  | "next-week"
  | "next-7-days"
  | "anytime";

export interface NearMeWindowOption {
  value: NearMeWindow;
  label: string;
}

/** The chips, in order. */
export const NEAR_ME_WINDOWS: ReadonlyArray<NearMeWindowOption> = [
  { value: "today", label: "Today" },
  { value: "this-weekend", label: "This weekend" },
  { value: "next-7-days", label: "Next 7 days" },
  { value: "anytime", label: "Anytime" },
];

/** Windows the URL may carry that have no chip of their own. */
export const NEAR_ME_EXTRA_WINDOWS: ReadonlyArray<NearMeWindowOption> = [
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this-week", label: "This week" },
  { value: "next-week", label: "Next week" },
];

const WINDOW_ALIASES: Record<string, NearMeWindow> = { tonight: "today", next_7_days: "next-7-days" };

export const DEFAULT_NEAR_ME_WINDOW: NearMeWindow = "next-7-days";

export function findNearMeWindow(value: NearMeWindow): NearMeWindowOption | undefined {
  return [...NEAR_ME_WINDOWS, ...NEAR_ME_EXTRA_WINDOWS].find((w) => w.value === value);
}

export function parseNearMeWindow(value: string | null | undefined): NearMeWindow {
  if (!value) return DEFAULT_NEAR_ME_WINDOW;
  const aliased = WINDOW_ALIASES[value] ?? value;
  return findNearMeWindow(aliased as NearMeWindow)
    ? (aliased as NearMeWindow)
    : DEFAULT_NEAR_ME_WINDOW;
}

/** The Central-time bounds of a window, or null for "anytime". */
export function nearMeWindowBounds(
  when: NearMeWindow,
  now: Date = new Date()
): CentralWindow | null {
  if (when === "anytime") return null;
  return centralWindow(when, now);
}

// ---------------------------------------------------------------------------
// Radius
// ---------------------------------------------------------------------------

export const NEAR_ME_MIN_RADIUS = 1;
export const NEAR_ME_MAX_RADIUS = 50;
export const DEFAULT_NEAR_ME_RADIUS = 25;

/** `?r=` as whole miles inside the slider's range; anything else is the default. */
export function parseNearMeRadius(value: string | null | undefined): number {
  if (!value) return DEFAULT_NEAR_ME_RADIUS;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_NEAR_ME_RADIUS;
  return Math.min(NEAR_ME_MAX_RADIUS, Math.max(NEAR_ME_MIN_RADIUS, Math.round(n)));
}

export interface LatLngBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Miles per degree of latitude, and of longitude at the equator. */
const MILES_PER_DEGREE = 69.172;

/**
 * The lat/lng box that holds a circle of `radiusMiles` around `center`, with
 * 1% to spare. The server filters on the box (plain numeric columns, no
 * PostGIS needed); the caller then drops the box's corners by distance.
 */
export function nearMeBox(
  center: { latitude: number; longitude: number },
  radiusMiles: number
): LatLngBox {
  const dLat = (radiusMiles / MILES_PER_DEGREE) * 1.01;
  const cos = Math.cos((center.latitude * Math.PI) / 180);
  const dLng = (radiusMiles / (MILES_PER_DEGREE * Math.max(cos, 0.01))) * 1.01;
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return {
    south: r(center.latitude - dLat),
    north: r(center.latitude + dLat),
    west: r(center.longitude - dLng),
    east: r(center.longitude + dLng),
  };
}

/**
 * The one distance formatter for near-me. `originLabel` names where the
 * distance is measured from when it is not the visitor's own location.
 * Zero is a real distance (an event at the origin), not a missing one.
 */
export function formatNearMeDistance(
  miles: number | null | undefined,
  originLabel?: string
): string {
  if (miles == null || !Number.isFinite(miles)) return "";
  const amount = miles < 0.1 ? "Under 0.1 mi" : `${miles.toFixed(1)} mi`;
  return originLabel ? `${amount} from ${originLabel}` : `${amount} away`;
}
