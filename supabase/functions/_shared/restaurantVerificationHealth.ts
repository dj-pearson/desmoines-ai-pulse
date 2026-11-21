/**
 * WEB-AUTO-019: is closure detection still working?
 *
 * Pure, no remote imports, so restaurant-verification-health.test.ts runs
 * offline. If the Places refresh stops (cron dead, key expired, quota out),
 * listings age silently and the promotion gate (WEB-BE-063) quietly empties
 * the eligible pool. This turns the counts into alerts.
 */

export interface VerificationCounts {
  total: number;
  verifiedWithin30Days: number;
  unverifiedOver45Days: number;
  neverChecked: number;
  openReviewsOver14Days: number;
}

/** Default share of the table allowed to be unverified for 45+ days before alerting. */
export const DEFAULT_MAX_UNVERIFIED_SHARE = 0.25;
/** Consecutive poster runs that skipped restaurants for want of one before alerting. */
export const POSTER_SKIP_STREAK = 3;

/** The configured share, clamped to (0, 1]; anything unusable falls back to the default. */
export function parseMaxUnverifiedShare(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return DEFAULT_MAX_UNVERIFIED_SHARE;
  return n;
}

/** The ISO instant `days` before `now`. */
export function daysAgo(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/**
 * PostgREST `or` filters for each count. A row's last check is
 * hours_checked_at, or hours_json.fetchedAt when hours_checked_at is NULL
 * (the same reading as staleHoursFilter and the promotion gate).
 */
export function verifiedSinceFilter(cutoff: string): string {
  return `hours_checked_at.gte.${cutoff},and(hours_checked_at.is.null,hours_json->>fetchedAt.gte.${cutoff})`;
}
export function checkedBeforeFilter(cutoff: string): string {
  return `hours_checked_at.lt.${cutoff},and(hours_checked_at.is.null,hours_json->>fetchedAt.lt.${cutoff})`;
}
export const NEVER_CHECKED_FILTER = "and(hours_checked_at.is.null,hours_json->>fetchedAt.is.null)";

/** True when the last `streak` poster runs all skipped restaurants with no_eligible_restaurant. */
export function posterSkipStreak(
  runs: Array<{ metadata?: { outcomes?: { restaurant?: { skipped?: string; [k: string]: unknown } } } | null }>,
  streak: number = POSTER_SKIP_STREAK,
): boolean {
  if (runs.length < streak) return false;
  return runs.slice(0, streak).every((r) => r.metadata?.outcomes?.restaurant?.skipped === "no_eligible_restaurant");
}

/**
 * Alert messages for one night's counts. "Unverified" for the share is rows
 * checked more than 45 days ago plus rows never checked: both are listings
 * nothing has confirmed are still there.
 */
export function evaluateVerificationHealth(
  counts: VerificationCounts,
  maxShare: number,
  posterSkipped: boolean,
): string[] {
  const alerts: string[] = [];
  const stale = counts.unverifiedOver45Days + counts.neverChecked;
  if (counts.total > 0 && stale / counts.total > maxShare) {
    const pct = Math.round((stale / counts.total) * 100);
    alerts.push(
      `${stale} of ${counts.total} restaurants (${pct}%) have no Google check in 45 days or were never checked, ` +
        `over the ${Math.round(maxShare * 100)}% limit. The hours refresh (restaurant-hours-refresh) may have stopped, ` +
        "or the Places key or quota may have failed.",
    );
  }
  if (posterSkipped) {
    alerts.push(
      `The nightly social poster skipped restaurants ${POSTER_SKIP_STREAK} runs in a row with no_eligible_restaurant: ` +
        "no restaurant has a recent OPERATIONAL Google check.",
    );
  }
  if (counts.openReviewsOver14Days > 0) {
    alerts.push(
      `${counts.openReviewsOver14Days} closure review(s) have been open more than 14 days. ` +
        "Review them at /admin/closure-reviews.",
    );
  }
  return alerts;
}
