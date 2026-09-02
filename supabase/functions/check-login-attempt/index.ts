/**
 * Check Login Attempt — Server-side account lockout enforcement
 *
 * Validates whether a login attempt should be allowed based on server-side
 * failed attempt tracking. Syncs lockout state across all client devices.
 *
 * Called by iOS/Android/web clients BEFORE attempting Supabase auth.
 *
 * Endpoints:
 *   POST /check-login-attempt
 *     Body: { email: string, action: "check" | "record_failure" | "record_success",
 *             accessToken?: string }
 *     Returns: { allowed: boolean, lockoutSeconds?: number, attemptsRemaining?: number }
 *
 * WEB-SEC-027 — THE CALLER USED TO DECIDE WHO GETS LOCKED OUT.
 *
 * Every action here is reachable with nothing but the anon key, and two of them
 * were trusted:
 *
 *   record_failure  inserted a row for ANY address. The email-keyed lock fired
 *                   at 10 failures from anywhere, so ten POSTs locked a chosen
 *                   victim out of sign-in for fifteen minutes, repeatable for
 *                   as long as the attacker cared to keep going.
 *   record_success  deleted EVERY row for an address. A brute-forcer sent one
 *                   between batches and was never locked at all.
 *
 * Both are closed, in the only ways that survive an attacker who simply lies:
 *
 *   * The email-keyed lock is GONE. A lock that any stranger can trigger
 *     against a third party is a denial-of-service tool, and it was never a
 *     defence: an attacker guessing passwords has no reason to report their own
 *     failures. What remains is the IP-keyed lock, whose key comes from
 *     cf-connecting-ip on the request rather than from the body, so a caller can
 *     only ever throttle themselves.
 *   * record_success now demands PROOF: an access token, verified against
 *     GoTrue, whose address matches the one being cleared. Without it the call
 *     is accepted and changes nothing, so an old client cannot break and a
 *     forged reset cannot work.
 *
 * WHAT THIS IS AND IS NOT. This is defence in depth over one source address. It
 * is not the primary control and cannot be: any throttle that depends on a
 * client volunteering its own failures is opt-in for the one party that would
 * never opt in. The controls that actually bound credential stuffing here are
 * GoTrue's own rate limits on /token, which no client can decline, and bot
 * protection on the sign-in form (WEB-SEC-029, still open).
 *
 * BACKWARD COMPATIBILITY: the request shape, the response shape and the 200
 * status are unchanged for all three actions, so any shipped binary keeps
 * working. record_failure still records. record_success is accepted and, absent
 * proof, does nothing.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { renderEmail } from '../_shared/emailLayout.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';

// WEB-SEC-006 thresholds, as amended by WEB-SEC-027: lock on >5 failures from
// one IP within a 10-minute detection window; the lockout lasts 15 minutes.
//
// EMAIL_MAX_ATTEMPTS no longer gates anything. It is kept because it is the
// denominator of `attemptsRemaining` in the response, which shipped clients
// display, and removing it would change a field they read.
const EMAIL_MAX_ATTEMPTS = 10;
const IP_MAX_ATTEMPTS = 5;
const DETECTION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // Rate limit this endpoint itself
  const rateLimit = checkRateLimit(req, {
    max: 30,
    message: 'Too many lockout check requests.',
  });
  if (!rateLimit.success && rateLimit.response) {
    return rateLimit.response;
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { email, action, accessToken } = await req.json();

    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!['check', 'record_failure', 'record_success'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use: check, record_failure, record_success' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Normalize email for consistent lookups
    const normalizedEmail = email.trim().toLowerCase();
    const clientInfo = req.headers.get('x-client-info') || 'unknown';
    // Trusted client IP: CF first, never the spoofable leftmost XFF.
    const clientIp =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
      'unknown';

    if (action === 'record_success') {
      // WEB-SEC-027. This used to clear every row for the address on the
      // caller's say-so, which is a reset button for the brute-forcer it was
      // meant to catch. Clearing now requires a session that only a correct
      // password produces, and it clears this IP's rows rather than the
      // address's, so one user signing in cannot lift a lock somewhere else.
      const proved = await provesLogin(supabase, accessToken, normalizedEmail);

      if (proved) {
        let clear = supabase.from('login_attempts').delete().eq('email', normalizedEmail);
        if (clientIp !== 'unknown') clear = clear.eq('client_ip', clientIp);
        await clear;
      } else if (accessToken) {
        // A token that does not check out is worth a line in the log: the
        // no-token case is just an old client, this one is someone trying.
        console.warn('[check-login-attempt] record_success rejected: token did not match', {
          clientIp,
        });
      }

      // Always 200 with the same shape, proved or not, so no caller can tell
      // the difference and no old client breaks.
      return new Response(
        JSON.stringify({ allowed: true, attemptsRemaining: EMAIL_MAX_ATTEMPTS }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'record_failure') {
      await supabase.from('login_attempts').insert({
        email: normalizedEmail,
        client_info: clientInfo,
        client_ip: clientIp,
        attempted_at: new Date().toISOString(),
      });
    }

    // Detection window (last 10 min). Pull both email-keyed and IP-keyed
    // failures so we can lock on either signal.
    const windowStart = new Date(Date.now() - DETECTION_WINDOW_MS).toISOString();

    const [emailRes, ipRes] = await Promise.all([
      supabase
        .from('login_attempts')
        .select('attempted_at')
        .eq('email', normalizedEmail)
        .gte('attempted_at', windowStart)
        .order('attempted_at', { ascending: false }),
      clientIp !== 'unknown'
        ? supabase
            .from('login_attempts')
            .select('attempted_at')
            .eq('client_ip', clientIp)
            .gte('attempted_at', windowStart)
            .order('attempted_at', { ascending: false })
        : Promise.resolve({ data: [] as { attempted_at: string }[], error: null }),
    ]);

    if (emailRes.error || ipRes.error) {
      console.error('Failed to query login attempts:', emailRes.error ?? ipRes.error);
      // FAIL OPEN — never block the product on a lockout-DB outage.
      return new Response(
        JSON.stringify({ allowed: true, attemptsRemaining: EMAIL_MAX_ATTEMPTS }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const emailAttempts = emailRes.data ?? [];
    const ipAttempts = ipRes.data ?? [];
    const emailCount = emailAttempts.length;
    const ipCount = ipAttempts.length;

    // WEB-SEC-027: the email count is REPORTED and never LOCKS. Locking on it
    // meant ten anonymous POSTs could lock any address a stranger chose, and it
    // stopped no attacker, because reporting your own failures is voluntary.
    // The IP key comes from the request headers, so it can only ever throttle
    // the source that generated the failures.
    const emailLocked = false;
    const ipLocked = ipCount >= IP_MAX_ATTEMPTS;

    if (ipLocked) {
      // Lockout persists for 15 min after the most recent offending attempt.
      const mostRecent = ipAttempts[0]?.attempted_at;
      const sinceLast = mostRecent ? Date.now() - new Date(mostRecent).getTime() : LOCKOUT_DURATION_MS;

      if (sinceLast < LOCKOUT_DURATION_MS) {
        const lockoutSeconds = Math.ceil((LOCKOUT_DURATION_MS - sinceLast) / 1000);

        // Side effects only on the transition INTO lockout (the failure that
        // just crossed a threshold), so we don't spam logs/email every attempt.
        const justCrossed = action === 'record_failure' && ipCount === IP_MAX_ATTEMPTS;
        if (justCrossed) {
          await onLockout(supabase, {
            email: normalizedEmail,
            clientIp,
            clientInfo,
            emailLocked,
            ipLocked,
            emailCount,
            ipCount,
          });
        }

        // Non-enumerating message: identical regardless of whether the account
        // exists or which signal (email/IP) tripped.
        return new Response(
          JSON.stringify({
            allowed: false,
            lockoutSeconds,
            attemptsRemaining: 0,
            message: `Too many sign-in attempts. Please try again in ${Math.ceil(lockoutSeconds / 60)} minute(s).`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const attemptsRemaining = Math.max(0, EMAIL_MAX_ATTEMPTS - emailCount);

    return new Response(
      JSON.stringify({ allowed: true, attemptsRemaining }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('check-login-attempt error:', error);
    // Fail open
    return new Response(
      JSON.stringify({ allowed: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

/**
 * Does this caller hold a session that only the correct password could have
 * produced, for the address they are asking to clear?
 *
 * WEB-SEC-027. `getUser(token)` is a verified read against GoTrue, so a forged
 * or expired token fails here. The address comparison matters as much as the
 * signature: without it, any signed-in account could clear the lockout on
 * somebody else's.
 *
 * Never throws. An unreachable GoTrue means "not proved", which leaves the
 * counter where it is -- the safe direction for a lock.
 */
