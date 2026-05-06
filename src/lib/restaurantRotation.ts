/**
 * Per-day seed used by `get_rotated_restaurants` so the popularity sort
 * rotates which top restaurants appear first each day. Stable for the day
 * so pagination doesn't reshuffle between pages, but changes over time so
 * users don't see the same first 20 every visit.
 */
export function getRestaurantRotationSeed(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 86_400_000);
}
