/**
 * subscription-lifecycle (WEB-AUTO-013)
 *
 * Daily driver for web-billed subscription dunning + retention. For each WEB
 * subscription (Apple/Google excluded - their stores own dunning):
 *   - renewal reminder 7 days before period end (once per period),
 *   - payment-failed email while past_due and still in grace (once a day),
 *   - once grace is over, the Stripe subscription is CANCELLED IN STRIPE and
 *     customer.subscription.deleted writes the row (one writer, one clock),
 *   - one win-back email per lapse after cancellation, for members who have
 *     not opted out of marketing.
 * The decisions live in ./policy.ts, pure and tested; this file reads, sends
 * and writes. Every transition is logged to subscription_events and the run
 * is recorded through the jobRunner.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { runJob } from '../_shared/jobRunner.ts';
import { renderEmail, SITE_URL } from '../_shared/emailLayout.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import {
  DAY_MS,
  lifecycleActions,
  lifecycleEmail,
  manageUrlFor,
  marketingAllowedFrom,
  planLabel,
  type LifecycleAction,
  type LifecycleRow,
} from './policy.ts';

// deno-lint-ignore no-explicit-any
type Supa = any;

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM = 'Des Moines Insider <billing@desmoinesinsider.com>';
const DAY = DAY_MS;

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

/**
 * True if an event of this type was already logged for the user since `since`.
 *
 * FAILS CLOSED, and this is the whole point of the function. It returned
 * `(count ?? 0) > 0` with the error discarded, and its catch returned false, so
 * an unreadable count meant "not yet sent" - the permissive branch of an
 * idempotency guard. This gates three emails: renewal_reminder, payment_failed
 * and a `winback` MARKETING send. The job is scheduled, so a persistent read
 * failure re-sent the same email to the same person every single run.
 *
 * Suppressing one cycle costs a delayed email that the next successful run will
 * send. The other direction mails somebody repeatedly, including marketing they
 * may have opted out of.
 */
async function alreadyLogged(
  supabase: Supa,
  userId: string,
  eventType: string,
  since: string,
): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('subscription_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', eventType)
      .gte('created_at', since);
    if (error) {
      console.error(`[subscription-lifecycle] alreadyLogged(${eventType}) failed:`, error.message);
      return true; // cannot prove it was not sent - do not send
    }
    return (count ?? 0) > 0;
  } catch (err) {
    console.error(`[subscription-lifecycle] alreadyLogged(${eventType}) threw:`, String(err));
    return true;
  }
}

/**
 * Returns whether the event was recorded. Not fatal either way, but no longer
 * silent: this ledger is what alreadyLogged dedupes on, so an unrecorded send
 * is one the next run may repeat.
 */
