import { supabase } from "@/integrations/supabase/client";

/**
 * The one definition of a "visible event" (docs/page-plans/events.md WP0
 * item 4).
 *
 * An event is shown when it is not merged into a duplicate (WEB-AUTO-005), not
 * soft-hidden by a moderator or the stale sweep (WEB-AUTO-006) and not retired
 * by the archive sweep (WEB-BE-034). Every list and every detail lookup must
 * agree on this, or a listed card dead-ends on "Event Not Found" (WEB-QA-002).
 * The predicates were copied into each read by hand; new reads use this.
 */

/**
 * The methods these predicates call. PostgREST builder methods return `this`,
 * so the chain comes back as the caller's own builder type with its row type
 * intact.
 */
interface VisibilityChain {
  neq(column: string, value: boolean): VisibilityChain;
  is(column: string, value: null): VisibilityChain;
}

/**
 * Add the is_merged / is_hidden / archived_at predicates to an events query.
 *
 * The constraint is deliberately shallow. Asking tsc to prove that
 * supabase-js's filter builder structurally satisfies a method interface
 * (`Q extends VisibilityChain`, F-bounded or not) sends it into TS2589
 * "excessively deep" on the builder's select-string parser. The cast is safe
 * because every builder method used here returns the builder itself.
 */
export function applyEventVisibility<Q extends { neq: unknown; is: unknown }>(query: Q): Q {
  const chain = query as unknown as VisibilityChain;
  return chain
    .neq("is_merged", true)
    .neq("is_hidden", true)
    .is("archived_at", null) as unknown as Q;
}

/**
 * Ids per request. A UUID is 36 characters plus a comma, so 150 keeps the
 * `in.(...)` filter near 5.5 KB of URL, well inside what the gateway accepts.
 */
const IDS_PER_REQUEST = 150;

/**
 * Which of these event ids are visible, as a Set.
 *
 * For results that come from an RPC that does not apply the visibility
 * predicates itself, `search_events_near_location` today (deferred D1 in the
 * plan): filter the RPC's rows with `visible.has(row.id)`. One query per 150
 * ids, same predicates as `applyEventVisibility`.
 *
 * Throws the PostgREST error on failure rather than returning an empty set: an
 * empty set would hide every result and read as "nothing near you".
 */
export async function filterVisibleIds(ids: readonly string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const visible = new Set<string>();
  for (let i = 0; i < unique.length; i += IDS_PER_REQUEST) {
    const chunk = unique.slice(i, i + IDS_PER_REQUEST);
    const { data, error } = await applyEventVisibility(
      supabase.from("events").select("id")
    ).in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) visible.add(row.id);
  }
  return visible;
}
