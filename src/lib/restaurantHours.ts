/**
 * Utility to determine if a restaurant is currently open based on its `opening` text field.
 *
 * The `opening` column is a free-form text string with varying formats such as:
 *   "Mon-Sat 11am-10pm, Sun 12-9pm"
 *   "Daily 11am-10pm"
 *   "24 hours"
 *   "Closed Mondays"
 *   "11:00 AM - 10:00 PM"
 *
 * When the field is empty/null we return `unknown` so the badge is hidden.
 */

export type OpenStatus = 'open' | 'closed' | 'closing-soon' | 'unknown';

export interface RestaurantOpenResult {
  status: OpenStatus;
  isOpen: boolean;
  closingSoon: boolean;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const DAY_ABBREVS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/**
 * Parse a time string like "11am", "11:00 AM", "10pm", "22:00" into minutes since midnight.
 */
function parseTime(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');

  // Handle "noon" / "midnight"
  if (s === 'noon' || s === '12noon') return 12 * 60;
  if (s === 'midnight' || s === '12midnight') return 0;

  // Pattern: H:MMam/pm or H:MM am/pm or HH:MM
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.replace(/\./g, '');

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  // Sanity check
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * Resolve a day range like "mon-fri" or "mon-sat" into a Set of day indices.
 */
function parseDayRange(raw: string): Set<number> {
  const s = raw.trim().toLowerCase();
  const days = new Set<number>();

  // "daily" / "every day" / "7 days"
  if (s.includes('daily') || s.includes('every day') || s.includes('7 days')) {
    for (let i = 0; i < 7; i++) days.add(i);
    return days;
  }

  // "weekdays"
  if (s === 'weekdays') {
    for (let i = 1; i <= 5; i++) days.add(i);
    return days;
  }

  // "weekends"
  if (s === 'weekends') {
    days.add(0);
    days.add(6);
    return days;
  }

  // Range: "mon-fri", "tue-sat"
  const rangeMatch = s.match(/^([a-z]+)\s*[-–—to]+\s*([a-z]+)$/);
  if (rangeMatch) {
    const start = DAY_ABBREVS[rangeMatch[1]];
    const end = DAY_ABBREVS[rangeMatch[2]];
    if (start !== undefined && end !== undefined) {
      let i = start;
      while (true) {
        days.add(i);
        if (i === end) break;
        i = (i + 1) % 7;
      }
      return days;
    }
  }

  // Single day: "monday"
  const single = DAY_ABBREVS[s];
  if (single !== undefined) {
    days.add(single);
    return days;
  }

  return days;
}

interface TimeRange {
  days: Set<number>;
  openMinutes: number;
  closeMinutes: number;
}

/**
 * Try to extract structured time ranges from the opening text.
 * Returns null if the text is too ambiguous to parse.
 */
function parseOpeningText(opening: string): TimeRange[] | null {
  const text = opening.trim().toLowerCase();

  // Quick checks for always-open or always-closed
  if (text.includes('24 hour') || text.includes('24/7') || text === 'always open') {
    const allDays = new Set<number>();
    for (let i = 0; i < 7; i++) allDays.add(i);
    return [{ days: allDays, openMinutes: 0, closeMinutes: 24 * 60 }];
  }

  if (text === 'closed' || text === 'permanently closed' || text.startsWith('temporarily closed')) {
    return []; // Empty array = always closed
  }

  const ranges: TimeRange[] = [];

  // Split on common separators: semicolons, pipes, ";"
  // Also try comma-separated segments that contain day names
  const segments = opening.split(/[;|]/).map(s => s.trim()).filter(Boolean);
  // If only one segment, try splitting on comma but only if pieces contain day info
  const finalSegments = segments.length === 1
    ? splitByDaySegments(segments[0])
    : segments;

  for (const segment of finalSegments) {
    const parsed = parseSegment(segment);
    if (parsed) {
      ranges.push(parsed);
    }
  }

  return ranges.length > 0 ? ranges : null;
}

/**
 * Split a comma-separated string into day-based segments.
 * e.g. "Mon-Fri 11am-10pm, Sat-Sun 10am-11pm" → ["Mon-Fri 11am-10pm", "Sat-Sun 10am-11pm"]
 */
function splitByDaySegments(text: string): string[] {
  const parts = text.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [text];

  // Check if parts look like they have day names
  const hasDayInfo = parts.some(p => {
    const lower = p.toLowerCase();
    return Object.keys(DAY_ABBREVS).some(d => lower.includes(d)) || lower.includes('daily');
  });

  return hasDayInfo ? parts : [text];
}

/**
 * Parse a single segment like "Mon-Fri 11am-10pm" or "11am - 10pm" or "Daily 11am-10pm"
 */
function parseSegment(segment: string): TimeRange | null {
  const s = segment.trim();
  const lower = s.toLowerCase();

  // Try to find a time range pattern: TIME - TIME
  // Common patterns: "11am-10pm", "11:00 AM - 10:00 PM", "11am to 10pm"
  const timeRangeRegex = /(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\s*[-–—to]+\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/i;
  const timeMatch = lower.match(timeRangeRegex);
  if (!timeMatch) return null;

  const openMinutes = parseTime(timeMatch[1]);
  const closeMinutes = parseTime(timeMatch[2]);
  if (openMinutes === null || closeMinutes === null) return null;

  // Try to find day info before the time range
  const beforeTime = lower.substring(0, lower.indexOf(timeMatch[0])).trim();
  let days: Set<number>;

  if (beforeTime) {
    // Check for "closed" keyword indicating this day is closed
    if (beforeTime.includes('closed')) return null;
    days = parseDayRange(beforeTime);
  } else {
    days = new Set<number>();
  }

  // If no day info was found, assume all days
  if (days.size === 0) {
    for (let i = 0; i < 7; i++) days.add(i);
  }

  return { days, openMinutes, closeMinutes };
}

/**
 * Determine if a restaurant is currently open based on its `opening` text field.
 *
 * @param opening - The restaurant's `opening` field (free-form text describing hours)
 * @param now - Optional date for testing (defaults to current time)
 * @returns OpenStatus result. If `opening` is null/empty, returns `unknown` so badge is hidden.
 */
export function getRestaurantOpenStatus(opening: string | null | undefined, now?: Date): RestaurantOpenResult {
  const unknown: RestaurantOpenResult = { status: 'unknown', isOpen: false, closingSoon: false };

  if (!opening || !opening.trim()) {
    return unknown;
  }

  // Check for explicit "closed" mentions for today
  const lower = opening.toLowerCase();
  const today = (now || new Date()).getDay();
  const todayName = DAY_NAMES[today];

  // If opening text just says "Closed" with nothing else
  if (lower.trim() === 'closed' || lower.includes('permanently closed') || lower.includes('temporarily closed')) {
    return { status: 'closed', isOpen: false, closingSoon: false };
  }

  // Check for "Closed [today's day]" pattern
  const closedDayRegex = new RegExp(`closed\\s+(?:on\\s+)?${todayName}s?`, 'i');
  if (closedDayRegex.test(lower)) {
    return { status: 'closed', isOpen: false, closingSoon: false };
  }

  const ranges = parseOpeningText(opening);

  if (ranges === null) {
    // Could not parse - return unknown so badge is hidden
    return unknown;
  }

  if (ranges.length === 0) {
    // Explicitly closed
    return { status: 'closed', isOpen: false, closingSoon: false };
  }

  const currentDate = now || new Date();
  const dayOfWeek = currentDate.getDay();
  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();

  // Find a matching range for today
  for (const range of ranges) {
    if (!range.days.has(dayOfWeek)) continue;

    let effectiveClose = range.closeMinutes;
    // Handle overnight hours (e.g., 6pm-2am means close is next day)
    if (range.closeMinutes <= range.openMinutes) {
      effectiveClose = range.closeMinutes + 24 * 60;
    }

    if (currentMinutes >= range.openMinutes && currentMinutes < effectiveClose) {
      // We're within open hours
      const minutesUntilClose = effectiveClose - currentMinutes;
      if (minutesUntilClose <= 60) {
        return { status: 'closing-soon', isOpen: true, closingSoon: true };
      }
      return { status: 'open', isOpen: true, closingSoon: false };
    }

    // Also check if we're in the overnight portion (past midnight)
    if (range.closeMinutes <= range.openMinutes && currentMinutes < range.closeMinutes) {
      const minutesUntilClose = range.closeMinutes - currentMinutes;
      if (minutesUntilClose <= 60) {
        return { status: 'closing-soon', isOpen: true, closingSoon: true };
      }
      return { status: 'open', isOpen: true, closingSoon: false };
    }
  }

  return { status: 'closed', isOpen: false, closingSoon: false };
}
