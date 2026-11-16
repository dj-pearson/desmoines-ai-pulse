/**
 * Which of these users switched the weekly digest off? (WEB-ADS-036)
 *
 * The account page's "Weekly event digest" switch writes
 * user_email_preferences.weekly_digest_enabled. Two senders mail a weekly
 * digest, and only one of them read it: send-weekly-digest gets its list from
 * get_weekly_digest_recipients, which requires the switch on. The personal
 * digest (agent-runner/weekly-digest-personal, "Your week in Des Moines")
 * gated only on lifecycle_signals.messagingAllowed, which comes from the
 * separate "Account and activity emails" switch. So a member who turned the
 * weekly digest off kept getting a weekly digest every week.
 *
 * A user is opted out when they HAVE a preferences row and it does not say
 * true, the same reading get_weekly_digest_recipients uses. A user with no row
 * never touched the switch (handle_new_user has created one since
 * 20261004000001), so their mail is still decided by messagingAllowed, as
 * before. This narrows the list; it never adds anyone to it.
 *
 * A failed read THROWS. The caller cannot tell an empty answer from a failed
 * one, and reading a failure as "nobody opted out" would mail everyone who
 * did. The agent run is recorded as failed and sends nothing that week, which
 * costs one digest; the other way costs a complaint.
 */

/** The one query shape this needs, so the module has no esm.sh import. */
export interface PreferencesReader {
  from(table: "user_email_preferences"): {
    select(columns: string): {
      in(column: string, values: string[]): PromiseLike<{
        data: Array<{ user_id: string; weekly_digest_enabled: boolean | null }> | null;
        error: { message: string } | null;
      }>;
    };
  };
}

/** user_ids per request: 100 uuids keep the query string near 4KB. */
export const PREFERENCES_CHUNK = 100;

export async function weeklyDigestOptedOut(
  supabase: PreferencesReader,
  userIds: string[],
): Promise<Set<string>> {
  const optedOut = new Set<string>();
  const ids = [...new Set(userIds)];
  for (let i = 0; i < ids.length; i += PREFERENCES_CHUNK) {
    const chunk = ids.slice(i, i + PREFERENCES_CHUNK);
    const { data, error } = await supabase
      .from("user_email_preferences")
      .select("user_id, weekly_digest_enabled")
      .in("user_id", chunk);
    if (error) {
      throw new Error(`weekly digest preferences read failed: ${error.message}`);
    }
    for (const row of data ?? []) {
      if (row.weekly_digest_enabled !== true) optedOut.add(row.user_id);
    }
  }
  return optedOut;
}
