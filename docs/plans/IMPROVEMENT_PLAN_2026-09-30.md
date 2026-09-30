# Des Moines Insider: 20-item improvement plan (2026-09-30)

Built from four read-only audits of the repo at `2487a36` (frontend, backend and
security, data and SEO, testing/CI/mobile). Every item cites the file it was found
in. None of it was probed against production, so each item's first step is to
confirm the problem still exists.

Work the items in order, one branch and one PR per item. Tick the box when the PR
merges.

## Status (2026-09-30)

Every item has a PR except 14, which needed no code. All PRs target `main`, per the decision to branch off `main`.

**Merge #435 first.** Required CI was red on `main` in six places before any of this work started, so every PR below shows red until #435 lands and `main` is merged into it. #438 and #439 are stacked on #435.

| # | Item | PR | Notes |
|---|---|---|---|
| 1 | Reminder RPC grants | #420 | hotfix; migration 20261015000006 |
| 2 | Stripe event ordering | #421 | |
| 3 | Admin tools 401 | #422 | also fixed publish-article-webhook |
| 4 | ENVIRONMENT fails closed | #423 | |
| 5 | Persistent rate limits | #424 | migration 20261015000007 |
| 6 | Route error boundary | #425 | |
| 7 | pSEO listing links | #426 | overlaps #430's contentHref |
| 8 | Per-card view stats | #427 | |
| 9 | Nested `<main>` | #428 | |
| 10 | Support chat fallback | #429 | |
| 11 | Trending tab | #430 | |
| 12 | Crawler fields | #431 | |
| 13 | Crawl horizon | #432 | the listing may be a rolling 7-day window; see PR |
| 14 | Dedupe cron | none | live jobs were already rewritten by 20260824000001 and 20260826000002; merging the 10 groups needs DB access |
| 15 | Sitemap writers | #433 | |
| 16 | Email opt-out | #434 | merge before setting the Vault secret |
| 17 | Deno lanes | #438 | stacked on #435 |
| 18 | CI hardening | #435 + #439 | Node 22 in #435; the rest in #439, stacked; rulesets need applying in GitHub |
| 19 | validate speed | #437 | |
| 20 | Version guards | #436 | |
| - | Main CI green | #435 | edge contracts, edge types, audit, migration safety, smoke, axe, prerender, Node 22 |

## Loop protocol (per item)

1. Re-verify the evidence. If it's already fixed, tick the item, note the commit, and move on.
2. Branch as listed (`fix/*` off `develop` unless the item says `hotfix/*` off `main`).
3. Make the smallest change that fixes it, plus a regression test.
4. Run the item's verify step, then `npm run validate`.
5. Open the PR and drive CI to green.

## Owner actions (not code; unblock items 12-16)

These need credentials, so only Dj can do them. Several items below are code-complete fixes that do nothing until these land.

- [ ] Set repo secret `SUPABASE_ACCESS_TOKEN` and run **Deploy Edge Functions**. 64 functions are undeployed (`edge-deploy-baseline.json`), including `export-user-data`, `support-chat` and `saved-search-alerts`.
- [ ] Set the Vault secret `service_role_key`. 41 cron jobs fail without it (`cron-health-baseline.json`; `20260902000015_purge_embedded_service_key.sql:103`).
- [ ] Set repo secret `CLOUDFLARE_DEPLOY_HOOK_URL`. The daily crawl never rebuilds `/events/today` (`event-crawler.yml:189-198`).
- [ ] **Today:** confirm `gsc_page_performance` has rows dated within the last 3 days. The refresh-token lapse was forecast for about 2026-09-30, and any history that ages out can't be recovered.
- [ ] Apply the ads migrations `20260920000002`, `20260920000003` and `20260920000004` (WEB-ADS-011).

## Security and money

