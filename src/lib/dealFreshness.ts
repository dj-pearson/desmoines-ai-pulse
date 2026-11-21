import { formatInTimeZone } from 'date-fns-tz';

/**
 * When a deal was last confirmed, and when an open-ended one stops being
 * advertised (WEB-FEAT-104).
 *
 * A deal entered without an end date ("Half-price drafts, Tue-Thu 4-6") used
 * to show on /deals, the restaurant page, the Happy hour now strip and in the
 * page's makesOffer for as long as the row existed, whether or not the bar
 * still ran it. deals.last_confirmed_at (migration 20261121000100) is stamped
 * when a deal is created and when an admin re-confirms it in DealManager. An
 * open-ended deal not confirmed for DEAL_RECONFIRM_DAYS is hidden everywhere
 * public and listed in DealManager for re-confirmation. A deal with an end
 * date is not affected: whoever entered it said when it stops.
 *
 * The rule is said twice, once for the client (isStaleOpenEndedDeal) and once
 * for PostgREST (confirmedDealFilter), the same way restaurantStatus.ts pairs
 * isShutRestaurant with its query filters. The tests hold the two together.
 */

/** Days an open-ended deal stays listed after it was last confirmed. */
export const DEAL_RECONFIRM_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The fields the rule reads. last_confirmed_at is optional: see isStaleOpenEndedDeal. */
export interface DealFreshnessFields {
  end_date: string | null;
  last_confirmed_at?: string | null;
}

/** The instant before which a confirmation no longer keeps an open-ended deal listed. */
export function dealConfirmationCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - DEAL_RECONFIRM_DAYS * DAY_MS);
}

/**
 * True for a deal with no end date whose last confirmation is older than
 * DEAL_RECONFIRM_DAYS, or that was never confirmed (null).
 *
 * `undefined` means the column was not read at all, which happens only on the
 * fallback read while migration 20261121000100 is unapplied (PostgREST answers
 * 42703 for the column). The rule cannot be applied without the date, so the
 * deal is kept, which is how every deal behaved before this rule existed.
 * A null that was read is a deal nobody ever confirmed, and it is hidden.
 */
export function isStaleOpenEndedDeal(deal: DealFreshnessFields, now: Date = new Date()): boolean {
  if (deal.end_date) return false;
  if (deal.last_confirmed_at === undefined) return false;
  if (deal.last_confirmed_at === null) return true;
  const confirmed = new Date(deal.last_confirmed_at).getTime();
  if (!Number.isFinite(confirmed)) return true;
  return confirmed < dealConfirmationCutoff(now).getTime();
}

/**
 * PostgREST `or` filter for !isStaleOpenEndedDeal: the deal has an end date,
 * or it was confirmed at or after the cutoff. A null last_confirmed_at fails
 * the comparison, so a never-confirmed open-ended deal is left out, as on the
 * client. Repeated `or` params are ANDed by PostgREST, so this sits beside the
 * date-window `or` on the same query.
 */
export function confirmedDealFilter(now: Date = new Date()): string {
  return `end_date.not.is.null,last_confirmed_at.gte.${dealConfirmationCutoff(now).toISOString()}`;
}

/**
 * PostgREST `or` filter for the admin's re-confirm list, to sit beside
 * `.is('end_date', null)`: never confirmed, or confirmed before the cutoff.
 */
export function staleConfirmationFilter(now: Date = new Date()): string {
  return `last_confirmed_at.is.null,last_confirmed_at.lt.${dealConfirmationCutoff(now).toISOString()}`;
}

/**
 * "Confirmed Nov 3, 2026" in Des Moines time, or null when there is no
 * readable date to state. Null renders nothing rather than "Confirmed never",
 * which a visitor could not act on.
 */
export function dealConfirmedLabel(lastConfirmedAt: string | null | undefined): string | null {
  if (!lastConfirmedAt) return null;
  const d = new Date(lastConfirmedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `Confirmed ${formatInTimeZone(d, 'America/Chicago', 'MMM d, yyyy')}`;
}

/** PostgREST's code for a column that does not exist (an unapplied migration). */
export const UNDEFINED_COLUMN_CODE = '42703';
