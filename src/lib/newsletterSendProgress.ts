/**
 * What the admin newsletter table shows while a send is in flight (WEB-ADS-026).
 *
 * A large send_now no longer runs inside the admin's request: the edge function
 * queues it and answers { queued: true } with zero counts, and
 * dispatch-scheduled-newsletters sends it a minute later. newsletter_campaigns
 * .delivered is only written when the run finishes, so the progress shown in
 * the meantime is counted from newsletter_deliveries, which the dispatcher
 * writes after every batch.
 */

export interface SendNowAnswer {
  ok: boolean;
  queued?: boolean;
  delivered?: number;
  failed?: number;
  recipient_count?: number;
}

export interface InFlightCandidate {
  status: string;
  scheduled_for: string | null;
}

/** How often the table re-reads while a campaign is queued or sending. */
export const SEND_PROGRESS_POLL_MS = 15_000;

export function sendNowToast(answer: SendNowAnswer): string {
  const total = answer.recipient_count ?? 0;
  if (answer.queued) {
    // Zero delivered here means "not started", and saying "Delivered 0 of N"
    // would read as a failed send.
    return `Queued for ${total.toLocaleString()} recipients. Sending starts within a minute; progress shows in the table.`;
  }
  return `Delivered ${answer.delivered ?? 0} of ${total}; ${answer.failed ?? 0} failed`;
}

/**
 * Sending, or scheduled and already due (a queued send_now, or a schedule the
 * cron has not claimed yet). A schedule for next week is not in flight and
 * must not keep the page polling.
 */
export function isInFlight(row: InFlightCandidate, now: Date = new Date()): boolean {
  if (row.status === "sending") return true;
  if (row.status !== "scheduled" || !row.scheduled_for) return false;
  const due = Date.parse(row.scheduled_for);
  return Number.isFinite(due) && due <= now.getTime();
}

/**
 * The Delivered cell. A finished campaign shows its stored count; one in
 * flight shows what newsletter_deliveries has recorded so far, when that has
 * been read, because the stored count stays 0 until the run ends.
 */
export function deliveredLabel(
  row: InFlightCandidate & { delivered: number },
  soFar: number | undefined,
  now: Date = new Date(),
): string {
  if (isInFlight(row, now) && soFar !== undefined) {
    return `${soFar.toLocaleString()} so far`;
  }
  return row.delivered.toLocaleString();
}
