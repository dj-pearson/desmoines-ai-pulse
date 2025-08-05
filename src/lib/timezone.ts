import { format, parseISO } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";

// Des Moines, Iowa timezone (Central Time)
export const CENTRAL_TIMEZONE = "America/Chicago";

/**
 * Convert a date string or Date object to Central Time (Des Moines timezone)
 */
export function toCentralTime(date: string | Date): Date {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  return toZonedTime(dateObj, CENTRAL_TIMEZONE);
}

/**
 * Convert a Central Time date to UTC for storage
 */
export function centralTimeToUtc(date: Date): Date {
  return fromZonedTime(date, CENTRAL_TIMEZONE);
}

/**
 * Format a date in Central Time with the specified format
 */
export function formatInCentralTime(
  date: string | Date,
  formatStr: string = "MMM d, yyyy 'at' h:mm a"
): string {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  return formatInTimeZone(dateObj, CENTRAL_TIMEZONE, formatStr);
}

/**
 * Get the current date in Central Time
 */
export function nowInCentralTime(): Date {
  return toZonedTime(new Date(), CENTRAL_TIMEZONE);
}

/**
 * Create an event slug with Central Time date handling
 * This ensures consistent slug generation regardless of user's local timezone
 */
export function createEventSlugWithCentralTime(
  title: string,
  date?: string | Date
): string {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (!date) {
    return titleSlug;
  }

  try {
    // Convert to Central Time first to ensure consistent date extraction
    const centralDate = toCentralTime(date);
    const year = centralDate.getFullYear();
    const month = String(centralDate.getMonth() + 1).padStart(2, "0");
    const day = String(centralDate.getDate()).padStart(2, "0");

    return `${titleSlug}-${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error creating event slug with Central Time:", error);
    return titleSlug;
  }
}

/**
 * Check if an event date is in the future (Central Time)
 */
export function isEventInFuture(eventDate: string | Date): boolean {
  try {
    const eventCentralTime = toCentralTime(eventDate);
    const nowCentralTime = nowInCentralTime();
    return eventCentralTime > nowCentralTime;
  } catch (error) {
    console.error("Error checking if event is in future:", error);
    return false;
  }
}

/**
 * Format an event date for display to users (always in Central Time)
 */
export function formatEventDate(date: string | Date): string {
  try {
    return formatInCentralTime(date, "EEEE, MMMM d, yyyy 'at' h:mm a");
  } catch {
    return "Date and time to be announced";
  }
}

/**
 * Format an event date for card display (shorter format)
 */
export function formatEventDateShort(date: string | Date): string {
  try {
    return formatInCentralTime(date, "MMM d, yyyy 'at' h:mm a");
  } catch {
    return "Date TBA";
  }
}
