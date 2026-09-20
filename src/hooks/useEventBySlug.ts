import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { EVENT_SLUG_COLUMNS } from "@/lib/listColumns";
import { slugToTitlePattern } from "@/lib/slug";
import type { Database } from "@/integrations/supabase/types";

const log = createLogger("useEventBySlug");

type Event = Database["public"]["Tables"]["events"]["Row"];

/**
 * Events have no `slug` column — slugs are derived client-side as
 * `<title-slug>-<YYYY-MM-DD>` (Central Time) by createEventSlugWithCentralTime.
 *
 * The detail page used to resolve a slug by pulling *every* upcoming event via
 * useEvents() and running Array.find over it. That silently broke two ways
 * (WEB-QA-002):
 *   1. the unbounded query hit PostgREST's max-rows cap, so far-future events were
 *      never in the array and 404'd even though the list happily linked to them;
 *   2. it applied different visibility filters than the list query.
 *
 * This hook instead parses the date out of the slug and queries only that narrow
 * date window, using the SAME visibility predicates as the list.
 */

const SLUG_DATE_RE = /-(\d{4})-(\d{2})-(\d{2})$/;

/** Widen by a day on each side: the slug's date is the Central-Time date of
 *  event_start_utc, which can differ from the stored `date` column across a
 *  UTC midnight boundary. */
const DAY_WINDOW = 1;

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function parseSlugDate(slug: string): string | null {
  const match = slug.match(SLUG_DATE_RE);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

async function fetchEventBySlug(slug: string): Promise<Event | null> {
  const slugDate = parseSlugDate(slug);

  // The candidate scan asks for the four columns the slug is DERIVED from, not
  // the whole row (WEB-PERF-035): under select("*") every candidate arrived
  // carrying the SEO/GEO text, search_vector and the PostGIS geometry so that
  // one of them could be kept. The match is re-fetched in full at the bottom,
  // because the detail page renders that content.
  let query = supabase
    .from("events")
    .select(EVENT_SLUG_COLUMNS)
    // Must mirror EventsPage / useEvents, or a listed event won't resolve here.
    .neq("is_merged", true)
    .neq("is_hidden", true)
    // WEB-BE-034: archived_at is the other unpublish switch.
    .is("archived_at", null);

  if (slugDate) {
    // `date` is a timestamptz, not a DATE. Comparing `lte '2026-07-18'` resolves to
    // 2026-07-18T00:00:00 and so drops a 00:30 row on that very day — which is
    // exactly how an evening-Central event (stored as the next day in UTC) went
    // missing. Use an exclusive upper bound one day past the window instead.
    query = query
      .gte("date", shiftDate(slugDate, -DAY_WINDOW))
      .lt("date", shiftDate(slugDate, DAY_WINDOW + 1));
  } else {
    // Legacy/dateless slug. This was a 1,000-row scan of everything upcoming,
    // filtered in JavaScript - the widest query on the site, run to find one
    // row (WEB-PERF-031). Slugging is lossy but only in one direction: every
    // run of non-alphanumerics became a hyphen, so the slug turns back into an
    // ilike pattern that the database can narrow with, and 20 candidates is
    // plenty to settle by exact slug afterwards.
    const pattern = slugToTitlePattern(slug);
    if (!pattern) return null;
    query = query
      .ilike("title", pattern)
      .gte("date", new Date().toISOString().split("T")[0])
      .order("date", { ascending: true })
      .limit(20);
  }

  const { data, error } = await query;

  if (error) {
    log.error("fetchEventBySlug", "Database query error", {
      slug,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  const match = (data ?? []).find(
    (e) => createEventSlugWithCentralTime(e.title, e) === slug
  );

  if (!match) return null;

  // Second round trip, only on a cache miss and only for the one row that
  // matched. select("*") is right here: EventDetail renders seo_*, geo_* and
  // the enhanced description.
  const { data: full, error: fullError } = await supabase
    .from("events")
    .select("*")
    .eq("id", match.id)
    .maybeSingle();

  if (fullError) {
    log.error("fetchEventBySlug", "Could not load the matched event", {
      slug,
      id: match.id,
      message: fullError.message,
      code: fullError.code,
    });
    throw fullError;
  }

  return (full as Event) ?? null;
}

export function useEventBySlug(slug: string | undefined) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["event-by-slug", slug],
    enabled: Boolean(slug),
    queryFn: () => fetchEventBySlug(slug as string),
    staleTime: 5 * 60 * 1000,
  });

  return { event: data ?? null, isLoading, error };
}
