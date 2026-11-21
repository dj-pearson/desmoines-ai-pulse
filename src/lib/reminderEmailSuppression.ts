/**
 * WEB-FEAT-065: will this signed-in reader's event reminders actually be
 * emailed?
 *
 * Reminders go out as category "marketing" (owner decision on WEB-FEAT-063),
 * so _shared/email.ts drops them for an address that unsubscribed from the
 * newsletter. my_reminder_emails_unsubscribed answers that for the caller's own
 * address only; it takes no arguments and reads auth.uid().
 *
 * It is not in the generated types until migration 20261108000081 is applied,
 * so the call goes through a narrowed signature (scripts/check-schema-usage.mjs
 * lists it in PENDING_MIGRATIONS). Until then PostgREST answers PGRST202 and
 * this returns false: the page says what it said before, rather than warning
 * everyone.
 */
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("reminderEmailSuppression");

type UnsubscribedRpc = (
  fn: "my_reminder_emails_unsubscribed",
) => PromiseLike<{ data: boolean | null; error: { code?: string; message?: string } | null }>;

function isNotApplied(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

/**
 * True only when the server says the caller's address has an 'unsubscribe'
 * suppression. Any failure answers false: a broken check must not tell
 * someone their reminders won't arrive when they will.
 */
export async function fetchReminderEmailsUnsubscribed(): Promise<boolean> {
  try {
    // bind: rpc reads this.rest, so a detached reference throws.
    const rpc = supabase.rpc.bind(supabase) as unknown as UnsubscribedRpc;
    const { data, error } = await rpc("my_reminder_emails_unsubscribed");
    if (error) {
      if (!isNotApplied(error)) {
        log.error("fetch", "Suppression check failed", { data: error });
      }
      return false;
    }
    return data === true;
  } catch (error) {
    log.error("fetch", "Suppression check threw", { data: error });
    return false;
  }
}
