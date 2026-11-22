import { supabase } from "@/integrations/supabase/client";
import { DES_MOINES_TIME_ZONE, type StoredOpeningHours } from "@/lib/restaurantStatus";
import { periodsFromHoursText } from "@/lib/restaurantHours";
import { setRestaurantFieldLocks } from "@/lib/restaurantFieldLocks";

/**
 * WEB-FEAT-103: the admin's view of restaurant rows - the fields automation
 * depends on (place id, hours, status, business_status, the last Places check),
 * who has claimed a listing, whether it was merged, and hiding in place of
 * deleting.
 *
 * Columns from migrations that may not be applied yet (hidden_at,
 * place_lookup_checked_at, locked_fields) are read through `as never` casts,
 * the house pattern until types.ts is regenerated, and every failed read is
 * reported as a failure, never as an empty list.
 */

export const ADMIN_RESTAURANT_FILTERS = [
  { value: "listed", label: "Listed" },
  { value: "unverified", label: "Unverified" },
  { value: "closed", label: "Closed" },
  { value: "claimed", label: "Claimed" },
  { value: "merged", label: "Merged" },
  { value: "hidden", label: "Hidden" },
  { value: "everything", label: "Everything" },
] as const;

export type AdminRestaurantFilter = (typeof ADMIN_RESTAURANT_FILTERS)[number]["value"];

export const ADMIN_RESTAURANT_SORTS = [
  { value: "checked_oldest", label: "Last checked, oldest first" },
  { value: "checked_newest", label: "Last checked, newest first" },
  { value: "name", label: "Name" },
  { value: "added_newest", label: "Recently added" },
] as const;

export type AdminRestaurantSort = (typeof ADMIN_RESTAURANT_SORTS)[number]["value"];

export const ADMIN_PAGE_SIZE = 50;

/** The lifecycle values restaurants.status's CHECK allows (20250728165446). */
export const RESTAURANT_STATUSES = ["open", "newly_opened", "opening_soon", "announced", "closed"] as const;

export interface AdminRestaurantRow {
  id: string;
  name: string;
  slug: string | null;
  location: string | null;
  status: string | null;
  business_status: string | null;
  google_place_id: string | null;
  hours_checked_at: string | null;
  is_merged: boolean | null;
  merged_into: string | null;
  hidden_at: string | null;
  created_at: string | null;
}

export type ClaimState = "verified" | "pending";

export interface AdminRestaurantPage {
  rows: AdminRestaurantRow[];
  total: number;
  claims: Record<string, ClaimState>;
}

const LIST_COLUMNS =
  "id, name, slug, location, status, business_status, google_place_id, hours_checked_at, is_merged, merged_into, hidden_at, created_at";

const CLOSED_FILTER =
  "status.in.(closed,permanently_closed,closed_permanently),business_status.in.(CLOSED_PERMANENTLY,CLOSED_TEMPORARILY)";

/** The PostgREST filter steps a list filter adds, as data, so a test can check each one. */
export function adminFilterSteps(
  filter: AdminRestaurantFilter,
): Array<["neq", string, boolean] | ["is", string, null] | ["not", string, "is", null] | ["eq", string, boolean] | ["or", string]> {
  const listed: Array<["neq", string, boolean] | ["is", string, null]> = [
    ["neq", "is_merged", true],
    ["is", "hidden_at", null],
  ];
  switch (filter) {
    case "listed":
      return listed;
    case "unverified":
      // No Google place to check against, or never checked: the rows the
      // closure detection and the hours refresh cannot vouch for.
      return [...listed, ["or", "google_place_id.is.null,hours_checked_at.is.null"]];
    case "closed":
      return [["or", CLOSED_FILTER]];
    case "claimed":
      return [];
    case "merged":
      return [["eq", "is_merged", true]];
    case "hidden":
      return [["not", "hidden_at", "is", null]];
    case "everything":
      return [];
  }
}

