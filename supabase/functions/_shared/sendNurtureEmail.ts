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
    category: "marketing",
  });

  if (!apiKey) {
    // No mailer configured — record the intent as skipped, don't fail the run.
    const { data } = await supabase
      .from("nurture_sends")
      .insert({ user_id: args.userId, email: args.email, agent_key: args.agentKey, kind: args.kind, status: "skipped", quality_score: args.qualityScore ?? null })
      .select("id")
      .single();
    return { ok: false, sendId: data?.id, error: "RESEND_API_KEY not set" };
  }

  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    if (rendered.listUnsubscribe) headers["List-Unsubscribe"] = rendered.listUnsubscribe;
    if (rendered.listUnsubscribePost) headers["List-Unsubscribe-Post"] = rendered.listUnsubscribePost;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({ from, to: [args.email], subject: args.subject, html: rendered.html, text: rendered.text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(body?.message ?? "").slice(0, 160)}`);
    const messageId = body?.id ?? null;
    const { data } = await supabase
      .from("nurture_sends")
      .insert({ user_id: args.userId, email: args.email, agent_key: args.agentKey, kind: args.kind, resend_message_id: messageId, status: "queued", quality_score: args.qualityScore ?? null })
      .select("id")
      .single();
    return { ok: true, sendId: data?.id, messageId: messageId ?? undefined };
  } catch (err) {
    const message = (err as Error)?.message ?? "send error";
    await supabase.from("nurture_sends").insert({ user_id: args.userId, email: args.email, agent_key: args.agentKey, kind: args.kind, status: "failed", quality_score: args.qualityScore ?? null });
    return { ok: false, error: message };
  }
}
