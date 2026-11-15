/**
 * Which of these users already got the OTHER weekly digest this week?
 * (WEB-ADS-037)
 *
 * Two senders mail a weekly digest and each kept its own ledger:
 *
 *   send-weekly-digest      Sunday 08:00, "Your Weekly Events", logs to
 *                           weekly_digest_log (email_status 'sent'/'failed')
 *   weekly-digest-personal  Thursday 15:00 (agent-runner), "Your week in Des
 *                           Moines", logs to nurture_sends (kind
 *                           'weekly_digest', status 'queued' once sent)
 *
 * Neither read the other's ledger, so a member with the digest switch on and
 * marketing allowed got two digests every week, three days apart. Each sender
 * now asks this module about the other one's ledger and skips anyone it shows
 * mailed in the last DIGEST_OVERLAP_DAYS. With the current crons that means
 * the Thursday digest goes out and the Sunday one goes only to people the
 * Thursday run skipped (no consent signal, nothing relevant, quality gate).
 * Which digest is kept for good is an owner product call; this only enforces
 * "at most one a week" whichever it is.
 *
 * Only real sends count. A 'failed' digest log row and a 'skipped' or
 * 'failed' nurture row mean nothing reached the reader, so they do not stop
 * the other sender. The window and status are applied in the query AND
 * re-checked here, so a query that comes back wider than asked still cannot
 * suppress the wrong user.
 *
 * A failed read THROWS, as weeklyDigestOptOut does: an empty answer and a
 * failed one look the same, and reading a failure as "nobody got the other
 * digest" is the double send this exists to stop. The caller sends nothing
 * that run.
 */

export const DIGEST_OVERLAP_DAYS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

/** user_ids per request: 100 uuids keep the query string near 4KB. */
export const OVERLAP_CHUNK = 100;

export type WeeklyDigestSender = "send-weekly-digest" | "weekly-digest-personal";

type LedgerRow = Record<string, unknown>;

interface LedgerQuery extends PromiseLike<{ data: LedgerRow[] | null; error: { message: string } | null }> {
  in(column: string, values: string[]): LedgerQuery;
  eq(column: string, value: string): LedgerQuery;
  gte(column: string, value: string): LedgerQuery;
}

/** The query shape this needs, so the module has no esm.sh import. */
export interface DigestLedgerReader {
  from(table: "weekly_digest_log" | "nurture_sends"): {
    select(columns: string): LedgerQuery;
  };
}

/** nurture_sends statuses that mean the mail never went out. */
const NURTURE_NOT_SENT = new Set(["skipped", "failed"]);

/**
 * The users in `userIds` that the other sender mailed within the window.
 * `sender` is the one asking: it reads the other one's ledger.
 */
export async function mailedOtherWeeklyDigest(
  supabase: DigestLedgerReader,
  sender: WeeklyDigestSender,
  userIds: string[],
  now: number = Date.now(),
): Promise<Set<string>> {
  const sinceMs = now - DIGEST_OVERLAP_DAYS * DAY_MS;
  const since = new Date(sinceMs).toISOString();
  const mailed = new Set<string>();
  const ids = [...new Set(userIds)];

  for (let i = 0; i < ids.length; i += OVERLAP_CHUNK) {
    const chunk = ids.slice(i, i + OVERLAP_CHUNK);

    if (sender === "weekly-digest-personal") {
      const { data, error } = await supabase
        .from("weekly_digest_log")
        .select("user_id, email_status, sent_at")
        .in("user_id", chunk)
        .eq("email_status", "sent")
        .gte("sent_at", since);
      if (error) throw new Error(`weekly digest log read failed: ${error.message}`);
      for (const row of data ?? []) {
        if (row.email_status !== "sent") continue;
        if (!withinWindow(row.sent_at, sinceMs)) continue;
        if (typeof row.user_id === "string") mailed.add(row.user_id);
      }
    } else {
      const { data, error } = await supabase
        .from("nurture_sends")
        .select("user_id, status, created_at")
        .in("user_id", chunk)
        .eq("kind", "weekly_digest")
        .gte("created_at", since);
      if (error) throw new Error(`personal digest ledger read failed: ${error.message}`);
      for (const row of data ?? []) {
        if (typeof row.status === "string" && NURTURE_NOT_SENT.has(row.status)) continue;
        if (!withinWindow(row.created_at, sinceMs)) continue;
        if (typeof row.user_id === "string") mailed.add(row.user_id);
      }
    }
  }
  return mailed;
}

function withinWindow(value: unknown, sinceMs: number): boolean {
  if (typeof value !== "string") return false;
  const t = new Date(value).getTime();
  return Number.isFinite(t) && t >= sinceMs;
}
