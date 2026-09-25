import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke config — runs tests/route-smoke.spec.ts against a PRODUCTION BUILD.
 *
 * Why not the normal dev-server config (playwright.config.ts):
 *
 * 1. The bugs these tests guard (WEB-QA-001/002/003) are bundling-sensitive. A
 *    named import with no matching export is a hard SyntaxError under the dev
 *    server's native ESM, but silently becomes `undefined` once bundled — which
 *    is what actually reached production as React error #130. Only a real build
 *    reproduces the shipped failure mode.
 *
 * 2. `leaflet` is intentionally excluded from optimizeDeps (see vite.config.ts),
 *    so react-leaflet's named imports fail under the dev server on any page with
 *    a map — including event detail pages. That is a dev-only artifact and would
 *    make these tests fail for a reason unrelated to what they assert.
 *
 * Usage: npm run test:smoke
 */
/**
 * A locally installed Chromium, when Playwright's own download is absent or at
 * a different revision (WEB-CI-028). Inert in CI, where the browsers Playwright
 * expects are installed by the workflow. See TESTING.md for why this is needed
 * in a container: Playwright looks for chrome-headless-shell at the revision it
 * shipped with, and a preinstalled full chromium is at a different path.
 */
const localChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
  : {};

export default defineConfig({
  testDir: './tests',
  // cookie-consent.spec.ts joins route-smoke here for WEB-LEGAL-009 AC5.
  //
  // It already asserted the right thing - reject analytics, then check that no
  // googletagmanager request is made and no _ga cookie is set - and it lived in
  // the QUARANTINED broad lane, which e2e.yml runs non-blocking. A compliance
  // check that cannot fail a PR is decorative, and WEB-LEGAL-001 is the exact
  // defect that shipped while a document said it was fixed.
  //
  // request-budget.spec.ts generalises that to every main route: no endpoint
  // may be called more than 20 times on one page load. WEB-PERF-043.
  //
  // search-request-loop.spec.ts counts REQUESTS rather than checking the DOM:
  // an effect keyed on an unstable callback fired nlp-search 82 times in 16
  // seconds for one query, and the page just looked empty while it did.
  // WEB-QA-033.
  //
  // page-headings.spec.ts asserts one <h1> per route, including when the data
  // fails - axe's page-has-heading-one is a best-practice rule outside the
  // wcag2aa tag set accessibility.spec.ts filters to, so nothing caught it.
  // WEB-A11Y-002.
  //
  // touch-targets.spec.ts is here too: it measures rendered footer link boxes
  // at 375px under a coarse pointer, which is computed layout behind a media
  // query - nothing a source-text check can see. WEB-UX-036.
  //
  // backend-down.spec.ts is here for the same reason: it aborts every Supabase
  // request and asserts no reader-facing route answers "No items available in
  // this category right now". That is a runtime property - the TanStack pages
  // reach their empty state only after retries are exhausted - so no
  // source-text check can establish it. WEB-QA-032.
  //
  // It belongs here specifically because it asserts REAL BROWSER BEHAVIOUR -
  // network requests and cookies - which no source-text check can establish.
  // scripts/check-consent-gate.mjs covers the source side; this covers what
  // actually happens.
  //
  // search-filters, url-filter-state and sticky-filter-chips joined for
  // WEB-CI-028 AC2, which required them to pass against the built site first.
  // The blocker recorded for four passes was "they need a preview deploy with
  // a live backend": seven of their tests assert on RESULTS, and the lane
  // builds with placeholder VITE_SUPABASE_* so no row ever arrives. They do not
  // need a backend, they need rows - tests/support/fixtureBackend.ts answers
  // PostgREST from fixtures. 45/45 against the production build.
  //
  // The home-* specs and shell-mobile joined with the Home page plan
  // (docs/page-plans/home.md). Each runs on fixtureBackend, so none needs a
  // live backend: search (one input, /search?q=, result hrefs), the first-view
  // request budget, the For You/recently viewed rails' layout stability, the
  // Tonight rail, the dashboard's hrefs and contrast, the quick view, and the
  // mobile shell's BackToTop and menu close target.
  //
  // The events-* specs and event-detail joined with the Events page plan
  // (docs/page-plans/events.md), also on fixtureBackend: the hub's Central-time
  // request bounds and free filter, paging and sponsored order, the near-me
  // slugs and visibility, and the event page's retry state and UUID redirect.
  //
  // restaurants-hub, restaurants-open-now and restaurant-detail joined with the
  // Eat & Drink plan (docs/page-plans/eat-drink.md), on fixtureBackend: hub
  // paging hrefs and counts, the sponsored query carrying the visitor's
  // filters, ItemList urls; open-now read in Central time from any browser
  // zone; and the detail page's unsafe-link, closed, merged and retry states.
  //
  // The Explore specs joined with the Explore plan (docs/page-plans/explore.md),
  // on fixtureBackend plus per-spec page.route overrides: the things-to-do hub's
  // pSEO fallbacks and error reporting (log-error fires only in a PROD build),
  // the map's Leaflet CSS, visibility filters and URL state, the attractions
  // hub's search sanitising and hours, playground facets and nearby, one events
  // request per music/sports hub, the outdoors metro count and filters, and the
  // deals window, schedule and claim failure.
  //
  // The Plan & Stay specs joined with that plan (docs/page-plans/plan-stay.md),
  // on fixtureBackend plus per-spec page.route overrides: /stay's three empty
  // states, paging, ?near= ordering and unsafe booking links; the trip
  // planner's date window with the AI section paused; the visitor guide,
  // group travel and getting-around pages with no unsourced prices; articles
  // paging and AI disclosure; Best Of voting as one upsert; What's New chips
  // and future rows; and the weekend page's per-day groups. getting-around
  // was a lane orphan before this and leaves the baseline with it.
  //
  // search-results, search-watch and search-advanced-redirect joined with the
  // Search plan (docs/page-plans/search.md WP6), on fixtureBackend plus
  // per-spec routes for nlp-search: /search's grouped results, hrefs and
  // chips with no second model call on Back, the events-only watch button,
  // and /search/advanced's Stage A (no crash on foreign saved rows, only the
  // controls that filter; the redirect into /search waits on D2).
  //
  // auth-funnel, auth-return and the account-* specs joined with the Account
  // plan (docs/page-plans/account.md WP6), on fixtureBackend plus per-spec
  // routes for /auth/v1: sign-in, sign-up and the MFA step; the return path
  // through sign-up, confirmation and OAuth; the signed-in /dashboard and
  // /my-events with their error states and request budget; the submission
  // timeline; and the settings security checkup and email streams.
  //
  // pricing-page, subscription-success, subscription-portal and paywall joined
  // with the Pricing & Premium plan (docs/page-plans/pricing.md WP6), on
  // fixtureBackend plus per-spec routes for subscription_plans,
  // user_subscriptions and the checkout and manage-subscription functions:
  // /pricing's first-screen price, true benefit lines and checkout errors that
  // reach the person; the success page's wait for the webhook; the portal's
  // per-platform rows and paused plan change; and the paywall dialog.
  //
  // advertise-builder, campaign-detail-pay, campaign-analytics-counts,
  // business-hub and submit-event-page joined with the Business plan
  // (docs/page-plans/business.md WP5), on fixtureBackend plus per-spec routes:
  // /advertise showing the server's total for the chosen dates and one
  // campaign per double click; Pay on a saved campaign and the list/detail
  // error states; analytics totals from the exact count; the /business
  // workspace and /business-partnership inquiry; and /submit-event's one h1.
  testMatch: /(search-filters|url-filter-state|sticky-filter-chips|route-smoke|cookie-consent|backend-down|touch-targets|page-headings|search-request-loop|request-budget|turnstile-inert|subscription-checkout|advertise-success-receipt|submission-live-link|campaign-self-service|home-search|home-request-budget|home-rails-cls|home-tonight|home-dashboard|home-quick-view|shell-mobile|events-hub-dates|events-hub-list|events-near-me|event-detail|restaurants-hub|restaurants-open-now|restaurant-detail|things-to-do-hub|discover-map|attractions-hub|playgrounds-hub|music-sports-hubs|outdoors-hub|deals|stay|trip-planner-window|visitors-guide|getting-around|articles|best-of-voting|whats-new|events-weekend-days|search-results|search-watch|search-advanced-redirect|auth-funnel|auth-return|account-home|account-request-budget|account-submissions|account-settings|pricing-page|subscription-success|subscription-portal|paywall|advertise-builder|campaign-detail-pay|campaign-analytics-counts|business-hub|submit-event-page)\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 60_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], ...localChromium },
    },
  ],

  webServer: {
    // `vite build`, not `npm run build`. The full script also runs
    // generate-sitemaps and prerender, and prerender drives a headless Chromium
    // over 35 hub routes with a 20s content wait and an 8s Helmet wait apiece.
    // When those waits are hit the step alone outruns the 300s budget below and
    // the required lane fails with "Timed out waiting from config.webServer" —
    // a network-timing failure that says nothing about the code under test.
    //
    // Nothing in route-smoke.spec.ts reads prerendered output: every assertion
    // is client-side runtime behaviour (console errors, React #130, PostgREST
    // status codes, route mounting). What the suite does need is a real bundle,
    // because a named import with no matching export only becomes an undefined
    // component once bundled — and `vite build` produces exactly that.
    command: 'npx vite build && npx vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
