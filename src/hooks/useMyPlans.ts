import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STALE_TIME } from "@/lib/queryConfig";
import {
  addCentralDays,
  centralDateOf,
  upcomingFloorUtc,
  type CentralDate,
} from "@/lib/timezone";

/**
 * Everything the signed-in person said they'd do, in Central time (account
 * plan WP3 item 1).
 *
 * WHAT THIS REPLACES. /my-events ran four queries that filtered and ordered on
 * the embedded `events` resource without `!inner`. PostgREST applies a filter
 * on a plain embed to the EMBED, not the parent, so a past RSVP came back as
 * `{ status: 'going', events: null }` on the Upcoming tab, and the reminders
 * tab crashed dereferencing `item.events.id`. "Today" was
 * `new Date().toISOString().split('T')[0]`, a UTC date, which drops tonight's
 * events after 7pm Central.
 *
 * Here every embed is `events!inner(...)`, so the date filter drops the parent
 * row, "today" is the Central calendar day, and null embeds are skipped anyway
 * because an RLS-hidden event still comes back as null on some paths.
 *
 * ORDERING IS CLIENT-SIDE. `.order('date', { referencedTable: 'events' })`
 * orders the embedded rows, not the parents, and ordering parents by an
 * embedded column needs PostgREST 11 syntax this self-hosted stack has not been
 * checked for. A person's own attendance rows are few, so each list is sorted
 * after the filter. Past is the one list with a cap: it takes the 20 most
 * recent EVENTS after the date filter, not 20 attendance rows.
 *
 * Each source reports its own isError so a page can say which part failed
 * instead of showing "No upcoming events" over rows it could not read.
 */

/** The event columns a plan row needs. All are in scripts/db-snapshot.json. */
const PLAN_EVENT_COLUMNS =
  "id, title, date, event_start_utc, event_start_local, venue, location, category, image_url, price";

export const PAST_PLAN_LIMIT = 20;
/** Safety cap on the past read, which is sorted client-side before the slice. */
const PAST_FETCH_CAP = 500;
export const WEEK_DAYS = 7;

export interface PlanEvent {
  id: string;
  title: string | null;
  date: string | null;
  event_start_utc: string | null;
  event_start_local: string | null;
  venue: string | null;
  location: string | null;
  category: string | null;
  image_url: string | null;
  price: string | null;
}

export type AttendanceStatus = "going" | "interested";

export interface AttendanceRow {
  event_id: string;
  status: string;
  created_at: string;
  events: PlanEvent | null;
}

export interface ReminderRow {
  id: string;
  reminder_type: string;
  created_at: string;
  events: PlanEvent | null;
}

export interface FavoriteRow {
  event_id: string;
  created_at: string;
  events: PlanEvent | null;
}

export interface PlaceFavorite {
  content_type: string;
  content_id: string;
  created_at: string;
}

export interface AttendancePlan {
  event: PlanEvent;
  status: AttendanceStatus;
  day: CentralDate;
}

export interface ReminderPlan {
  event: PlanEvent;
  day: CentralDate;
  reminderTypes: string[];
}

export interface SavedEventPlan {
  event: PlanEvent;
  day: CentralDate;
}

export type PlanReason = "going" | "interested" | "saved" | "reminder";

/** One event on one day of the week view, with every reason it is there. */
export interface WeekItem {
  event: PlanEvent;
  day: CentralDate;
  reasons: PlanReason[];
  reminderTypes: string[];
}

export interface WeekDay {
  day: CentralDate;
  items: WeekItem[];
}

// ---------------------------------------------------------------------------
// Pure helpers. Exported for src/hooks/__tests__/useMyPlans.test.ts.
// ---------------------------------------------------------------------------

/** The instant an event starts: the UTC column when set, else legacy `date`. */
export function eventInstant(event: PlanEvent): string | null {
  return event.event_start_utc || event.date || null;
}

/** The Central calendar day an event falls on, or null when it has no date. */
export function eventDay(event: PlanEvent): CentralDate | null {
  const instant = eventInstant(event);
  if (!instant) return null;
  try {
    return centralDateOf(instant);
  } catch {
    return null;
  }
}

