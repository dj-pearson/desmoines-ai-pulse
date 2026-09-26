/**
 * send-campaign-emails: email the campaign notices the database writes.
 *
 * process_campaign_lifecycle (activated, expiring soon, completed, creative
 * deadline) and admin_set_campaign_status (paused, resumed, cancelled) insert
 * campaign_notifications rows with email_pending = true, because a database
 * function should not call a mail provider (20261003000003). This drains them.
 *
 * Each row is CLAIMED before it is sent: email_pending flips true -> false in a
 * guarded update, and only the run whose update matched sends. Two overlapping
 * runs therefore cannot both mail the same notice. A failed send puts the flag
 * back so the next run retries; a row whose advertiser has no address is
 * cleared without a send, since retrying cannot find one.
 *
 * Pure: the database, auth lookup and sender are injected, so the claim and
 * retry rules are tested offline (handler.test.ts).
 */

export interface PendingNotice {
  id: string;
  campaign_id: string;
  recipient_user_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  campaign_name: string | null;
}

export interface Deps {
  listPending(limit: number): Promise<PendingNotice[]>;
  /** Set email_pending false where it is still true. True if this call claimed it. */
  claim(id: string): Promise<boolean>;
  /** Put a claimed row back to pending after a failed send. */
  release(id: string): Promise<void>;
  markSent(id: string, recipientEmail: string): Promise<void>;
  emailFor(userId: string): Promise<string | null>;
  send(notice: PendingNotice, to: string): Promise<boolean>;
}

export interface RunResult {
  pending: number;
  sent: number;
  failed: number;
  noAddress: number;
  skipped: number;
}

export const BATCH = 50;

export async function run(deps: Deps): Promise<RunResult> {
  const rows = await deps.listPending(BATCH);
  const out: RunResult = { pending: rows.length, sent: 0, failed: 0, noAddress: 0, skipped: 0 };
  for (const n of rows) {
    if (!(await deps.claim(n.id))) {
      out.skipped++;
      continue;
    }
    const to = n.recipient_user_id ? await deps.emailFor(n.recipient_user_id) : null;
    if (!to) {
      out.noAddress++;
      continue;
    }
    let ok = false;
    try {
      ok = await deps.send(n, to);
    } catch {
      ok = false;
    }
    if (ok) {
      await deps.markSent(n.id, to);
      out.sent++;
    } else {
      await deps.release(n.id);
      out.failed++;
    }
  }
  return out;
}
