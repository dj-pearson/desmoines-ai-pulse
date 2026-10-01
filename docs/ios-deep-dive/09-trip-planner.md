# 09 Trip Planner and itineraries

Deep dive of 2026-09-27. Paths are relative to `ios/` unless they start with `supabase/`, `scripts/`
or `.github/`. Nothing here was compiled: the container has no Swift toolchain, and every change was
checked by reading the code and the SDK surface it touches (supabase-swift 2.x sources for
`select`, `rpc`, `FunctionsError`, `PostgrestBuilder.execute`). The new XCTests have not been run.
The Deno test was not run under Deno; `planning.ts` was run through Node 22 (type stripping) against
every case in `planning.test.ts` and matched. `check-migrations-parse` passes (453 files),
`check-mobile-schema` passes, `check-schema` reports only the pre-existing
`restaurants.business_status` finding.

## What the feature is

TripPlannerView (dates, interests, party, budget, pace, neighborhood), the Home card, and
ItineraryDetailView (day-by-day plan, map, reorder, calendar, share, hotels link), backed by the
`generate-itinerary` edge function, `trip_plans` / `trip_plan_items`, and `get_trip_itinerary`.
Insider gets 5 plans a month, VIP unlimited, free none.

The audit's headline: **trip storage does not exist in production.** The 2026-08-24 snapshot
(`scripts/db-snapshot.json`) has no `trip_plans`, `trip_plan_items`, `get_trip_itinerary` or
`generate_trip_share_code`, although `20251126000001` is in its ledger. `generate-itinerary` had a
storage preflight meant to refuse with 500 `trip_storage_unavailable`, but it probed with
`head: true`, and postgrest-js turns PostgREST's bodyless 404 into a 204 with no error, so it never
fired: every call still went to the model and then failed on the insert. It is a GET now. iOS promoted
the card on Home, sold it on the paywall, and showed "Your generated itineraries will appear here".
The old migration also had an IDOR (`get_trip_itinerary` SECURITY DEFINER, no owner check, callable
by anon), a public-read policy with no `TO` clause, `md5(random())` share codes, and an
`a.category` column that does not exist.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| TP-01 | done | New `Services/TripPlannerAvailability.swift` (`unknown/available/paused`, `pausedMessage`, `isMissingStorage` via `FavoritesService.isMissingTableError`). `TripPlannerService.availability` + `refreshAvailability()`; set to paused by fetchTrips, the usage RPC and a classified `.unavailable` from generate. Planner: paused quota line with `pause.circle`, a non-button label instead of Generate (free users too), form hidden, saved list says it is unavailable. Home hides the card and probes in its `.task`; Dashboard shows the paused hint with no action. |
| TP-02 | done | `supabase/migrations/20261014000001_trip_planner_storage_d1.sql`. Idempotent throughout. Tables verbatim plus `tips`/`packing_list` jsonb; owner-only RLS `TO authenticated` (no `is_public` read path); `trip_plans_guard_immutable` trigger (user_id, ai_generated, created_at, share_code; service role exempt via `auth.role()`); 80-bit share code, service role only; `get_trip_itinerary` SECURITY INVOKER with `a.type`, lat/lng on every branch and `r.slug`, no anon; `reorder_trip_items`; `trip_plan_generations` ledger (RLS on, no policies, revoked from anon/authenticated); `get_trip_planner_usage()` for the Central month. |
| TP-03 | done | `TripPlannerError` gains `signInRequired`, `needsUpgrade`, `monthlyQuota`, `dailyLimit`, `unavailable`, `server`; `TripPlannerService.classify(status:body:)` modelled on AskPulseService. generate() reads `FunctionsError.httpError`. The view opens the paywall for free/`needsUpgrade`, says "still syncing" for a paid tier, and pins the meter + paywall on `monthlyQuota`. |
| TP-04 | done | `fetchTrips()` throws; `usageThisMonth()` calls `get_trip_planner_usage`. The planner shows an offline or "Couldn't load your itineraries." row with Try again, "Couldn't check this month's allowance." when usage fails, and skips the client quota gate then. Dashboard keeps `(try? ...) ?? []`. |
| TP-05 | done | `persistOrder(tripId:day:items:)` calls `reorder_trip_items`; `ReorderParams` + `reorderParams(...)`; `OrderRow`/`orderRows` deleted. |
| TP-06 | done | generate-itinerary counts `trip_plan_generations` from `centralMonthStartUtc`, writes a ledger row after the items insert (logged on failure), returns additive `used`/`limit`. iOS bumps the meter locally on success; delete asks first and says deleting does not refund. |
| TP-07 | done | New `Models/TripShareText.swift`; "Share as text" is synchronous with no network. `share(tripId:)`, `shareURL(for:)`, `shareErrorMessage` and its alert are gone. |
| TP-08 | done | New `supabase/functions/generate-itinerary/planning.ts` (`validateTripRequest`, `centralToday`, `centralEventWindow`, `centralMonthStartUtc`, `sanitizeItems`, `stringList`) and `planning.test.ts`, wired into `subscription-sync-tests.yml`. index.ts: 401 `sign_in_required`; body parsed and validated (400 with code) before the quota count; crisis check still runs on the raw fields; events in the Central window with archived/hidden/merged filters and `event_start_local`; restaurants `is_merged`, attractions `is_active`; the three reads in `Promise.all`; neighborhood prompt line; sanitized items; tips/packing_list stored; `get_trip_itinerary` error logged. iOS `TripPreferences.neighborhood`, `mustSee` no longer used for it. |
| TP-09 | done | New `Models/TripSchedule.swift` (`tripDay`, `ymd`, `clockMinutes`, `calendarWindows`). Calendar entries use Central dates, `end_time` when it parses, after-midnight roll, `calEvent.timeZone`. `TripCalendarExports` stores `[tripId: [eventIdentifier]]` under `trip_calendar_exports_v1` and a repeat asks "These stops are already in your calendar". |
| TP-10 | done | `hasLoaded` + `.task(id: trip.id)` guard; set only on a successful load. Returning from Where to stay keeps the local order and sponsored card. No unit test (view lifecycle). |
| TP-11 | done | `TripContentDetails` decodes lat/lng/name/title/slug. New `Models/TripStopLinks.swift` (`TripMapStop`, `mapStops`, `coordinate` through `GeoBoundingBox.isPlausibleMapCoordinate`). Only stops without a stored coordinate are geocoded (cap 8, results bounded to the service area). Numbered `Marker(monogram:)`. The map section is absent until a marker resolves; tapping opens a full map sheet. |
| TP-12 | done | Linked stops open their listing, swipe/context-menu/VoiceOver Directions via `Restaurant.directionsURL` with `MapPopupModel.mapsBase`, row shows `notes` with a lightbulb when it differs from `aiReason`. Disabled while reordering. |
| TP-13 | done | `TripSchedule.dayTitle` ("Day 1 - Sat, Oct 3"), `timeDisplay`, `timeRange` in Central with the user's clock style. Row time moved into the text column. Header notes "Times are Des Moines time (CT)." when the phone is in another zone. |
| TP-14 | done | New `Models/TripDatePreset.swift`; This weekend / Tomorrow / Next weekend chips (44pt, selected trait). Start from today (Central), end within 14 days and clamped on start change, footer "Up to 14 days.", pickers under Central `timeZone`/`calendar`, dates sent as Central `yyyy-MM-dd`. Default range is this weekend. |
| TP-15 | done | Form sections disabled and interactive dismiss blocked while generating; status line cycles every 4s (static under Reduce Motion) with one VoiceOver announcement. On `generationFailed`/`server`, reload and open a trip created after the tap (30s clock-skew allowance) instead of showing the error. |
| TP-16 | done | Saved trips first as Upcoming/Past (`partition`), Past collapsed to 3 with Show all, "Plan a new trip" header, delete confirmation, delete failure as a toast. |
| TP-17 | done | `packing_list` coding key; tips/packing decode with `try?`. |
| TP-18 | done | Chips: subheadline, `minHeight: 44`, checkmark when on, grid minimum 110, footer copy. |
| TP-19 | done | `TripPlannerHomeCard(isFreeTier:)`: accent fill instead of the gradient, "Insider" capsule for free users, label starts with the visible text. |

