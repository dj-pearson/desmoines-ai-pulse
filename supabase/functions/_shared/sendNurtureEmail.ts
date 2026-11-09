/**
 * sendNurtureEmail — one place to send a marketing nurture email and record it
 * in the nurture_sends ledger (AOS-NURTURE-002+). Reused by onboarding, win-back,
 * and the weekly digest. Sends through _shared/email.ts (SES)
 * with the emailLayout CAN-SPAM footer and one-click
 * unsubscribe (the token is looked up by address when the caller has none, see
 * lookupUnsubscribeToken). Callers MUST have already checked consent/unsubscribe; this
 * records the send, it does not decide policy. sendEmail still drops
 * suppressed addresses, which is recorded here as `skipped`.
 *
 * Fail-safe: on any send error it records a `failed` row and returns ok:false,
 * never throwing, so one bad send can't abort a batch.
 */
import { listUnsubscribeHeaders, renderEmail } from "./emailLayout.ts";
import { normalizeEmail, sendEmail } from "./email.ts";
import { envVar } from "./siteUrl.ts";

// A service-role supabase-js client. Untyped like email.ts's DbClient so this
// module imports nothing from esm.sh and loads in an offline vitest.
// deno-lint-ignore no-explicit-any
type NurtureDb = any;

/** newsletter_subscribers.unsubscribe_token: 48 lowercase hex, as newsletter_unsubscribe_by_token checks. */
const UNSUBSCRIBE_TOKEN = /^[0-9a-f]{48}$/;

/**
 * The recipient's newsletter unsubscribe token, or null.
 *
 * No nurture agent passes one, so every onboarding, win-back, re-engagement,
 * milestone and subscription-nurture email went out with a footer saying
 * "unsubscribe in one click" that linked to /profile?tab=settings (sign-in
 * required) and a List-Unsubscribe header with only the mailto form, so no
 * inbox showed its one-click button. send-weekly-digest already looks the
 * token up by address; this does the same. The token unsubscribes through
 * newsletter_unsubscribe_by_token, which writes the 'unsubscribe' suppression
 * that sendEmail applies to every marketing send, nurture included.
 *
 * Any row status is fine: the RPC accepts a pending or unsubscribed row's
 * token and still writes the suppression. A failed read returns null, which is
 * the old footer, rather than stopping the send: the footer is not the opt-out
 * check (consent and email_suppressions are), and losing every nurture email
 * to a lookup error would be a worse outcome than one email without the link.
 */
export async function lookupUnsubscribeToken(
  supabase: NurtureDb,
  email: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("newsletter_subscribers")
      .select("unsubscribe_token")
      .eq("email", normalizeEmail(email))
      .maybeSingle();
    if (error) {
      console.warn(`[sendNurtureEmail] unsubscribe token lookup failed: ${error.message}`);
      return null;
    }
    const token = (data as { unsubscribe_token?: unknown } | null)?.unsubscribe_token;
    return typeof token === "string" && UNSUBSCRIBE_TOKEN.test(token) ? token : null;
  } catch (err) {
    console.warn(`[sendNurtureEmail] unsubscribe token lookup threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export interface NurtureEmailDeps {
  /** Pinned in tests. */
  send?: typeof sendEmail;
}

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
  supabase: NurtureDb,
  args: NurtureEmailArgs,
  deps: NurtureEmailDeps = {},
): Promise<NurtureEmailResult> {
  const from = args.fromAddress || envVar("NURTURE_FROM") || undefined;
  const category = args.category ?? "marketing";
  // Transactional mail carries no unsubscribe, so it does not need the token.
  const unsubscribeToken = category === "marketing"
    ? args.unsubscribeToken ?? await lookupUnsubscribeToken(supabase, args.email)
    : null;

  const rendered = renderEmail({
    bodyHtml: args.bodyHtml,
    bodyText: args.bodyText,
    recipient: { email: args.email, unsubscribeToken },
    category,
  });

  const res = await (deps.send ?? sendEmail)(
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

  // resend_message_id (named for a former provider) holds the SES message id;
  // ses-events matches on it.
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
