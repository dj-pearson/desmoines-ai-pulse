/**
 * Trip itinerary -> calendar export (WEB-FEAT-011): .ics generation (whole-trip
 * or per-day) and a Google Calendar deep-link. Pure string builders + a small
 * browser download helper.
 */
import { centralWallClock, clockMinutes } from "@/lib/dateOnly";
import type { TripPlan, TripPlanItem } from "@/hooks/useTripPlanner";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC timestamp in the basic iCal format: YYYYMMDDTHHmmssZ. */
function toICSDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Default start for a stop with no time: 9 AM Des Moines time. */
const DEFAULT_START = "09:00";

/**
 * Resolve an item's start/end instants from the trip start + day + HH:mm
 * times, read as America/Chicago wall-clock (plan-stay WP1 item 1). The old
 * `new Date(start_date)` was UTC midnight, a day early in Central, and
 * `setHours` then applied the visitor's own zone on top.
 */
function itemDates(
  trip: TripPlan,
  item: TripPlanItem
): { start: Date; end: Date } {
  const dayOffset = (item.day_number || 1) - 1;
  const startClock = clockMinutes(item.start_time) != null ? item.start_time! : DEFAULT_START;
  const start = centralWallClock(trip.start_date, dayOffset, startClock);

  let end: Date;
  const endMinutes = clockMinutes(item.end_time);
  if (endMinutes != null) {
    end = centralWallClock(trip.start_date, dayOffset, item.end_time!);
    // "22:00 - 01:00" ends the next day.
    if (end.getTime() <= start.getTime()) {
      end = centralWallClock(trip.start_date, dayOffset + 1, item.end_time!);
    }
  } else if (item.duration_minutes) {
    end = new Date(start.getTime() + item.duration_minutes * 60_000);
  } else {
    end = new Date(start.getTime() + 60 * 60_000); // default 1h
  }
  return { start, end };
}

function buildEvent(trip: TripPlan, item: TripPlanItem): string {
  const { start, end } = itemDates(trip, item);
  const uid = `${item.item_id || crypto.randomUUID()}@desmoinesinsider`;
  const descParts = [item.description, item.location, item.ai_reason].filter(
    Boolean
  ) as string[];
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${escapeICS(item.title || "Activity")}`,
    item.location ? `LOCATION:${escapeICS(item.location)}` : "",
    descParts.length ? `DESCRIPTION:${escapeICS(descParts.join(" - "))}` : "",
    "END:VEVENT",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/** Items for one day, ordered. */
export function dayItems(items: TripPlanItem[], dayNumber: number): TripPlanItem[] {
  return items
    .filter((i) => (i.day_number || 1) === dayNumber)
    .sort((a, b) => a.order_index - b.order_index);
}

/** Build a full .ics document for a set of items. */
export function buildTripICS(trip: TripPlan, items: TripPlanItem[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Des Moines Insider//Trip Planner//EN",
    "CALSCALE:GREGORIAN",
    ...items.map((i) => buildEvent(trip, i)),
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Trigger a client-side download of an .ics file. */
export function downloadICS(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Google Calendar "add event" deep-link for a single item. */
export function googleCalendarUrl(trip: TripPlan, item: TripPlanItem): string {
  const { start, end } = itemDates(trip, item);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: item.title || "Activity",
    dates: `${toICSDate(start)}/${toICSDate(end)}`,
    details: [item.description, item.ai_reason].filter(Boolean).join(" - "),
    location: item.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
