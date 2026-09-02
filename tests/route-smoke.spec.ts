import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

/**
 * WEB-QA-001 / WEB-QA-002 / WEB-QA-003 — production regressions found in the
 * 2026-07-13 QA pass.
 *
 * These are deliberately shallow "does it mount, does it not error" checks. They
 * exist because all three bugs shipped to production while every existing suite
 * stayed green — nothing asserted that a route actually rendered instead of
 * falling into the error boundary.
 */

/** Copy rendered by src/components/ui/route-error-boundary.tsx. */
const ROUTE_ERROR_TEXT = 'This page encountered an error';
/** Copy rendered by src/components/ui/error-boundary.tsx. */
const GENERIC_ERROR_TEXT = 'Something went wrong';

/** Collect console errors so a route that "renders" but logs DB failures still fails. */
function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText(ROUTE_ERROR_TEXT)).toHaveCount(0);
  await expect(page.getByText(GENERIC_ERROR_TEXT)).toHaveCount(0);
}

test.describe('Route smoke: monetization / B2B pages mount (WEB-QA-001)', () => {
  // React error #130 (undefined component) took /advertise down entirely. Audit
  // the sibling revenue routes reachable from the footer at the same time.
  const routes = ['/advertise', '/business-partnership'];

  for (const route of routes) {
    test(`${route} mounts without hitting the error boundary`, async ({ page }) => {
      const consoleErrors = captureConsoleErrors(page);

      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await page.waitForLoadState('networkidle');

      await expectNoErrorBoundary(page);

      // React #130 surfaces as a minified invariant in production builds.
      const invariantErrors = consoleErrors.filter((e) => /Minified React error #130|Element type is invalid/i.test(e));
      expect(invariantErrors, `React #130 on ${route}: ${invariantErrors.join('\n')}`).toHaveLength(0);
    });
  }
});

test.describe('Homepage data fetches succeed (WEB-QA-003)', () => {
  test('homepage loads with no events/ads query errors', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expectNoErrorBoundary(page);

    // The specific regressions: a bad column in the events projection (42703) and
    // an unservable ad placement. Both logged on every single homepage load.
    const dataErrors = consoleErrors.filter((e) =>
      /fetchEvents|useEvents|fetchActiveAd|useActiveAds|42703|PGRST/i.test(e)
    );
    expect(dataErrors, `data-layer errors on /: ${dataErrors.join('\n')}`).toHaveLength(0);
  });

  test('events REST query returns 2xx', async ({ page }) => {
    const failedEventRequests: string[] = [];

    page.on('response', (res) => {
      const url = res.url();
      if (/\/rest\/v1\/events/.test(url) && res.status() >= 400) {
        failedEventRequests.push(`${res.status()} ${url}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(failedEventRequests, failedEventRequests.join('\n')).toHaveLength(0);
  });
});

test.describe('Content routes survive their schema projections (WEB-QA-017)', () => {
  /**
   * Each of these routes named a column that does not exist on public.events or
   * public.attractions. PostgREST rejects the WHOLE projection with 42703 when
   * any single column is unknown, so the page rendered zero rows — silently,
   * because the hook catches the error and falls into its empty state. Nothing
   * in the UI distinguishes "no results" from "the query was rejected", which is
   * why these sat broken.
   *
   * The static guard (scripts/check-schema-usage.mjs) catches the reintroduction
   * of a bad column name at CI time. These assert the runtime consequence, since
   * the guard can only see literal select strings.
   */
  const routes = [
    { path: '/events/west-des-moines', was: 'selected events.time and events.status' },
    { path: '/events/july-2026', was: 'ordered by events.time' },
    { path: '/map', was: 'selected events.description and attractions.category' },
  ];

  for (const { path, was } of routes) {
    test(`${path} issues no rejected PostgREST queries (${was})`, async ({ page }) => {
      const consoleErrors = captureConsoleErrors(page);
      const rejected: string[] = [];

      page.on('response', (res) => {
        // Scoped to the CONTENT tables these routes project from. A blanket
        // "no 4xx on /rest/v1" would also fail on user_analytics, which 400s
        // on every page load for an unrelated reason: usePageTracking writes a
        // pathname into a NOT NULL uuid column (WEB-QA-013). Migration
        // 20260718000002 fixes that and is not yet applied, so asserting on it
        // here would couple this test to a deploy and hide the regression it
        // actually guards. Widen this pattern once that ships.
        if (/\/rest\/v1\/(events|attractions|restaurants)\b/.test(res.url()) && res.status() >= 400) {
          rejected.push(`${res.status()} ${res.url()}`);
        }
      });

      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await page.waitForLoadState('networkidle');

      await expectNoErrorBoundary(page);

      expect(
        rejected,
        `${path} made REST request(s) the database rejected:\n${rejected.join('\n')}`
      ).toHaveLength(0);

      // 42703 is the specific failure these routes regressed on; PGRST covers
      // the schema-cache errors (PGRST202/203/204) in the same family. Filtered
      // to the content tables for the WEB-QA-013 reason described above.
      const schemaErrors = consoleErrors.filter(
        (e) => /42703|PGRST\d{3}|does not exist/i.test(e) && !/user_analytics/i.test(e)
      );
      expect(schemaErrors, `schema errors on ${path}: ${schemaErrors.join('\n')}`).toHaveLength(0);
    });
  }
});

test.describe('Every public route in App.tsx mounts (WEB-QA-023)', () => {
  /**
   * /stay shipped to production calling getCanonicalUrl() with no import — a
   * ReferenceError on render, so the page was nothing but the error boundary.
   * Three gates missed it: `npm run type-check` compiles zero files (root
   * tsconfig is `"files": []` + project references), the strict ratchet does not
   * reach Hotels.tsx, and no test loaded the route.
   *
   * Naming /stay here would only close the /stay-shaped hole. So this reads the
   * route table out of src/App.tsx and loads every public route it declares.
   * There is no allowlist to keep in sync: add a <Route> and it is covered on
   * the next run; delete one and it stops being checked. That property is the
   * whole point — an exception list would have rotted before it caught anything.
   *
   * Excluded, with reasons:
   *  - `:param` / `*` routes — no way to synthesize a valid id here. Those are
   *    covered by the WEB-QA-002 and WEB-QA-017 blocks above with real slugs.
   *  - ProtectedRoute routes — the guard redirects to /auth before the lazy
   *    element is ever imported, so loading them proves nothing about the page.
   *
   * Kept cheap on purpose: 'domcontentloaded' plus a short settle, no
   * networkidle. This asserts the route renders SOMETHING rather than crashing;
   * data correctness is the other blocks' job.
   */
  const APP_TSX = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'App.tsx');

  function publicRoutesFromAppTsx(): string[] {
    const source = readFileSync(APP_TSX, 'utf8');
    const routes: string[] = [];

    for (const match of source.matchAll(/<Route\s+path="([^"]+)"([^>]*)>?/g)) {
      const [, path, rest] = match;
      if (path.includes(':') || path.includes('*')) continue;
      if (rest.includes('ProtectedRoute')) continue;
      if (!routes.includes(path)) routes.push(path);
    }

    return routes;
  }

  const routes = publicRoutesFromAppTsx();

  test('the route table parsed out of App.tsx is not empty', () => {
    // If a refactor changes how routes are declared, the loop below would
    // silently cover nothing and this suite would go green while asserting
    // zero. Fail loudly instead.
    expect(
      routes.length,
      'Parsed 0 public routes from src/App.tsx — the <Route path="..."> pattern this suite reads has changed.'
    ).toBeGreaterThan(20);
  });

  for (const route of routes) {
    test(`${route} renders without crashing`, async ({ page }) => {
      const consoleErrors = captureConsoleErrors(page);

      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${route} returned ${response?.status()}`).toBeLessThan(400);

      // Give lazy chunks and the first render a moment; these pages are
      // code-split, so the error boundary appears after the initial HTML.
      await page.waitForTimeout(1500);

      await expectNoErrorBoundary(page);

      // The /stay failure mode: an identifier that survives bundling as a bare
      // reference and throws the moment the component renders.
      const fatal = consoleErrors.filter((e) =>
        /ReferenceError|is not defined|is not a function|Minified React error #(130|31)|Element type is invalid/i.test(e)
      );
      expect(fatal, `fatal render error on ${route}:\n${fatal.join('\n')}`).toHaveLength(0);
    });
  }
});

test.describe('Listed events resolve to a detail page (WEB-QA-002)', () => {
  test('a sample of event cards from the listing all render a detail page', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    // Event cards link to /events/<slug>. Sample the first few rather than every
    // card, to keep this fast while still catching a systemic list/detail split.
    const links = page.locator('a[href^="/events/"]');
    const count = await links.count();
    test.skip(count === 0, 'No events currently listed — nothing to verify.');

    const sampleSize = Math.min(count, 5);
    const hrefs: string[] = [];
    for (let i = 0; i < sampleSize; i++) {
      const href = await links.nth(i).getAttribute('href');
      if (href && !hrefs.includes(href)) hrefs.push(href);
    }

    for (const href of hrefs) {
      await page.goto(href);
      await page.waitForLoadState('networkidle');

      // The exact dead-end the QA pass hit: a listed event 404ing on its detail.
      await expect(
        page.getByText('Event Not Found'),
        `Listed event ${href} dead-ends on "Event Not Found"`
      ).toHaveCount(0);

      await expectNoErrorBoundary(page);
    }
  });
});

test.describe('Sponsored listings render on the restaurants hub (WEB-ADS-001)', () => {
  // The purchase path writes sponsored_listing_links and activation (the
  // activate_campaign RPC via the campaigns status trigger) flags the listing
  // row. This is the render end of that contract: a restaurant row carrying
  // is_sponsored = true with a future sponsored_until must show the
  // FTC "Sponsored" label on /restaurants. The rotation RPC is mocked so the
  // assertion does not depend on a paid campaign existing in the database.
  test('an active sponsored restaurant carries the Sponsored label', async ({ page }) => {
    const sponsoredUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const restaurant = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Smoke Test Sponsored Bistro',
      slug: 'smoke-test-sponsored-bistro',
      cuisine: 'American',
      city: 'Des Moines',
      address: '100 Locust St',
      price_range: '$$',
      rating: 4.6,
      review_count: 12,
      popularity_score: 90,
      image_url: null,
      description: 'Fixture row for the sponsored-label smoke test.',
      is_featured: false,
      is_sponsored: true,
      sponsored_until: sponsoredUntil,
      status: 'open',
      created_at: '2026-01-01T00:00:00Z',
    };

    await page.route('**/rest/v1/rpc/get_rotated_restaurants*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ restaurant_data: restaurant, total_count: 1 }]),
      })
    );

    await page.goto('/restaurants');
    await expectNoErrorBoundary(page);

    // RestaurantCard prefixes the accessible name with "Sponsored: " and
    // renders SponsoredBadge (aria-label "Sponsored content") inside the card.
    const card = page.getByRole('link', { name: /^Sponsored: View Smoke Test Sponsored Bistro/ }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByLabel('Sponsored content')).toBeVisible();
  });
});