function instantMs(event: PlanEvent): number {
  const instant = eventInstant(event);
  const ms = instant ? new Date(instant).getTime() : NaN;
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

function isAttendanceStatus(status: string): status is AttendanceStatus {
  return status === "going" || status === "interested";
}

/**
 * Attendance rows on or after today in Central, soonest first. The server
 * filter already did most of this; the re-check is what makes the Central
 * boundary hold if a row slips through a looser server floor.
 */
export function pickUpcoming(rows: AttendanceRow[], now: Date = new Date()): AttendancePlan[] {
  const today = centralDateOf(now);
  const seen = new Set<string>();
  const plans: AttendancePlan[] = [];
  for (const row of rows) {
    const event = row.events;
    if (!event || !isAttendanceStatus(row.status) || seen.has(event.id)) continue;
    const day = eventDay(event);
    if (!day || day < today) continue;
    seen.add(event.id);
    plans.push({ event, status: row.status, day });
  }
  return plans.sort((a, b) => instantMs(a.event) - instantMs(b.event));
}

/** Attendance rows before today in Central, most recent first, capped. */
export function pickPast(
  rows: AttendanceRow[],
  now: Date = new Date(),
  limit: number = PAST_PLAN_LIMIT,
): AttendancePlan[] {
  const today = centralDateOf(now);
  const seen = new Set<string>();
  const plans: AttendancePlan[] = [];
  for (const row of rows) {
    const event = row.events;
    if (!event || !isAttendanceStatus(row.status) || seen.has(event.id)) continue;
    const day = eventDay(event);
    if (!day || day >= today) continue;
    seen.add(event.id);
    plans.push({ event, status: row.status, day });
  }
  return plans.sort((a, b) => instantMs(b.event) - instantMs(a.event)).slice(0, limit);
}

/** Pending reminders grouped by event, today onward, soonest first. */
export function groupReminders(rows: ReminderRow[], now: Date = new Date()): ReminderPlan[] {
  const today = centralDateOf(now);
  const byEvent = new Map<string, ReminderPlan>();
  for (const row of rows) {
    const event = row.events;
    if (!event) continue;
    const day = eventDay(event);
    if (!day || day < today) continue;
    const existing = byEvent.get(event.id);
    if (existing) {
      if (!existing.reminderTypes.includes(row.reminder_type)) {
        existing.reminderTypes.push(row.reminder_type);
      }
    } else {
      byEvent.set(event.id, { event, day, reminderTypes: [row.reminder_type] });
    }
  }
  return [...byEvent.values()].sort((a, b) => instantMs(a.event) - instantMs(b.event));
}

/** Favorited events today onward, soonest first. */
export function pickSavedEvents(rows: FavoriteRow[], now: Date = new Date()): SavedEventPlan[] {
  const today = centralDateOf(now);
  const seen = new Set<string>();
  const plans: SavedEventPlan[] = [];
  for (const row of rows) {
    const event = row.events;
    if (!event || seen.has(event.id)) continue;
    const day = eventDay(event);
    if (!day || day < today) continue;
    seen.add(event.id);
    plans.push({ event, day });
  }
  return plans.sort((a, b) => instantMs(a.event) - instantMs(b.event));
}

/**
 * The next seven Central days (today and the six after it), one entry per
 * event, grouped by day. An event that is both "going" and saved with a
 * reminder is one row carrying three reasons, not three rows. Days with
 * nothing on them are left out.
 */
export function buildWeek(
  sources: {
    upcoming: AttendancePlan[];
    saved: SavedEventPlan[];
    reminders: ReminderPlan[];
  },
  now: Date = new Date(),
): WeekDay[] {
  const today = centralDateOf(now);
  const last = addCentralDays(today, WEEK_DAYS - 1);
  const inWeek = (day: CentralDate) => day >= today && day <= last;

  const items = new Map<string, WeekItem>();
  const add = (event: PlanEvent, day: CentralDate, reason: PlanReason, reminderTypes: string[] = []) => {
    if (!inWeek(day)) return;
    const existing = items.get(event.id);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      for (const type of reminderTypes) {
        if (!existing.reminderTypes.includes(type)) existing.reminderTypes.push(type);
      }
      return;
    }
    items.set(event.id, { event, day, reasons: [reason], reminderTypes: [...reminderTypes] });
  };

  for (const plan of sources.upcoming) add(plan.event, plan.day, plan.status);
  for (const plan of sources.saved) add(plan.event, plan.day, "saved");
  for (const plan of sources.reminders) add(plan.event, plan.day, "reminder", plan.reminderTypes);

  const reasonOrder: PlanReason[] = ["going", "interested", "saved", "reminder"];
  const byDay = new Map<CentralDate, WeekItem[]>();
  for (const item of items.values()) {
    item.reasons.sort((a, b) => reasonOrder.indexOf(a) - reasonOrder.indexOf(b));
    const list = byDay.get(item.day) ?? [];
    list.push(item);
    byDay.set(item.day, list);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, dayItems]) => ({
      day,
      items: dayItems.sort((a, b) => instantMs(a.event) - instantMs(b.event)),
    }));
}

// ---------------------------------------------------------------------------
// The hook.
// ---------------------------------------------------------------------------

