import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { RESTAURANT_DETAIL_COLUMNS, RESTAURANT_DETAIL_OPTIONAL_COLUMNS } from "@/lib/listColumns";
import { isUnknownColumnError } from "@/lib/postgrestErrors";

type RestaurantRow = Database["public"]["Tables"]["restaurants"]["Row"];

/** Columns the detail projection leaves out on purpose; nothing on the page reads them. */
type OmittedColumns =
  | "search_vector"
  | "geom"
  | "writeup_prompt_used"
  | "heal_attempts"
  | "image_checked_at"
  | "menu_scrape_enabled"
  | "needs_manual_verification"
  | "seo_locked_at"
  | "view_count";

/**
 * The restaurant row as the detail page receives it. The optional columns may
 * be absent (see RESTAURANT_DETAIL_OPTIONAL_COLUMNS), so the page keeps reading
 * them defensively.
 */
export type RestaurantDetailRow = Omit<RestaurantRow, OmittedColumns> & {
  google_maps_uri?: string | null;
  reservable?: boolean | null;
  reservation_url?: string | null;
  reservation_provider?: string | null;
};

type OptionalColumn = (typeof RESTAURANT_DETAIL_OPTIONAL_COLUMNS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Optional columns this database has already said it lacks. Module scope, so
 * one 42703 costs one retry per session rather than one per page view.
 */
const missingOptional = new Set<OptionalColumn>();

function projection(): string {
  const optional = RESTAURANT_DETAIL_OPTIONAL_COLUMNS.filter((c) => !missingOptional.has(c));
  return optional.length > 0 ? `${RESTAURANT_DETAIL_COLUMNS}, ${optional.join(", ")}` : RESTAURANT_DETAIL_COLUMNS;
}

/** The optional columns an unknown-column error names. */
function namedOptional(error: PostgrestError): OptionalColumn[] {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  return RESTAURANT_DETAIL_OPTIONAL_COLUMNS.filter((c) => !missingOptional.has(c) && text.includes(c));
}

async function selectOne(column: "slug" | "id", value: string) {
  for (;;) {
    const result = await supabase.from("restaurants").select(projection()).eq(column, value).maybeSingle();
    if (!result.error || !isUnknownColumnError(result.error)) return result;
    const named = namedOptional(result.error);
    // An unknown column that is not one of ours is a real failure: rethrow
    // rather than retry it into a slow success.
    if (named.length === 0) return result;
    for (const c of named) missingOptional.add(c);
  }
}

/**
 * One restaurant for the detail page, by slug, falling back to the id only when
 * the param is a uuid. Shared by RestaurantDetails and usePrefetchRestaurant,
 * so the hover prefetch fills the exact entry the page reads.
 */
export async function fetchRestaurantDetail(slugOrId: string): Promise<RestaurantDetailRow | null> {
  let { data, error } = await selectOne("slug", slugOrId);

  // Comparing a uuid column with a slug raises 22P02, which surfaced as the
  // error page for any unknown slug instead of not-found.
  if (!data && !error && UUID_RE.test(slugOrId)) {
    ({ data, error } = await selectOne("id", slugOrId));
  }

  if (error) throw error;
  return (data as unknown as RestaurantDetailRow | null) ?? null;
}