/** Verified owners first, then pending claims, for the restaurants given (or all when ids is null). */
async function fetchClaims(ids: string[] | null): Promise<Record<string, ClaimState>> {
  let q = supabase
    .from("business_claims" as never)
    .select("listing_id, status")
    .eq("listing_type", "restaurant")
    .in("status", ["verified", "pending"]);
  if (ids) q = q.in("listing_id", ids);
  const { data, error } = await q;
  if (error) throw new Error(`claims: ${error.message}`);
  const out: Record<string, ClaimState> = {};
  for (const c of (data ?? []) as unknown as Array<{ listing_id: string; status: ClaimState }>) {
    if (c.status === "verified" || !out[c.listing_id]) out[c.listing_id] = c.status;
  }
  return out;
}

interface ListQuery extends PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }> {
  neq(column: string, value: unknown): ListQuery;
  is(column: string, value: null): ListQuery;
  not(column: string, operator: string, value: unknown): ListQuery;
  eq(column: string, value: unknown): ListQuery;
  or(filters: string): ListQuery;
  in(column: string, values: string[]): ListQuery;
  ilike(column: string, pattern: string): ListQuery;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): ListQuery;
  range(from: number, to: number): ListQuery;
}

export async function fetchAdminRestaurants(args: {
  filter: AdminRestaurantFilter;
  sort: AdminRestaurantSort;
  search: string;
  page: number;
}): Promise<AdminRestaurantPage> {
  let claimedIds: string[] | null = null;
  if (args.filter === "claimed") {
    const all = await fetchClaims(null);
    claimedIds = Object.keys(all).filter((id) => all[id] === "verified");
    if (claimedIds.length === 0) return { rows: [], total: 0, claims: {} };
  }

  // A narrow interface instead of the generated builder type: the filters are
  // applied from data, and the generated generics recurse past tsc's limit.
  let q = supabase.from("restaurants").select(LIST_COLUMNS, { count: "exact" }) as unknown as ListQuery;
  for (const step of adminFilterSteps(args.filter)) {
    if (step[0] === "neq") q = q.neq(step[1], step[2]);
    else if (step[0] === "is") q = q.is(step[1], step[2]);
    else if (step[0] === "not") q = q.not(step[1], step[2], step[3]);
    else if (step[0] === "eq") q = q.eq(step[1], step[2]);
    else q = q.or(step[1]);
  }
  if (claimedIds) q = q.in("id", claimedIds);
  const term = args.search.trim().replace(/[%_,()]/g, " ");
  if (term) q = q.ilike("name", `%${term}%`);

  switch (args.sort) {
    case "checked_oldest":
      q = q.order("hours_checked_at", { ascending: true, nullsFirst: true }).order("name");
      break;
    case "checked_newest":
      q = q.order("hours_checked_at", { ascending: false, nullsFirst: false }).order("name");
      break;
    case "added_newest":
      q = q.order("created_at", { ascending: false });
      break;
    default:
      q = q.order("name");
  }

  const from = args.page * ADMIN_PAGE_SIZE;
  const { data, error, count } = await q.range(from, from + ADMIN_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as AdminRestaurantRow[];
  const claims = rows.length > 0 ? await fetchClaims(rows.map((r) => r.id)) : {};
  return { rows, total: count ?? rows.length, claims };
}

/** The whole row as the drawer reads it: select("*"), so a column a migration has not added yet is simply absent. */
export type AdminRestaurantDetail = AdminRestaurantRow & {
  hours_json?: StoredOpeningHours | null;
  opening?: string | null;
  reservation_url?: string | null;
  place_lookup_checked_at?: string | null;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
  hidden_reason?: string | null;
  merged_at?: string | null;
};

export interface ClaimRow {
  id: string;
  status: string;
  created_at: string;
  verified_at: string | null;
}

export interface MergeRow {
  id: string;
  survivor_id: string;
  loser_id: string;
  created_at: string;
  reversed: boolean | null;
}

export interface OpenClosureReview {
  id: string;
  reason: string;
  created_at: string;
}

/** One part of the drawer: its rows, or why they could not be read. */
export type Part<T> = { ok: true; rows: T[] } | { ok: false; error: string };

async function part<T>(run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Part<T>> {
  const { data, error } = await run();
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as T[] };
}

export interface RestaurantAdminDetail {
  row: AdminRestaurantDetail | null;
  claims: Part<ClaimRow>;
  merges: Part<MergeRow>;
  closureReviews: Part<OpenClosureReview>;
}

export async function fetchRestaurantAdminDetail(id: string): Promise<RestaurantAdminDetail> {
  const rowRead = await supabase.from("restaurants").select("*").eq("id", id).maybeSingle();
  if (rowRead.error) throw new Error(rowRead.error.message);
  const [claims, merges, closureReviews] = await Promise.all([
    part<ClaimRow>(() =>
      supabase
        .from("business_claims" as never)
        .select("id, status, created_at, verified_at")
        .eq("listing_type", "restaurant")
        .eq("listing_id", id)
        .order("created_at", { ascending: false }),
    ),
    part<MergeRow>(() =>
      supabase
        .from("content_merges" as never)
        .select("id, survivor_id, loser_id, created_at, reversed")
        .eq("content_type", "restaurant")
        .or(`survivor_id.eq.${id},loser_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(5),
    ),
    part<OpenClosureReview>(() =>
      supabase
        .from("restaurant_closure_reviews" as never)
        .select("id, reason, created_at")
        .eq("restaurant_id", id)
        .is("resolved_at", null)
        .order("created_at", { ascending: false }),
    ),
  ]);
  return { row: (rowRead.data as unknown as AdminRestaurantDetail | null) ?? null, claims, merges, closureReviews };
}

/** The hours as the editor shows them: Google's weekday lines, one per line. */
export function hoursEditorText(row: Pick<AdminRestaurantDetail, "hours_json">): string {
  const lines = row.hours_json?.weekdayDescriptions;
  return Array.isArray(lines) ? lines.filter((l) => typeof l === "string").join("\n") : "";
}

/**
 * hours_json from lines an admin typed, or an error to show them. Both the
 * weekday lines (what the page prints) and the periods (what open-now reads)
 * come from the same text, so they cannot disagree. Empty text clears the
 * hours. Unreadable text is refused whole, never half-saved.
 */
export function adminHoursJson(text: string): { ok: true; hours: StoredOpeningHours | null } | { ok: false; error: string } {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { ok: true, hours: null };
  const periods = periodsFromHoursText(lines.join("\n"));
  if (!periods) {
    return { ok: false, error: 'Could not read these hours. Use one line per day, like "Monday: 11 AM - 9 PM" or "Sunday: Closed".' };
  }
  return {
    ok: true,
    hours: {
      version: 1,
      timeZone: DES_MOINES_TIME_ZONE,
      periods,
      weekdayDescriptions: lines,
      source: "admin",
    } as StoredOpeningHours,
  };
}

export type AdminRestaurantPatch = Partial<{
  status: string;
  business_status: string | null;
  reservation_url: string | null;
  google_place_id: string | null;
  hours_json: StoredOpeningHours | null;
}>;

/** Setting a closed listing back to open also clears Google's closed answer, or the closure sync and every list would keep it shut. */
export function reopenPatch(): AdminRestaurantPatch {
  return { status: "open", business_status: null };
}

/**
 * Writes the patch, then records each field as an admin's edit
 * (set_restaurant_field_locks, WEB-BE-069), so Google enrichment does not
 * overwrite it. A failed write throws. A failed lock is returned, not thrown:
 * the edit is saved, and the admin is told it is not protected.
 */
export async function saveRestaurantAdminPatch(
  id: string,
  patch: AdminRestaurantPatch,
): Promise<{ lockError: string | null }> {
  const keys = Object.keys(patch);
  if (keys.length === 0) return { lockError: null };
  const { error } = await supabase
    .from("restaurants")
    .update(patch as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
  try {
    await setRestaurantFieldLocks(id, keys);
    return { lockError: null };
  } catch (e) {
    return { lockError: e instanceof Error ? e.message : String(e) };
  }
}

export async function hideRestaurant(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("hide_restaurant" as never, {
    p_restaurant_id: id,
    p_reason: reason.trim() || null,
  } as never);
  if (error) throw new Error(error.message);
}

export async function unhideRestaurant(id: string): Promise<void> {
  const { error } = await supabase.rpc("unhide_restaurant" as never, { p_restaurant_id: id } as never);
  if (error) throw new Error(error.message);
}

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: DES_MOINES_TIME_ZONE,
});

/** "Nov 21, 2026", or "Never" for no date. */
export function formatCheckedAt(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Never" : WHEN.format(d);
}
