/**
 * sendNurtureEmail — one place to send a marketing nurture email and record it
 * in the nurture_sends ledger (AOS-NURTURE-002+). Reused by onboarding, win-back,
 * and the weekly digest. Uses the existing Resend plumbing + emailLayout
 * (CAN-SPAM footer with one-click unsubscribe). Callers MUST have already
 * checked consent/unsubscribe — this records the send, it doesn't decide policy.
 *
 * Fail-safe: on any send error it records a `failed` row and returns ok:false,
 * never throwing, so one bad send can't abort a batch.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithTimeout } from "./fetchWithTimeout.ts";
import { renderEmail } from "./emailLayout.ts";

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
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = args.fromAddress || Deno.env.get("NURTURE_FROM") || "Des Moines Insider <hello@desmoinesinsider.com>";

  const rendered = renderEmail({
    bodyHtml: args.bodyHtml,
    bodyText: args.bodyText,
    recipient: { email: args.email, unsubscribeToken: args.unsubscribeToken ?? null },
    category: args.category ?? "marketing",
  });

  if (!apiKey) {
    // No mailer configured — record the intent as skipped, don't fail the run.
    const { data, error } = await supabase
      .from("nurture_sends")
      .insert({ user_id: args.userId, email: args.email, agent_key: args.agentKey, kind: args.kind, status: "skipped", quality_score: args.qualityScore ?? null })
      .select("id")
      .single();
    // Best-effort: nothing was sent, so a missing ledger row costs only the
    // record of an attempt that did not happen (WEB-BE-032 AC3).
    if (error) console.warn("[sendNurtureEmail] failed to record skipped send:", error.message);
    return { ok: false, sendId: data?.id, error: "RESEND_API_KEY not set" };
  }

  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    if (rendered.listUnsubscribe) headers["List-Unsubscribe"] = rendered.listUnsubscribe;
    if (rendered.listUnsubscribePost) headers["List-Unsubscribe-Post"] = rendered.listUnsubscribePost;
    const res = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({ from, to: [args.email], subject: args.subject, html: rendered.html, text: rendered.text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(body?.message ?? "").slice(0, 160)}`);
    const messageId = body?.id ?? null;
    const { data, error } = await supabase
      .from("nurture_sends")
      .insert({ user_id: args.userId, email: args.email, agent_key: args.agentKey, kind: args.kind, resend_message_id: messageId, status: "queued", quality_score: args.qualityScore ?? null })
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
    return { ok: true, sendId: data?.id, messageId: messageId ?? undefined };
  } catch (err) {
    const message = (err as Error)?.message ?? "send error";
    await supabase.from("nurture_sends").insert({ user_id: args.userId, email: args.email, agent_key: args.agentKey, kind: args.kind, status: "failed", quality_score: args.qualityScore ?? null });
    return { ok: false, error: message };
  }
}
