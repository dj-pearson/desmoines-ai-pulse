import { test, expect, type Route } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * WEB-ADS-005 AC5. What /advertise/success tells an advertiser about their
 * receipt, asserted against the rendered page.
 *
 * WHY THIS IS WORTH A SMOKE TEST rather than a source grep. The sentence that
 * shipped - "A confirmation email has been sent to your registered email
 * address with your receipt and campaign details" - was false in both halves:
 * create-campaign-checkout set no receipt_email, so Stripe sent nothing, and
 * handleCampaignPayment only inserted a campaign_notifications row, which is an
 * in-app bell. Nothing failed. The page rendered, the payment went through, and
 * the advertiser waited for an email that did not exist. A claim about what
 * arrives in someone's inbox is exactly the kind of copy that rots silently,
 * and a spec that loads the page is the only thing that reads it the way the
 * advertiser does.
 *
 * Everything is route-mocked: this lane builds with placeholder VITE_SUPABASE_*
 * and must never need a backend.
 */

const CAMPAIGN_ID = 'c0000000-0000-4000-8000-0000000000ad';

const CAMPAIGN = {
  id: CAMPAIGN_ID,
  name: 'Fall Patio Push',
  total_cost: 420,
  start_date: '2026-10-01',
  end_date: '2026-10-31',
  stripe_payment_intent_id: 'pi_test_123',
};

const JSON_HEADERS = { 'access-control-allow-origin': '*' };

async function mockPaidCampaign(
  page: import('@playwright/test').Page,
  campaign: Record<string, unknown> = CAMPAIGN,
  links: unknown[] = [],
  verifyBody: Record<string, unknown> = { paid: true },
) {
  await installFixtureBackend(page);
  await page.route('**/rest/v1/sponsored_listing_links**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: JSON_HEADERS,
      body: JSON.stringify(links),
    }),
  );
  await page.route('**/functions/v1/verify-campaign-payment', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: JSON_HEADERS,
      body: JSON.stringify(verifyBody),
    }),
  );

  // .single() sets the object Accept profile, so this must answer with the row
  // itself and not an array - an array makes supabase-js report PGRST116 and
  // the page takes its "Campaign not found" branch.
  await page.route('**/rest/v1/campaigns**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ...JSON_HEADERS, 'content-range': '0-0/1' },
      body: JSON.stringify(campaign),
    }),
  );
}

// Business WP2 item 9: a date-only start_date must read as the day it names in
// Des Moines. new Date('2026-10-01') is UTC midnight, which is September 30 in
// Central time, and that is what the page printed.
test.use({ timezoneId: 'America/Chicago' });

test.describe('advertise success receipt copy', () => {
  test('does not promise a confirmation email', async ({ page }) => {
    await mockPaidCampaign(page);
    await page.goto(`/advertise/success?campaign_id=${CAMPAIGN_ID}`);

    await expect(page.getByText('Fall Patio Push')).toBeVisible();

    // THE ASSERTION THIS SPEC EXISTS FOR. The old sentence claimed a house
    // email carrying the receipt. Nothing sent one.
    await expect(
      page.getByText(/A confirmation email has been sent/i),
    ).toHaveCount(0);
  });

  test('names Stripe as the sender of the receipt and points at the campaign list', async ({ page }) => {
    await mockPaidCampaign(page);
    await page.goto(`/advertise/success?campaign_id=${CAMPAIGN_ID}`);

    await expect(page.getByText(/Stripe emails the payment receipt/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /your campaigns/i })).toHaveAttribute(
      'href',
      '/campaigns',
    );
  });

  test('sends the advertiser to the creative upload, which is what the email links to', async ({ page }) => {
    // The payment_received email's button goes to /campaigns/<id>/creatives
    // (_shared/campaignNotificationEmail.ts). The page must offer the same next
    // step, or the two disagree about what an advertiser does next.
    await mockPaidCampaign(page);
    await page.goto(`/advertise/success?campaign_id=${CAMPAIGN_ID}`);

    await expect(
      page.getByRole('button', { name: /upload/i }).or(
        page.getByRole('link', { name: /upload/i }),
      ).first(),
    ).toBeVisible();
  });
  test('the amount paid is what Stripe charged, and a list price is not called that', async ({ page }) => {
    // A promotion code (allow_promotion_codes) makes the charge differ from
    // the stored campaign total; verify-campaign-payment reports amountPaid.
    await mockPaidCampaign(page, CAMPAIGN, [], { paid: true, amountPaid: 378 });
    await page.goto(`/advertise/success?campaign_id=${CAMPAIGN_ID}`);
    await expect(page.getByText('Amount paid')).toBeVisible();
    await expect(page.getByText('$378.00')).toBeVisible();
    await expect(page.getByText('$420.00')).toHaveCount(0);
  });

  test('without amountPaid the stored total is labelled as the campaign total', async ({ page }) => {
    await mockPaidCampaign(page);
    await page.goto(`/advertise/success?campaign_id=${CAMPAIGN_ID}`);
    await expect(page.getByText('Campaign total')).toBeVisible();
    await expect(page.getByText('$420.00')).toBeVisible();
    await expect(page.getByText('Amount paid')).toHaveCount(0);
  });

  test('dates read as the Des Moines calendar day', async ({ page }) => {
    await mockPaidCampaign(page);
    await page.goto(`/advertise/success?campaign_id=${CAMPAIGN_ID}`);

    await expect(page.getByText('October 1, 2026').first()).toBeVisible();
    await expect(page.getByText(/September 30, 2026/)).toHaveCount(0);
  });

  test('a sponsored-listing-only purchase is not told to upload artwork', async ({ page }) => {
    await mockPaidCampaign(
      page,
      { ...CAMPAIGN, campaign_placements: [{ placement_type: 'sponsored_listing' }] },
      [{ listing_type: 'restaurant', listing_id: 'd0000000-0000-4000-8000-0000000000ad' }],
    );
    await page.goto(`/advertise/success?campaign_id=${CAMPAIGN_ID}`);

    await expect(page.getByText(/Nothing to upload\. Your listing gets the Sponsored label/)).toBeVisible();
    await expect(page.getByRole('link', { name: /see your listing/i })).toHaveAttribute(
      'href',
      '/restaurants/d0000000-0000-4000-8000-0000000000ad',
    );
    await expect(page.getByRole('link', { name: /upload creatives/i })).toHaveCount(0);
  });

  test('an unconfirmed payment says nothing is lost and links to the campaign', async ({ page }) => {
    await installFixtureBackend(page);
    await page.route('**/functions/v1/verify-campaign-payment', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: JSON_HEADERS,
        body: JSON.stringify({ paid: false }),
      }),
    );
    await page.goto(`/advertise/success?campaign_id=${CAMPAIGN_ID}`);

    await expect(page.getByRole('heading', { name: "We haven't seen the payment yet" })).toBeVisible();
    await expect(page.getByText(/Nothing is lost/)).toBeVisible();
    await expect(page.getByRole('link', { name: /open the campaign/i })).toHaveAttribute(
      'href',
      `/campaigns/${CAMPAIGN_ID}`,
    );
  });
});