- [x] **1. Revoke anon access to the reminder RPCs** (S, `hotfix/reminder-rpc-grants`)
  - **Problem:** `get_pending_reminders` is SECURITY DEFINER, joins `auth.users` and returns `user_email`. It is granted to `service_role`, but no migration revokes the default grant to PUBLIC, anon and authenticated (`20260830000001_fix_pending_reminders_email_type.sql:18-34`). `mark_reminder_sent` (`20251110000001_...:122-143`) has the same flaw and also has no `search_path` pin.
  - **Fix:** a new migration that runs `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` on both functions and pins `search_path`. The only caller is `send-event-reminders`, which runs as service_role.
  - **Verify:** anon `POST /rest/v1/rpc/get_pending_reminders` returns 42501. Extend `scripts/audit-rls.ts` to flag definers that touch `auth.users` with no REVOKE.

- [x] **2. Stop late Stripe events resurrecting cancelled subscriptions** (M, `fix/stripe-event-ordering`)
  - **Problem:** `stripe-webhook/index.ts:774-825` writes `status` straight from the event payload. Stripe doesn't guarantee delivery order, so a retried `subscription.updated` (active) that lands after `.deleted` flips the row back to active.
  - **Fix:** in `handleSubscriptionUpdated`, retrieve the live subscription, the same pattern already used at `:645` and `:914`.
  - **Verify:** a Deno test that replays updated after deleted.

- [x] **3. Fix admin buttons that always 401** (S, `fix/admin-edge-auth`)
  - **Problem:** `generate-seo-content/index.ts:25`, `bulk-update-restaurants/index.ts:86` and `update-event-datetime/index.ts:37` call `requireApiKey`, but the admin UI sends a user JWT (`SEOTools.tsx:586`, `useBulkRestaurantUpdate.ts:41`).
  - **Fix:** switch them to `requireAdminOrApiKey`. This loosens access, so it's safe in one release. Also clamp `batchSize` in bulk-update (`:110`, `:133`), which is unbounded Google Places spend today.
  - **Verify:** `npm run check-edge-auth`.

- [x] **4. Fail closed when `ENVIRONMENT` is unset** (S, `fix/edge-env-fail-closed`)
  - **Problem:** `_shared/apiKeyAuth.ts:43-51` and `_shared/cors.ts:14,167` default a missing `ENVIRONMENT` to `development`. That skips the API key check and allows lovable.dev origins.
  - **Fix:** treat a missing value as production.
  - **Verify:** a Deno unit test with both variables unset.

- [x] **5. Persistent rate limits on mail and money endpoints, plus table cleanup** (M, `fix/persistent-rate-limits`)
  - **Problem:** 29 functions use only in-memory, per-isolate limiting (`_shared/rateLimit.ts:217-229`), including `newsletter-subscribe`, `create-campaign-checkout` and `process-stripe-refund`. `cleanup_rate_limit_entries()` is never scheduled, so the table grows forever.
  - **Fix:** move the mail and money endpoints to `checkRateLimitPersistent` at the **same** limits (tightening them is a compat break). Schedule the cleanup as plain SQL through pg_cron.
  - **Verify:** `npm run check-cron-credentials` and Deno tests.

## User-facing frontend

- [x] **6. Make the route error boundary report and recover** (M, `fix/route-error-boundary`)
  - **Problem:**
    - `route-error-boundary.tsx:37-51` logs only in DEV, so no page crash ever reaches Sentry.
    - The error card never resets when the route changes.
    - "Try Again" can't recover a failed chunk load.
    - `lazyWithRetry` (`App.tsx:36-47`) never clears `chunk_reload`.
  - **Fix:** call `captureHandledError`, key the boundary on `pathname`, reload the page on chunk errors, and clear the flag once an import succeeds.
  - **Verify:** a vitest in `src/components/ui/__tests__`.

- [x] **7. Fix broken pSEO listing links** (S, `fix/pseo-listing-links`)
  - **Problem:** `PseoLiveListings.tsx:88-92` builds `slug ?? id`, but the queries at `:191` and `:271` never select `slug`. Attraction cards therefore 404, and event cards take a redirect hop. The attractions query also has no `is_active` filter, and the restaurants query doesn't exclude merged or closed rows.
  - **Fix:** select `slug` and the date fields, build event links with `createEventSlugWithCentralTime`, and add the filters.
  - **Verify:** a unit test on the href builder, then `npm run check-schema`.

