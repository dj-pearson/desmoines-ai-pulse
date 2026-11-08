/**
 * The send loop shared by send-newsletter-campaign (send_now) and
 * dispatch-scheduled-newsletters (cron). Pure: no esm.sh import, so vitest can
 * run it (src/lib/__tests__/newsletterDispatch.test.ts).
 *
 * WHY IT RECORDS AFTER EVERY BATCH. Both callers used to collect every
 * newsletter_deliveries row in memory and insert them once, after the last
 * send. An edge function that is killed part-way (wall-clock limit, deploy,
 * OOM) therefore left NO delivery rows. reclaim_stuck_newsletter_campaigns
 * then flips the campaign back to 'scheduled' after 15 minutes, the dispatcher
 * resumes it, finds nothing attempted, and mails the whole list again - and a
 * list too long to finish in one invocation is killed at the same point every
 * time, so the first few thousand readers got the same newsletter every 15
 * minutes. The "idempotent resume" both docstrings promised needed the rows to
 * exist before the crash, not after.
 *
 * WHY A FAILED RECORD STOPS THE SEND. A batch that went out but could not be
 * recorded is invisible to the next resume. Carrying on would grow that
 * invisible set with every batch; stopping caps it at one batch (at most
 * `batchSize` readers who may get a second copy) and the caller marks the
 * campaign failed, which a human can see.
 */

export interface NewsletterRecipient {
  email: string;
  unsubscribe_token: string | null;
}

export interface DeliveryRow {
  campaign_id: string;
  email: string;
  resend_message_id: string | null;
  status: string;
  error_message: string | null;
}

/**
 * Prior attempt per lowercased email: true when the send succeeded. A failed
 * send is the only row written with an error_message, and ses-events never
 * sets one, so that column is the test (resend_message_id can be null on a
 * success when the provider returned no id).
 */
export type AttemptedRecipients = Map<string, boolean>;

export interface DispatchOptions<R extends NewsletterRecipient> {
  campaignId: string;
  recipients: R[];
  attempted: AttemptedRecipients;
  send: (recipient: R) => Promise<{ message_id: string | null }>;
  recordDeliveries: (rows: DeliveryRow[]) => Promise<{ error: string | null }>;
  batchSize?: number;
}

export interface DispatchResult {
  /** Sends that succeeded, this run and earlier runs of the campaign. */
  delivered: number;
  /** Sends that threw, this run and earlier runs. */
  failed: number;
  /** Recipients skipped because an earlier run already attempted them. */
  skipped: number;
  errors: string[];
}

export class DeliveryRecordError extends Error {
  constructor(public readonly delivered: number, public readonly failed: number, cause: string) {
    super(`newsletter_deliveries insert failed, send stopped to avoid unrecorded copies: ${cause}`);
    this.name = "DeliveryRecordError";
  }
}

/** PostgREST caps a response at 1000 rows by default; read past it in pages. */
export const DB_PAGE_SIZE = 1000;

export async function loadAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = DB_PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

export function toAttempted(
  rows: Array<{ email: string; error_message: string | null }>,
): AttemptedRecipients {
  const map: AttemptedRecipients = new Map();
  for (const r of rows) {
    const key = r.email.toLowerCase();
    map.set(key, map.get(key) === true || r.error_message == null);
  }
  return map;
}

export async function dispatchNewsletter<R extends NewsletterRecipient>(
  opts: DispatchOptions<R>,
): Promise<DispatchResult> {
  const batchSize = opts.batchSize ?? 5;
  let delivered = 0;
  let failed = 0;
  for (const sent of opts.attempted.values()) {
    if (sent) delivered++;
    else failed++;
  }

  const remaining = opts.recipients.filter((r) => !opts.attempted.has(r.email.toLowerCase()));
  const skipped = opts.recipients.length - remaining.length;
  const errors: string[] = [];

  for (let i = 0; i < remaining.length; i += batchSize) {
    const batch = remaining.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map((r) => opts.send(r)));
    const rows: DeliveryRow[] = settled.map((s, idx) => {
      const email = batch[idx].email;
      if (s.status === "fulfilled") {
        delivered++;
        return {
          campaign_id: opts.campaignId,
          email,
          resend_message_id: s.value.message_id,
          status: "queued",
          error_message: null,
        };
      }
      failed++;
      const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
      if (errors.length < 5) errors.push(reason);
      return {
        campaign_id: opts.campaignId,
        email,
        resend_message_id: null,
        status: "bounced",
        error_message: reason.slice(0, 500),
      };
    });

    const { error } = await opts.recordDeliveries(rows);
    if (error) throw new DeliveryRecordError(delivered, failed, error);
  }

  return { delivered, failed, skipped, errors };
}

/**
 * WEB-ADS-026. send_now sends inside the admin's HTTP request, five at a time.
 * Each batch is a round trip to SES plus a newsletter_deliveries insert, so a
 * list of a few thousand runs past the edge wall-clock limit: the admin sees a
 * timeout, the run is killed, and reclaim resumes it 15 minutes later. Above
 * this many recipients send_now writes the campaign as due now and returns;
 * dispatch-scheduled-newsletters (pg_cron, every minute) claims it in its own
 * invocation. 250 is 50 batches, well inside the limit at a second a batch.
 */
export const SEND_NOW_INLINE_LIMIT = 250;

export type SendNowMode = "inline" | "queue";

export function sendNowMode(
  recipientCount: number,
  limit: number = SEND_NOW_INLINE_LIMIT,
): SendNowMode {
  return recipientCount > limit ? "queue" : "inline";
}
