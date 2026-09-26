/**
 * newsletter-subscribe (WEB-FEAT-019)
 *
 * Double opt-in for the newsletter. The signup used to insert straight into
 * newsletter_subscribers from the browser, with the table's default status
 * ('active'), and told the reader to check their email for a confirmation that
 * nothing sent. Two things were wrong with that beyond the false promise:
 *
 *   - anyone could add anyone else's address to a marketing list, because the
 *     INSERT policy is `WITH CHECK (true)` and nothing proved the person typing
 *     the address owned the mailbox;
 *   - a previously unsubscribed address hit UNIQUE(email) forever. The table
 *     has no UPDATE policy for any role, so coming back was impossible from
 *     any client.
 *
 * Both need a writer the browser cannot be, so this runs with the service role
 * and is public. That combination is exactly what scripts/check-edge-auth.mjs
 * flags, and the entry it gets there is deliberate and annotated: the caller is
 * an anonymous visitor typing their address, so there is no bearer to check.
 * What bounds it is a rate limit and the fact that it reveals nothing.
 *
 * IT ANSWERS THE SAME THING EVERY TIME. Whether the address is new, pending,
 * unsubscribed or already active, the response is identical. Anything else
 * turns a public endpoint into an "is this person subscribed" oracle, and the
 * honest-looking version of that error ("you're already subscribed") is the one
 * that leaks.
 *
 * AN ALREADY-ACTIVE ROW IS NEVER TOUCHED. Resetting it to pending would let
 * anyone unsubscribe a stranger by typing their address into the signup form.
 *
 * Auth: verify_jwt=false; no caller identity exists to check. Bounded by
 * checkRateLimit (5 per 15 minutes per IP).
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { renderEmail } from "../_shared/emailLayout.ts";
import { getSiteUrl } from "../_shared/siteUrl.ts";
import { sendEmail } from "../_shared/email.ts";
import { escapeHtml } from "../_shared/escapeHtml.ts";

const FROM_ADDRESS = "Des Moines Insider <hello@desmoinesinsider.com>";

/** Do not mail the same address again inside this window, however often it asks. */
const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * The one sentence this endpoint says, for every outcome. See the header: any
 * per-case wording makes it a subscription oracle.
 */
const GENERIC_ANSWER =
  "Almost there. If that address can receive mail from us, a confirmation link is on its way - click it and you're on the list.";

/** 48 lowercase hex characters, the shape newsletter_confirm_by_token validates. */
function newConfirmToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Deliberately strict rather than RFC-complete. This address is going to be
 * mailed; a shape that is merely *possible* under the RFC but that no real
 * mailbox uses is a bounce and a sender-reputation cost.
 */
function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!/^[^\s@,;:<>"']+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return null;
  return email;
}

const ALLOWED_SOURCES = ["website", "popup", "footer", "checkout", "hero"];

