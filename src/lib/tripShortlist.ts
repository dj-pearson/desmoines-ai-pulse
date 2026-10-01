/**
 * The free trip calendar's pick list (plan-stay-pass2 WP1 item 6).
 *
 * The URL (`?e=id,id`) is the source of truth, so a shortlist can be shared
 * or bookmarked; `storage` mirrors it under a versioned key so a visitor who
 * comes back to /trip-planner without the query string gets their picks back.
 * The .ics is built here from rows the page already loaded: no request, no
 * account, no trip_plans table.
 */
import { storage } from "@/lib/safeStorage";
import { centralDateOf, formatEventTimeOnly, type CentralDate } from "@/lib/timezone";
import { eventStartInstant, type TonightEvent } from "@/lib/tonightPairings";
import { buildEventsICS, type CalendarEntry } from "@/lib/tripCalendar";
import { eventHref } from "@/lib/dashboardItems";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { landingEndDay, type LandingEvent } from "@/hooks/useEventLanding";

/** The query parameter the picks live in. */
export const SHORTLIST_PARAM = "e";

/** Most picks kept. Past this a URL stops being shareable and a trip stops being a shortlist. */
export const MAX_SHORTLIST = 30;

/**
 * Storage key. Versioned: if the stored shape ever changes, write a new key
 * and read the old one once (CLAUDE.md "On-disk / client-stored state").
 */
export const SHORTLIST_STORAGE_KEY = "tripShortlist.v1";

/** An event id as the URL may carry it: a UUID or a similar short token. */
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Clean, de-duplicated, capped list from any input (a URL value, stored JSON). */
export function normalizeShortlist(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!ID_RE.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_SHORTLIST) break;
  }
  return out;
}

/** The ids in `?e=`, or [] when absent or unreadable. */
export function parseShortlistParam(value: string | null | undefined): string[] {
  if (!value) return [];
  return normalizeShortlist(value.split(","));
}

/** The `?e=` value for a list, or null when the list is empty. */
export function serializeShortlist(ids: readonly string[]): string | null {
  const clean = normalizeShortlist(ids);
  return clean.length > 0 ? clean.join(",") : null;
}

/** Add or remove one id. Adding past MAX_SHORTLIST leaves the list as it was. */
export function toggleShortlist(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (ids.length >= MAX_SHORTLIST) return [...ids];
  return normalizeShortlist([...ids, id]);
}

export function readStoredShortlist(): string[] {
  const stored = storage.get<unknown>(SHORTLIST_STORAGE_KEY, null);
  return Array.isArray(stored) ? normalizeShortlist(stored) : [];
}

export function writeStoredShortlist(ids: readonly string[]): void {
  const clean = normalizeShortlist(ids);
  if (clean.length === 0) storage.remove(SHORTLIST_STORAGE_KEY);
  else storage.set(SHORTLIST_STORAGE_KEY, clean);
}

/** A timed event with no end runs this long in the calendar file (same default as trip stops). */
const DEFAULT_EVENT_MINUTES = 60;

function clampDay(day: CentralDate, from: CentralDate, to: CentralDate): CentralDate {
  if (day < from) return from;
  if (day > to) return to;
  return day;
}

/**
 * One calendar entry per picked event, clipped to the trip window.
 *
 * - A single-day event with a published time is timed, at the instant stored
 *   on the row, so a visitor planning from Denver still sees the venue's
 *   clock.
 * - An event with no published time, or one that runs across several days,
 *   is all-day on the Central days it runs inside the window: a March-to-
 *   December exhibit shows up on your trip days, not for nine months.
 */
export function shortlistEntries(
  events: readonly LandingEvent[],
  window: { from: CentralDate; to: CentralDate },
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const event of events) {
    if (!event.date) continue;
    const startDay = centralDateOf(event.date);
    const endDay = landingEndDay(event);
    const multiDay = !!endDay && endDay > startDay;
    const base = {
      uid: event.id,
      title: event.title ?? "Event",
      location: event.venue || event.location || null,
      url: getCanonicalUrl(eventHref(event)),
    };
    const start = formatEventTimeOnly(event) ? eventStartInstant(event as unknown as TonightEvent) : null;
    if (start && !multiDay) {
      const endAt = event.end_date ? new Date(event.end_date) : null;
      const end =
        endAt && Number.isFinite(endAt.getTime()) && endAt.getTime() > start.getTime()
          ? endAt
          : new Date(start.getTime() + DEFAULT_EVENT_MINUTES * 60_000);
      entries.push({ kind: "timed", ...base, start, end });
      continue;
    }
    const lastDay = multiDay ? endDay! : startDay;
    if (lastDay < window.from || startDay > window.to) continue;
    entries.push({
      kind: "all-day",
      ...base,
      firstDay: clampDay(startDay, window.from, window.to),
      lastDay: clampDay(lastDay, window.from, window.to),
    });
  }
  return entries;
}

/** The whole shortlist as one .ics document. */
export function buildShortlistICS(
  events: readonly LandingEvent[],
  window: { from: CentralDate; to: CentralDate },
  stamp: Date = new Date(),
): string {
  return buildEventsICS(shortlistEntries(events, window), stamp);
}