- [x] **8. Remove the per-card view-stats RPC** (S, `fix/eventcard-view-stats`)
  - **Problem:** `useViewTracking.ts:47-76` fires an uncached `get_content_view_stats` for every card on every mount. Its own comment says the values are always 0, so the badges it feeds (`EventCard.tsx:82,155,211`) never render.
  - **Fix:** keep `trackView`; drop the fetch and the dead badges.
  - **Verify:** `tests/request-budget.spec.ts`.

- [x] **9. Remove nested `<main>` landmarks** (S, `fix/nested-main-landmarks`)
  - **Problem:** these pages render a second `<main>` inside the one in `App.tsx:443`:
    - `PseoPage.tsx:51`
    - `Auth.tsx:441`
    - `ProfilePage.tsx:95`
    - `Profile.tsx:243`
    - `UserDashboard.tsx:387`
  - **Fix:** change them to `<div>`, and make `tests/accessibility.spec.ts:703-708` loop over these routes.
  - **Verify:** `npm run test:a11y:axe`.

- [x] **10. Give the Support chat a working fallback** (S, `fix/support-chat-fallback`)
  - **Problem:** `useSupportChat.ts:32` calls `support-chat`, which is listed as undeployed. Its error state has no link to `/contact`.
  - **Fix:** add a real `<Link to="/contact">` to the error state and the escalation path.
  - **Verify:** a vitest on the error state.

- [x] **11. Bound the Social "Trending" tab** (M, `fix/trending-tab-queries`)
  - **Problem:**
    - `useSimplePersonalization.ts:107-116` pulls all 24 hours of `user_analytics` with no limit.
    - The fallback at `:256-261` runs `select('*')` with no date or visibility filter, so past events can show as trending.
    - The file also carries 11 `any`s and a bare `console.log`.
  - **Fix:** reuse `useTrending`, or an RPC with a limit plus `applyEventVisibility`.
  - **Verify:** `npm run type-check:app:ratchet`.

## Data and SEO

- [x] **12. Complete the rows the Python crawler writes** (M, `fix/catchdsm-crawler-fields`)
  - **Problem:** `crawlers/catchdesmoines_crawler.py:740-759` writes no `image_url`, `latitude`/`longitude` or `end_date`. It skips `findKnownVenue`, which CLAUDE.md requires of every ingest path.
  - **Fix:** load `known_venues` once, match by normalized name, take `og:image` from the detail page it already fetches (`:408`), and add a pytest.
  - **Verify:** new events show near-zero null coordinates and images.

- [x] **13. Extend the crawl horizon** (S, `fix/crawl-horizon`)
  - **Problem:** `event-crawler.yml:105` defaults `MAX_PAGES` to 5, which is about 60 events. That blocks the month pages (WEB-SEO-041 / WEB-BE-051).
  - **Fix:** raise it to about 25 and stop early when a page yields no new links.
  - **Verify:** the latest date in `sitemap-events.xml` is 3+ months out.

- [x] **14. Reschedule the dedupe cron through `app_secret()`** (S, `fix/dedupe-cron`)
  - **Problem:** `20260612000011_dedupe_cron.sql:15` reads the dead GUC `app.settings.supabase_url`. Ten known duplicate groups (`duplicate-events-baseline.json`) remain.
  - **Fix:** add a new migration that reschedules the job through `app_secret()`. Then do a one-off `dedupe-content` dry run, and let Dj review before anything merges.
  - **Verify:** the baseline `groups` is empty and `npm run check-sitemap-duplicates` passes.

- [x] **15. Use one event filter for every sitemap writer** (S, `fix/sitemap-writers`)
  - **Problem:** `scripts/generate-sitemap.js:28-30` overwrites the sitemap index with 4 URLs. `regenerate-sitemaps/index.ts:109-117` has no date cutoff and no `is_merged` filter. `generate-sitemaps/index.ts:132` drops multi-day events.
  - **Fix:** delete the script and fix `CLAUDE.md:262`, which still tells people to run it. Share one filter module across all writers.
  - **Verify:** a test that every writer uses that filter.

