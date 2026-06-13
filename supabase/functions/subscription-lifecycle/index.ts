/**
 * subscription-lifecycle (WEB-AUTO-013)
 *
 * Daily scheduled job that handles the full web-subscription lifecycle without
 * a human:
 *   - Pre-renewal reminder ~7 days before current_period_end.
 *   - Dunning ladder for past_due subscriptions (escalating emails at day
 *     0 / 3 / 7), each with an update-payment link.
 *   - Automatic downgrade to Free after the final failure window, with the
 *     user informed.
 *   - One-per-lapse win-back email after a cancellation.
 *
 * WEB-ONLY: every query is scoped to platform='web'. Apple/Google-billed
 * subscriptions own their own dunning via the stores, so they are excluded.
 *
 * Every transition + comm is appended to subscription_events (audit + the
 * frequency-cap source of truth). Runs report through the WEB-AUTO-001 jobRunner.
 *
 * Stripe smart retries (configured in the Stripe dashboard) drive the actual
 * card re-attempts; this job layers our customer comms + entitlement downgrade
 * on top of each retry state.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { requireAdminOrApiKey } from '../_shared/apiKeyAuth.ts';
import { runJob } from '../_shared/jobRunner.ts';
import { renderEmail, SITE_URL } from '../_shared/emailLayout.ts';
import { escapeHtml } from '../_shared/escapeHtml.ts';

const DAY = 24 * 60 * 60 * 1000;
const RENEWAL_REMINDER_DAYS = 7;
// Days-past-due at which the 1st/2nd/3rd dunning email is sent.
const DUNNING_EMAIL_DAYS = [0, 3, 7];
// Days-past-due after which the subscription is downgraded to Free.
const FINAL_DOWNGRADE_DAY = 10;
// Win-back is sent between (canceled_at + DELAY) and (canceled_at + WINDOW).
const WINBACK_DELAY_DAYS = 1;
const WINBACK_WINDOW_DAYS = 14;

const MANAGE_URL = `${SITE_URL}/subscription`;

interface PlanInfo {
  id: string;
  name: string;
  display_name: string;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, serviceKey);
  const resendKey = Deno.env.get('RESEND_API_KEY');

  const job = await runJob('subscription-lifecycle', async (ctx) => {
    // ---- Pause flag -------------------------------------------------------
    const { data: pauseRow } = await supabase
      .from('system_settings')
      .select('settings')
      .eq('setting_type', 'subscription_lifecycle')
      .maybeSingle();
    const paused = (pauseRow as { settings?: { paused?: boolean } } | null)?.settings?.paused === true;
    if (paused) {
      ctx.meta({ paused: true });
      return { paused: true };
    }

    // ---- Plan lookup ------------------------------------------------------
    const { data: planRows } = await supabase
      .from('subscription_plans')
      .select('id, name, display_name');
    const plans = (planRows ?? []) as PlanInfo[];
    const planById = new Map(plans.map((p) => [p.id, p]));
    const freePlan = plans.find((p) => p.name === 'free') ?? null;

    const counts = {
      renewalReminders: 0,
      dunningEmails: 0,
      downgrades: 0,
      winbacks: 0,
      emailFailures: 0,
      skippedNoEmail: 0,
    };

    // Resolve a user's email + (best-effort) unsubscribe token.
    const recipientCache = new Map<string, { email: string | null; token: string | null }>();
    async function getRecipient(userId: string | null): Promise<{ email: string | null; token: string | null }> {
      if (!userId) return { email: null, token: null };
      const cached = recipientCache.get(userId);
      if (cached) return cached;
      let email: string | null = null;
      try {
        const { data } = await supabase.auth.admin.getUserById(userId);
        email = data?.user?.email ?? null;
      } catch (_e) {
        email = null;
      }
      let token: string | null = null;
      if (email) {
        const { data: sub } = await supabase
          .from('newsletter_subscribers')
          .select('unsubscribe_token')
          .eq('email', email.toLowerCase().trim())
          .maybeSingle();
        token = (sub as { unsubscribe_token?: string } | null)?.unsubscribe_token ?? null;
      }
      const result = { email, token };
      recipientCache.set(userId, result);
      return result;
    }

    async function recordEvent(entry: Record<string, unknown>): Promise<void> {
      try {
        await supabase.from('subscription_events').insert(entry);
      } catch (e) {
        console.error('[subscription-lifecycle] failed to record event:', e);
      }
    }

    // Send a lifecycle email. Returns true on success. Records nothing — the
    // caller records the subscription_event so the audit/cap stays accurate.
    async function sendEmail(opts: {
      to: string;
      token: string | null;
      subject: string;
      bodyHtml: string;
      bodyText: string;
      category: 'marketing' | 'transactional';
      tag: string;
    }): Promise<boolean> {
      if (!resendKey) {
        console.warn('[subscription-lifecycle] RESEND_API_KEY not set — skipping send');
        return false;
      }
      const rendered = renderEmail({
        bodyHtml: opts.bodyHtml,
        bodyText: opts.bodyText,
        category: opts.category,
        recipient: { email: opts.to, unsubscribeToken: opts.token, preferencesPath: '/profile?tab=settings' },
      });
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'Des Moines Insider <billing@desmoinesinsider.com>',
            to: [opts.to],
            subject: opts.subject,
            html: rendered.html,
            text: rendered.text,
            headers: rendered.listUnsubscribe
              ? {
                  'List-Unsubscribe': rendered.listUnsubscribe,
                  'List-Unsubscribe-Post': rendered.listUnsubscribePost ?? '',
                }
              : undefined,
            tags: [{ name: 'type', value: opts.tag }],
          }),
        });
        if (!res.ok) {
          console.error('[subscription-lifecycle] Resend error:', await res.text());
          return false;
        }
        return true;
      } catch (e) {
        console.error('[subscription-lifecycle] send failed:', e);
        return false;
      }
    }

    function ctaButton(label: string): string {
      return `<div style="text-align:center;margin:28px 0;">
        <a href="${MANAGE_URL}" style="background:#DC143C;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-size:16px;font-weight:bold;display:inline-block;">${escapeHtml(label)}</a>
      </div>`;
    }

    const nowMs = Date.now();

    // =====================================================================
    // STAGE A — Pre-renewal reminders (~7 days before current_period_end)
    // =====================================================================
    {
      const windowStart = new Date(nowMs + (RENEWAL_REMINDER_DAYS - 0.5) * DAY).toISOString();
      const windowEnd = new Date(nowMs + (RENEWAL_REMINDER_DAYS + 0.5) * DAY).toISOString();
      const { data: dueSoon } = await supabase
        .from('user_subscriptions')
        .select('id, user_id, plan_id, status, platform, stripe_subscription_id, current_period_end, cancel_at_period_end')
        .eq('platform', 'web')
        .in('status', ['active', 'trialing'])
        .eq('cancel_at_period_end', false)
        .gte('current_period_end', windowStart)
        .lte('current_period_end', windowEnd)
        .limit(200);

      for (const sub of (dueSoon ?? []) as Record<string, unknown>[]) {
        const periodEnd = sub.current_period_end as string;
        // One reminder per renewal period.
        const { data: already } = await supabase
          .from('subscription_events')
          .select('id')
          .eq('stripe_subscription_id', (sub.stripe_subscription_id as string) ?? '')
          .eq('event_type', 'renewal_reminder_sent')
          .contains('metadata', { period_end: periodEnd })
          .limit(1)
          .maybeSingle();
        if (already) continue;

        const { email, token } = await getRecipient(sub.user_id as string);
        if (!email) { counts.skippedNoEmail++; continue; }

        const plan = planById.get(sub.plan_id as string);
        const planName = plan?.display_name ?? 'subscription';
        const renewalDate = new Date(periodEnd).toLocaleDateString('en-US', {
          timeZone: 'America/Chicago', year: 'numeric', month: 'long', day: 'numeric',
        });

        const bodyHtml = `
          <h1 style="color:#2D1B69;font-size:22px;margin:0 0 16px;">Your ${escapeHtml(planName)} plan renews soon</h1>
          <p style="font-size:16px;">Hi there — just a heads up that your <strong>${escapeHtml(planName)}</strong> membership will automatically renew on <strong>${escapeHtml(renewalDate)}</strong>.</p>
          <p style="font-size:16px;">No action is needed if you'd like to keep enjoying your member benefits. You can review or update your plan and payment method anytime.</p>
          ${ctaButton('Manage my subscription')}
        `;
        const bodyText = `Your ${planName} plan renews soon\n\nYour ${planName} membership will automatically renew on ${renewalDate}. No action is needed to keep your benefits.\n\nManage your subscription: ${MANAGE_URL}`;

        const sent = await sendEmail({
          to: email, token, category: 'transactional', tag: 'subscription_renewal_reminder',
          subject: `Your ${planName} plan renews on ${renewalDate}`,
          bodyHtml, bodyText,
        });
        if (!sent) { counts.emailFailures++; continue; }

        counts.renewalReminders++;
        await recordEvent({
          user_id: sub.user_id, subscription_id: sub.id, stripe_subscription_id: sub.stripe_subscription_id,
          platform: 'web', event_type: 'renewal_reminder_sent', to_status: sub.status,
          metadata: { period_end: periodEnd, days_out: RENEWAL_REMINDER_DAYS },
        });
      }
    }

    // =====================================================================
    // STAGE B — Dunning ladder + final-failure downgrade (past_due)
    // =====================================================================
    {
      const { data: pastDue } = await supabase
        .from('user_subscriptions')
        .select('id, user_id, plan_id, status, platform, stripe_subscription_id, current_period_end, updated_at')
        .eq('platform', 'web')
        .eq('status', 'past_due')
        .limit(200);

      for (const sub of (pastDue ?? []) as Record<string, unknown>[]) {
        // Lapse start = when the failed charge was attempted (period end), with
        // updated_at as a fallback when period end is missing.
        const lapseStart = (sub.current_period_end as string) || (sub.updated_at as string);
        if (!lapseStart) continue;
        const daysPastDue = Math.floor((nowMs - new Date(lapseStart).getTime()) / DAY);
        if (daysPastDue < 0) continue;

        const { email, token } = await getRecipient(sub.user_id as string);
        const plan = planById.get(sub.plan_id as string);
        const planName = plan?.display_name ?? 'subscription';

        // ---- Final-failure downgrade ----
        if (daysPastDue >= FINAL_DOWNGRADE_DAY && freePlan) {
          const { data: alreadyDowngraded } = await supabase
            .from('subscription_events')
            .select('id')
            .eq('subscription_id', sub.id as string)
            .eq('event_type', 'downgraded')
            .gte('created_at', new Date(new Date(lapseStart).getTime()).toISOString())
            .limit(1)
            .maybeSingle();

          if (!alreadyDowngraded) {
            await supabase
              .from('user_subscriptions')
              .update({ status: 'canceled', plan_id: freePlan.id, cancel_at_period_end: false })
              .eq('id', sub.id as string)
              .eq('platform', 'web');

            counts.downgrades++;
            await recordEvent({
              user_id: sub.user_id, subscription_id: sub.id, stripe_subscription_id: sub.stripe_subscription_id,
              platform: 'web', event_type: 'downgraded', from_status: 'past_due', to_status: 'canceled',
              metadata: { days_past_due: daysPastDue, previous_plan: planName },
            });

            if (email) {
              const bodyHtml = `
                <h1 style="color:#2D1B69;font-size:22px;margin:0 0 16px;">Your membership has been moved to Free</h1>
                <p style="font-size:16px;">We tried several times to renew your <strong>${escapeHtml(planName)}</strong> membership but couldn't process your payment, so your account has been moved to our <strong>Free</strong> plan.</p>
                <p style="font-size:16px;">You can pick up right where you left off — just add a working payment method to restore your member benefits.</p>
                ${ctaButton('Restore my membership')}
              `;
              const bodyText = `Your membership has been moved to Free\n\nWe couldn't process payment for your ${planName} membership, so your account is now on the Free plan. Restore your benefits anytime: ${MANAGE_URL}`;
              const sent = await sendEmail({
                to: email, token, category: 'transactional', tag: 'subscription_downgraded',
                subject: 'Your membership has been moved to the Free plan', bodyHtml, bodyText,
              });
              if (!sent) counts.emailFailures++;
            } else {
              counts.skippedNoEmail++;
            }
          }
          continue; // downgraded subs don't also get a dunning email this run
        }

        // ---- Escalating dunning email ----
        const targetStage = DUNNING_EMAIL_DAYS.filter((d) => daysPastDue >= d).length;
        if (targetStage === 0) continue;

        const { count: sentCount } = await supabase
          .from('subscription_events')
          .select('id', { count: 'exact', head: true })
          .eq('subscription_id', sub.id as string)
          .eq('event_type', 'dunning_email_sent')
          .gte('created_at', new Date(new Date(lapseStart).getTime()).toISOString());

        const emailsSent = sentCount ?? 0;
        if (emailsSent >= targetStage) continue; // already caught up for this stage

        if (!email) { counts.skippedNoEmail++; continue; }

        const stage = emailsSent + 1; // 1-based
        const urgency = stage >= 3
          ? `This is our final reminder before your ${escapeHtml(planName)} benefits are paused.`
          : `Your ${escapeHtml(planName)} benefits stay active while we retry, but please update your card to avoid any interruption.`;
        const bodyHtml = `
          <h1 style="color:#2D1B69;font-size:22px;margin:0 0 16px;">We couldn't process your payment</h1>
          <p style="font-size:16px;">We weren't able to renew your <strong>${escapeHtml(planName)}</strong> membership. ${urgency}</p>
          <p style="font-size:16px;">Updating your payment method only takes a moment.</p>
          ${ctaButton('Update payment method')}
        `;
        const bodyText = `We couldn't process your payment\n\nWe weren't able to renew your ${planName} membership. Update your payment method to avoid an interruption: ${MANAGE_URL}`;

        const sent = await sendEmail({
          to: email, token, category: 'transactional', tag: `subscription_dunning_${stage}`,
          subject: stage >= 3 ? 'Final notice: update your payment method' : 'Payment failed — please update your card',
          bodyHtml, bodyText,
        });
        if (!sent) { counts.emailFailures++; continue; }

        counts.dunningEmails++;
        await recordEvent({
          user_id: sub.user_id, subscription_id: sub.id, stripe_subscription_id: sub.stripe_subscription_id,
          platform: 'web', event_type: 'dunning_email_sent', to_status: 'past_due',
          metadata: { stage, days_past_due: daysPastDue },
        });
      }
    }

    // =====================================================================
    // STAGE C — Win-back after cancellation (one per lapse, frequency-capped)
    // =====================================================================
    {
      const winbackEligibleAfter = new Date(nowMs - WINBACK_WINDOW_DAYS * DAY).toISOString();
      const winbackEligibleBefore = new Date(nowMs - WINBACK_DELAY_DAYS * DAY).toISOString();
      const { data: canceled } = await supabase
        .from('user_subscriptions')
        .select('id, user_id, plan_id, status, platform, stripe_subscription_id, canceled_at')
        .eq('platform', 'web')
        .eq('status', 'canceled')
        .gte('canceled_at', winbackEligibleAfter)
        .lte('canceled_at', winbackEligibleBefore)
        .limit(200);

      for (const sub of (canceled ?? []) as Record<string, unknown>[]) {
        const canceledAt = sub.canceled_at as string;
        // One win-back per lapse: none since this cancellation.
        const { data: already } = await supabase
          .from('subscription_events')
          .select('id')
          .eq('subscription_id', sub.id as string)
          .eq('event_type', 'winback_sent')
          .gte('created_at', canceledAt)
          .limit(1)
          .maybeSingle();
        if (already) continue;

        const { email, token } = await getRecipient(sub.user_id as string);
        if (!email) { counts.skippedNoEmail++; continue; }

        const plan = planById.get(sub.plan_id as string);
        const planName = plan?.display_name ?? 'membership';

        const bodyHtml = `
          <h1 style="color:#2D1B69;font-size:22px;margin:0 0 16px;">We'd love to have you back</h1>
          <p style="font-size:16px;">Your <strong>${escapeHtml(planName)}</strong> membership has ended, and Des Moines keeps getting better — new events, restaurant openings, and local guides every week.</p>
          <p style="font-size:16px;">Come back anytime to unlock unlimited favorites, advanced filters, and an ad-free experience.</p>
          ${ctaButton('Reactivate my membership')}
          <p style="font-size:13px;color:#888;margin-top:8px;">This is a one-time offer email about your lapsed membership.</p>
        `;
        const bodyText = `We'd love to have you back\n\nYour ${planName} membership has ended. Reactivate anytime to unlock unlimited favorites, advanced filters, and an ad-free experience: ${MANAGE_URL}`;

        const sent = await sendEmail({
          to: email, token, category: 'marketing', tag: 'subscription_winback',
          subject: `We miss you at Des Moines Insider`, bodyHtml, bodyText,
        });
        if (!sent) { counts.emailFailures++; continue; }

        counts.winbacks++;
        await recordEvent({
          user_id: sub.user_id, subscription_id: sub.id, stripe_subscription_id: sub.stripe_subscription_id,
          platform: 'web', event_type: 'winback_sent', from_status: 'canceled',
          metadata: { canceled_at: canceledAt },
        });
      }
    }

    ctx.processed(counts.renewalReminders + counts.dunningEmails + counts.downgrades + counts.winbacks);
    ctx.failed(counts.emailFailures);
    ctx.meta(counts);
    return counts;
  });

  return new Response(JSON.stringify({ success: job.ok, ...job }), {
    status: job.ok ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
