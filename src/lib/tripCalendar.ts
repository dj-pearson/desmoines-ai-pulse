/**
 * Trip itinerary -> calendar export (WEB-FEAT-011): .ics generation (whole-trip
 * or per-day) and a Google Calendar deep-link. Pure string builders + a small
 * browser download helper.
 */
import { addDays } from "date-fns";
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

/** Resolve an item's start/end Date from the trip start + day + HH:mm times. */
function itemDates(
  trip: TripPlan,
  item: TripPlanItem
): { start: Date; end: Date } {
  const base = addDays(new Date(trip.start_date), (item.day_number || 1) - 1);
  const start = new Date(base);
  if (item.start_time) {
    const [h, m] = item.start_time.split(":").map(Number);
    if (!Number.isNaN(h)) start.setHours(h, m || 0, 0, 0);
  } else {
    start.setHours(9, 0, 0, 0); // sensible default
  }
  let end = new Date(start);
  if (item.end_time) {
    const [h, m] = item.end_time.split(":").map(Number);
    if (!Number.isNaN(h)) {
      end = new Date(start);
      end.setHours(h, m || 0, 0, 0);
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
    descParts.length ? `DESCRIPTION:${escapeICS(descParts.join(" — "))}` : "",
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
    details: [item.description, item.ai_reason].filter(Boolean).join(" — "),
    location: item.location || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
