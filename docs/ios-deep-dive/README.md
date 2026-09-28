# iOS deep dive: what changed and what you have to do

Twelve feature groups, each audited from four angles (UI/UX, break-it, abuse,
product/data), then planned, implemented and adversarially reviewed. One report
per group in this folder; `00-feature-map.md` is the map. iOS CI (Xcode 26
build plus the full unit-test suite) was green on every group it had finished
at the time of writing; see PR #416 for the current head.

| # | Group | Report | Worst thing it fixed |
|---|---|---|---|
| 1 | Events | `01-events.md` | 6 of 12 category chips returned nothing; iOS reviews skipped moderation |
| 2 | Restaurants | `02-restaurants.md` | Open Now read a column restaurants doesn't have, so it never worked |
| 3 | Saved | `03-saved.md` | Dashboard cancelled its own favorites load and emptied every heart |
| 4 | Account | `04-account.md` | Email sign-up always ended in a raw Postgres error |
| 5 | Search | `05-search.md` | Saving a web search's alert bell silently killed its email alert |
| 6 | Monetization | `06-monetization.md` | `verify-apple-receipt` granted VIP to anyone without asking Apple |
| 7 | Discover | `07-discover.md` | Ask Pulse answered a crisis response with "try a different vibe" |
| 8 | Map | `08-map.md` | Every restaurant pin counted as open; nearby RPCs unclamped for anon |
| 9 | Trip Planner | `09-trip-planner.md` | Sold on iOS while its storage doesn't exist in production |
| 10 | Browse | `10-browse.md` | Weekend ran on the phone's clock; East Village could never match |
| 11 | Guides | `11-guides.md` | Any signed-in user could publish a featured article; reviews never loaded |
| 12 | Platform | `12-platform.md` | Every shared web event link opened an empty Home screen |

## Checklist

### 1. Before relying on any of it

- [ ] Confirm these older migrations are really applied in production. The ledger
      has been wrong before (the trip planner storage is ledgered and absent):
      `20260919000008` (attractions.slug), `20260919000009` (restaurants hours and
      business_status), `20260919000010` (increment_article_view),
      `20260902000013` (deal_redemptions), `20260920000001` and `20260926000002`.
      `npm run check-schema:probe` answers this.

### 2. Apply the new migrations (`supabase db push`)

All additive and idempotent. The app degrades gracefully without each one; the
per-group reports say how.

- [ ] `20261007000001` user_ratings moderation guard
- [ ] `20261007000002` stop copying submitter contact onto events (with 20260920000001 / 20260926000002)
- [ ] `20261008000001` fuzzy_search_restaurants visibility
- [ ] `20261009000001` favorites cap hardening
- [ ] `20261010000001` profiles protected columns
- [ ] `20261011000001` fuzzy_search_events escaping and typos
- [ ] `20261012000001` / `0002` / `0003` Surprise Me visibility, swipe sessions, outcomes (in order)
- [ ] `20261013000001` nearby RPCs visibility and clamps
- [ ] `20261014000001` trip planner storage (then `supabase functions deploy generate-itinerary`)
- [ ] `20261015000001` articles publish guard (review its NOTICE count)
- [ ] `20261015000002` votes guard and results
- [ ] `20261015000003` review author names and report bridge
- [ ] `20261015000004` deal redemption (after `20260902000013`)
- [ ] `20261015000005` device_tokens

### 3. Edge functions (auto-deploy on merge to `main`)

`appstore-server-notifications-v2`, `discover-chat`, `generate-itinerary`,
`get-sponsored-pick`, `log-error`, `register-device-token`,
`validate-ios-receipt`, `verify-apple-receipt`. Every change keeps the existing
request and response fields; older binaries keep working.

### 4. Only you can do these

- [ ] Real Team ID in `public/.well-known/apple-app-site-association` and
      `ios/project.yml` `DEVELOPMENT_TEAM`. Universal links do nothing until then.
- [ ] Real App Store id in `version-check/index.ts` and `Config.appStoreId`.
- [ ] App Store privacy questionnaire to match the updated privacy manifest.
- [ ] RLS check on `user_event_interactions` and `user_restaurant_interactions`
      (query in `03-saved.md`).
- [ ] On-device passes listed at the end of `04-account.md`, `05-search.md`,
      `07-discover.md`.

### 5. Pre-existing CI failures on `main` (not caused by this work)

Documented with fixes in the PR #416 comment: Deno lane needs
`DENO_NO_PACKAGE_JSON: "1"`; `js-yaml` audit advisory; types drift against the
2026-08-24 snapshot; six type errors in `aiQuota.test.ts`; web axe and
brewery-trail smoke failures.

## Deferred

Each report ends with its deferred list. The larger ones: the full group swipe
game, weather-aware weekends and trips, sandbox-receipt gating, a uniqueness
index on Apple original transactions, remote push (APNs sender), and tightening
the swipe-session RLS once `MIN_SUPPORTED_APP_VERSION` excludes the Android
builds that read those tables directly.