Also: `scripts/check-schema-usage.mjs` gains a `PENDING_MIGRATIONS` entry for
`trip_plan_generations` (20261014000001), so the edge function's new reads do not grow
`schema-baseline.json`.

### Deviations from the plan, all deliberate

- TP-01: the probe is a GET of at most one `id`, not `head: true`. supabase-swift decodes a
  `PostgrestError` from the response body, and PostgREST answers HEAD with no body, so a missing
  table would have come back as a generic `HTTPError` and never paused anything.
- TP-12: stops open `DeepLinkResolverView` in a sheet owned by ItineraryDetailView rather than
  through `DeepLinkHandler.shared.open`. MainTabView presents from the root, and the itinerary is
  usually already inside the Home sheet or the post-generation full-screen cover, so the root sheet
  would not appear. The pure `TripStopLinks.destination(for:)` still returns
  `DeepLinkHandler.Destination`.
- TP-09: `calendarWindows` orders by day, then by the order given, not by `orderIndex`. After a
  local reorder the stored `orderIndex` is stale until refetch; the on-screen order is the truth.
- TP-11: the preview's camera stays `.automatic` (reset when markers change). The Des Moines
  region start was for an empty map, and the map is no longer drawn empty.
- TP-13: `timeRange` prints both times ("10:30 AM - 11:45 AM") rather than sharing the AM.
  Foundation's U+202F before AM/PM is replaced with a plain space so share text and comparisons
  stay ASCII. `startTimeDisplay`'s existing test now compares with the formatter; the en_US
  "2:30 PM" assertion moved to `TripScheduleTests` with a pinned locale.

