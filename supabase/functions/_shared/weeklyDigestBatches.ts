/**
 * WEB-ADS-038. The send loop for send-weekly-digest. Pure: no esm.sh import,
 * so vitest can run it (src/lib/__tests__/weeklyDigestBatches.test.ts).
 *
 * WHY BATCHES. The function used to map every recipient into one
 * Promise.allSettled, so a list of 2,000 made 2,000 RPC calls, 2,000
 * newsletter_subscribers reads and 2,000 SES sends in the same instant. SES
 * throttles past its per-second rate, a throttled send was logged as 'failed'
 * in weekly_digest_log, and get_weekly_digest_recipients then excluded that
 * user for 6 days because it counted any row. Five at a time is what
 * newsletterDispatch.ts already uses.
 *
 * WHY A TIME BUDGET. Serial batches take longer than one burst, and an edge
 * function killed at its wall-clock limit leaves the batch in flight half
 * sent and half logged. The loop stops starting new batches once the budget
 * is spent and reports the rest as `deferred`. They have no weekly_digest_log
 * row, so the next run (or a manual re-run) picks them up; the sent ones are
 * excluded by the 'sent' row.
 */

export const DIGEST_BATCH_SIZE = 5;

/** Well inside the edge wall-clock limit, leaving room for the batch in flight. */
export const DIGEST_TIME_BUDGET_MS = 100_000;

export interface DigestBatchOptions {
  batchSize?: number;
  budgetMs?: number;
  now?: () => number;
}

export interface DigestBatchResult {
  /** send resolved (including recipients it chose to skip). */
  successes: number;
  /** send threw. */
  failures: number;
  /** Never attempted because the time budget ran out. */
  deferred: number;
}

export async function sendDigestsInBatches<R>(
  recipients: R[],
  send: (recipient: R) => Promise<unknown>,
  opts: DigestBatchOptions = {},
): Promise<DigestBatchResult> {
  const batchSize = Math.max(1, opts.batchSize ?? DIGEST_BATCH_SIZE);
  const budgetMs = opts.budgetMs ?? DIGEST_TIME_BUDGET_MS;
  const now = opts.now ?? Date.now;
  const started = now();

  let successes = 0;
  let failures = 0;
  let i = 0;
  for (; i < recipients.length; i += batchSize) {
    if (i > 0 && now() - started >= budgetMs) break;
    const batch = recipients.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((r) => send(r)));
    for (const s of settled) {
      if (s.status === "fulfilled") successes++;
      else failures++;
    }
  }

  return { successes, failures, deferred: Math.max(0, recipients.length - i) };
}