- [x] **16. Settle one email opt-out source before the mail crons revive** (M, `fix/email-optout-source`)
  - **Problem:** 19 functions gate on `profiles.lifecycle_signals.messagingAllowed`, which no client writes (WEB-LEGAL-012). Once the owner actions above land, those functions will mail people who opted out, which is a CAN-SPAM risk.
  - **Fix:** gate everything on `user_email_preferences` plus `newsletter_subscribers.status`, the way `send-weekly-digest/index.ts:145-160` already does. Merge this **before** the Vault secret goes in if possible.
  - **Verify:** a dry run where an opted-out user receives zero sends.

## CI and tooling

- [x] **17. Run every Deno suite in CI and fix lane detection** (S, `chore/deno-lanes`)
  - **Problem:**
    - 11 of the 137 `*.test.ts` files are named by no workflow (`subscription-sync-tests.yml:84-200` lists files one by one, and path filters limit when it runs).
    - `scripts/check-e2e-lanes.mjs` counts a spec as covered when its name appears in a comment, which hides `performance.spec.ts`.
  - **Fix:** discover suites with a runner script plus a `check-deno-lanes` ratchet, and strip comments before matching lanes.
  - **Verify:** the ratchet shows zero unlisted suites, and `check-e2e-lanes` reports 4 orphans.

- [x] **18. CI hardening pass** (S, `chore/ci-hardening`)
  - **Problem:**
    - About 16 workflows pin Node 20, while `.nvmrc` says 22.20.0.
    - `ios-ci.yml:39-40` never runs on PRs into `develop`.
    - The smoke and a11y configs use the `list` reporter only (`playwright.smoke.config.ts:203`, `playwright.a11y.config.ts:47`), so a failed required lane uploads nothing to debug.
    - `.github/rulesets/develop.json` doesn't require the axe check, and `release.json` requires neither smoke nor axe.
  - **Fix:**
    - Use `node-version-file: .nvmrc`.
    - Add `develop` and `release/**` to the iOS PR trigger.
    - On CI, add the HTML reporter and upload `test-results/`.
    - Add the missing required checks to the rulesets.
  - **Verify:** the workflows go green on the PR itself. The ruleset change needs Dj to apply it in GitHub.

- [x] **19. Speed up `npm run validate`** (M, `chore/validate-speed`)
  - **Problem:** about 40 checks run one after another (`package.json:112`). tsc runs cold every time (`strict-ratchet.mjs:86`), and eslint has no `--cache`.
  - **Fix:** add `--incremental` with tsbuildinfo under `node_modules/.cache`, add `eslint --cache`, and run the offline checks in parallel.
  - **Verify:** a warm run comes in well under the current 3m30s.

- [x] **20. Guard migration ordering and app-version drift** (S, `chore/version-guards`)
  - **Problem:**
    - 32 migrations are dated in the future (up to `20261015`), so `supabase migration new` produces out-of-order files.
    - `LATEST_APP_VERSION` (`minSupportedVersions.ts:38-41`) is maintained by hand.
    - `CLAUDE.md:404` still says the store link "goes nowhere", but `version-check/index.ts:52-80` now falls back to the website.
  - **Fix:**
    - Add an offline check that a new migration's timestamp is greater than the current maximum.
    - Add a check that `LATEST_APP_VERSION.ios` equals `MARKETING_VERSION` in `ios/project.yml`.
    - Correct the stale CLAUDE.md lines, including the smoke-lane table.
  - **Verify:** both checks are wired into `validate`.

## Found but not in the 20

- **DOM size on top routes** (WEB-PERF-023, L): `/restaurants` renders 2,665 elements against a 1,500 flag.
- **Screen-reader page title**: the announcement can read the previous page's title after a 100 ms race (`useFocusOnRouteChange.ts:35-74`).
- **Root clutter**:
  - `ios-screenshots/` is 58 MB in git.
  - `export-test-results.js` is broken.
  - `test:visual` points at a deleted spec.
  - The `crash/` logs may hold device data.
- **Android**: the i18n gap (196 hardcoded strings), and a stale parity PRD that shows 55 of 55 open.
- **Ads**: `/advertise` relabels GSC impressions as ad reach (WEB-ADS-012), and there are two price books (WEB-ADS-010).
- **RLS**: anon INSERT on the log tables (`search_analytics`, `csp_violation_logs`, ...). Callers need checking first, and tightening follows the deprecation flow.
