# 02 Restaurants: Dining tab and restaurant detail

Deep dive of 2026-09-27. Paths are relative to `ios/` unless they start with `supabase/` or `src/`.
Nothing here was compiled: the container has no Swift toolchain. Every change was checked by reading
the code and SDK source it touches (supabase-swift 2.55.2 for `PostgrestError`, `textSearch`, `in`,
`order`), and the new XCTests have not been run. Run the iOS test target before merging.

## What the feature is

The Dining tab: the restaurant list, smart presets, inline filter pills (cuisine, price, area,
rating, dietary, more), rotation and sponsored ordering, in-feed ads; and Restaurant Detail
(header, status, actions, info, hours, local guide, reviews).

The audit found Open Now dead on every row (it decoded `business_hours`, a column only
`business_profiles` has), an Area filter made of 456 street addresses, a dietary filter that only
looked at loaded pages, presets that did nothing or duplicated each other, a toolbar icon that wiped
every filter on one tap, a paywalled "Insider tip" that was a template, "Opening_Soon" shown with a
green check, and the same overlapping-fetch bugs Group 1 fixed for events.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| R1 | done | New `DesMoinesInsider/Models/RestaurantHours.swift`: lenient `StoredHours` (never throws), `OpenStatus` with `line`, and `RestaurantHours` ported from `src/lib/restaurantHours.ts` (intervals, Saturday-night wrap, closing soon at 60 min, "tomorrow"/"Tue" labels, Central week minute). `Restaurant` drops `businessHours`/`dietaryOptions`/`BusinessHours` and decodes `hours_json`, `opening`, `business_status`, `opening_date`, `opening_timeframe`. `isOpenNow(at:)` keeps its signature for Map and Discover. Card pill shows the status line; the list re-filters on `scenePhase == .active`. |
| R2 | done | `RestaurantsViewModel` ports the EventsViewModel structure: generation token (bumped in `resetAndFetch` too), owned `loadMoreTask`, `defer` flag clearing, cancellation is not an error, offset from the request's own offset, deduped appends, errors always recorded, `lastFetchFailed`, `refresh() -> Bool` for the haptic, one rotation seed per list, sponsor arrangement on the first page only. New `RestaurantFeedProviding`. Row `.task` became `.onAppear`. |
| R3 | done | `RestaurantsService`: RPC falls back only on PGRST202/42883; Central-day `rotationSeed(now:)`; `.neq("is_merged", true)` on the table path; `prefixTsQuery` (hubSearchQuery port) with searches on the table path; `deprioritizeUnvisitable` per page on popularity paths. |
| R4 | done | `dietary` on the query, `dietaryKeywords` (= web `DIETARY_KEYWORDS`), `dietaryOrGroup` via `ilikeContains`, or-groups nested with `combineOrGroups`. Open Now auto-loads up to 5 pages until 10 rows show, with a "Checking more restaurants..." row; chip reads `resultCountText` ("N results" / "N+ open now"). |
| R5 | done | Area pill lists `LocationArea`. The service splits `locations` into areas (or-group, table path) and legacy values (`.in("location")`, and the RPC's `location_filter`), so DiscoverViewModel and the RPC contract are unchanged. `availableLocations`/`loadLocations` removed from the VM. |
| R6 | done | `Restaurant.Lifecycle`, `lifecycleLabel`, `openingLabel` ("Opens Oct 12"). Detail: Status row removed, banner for permanently/temporarily closed and opening soon; closed-for-good hides Call/Reserve/Menu. Cards: New / opening date / Closed pill ahead of the hours pill. |
| R7 | done | Presets are Open Now, Date Night, Casual ($-$$), Brunch, Healthy (web filters) and New & coming soon (`statuses` = newly_opened/opening_soon/announced, ordered by `opening_date`). `RestaurantPreset.available(cuisines:)` trims cuisine presets and hides them until the facet loads. Every filter `didSet` except search and sort clears `activePreset`; the scattered clears in `RestaurantInlineFilters.swift` are gone. |
| R8 | done | Toolbar filter glyph is a `Menu` with a destructive "Clear N filters" and a toast. Featured toggle removed from More; the `featuredOnly` chip now says "Sponsored"; detail shows "Sponsored" (megaphone) for actively sponsored rows instead of "Featured". |
| R9 | done | New `ViewModels/RestaurantDetailViewModel.swift`: refetches the full row, follows `merged_into`, keeps the passed row on failure; save returns a `Result` and the view toasts (guest: "Sign in to save restaurants"); share sends text plus `https://desmoinesinsider.com/restaurants/<slug or id>`. `fetchRestaurant(id:)` queries `slug` for a non-UUID. `DeepLinkHandler` accepts a slug under `/restaurants/` (not `open-now`/`new`/`dietary`); the custom scheme stays UUID-only. New `RestaurantDetailProviding`. |
| R10 | done | Detail order: header, status banner, actions, info, hours, local guide, reviews, ad. Actions: Call, Reserve, Directions, then Website, Menu; `ViewThatFits` to a VStack, VStack outright at accessibility sizes. `Restaurant.dialURL` (extension as a pause, 10/11 digits only), `directionsURL` (URLComponents-style encoding with `& = + ? #` escaped; address fallback), `menuURL`, `reserveURL`/`reserveLabel`. New `Views/Restaurants/RestaurantDetailHours.swift` (today bold, "Hours from Google", Central note). Half star is yellow; About clamps at 4 lines over 240 characters; header image is a VoiceOver button and the name a header; toolbar icons on material circles; rating chips are 44pt in a grid; popover width is `@ScaledMetric`. |
| R11 | done | `RestaurantDetailDiningTips.swift` now holds `RestaurantLocalGuide`: `geo_summary` + up to 6 `geo_key_facts`, free, with an "AI-assisted" disclosure popover, hidden when empty. The paywall wiring, template text and upsell are gone from detail. |
| R12 | done | `CardPill.iconTint`: price text is `.secondary`, rating text `.primary` with a yellow star, status pills tint the icon only. `Restaurant.cardAccessibilityLabel` (spoken price, "rated 4.5" only when rated, status, city). Card meta line shows distance when known. List capped at 720pt. |
| R13 | done | Bare search with no hits falls back to `fuzzy_search_restaurants` with a "Showing close matches" caption; load-more is off while it shows. |
| R14 | done | `RestaurantsViewModel.cacheKey(...)` returns nil for a search (no cache read or write); dietary (`d-`), new openings (`n-1`) and areas are in the key; prefix is now `restaurants2` because the row shape changed. |
| R15 | done | `supabase/migrations/20261008000001_fuzzy_search_restaurants_visibility.sql`: same signature and RETURNS TABLE as 20260822000004, `is_merged IS NOT TRUE`, LIKE-escaped pattern, limit clamped to 0-50, grant re-issued. `npm run check-migrations-parse` passes (445 files); `check-migration-drift` reports only the baseline. |

Deviations from the plan, all deliberate:

- R15: the plan named the file `20260927000003_...`. Migrations up to `20261007000002` already
  exist, and a file dated earlier than the last applied one makes `supabase db push` require
  `--include-all`, so it is `20261008000001`.
- R2: "arrange the first `firstPageCount` rows" is kept as `firstPageIds`. Open Now filters on the
  device, so a raw count does not index the filtered list; the first page's rows are a prefix of it.
- R3: `isMissingFunctionError` reads `PostgrestError.code`, and otherwise a `code` field by
  reflection (as `EventDetailViewModel.isNotFound` does). The test target does not link Supabase,
  so the test throws a local struct with a `code`.
- R1 tests: at Saturday 01:00 with a 02:00 close there are exactly 60 minutes left, which the web
  rule calls closing soon. Those two cases assert `isOpen` and `closesAt == "2 AM"`.
- R9: if the survivor of a merge cannot be fetched, the refetched (merged) row is kept.
- R10: the phone row is gone from Info except for a number `dialURL` refuses, which is shown as
  plain text rather than dropped.
- `Views/Home/HomeView.swift`: `async let restaurantsRefresh: ()` became `: Bool` because
  `refresh()` now returns the outcome. No behaviour change.

## Tests added or extended

New: `RestaurantHoursTests`, `RestaurantsViewModelPagingTests` (stale load-more, failed refilter,
cancellation, first-page sponsor arrangement, dedupe, shared rotation seed, Open Now auto-fill cap
and end, server-side dietary, fuzzy fallback and its guard, cache key), `RestaurantsQueryBuilderTests`
(prefix search, Central seed, missing-function rule, unvisitable ordering, RPC path choice, dietary
and area or-groups), `RestaurantLifecycleTests` (lifecycle, opening label, local guide, card label),
`RestaurantPresetTests`, `RestaurantActionURLTests`, `RestaurantDetailViewModelTests`, and the shared
`RestaurantFeedFakes.swift` (`FakeRestaurantFeed`). `DeepLinkHandlerTests` gained three slug cases;
`testInvalidIDCustomSchemeFallsBackToTab` is untouched and should still pass.

## Deferred

- D1: the free-text `opening` parser is not ported. Rows with only text hours stay unknown and show
  no badge (fail closed); Open Now cannot include them.
- D3: the web's separate sponsor query (`pickDailySponsors`, two boosted slots rotating daily). iOS
  still arranges sponsored rows within page one only.
- D8: a real premium dining-tips feature. No tips column readable by anon was added.
- D11: hashing QueryCache filenames. Shared Platform change; R14 stops search text reaching them
  from Dining only.
- Column projection on the table path. Selecting a column production lacks returns 42703 and blanks
  the list (WEB-QA-003), and there is no production access here to check the list.

## Rejected

- X1: the claim that the table path's descending sorts put NULLs first. supabase-swift's
  `order(_:ascending:nullsFirst:)` defaults `nullsFirst` to false and always sends `.nullslast`
  (PostgrestTransformBuilder.swift), so unrated rows already sort last.
- X2: dropping the `isFeatured` flag from list cards. `Restaurant.cardData` never set `isFeatured`,
  so there was nothing to remove.

## What a human must do

1. Run the iOS test target (`DesMoinesInsiderTests`) on Xcode; none of this has been compiled.
2. Apply `supabase/migrations/20261008000001_fuzzy_search_restaurants_visibility.sql`
   (`supabase db push`). The app works without it; the fuzzy fallback just keeps listing merged
   rows and accepting `%`.
3. Open Now depends on `hours_json` being filled by `auto-enrich-restaurants` (WEB-BE-045). Until a
   row has periods it shows no badge and is excluded from Open Now; check coverage on production
   with `select count(*) filter (where hours_json is not null) from restaurants`.
4. `20260930000001_rotated_restaurants_merged_and_prefix.sql` is still marked written, not applied.
   iOS no longer depends on it (searches take the table path and demotion is client-side).
