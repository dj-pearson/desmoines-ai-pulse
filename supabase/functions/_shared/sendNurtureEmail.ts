/**
 * sendNurtureEmail — one place to send a marketing nurture email and record it
 * in the nurture_sends ledger (AOS-NURTURE-002+). Reused by onboarding, win-back,
 * and the weekly digest. Sends through _shared/email.ts (SES, or Resend until
 * SES is configured) with the emailLayout CAN-SPAM footer and one-click
 * unsubscribe. Callers MUST have already checked consent/unsubscribe; this
 * records the send, it does not decide policy. sendEmail still drops
 * suppressed addresses, which is recorded here as `skipped`.
 *
 * Fail-safe: on any send error it records a `failed` row and returns ok:false,
 * never throwing, so one bad send can't abort a batch.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listUnsubscribeHeaders, renderEmail } from "./emailLayout.ts";
import { sendEmail } from "./email.ts";

export interface NurtureEmailArgs {
  agentKey: string;
  kind: string;
  userId: string | null;
  email: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  unsubscribeToken?: string | null;
  qualityScore?: number | null;
  fromAddress?: string;
  /**
   * "marketing" (default) gets the full CAN-SPAM footer with an unsubscribe
   * link. "transactional" gets the minimal footer and no unsubscribe, for
   * messages the recipient cannot opt out of because they are about their own
   * billing or account - see _shared/trialNotice.ts (WEB-LEGAL-006). Consent is
   * still the caller's decision; this only picks the footer.
   */
  category?: "marketing" | "transactional";
}

export interface NurtureEmailResult {
  ok: boolean;
  sendId?: string;
  messageId?: string;
  error?: string;
}

export async function sendNurtureEmail(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any>,
  args: NurtureEmailArgs,
): Promise<NurtureEmailResult> {
  const from = args.fromAddress || Deno.env.get("NURTURE_FROM") || undefined;
  const category = args.category ?? "marketing";

  const rendered = renderEmail({
    bodyHtml: args.bodyHtml,
    bodyText: args.bodyText,
    recipient: { email: args.email, unsubscribeToken: args.unsubscribeToken ?? null },
    category,
  });

  const res = await sendEmail(
    {
      to: args.email,
      subject: args.subject,
      html: rendered.html,
      text: rendered.text,
      category,
      template: `nurture_${args.kind}`,
      from,
      headers: listUnsubscribeHeaders(rendered),
      userId: args.userId,
      ref: { type: "agent", id: args.agentKey },
    },
    { supabase },
  );

  const ledger = { user_id: args.userId, email: args.email, agent_key: args.agentKey, kind: args.kind, quality_score: args.qualityScore ?? null };

  if (!res.ok) {
    // Nothing went out. "skipped" when there was nothing to send with or the
    // address is suppressed, "failed" when the provider refused or errored.
    const status = res.provider === "none" || (res.suppressed?.length ?? 0) > 0 ? "skipped" : "failed";
    const { data, error } = await supabase
      .from("nurture_sends")
      .insert({ ...ledger, status })
      .select("id")
      .single();
    // Best-effort: nothing was sent, so a missing ledger row costs only the
    // record of an attempt that did not happen (WEB-BE-032 AC3).
    if (error) console.warn(`[sendNurtureEmail] failed to record ${status} send:`, error.message);
    return { ok: false, sendId: data?.id, error: res.error };
  }

  // resend_message_id holds the provider's id whichever provider sent it;
  // ses-events and resend-webhook both match on it.
  const { data, error } = await supabase
    .from("nurture_sends")
    .insert({ ...ledger, resend_message_id: res.messageId ?? null, status: "queued" })
    .select("id")
    .single();
  // NOT best-effort, even though the send already succeeded. nurture_sends is
  // what recentlyMessaged and shouldAgeOut read, so a dropped row means this
  // email is invisible to the frequency cap and the user can be mailed again
  // on the next run (WEB-BE-032 AC2). The mail is out either way, so the
  // result stays ok:true - the point is that the failure is now visible.
  if (error) {
    console.error(
      `[sendNurtureEmail] SENT but failed to record ${args.kind} for ${args.userId}; frequency cap will not see it:`,
      error.message,
    );
  }
  return { ok: true, sendId: data?.id, messageId: res.messageId };
}
