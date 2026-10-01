// Shared wording for the events pages (docs/page-plans/events.md WP0 item 7).
// The hub, /events/today and /events/this-weekend each answered "how often is
// this updated" differently ("every day", "in real-time throughout the day",
// "typically on Thursday and Friday"). The collectors run once a day; this is
// the one sentence all three FAQs use.

/** How often new events arrive. Fits "Events are ___." */
export const EVENTS_UPDATE_CADENCE = "collected daily";

/** The FAQ answer to "How often is this list updated?" */
export const EVENTS_UPDATE_ANSWER =
  "New events are collected daily from venue and organizer calendars. All times are Central Time, and each list shows when it was last updated.";
