# 07 Discover: swipe deck, Group Session, Surprise Me, Ask Pulse, Discover hub

Deep dive of 2026-09-27. Paths are relative to `ios/` unless they start with `supabase/` or `.github/`.
Nothing here was compiled: the container has no Swift toolchain. Every change was checked by reading
the code it touches, and the new XCTests have not been run. The Deno tests were not run under Deno
either; `picks.test.ts` and the two migration-text tests were run once through Node 22 with a shim
for `Deno.test`/`assert`, and all passed. Run the iOS test target and the Deno lane before merging.

## What the feature is

The "fun" half of the app. The swipe deck (`DiscoverView`, `SwipeCardStack`, `SwipeCard`,
`DiscoverViewModel`) deals events and restaurants and writes `swipe_interactions`, which feed For You.
Group Session hosts or joins a shared deck by code (`generate_swipe_session_code`,
`get_swipe_session_matches`). Surprise Me reveals one pick from `get_surprise_pick`, with a labelled
sponsored roll every fourth time. Ask Pulse is a chat over the `discover-chat` edge function. The
Discover hub is the iPad sidebar's Discover page.

The audit found a deck that stalled on "You've seen everything" with pages left, a swipe that could
not be taken back, guests told "check your connection" for every like, Group Session unable to host
at all, Surprise Me and Ask Pulse surfacing hidden, merged and closed rows, Ask Pulse answering a
crisis response with "Want to try a different vibe?", and a hub with no way into any of it.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| D7-01 | done | `SwipeSessionService.decodeSessionCode(_:)` reads the RPC's bare JSON string (fallback `[{"code"}]`), so Host works. `join` rethrows everything except 23505 (`isAlreadyJoined`, read structurally so a test can stub it). `lookupSession` adds `expires_at > now`. `Session.hostUserId`; `GroupSessionView` restores the lobby from `activeSession` for the host. New `GroupSessionFeature.isEnabled = false` hides the toolbar entry in `DiscoverView` until D7-DEF-01. |
| D7-02 | done | `supabase/migrations/20261012000002_swipe_sessions_identity_and_matches.sql`: BEFORE INSERT trigger binds `user_id` to `auth.uid()` (guests: `anon_id` required, at most 64 chars), trims `display_name` to 40, caps a session at 12 (an existing member still gets 23505). `get_swipe_session_matches` is plpgsql SECURITY DEFINER behind a participant-or-host check and skips merged/hidden/archived events and permanently closed restaurants. Code generator uses `floor(random() * 36)`. Policies untouched. |
| D7-03 | done | Injected `hasSwiped` seam. Batch fetchers return cards added; each lane keeps paging while a page adds nothing, up to `maxEmptyPages` (5). `isExhausted` per mode. Empty state: "Loading more..." / "Keep looking" (`loadMoreIfNeeded`) until exhausted, then "Start over" (`startOver()` calls new `SwipeInteractionService.forgetSeen(itemTypes:)`); "Try again" on failure. |
| D7-04 | done | `advance(removing:)` removes the swiped card by id, nothing if absent. `reload()` and boost clear `isLoading` only when their generation is still current. |
| D7-05 | done | `DiscoverMode.mixed.title` is "This week" (rawValue still `mixed`). Restaurant batches drop `.closedPermanently`/`.closedTemporarily`. Home's Swipe opens `.mixed` unless a Home filter is active. |
| D7-06 | done | Boost skips `.other` events and no-op boosts (advances instead of resetting). `boostedFields`, `FilterConstraint`, `ActiveConstraint`, `activeConstraints`, `canRemove`, `removeConstraint`, `clearAllConstraints`. A boost that finds nothing reverts and sets `boostFellBack` (toast). Chips are buttons with an x, "More: " for boosted fields, Clear when more than one; entry constraints stay locked under `lockMode`. |
| D7-07 | done | `SwipeInteractionService.record` returns the `client_event_id`; new `unrecord` drops the local key and either the queued row or the sent row (best-effort delete). View model: `SwipeUndo`, `undoStack` (5), `canUndo`, `undo()`; a record or save that finishes after the undo is backed out too (`undoneTokens`). A 44pt Undo button, a VoiceOver "Undo" action and an "Undid ..." announcement. Boost, reload and mode change clear the stack. |
| D7-08 | done | `DiscoverViewModel.classify` (limit / signIn / other). Guest likes go to `guestLikes` with one "Sign in to keep your likes" toast, a "Liked N - sign in to save" row with Sign in (local `AuthView` sheet), and `replayGuestLikes()` on sign-in. Surprise Me's save opens a local sign-in sheet and resumes the save on dismiss. |
| D7-09 | done | `PendingSwipe` is internal with optional `userId`. Guests are not queued. Queue capped at `maxPending` (500) via `trimmedQueue`; `partitionForFlush` sends own and legacy rows, drops other accounts' rows; at most 100 per upsert. `AuthService.purgeLocalUserState` calls `SwipeInteractionService.shared.reset()`. |
| D7-10 | done | Event subtitle is `Event.cardDateText` (Des Moines day and time, " - Time TBA"). `SwipeItem.badges` (urgency, Free, restaurant open line) render as capsules and are in the VoiceOver label. Text block capped at `accessibility2`, title `minimumScaleFactor(0.8)`. |
| D7-11 | done | SwipeCard's "swipe right" hint removed; one hint on the stack listing the actions. `SwipeCardStack.commitDirection(translation:predicted:threshold:)` (pure). Selection tick when a drag arms a direction; success for Save, light for Skip. Announcement after a commit and VoiceOver focus moves to the next card. |
| D7-12 | done | Intro sheet scrolls, `Spacer(minLength: 12)`, medium and large detents, drag indicator. |
| D7-13 | done | `Response` decodes `crisis`, `message`, `resources` (`CrisisResource`), leniently. A crisis turn shows the server message and `CrisisResourcesCard` with Call 988 / Text 988 links built client-side, warning haptic, no picks, follow-ups or sponsored card. |
| D7-14 | done | `AskPulseError` is signInRequired / quota / paused / server / notConfigured; `classify(status:body:)` reads the function's body. Guests get a sign-in card instead of the composer, chips open sign-in, no auto-focus. Quota: banner plus "See plans" (new `PaywallContext.askPulse`) only when `upgradeHint` is set, send disabled until reopened. Paused: no upsell. |
| D7-15 | done | New `supabase/functions/discover-chat/picks.ts` (`eventStillOnOrFilter`, `sanitizeText`, `validatePicks`, `sanitizeFollowUps`, `recordSeen`). `index.ts`: events filter merged/hidden/archived and use the still-on arm when the model gives no lower bound; restaurants filter merged and closed (`isRestaurantOpenForBusiness`); `openNow` removed from the tool schema; picks must name a row a tool returned and are enriched from it; a Central date context turn; SYSTEM_PROMPT says tool results are data. |
| D7-16 | done | `Pick` gains optional title, imageUrl, startsAt, endDate, venue, cuisine, priceRange. `ChatMessage.picks`/`modelContent`; each assistant turn keeps its own cards; the model is sent `modelSummary` and the last 10 turns (`requestMessages`). `ChatBubble`/`TypingIndicator` now used (with `embedded`). Location sent when authorized. Input capped at 500 with a counter from 400. Whole-card `NavigationLink`, thumbnail, meta line, ShareLink. An unanswered question is removed and its text restored on error. |
| D7-17 | done | `surprise(at:excluding:)` returns nil on no rows; `firstPick`, `Params` (omits empty `p_exclude_ids`, retries without it if the backend predates D7-18), `OutcomeRow` with `user_id`. View clears the old pick on each roll, excludes the last 10, resolves the pick (one silent re-roll if it is gone), shows a when/where line, See details and card tap push detail (tracks `opened`), ShareLink, "Save it" stays with a toast. No-result copy has no Settings mention. |
| D7-18 | done | `supabase/migrations/20261012000001_surprise_pick_visibility.sql` (one transaction): drops `(REAL, REAL)`, creates `(REAL, REAL, UUID[])` all defaulted; visibility on every events read, still-on events, open non-merged restaurants, no `is_featured`, `p_exclude_ids`, 30-day skips and 7-day tried_another excluded for signed-in users, templates `upcoming_event`/`popular_restaurant`. `20261012000003_surprise_outcomes_attribution.sql`: fills `user_id` from `auth.uid()`. |
| D7-19 | done | `PlayDestination` (Swipe, Surprise me, Ask Pulse) as a play row above the hub grid: stacked on compact, a row on regular width; presented the way Home presents them. |
| D7-20 | done | New `Views/Discover/SwipeRecapView.swift` with `SwipeRecap.shareText` (at most 10 lines). "Saved N - see them" opens it; it opens once by itself when the deck is exhausted with likes. |

