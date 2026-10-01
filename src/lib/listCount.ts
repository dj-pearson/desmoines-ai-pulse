/**
 * How hard a list query works for its total row count (WEB-PERF-033).
 *
 * PostgREST runs `count: "exact"` as a second full COUNT(*) over the filtered
 * set on every request - including on every keystroke of a search box. Four
 * list hooks asked for it unconditionally, and the public pages that mount
 * them render no total at all: /attractions and /playgrounds do not even
 * destructure totalCount. The number was being computed for nobody.
 *
 *   "estimated" (the default) - exact under PostgREST's threshold, the
 *                planner's estimate above it, so a caller always gets a
 *                number. This is the mode useRestaurants settled on; the note
 *                at its select() records why "planned" is the wrong one (it
 *                returns NULL whenever the planner has no usable statistic,
 *                which rendered a blank number before the word "found").
 *   "none"     - no count at all. For callers that ignore totalCount, which
 *                then reads 0.
 *   "exact"    - a real COUNT(*). For the admin tables that paginate on the
 *                number or show it as a figure of record.
 */
export type CountMode = 'exact' | 'estimated' | 'none';

/**
 * The `select` options object for a count mode, or undefined for "none" -
 * omitting the option is what stops PostgREST issuing the count at all.
 */
export function countOption(mode: CountMode | undefined) {
  const resolved = mode ?? 'estimated';
  return resolved === 'none' ? undefined : ({ count: resolved } as const);
}
