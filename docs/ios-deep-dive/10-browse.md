# 10 Browse: Weekend guide, Attractions, Neighborhoods, Content hubs

Deep dive of 2026-09-28. Paths are relative to `ios/` unless they start with `supabase/` or `scripts/`.
Nothing here was compiled: the container has no Swift toolchain, and every API used was checked
against its definition in the repo. The new XCTests have not been run. `npm run check-mobile-schema`
passes. No migration was added.

## What the feature is

- **This Weekend** (`WeekendView`, `WeekendViewModel`, `WeekendWindow`): the Fri-Sun events guide plus
  featured dining and attractions, pushed from Home and Discover and reachable at `/weekend`.
- **Attractions** (`AttractionsView`, `AttractionDetailView`, `AttractionsViewModel`,
  `AttractionsService`): a paged, filtered list, and a detail screen with directions and reviews.
- **Neighborhoods** (`NeighborhoodsView`, `NeighborhoodDetailView`, `NeighborhoodViewModel`): one page per
  area combining dining, attractions and events, with an opt-in nearby sort.
- **Content hubs** (`ContentHubView`, `ContentHubViewModel`, `ContentHub`): Music, Sports, Outdoors.

The headline problems: the weekend was computed on the device calendar and never rolled over while the
view model lived; festivals that opened before Friday vanished from their own weekend; neighborhoods
substring-matched names over the first 60 rows, so East Village was always empty; the attraction model
dropped a dozen columns, including sponsorship, so paid attractions carried no disclosure; and several
screens read a cancelled load as a failure.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| BROWSE-01 | done | `Models/WeekendWindow.swift`: `current(now:calendar:)` and `day(for:calendar:)` default to `DesMoinesTime.calendar`. The label is `rangeText(calendar:)` plus `var rangeLabel`, formatted with `DesMoinesTime.style`, with an ASCII " - ". A method named `rangeLabel(calendar:)` next to the property was avoided on purpose, so `window.rangeLabel` can never resolve to an unapplied method. `WeekendViewModel` passes the Central calendar explicitly. |
| BROWSE-02 | done | `WeekendViewModel.cacheKey(for:)` gives `weekend-events-yyyy-MM-dd` (Central Friday). `loadInitialData` reloads when the window has moved on; `refresh` clears the rows when it has. Offline with no cache says "You're offline. This weekend's guide will load when you reconnect." `WeekendView` reloads on `scenePhase == .active`. |
| BROWSE-03 | done | `LoadOutcome { ok, failed, cancelled }`; `hasLoadedOnce` is set after a non-cancelled load. Reuses `FavoritesService.isCancellation` (already covers `CancellationError`, `URLError.cancelled` and the NSError form, tested in `FavoritesServiceErrorTests`), so no `CancellationCheck.swift` was added. The featured rails write nothing when cancelled or failed. |
| BROWSE-04 | done | `EventsService.fetchWeekendEvents(window:limit:)` replaces `fetchEventsInRange`: visibility filters, `date < Monday`, `or(date.gte.Fri, end_date.gte.Fri)`, order date then id, limit 250, `LossyEventArray` decode, `truncated`. New `Models/WeekendGuide.swift` `bucket(...)` puts runs that started before Friday in `allWeekend`. The header says "N+ events" when truncated; an "All weekend" section shows up to 6. |
| BROWSE-05 | done | `WeekendView.stateContent` judges error, loading and empty on events only, and keeps the rails under each. New `noEventsCard` with "Search upcoming events" (`.tab(.search)`, since there is no events tab and `.tab(.home)` is a no-op while the guide is pushed on Home) and "Plan with the Trip Planner" (`.discover(.tripPlanner)`). Hub skeleton is gated on `events.isEmpty`. |
| BROWSE-06 | done | `WeekendGuide.picks/free/family/orderedDays/sortForToday`. `WeekendView`: day-jump chips ("Fri 12"), "Our picks" (featured cards), "Free this weekend" and "With the kids" (hidden under 2 rows), "All weekend", upcoming days capped at 10 with "Show all N", ad, "Before the show" / "Daytime ideas" rails, and a folded "Earlier this weekend". Day headers carry `.isHeader` and plural counts. |
| BROWSE-07 | done | `railAccessibilityLabel` on `Event`, `Restaurant`, `Attraction`; `HomeSections` uses them. Every decorative rail link in Weekend, NeighborhoodDetail and ContentHub has a label. |
| BROWSE-08 | done | `AttractionsView(ownsNavigationStack:)`; the Attraction destination is registered only when it owns the stack. Title "Attractions". `HomeView` passes `false`. |
| BROWSE-09 | done | `Models/Attraction.swift`: address, hours_summary, hours, is_indoor, is_kid_friendly, is_free, is_active, accessibility_notes, geo_summary, slug, is_sponsored, sponsored_until; tolerant `init(from:)` in an extension (hours via `try?`); `isActivelySponsored`. `ContentCard.swift`: `isSponsored`, `typeLabel` for unknown types, Free pill, open-status pill. Detail shows "Sponsored" instead of "Featured" for a live placement. |
| BROWSE-10 | done | New `Models/AttractionHours.swift` (Week/DayValue, `parseClock`, `intervals`, `status`, `weeklyRows`) on `RestaurantHours`. A missing day is unknown, not closed; overnight hours from last night still count as open when today is missing. New `Views/Attractions/AttractionPlanVisit.swift`: status line, weekly table (today bold) or summary, fact pills, accessibility notes. `geo_summary` shows above About. |
| BROWSE-11 | done | Detail: Save heart with toasts (limit reached shows no toast), share carries `shareURL` (slug only), `directionsURL` via `Restaurant.directionsURL` (coords, else address), the hand-built Maps URL and duplicate icon are gone, half-star is yellow, Featured/Sponsored shows for unrated rows. |
| BROWSE-12 | done | `fetchAttraction(id:)`: `withRetry`, slug-or-id, `is_active = true`. `fetchFavoriteAttractions` filters `is_active`. `DeepLinkHandler.attractionLinkId` accepts a UUID or a slug of 120 characters or fewer for universal links; the custom scheme stays UUID-only. A deactivated save now drops out of Saved silently; group 03 may want a "no longer listed" row. |
| BROWSE-13 | done | `EventsService.likeContainsPattern`; `VotingService.searchNominees` trims, strips `*`, caps at 100, escapes, and filters attractions on `is_active`. |
| BROWSE-14 | done | `AttractionsViewModel`: injectable `AttractionSearchProviding`; generation bumped before the debounce; cancellation ignored in both catches; a failed refresh keeps rows; `totalCount`, `hasLoadedOnce`, `loadMoreFailed` + `retryLoadMore()`. The row uses `.onAppear` instead of `.task`; the chip row shows the server count. |
| BROWSE-15 | done | The toolbar filter glyph is a Menu of removable active filters plus a destructive "Clear all filters"; `clearFilters` no longer clears the search. Type chips and the rating menu get a 44pt frame; toggles use `.minHitTarget()`. Toasts go through `.toastOverlay`. |
| BROWSE-16 | done | `AttractionsQuery.isFree/isKidFriendly/isIndoor`, `booleanFilters(_:)` (only `true` is sent), `Sort.featured` (is_featured, rating, name, id) as default; "Recommended" sort; Free / Kids / Rainy day toggles and chips. |
| BROWSE-17 | done | `Neighborhood.area: LocationArea`; `matchTerms`/`matches` removed; Downtown / Court Ave, Ingersoll and Valley Junction added. `AttractionsQuery.area` + `attractionAreaFilter` (bbox for districts; comma-anchored `location`/`address` ilike for cities, since attractions has no `city`), combined with search through `combineOrGroups`. The view model queries 20 rows per table by area. |
| BROWSE-18 | done | Fetches return `Result`; `loadError` only when all three fail (never for cancellation, `combinedError`); a failed section keeps its old rows; `hasLoadedOnce`; `ErrorStateView` with retry; `reloadOnReconnect`. The empty state's action is "Search the metro" (`.tab(.search)`): no attractions deep-link destination exists. |
| BROWSE-19 | done | `isLocating` drives a "Finding you..." spinner and disables the button; distances replace the second meta line when the nearby sort is on; highlights are a plain "Known for:" line. |
| BROWSE-20 | done | Hub: inline error when events failed even if dining loaded; Retry has `.minHitTarget()`; `reloadOnReconnect`; empty state action "Search all events"; `hasLoadedOnce`; cancellation leaves rails alone. |
| BROWSE-21 | done | `diningSectionTitle` is "Featured dining" for every hub; the Music blurb promises "upcoming shows", not venue guides; dashes removed from the blurbs. |
| BROWSE-22 | done | `ContentHub.eventOrGroup` (`category.eq.Music`, `category.eq.Sports`, Outdoor plus Festival/Markets not known indoors). `EventsService.fetchEventsByOrGroup(_:limit:until:)` replaces `fetchEventsByCategoryTerms` (no other callers), with id tiebreak and lossy decode. Added beyond the plan: `events.is_indoor` is not in the 2026-08-24 snapshot and the web treats it as optional, so on 42703 the Outdoors hub retries with `eventOrGroupWithoutIndoorFlag`. |
| BROWSE-23 | done | 14-day horizon (limit 60), "Next up" fallback of 5 rows with no horizon; `ContentHub.partition` into Tonight / This weekend / Later; hero "N tonight"; `repartition()` on foreground. |

