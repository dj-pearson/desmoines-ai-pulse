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
 * Prefers new timezone fields over legacy date field
 */
export function createEventSlugWithCentralTime(
  title: string,
  event?: { date?: string | Date; event_start_utc?: string; event_start_local?: string; event_timezone?: string }
): string {
  const titleSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (!event) {
    return titleSlug;
  }

  try {
    let dateToUse: string | Date | undefined;
    
    // Use new timezone-aware fields if available
    if (event.event_start_utc) {
      dateToUse = event.event_start_utc;
    } else if (event.date) {
      dateToUse = event.date;
    }
    
    if (!dateToUse) {
      return titleSlug;
    }

    // Convert to Central Time first to ensure consistent date extraction
    const centralDate = toCentralTime(dateToUse);
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
 * Prefers new timezone fields over legacy date field
 */
export function formatEventDate(event: { date?: string | Date; event_start_utc?: string; event_start_local?: string; event_timezone?: string }): string {
  try {
    // Use new timezone-aware fields if available
    if (event.event_start_utc) {
      return formatInCentralTime(event.event_start_utc, "EEEE, MMMM d, yyyy 'at' h:mm a");
    }
    
    // Fallback to legacy date field
    if (event.date) {
      return formatInCentralTime(event.date, "EEEE, MMMM d, yyyy 'at' h:mm a");
    }
    
    return "Date and time to be announced";
  } catch {
    return "Date and time to be announced";
  }
}

/**
 * Format an event date for card display (shorter format)
 * Prefers new timezone fields over legacy date field
 */
export function formatEventDateShort(event: { date?: string | Date; event_start_utc?: string; event_start_local?: string; event_timezone?: string }): string {
  try {
    // Use new timezone-aware fields if available
    if (event.event_start_utc) {
      return formatInCentralTime(event.event_start_utc, "MMM d, yyyy 'at' h:mm a");
    }
    
    // Fallback to legacy date field
    if (event.date) {
      return formatInCentralTime(event.date, "MMM d, yyyy 'at' h:mm a");
    }
    
    return "Date TBA";
  } catch {
    return "Date TBA";
  }
}
