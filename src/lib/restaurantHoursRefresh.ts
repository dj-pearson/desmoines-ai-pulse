/**
 * WEB-FEAT-086. Request bodies for bulk-update-restaurants and the line an
 * admin reads back, for the two hours-only modes the daily cron already uses
 * (WEB-FEAT-079). The admin bulk updater sent batchSize/forceUpdate/
 * clearEnhanced only, so after a holiday-hours change nobody could refresh
 * hours on demand without the full enrichment, which rewrites descriptions,
 * photos and ratings on every row it touches.
 *
 * The edge function owns the bounds (batchSize 1-50, staleDays 7-365 through
 * parseStaleDays); these only keep the form from sending something it would
 * clamp silently, so what the admin typed is what runs.
 */

export type HoursRefreshAction = 'fill' | 'stale';

export interface BulkUpdateRequestBody {
  batchSize: number;
  forceUpdate?: boolean;
  clearEnhanced?: boolean;
  hoursOnly?: true;
  staleDays?: number;
  afterId?: string;
}

/** Mirrors HOURS_STALE_MIN_DAYS / HOURS_STALE_MAX_DAYS in _shared/placeHours.ts. */
export const STALE_DAYS_MIN = 7;
export const STALE_DAYS_MAX = 365;
/** The cron's own value (migration 20261108000103). */
export const STALE_DAYS_DEFAULT = 30;
export const HOURS_BATCH_MAX = 50;

export function clampBatchSize(raw: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, HOURS_BATCH_MAX);
}

export function clampStaleDays(raw: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return STALE_DAYS_DEFAULT;
  return Math.min(Math.max(n, STALE_DAYS_MIN), STALE_DAYS_MAX);
}

/**
 * Fill takes rows with a place id and no hours, in id order. A place Google
 * has no hours for stays null, so the next fill passes the previous lastId to
 * move past it. Stale has no cursor: each run's writes move its rows out of
 * the stale set.
 */
export function buildHoursRefreshBody(
  action: HoursRefreshAction,
  opts: { batchSize: number; staleDays?: number; afterId?: string | null },
): BulkUpdateRequestBody {
  const batchSize = clampBatchSize(opts.batchSize);
  if (action === 'stale') {
    return { hoursOnly: true, batchSize, staleDays: clampStaleDays(opts.staleDays ?? STALE_DAYS_DEFAULT) };
  }
  const body: BulkUpdateRequestBody = { hoursOnly: true, batchSize };
  if (opts.afterId) body.afterId = opts.afterId;
  return body;
}

export interface HoursRefreshCounts {
  processed: number;
  updated: number;
  errors: number;
  noHours?: number;
  gone?: number;
}

/** One line per run; `gone` only exists in the stale mode's response. */
export function hoursRefreshSummary(action: HoursRefreshAction, r: HoursRefreshCounts): string {
  if (r.processed === 0) {
    return action === 'stale'
      ? 'No restaurant hours are older than that. Nothing to refresh.'
      : 'Every restaurant with a Google place id already has hours, or this pass reached the end.';
  }
  const parts = [`${r.updated} of ${r.processed} updated`, `${r.noHours ?? 0} with no hours on Google`];
  if (action === 'stale') parts.push(`${r.gone ?? 0} no longer on Google`);
  parts.push(`${r.errors} ${r.errors === 1 ? 'error' : 'errors'}`);
  return parts.join(', ');
}
