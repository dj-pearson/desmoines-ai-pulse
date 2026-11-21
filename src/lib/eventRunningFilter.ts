/**
 * The PostgREST `or=` group that keeps an event on a list: it starts at or
 * after the lower bound, OR it is a run whose end_date is at or after it.
 *
 * This list filtered `date >= today` alone, so a multi-day event fell off it on
 * its second morning even though it was still on. Site search goes through
 * useEvents (useKeywordResults), so on day three of the State Fair a search for
 * "state fair" found nothing while the hubs and the calendar, which already read
 * end_date (eventsHubQuery notOverFilter, useEventsInRange), listed it. The
 * subscribed .ics feeds had the same gap and were fixed the same way
 * (WEB-FEAT-041). A row with no end_date matches only on its own date, so a
 * past one-night show stays off.
 *
 * Lives here rather than in useEvents so a module that must not import the
 * Supabase client (src/pseo/listingFilters.ts, which a tsx script imports) can
 * send the same group. useEvents re-exports it.
 */
export function upcomingOrRunningFilter(lowerBoundIso: string): string {
  return `date.gte.${lowerBoundIso},end_date.gte.${lowerBoundIso}`;
}
