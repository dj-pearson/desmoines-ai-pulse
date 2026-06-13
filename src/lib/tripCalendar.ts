/**
 * Calendar export for AI Trip Planner itineraries (WEB-FEAT-011).
 *
 * Builds .ics files for a whole trip or a single day and a Google Calendar
 * deep-link for the trip span. Itinerary items carry a `day_number` (relative to
 * the trip start date) and an optional wall-clock `start_time`; we resolve each
 * to a concrete instant in Central Time (Des Moines) and emit UTC `Z` timestamps
 * so the events land at the right local time in any calendar app.
 */
import { addDays, format } from "date-fns";
import { centralTimeToUtc } from "@/lib/timezone";
import type { TripPlan, TripPlanItem } from "@/hooks/useTripPlanner";

/** Default start hour for an item with no explicit time, and default duration. */
const DEFAULT_START_HOUR = 9;
const DEFAULT_DURATION_MINUTES = 90;

/** Parse "HH:mm[:ss]" or "h:mm AM/PM" into 24h {hours, minutes}; null if unparseable. */
function parseWallTime(time: string | null | undefined): { hours: number; minutes: number } | null {
  if (!time) return null;
  const trimmed = time.trim();
  const ampm = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(trimmed);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    const isPm = ampm[3].toLowerCase() === "pm";
    if (h === 12) h = isPm ? 12 : 0;
    else if (isPm) h += 12;
    if (h > 23 || m > 59) return null;
    return { hours: h, minutes: m };
  }
  const h24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (h24) {
    const h = parseInt(h24[1], 10);
    const m = parseInt(h24[2], 10);
    if (h > 23 || m > 59) return null;
    return { hours: h, minutes: m };
  }
  return null;
}

/** The UTC instant an item begins, treating its day/time as Central (Des Moines) wall time. */
function itemStartUtc(tripStartDate: string, item: TripPlanItem): Date {
  // Build the Central wall-clock date for this day, then convert to UTC.
  const dayDate = addDays(new Date(`${tripStartDate}T00:00:00`), Math.max(0, item.day_number - 1));
  const wall = parseWallTime(item.start_time) ?? { hours: DEFAULT_START_HOUR, minutes: 0 };
  const central = new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate(),
    wall.hours,
    wall.minutes,
    0,
    0,
  );
  return centralTimeToUtc(central);
}

/** The UTC instant an item ends — from end_time, else duration, else default. */
function itemEndUtc(tripStartDate: string, item: TripPlanItem, startUtc: Date): Date {
  const endWall = parseWallTime(item.end_time);
  if (endWall) {
    const dayDate = addDays(new Date(`${tripStartDate}T00:00:00`), Math.max(0, item.day_number - 1));
    const central = new Date(
      dayDate.getFullYear(),
      dayDate.getMonth(),
      dayDate.getDate(),
      endWall.hours,
      endWall.minutes,
      0,
      0,
    );
    const endUtc = centralTimeToUtc(central);
    if (endUtc.getTime() > startUtc.getTime()) return endUtc;
  }
  const minutes = item.duration_minutes && item.duration_minutes > 0 ? item.duration_minutes : DEFAULT_DURATION_MINUTES;
  return new Date(startUtc.getTime() + minutes * 60 * 1000);
}

/** Format a Date as an iCalendar UTC timestamp (YYYYMMDDTHHmmssZ). */
function formatIcsUtc(date: Date): string {
  return format(date, "yyyyMMdd'T'HHmmss'Z'");
}

/** Escape text for an iCalendar value. */
function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function buildVevent(trip: TripPlan, item: TripPlanItem): string[] {
  const startUtc = itemStartUtc(trip.start_date, item);
  const endUtc = itemEndUtc(trip.start_date, item, startUtc);
  const descriptionParts = [item.description, item.ai_reason, item.notes].filter(Boolean) as string[];
  return [
    "BEGIN:VEVENT",
    `UID:${item.item_id}@desmoinesinsider.com`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${formatIcsUtc(startUtc)}`,
    `DTEND:${formatIcsUtc(endUtc)}`,
    `SUMMARY:${escapeIcs(item.title)}`,
    descriptionParts.length ? `DESCRIPTION:${escapeIcs(descriptionParts.join("\n\n"))}` : "",
    item.location ? `LOCATION:${escapeIcs(item.location)}` : "",
    item.booking_url ? `URL:${item.booking_url}` : "",
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
  ].filter(Boolean);
}

/**
 * Build an .ics document for a trip. When `dayNumber` is provided only that day's
 * items are included; otherwise the whole trip is exported.
 */
export function generateTripIcs(trip: TripPlan, items: TripPlanItem[], dayNumber?: number): string {
  const scoped = (dayNumber ? items.filter((i) => i.day_number === dayNumber) : items)
    .filter((i) => i.title)
    .sort((a, b) => a.day_number - b.day_number || a.order_index - b.order_index);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Des Moines Insider//Trip Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(trip.title)}`,
    "X-WR-TIMEZONE:America/Chicago",
    ...scoped.flatMap((item) => buildVevent(trip, item)),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

/** Trigger a browser download of a trip (or single-day) .ics file. */
export function downloadTripIcs(trip: TripPlan, items: TripPlanItem[], dayNumber?: number): void {
  const ics = generateTripIcs(trip, items, dayNumber);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const slug = trip.title.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase() || "trip";
  const link = document.createElement("a");
  link.href = url;
  link.download = dayNumber ? `${slug}-day-${dayNumber}.ics` : `${slug}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Google Calendar deep-link spanning the whole trip (Google's template URL holds
 * one event, so we represent the trip as a single all-encompassing entry the user
 * can keep or split). Times use the trip start/end dates at Central local hours.
 */
export function getTripGoogleCalendarUrl(trip: TripPlan, items: TripPlanItem[]): string {
  const sorted = [...items].filter((i) => i.title).sort((a, b) => a.day_number - b.day_number || a.order_index - b.order_index);
  const startUtc = sorted.length
    ? itemStartUtc(trip.start_date, sorted[0])
    : centralTimeToUtc(new Date(`${trip.start_date}T09:00:00`));
  const endUtc = sorted.length
    ? itemEndUtc(trip.start_date, sorted[sorted.length - 1], itemStartUtc(trip.start_date, sorted[sorted.length - 1]))
    : centralTimeToUtc(new Date(`${trip.end_date}T17:00:00`));

  const details = sorted
    .map((i) => `Day ${i.day_number}: ${i.title}${i.location ? ` — ${i.location}` : ""}`)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: trip.title,
    dates: `${formatIcsUtc(startUtc)}/${formatIcsUtc(endUtc)}`,
    details: trip.description ? `${trip.description}\n\n${details}` : details,
    location: "Des Moines, IA",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
