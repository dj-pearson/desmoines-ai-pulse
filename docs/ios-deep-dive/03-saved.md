# 03 Saved: the Saved tab (favorites) and the Dashboard

Deep dive of 2026-09-27. Paths are relative to `ios/` unless they start with `supabase/` or `src/`.
Nothing here was compiled: the container has no Swift toolchain. Every change was checked by reading
the code and SDK source it touches (supabase-swift for `PostgrestError`, `in`, `neq`, `is`), and the
new XCTests have not been run. Run the iOS test target before merging.

## What the feature is

The Saved tab: favorites for events, restaurants, attractions and articles, the heart on every
`ContentCard` with `HeartBurstView`, removal with undo, the guest sign-in prompt, and the free-tier
cap (3) with its paywall. The Dashboard (Profile and the iPad sidebar): recently viewed, saved
counts, trip plans, saved searches, For You.

The audit found the Dashboard cancelling its own favorites load, which emptied every heart in the
app; offline saves reported as success and then lost; iOS restaurant and attraction saves in tables
the web never reads (attractions only on the device); the server cap showing a raw error; double taps
slipping past the cap; paging by UUID that hid the soonest event; a show on right now filed as
"Past event"; a failed load shown as "No Saved Items"; a red dot under every unsaved heart; and a
Saved tab that read as a list of old events rather than a plan for the week.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| S01 | done | `DashboardView.load()` awaits both loads. `FavoritesService.isCancellation`, `lastLoadFailed`; every load keeps the previous set on cancellation or error (never `[]`, never the bare local set). |
| S02 | done | `FavoritesService.isMissingTableError` (42P01, PGRST205). Adds and removes fall back to the device only for a missing table and rethrow everything else; the guest article path stays local. |
| S03 | done | Restaurants and attractions read and write `content_favorites` (`ContentFavoriteRow`, `ContentKind`). Restaurant loads union the legacy `user_restaurant_interactions` favorites (errors ignored) and the per-user device ids, then upload device-only ids (23505 counts as uploaded, PT402 stops). Removes also delete the legacy row (best effort). Nothing writes the legacy tables any more. |
| S04 | done | `isServerCapError` (PT402 or hint `upgrade_required`); `mapCapError` posts `.favoritesLimitReached` and returns `.limitReached`, wrapped round every user insert. |
| S05 | done | `inFlightIds`, `pendingAddCount`, pure `wouldExceedCap`, `isInFlight(kind:id:)`. A tap on an in-flight heart is ignored and the heart dims. |
| S06 | done | `supabase/migrations/20261009000001_favorites_cap_hardening.sql`: per-user advisory lock, `count(DISTINCT event_id)`, UPDATE triggers, and an insert/update trigger on `user_restaurant_interactions` guarded by `to_regclass`. Legacy rows already in `content_favorites` are not counted twice. `npm run check-migrations-parse` passes (446 files); `check-migration-drift` reports only the baseline. Deno assertions added to `supabase/functions/_tests/plan-limit-enforcement.test.ts`. |
| S08 | done | Idempotent `addFavorite`/`removeFavorite(kind:id:)` (new top-level `FavoriteKind`); pending-removal marks hide items from every `is*Favorited` and from `totalFavoritesCount`. The commit clears the undo toast before its request and is skipped when the mark was cleared (undo or a re-save). Failures restore the row and toast via `transientError`. |
| S09 | done | `fetchFavoriteEvents/Restaurants/Attractions(ids:)`, chunks of 100, 500 cap, `LossyEventArray` for events. The VM loads all kinds concurrently under a generation token; paging state and load-more calls are gone. Old page functions kept, unused. |
| S10 | done | `Event.isOver(at:calendar:)` (timed: end_date or +3h; untimed: end of the Central day; midnight end_date covers that day). Undo re-inserts through the VM's sort, so the group is recomputed. |
| S11 | done | `Event.cardDateText` is internal; saved rows use it and show the urgency capsule on `PremiumTokens.urgencyFill`. |
| S12 | done | `loadError`; an error state with Try Again when nothing is on screen, a toast when a refresh fails over content. New empty-state copy with "Find something this weekend". Empty and error states sit in a ScrollView so pull-to-refresh works. |
| S13 | done | `hasLoadedOnce`/`isInitialLoading`; `.task` loads once then reconciles; `onChange` of the four id sets reconciles; `SavedPlan.diff`. |
| S14 | done | Particles render only while bursting; reset in a no-animation transaction, animate on the next pass. |
| S15 | done | Guests post `.favoritesSignInRequired` (MainTabView presents `AuthView` in a sheet). Burst and success haptic only after a successful add; error haptic on failure. Cards without a toast binding post to the new `AppToastCenter`, rendered by MainTabView. `ContentCard`'s `toast:` is now optional so the default can be detected. |
| S16 | done | `FavoritesLimitBanner.isNearLimit/isAtLimit`. |
| S17 | done | `removeEventFavorites(ids:)`; collapsed Past group with "Clear past events" behind a confirmation. `pastEventFavoriteCount` feeds MainTabView: at the cap with past saves, an alert offers "Clear past events" (opens Saved on Events) or "Go unlimited". |
| S18 | done | New `Models/SavedPlan.swift`: `SavedEventBucket`, `SavedEventGroup`, `arrange`, `weekendHeadline` ("This weekend: N plans, M free"). One section per bucket; past in a DisclosureGroup. |
| S19 | done | New `Views/Favorites/SavedSegment.swift` (`SavedSegment`, `SavedTabRouter`). Segmented picker; Guides section from `fetchFavoriteArticles`; `hasAnyFavorites` counts articles. Dashboard tiles are buttons that set the segment and open Saved. |
| S20 | done | Device keys are `<base>.<uid>`; the unscoped key is the guest store, merged into the user key once on a signed-in load. `reset()` clears memory and the guest key only. `AuthService.purgeLocalUserState()` runs from `signOut()` and the `.signedOut` event. |
| S21 | done | The auth listener loads favorites on `.initialSession`/`.signedIn`. The launch call in `App/DesMoinesInsiderApp.swift` stays: `requestReviewIfEligible()` reads the counts right after it. |
| S22 | done | Visibility filters on the event and restaurant fetches; `unavailableEventIds/RestaurantIds` and a "N saved items are no longer available" row with Remove. |
| S23 | done | Rows are an HStack of a navigation Button (image and text only) and a sibling heart with `minHitTarget`; "Remove from saved" accessibility action and context menu; row haptics removed; removal is announced; the undo window is 10s under VoiceOver; `UndoToast` is one element with an Undo action. |
| S24 | done | Bell per upcoming row (hidden once over), toast wording copied from EventDetailView; "Remind me for all" on This weekend. |
| S25 | done | `SavedPlan.shareText`; toolbar ShareLink and a This weekend ShareLink. |
| S26 | done | Dashboard "Coming up" strip (3 soonest not-over saves, compact cards with urgency); `openingRecentId` guard and spinner; `RecentItem.typeLabel`; "Clear" on Jump back in. |
| S27 | done | Grouped backgrounds, no shadow, `.secondary` captions, restaurant status line (Closed permanently, else the Dining card's status pill), stacked layout at accessibility sizes. |
| S28 | done | `LazyVGrid(.adaptive(minimum: 340))` in the regular size class. |

Deviations, all deliberate:

- S03: `ContentKind` is internal, not private, so the row test can name the content types.
- S04: the background upload of device-only saves stops on PT402 without posting the paywall; a
  paywall popping during a load that the user did not start would be a surprise.
- S18: `arrange` returns `[SavedEventGroup]` (a struct with `bucket` and `events`) rather than a
  tuple array, so `ForEach` has an identity.
- S17: PaywallView has no secondary action, so the cap choice is an alert, as the plan allowed.
- S25: attractions are listed without a link. The web resolves `/attractions/:slug` by slug only and
  the app's `Attraction` has no slug. Restaurants use slug or id, as `RestaurantDetailViewModel` does.
- S26: the `.compact` card variant now shows the urgency capsule. Only events carry urgency and no
  other screen uses `.compact` for events.
- S23: no `.swipeActions` (the list is not a `List`); the context menu carries Remove, Remind and Share.
- S13: reconcile compares against the ids each load asked for, not the rows it got back, so an
  unavailable id is not refetched on every change.
- `MainTabView.routeDeepLink` also moves the iPad sidebar, which otherwise stayed on Dashboard when
  `selectedTab` already equalled the target tab.

## Tests added or extended

New: `FavoritesServiceErrorTests.swift` (cancellation, missing table, server cap, plus
`FavoritesContentRowTests`, `FavoritesCapMathTests`, `FavoritesChunkTests`), `FavoritesStateTests.swift`
(`FavoritesPendingRemovalTests`, `FavoritesLocalKeyTests` including the migrate-on-read merge and
`reset`, `FavoritesReconcileTests`, `FavoritesLimitBannerTests`), `SavedPlanTests.swift` (buckets,
ordering, headline, share text, and `SavedSegmentTests`). Extended: `EventTimeTests` (`isOver`,
`cardDateText` Time TBA), `RecentlyViewedTests` (`typeLabel`). Deno: one test in
`plan-limit-enforcement.test.ts`. None has been run.

Not unit-tested (views or listeners): HeartBurstView, the sign-in sheet, the auth-listener load, the
undo commit ordering. Check them in the simulator.

## Deferred

- S07: RLS on `user_event_interactions` and `user_restaurant_interactions`. No migration creates
  either table's policies, so own-row access cannot be confirmed from this repo. `content_favorites`
  is own-row (20260620000001). See "What a human must do".
- S30: whether past events should stop counting toward the server cap. A product decision; the client
  now makes them easy to clear instead.
- S31: Add to Calendar from Saved rows. The EKEvent builder lives in `EventDetailViewModel`.
- Retiring `user_restaurant_interactions` reads: one release from now, once
  `MIN_SUPPORTED_APP_VERSION` passes this build, per the CLAUDE.md deprecation flow.
- Android still writes restaurant and attraction favorites to the legacy tables (cross-group,
  Platform). Until it moves to `content_favorites`, Android saves show on iOS for restaurants only.

## Review pass fixes

- A re-save during the undo window inserted a second row; at 3 of 3 the server cap refused it and
  the paywall showed for an item the user already had. `addFavorite` now only clears the pending mark
  when the id is still stored.
- A re-save elsewhere during the window left the undo toast up for good and the row hidden. The
  commit now clears the toast and puts the row back.
- The Saved view model outlived sign-out, so the next account saw the previous one's rows until its
  load landed (and kept them if it failed). It is cleared on sign-out.
- Search built `EventCardView`/`RestaurantCardView` without a toast, and those wrappers passed
  `.constant(nil)` on, so their heart feedback still went nowhere. They now pass nil, which routes to
  `AppToastCenter`.
- The sign-in favorites load was awaited inside the auth listener, delaying `isLoading`, and also ran
  on `.initialSession` on top of the app's own launch load. It now runs on `.signedIn` only, detached.
- The cap trigger compared `user_event_interactions.user_id::text`, which cannot use the user_id
  index; it compares uuids now. `content_favorites` gets the same UPDATE-of-user_id trigger as the
  event table.
- A saved heart played the burst's haptic and a second success haptic; the second is gone. A quick
  second burst no longer has its particles cut off by the first burst's reset.
- Removed the paged fetches and `FavoritesPage`, which nothing called after S09.

## Rejected

No plan item in this group was rejected; every implement item was applied.

## What a human must do

1. Run the iOS test target (`xcodegen`, then the DesMoinesInsiderTests scheme). Nothing here has been
   compiled.
2. Apply `supabase/migrations/20261009000001_favorites_cap_hardening.sql` (`supabase db push`). The app
   works without it; the server cap just keeps its race and its legacy-table gap.
3. Run `deno test --allow-read supabase/functions/_tests/plan-limit-enforcement.test.ts`.
4. Check RLS on the two interaction tables:
   `select tablename, policyname, cmd, qual, with_check from pg_policies where tablename in ('user_event_interactions', 'user_restaurant_interactions');`
   Both should restrict every command to `auth.uid() = user_id`.
5. `user_article_interactions` is still missing in production, so saved guides live on the device
   (now per user, and kept across sign-out). Creating that table would sync them; the load already
   merges device ids with server rows.
