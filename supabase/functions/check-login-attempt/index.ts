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

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ESCALATION_MULTIPLIER = 2; // Double lockout on repeated violations
const MAX_LOCKOUT_MS = 60 * 60 * 1000; // 1 hour max

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
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] ||
      req.headers.get('x-real-ip') || 'unknown';

    if (action === 'record_success') {
      // Clear failed attempts on successful login
      await supabase
        .from('login_attempts')
        .delete()
        .eq('email', normalizedEmail);

      return new Response(
        JSON.stringify({ allowed: true, attemptsRemaining: MAX_ATTEMPTS }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'record_failure') {
      // Record a failed attempt
      await supabase
        .from('login_attempts')
        .insert({
          email: normalizedEmail,
          client_info: clientInfo,
          client_ip: clientIp,
          attempted_at: new Date().toISOString(),
        });
    }

    // Check current lockout status (for both 'check' and 'record_failure')
    const windowStart = new Date(Date.now() - LOCKOUT_DURATION_MS).toISOString();

    const { data: attempts, error: queryError } = await supabase
      .from('login_attempts')
      .select('attempted_at')
      .eq('email', normalizedEmail)
      .gte('attempted_at', windowStart)
      .order('attempted_at', { ascending: false });

    if (queryError) {
      console.error('Failed to query login attempts:', queryError);
      // Fail open — allow the attempt if we can't check
      return new Response(
        JSON.stringify({ allowed: true, attemptsRemaining: MAX_ATTEMPTS }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const recentAttempts = attempts?.length || 0;

    if (recentAttempts >= MAX_ATTEMPTS) {
      // Calculate lockout duration with escalation
      const violationCount = Math.floor(recentAttempts / MAX_ATTEMPTS);
      const escalatedDuration = Math.min(
        LOCKOUT_DURATION_MS * Math.pow(ESCALATION_MULTIPLIER, violationCount - 1),
        MAX_LOCKOUT_MS,
      );

      // Check if lockout has expired
      const mostRecentAttempt = attempts![0]?.attempted_at;
      if (mostRecentAttempt) {
        const timeSinceLastAttempt = Date.now() - new Date(mostRecentAttempt).getTime();
        if (timeSinceLastAttempt < escalatedDuration) {
          const lockoutSeconds = Math.ceil((escalatedDuration - timeSinceLastAttempt) / 1000);
          return new Response(
            JSON.stringify({
              allowed: false,
              lockoutSeconds,
              attemptsRemaining: 0,
              message: `Account temporarily locked. Try again in ${Math.ceil(lockoutSeconds / 60)} minutes.`,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    }

    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - recentAttempts);

    return new Response(
      JSON.stringify({
        allowed: true,
        attemptsRemaining,
      }),
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