Deviations from the plan, all deliberate:

- D7-01: the `isAlreadyJoined` test throws a local struct with `code`, not a `PostgrestError`. The test target does not link Supabase (same as `FavoritesServiceErrorTests`).
- D7-02: a guest (no `auth.uid()`) cannot prove membership, so `get_swipe_session_matches` returns nothing for anon participants. Service-role inserts bypass the trigger.
- D7-10: `DesMoinesTime.localTimeString` is `HH:mm:ss`, not a display time, so the subtitle reuses `Event.cardDateText` (group 1), which also appends " CT" off Central.
- D7-11: focus is an `@AccessibilityFocusState` keyed by card id rather than a Bool bound to index 0, so it can move to the next card.
- D7-14: a 429 with no `code` is the per-IP burst limiter, not the daily quota, so it shows its own text (`.server`) rather than the quota banner.
- D7-18: the old function also selected `e.description`, which events does not have (only `enhanced_description`/`original_description`). plpgsql resolves that at run time, so every roll that took the event branch errored. Both event selects now COALESCE the pair.
- D7-19: no "N saved this week" subtitle; there is no cheap local count to back it.
- D7-12 and the intro/tile styling: the brand gradient and the border-plus-shadow on the action buttons were dropped in the touched views.

## Tests added or extended

