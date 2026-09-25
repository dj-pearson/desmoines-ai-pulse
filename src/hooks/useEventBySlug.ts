import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { createEventSlugWithCentralTime, upcomingFloorUtc } from "@/lib/timezone";
import { EVENT_LIST_COLUMNS, EVENT_SLUG_COLUMNS } from "@/lib/listColumns";
import { createSlug, slugToTitlePattern } from "@/lib/slug";
import { applyEventVisibility } from "@/lib/eventQuery";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a bare row id, which push payloads, favorites and emails still build. */
export function isEventIdSlug(slug: string): boolean {
  return UUID_RE.test(slug);
}

export interface SlugCandidate {
  id: string;
  title: string | null;
  date: string | null;
  event_start_utc?: string | null;
}

function startMs(e: SlugCandidate): number {
  const t = Date.parse(e.event_start_utc || e.date || "");
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** The earliest-starting candidate, or null for none. Ties keep input order. */
function soonest<C extends SlugCandidate>(candidates: readonly C[]): C | null {
  let best: C | null = null;
  for (const c of candidates) {
    if (!best || startMs(c) < startMs(best)) best = c;
  }
  return best;
}

/** Words of three or more characters, for the stale-slug overlap guard. */
function significantWords(titleSlug: string): Set<string> {
  return new Set(titleSlug.split("-").filter((w) => w.length >= 3));
}

/**
 * Which candidate a slug names (events plan WP8 item 2).
 *
 *   1. The exact slug.
 *   2. A stale slug: the title part matches exactly one candidate in the
 *      window (the event moved a day), or the date part matches exactly one
 *      candidate whose title shares a word with the slug (the scraper retitled
 *      it). More than one candidate is ambiguous and returns null, a 404,
 *      rather than a guess.
 *   3. A dateless slug: the soonest candidate whose title slugs to exactly
 *      the slug (events-pass2 WP4 item 1).
 *
 * The caller redirects to the canonical slug whenever it differs.
 */
export function pickSlugCandidate<C extends SlugCandidate>(slug: string, candidates: readonly C[]): C | null {
  const exact = candidates.find((e) => createEventSlugWithCentralTime(e.title, e) === slug);
  if (exact) return exact;

  const slugDate = parseSlugDate(slug);
  if (!slugDate) {
    // A dateless slug (events-pass2 WP4 item 1). Reminder and digest emails
    // still build these, and every one of them 404'd. The title has to match
    // exactly; among same-title rows the soonest wins, since that is the
    // occurrence a reminder or a digest was pointing at.
    return soonest(candidates.filter((e) => createSlug(e.title ?? "") === slug));
  }
  const titlePart = slug.slice(0, -"-yyyy-mm-dd".length);

  const sameTitle = candidates.filter((e) => createSlug(e.title ?? "") === titlePart);
  if (sameTitle.length === 1) return sameTitle[0];
  if (sameTitle.length > 1) return null;

  const wanted = significantWords(titlePart);
  if (wanted.size === 0) return null;
  const sameDay = candidates.filter(
    (e) => createEventSlugWithCentralTime(e.title, e).endsWith(`-${slugDate}`)
  );
  const overlapping = sameDay.filter((e) =>
    [...significantWords(createSlug(e.title ?? ""))].some((w) => wanted.has(w))
  );
  return sameDay.length === 1 && overlapping.length === 1 ? overlapping[0] : null;
}

/**
 * The columns event detail reads (events-pass2 WP4 item 16), instead of
 * select("*"), which also shipped search_vector, the PostGIS geom and the
 * heal bookkeeping on every view. The list columns plus what only the detail
 * page renders: SEO and GEO text, the AI write-up, the link checker's verdict
 * (provenance line, CTA), and the recurrence and merge pointers (series line,
 * merged-duplicate redirect). time_tbd is not here: it is not in
 * scripts/db-snapshot.json (plan D5), and selecting a missing column is a
 * 42703 on every detail view.
 */
export const EVENT_DETAIL_COLUMNS = `${EVENT_LIST_COLUMNS}, seo_title, seo_description, seo_keywords, seo_h1, geo_summary, geo_key_facts, geo_faq, ai_writeup, writeup_prompt_used, source_url_broken, source_url_checked_at, recurrence_parent_id, merged_into, is_recurring_instance`;

/** What the unpublish columns say about a row the visible lookup didn't return. */
export interface UnlistedRow {
  id: string;
  is_merged?: boolean | null;
  merged_into?: string | null;
  is_hidden?: boolean | null;
  archived_at?: string | null;
}

export type UnlistedVerdict =
  | { kind: "merged"; survivorId: string }
  | { kind: "archived"; id: string }
  | { kind: "gone" };

/**
 * Why a row is off the lists, and what its URL should do about it
 * (events-pass2 WP4 item 11):
 *   - merged into a survivor: redirect there, so a shared link keeps working;
 *   - archived: the event happened, so render it as a past event with noindex;
 *   - hidden by a moderator, or merged with no survivor recorded: a 404.
 * Hidden wins over everything else: a moderator's call is not overridden by
 * the dedupe or archive sweeps.
 */
export function classifyUnlisted(row: UnlistedRow | null | undefined): UnlistedVerdict {
  if (!row || row.is_hidden) return { kind: "gone" };
  if (row.is_merged) {
    return row.merged_into && row.merged_into !== row.id
      ? { kind: "merged", survivorId: row.merged_into }
      : { kind: "gone" };
  }
  if (row.archived_at) return { kind: "archived", id: row.id };
  return { kind: "gone" };
}

export interface EventLookup {
  event: Event;
  /** True when the row was retired by the archive sweep: render it, noindex. */
  archived: boolean;
}

const UNLISTED_COLUMNS = "id, title, date, event_start_utc, is_merged, merged_into, is_hidden, archived_at";

/** Merge chains are short; this only stops a cycle in bad data. */
const MAX_MERGE_HOPS = 3;

async function fetchFullEvent(
  slug: string,
  id: string,
  { visibleOnly = true }: { visibleOnly?: boolean } = {}
): Promise<Event | null> {
  const base = supabase.from("events").select(EVENT_DETAIL_COLUMNS);
  // The non-visible read serves only the archived render (classifyUnlisted),
  // so it asks for archived rows by name rather than dropping the switch.
  const query = visibleOnly
    ? applyEventVisibility(base)
    : base.neq("is_hidden", true).not("archived_at", "is", null);
  const { data: full, error: fullError } = await query.eq("id", id).maybeSingle();

  if (fullError) {
    log.error("fetchEventBySlug", "Could not load the matched event", {
      slug,
      id,
      message: fullError.message,
      code: fullError.code,
    });
    throw fullError;
  }

  return (full as unknown as Event) ?? null;
}

/**
 * The candidate read. `visibleOnly` false drops the merge and archive
 * predicates (never is_hidden's) for the second look in findUnlisted.
 */
async function fetchCandidates(slug: string, visibleOnly: boolean): Promise<SlugCandidate[] | null> {
  const slugDate = parseSlugDate(slug);

  // The candidate scan asks for the columns the slug is DERIVED from, not the
  // whole row (WEB-PERF-035). The match is re-fetched with the detail columns.
  const columns: string = visibleOnly ? EVENT_SLUG_COLUMNS : UNLISTED_COLUMNS;
  const base = supabase.from("events").select(columns);
  // Must mirror EventsPage / useEvents, or a listed event won't resolve here.
  // The second look is only for rows the dedupe or archive sweep took off the
  // lists; a moderator's hide is never looked past.
  let query = visibleOnly
    ? applyEventVisibility(base)
    : base.neq("is_hidden", true).or("is_merged.eq.true,archived_at.not.is.null");

  if (slugDate) {
    // `date` is a timestamptz, not a DATE. Comparing `lte '2026-07-18'` resolves to
    // 2026-07-18T00:00:00 and so drops a 00:30 row on that very day, which is
    // exactly how an evening-Central event (stored as the next day in UTC) went
    // missing. Use an exclusive upper bound one day past the window instead.
    query = query
      .gte("date", shiftDate(slugDate, -DAY_WINDOW))
      .lt("date", shiftDate(slugDate, DAY_WINDOW + 1));
  } else {
    // Legacy/dateless slug (WEB-PERF-031): the slug turns back into an ilike
    // pattern the database can narrow with, and 20 candidates is plenty to
    // settle by exact title afterwards.
    const pattern = slugToTitlePattern(slug);
    if (!pattern) return null;
    query = query
      .ilike("title", pattern)
      // Start of today in Central: a UTC date drops tonight's events after 7pm.
      .gte("date", upcomingFloorUtc())
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
  return (data ?? []) as unknown as SlugCandidate[];
}

/**
 * The second look, only after the visible lookup came back empty: the same
 * id or candidate read without the merge and archive predicates.
 */
async function findUnlisted(slug: string): Promise<EventLookup | null> {
  let row: UnlistedRow | null = null;
  if (isEventIdSlug(slug)) {
    const { data, error } = await supabase
      .from("events")
      .select(UNLISTED_COLUMNS)
      .eq("id", slug)
      .neq("is_hidden", true)
      .or("is_merged.eq.true,archived_at.not.is.null")
      .maybeSingle();
    if (error) throw error;
    row = (data as unknown as UnlistedRow) ?? null;
  } else {
    const candidates = await fetchCandidates(slug, false);
    row = (pickSlugCandidate(slug, candidates ?? []) as (SlugCandidate & UnlistedRow) | null) ?? null;
  }

  let verdict = classifyUnlisted(row);
  for (let hop = 0; hop < MAX_MERGE_HOPS && verdict.kind === "merged"; hop++) {
    const survivor = await fetchFullEvent(slug, verdict.survivorId);
    if (survivor) return { event: survivor, archived: false };
    // The survivor was merged or archived in turn. A hidden survivor reads
    // as null here, which classifyUnlisted turns into a 404.
    const { data, error } = await supabase
      .from("events")
      .select(UNLISTED_COLUMNS)
      .eq("id", verdict.survivorId)
      .neq("is_hidden", true)
      .or("is_merged.eq.true,archived_at.not.is.null")
      .maybeSingle();
    if (error) throw error;
    verdict = classifyUnlisted((data as unknown as UnlistedRow) ?? null);
  }

  if (verdict.kind !== "archived") return null;
  const event = await fetchFullEvent(slug, verdict.id, { visibleOnly: false });
  return event ? { event, archived: true } : null;
}

async function fetchEventBySlug(slug: string): Promise<EventLookup | null> {
  let event: Event | null = null;
  if (isEventIdSlug(slug)) {
    // A bare UUID (WP8 item 2, D9): look the row up by id with the same
    // visibility predicates. EventDetails then redirects to the canonical slug.
    event = await fetchFullEvent(slug, slug);
  } else {
    const candidates = await fetchCandidates(slug, true);
    if (candidates === null) return null;
    const match = pickSlugCandidate(slug, candidates);
    // Second round trip, only on a cache miss and only for the one row that
    // matched.
    if (match) event = await fetchFullEvent(slug, match.id);
  }
  if (event) return { event, archived: false };
  return findUnlisted(slug);
}

/**
 * The page redirects any non-canonical slug to the canonical one. Seeding
 * that key first means the redirect renders from cache instead of repeating
 * the lookup (events-pass2 WP4 item 16).
 */
function seedCanonical(queryClient: QueryClient, slug: string, lookup: EventLookup | null): void {
  if (!lookup) return;
  const canonical = createEventSlugWithCentralTime(lookup.event.title, lookup.event);
  if (canonical && canonical !== slug) {
    queryClient.setQueryData(["event-by-slug", canonical], lookup);
  }
}

export function useEventBySlug(slug: string | undefined) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["event-by-slug", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const lookup = await fetchEventBySlug(slug as string);
      seedCanonical(queryClient, slug as string, lookup);
      return lookup;
    },
    staleTime: 5 * 60 * 1000,
  });

  // error and refetch are read by EventDetails so a failed request renders
  // Retry instead of "Event Not Found" plus noindex (WP8 item 3).
  return {
    event: data?.event ?? null,
    archived: data?.archived ?? false,
    isLoading,
    error,
    refetch,
    isFetching,
  };
}