export interface PlanSourceState {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export interface UseMyPlansOptions {
  /** Read past attendance (the /my-events Past tab). Off on the dashboard. */
  includePast?: boolean;
  /** Read place favorites from content_favorites. Off on the dashboard. */
  includePlaces?: boolean;
}

export const myPlansKeys = {
  all: ["my-plans"] as const,
  upcoming: (userId: string | undefined, today: CentralDate) => ["my-plans", "upcoming", userId, today] as const,
  past: (userId: string | undefined, today: CentralDate) => ["my-plans", "past", userId, today] as const,
  saved: (userId: string | undefined, today: CentralDate) => ["my-plans", "saved", userId, today] as const,
  reminders: (userId: string | undefined, today: CentralDate) => ["my-plans", "reminders", userId, today] as const,
  places: (userId: string | undefined) => ["my-plans", "places", userId] as const,
};

function sourceState(query: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}): PlanSourceState {
  return {
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}

export function useMyPlans(options: UseMyPlansOptions = {}) {
  const { includePast = false, includePlaces = false } = options;
  const { user } = useAuth();
  const userId = user?.id;
  const signedIn = !!userId;
  // Recomputed each render; the key changes at Central midnight, so a page
  // left open overnight refetches with the new floor instead of keeping
  // yesterday's evening on "Upcoming".
  const today = centralDateOf();

  const upcomingQuery = useQuery({
    queryKey: myPlansKeys.upcoming(userId, today),
    enabled: signedIn,
    staleTime: STALE_TIME.USER,
    queryFn: async (): Promise<AttendancePlan[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("event_attendance")
        .select(`event_id, status, created_at, events!inner(${PLAN_EVENT_COLUMNS})`)
        .eq("user_id", userId)
        .in("status", ["going", "interested"])
        .gte("events.date", upcomingFloorUtc());
      if (error) throw error;
      return pickUpcoming((data ?? []) as unknown as AttendanceRow[]);
    },
  });

  const pastQuery = useQuery({
    queryKey: myPlansKeys.past(userId, today),
    enabled: signedIn && includePast,
    staleTime: STALE_TIME.USER,
    queryFn: async (): Promise<AttendancePlan[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("event_attendance")
        .select(`event_id, status, created_at, events!inner(${PLAN_EVENT_COLUMNS})`)
        .eq("user_id", userId)
        .in("status", ["going", "interested"])
        .lt("events.date", upcomingFloorUtc())
        .order("created_at", { ascending: false })
        .limit(PAST_FETCH_CAP);
      if (error) throw error;
      return pickPast((data ?? []) as unknown as AttendanceRow[]);
    },
  });

  const savedQuery = useQuery({
    queryKey: myPlansKeys.saved(userId, today),
    enabled: signedIn,
    staleTime: STALE_TIME.USER,
    queryFn: async (): Promise<SavedEventPlan[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_event_interactions")
        .select(`event_id, created_at, events!inner(${PLAN_EVENT_COLUMNS})`)
        .eq("user_id", userId)
        .eq("interaction_type", "favorite")
        .gte("events.date", upcomingFloorUtc());
      if (error) throw error;
      return pickSavedEvents((data ?? []) as unknown as FavoriteRow[]);
    },
  });

  const remindersQuery = useQuery({
    queryKey: myPlansKeys.reminders(userId, today),
    enabled: signedIn,
    staleTime: STALE_TIME.USER,
    queryFn: async (): Promise<ReminderPlan[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_event_reminders")
        .select(`id, reminder_type, created_at, events!inner(${PLAN_EVENT_COLUMNS})`)
        .eq("user_id", userId)
        .eq("delivery_status", "pending")
        .gte("events.date", upcomingFloorUtc());
      if (error) throw error;
      return groupReminders((data ?? []) as unknown as ReminderRow[]);
    },
  });

  const placesQuery = useQuery({
    queryKey: myPlansKeys.places(userId),
    enabled: signedIn && includePlaces,
    staleTime: STALE_TIME.USER,
    queryFn: async (): Promise<PlaceFavorite[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("content_favorites")
        .select("content_type, content_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlaceFavorite[];
    },
  });

  const upcoming = upcomingQuery.data ?? [];
  const saved = savedQuery.data ?? [];
  const reminders = remindersQuery.data ?? [];
  const week = buildWeek({ upcoming, saved, reminders });

  const weekSources = [upcomingQuery, savedQuery, remindersQuery];

  return {
    upcoming,
    past: pastQuery.data ?? [],
    savedEvents: saved,
    savedPlaces: placesQuery.data ?? [],
    reminders,
    week,
    /** True while any source the week view reads is still on its first load. */
    weekLoading: weekSources.some((q) => q.isLoading),
    /** Sources the week view reads that failed. */
    weekErrors: {
      upcoming: upcomingQuery.isError,
      saved: savedQuery.isError,
      reminders: remindersQuery.isError,
    },
    sources: {
      upcoming: sourceState(upcomingQuery),
      past: sourceState(pastQuery),
      saved: sourceState(savedQuery),
      reminders: sourceState(remindersQuery),
      places: sourceState(placesQuery),
    },
    refetchWeek: () => {
      for (const q of weekSources) {
        if (q.isError) void q.refetch();
      }
    },
  };
}
