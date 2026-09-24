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
 * Also here: the near-me time windows, coordinate rounding and the one
 * distance formatter, so the list card and any future surface agree.
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

export type NearMeWindow = "tonight" | "this-weekend" | "next-7-days" | "anytime";

export const NEAR_ME_WINDOWS: ReadonlyArray<{ value: NearMeWindow; label: string }> = [
  { value: "tonight", label: "Tonight" },
  { value: "this-weekend", label: "This weekend" },
  { value: "next-7-days", label: "Next 7 days" },
  { value: "anytime", label: "Anytime" },
];

export const DEFAULT_NEAR_ME_WINDOW: NearMeWindow = "next-7-days";

export function parseNearMeWindow(value: string | null | undefined): NearMeWindow {
  return NEAR_ME_WINDOWS.some((w) => w.value === value)
    ? (value as NearMeWindow)
    : DEFAULT_NEAR_ME_WINDOW;
}

/**
 * The Central-time bounds of a window, or null for "anytime". "Tonight" is
 * the whole Central day, so an all-day event with no start time still counts.
 */
export function nearMeWindowBounds(
  when: NearMeWindow,
  now: Date = new Date()
): CentralWindow | null {
  switch (when) {
    case "tonight":
      return centralWindow("today", now);
    case "this-weekend":
      return centralWindow("this-weekend", now);
    case "next-7-days":
      return centralWindow("next-7-days", now);
    case "anytime":
      return null;
  }
}

/** Does an event's start fall inside the window? Unknown start: not inside. */
export function eventStartsInWindow(
  event: { event_start_utc?: string | null; date?: string | null },
  window: { start: string; end: string } | null
): boolean {
  if (!window) return true;
  const source = event.event_start_utc || event.date;
  if (!source) return false;
  const t = new Date(source).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(window.start).getTime() && t <= new Date(window.end).getTime();
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
