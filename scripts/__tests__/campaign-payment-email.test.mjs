#!/usr/bin/env node
/**
 * The advertiser's payment confirmation actually leaves the building (WEB-ADS-005).
 *
 *   npx tsx scripts/__tests__/campaign-payment-email.test.mjs
 *
 * WHAT WENT WRONG AND WHY NOTHING CAUGHT IT. handleCampaignPayment inserted a
 * campaign_notifications row and stopped. A row is an in-app bell; it is not an
 * email. AdvertiseSuccess.tsx meanwhile said "A confirmation email has been
 * sent to your registered email address with your receipt and campaign
 * details", and neither half of that sentence was true - create-campaign-checkout
 * set no receipt_email either, so Stripe sent nothing.
 *
 * Every piece of this is a happy path that succeeds while delivering nothing, so
 * the checks below are weighted toward the send being ATTEMPTED with the right
 * address and the right link, not toward the HTML being pretty.
 *
 * WHY .mjs AND NOT A DENO TEST. _shared/campaignNotificationEmail.ts imports
 * only relative _shared modules, so it loads under tsx, and npm run test:offline
 * discovers it and CI runs it without Deno. Getting there needed one change to
 * siteUrl.ts, which read the bare `Deno` binding and so threw a ReferenceError
 * on import anywhere else - it now goes through globalThis. Nothing here is
 * shimmed; only the mail provider's fetch is stubbed, where it is stubbed.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const {
  campaignCtaUrl,
  campaignCtaLabel,
  buildCampaignEmailBodyHtml,
  buildCampaignEmailBodyText,
  sendCampaignEmail,
} = await import('../../supabase/functions/_shared/campaignNotificationEmail.ts');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

const SITE = 'https://desmoinesinsider.com';
const content = {
  title: 'Payment Confirmed: Fall Patio Push',
  message: 'Payment of $420.00 has been received. You can now upload your ad creatives.',
  campaignName: 'Fall Patio Push',
  campaignId: 'c-1',
  notificationType: 'payment_received',
  siteUrl: SITE,
};

console.log('\nwhere payment_received sends the advertiser');
{
  // The message has always ended "You can now upload your ad creatives" while
  // the button went to the campaign page. The next action is the upload.
  check(
    'the button goes to the creative upload, not the campaign page',
    campaignCtaUrl('payment_received', 'c-1', SITE) === `${SITE}/campaigns/c-1/creatives`,
    campaignCtaUrl('payment_received', 'c-1', SITE),
  );
  check('and says so', /upload/i.test(campaignCtaLabel('payment_received')), campaignCtaLabel('payment_received'));
  // That route exists and is the one App.tsx registers.
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  check('the route the email links to is registered', app.includes('/campaigns/:campaignId/creatives'));
}
{
  // The other types must not have moved. Each of these is a live link in an
  // email somebody already received.
  check('creative_uploaded still goes to the admin queue', campaignCtaUrl('creative_uploaded', 'c-1', SITE) === `${SITE}/admin/campaigns/c-1`);
  check('campaign_activated still goes to analytics', campaignCtaUrl('campaign_activated', 'c-1', SITE) === `${SITE}/campaigns/c-1/analytics`);
  check('creative_approved still goes to the campaign', campaignCtaUrl('creative_approved', 'c-1', SITE) === `${SITE}/campaigns/c-1`);
  check('an unknown type falls back to the campaign', campaignCtaUrl('something_new', 'c-1', SITE) === `${SITE}/campaigns/c-1`);
}

console.log('\nthe email body');
{
  const html = buildCampaignEmailBodyHtml(content);
  check('carries the campaign name', html.includes('Fall Patio Push'));
  check('carries the amount', html.includes('$420.00'));
  check('carries the upload link', html.includes(`${SITE}/campaigns/c-1/creatives`));

  const text = buildCampaignEmailBodyText(content);
  check('the text part carries the link too', text.includes(`${SITE}/campaigns/c-1/creatives`), text);
  check('a text-only client still sees the amount', text.includes('$420.00'));
}
{
  // An injected campaign name reaches this HTML from a user-editable field.
  const html = buildCampaignEmailBodyHtml({ ...content, campaignName: '<script>x</script>' });
  check('a campaign name is escaped', !html.includes('<script>x</script>'), html.slice(html.indexOf('Campaign:'), html.indexOf('Campaign:') + 120));
}

console.log('\nthe send itself');
{
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response('{}', { status: 200 }); };
  try {
    const sent = await sendCampaignEmail({
      to: 'advertiser@example.com',
      content,
      resendApiKey: 'rk-test',
      fromEmail: 'noreply@desmoinesinsider.com',
    });
    check('a 200 from the provider is a send', sent === true);
    check('it went to Resend', calls[0]?.url.includes('api.resend.com'), calls[0]?.url);
    const body = JSON.parse(calls[0].init.body);
    check('addressed to the advertiser', Array.isArray(body.to) && body.to[0] === 'advertiser@example.com', JSON.stringify(body.to));
    check('with the notification title as the subject', body.subject === content.title, body.subject);
    check('and both parts present', typeof body.html === 'string' && typeof body.text === 'string');
  } finally {
    globalThis.fetch = realFetch;
  }
}
{
  // No key configured is the state this container and any un-provisioned
  // environment is in. It must report false rather than claim a send.
  const sent = await sendCampaignEmail({ to: 'a@b.test', content, fromEmail: 'noreply@x.test' });
  check('no provider key means not sent, not "sent"', sent === false);
}
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const sent = await sendCampaignEmail({ to: 'a@b.test', content, resendApiKey: 'rk', fromEmail: 'n@x.test' });
    check('a provider outage returns false and does not throw', sent === false);
  } catch (err) {
    check('a provider outage returns false and does not throw', false, err.message);
  } finally {
    globalThis.fetch = realFetch;
  }
}
{
  const sent = await sendCampaignEmail({ to: '', content, resendApiKey: 'rk', fromEmail: 'n@x.test' });
  check('an advertiser with no address on file is not a send', sent === false);
}

console.log('\nthe two callers that must stay wired');
{
  const webhook = readFileSync(new URL('../../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8');
  check('stripe-webhook sends the email itself', /sendCampaignEmail\(/.test(webhook));
  check('and resolves the advertiser address first', /auth\.admin\s*\n?\s*\.getUserById\(campaign\.user_id\)/.test(webhook.replace(/\s+/g, ' ')) || /getUserById\(campaign\.user_id\)/.test(webhook));
  check('and records it on the stored notification', /recipient_email: recipientEmail/.test(webhook));

  const checkout = readFileSync(new URL('../../supabase/functions/create-campaign-checkout/index.ts', import.meta.url), 'utf8');
  check('create-campaign-checkout sets receipt_email', /receipt_email: user\.email/.test(checkout));

  const success = readFileSync(new URL('../../src/pages/AdvertiseSuccess.tsx', import.meta.url), 'utf8');
  check(
    'the success page no longer promises an email nobody sent',
    !/A confirmation email has been sent/.test(success),
  );
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