New Swift: `DiscoverFakes.swift` (shared fakes and `DiscoverViewModel.testing`), `DiscoverUndoTests`, `SwipeSessionServiceTests`, `SwipeQueueHygieneTests`, `SwipeItemFormattingTests`, `AskPulseResponseTests`, `SurpriseMeServiceTests`, `DiscoverHubPlayTests`, `SwipeRecapTests`. Extended: `DiscoverDeckTests` (paging past seen pages, the cap, removing the swiped card, the spinner across reloads, closed restaurants, "This week", boost category rules, removable filters and fallback, locked entry filters, save classification, guest likes), `SwipeCommandTests` (`commitDirection`), `PaywallCopyTests` (`.askPulse`).

New Deno: `supabase/functions/discover-chat/picks.test.ts`, `supabase/functions/_tests/swipe-session-hardening.test.ts`, `supabase/functions/_tests/surprise-pick-honesty.test.ts`, all added to `.github/workflows/subscription-sync-tests.yml` next to `conversation.test.ts`.

## Deferred

- D7-DEF-01: swiping inside a Group Session (session_id on swipes, polling matches, an "it's a match" moment). Until then `GroupSessionFeature.isEnabled` stays false.
- D7-DEF-02: tightening the `swipe_session_participants` and `swipe_sessions` SELECT/INSERT policies. Android reads those tables directly, so it follows the deprecation flow after the trigger ships.
- D7-DEF-06: a real hours-aware "Tonight" lane; renamed "This week" for now.
- D7-DEF-07: interleaving boosted and general cards after "More like this".
- D7-DEF-08: landscape re-layout of the intro sheet.
- A server clamp on client-sent `created_at` for swipes (the plan folded the idea into D7-09; iOS still does not send it).
- Guest swipes are no longer queued, so they are not uploaded after sign-in; only guest likes are replayed as favorites.

## Rejected findings

- "Restaurants are the same 20 cards forever": `.popularity` goes through the daily rotated RPC, so page 1 changes daily.

## What a human must do

1. Apply `20261012000001_surprise_pick_visibility.sql`, `20261012000002_swipe_sessions_identity_and_matches.sql` and `20261012000003_surprise_outcomes_attribution.sql`, in that order. 0001 drops and recreates `get_surprise_pick` inside one transaction and ends with `NOTIFY pgrst, 'reload schema'`; shipped iOS and Android two-argument calls resolve to the new function. Check once afterwards: `SELECT * FROM get_surprise_pick();` returns a row and `SELECT * FROM get_surprise_pick(NULL, NULL, ARRAY[]::uuid[]);` does too.
2. Deploy `discover-chat`. The SYSTEM_PROMPT changed, so the prompt cache is rebuilt once.
3. Run the iOS unit tests (none were compiled here) and the Deno lane.
4. On a device with VoiceOver: swipe via the Save/Skip/Undo actions and confirm the announcement and the focus move; at the largest text size open the intro sheet and a swipe card.