function buildConfirmEmail(email: string, confirmUrl: string, firstName: string | null) {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
  const bodyHtml = `
    <h1 style="font-size:20px;margin:0 0 16px;">Confirm your subscription</h1>
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">
      Someone (we hope you) asked to get the Des Moines Insider newsletter at this
      address. Click below and we'll start sending it.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${escapeHtml(confirmUrl)}"
         style="display:inline-block;padding:12px 20px;border-radius:8px;background:#b45309;color:#ffffff;text-decoration:none;font-weight:600;">
        Confirm my subscription
      </a>
    </p>
    <p style="margin:0 0 16px;color:#555;">
      If that wasn't you, do nothing. Without this click we will not send you the
      newsletter, and we'll drop the request.
    </p>
    <p style="margin:0;color:#555;font-size:13px;word-break:break-all;">
      Or paste this into your browser: ${escapeHtml(confirmUrl)}
    </p>`;

  const bodyText = [
    "Confirm your subscription",
    "",
    firstName ? `Hi ${firstName},` : "Hi,",
    "",
    "Someone (we hope you) asked to get the Des Moines Insider newsletter at this address.",
    "Open the link below and we'll start sending it.",
    "",
    confirmUrl,
    "",
    "If that wasn't you, do nothing. Without this click we will not send you the newsletter,",
    "and we'll drop the request.",
  ].join("\n");

  // TRANSACTIONAL, not marketing: this is the message that establishes consent,
  // so it must not carry a marketing unsubscribe footer for a subscription that
  // does not exist yet. It is also why it is not suppressible by an opt-out.
  // No unsubscribe token is passed, and none is needed: the transactional
  // footer carries no unsubscribe link, which is correct for the message that
  // ESTABLISHES the subscription. There is nothing yet to opt out of.
  return renderEmail({
    bodyHtml,
    bodyText,
    category: "transactional",
    recipient: { email },
  });
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // The only thing standing between this and a mail cannon, since there is no
  // caller to authenticate.
  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many signup attempts. Please try again in a few minutes.",
  });
  if (!rateLimit.success && rateLimit.response) {
    return addRateLimitHeaders(rateLimit.response, rateLimit);
  }

  const ok = () =>
    addRateLimitHeaders(
      new Response(JSON.stringify({ ok: true, message: GENERIC_ANSWER }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      rateLimit,
    );

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);

    // A malformed address is the one case worth answering differently: the
    // person can fix it, and it tells an attacker nothing they did not type.
    if (!email) {
      return new Response(
        JSON.stringify({ error: "That doesn't look like an email address." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const firstName =
      typeof body.firstName === "string" && body.firstName.trim()
        ? body.firstName.trim().slice(0, 80)
        : null;
    const source = ALLOWED_SOURCES.includes(body.source) ? body.source : "website";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: existing, error: readError } = await supabase
      .from("newsletter_subscribers")
      .select("id, status, confirm_sent_at")
      .eq("email", email)
      .maybeSingle();

    if (readError) {
      console.error("[newsletter-subscribe] subscriber read failed", readError);
      return new Response(
        JSON.stringify({ error: "We couldn't sign you up just now. Please try again in a moment." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Already a confirmed subscriber: nothing to do, and say nothing about it.
    if (existing?.status === "active") return ok();

    // Asked again within the cooldown: the first mail is already in flight.
    if (
      existing?.confirm_sent_at &&
      Date.now() - new Date(existing.confirm_sent_at).getTime() < RESEND_COOLDOWN_MS
    ) {
      return ok();
    }

    const confirmToken = newConfirmToken();
    const utm = typeof body.utm === "object" && body.utm ? body.utm : {};
    const pick = (key: string) =>
      typeof (utm as Record<string, unknown>)[key] === "string"
        ? String((utm as Record<string, unknown>)[key]).slice(0, 200)
        : null;

    const row = {
      email,
      first_name: firstName,
      source,
      status: "pending",
      confirm_token: confirmToken,
      confirm_sent_at: new Date().toISOString(),
      // An address coming back from 'unsubscribed' is a fresh request, so the
      // old opt-out timestamp is cleared only when they CONFIRM, not here.
      preferences: body.preferences && typeof body.preferences === "object"
        ? body.preferences
        : undefined,
      user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      utm_source: pick("utm_source"),
      utm_medium: pick("utm_medium"),
      utm_campaign: pick("utm_campaign"),
      updated_at: new Date().toISOString(),
    };

    // onConflict on the UNIQUE(email) constraint is what makes resubscribing
    // possible at all - the old client-side insert could only ever 23505.
    const { error: writeError } = await supabase
      .from("newsletter_subscribers")
      .upsert(row, { onConflict: "email" });

    if (writeError) {
      console.error("[newsletter-subscribe] upsert failed", writeError);
      return new Response(
        JSON.stringify({ error: "We couldn't sign you up just now. Please try again in a moment." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const confirmUrl = `${getSiteUrl()}/newsletter/confirm?token=${confirmToken}`;
    const rendered = buildConfirmEmail(email, confirmUrl, firstName);

    const sent = await sendEmail(
      {
        to: email,
        from: FROM_ADDRESS,
        subject: "Confirm your Des Moines Insider subscription",
        html: rendered.html,
        text: rendered.text,
        category: "transactional",
        template: "newsletter_confirm",
      },
      { supabase },
    );

    if (!sent.ok && sent.provider === "none") {
      // The row is pending and will never be confirmed, which is the correct
      // resting state for "we could not ask". Loud in the logs, generic to the
      // caller - a missing key is not theirs to know about.
      console.error("[newsletter-subscribe] no email provider configured - no confirmation sent");
      return ok();
    }

    if (!sent.ok) {
      // Clear the send timestamp so the cooldown does not lock the address out
      // of a retry it never got the benefit of. A suppressed (bounced)
      // address lands here too and says nothing different to the caller.
      await supabase
        .from("newsletter_subscribers")
        .update({ confirm_sent_at: null })
        .eq("email", email);
      console.error("[newsletter-subscribe] confirmation not sent:", sent.error);
    }

    return ok();
  } catch (error) {
    console.error("[newsletter-subscribe] unhandled", error);
    return new Response(
      JSON.stringify({ error: "We couldn't sign you up just now. Please try again in a moment." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
