/**
 * WEB-FEAT-059: the one-click "stop reminders for this event" link in an
 * event-reminder email (/unsubscribe?reminder=<user_event_reminders.id>).
 *
 * cancel_event_reminders_by_token deletes the recipient's unsent reminders
 * for that one event and nothing else (no sign-in needed): the newsletter and
 * their other reminders stay. It is not in the generated types until
 * migration 20261108000047 is applied, so the call goes through a narrowed
 * signature (scripts/check-schema-usage.mjs lists it in PENDING_MIGRATIONS).
 */
import { supabase } from "@/integrations/supabase/client";

export type ReminderOptOutResult =
  | { kind: "cancelled"; cancelled: number; eventTitle: string | null }
  | { kind: "invalid" }
  | { kind: "error"; error: unknown };

interface CancelRow {
  success?: boolean;
  cancelled?: number | null;
  event_title?: string | null;
}

type CancelRpc = (
  fn: "cancel_event_reminders_by_token",
  args: { p_token: string },
) => PromiseLike<{ data: CancelRow[] | CancelRow | null; error: unknown }>;

export async function cancelRemindersByToken(token: string): Promise<ReminderOptOutResult> {
  const trimmed = token.trim();
  if (!trimmed) return { kind: "invalid" };
  try {
    // bind: rpc reads this.rest, so a detached reference throws.
    const rpc = supabase.rpc.bind(supabase) as unknown as CancelRpc;
    const { data, error } = await rpc("cancel_event_reminders_by_token", { p_token: trimmed });
    if (error) return { kind: "error", error };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) return { kind: "invalid" };
    return { kind: "cancelled", cancelled: Number(row.cancelled ?? 0), eventTitle: row.event_title ?? null };
  } catch (error) {
    return { kind: "error", error };
  }
}
