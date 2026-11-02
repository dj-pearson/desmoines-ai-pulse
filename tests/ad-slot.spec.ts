import { test, expect, type Page } from '@playwright/test';
import { installFixtureBackend } from './support/fixtureBackend';

/**
 * The campaign ad slot on the hubs (WEB-UX-046, Loop 7).
 *
 * 1. The CTA is a real link, rel="noopener sponsored", that opens the
 *    advertiser's page; the card is not a clickable div.
 * 2. The creative is an <img> with alt text and width/height, not a CSS
 *    background the browser can't size or describe.
 * 3. Every ad landmark on the page has its own name. Two slots used to be two
 *    landmarks with the same name, or none.
 * 4. A signed-out visitor's top_banner does not wait on the subscription
 *    lookup. subscription_plans is held open for the whole test, and the ad
 *    still renders, because signed-out is always free tier.
 *
 * Runs on the fixture backend: the smoke build has placeholder Supabase
 * credentials, so get_active_ads is answered here.
 */

const CREATIVE_URL = 'https://ads.example.test/creative.png';
const LINK_URL = 'https://advertiser.example.test/landing';

/** 1x1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const TOP_AD = {
  campaign_id: '00000000-0000-4000-8000-0000000000a1',
  creative_id: '00000000-0000-4000-8000-0000000000c1',
  title: 'Fixture Bistro Brunch',
  description: 'Bottomless coffee on Court Avenue.',
  image_url: CREATIVE_URL,
  link_url: LINK_URL,
  cta_text: 'Book now',
};

const CONSENT = { version: '2026-04-13', essential: true, preferences: true, analytics: false, advertising: false };

async function setUp(page: Page) {
  await page.addInitScript((consent) => {
    try {
      localStorage.setItem('cookie-consent', JSON.stringify({ ...consent, timestamp: new Date().toISOString() }));
    } catch {
      /* private mode: the assertions fail, not this */
    }
  }, CONSENT);
  await installFixtureBackend(page);

  // Never answered: if the slot waited on the tier lookup it would stay a
  // placeholder for the length of the test.
  await page.route('**/rest/v1/subscription_plans**', () => {
    /* held open on purpose */
  });

  await page.route('**/rest/v1/rpc/get_active_ads**', (route) => {
    let placement = '';
    try {
      placement = (route.request().postDataJSON() as { p_placement_type?: string })?.p_placement_type ?? '';
    } catch {
      /* no body */
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(placement === 'top_banner' ? [TOP_AD] : []),
    });
  });

  await page.route(CREATIVE_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );
  // On the context, not the page: the advertiser opens in a new tab, and a
  // page route does not see that tab's requests.
  await page.context().route(`${LINK_URL}**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Advertiser</title>' }),
  );
}

test.describe('Campaign ad slot semantics (WEB-UX-046)', () => {
  test('signed-out /events: top banner is a named landmark with a real sponsored link and an <img> creative', async ({ page }) => {
    await setUp(page);
    await page.goto('/events');

    const slot = page.getByRole('complementary', { name: 'Advertisement, top of page' });
    await expect(slot).toBeVisible({ timeout: 30_000 });

    const link = slot.getByRole('link', { name: 'Book now - Fixture Bistro Brunch' });
    await expect(link).toHaveAttribute('href', LINK_URL);
    await expect(link).toHaveAttribute('target', '_blank');
    const rel = (await link.getAttribute('rel')) ?? '';
    expect(rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'sponsored']));

    const img = slot.locator('img');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute('alt', /\S/);
    await expect(img).toHaveAttribute('width', '728');
    await expect(img).toHaveAttribute('height', '90');

    // The card itself carries no background-image creative any more.
    const bg = await slot.evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll('*'))].some(
        (n) => getComputedStyle(n).backgroundImage.includes('creative.png'),
      ),
    );
    expect(bg, 'creative should be an <img>, not a CSS background').toBe(false);

    // Following the link opens the advertiser in a new tab.
    const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
    await expect(popup).toHaveURL(LINK_URL);
  });

  test('ad landmarks on /events each have a distinct name', async ({ page }) => {
    await setUp(page);
    await page.goto('/events');
    await expect(
      page.getByRole('complementary', { name: 'Advertisement, top of page' }),
    ).toBeVisible({ timeout: 30_000 });
    // The below_fold slot mounts on first view (events-request-budget.spec.ts).
    await page.waitForTimeout(2_000);

    const names = await page
      .locator('[role="complementary"], aside')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
    const adNames = names.filter((n) => /advertisement|promotion/i.test(n));
    expect(adNames.every((n) => n.trim().length > 0), `unnamed ad landmark: ${names.join(' | ')}`).toBe(true);
    expect(new Set(adNames).size, `duplicate ad landmark names: ${adNames.join(' | ')}`).toBe(adNames.length);
  });
});
