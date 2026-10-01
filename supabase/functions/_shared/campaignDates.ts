/**
 * Campaign dates on the Des Moines calendar (NON_CORE_REVIEW_2026-09 WP3).
 *
 * create-campaign-checkout took any start date, including one in the past:
 * the /advertise page refuses a start sooner than MIN_LEAD_TIME_DAYS out, and
 * nothing behind it did, so a campaign drafted last week (or a request built
 * by hand) could be paid for with days that had already gone, and with no
 * time for the creative to be reviewed before it was due to run.
 *
 * MIN_LEAD_TIME_DAYS mirrors src/lib/businessCopy.ts, which the page uses. The
 * browser bundle cannot import from supabase/functions, so the two copies are
 * held equal by supabase/functions/_tests/campaign-start-date.test.ts.
 *
 * No remote import: this loads in an offline test.
 */

/** Days from today (Central) before a new campaign may start. */
export const MIN_LEAD_TIME_DAYS = 3;

const CENTRAL_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The America/Chicago calendar date of an instant, as YYYY-MM-DD. */
export function centralDateOf(instant: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return CENTRAL_DATE.format(instant);
}

/** A YYYY-MM-DD date plus n calendar days. Pure date arithmetic, no time zone. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export type StartDateProblem =
  | { ok: true }
  | { ok: false; code: "START_DATE_PASSED" | "START_TOO_SOON"; earliestStart: string; message: string };

/**
 * Whether a campaign may be paid for with this start date.
 *
 * A RENEWAL is exempt from the lead time, not from the calendar.
 * renew_campaign starts the copy the day after the original ends (or today),
 * which is inside three days whenever an advertiser renews in the last days
 * of the seven-day window the lifecycle job opens. Refusing those would make
 * the renew button fail exactly when it is used. A renewal still may not
 * start in the past.
 */
export function campaignStartProblem(
  startDate: string | null | undefined,
  today: string,
  opts: { isRenewal?: boolean } = {},
): StartDateProblem {
  const earliest = opts.isRenewal ? today : addDays(today, MIN_LEAD_TIME_DAYS);
  // No start date is left to the checks that already handle it; refusing it
  // here would be a new rule nobody asked for.
  if (!startDate) return { ok: true };
  const start = startDate.slice(0, 10);
  if (start < today) {
    return {
      ok: false,
      code: "START_DATE_PASSED",
      earliestStart: earliest,
      message: `This campaign's start date has passed. Pick ${earliest} or later and check out again.`,
    };
  }
  if (start < earliest) {
    return {
      ok: false,
      code: "START_TOO_SOON",
      earliestStart: earliest,
      message:
        `Campaigns start ${MIN_LEAD_TIME_DAYS} days out at the soonest, so the ads can be reviewed. ` +
        `Pick ${earliest} or later.`,
    };
  }
  return { ok: true };
}
