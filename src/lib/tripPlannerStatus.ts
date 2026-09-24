/**
 * Whether the AI itinerary planner can run (plan-stay WP1 item 4).
 *
 * `trip_plans`, `trip_plan_items`, `get_trip_itinerary` and
 * `generate_trip_share_code` are not in production (migration 20251126000001
 * was ledgered as applied and produced nothing). Until the D1 migration
 * re-creates them, Generate, My Trips and Share would charge a subscriber for
 * a plan that cannot be saved. The D1 PR flips this to true.
 */
export const AI_PLANNER_AVAILABLE = false;

/** The one line shown in place of the AI planner while it is paused. */
export const AI_PLANNER_PAUSED_MESSAGE =
  "AI itineraries are paused while we fix saving; the date planner below works.";
