/**
 * Subscription reconciliation against the provider (WEB-BE-062).
 *
 * The nightly subscription-reconcile job hands this module the rows whose
 * status says paid and whose current_period_end has passed (see
 * public.subscription_reconcile_candidates). For a web row it re-reads the
 * subscription from Stripe and, when Stripe's answer differs from the row,
 * writes Stripe's answer through subscriptionUpdatePatch(), the same patch
 * stripe-webhook writes on customer.subscription.updated. Each correction is
 * one subscription_events row (event_type 'reconciled'), written in the same
 * transaction as the update by apply_subscription_reconciliation().
 *
 * THE RULE FOR AN ANSWER WE CANNOT USE. A Stripe error, a 404 for the id, or a
 * response whose status or period we cannot read writes NOTHING to
 * user_subscriptions. It is not treated as active (that would extend
 * entitlement on an error) and it is not treated as cancelled (that would
 * revoke a paying member on our failure). It is counted and recorded per row
 * instead. Nothing is lost by writing nothing: public.subscription_row_entitled
 * already ends entitlement three days after the period, so a row we cannot
 * confirm stops granting on time without the job guessing.
 *
 * iOS and Android rows are counted as provider_not_wired. Their server APIs
 * exist inside validate-ios-receipt and validate-android-receipt, but the
 * signing (Apple JWT, Google service-account token) lives in those handlers
 * and is not shared yet; until it is, the time bound alone ends those rows.
 *
 * No remote imports: the Stripe client and the database are passed in, so the
 * Deno test drives every branch with stubs.
 */

import {
  type PlanPriceRow,
  type StripeSubscriptionLike,
  subscriptionUpdatePatch,
} from './stripeSubscriptionRow.ts';

/** One row from public.subscription_reconcile_candidates(). */
export interface ReconcileCandidate {
  id: string;
  user_id: string;
  platform: string | null;
  status: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  plan_id: string | null;
}

export type ReconcileOutcome =
  | 'corrected'
  | 'unchanged'
  | 'not_found'
  | 'unreadable'
  | 'provider_error'
  | 'no_provider_reference'
  | 'provider_not_wired'
  | 'row_moved'
  | 'store_error';

/** The slice of the Stripe SDK this module calls. */
export interface StripeSubscriptionReader {
  retrieve(id: string): Promise<unknown>;
}

/** The database writes, as RPCs. Each throws on a failed call. */
export interface ReconcileStore {
  /** apply_subscription_reconciliation: false when the row no longer matches. */
  apply(
    candidate: ReconcileCandidate,
    patch: Record<string, unknown>,
    details: Record<string, unknown>,
  ): Promise<boolean>;
  /** note_subscription_reconcile_check: the row's place in the queue. */
  note(subscriptionId: string, outcome: ReconcileOutcome, detail: string | null): Promise<void>;
}

export interface ReconcileCorrection {
  subscriptionId: string;
  userId: string;
  before: { status: string | null; current_period_end: string | null; plan_id: string | null };
  after: { status: unknown; current_period_end: unknown; plan_id: unknown };
}

export interface ReconcileReport {
  checked: number;
  corrected: number;
  outcomes: Record<ReconcileOutcome, number>;
  corrections: ReconcileCorrection[];
  /** Rows the job could not decide on, with why. Capped; the counts are not. */
  problems: Array<{ subscriptionId: string; outcome: ReconcileOutcome; detail: string }>;
  /** Failed note() calls: the row was handled but will be re-read sooner. */
  noteFailures: number;
}

/** Outcomes that mean "we could not decide", which the run counts as failed. */
export const FAILED_OUTCOMES: ReadonlySet<ReconcileOutcome> = new Set([
  'unreadable',
  'provider_error',
  'store_error',
]);

const PROBLEM_CAP = 25;

/**
 * Every status Stripe documents for a subscription. mapStripeStatus() turns an
 * unknown one into 'active', which is the right default for a webhook that
 * must not lock out a payer and the wrong one here: an answer we do not
 * recognise is unreadable, so the reconciler writes nothing.
 */
export const KNOWN_STRIPE_STATUSES: ReadonlySet<string> = new Set([
  'active',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'trialing',
  'unpaid',
  'paused',
]);

export type StripeRead =
  | { kind: 'ok'; subscription: StripeSubscriptionLike }
  | { kind: 'not_found'; detail: string }
  | { kind: 'unreadable'; detail: string }
  | { kind: 'provider_error'; detail: string };

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** A Stripe "No such subscription" (404 / resource_missing), or not. */
export function isStripeNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { statusCode?: unknown; code?: unknown; raw?: { code?: unknown } };
  return e.statusCode === 404 || e.code === 'resource_missing' || e.raw?.code === 'resource_missing';
}

/**
 * Validate what Stripe returned before anything is built from it. The id must
 * be the one we asked for, the status one Stripe documents, and both period
 * bounds positive numbers (seconds since the epoch, API version 2023-10-16).
 */
export function readStripeSubscription(requestedId: string, raw: unknown): StripeRead {
  if (!raw || typeof raw !== 'object') return { kind: 'unreadable', detail: 'empty response' };
  const sub = raw as Partial<StripeSubscriptionLike>;
  if (sub.id !== requestedId) {
    return { kind: 'unreadable', detail: `response id ${String(sub.id)} is not ${requestedId}` };
  }
  if (typeof sub.status !== 'string' || !KNOWN_STRIPE_STATUSES.has(sub.status)) {
    return { kind: 'unreadable', detail: `unknown Stripe status ${String(sub.status)}` };
  }
  const end = sub.current_period_end;
  const start = sub.current_period_start;
  if (typeof end !== 'number' || !Number.isFinite(end) || end <= 0) {
    return { kind: 'unreadable', detail: 'no current_period_end in the response' };
  }
  if (typeof start !== 'number' || !Number.isFinite(start) || start <= 0) {
    return { kind: 'unreadable', detail: 'no current_period_start in the response' };
  }
  return { kind: 'ok', subscription: sub as StripeSubscriptionLike };
}