// deno-lint-ignore no-explicit-any
async function provesLogin(supabase: any, accessToken: unknown, email: string): Promise<boolean> {
  if (typeof accessToken !== 'string' || accessToken.length === 0) return false;
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user?.email) return false;
    return String(data.user.email).trim().toLowerCase() === email;
  } catch (err) {
    console.error('[check-login-attempt] token verification failed:', err);
    return false;
  }
}

/**
 * Side effects when an account/IP first crosses the lockout threshold:
 *  - immutable security_audit_logs row,
 *  - best-effort notification email to the account owner on email-keyed lockouts
 *    (only when a profile exists for the address — non-enumerating, no spam to
 *    random addresses). All steps are best-effort and never throw.
 */
// deno-lint-ignore no-explicit-any
async function onLockout(supabase: any, ctx: {
  email: string;
  clientIp: string;
  clientInfo: string;
  emailLocked: boolean;
  ipLocked: boolean;
  emailCount: number;
  ipCount: number;
}): Promise<void> {
  // 1) Audit log
  try {
    await supabase.from('security_audit_logs').insert({
      event_type: 'account_lockout',
      identifier: ctx.email,
      action: 'login_lockout',
      resource: 'login_attempts',
      severity: 'medium',
      ip_address: ctx.clientIp === 'unknown' ? null : ctx.clientIp,
      details: {
        email_locked: ctx.emailLocked,
        ip_locked: ctx.ipLocked,
        email_failures: ctx.emailCount,
        ip_failures: ctx.ipCount,
        client_info: ctx.clientInfo,
      },
    });
  } catch (err) {
    console.error('[check-login-attempt] audit insert failed:', err);
  }

  // 2) Notification email — only for email-keyed lockouts, only to a real
  // account owner. (IP-only lockouts have no single owner to notify.)
  if (!ctx.emailLocked) return;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('email', ctx.email)
      .maybeSingle();
    const recipient = profile?.email;
    if (!recipient) return; // no account -> send nothing (non-enumeration)

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      console.warn('[check-login-attempt] RESEND_API_KEY not set; skipping lockout email');
      return;
    }

    const bodyHtml =
      `<h1>Unusual sign-in activity</h1>` +
      `<p>We detected multiple failed sign-in attempts on your Des Moines Insider account and have temporarily locked sign-in for about 15 minutes to protect it.</p>` +
      `<p><strong>If this was you</strong>, just wait and try again, or reset your password.</p>` +
      `<p><strong>If this wasn't you</strong>, your password may be guessed — reset it as soon as the lockout clears and consider enabling two-factor authentication.</p>`;
    const bodyText =
      `Unusual sign-in activity\n\n` +
      `We detected multiple failed sign-in attempts on your Des Moines Insider account and temporarily locked sign-in for about 15 minutes.\n\n` +
      `If this was you, wait and try again or reset your password. If it wasn't, reset your password once the lockout clears and consider enabling two-factor authentication.`;

    const rendered = renderEmail({
      bodyHtml,
      bodyText,
      category: 'transactional',
      recipient: { email: recipient },
    });

    await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Des Moines Insider Security <security@desmoinesinsider.com>',
        to: [recipient],
        subject: 'Unusual sign-in activity on your account',
        html: rendered.html,
        text: rendered.text,
        tags: [{ name: 'type', value: 'security_notification' }, { name: 'event_type', value: 'account_lockout' }],
      }),
    });
  } catch (err) {
    console.error('[check-login-attempt] lockout email failed:', err);
  }
}
