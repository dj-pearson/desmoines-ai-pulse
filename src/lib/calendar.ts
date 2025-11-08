import { Event } from "./types";
import { format } from "date-fns";

/**
 * Generate an ICS file content for calendar apps (Google Calendar, Apple Calendar, Outlook)
 */
export function generateICS(event: Event): string {
  const startDate = new Date(event.date);

  // Format dates for ICS (YYYYMMDDTHHmmssZ)
  const formatICSDate = (date: Date): string => {
    return format(date, "yyyyMMdd'T'HHmmss'Z'");
  };

  // End time is start time + 2 hours (default)
  const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));

  // Create a unique ID for the event
  const uid = `${event.id}@desmoinesinsider.com`;

  // Get event description (strip HTML if any)
  const description = (event.enhanced_description || event.original_description || "")
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/\n/g, "\\n"); // Escape newlines for ICS format

  // Build the ICS file content
  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Des Moines Insider//Event Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(startDate)}`,
    `DTEND:${formatICSDate(endDate)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${description}`,
    event.location ? `LOCATION:${event.location}` : "",
    event.source_url ? `URL:${event.source_url}` : "",
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");

  return icsContent;
}

/**
 * Download an ICS file for an event
 */
export function downloadICS(event: Event): void {
  const icsContent = generateICS(event);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  // Create a temporary link and trigger download
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL object
  URL.revokeObjectURL(url);
}

/**
 * Get Google Calendar URL for an event
 */
export function getGoogleCalendarUrl(event: Event): string {
  const startDate = new Date(event.date);
  const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));

  const formatGoogleDate = (date: Date): string => {
    return format(date, "yyyyMMdd'T'HHmmss'Z'");
  };

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
    details: event.enhanced_description || event.original_description || "",
    location: event.location || "",
  });

  if (event.source_url) {
    params.append("sprop", `website:${event.source_url}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
