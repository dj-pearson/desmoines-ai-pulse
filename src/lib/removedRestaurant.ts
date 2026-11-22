import { supabase } from "@/integrations/supabase/client";

/**
 * WEB-FEAT-103: an admin hides a restaurant instead of deleting it. To anyone
 * but an admin the row reads as absent (an RLS policy, migration
 * 20261121000140), so the detail page asks get_removed_restaurant for the one
 * thing it may still say: the name of the listing that was removed. That
 * keeps an old link answering 200 with an explanation instead of "not found".
 */
export interface RemovedRestaurant {
  id: string;
  name: string;
  slug: string | null;
  hidden_at: string;
}

/**
 * The removed listing at this slug or id, or null when there is none. Null
 * also when the function is not deployed yet (PGRST202) or the call fails:
 * the page then shows its ordinary not-found, which is what it showed before.
 */
export async function fetchRemovedRestaurant(ref: string): Promise<RemovedRestaurant | null> {
  if (!ref) return null;
  const { data, error } = await supabase.rpc("get_removed_restaurant" as never, { p_ref: ref } as never);
  if (error) return null;
  const rows = (data ?? []) as unknown as RemovedRestaurant[];
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}