test.describe('Password reset leads to a form that changes the password (WEB-AUTH-001)', () => {
  // Before this route existed the reset email pointed at /auth?reset=true,
  // nothing read that parameter, and the link signed the user in and dropped
  // them on the homepage with the old password intact. These assertions are
  // about the shape of the recovery flow, not about a real Supabase session,
  // so the auth calls are route-mocked.

  test('/auth/reset-password offers a resend when there is no recovery session', async ({ page }) => {
    const consoleErrors = captureConsoleErrors(page);

    const response = await page.goto('/auth/reset-password');
    expect(response?.status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle');
    await expectNoErrorBoundary(page);

    // An anonymous visitor has no recovery session, so the page must offer a
    // new link rather than an unusable form or a blank screen.
    await expect(page.getByRole('button', { name: /send again/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel(/email address/i)).toBeVisible();

    const invariantErrors = consoleErrors.filter((e) => /Minified React error #130|Element type is invalid/i.test(e));
    expect(invariantErrors, `React #130 on /auth/reset-password: ${invariantErrors.join('\n')}`).toHaveLength(0);
  });

  test('an expired link is reported as expired, not celebrated', async ({ page }) => {
    await page.goto('/auth/reset-password?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await page.waitForLoadState('networkidle');
    await expectNoErrorBoundary(page);

    await expect(page.getByText(/this link has expired/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /send again/i })).toBeVisible();
  });

  test('the old ?reset=true link still reaches the reset page', async ({ page }) => {
    // Emails sent before this shipped point at /auth?reset=true and stay valid
    // for an hour, so that parameter has to keep working.
    await page.goto('/auth?reset=true');
    await page.waitForLoadState('networkidle');
    await expectNoErrorBoundary(page);

    await expect(page).toHaveURL(/\/auth\/reset-password/, { timeout: 30_000 });
  });
});

test.describe('Ad impressions are recorded server-side (WEB-ADS-002)', () => {
  // The browser used to INSERT into ad_impressions directly. That table has no
  // INSERT policy in any migration, so RLS refused every write and every
  // advertiser dashboard read zero. The write now goes through an edge
  // function. This asserts the browser takes that route and never the old one.
  test('the homepage writes no ad rows directly from the browser', async ({ page }) => {
    const directAdWrites: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (req.method() === 'POST' && /\/rest\/v1\/(ad_impressions|ad_clicks)/.test(url)) {
        directAdWrites.push(url);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expectNoErrorBoundary(page);

    expect(
      directAdWrites,
      `the browser must not insert ad rows directly: ${directAdWrites.join('\n')}`
    ).toHaveLength(0);
  });
});

test.describe('Landing pages do not open a websocket per card (WEB-PERF-030)', () => {
  // SocialEventCard fell back to useEventSocial(event.id) when a page passed no
  // batch data, and that fallback opened three postgres_changes channels per
  // card. FreeEvents fetches up to 100 events, so one anonymous visit could
  // open three hundred subscriptions for a preview nobody signed out can use.
  test('/events/free opens at most a handful of websockets', async ({ page }) => {
    const sockets: string[] = [];
    page.on('websocket', (ws) => sockets.push(ws.url()));

    await page.goto('/events/free');
    await page.waitForLoadState('networkidle');
    await expectNoErrorBoundary(page);

    // Supabase multiplexes channels over one realtime connection, so the count
    // here is connections rather than channels. Anonymous visitors should need
    // none; the ceiling leaves room for one shared connection plus noise.
    expect(
      sockets.length,
      `too many websocket connections on /events/free: ${sockets.join('\n')}`
    ).toBeLessThanOrEqual(3);
  });
});
