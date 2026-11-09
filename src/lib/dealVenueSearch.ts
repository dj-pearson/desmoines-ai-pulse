import { supabase } from "@/integrations/supabase/client";
import { DEAL_LINKED_RESTAURANT_COLUMNS } from "@/lib/listColumns";

/**
 * Entity types whose deals can point at a venue page (explore pass 2 WP6
 * item 2). useDealVenueLinks resolves entity_id against the same three
 * tables, so a deal linked in DealManager gets a venue link on /deals.
 */
export const DEAL_VENUE_SOURCES: Record<
  string,
  { table: "restaurants" | "attractions" | "hotels"; place: string; label: string }
> = {
  restaurant: { table: "restaurants", place: "location", label: "restaurant" },
  attraction: { table: "attractions", place: "location", label: "attraction" },
  hotel: { table: "hotels", place: "city", label: "hotel" },
};

export interface DealVenueOption {
  id: string;
  name: string;
  place: string | null;
}

/** % and _ are ilike wildcards; a venue name like "100% Pure" should match itself. */
export function escapeIlike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Venues whose name contains `term`, for the DealManager picker.
 *
 * WEB-FEAT-071: restaurants leave out merged duplicates. A deal linked to a
 * duplicate stayed there (the merge trigger only moves deals when the row is
 * merged), so the kept row's Deals section never listed it. not.is.true
 * rather than neq.true, the same spelling useArticles uses, so a NULL
 * is_merged still counts as a live row. Migration 20261108000097 resolves
 * a merged id on save for any writer this picker does not cover.
 */
export async function searchDealVenues(
  entityType: string,
  term: string,
  limit = 8,
): Promise<DealVenueOption[]> {
  const source = DEAL_VENUE_SOURCES[entityType];
  const q = term.trim();
  if (!source || q.length < 2) return [];
  let query = supabase
    .from(source.table)
    .select(`id, name, ${source.place}`)
    .ilike("name", `%${escapeIlike(q)}%`);
  if (source.table === "restaurants") {
    query = query.not("is_merged", "is", true);
  }
  const { data, error } = await query.order("name").limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
  return rows
    .filter((r) => r.id && r.name)
    .map((r) => ({ id: r.id as string, name: r.name as string, place: r[source.place] ?? null }));
}

/** The venue an existing deal points at, as the DealManager picker shows it. */
export interface LinkedDealVenue {
  /** The row the deal should be linked to: the kept row when the stored one was merged. */
  venue: DealVenueOption;
  /** The merged duplicate the deal is stored against, or null when it is not one. */
  mergedFrom: DealVenueOption | null;
  /**
   * True when the stored row is merged but its kept row could not be found
   * (missing, a cycle, or a chain longer than MERGE_CHAIN_LIMIT). `venue` is
   * then the stored row itself, so the picker can still say it was merged.
   */
  survivorMissing: boolean;
}

/**
 * The line under the picker's linked venue when the stored link is a merged
 * duplicate, or null when it is not one:
 *   "Was linked to Noce Jazz (merged into Noce). Saving links Noce."
 *   "Noce Jazz was merged, but the row it was merged into was not found."
 */
export function mergedLinkNote(linked: LinkedDealVenue): string | null {
  if (linked.mergedFrom) {
    const kept = linked.venue.name;
    return `Was linked to ${linked.mergedFrom.name} (merged into ${kept}). Saving links ${kept}.`;
  }
  if (linked.survivorMissing) {
    return `${linked.venue.name} was merged, but the row it was merged into was not found.`;
  }
  return null;
}

/** Hops followed along merged_into, the same bound restaurant_merge_survivor uses. */
export const MERGE_CHAIN_LIMIT = 10;

interface LinkedRestaurantRow {
  id: string;
  name: string | null;
  location: string | null;
  is_merged?: boolean | null;
  merged_into?: string | null;
}

async function readLinkedRestaurant(id: string): Promise<LinkedRestaurantRow | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select(DEAL_LINKED_RESTAURANT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as LinkedRestaurantRow | null) ?? null;
}

function restaurantOption(row: LinkedRestaurantRow): DealVenueOption {
  return { id: row.id, name: row.name ?? row.id, place: row.location ?? null };
}

/**
 * The venue an existing deal is linked to, or null when the row is gone.
 *
 * WEB-FEAT-075: a deal saved against a restaurant that was later merged
 * still points at the duplicate until migration 20261108000090's backfill
 * runs, and the picker showed the duplicate's name with nothing to say it was
 * merged. For a restaurant this follows merged_into to the kept row, so the
 * picker can name both and the form can store the kept row's id. A cycle
 * stops where restaurant_merge_survivor stops: on the stored row. Attractions
 * and hotels have no merge columns and are read as they are.
 */
export async function fetchLinkedDealVenue(
  entityType: string,
  entityId: string,
): Promise<LinkedDealVenue | null> {
  const source = DEAL_VENUE_SOURCES[entityType];
  if (!source || !entityId) return null;

  if (source.table !== "restaurants") {
    const { data, error } = await supabase
      .from(source.table)
      .select(`id, name, ${source.place}`)
      .eq("id", entityId)
      .maybeSingle();
    if (error) throw error;
    const row = data as unknown as Record<string, string | null> | null;
    if (!row) return null;
    return {
      venue: { id: entityId, name: row.name ?? entityId, place: row[source.place] ?? null },
      mergedFrom: null,
      survivorMissing: false,
    };
  }

  const stored = await readLinkedRestaurant(entityId);
  if (!stored) return null;
  if (!stored.is_merged) {
    return { venue: restaurantOption(stored), mergedFrom: null, survivorMissing: false };
  }

  const seen = new Set<string>([stored.id]);
  let current = stored;
  for (let hop = 0; hop < MERGE_CHAIN_LIMIT; hop++) {
    const next = current.merged_into;
    if (!next || seen.has(next)) break;
    seen.add(next);
    const row = await readLinkedRestaurant(next);
    if (!row) break;
    if (!row.is_merged) {
      return { venue: restaurantOption(row), mergedFrom: restaurantOption(stored), survivorMissing: false };
    }
    current = row;
  }
  return { venue: restaurantOption(stored), mergedFrom: null, survivorMissing: true };
}
