import { supabase } from "@/integrations/supabase/client";

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
