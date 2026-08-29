/**
 * DMI-011 — turning an extracted date string into the three columns the
 * `events` table stores, declared once.
 *
 * WHY THIS MOVED OUT OF `firecrawl-scraper/index.ts`. `ingest-events` writes to
 * the same table from a second producer, so it needs the identical conversion.
 * Copying it would put timezone arithmetic in two places, and a disagreement
 * between two copies is not a crash — it is events showing up an hour out on a
 * public page, in one direction, for half the year. This repo has now extracted
 * the prompts (DMI-007) and the dedup (DMI-010) for the same reason; this is the
 * third and last shared piece the two writers both need.
 *
 * WHAT IT DOES. Every extracted date is treated as CENTRAL TIME, because that
 * is what the extraction prompt asks the model for in capitals ("Store times in
 * Central Time format (not UTC). The system will handle UTC conversion
 * automatically"). The conversion happens here, once, and the row carries all
 * three of local, timezone and UTC so nothing downstream has to re-derive it.
 *
 * `NO_TIME_MARKER` IS A SENTINEL AND NOT A GUESS. A date with no time at all
 * gets `19:31:58` rather than midnight or 19:00, so a row whose time was never
 * stated is distinguishable later from one that genuinely starts at 7pm. Moved
 * verbatim; changing it would silently reclassify every existing all-day event.
 *
 * A NULL RETURN IS A REFUSAL. An unparseable date is not coerced to today, to
 * the epoch, or to midnight — the caller rejects the item and says which field
 * failed. An event with an invented date is worse than no event: it is a wrong
 * row on a public calendar that nobody can tell is wrong.
 */
import { parseISO } from "https://esm.sh/date-fns@3.6.0";
import { fromZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";

/** Every event on this site is in Des Moines. */
export const EVENT_TIME_ZONE = "America/Chicago";

/**
 * The time stamped on an event whose source stated a DAY but no TIME.
 *
 * Deliberately an odd value rather than a round one: a row reading 19:31:58 was
 * never given a time, while 19:00:00 is indistinguishable from a real 7pm show.
 */
export const NO_TIME_MARKER = "19:31:58";

export interface ParsedDateTime {
  event_start_local: string;
  event_timezone: string;
  event_start_utc: Date;
}

/**
 * Parse an extracted date string into local, timezone and UTC.
 *
 * Returns `null` for anything it cannot read. Three input shapes are handled:
 * `YYYY-MM-DD HH:MM:SS` (what the prompt asks for), `YYYY-MM-DD` (day only,
 * which earns the marker time), and anything `new Date()` can read, which is
 * then re-read as Central rather than as whatever zone it parsed in.
 */
export function parseEventDateTime(dateStr: string): ParsedDateTime | null {
  if (!dateStr) return null;

  try {
    let centralTimeString: string;

    if (dateStr.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      centralTimeString = dateStr;
    } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      centralTimeString = `${dateStr} ${NO_TIME_MARKER}`;
    } else {
      const fallbackDate = new Date(dateStr);
      if (isNaN(fallbackDate.getTime())) return null;
      // The fallback parse happens in the RUNTIME's zone, so its fields are read
      // back out and re-interpreted as Central below. That is deliberate: an
      // edge function's zone is not the event's zone, and taking the parsed
      // instant directly would shift every fallback-parsed event.
      const year = fallbackDate.getFullYear();
      const month = (fallbackDate.getMonth() + 1).toString().padStart(2, "0");
      const day = fallbackDate.getDate().toString().padStart(2, "0");
      const hours = fallbackDate.getHours().toString().padStart(2, "0");
      const minutes = fallbackDate.getMinutes().toString().padStart(2, "0");
      const seconds = fallbackDate.getSeconds().toString().padStart(2, "0");
      centralTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    const localDate = parseISO(centralTimeString);
    const utcDate = fromZonedTime(localDate, EVENT_TIME_ZONE);

    if (!isNaN(utcDate.getTime())) {
      return {
        event_start_local: centralTimeString,
        event_timezone: EVENT_TIME_ZONE,
        event_start_utc: utcDate,
      };
    }
  } catch {
    return null;
  }

  return null;
}
