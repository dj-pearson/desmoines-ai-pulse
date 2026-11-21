import { supabase } from "@/integrations/supabase/client";

/**
 * Review decision -> notify-event-submission template (WEB-ADS-008).
 *
 * `pending` sends nothing - it is not a decision.
 */
export const NOTIFICATION_TYPE: Record<string, string | null> = {
  approved: "event_approved",
  rejected: "event_rejected",
  needs_revision: "event_needs_revision",
  pending: null,
};

/**
 * Email the submitter of one submission about a review decision.
 *
 * Only the type and the submission id are sent. notify-event-submission reads
 * the recipient (the owning account's confirmed address), the title and the
 * admin notes from the row itself and refuses a decision mail from anyone but
 * an admin or the service role, so there is nothing a caller could pass that
 * redirects the mail. Callers must write the decision before calling.
 *
 * Never throws: the decision has already committed when this runs. Returns
 * whether the function accepted the request, so the admin can be told when
 * the organizer was not.
 */
export async function notifySubmissionDecision(
  submissionId: string,
  status: string,
  adminNotes?: string,
): Promise<boolean> {
  const notificationType = NOTIFICATION_TYPE[status];
  if (!notificationType) return true;
  try {
    const { error } = await supabase.functions.invoke("notify-event-submission", {
      body: { notificationType, eventId: submissionId, adminNotes },
    });
    return !error;
  } catch {
    return false;
  }
}
