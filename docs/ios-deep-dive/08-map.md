# 08 Map: events, restaurants and attractions on a map

Deep dive of 2026-09-27. Paths are relative to `ios/` unless they start with `supabase/` or `.github/`.
Nothing here was compiled: the container has no Swift toolchain. Every change was checked by reading
the code and the SDK surface it touches, and the new XCTests have not been run. The Deno test was
not run under Deno; it was run once through Node 22 with a shim for `Deno.test`/`Deno.readDir` and
the two assert functions, and all 6 cases passed. `npm run check-migrations-parse` passes (452
files) and `check-migration-drift` reports only its baseline.

## What the feature is

The Map tab (`EventMapView`): nearby events, restaurants and attractions as pins, with search, kind
toggles, a time filter and a popup for the tapped pin. Data comes from three RPCs
(`search_events_near_location`, `restaurants_within_radius`, `attractions_within_radius`) around the
user's fix or downtown.

The audit found a map that reloaded and recentred every time it reappeared (throwing away a
search), could not load anywhere but the first centre, fell back to downtown before the permission
prompt was answered, showed merged/hidden/closed rows, counted every restaurant as "open",
built its time stops on the phone's zone, clustered everything always and zoomed forever on dense
blocks, had no route to restaurant or attraction detail and no Directions, unlabelled pins for
VoiceOver, one error string for every state, and sent the precise fix to the server.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| MAP-01 | done | `supabase/migrations/20261013000001_map_nearby_rpcs_visibility_and_clamps.sql` Part A: drops the 4-arg `search_events_near_location` and recreates it with optional `p_until`, `SET search_path`, visibility predicates, Central-day floor or `end_date >= now()`, limit 1-200, radius 0-80467 m, nearest first (no `is_featured` ranking), six appended columns. `EventsService.fetchNearbyEvents(..., until:)` sends `p_until` only when set; the table path applies it as `date <= until`. |
| MAP-02 | done | Part B: `restaurants_within_radius` same shape, filters merged and permanently closed, clamps; new `restaurants_within_radius_v2` (full rows, SECURITY INVOKER). `RestaurantsService`: v2 then v1, table only when the RPC throws (not on `[]`), table path boxed + `is_merged` + distance-sorted. `MapViewModel.restaurantMatches(_:at:)`; closed-for-good never pinned; unknown hours hidden under a time/Open now filter and counted (`restaurantsHiddenUnknownHours`). `isLikelyOpen` deleted. |
| MAP-03 | done | Part C: `attractions_within_radius` adds `is_active IS NOT FALSE`, clamps radius and limit, sets `search_path`. `AttractionsService.fetchNearbyAttractions` takes `radiusMiles` (default unchanged). |
| MAP-04 | done | `loadIfNeeded()` / `refreshIfStale()` (10 min, never with a search showing, never moves the camera); `userMovedCamera` with a programmatic-move flag; `sceneBecameActive()`; `retry()` repeats the search or the area. `MapContentLoading` + `LiveMapContentLoader` + `MapLocationProviding` in `ViewModels/MapContentLoading.swift`. |
| MAP-05 | done | `loadRegion(_:)`, `shouldOfferSearchThisArea` (30% pan or 2x zoom), `radiusMiles(for:)` (1-30 mi), "Zoom in to see places" over 1 degree. "Search this area" capsule under the chips. New `Utilities/LocationPrivacy.swift`. |
| MAP-06 | done | `LocationService.awaitAuthorizationDecision(timeout:)` and a stored `accuracyAuthorization`. `LocationNotice` (.denied / .farAway, 40 mi); both load downtown. Dismissible chip; denied opens Settings. Status change to authorized calls `reloadNearMe()`. |
| MAP-07 | done | New `Utilities/MapTimeFilter.swift` (`MapTimeChip`: available/label/window/probeTime/eventMatches, all on `DesMoinesTime.calendar`). `timeChip` replaces `mapTime`; windows recomputed per refresh; an expired chip resets on foreground. `MapTimeSlider` rewritten; `MapTimeSliderStop` and the private ISO formatters are gone. |
| MAP-08 | done | New `Utilities/MapClustering.swift` (`MapCluster` moved here, `MapRenderItem`, `MapClustering.items`, `shouldListMembers`, zoom floor 0.002). `annotationsVersion` drives recompute, plus zoom level and half-screen pans. Same-spot pins share a bubble that always lists. |
| MAP-09 | done | New `Views/Map/MapPlacePopup.swift` (`MapDestination`, `MapPopupModel`, `MapPlacePopup`, `MapPinLabel`): Details for all three kinds, Directions for all, Call/Website, Central time and "Time TBA", "Happening now", lifecycle and open status, distance, Sponsored. `Views/Components/MapPreviewSheet.swift` deleted (no callers). |
| MAP-10 | done | `MapOverlayState` resolved by pure `resolveOverlay(...)`; per-kind `Result`, failed kinds keep old rows, all-failed touches nothing. New `Views/Map/MapOverlayView.swift` (offline, partial chip, empty area, no results + Clear search, filtered out + ways out, zoom in). Search runs its three calls concurrently. |
| MAP-11 | done | `GeoBoundingBox(minLat:maxLat:minLng:maxLng:)`, `iowaServiceArea`, `isPlausibleMapCoordinate`. Implausible rows get no pin; search fits only plausible rows within 40 mi and reports the rest in the badge. Query trimmed and capped at 100 characters. |
| MAP-12 | done | Map/List segmented toggle (List by default when VoiceOver is running), `MapListView`, `listItems` + `sortListItems(_:chip:)`. Pins labelled with kind, time or status, distance, Sponsored, selected trait and hint; clusters say what they hold. |
| MAP-13 | done | New `Views/Map/MapFilterChips.swift` in a top `safeAreaInset` with the search bar: Events/Dining/Places with counts, Open now, Walkable (0.75 mi; disabled without permission, hidden under approximate location). New `Views/Map/MapPalette.swift`. Tonight ring on event pins. Inflected "N places" badge. One haptic and one VoiceOver announcement per filter change. |
| MAP-14 | done | Chips in a horizontal ScrollView, `.lineLimit(1)` + `.minHitTarget()`, container label "Time filter", pill wraps to two lines. |
| MAP-15 | done | Every nearby and area request goes through `LocationPrivacy.coarse`. |