## Tests added or changed

- `DesMoinesInsiderTests/WeekendTests.swift`: London/Pacific instants, Sunday 23:30 vs Monday 00:30, default calendar, cross-month label, per-weekend cache key.
- `DesMoinesInsiderTests/WeekendGuideTests.swift` (new): bucketing, overlap filter, picks, free, day order, sortForToday, header count.
- `DesMoinesInsiderTests/AttractionModelTests.swift` (new): decoding (full, legacy, malformed hours), sponsorship, rail label, type label, Free pill, directions, share URL.
- `DesMoinesInsiderTests/AttractionHoursTests.swift` (new): parseClock, open / closing soon / closed / unknown, overnight, malformed day, weekly rows.
- `DesMoinesInsiderTests/AttractionsViewModelTests.swift` (new): cancelled page, failed page retry, failed refresh keeps rows, cancelled refresh, total count, clearFilters keeps search.
- `DesMoinesInsiderTests/NeighborhoodTests.swift` (new): areas, attraction area filter anchoring, `combinedError`.
- `DesMoinesInsiderTests/ContentHubTests.swift`: or-groups and indoor fallback, honest copy, partition; name-matching test removed.
- `DesMoinesInsiderTests/DeepLinkHandlerTests.swift`: attraction slug links. `AttractionsSearchFilterTests.swift`: `likeContainsPattern`, default sort, boolean filters.

## Deferred

- G10-26 / G10-31 (weather-aware and date-night Weekend sections): need a weather source and a date-night signal the rows do not carry.
- G10-30 (hub dining near the venues): needs venue coordinates per hub; the rail is honestly titled meanwhile.
- Visit length and nearby rails on attraction detail: no column holds visit length.
- Neighborhood highlights as search links: Search navigation belongs to group 05.

## Rejected

- Sports hub "Game" matches trivia nights: events.category holds only the 15 canonical values since 20260919000003, so the term was dead, not wrong (pruned under BROWSE-22).

## Human follow-up

- Attraction slug links and the share URL need `20260919000008` (attractions.slug) applied. Without it a
  slug link answers 42703 and shows "not available"; UUID links and everything else are unaffected.
- `20260908000001` (events.is_indoor) sharpens the Outdoors hub; the hub works without it.
- Run the iOS test target in CI; none of the above has been executed.
