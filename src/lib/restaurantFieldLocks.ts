import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/**
 * WEB-BE-069: restaurant fields a person set, which the Google enrichment in
 * bulk-update-restaurants leaves alone.
 *
 * restaurants.locked_fields (migration 20261121000070) maps a field to
 * { by: "owner" | "admin", at }. Owners lock through update_claimed_listing;
 * admins through set_restaurant_field_locks, which this module calls after a
 * ContentEditDialog save and when an admin clears a lock. Which fields can be
 * locked is decided by that function (restaurant_lockable_fields() in SQL),
 * so the dialog sends every key it changed and the database keeps the
 * lockable ones.
 */

export interface FieldLock {
  by: "owner" | "admin" | "unknown";
  at: string | null;
}

export type FieldLocks = Record<string, FieldLock>;

/**
 * Either the locks, or a reason they could not be read. "unavailable" is not
 * the same as no locks: the controls say so instead of showing none.
 */
export type FieldLocksResult =
  | { status: "ok"; locks: FieldLocks }
  | { status: "unavailable"; reason: string };

/** The content types ContentEditDialog stores in the restaurants table. */
export const RESTAURANT_TABLE_CONTENT_TYPES = ["restaurant", "restaurant_opening"] as const;

/** A stored locked_fields value as a map. Malformed entries are kept with unknown provenance. */
export function parseFieldLocks(raw: unknown): FieldLocks {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: FieldLocks = {};
  for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const by = v.by === "owner" || v.by === "admin" ? v.by : "unknown";
    out[field] = { by, at: typeof v.at === "string" ? v.at : null };
  }
  return out;
}

/** One line for an admin: who set the field and when. */
export function describeFieldLock(lock: FieldLock): string {
  const who = lock.by === "owner" ? "the owner" : lock.by === "admin" ? "an admin" : "a person";
  const when = lock.at ? new Date(lock.at) : null;
  const date = when && !Number.isNaN(when.getTime()) ? ` on ${format(when, "MMM d, yyyy")}` : "";
  return `Set by ${who}${date}. Google enrichment leaves it alone.`;
}

const isMissingColumn = (code: string | undefined) => code === "42703" || code === "PGRST204";

/**
 * The locks on one restaurant. Read in its own request, so the pending window
 * before the migration (42703) cannot fail the admin list or the save.
 */
export async function fetchRestaurantFieldLocks(restaurantId: string): Promise<FieldLocksResult> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("locked_fields" as "id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) {
    return {
      status: "unavailable",
      reason: isMissingColumn(error.code) ? "field locks are not set up on this database yet" : error.message,
    };
  }
  return { status: "ok", locks: parseFieldLocks((data as { locked_fields?: unknown } | null)?.locked_fields) };
}

/**
 * Locks the given fields as set by an admin and clears the unlock list.
 * Returns the resulting map. Throws on failure.
 */
export async function setRestaurantFieldLocks(
  restaurantId: string,
  lock: readonly string[],
  unlock: readonly string[] = [],
): Promise<FieldLocks> {
  const { data, error } = await supabase.rpc("set_restaurant_field_locks" as never, {
    p_restaurant_id: restaurantId,
    p_lock: [...lock],
    p_unlock: [...unlock],
  } as never);
  if (error) throw new Error(error.message);
  return parseFieldLocks(data);
}