Deviations from the plan, all deliberate:

- MAP-01: the migration-text test is `supabase/functions/_tests/map-nearby-rpcs.test.ts`, next to
  `surprise-pick-honesty.test.ts`, which is the existing harness for this, and it is added to the
  Deno lane in `.github/workflows/subscription-sync-tests.yml`.
- MAP-01/02: every column in the two plpgsql RPCs is cast to its declared type. 20260919000005
  records `latitude` as double precision on events and real on restaurants, the opposite of what
  the old RETURNS TABLEs declared, and plpgsql's RETURN QUERY raises 42804 on that mismatch. If
  production matches that comment, both old RPCs have been failing and every client was on its
  table fallback. Not verified (no production access).
- MAP-09: one `navigationDestination(for: MapDestination.self)` instead of separate `Restaurant` and
  `Attraction` registrations; the popup and the list push the same value.
- MAP-10: `resolveOverlay` takes `failedKinds` rather than raw results, and `.filteredOut` gained
  `hiddenByQuickFilters`. A failed kind in a SEARCH is emptied instead of kept, because nearby
  rows left under a search read as matches; nearby loads keep them as specified.
- MAP-04: "a search is showing" is `activeQuery` (the submitted query), not `searchText`.
- MAP-08: the threshold counts the region plus 10%; items are emitted for twice the region so a
  pan short of the half-screen recompute never shows a bare edge. The view resolves render items
  to annotations once (`MapPinItem`) so the Map builder has no optional lookups.
- MAP-13: event pins are filled with `MapPalette.event` and keep their category icon.
- `ios-unused-members-baseline.json` rewritten: `EventMapView.isSearchFocused` was deleted.

## Tests added or extended

New: `MapTimeFilterTests` (Saturday targets, DST, overlap, untimed by day, device in Los Angeles,
tonight to 04:00, now window, chip set), `MapClusteringTests`, `MapRegionTests` (search-this-area,
radius clamp, coarse coordinates, query cap), `MapPopupModelTests`, `MapOverlayStateTests`,
`MapListTests`, `MapRestaurantFilterTests`, `MapQuickFilterTests` (Open now, unknown-hours count,
Walkable, implausible coordinates, tonight ring), `MapViewModelLoadTests` (reappearance keeps a
search, fresh data not reloaded, denied, Omaha, coarse origin, dismissed notice, offline keeps
data, partial, retry repeats the search, clear search, zoom in), and the fakes in `MapFakes.swift`.
`GeoBoundingBoxTests.swift` gained `MapPlausibleCoordinateTests`. Deno:
`supabase/functions/_tests/map-nearby-rpcs.test.ts`. None of the XCTests has been run.

## Deferred

- Per-tile caching of viewport loads. Loads are explicit ("Search this area") and cancel through
  the one `fetchTask`, so there is no request storm to cache against.
- `SurpriseMeService` sends a precise fix too; it belongs to group 7.
- `src/lib/eventQuery.ts` still describes `search_events_near_location` as not applying visibility
  (its D1) and filters the RPC's ids again. Harmless; web lane.
- Android calls the same RPCs and gets the visibility and clamps for free; its own map is not touched.
- Open now and time chips depend on `hours_json` coverage (group 2's human step 3). Until a row has
  periods it is hidden under those filters and counted as "hours unknown".

## Rejected findings

None. The plan passed to this implementer contained only `implement` items, and none turned out
wrong once in the code.

## What a human must do

1. Run the iOS test target (`xcodegen`, then the DesMoinesInsiderTests scheme). Nothing here has
   been compiled; `EventMapView.swift` uses `@MapContentBuilder` with a four-case `switch`.
2. Apply `supabase/migrations/20261013000001_map_nearby_rpcs_visibility_and_clamps.sql`
   (`supabase db push`). The app works without it: the `p_until` call fails and falls back to the
   table path, and v2 falls back to v1.
3. After deploying, check `POST /rest/v1/rpc/search_events_near_location` with
   `{"user_lat":41.59,"user_lon":-93.63,"search_limit":5000}` returns at most 200 rows and none of
   the ids that `events?is_hidden=eq.true` or `events?is_merged=eq.true` return, and that
   `restaurants_within_radius_v2` returns full rows (`hours_json`, `phone`).
4. Run `deno test --allow-read supabase/functions/_tests/map-nearby-rpcs.test.ts` once under Deno.