async function logEvent(
  supabase: Supa,
  row: { user_id: string; subscription_id: string; event_type: string; platform: string; details?: unknown },
): Promise<boolean> {
  try {
    const { error } = await supabase.from('subscription_events').insert({
      user_id: row.user_id,
      subscription_id: row.subscription_id,
      event_type: row.event_type,
      platform: row.platform,
      details: row.details ?? null,
    });
    if (error) {
      console.error(`[subscription-lifecycle] logEvent(${row.event_type}) failed:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[subscription-lifecycle] logEvent(${row.event_type}) threw:`, String(err));
    return false;
  }
}

/**
 * Ends a Stripe subscription whose grace is over. True when it is cancelled,
 * including when Stripe says it already was (a lost deleted webhook must not
 * make every later run fail on the same row).
 */
async function cancelInStripe(stripe: InstanceType<typeof Stripe>, stripeSubscriptionId: string): Promise<boolean> {
  try {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
    return true;
  } catch (cancelError) {
    try {
      const current = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      if (current.status === 'canceled') return true;
    } catch {
      // fall through to the original error
    }
    console.error(`[subscription-lifecycle] Stripe cancel failed for ${stripeSubscriptionId}:`, String(cancelError));
    return false;
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // Runs as service_role and had no caller check. verify_jwt defaults to true,
  // which only means "a valid Supabase JWT" - the anon key is one.
  // pg_cron is the only caller (20260620000007, Bearer <service_role_key>),
  // which requireAdminOrApiKey accepts.
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase: Supa = createClient(url, serviceKey);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2023-10-16' }) : null;

  const job = await runJob('subscription-lifecycle', async (ctx) => {
    const now = Date.now();
    const counts = { reminders: 0, paymentFailed: 0, downgraded: 0, winbacks: 0, cancelFailed: 0 };

    // Web-billed subscriptions only (platform 'web' or legacy NULL). policy.ts
    // refuses store rows as well, so a widened query cannot cancel one.
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, status, platform, current_period_end, canceled_at, cancel_at_period_end, stripe_subscription_id, plan:subscription_plans(name, display_name)')
      .or('platform.eq.web,platform.is.null')
      .limit(2000);
    if (error) throw error;
    const subs = (data || []) as Array<LifecycleRow & { plan?: { name?: string | null; display_name?: string | null } | null }>;

    // Emails and marketing consent in bulk from profiles.
    const userIds = [...new Set(subs.map((s) => s.user_id).filter(Boolean))];
    const profileById = new Map<string, { email: string | null; lifecycle_signals: unknown }>();
    let profilesOk = true;
    if (userIds.length > 0) {
      try {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, email, lifecycle_signals')
          .in('user_id', userIds);
        if (profilesError) {
          profilesOk = false;
          console.error('[subscription-lifecycle] profiles read failed, no email will send this run:', profilesError.message);
        }
        for (const p of (profiles || []) as { user_id: string; email: string | null; lifecycle_signals: unknown }[]) {
          profileById.set(p.user_id, { email: p.email, lifecycle_signals: p.lifecycle_signals });
        }
      } catch (err) {
        profilesOk = false;
        console.error('[subscription-lifecycle] profiles read threw:', String(err));
      }
    }

    for (const sub of subs) {
      const userId = sub.user_id;
      const subId = sub.id;
      const platform = sub.platform || 'web';
      const profile = profileById.get(userId);
      const email = profile?.email || '';
      const marketingAllowed = marketingAllowedFrom(profile?.lifecycle_signals, profilesOk && !!profile);
      const emailCtx = {
        planName: planLabel(sub.plan),
        manageUrl: manageUrlFor(sub.platform, SITE_URL),
        siteUrl: SITE_URL,
      };

      for (const action of lifecycleActions(sub, now, { marketingAllowed })) {
        const message = lifecycleEmail(action, emailCtx);
        const send = () =>
          message
            ? sendEmail(email, message.subject, message.html, message.text, message.category)
            : Promise.resolve(false);

        switch (action.kind) {
          case 'renewal_reminder': {
            const periodStart = new Date(action.periodEnd - 31 * DAY).toISOString();
            if (await alreadyLogged(supabase, userId, 'renewal_reminder', periodStart)) break;
            // Logged only once it actually went: an unsent reminder is retried
            // tomorrow instead of being recorded as sent.
            if (!(await send())) break;
            await logEvent(supabase, { user_id: userId, subscription_id: subId, event_type: 'renewal_reminder', platform, details: { periodEnd: sub.current_period_end } });
            counts.reminders++;
            ctx.processed(1);
            break;
          }

          case 'payment_failed': {
            if (await alreadyLogged(supabase, userId, 'payment_failed', new Date(now - DAY).toISOString())) break;
            if (!(await send())) break;
            await logEvent(supabase, { user_id: userId, subscription_id: subId, event_type: 'payment_failed', platform });
            counts.paymentFailed++;
            ctx.processed(1);
            break;
          }

          case 'cancel_in_stripe':
          case 'expire_locally': {
            const since = sub.current_period_end ?? new Date(now - 60 * DAY).toISOString();
            if (await alreadyLogged(supabase, userId, 'downgraded', since)) break;

            let ended = false;
            if (action.kind === 'cancel_in_stripe') {
              if (!stripe) {
                console.error('[subscription-lifecycle] STRIPE_SECRET_KEY missing; cannot end dunning for', subId);
              } else {
                // The row is written by customer.subscription.deleted, not here.
                ended = await cancelInStripe(stripe, action.stripeSubscriptionId);
              }
            } else {
              // No Stripe subscription behind this web row, so no webhook will
              // ever end it. Checked, unlike the write this replaces.
              const { error: expireError } = await supabase
                .from('user_subscriptions')
                .update({ status: 'canceled', canceled_at: new Date(now).toISOString() })
                .eq('id', subId)
                .eq('status', 'past_due');
              if (expireError) {
                console.error(`[subscription-lifecycle] local expiry failed for ${subId}:`, expireError.message);
              } else {
                ended = true;
              }
            }

            if (!ended) {
              counts.cancelFailed++;
              ctx.failed(1);
              break;
            }

            const emailed = await send();
            await logEvent(supabase, {
              user_id: userId,
              subscription_id: subId,
              event_type: 'downgraded',
              platform,
              details: { reason: 'dunning_exhausted', via: action.kind, emailed },
            });
            counts.downgraded++;
            ctx.processed(1);
            break;
          }

          case 'winback': {
            if (await alreadyLogged(supabase, userId, 'winback', new Date(action.canceledAt).toISOString())) break;
            if (!(await send())) break;
            await logEvent(supabase, { user_id: userId, subscription_id: subId, event_type: 'winback', platform });
            counts.winbacks++;
            ctx.processed(1);
            break;
          }

          default: {
            const unreachable: never = action;
            console.error('[subscription-lifecycle] unknown action', unreachable as LifecycleAction);
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
