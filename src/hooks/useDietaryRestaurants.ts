import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";
import { STALE_TIME } from "@/lib/queryConfig";
import type { RestaurantCardProps } from "@/components/RestaurantCard";

/**
 * The six diets /restaurants/dietary covers, and the words it looks for.
 *
 * THIS IS A KEYWORD MATCH, NOT A VERIFICATION. A row is listed when its name,
 * cuisine or description contains one of these words. "No vegan options"
 * matches "vegan". The page says so, and nothing here may be labelled
 * "verified" until the list comes from menu dietary_tags (plan D5).
 */
export const DIETS = [
  { id: "vegan", label: "Vegan", keywords: ["vegan"] },
  { id: "vegetarian", label: "Vegetarian", keywords: ["vegetarian", "veggie"] },
  { id: "gluten-free", label: "Gluten-Free", keywords: ["gluten free", "gluten-free", "celiac"] },
  { id: "keto", label: "Keto", keywords: ["keto", "low carb", "ketogenic"] },
  { id: "halal", label: "Halal", keywords: ["halal"] },
  { id: "kosher", label: "Kosher", keywords: ["kosher"] },
] as const;

export type DietId = (typeof DIETS)[number]["id"];
export type Diet = (typeof DIETS)[number];

/** Rows fetched per diet. The page shows fewer; see VISIBLE_RESTAURANTS there. */
export const DIETARY_FETCH_LIMIT = 100;

/**
 * The diet a URL value names, or null. An unknown or missing slug is "no diet
 * selected", never a diet called "undefined".
 */
export function dietFromParam(value: string | null | undefined): Diet | null {
  if (!value) return null;
  const slug = value.trim().toLowerCase();
  return DIETS.find((d) => d.id === slug) ?? null;
}

/** The page for one diet (WP4.13): `/restaurants/dietary/vegan`. */
export function dietPath(diet: Pick<Diet, "id">): string {
  return `/restaurants/dietary/${diet.id}`;
}

/**
 * dietOrClause, for rows already loaded (open-now's `diet` filter): the same
 * keywords over the same three fields, case aside. Keep the two in step.
 */
export function rowMentionsDiet(
  row: { name?: string | null; cuisine?: string | null; description?: string | null },
  diet: Diet,
): boolean {
  const text = `${row.name ?? ""} ${row.cuisine ?? ""} ${row.description ?? ""}`.toLowerCase();
  return diet.keywords.some((k) => text.includes(k));
}

/**
 * The PostgREST `or` clause for one diet. The keywords are fixed strings above,
 * so there is nothing user-typed to escape; "gf" was dropped because it matched
 * any description containing "gf" inside a word.
 */
export function dietOrClause(diet: Diet): string {
  return diet.keywords
    .map((k) => `description.ilike.%${k}%,name.ilike.%${k}%,cuisine.ilike.%${k}%`)
    .join(",");
}

/** A list row, in the shape RestaurantCard renders. */
export type DietaryRestaurantRow = RestaurantCardProps["restaurant"];

/**
 * Restaurants that mention a diet, keyed on the diet so a slow Vegan response
 * cannot land after a Keto click and overwrite it. Disabled (no request) when
 * no diet is selected.
 */
export function useDietaryRestaurants(diet: Diet | null) {
  return useQuery({
    queryKey: ["restaurants", "dietary", diet?.id ?? null],
    enabled: diet !== null,
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async (): Promise<DietaryRestaurantRow[]> => {
      if (!diet) return [];
      const { data, error } = await supabase
        .from("restaurants")
        .select(RESTAURANT_LIST_COLUMNS)
        // Hide rows merged into a duplicate (WEB-AUTO-005) and places that
        // have closed for good. status is nullable, and neq("status", "closed")
        // would drop every NULL row too (NULL <> 'closed' is not true), so the
        // closed test is an OR that keeps NULL. Both OR groups are nested in
        // one `or=` param rather than relying on how PostgREST combines two.
        .neq("is_merged", true)
        .or(`and(or(status.is.null,status.neq.closed),or(${dietOrClause(diet)}))`)
        .order("name")
        .limit(DIETARY_FETCH_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as DietaryRestaurantRow[];
    },
  });
}