## Tests

New: `TripPlannerAvailabilityTests`, `TripPlannerErrorTests` (literal bodies from index.ts and
`aiQuota.denialBody`), `TripScheduleTests` (process zone set to America/Denver), `TripDatePresetTests`,
`TripShareTextTests`, `supabase/functions/generate-itinerary/planning.test.ts`. Rewritten:
`TripPlannerOrderTests` (RPC params and encoded keys). Extended: `TripPlannerTests` (stored
tips/packing, content_details coordinates) and a new `TripPlannerViewLogicTests` class in the same
file (quota text, partition, recovered trip, map stops, destination, directions, Home card label).

## Deferred

- TP-25 public share page: the D1 migration deliberately has no public read path. The web
  `useTripPlanner.shareTrip`/`getSharedTrip` still write `is_public` and read by share code; after
  D1 the read returns nothing, which matches the fact that `/trips/shared/:code` does not exist.
- TP-26 opening hours in the prompt: restaurants have no hours column in the snapshot.
- Android `TripPlannerRemoteDataSource` still references `trip_plan_items` and reorders the old way;
  Android is outside this group.
- `check-edge-types` reports generate-itinerary among files with fewer errors; the baseline was not
  rewritten here because the same run shows unrelated gains in other files.

## Rejected findings

Only the plan's `implement` items were handed to this pass; none of them was rejected on reading
the code.

## What a human has to do

1. Build and run the iOS unit tests (`xcodegen`, then the DesMoinesInsiderTests scheme). Nothing
   here has been compiled.
2. Apply in this order (plan-stay D1 is satisfied by this file):
   1. `supabase db push` (applies `20261014000001_trip_planner_storage_d1.sql`).
   2. `supabase functions deploy generate-itinerary`.
   3. `npm run check-schema:probe` - `trip_plans`, `trip_plan_items`, `trip_plan_generations`,
      `get_trip_itinerary`, `reorder_trip_items` and `get_trip_planner_usage` must resolve.
   4. `node scripts/check-mobile-schema-usage.mjs --write` to drop the trip tables from
      `.github/mobile-schema-baseline.json` (left untouched here because it reflects production),
      and remove the `trip_plan_generations` entry from `PENDING_MIGRATIONS` in
      `scripts/check-schema-usage.mjs`; regenerate `src/integrations/supabase/types.ts`.
   5. Flip the web `AI_PLANNER_AVAILABLE` flag in `src/lib/tripPlannerStatus.ts`.
3. iOS needs no new binary: the planner un-pauses on its next availability probe after step 1.
4. After deploy, as a signed-in Insider: generate a plan, reorder a day and reopen it (order kept),
   delete it and confirm the meter does not go back up, and check
   `POST /rest/v1/rpc/get_trip_itinerary` with the anon key returns 401/permission denied.
