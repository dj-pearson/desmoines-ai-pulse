/**
 * subscription-lifecycle (WEB-AUTO-013)
 *
 * Daily driver for web-billed subscription dunning + retention, so failed
 * payments, renewals, and churn are handled by machines. For each WEB
 * subscription (Apple/Google excluded — their stores own dunning):
 *   - renewal reminder 7 days before period end (once per period),
 *   - payment-failed email while past_due (frequency-capped to once/day),
 *   - automatic downgrade once past_due exceeds the grace window (+ inform),
 *   - one win-back email per lapse after cancellation.
 * Every transition is logged to subscription_events (MRR/churn analytics) and
 * the run is recorded through the jobRunner. Stripe's smart-retries config is
 * the retry ladder; these emails sit at each state.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { runJob } from '../_shared/jobRunner.ts';
import { renderEmail, SITE_URL } from '../_shared/emailLayout.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';

// deno-lint-ignore no-explicit-any
type Supa = any;

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM = 'Des Moines Insider <billing@desmoinesinsider.com>';
const DAY = 24 * 60 * 60 * 1000;
const GRACE_DAYS = 7;       // past-due grace before auto-downgrade
const WINBACK_WINDOW = 3;   // days after cancellation to send a win-back

async function sendEmail(
  to: string,
  subject: string,
  bodyHtml: string,
  bodyText: string,
  category: 'transactional' | 'marketing',
): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false;
  const { html, text } = renderEmail({ bodyHtml, bodyText, recipient: { email: to }, category });
  try {
    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** True if an event of this type was already logged for the user since `since`. */
async function alreadyLogged(
  supabase: Supa,
  userId: string,
  eventType: string,
  since: string,
): Promise<boolean> {
  try {
    const { count } = await supabase
      .from('subscription_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', eventType)
      .gte('created_at', since);
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

async function logEvent(
  supabase: Supa,
  row: { user_id: string; subscription_id: string; event_type: string; platform: string; details?: unknown },
) {
  try {
    await supabase.from('subscription_events').insert({
      user_id: row.user_id,
      subscription_id: row.subscription_id,
      event_type: row.event_type,
      platform: row.platform,
      details: row.details ?? null,
    });
  } catch {
    // log failures are non-fatal
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase: Supa = createClient(url, serviceKey);

  const job = await runJob('subscription-lifecycle', async (ctx) => {
    const now = Date.now();
    const counts = { reminders: 0, paymentFailed: 0, downgraded: 0, winbacks: 0 };

    // Web-billed subscriptions only (platform 'web' or legacy NULL).
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, status, platform, current_period_end, canceled_at, cancel_at_period_end')
      .or('platform.eq.web,platform.is.null')
      .limit(2000);
    if (error) throw error;
    const subs = (data || []) as Record<string, string | boolean | null>[];

    // Resolve emails in bulk from profiles.
    const userIds = [...new Set(subs.map((s) => s.user_id as string).filter(Boolean))];
    const emailById = new Map<string, string>();
    if (userIds.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, email')
          .in('user_id', userIds);
        for (const p of (profiles || []) as { user_id: string; email: string | null }[]) {
          if (p.email) emailById.set(p.user_id, p.email);
        }
      } catch {
        // no emails -> emails simply won't send (events still log)
      }
    }

    for (const sub of subs) {
      const userId = sub.user_id as string;
      const subId = sub.id as string;
      const platform = (sub.platform as string) || 'web';
      const email = emailById.get(userId) || '';
      const status = sub.status as string;
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end as string).getTime() : 0;
      const canceledAt = sub.canceled_at ? new Date(sub.canceled_at as string).getTime() : 0;

      // 1. Pre-renewal reminder: active, auto-renewing, ~7 days out, once/period.
      if (status === 'active' && !sub.cancel_at_period_end && periodEnd) {
        const daysOut = (periodEnd - now) / DAY;
        if (daysOut > 0 && daysOut <= 7) {
          const periodStart = new Date(periodEnd - 31 * DAY).toISOString();
          if (!(await alreadyLogged(supabase, userId, 'renewal_reminder', periodStart))) {
            const when = new Date(periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
            await sendEmail(
              email,
              'Your Des Moines Insider membership renews soon',
              `<h2>Your membership renews on ${when}</h2><p>No action needed — we'll keep your Insider perks running. Manage your plan anytime in your <a href="${SITE_URL}/profile?tab=settings">account settings</a>.</p>`,
              `Your membership renews on ${when}. Manage your plan: ${SITE_URL}/profile?tab=settings`,
              'transactional',
            );
            await logEvent(supabase, { user_id: userId, subscription_id: subId, event_type: 'renewal_reminder', platform, details: { periodEnd: sub.current_period_end } });
            counts.reminders++;
            ctx.processed(1);
          }
        }
      }

      // 2. Payment failed (past_due): nudge once/day with an update-payment link.
      if (status === 'past_due') {
        if (!(await alreadyLogged(supabase, userId, 'payment_failed', new Date(now - DAY).toISOString()))) {
          await sendEmail(
            email,
            'Action needed: your payment didn\'t go through',
            `<h2>We couldn't process your payment</h2><p>Please <a href="${SITE_URL}/profile?tab=settings">update your payment method</a> to keep your Insider perks. We'll retry automatically in the meantime.</p>`,
            `We couldn't process your payment. Update it here: ${SITE_URL}/profile?tab=settings`,
            'transactional',
          );
          await logEvent(supabase, { user_id: userId, subscription_id: subId, event_type: 'payment_failed', platform });
          counts.paymentFailed++;
          ctx.processed(1);
        }

        // 3. Auto-downgrade once past_due exceeds the grace window.
        if (periodEnd && now > periodEnd + GRACE_DAYS * DAY) {
          try {
            await supabase
              .from('user_subscriptions')
              .update({ status: 'canceled', canceled_at: new Date().toISOString() })
              .eq('id', subId);
            await sendEmail(
              email,
              'Your Insider membership has paused',
              `<h2>Your membership has paused</h2><p>We couldn't collect payment after several tries, so your account is back on the free plan. <a href="${SITE_URL}/pricing">Reactivate anytime</a> to restore your perks.</p>`,
              `Your membership paused (payment couldn't be collected). Reactivate: ${SITE_URL}/pricing`,
              'transactional',
            );
            await logEvent(supabase, { user_id: userId, subscription_id: subId, event_type: 'downgraded', platform, details: { reason: 'dunning_exhausted' } });
            counts.downgraded++;
            ctx.processed(1);
          } catch {
            ctx.failed(1);
          }
        }
      }

      // 4. Win-back: one per lapse, shortly after cancellation.
      if (status === 'canceled' && canceledAt) {
        const daysSince = (now - canceledAt) / DAY;
        if (daysSince >= 1 && daysSince <= WINBACK_WINDOW) {
          if (!(await alreadyLogged(supabase, userId, 'winback', new Date(canceledAt).toISOString()))) {
            await sendEmail(
              email,
              'We saved your spot — come back to Insider',
              `<h2>Come back to Insider</h2><p>Your favorites and trips are still here. <a href="${SITE_URL}/pricing">Resubscribe</a> to pick up where you left off.</p>`,
              `Come back to Insider — resubscribe: ${SITE_URL}/pricing`,
              'marketing',
            );
            await logEvent(supabase, { user_id: userId, subscription_id: subId, event_type: 'winback', platform });
            counts.winbacks++;
            ctx.processed(1);
          }
        }
      }
    }

    ctx.meta({ ...counts, scanned: subs.length });
    return counts;
  });

  return new Response(JSON.stringify({ success: job.ok, ...job.result }), {
    status: job.ok ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
