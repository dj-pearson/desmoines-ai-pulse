/**
 * Whether the AI itinerary planner can run (plan-stay WP1 item 4).
 *
 * `trip_plans`, `trip_plan_items`, `get_trip_itinerary` and
 * `generate_trip_share_code` were missing from production (migration
 * 20251126000001 was ledgered as applied and produced nothing). The D1
 * migration 20261014000001 re-created them and generate-itinerary was
 * redeployed against it, so the planner is back on. If storage goes missing
 * again, generate-itinerary refuses with trip_storage_unavailable before it
 * charges a generation; set this back to false to hide the UI too.
 */
export const AI_PLANNER_AVAILABLE = true;

/**
 * Whether a trip can be shared by link. Stays false: Share publishes to
 * /trips/shared/:code, which has no route, and D1 deliberately has no public
 * read path for trip_plans (TP-25, docs/ios-deep-dive/09-trip-planner.md).
 */
export const TRIP_SHARE_AVAILABLE = false;

/** The one line shown in place of the AI planner while it is paused. */
export const AI_PLANNER_PAUSED_MESSAGE =
  "AI itineraries are paused while we fix saving; the date planner below works.";
