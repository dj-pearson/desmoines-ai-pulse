/**
 * Publishing a scraped menu, and the budget for the weekly unattended refresh
 * (WEB-BE-071).
 *
 * PUBLISH ORDER. restaurant_menus has an AFTER INSERT OR UPDATE OF is_current
 * trigger (unmark_previous_menu_versions) that clears is_current on every
 * other version the moment a row arrives with is_current = true. The scraper
 * used to insert the new menu as current and then insert its items; when the
 * items insert failed it deleted the new menu, but the previous one had
 * already been unmarked, so the restaurant was left with no current menu at
 * all. A failed scrape replaced a working menu with nothing.
 *
 * publishMenu inserts the new version as a draft (is_current = false), writes
 * every item, and only then flips is_current, which is the moment the trigger
 * retires the old version. Any failure before that leaves the old version
 * current and removes the draft.
 *
 * WEEKLY BUDGET. Each menu can cost several Claude calls, and one invocation
 * gets through only one or two restaurants inside the 150s request limit
 * (MS_PER_RESTAURANT is 100s). So the weekly refresh is a run of hourly slices
 * on one day, and the cap (owner decision 2026-11-21: 25 menus) is counted
 * across the slices from automation_job_runs, not per invocation.
 */

/** How many restaurants the weekly refresh may attempt (owner decision, 2026-11-21). */
export const WEEKLY_MENU_REFRESH_CAP = 25;

/**
 * The window the cap and the "already tried" exclusion are counted over. Six
 * days rather than seven so that next week's slices start with a full budget
 * even if this week's ran late.
 */
export const WEEKLY_MENU_REFRESH_WINDOW_DAYS = 6;

/** automation_job_runs.job_name for the weekly refresh. */
export const MENU_REFRESH_JOB_NAME = "menu-refresh-weekly";

/** Restaurants this slice may still attempt, given what earlier slices used. */
export function remainingWeeklyBudget(alreadyAttempted: number, cap = WEEKLY_MENU_REFRESH_CAP): number {
  if (!Number.isFinite(alreadyAttempted) || alreadyAttempted < 0) return 0;
  return Math.max(0, cap - Math.floor(alreadyAttempted));
}

/** One restaurant's result as the batch reports it. */
export interface RefreshResult {
  success: boolean;
  skipped: boolean;
}

/** What a slice did, as written to automation_job_runs. */
export interface RefreshCounts {
  /** Restaurants whose scrape actually ran (the number the cap counts). */
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export function countRefreshResults(results: RefreshResult[]): RefreshCounts {
  let attempted = 0;
  let succeeded = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.skipped) {
      skipped++;
      continue;
    }
    attempted++;
    if (r.success) succeeded++;
  }
  return { attempted, succeeded, failed: attempted - succeeded, skipped };
}

// ─── Publishing ─────────────────────────────────────────────────────────────

/**
 * The writes publishMenu needs. index.ts implements it over the service-role
 * client; the tests implement it in memory. Each method returns an error
 * message, or null on success.
 */
export interface MenuPublishStore {
  insertDraft(row: Record<string, unknown>): Promise<{ id: string } | { error: string }>;
  insertItems(rows: Record<string, unknown>[]): Promise<string | null>;
  makeCurrent(menuId: string): Promise<string | null>;
  discard(menuId: string): Promise<void>;
}

export type PublishOutcome = { ok: true; menuId: string } | { ok: false; error: string };

/** Items per insert request. */
const ITEM_CHUNK = 100;

/**
 * Write a new menu version and make it current, or change nothing.
 *
 * `menuRow` must not carry is_current; the draft is always inserted with
 * is_current = false. An extraction with no items is refused before any write:
 * an empty menu is never better than the one already published.
 */
export async function publishMenu(
  store: MenuPublishStore,
  menuRow: Record<string, unknown>,
  buildItems: (menuId: string) => Record<string, unknown>[],
  itemCount: number,
): Promise<PublishOutcome> {
  if (itemCount <= 0) {
    return { ok: false, error: "Nothing to publish: the extraction had no items" };
  }

  const draft = await store.insertDraft({ ...menuRow, is_current: false });
  if ("error" in draft) return { ok: false, error: `DB insert error: ${draft.error}` };

  const rows = buildItems(draft.id);
  if (rows.length === 0) {
    await store.discard(draft.id);
    return { ok: false, error: "Nothing to publish: the extraction had no items" };
  }

  for (let i = 0; i < rows.length; i += ITEM_CHUNK) {
    const error = await store.insertItems(rows.slice(i, i + ITEM_CHUNK));
    if (error) {
      await store.discard(draft.id);
      return { ok: false, error: `Items insert error: ${error}` };
    }
  }

  const promoteError = await store.makeCurrent(draft.id);
  if (promoteError) {
    await store.discard(draft.id);
    return { ok: false, error: `Could not make the new menu current: ${promoteError}` };
  }

  return { ok: true, menuId: draft.id };
}
