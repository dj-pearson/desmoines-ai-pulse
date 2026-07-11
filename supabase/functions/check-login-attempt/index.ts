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
 *     Body: { email: string, action: "check" | "record_failure" | "record_success" }
 *     Returns: { allowed: boolean, lockoutSeconds?: number, attemptsRemaining?: number }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimit.ts';
import { renderEmail } from '../_shared/emailLayout.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';

// WEB-SEC-006 thresholds: lock on >10 failures for one email OR >5 from one IP
// within a 10-minute detection window; the lockout itself lasts 15 minutes.
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
    const { email, action } = await req.json();

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
      // Clear this email's failed attempts on successful login (resets counter).
      await supabase.from('login_attempts').delete().eq('email', normalizedEmail);

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

    const emailLocked = emailCount >= EMAIL_MAX_ATTEMPTS;
    const ipLocked = ipCount >= IP_MAX_ATTEMPTS;

    if (emailLocked || ipLocked) {
      // Lockout persists for 15 min after the most recent offending attempt.
      const mostRecent = (emailLocked ? emailAttempts[0] : ipAttempts[0])?.attempted_at;
      const sinceLast = mostRecent ? Date.now() - new Date(mostRecent).getTime() : LOCKOUT_DURATION_MS;

      if (sinceLast < LOCKOUT_DURATION_MS) {
        const lockoutSeconds = Math.ceil((LOCKOUT_DURATION_MS - sinceLast) / 1000);

        // Side effects only on the transition INTO lockout (the failure that
        // just crossed a threshold), so we don't spam logs/email every attempt.
        const justCrossed =
          action === 'record_failure' &&
          ((emailLocked && emailCount === EMAIL_MAX_ATTEMPTS) ||
            (ipLocked && ipCount === IP_MAX_ATTEMPTS));
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