export async function fetchStripeSubscription(
  stripe: StripeSubscriptionReader,
  id: string,
): Promise<StripeRead> {
  let raw: unknown;
  try {
    raw = await stripe.retrieve(id);
  } catch (err) {
    if (isStripeNotFound(err)) return { kind: 'not_found', detail: errorText(err) };
    return { kind: 'provider_error', detail: errorText(err) };
  }
  return readStripeSubscription(id, raw);
}

function sameInstant(a: unknown, b: string | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  const ta = new Date(String(a)).getTime();
  const tb = new Date(b).getTime();
  return !Number.isNaN(ta) && ta === tb;
}

/**
 * Does Stripe's patch change anything entitlement depends on? Status, the
 * period end, or the plan (only when the price resolved to one plan).
 */
export function isCorrection(candidate: ReconcileCandidate, patch: Record<string, unknown>): boolean {
  if (patch.status !== candidate.status) return true;
  if (!sameInstant(patch.current_period_end, candidate.current_period_end)) return true;
  if (typeof patch.plan_id === 'string' && patch.plan_id !== candidate.plan_id) return true;
  return false;
}

function emptyOutcomes(): Record<ReconcileOutcome, number> {
  return {
    corrected: 0,
    unchanged: 0,
    not_found: 0,
    unreadable: 0,
    provider_error: 0,
    no_provider_reference: 0,
    provider_not_wired: 0,
    row_moved: 0,
    store_error: 0,
  };
}

/**
 * Reconcile one batch. Never throws for a single row: each row ends in exactly
 * one outcome. `stripe` is required; the caller fails the run when
 * STRIPE_SECRET_KEY is missing rather than reporting every web row as an error.
 */
export async function reconcileBatch(
  candidates: readonly ReconcileCandidate[],
  deps: {
    stripe: StripeSubscriptionReader;
    store: ReconcileStore;
    catalog: readonly PlanPriceRow[];
    now?: Date;
  },
): Promise<ReconcileReport> {
  const now = deps.now ?? new Date();
  const report: ReconcileReport = {
    checked: 0,
    corrected: 0,
    outcomes: emptyOutcomes(),
    corrections: [],
    problems: [],
    noteFailures: 0,
  };

  const finish = async (c: ReconcileCandidate, outcome: ReconcileOutcome, detail: string | null) => {
    report.outcomes[outcome] += 1;
    if (outcome === 'corrected') report.corrected += 1;
    if (outcome !== 'corrected' && outcome !== 'unchanged' && detail && report.problems.length < PROBLEM_CAP) {
      report.problems.push({ subscriptionId: c.id, outcome, detail });
    }
    // apply() already recorded a correction's check in the same transaction.
    if (outcome === 'corrected') return;
    try {
      await deps.store.note(c.id, outcome, detail);
    } catch (err) {
      report.noteFailures += 1;
      console.error(`[subscription-reconcile] note failed for ${c.id}: ${errorText(err)}`);
    }
  };

  for (const c of candidates) {
    report.checked += 1;

    if (c.platform === 'ios' || c.platform === 'android') {
      await finish(c, 'provider_not_wired', `${c.platform} re-validation is not wired into this job`);
      continue;
    }
    if (c.platform !== 'web' || !c.stripe_subscription_id) {
      await finish(c, 'no_provider_reference', `platform ${String(c.platform)} with no Stripe subscription id`);
      continue;
    }

    const read = await fetchStripeSubscription(deps.stripe, c.stripe_subscription_id);
    if (read.kind !== 'ok') {
      await finish(c, read.kind, read.detail);
      continue;
    }

    const patch = subscriptionUpdatePatch(read.subscription, deps.catalog);
    if (!isCorrection(c, patch)) {
      await finish(c, 'unchanged', null);
      continue;
    }

    const before = { status: c.status, current_period_end: c.current_period_end, plan_id: c.plan_id };
    const after = {
      status: patch.status,
      current_period_end: patch.current_period_end,
      plan_id: patch.plan_id ?? c.plan_id,
    };
    const details = {
      source: 'stripe',
      story: 'WEB-BE-062',
      stripe_subscription_id: c.stripe_subscription_id,
      stripe_status: read.subscription.status,
      before,
      after,
      reconciled_at: now.toISOString(),
    };

    let applied: boolean;
    try {
      applied = await deps.store.apply(c, patch, details);
    } catch (err) {
      await finish(c, 'store_error', errorText(err));
      continue;
    }
    if (!applied) {
      await finish(c, 'row_moved', 'row no longer holds this Stripe subscription id on platform web');
      continue;
    }
    report.corrections.push({ subscriptionId: c.id, userId: c.user_id, before, after });
    await finish(c, 'corrected', null);
  }

  return report;
}

/** Items the run counts as failed: rows it could not decide on. */
export function failedCount(report: ReconcileReport): number {
  let n = report.noteFailures;
  for (const o of FAILED_OUTCOMES) n += report.outcomes[o];
  return n;
}

/** Clamp the request's batchSize to what one run may read from Stripe. */
export function parseBatchSize(value: unknown, fallback = 50): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(n)));
}
