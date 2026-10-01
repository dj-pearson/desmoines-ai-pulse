# 05 Search: Search tab, Saved Searches, Siri/Shortcuts intents

Deep dive of 2026-09-27. Paths are relative to `ios/` unless they start with `supabase/` or `src/`.
Nothing here was compiled: the container has no Swift toolchain. Every call was checked against its
definition in this repo, or in the supabase-swift source for the builder methods (`delete().eq().select()`,
`update().eq().select()`, `PostgrestTransformBuilder.select(_:)`). The new XCTests have not been run,
and the SQL has only been parsed (`npm run check-migrations-parse`: 448 files pass).

## What the feature is

The Search tab (one search across events, restaurants and attractions, with suggestions, recent
history, voice dictation, result tabs and empty/error states), Saved Searches (save a query, email
alerts for new event matches, paywall, results screen) and the Siri / App Shortcuts intents in
`PulseAppIntents.swift` that open Search or Ask Pulse.

The audit found an attractions query that interpolated the typed text into PostgREST's `or=` (a
comma gave a 400 that showed as no attractions, and `_` matched every row) and listed soft-deleted
rows. `fuzzy_search_events` took an unescaped pattern and an unbounded limit from anon. Every failed
request read as "No Results". Every debounced prefix ("piz") and dictation partial went into Recent.
"tonight", "free", "open now" and area names were searched as literal words, so the built-in
suggestions and both Siri intents searched for text no row has. Tapping the alert bell on a search
saved on the web overwrote its filters and moved it out of the email job. The save button showed
the paywall to signed-out users, and one account's saved searches stayed loaded for the next.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| S01 | done | `Services/AttractionsService.swift`: `searchOrFilter(_:)` trims, caps at 100 characters, and builds four quoted branches (name, type, location, description) through `EventsService.ilikeContains`. `.eq("is_active", true)` is on the list query, `fetchAttractions(types:)` and the nearby table fallback; `fetchAttraction(id:)` is untouched so a deep link to a retired row still opens. |
| S02 | done | `supabase/migrations/20261011000001_fuzzy_search_events_escape_typos.sql`: same signature and columns as 20260925000001. Trimmed query, under 2 characters returns nothing, LIKE-escaped pattern, limit clamped to 0-50, and a `word_similarity >= 0.5` arm on title and venue for queries of 4+ characters. Visibility and upcoming predicates unchanged, grant restated. |
| S03 | done | `SearchViewModel`: legs return `Result<Leg<T>, Error>` (cancellation counts as an empty success). `failedTabs`, `allFailed`; when every leg fails the previous rows stay. `normalizedQuery` trims, and a search needs 2 keyword characters or a filter. `SearchView`: spinner only with nothing on screen, inline spinner in the tab row and dimmed list while a search runs, "Search isn't responding" state with Try again, offline Retry re-runs instead of clearing, a per-tab "Couldn't load ... - Try again" row, re-run on reconnect, error haptic when all failed. |
| S04 | done | History is written by `commitToHistory()` only: on submit, on a result tap, after a suggestion or recent row, and when dictation finishes. `recordsHistory = false` for `SavedSearchResultsView`. `SearchHistoryService.record` replaces the front entry when the new query extends it ("jaz" then "jazz"). |
| S05 | done | New `Models/SearchQueryParser.swift`: `SearchFilters`, `ParsedSearch`, `SearchQueryParser.parse` (whole words, longest phrase first, dangling in/at/near/on/the dropped, "Des Moines" dropped as noise), `presetSlug`, `preset(slug:)`, `areaSlugs`, `area(slug:)`, plus `SearchFilterChip` and chip removal. The VM merges parsed and explicit `filters` (explicit wins) and sends dates, `freeOnly`, areas and category to `EventsQuery`; restaurants run only with words, an area or Open Now; attractions only with words. The fuzzy fallback runs only for bare keywords. Removable chips sit under the tab row; the Try Searching list is the plan's five. |
| S06 | done | `PulseIntentDispatcher.Pending.searchRoute` (in `PulseAppIntents.swift`) maps Find Restaurants / Find Events to filters, field text and tab, capping each parameter at 100 characters; an unknown area or category becomes a keyword. `SearchView.applyIntent` pops to the root and applies it. `clearSearch()` resets filters. |
| S07 | done | `selectTab(_:)` and `userPickedTab` (reset when the query changes, not on a re-run); `preferredTab` picks the hinted tab, else, when the current tab is empty, an exact name match or the first tab with rows. `fuzzyTabs` drives "Showing close matches for ..."; `hasMore` drives "20+" badges and "more than 20 results". |
| S08 | done | Empty screen: Tonight / This weekend / Free / Open now chips, category tiles that set `SearchFilters(category:)` ("Show Music events"), and "Your saved searches" (up to 6) that push `SavedSearchResultsView`. `SuggestionChip` is now internal; the unused `RecentSearchesList` is deleted. |
| S09 | done | `SavedSearch` decodes `filters` twice (typed and a verbatim `rawFilters`), plus `search_type` and top-level `alerts_enabled`. `query` reads `query`/`q`/`search`; `structuredFilters` maps `category`, `preset`, `price`, `location`. `SavedSearchFilters` gains optional `q`, `preset`, `price`, `category`, `location`, written on save by `forSave(query:tab:parsed:)`. `SavedSearchService.setAlerts` sends the row's own filters with only `alerts_enabled` changed, scoped by `user_id`, returns the row count, and only ever promotes `search_type` to `event_list`. `SavedSearchResultsView` seeds filters and text, with a "saved on the web" state when both are empty. |
| S10 | done | No push prompt. `alertCount` counts eligible rows only. `searchType(tab:hadEventResults:)` makes a search that found events an `event_list`. The bell is a toggle for eligible (or promotable) rows and a caption otherwise; every outcome gets a toast, alert or paywall. Copy says email, nightly, events. |
| S11 | done | `SaveSearchButton`: filled bookmark and "Saved search: <name>" for a saved query, tap to remove with confirmation; sign-in sheet for guests; one `sheet(item:)` with the next route presented from `onDismiss`; limit alert with "Upgrade to VIP" below VIP; `PT402`/`upgrade_required` maps to the paywall; name capped at 120, query at 200; toast owned by `SearchView`. |
| S12 | done | `reset()` and `loadedForUserId`; `AuthService.purgeLocalUserState` calls `SavedSearchesViewModel.shared.reset()`. A failed reload keeps rows only for the same user. `deleteSavedSearch(id:userId:)` returns the count and 0 restores the row. The list has loading and error-with-retry states, a delete confirmation, toasts, and `.task(id:)` on the user id. |
| S13 | done | `SpeechDictationService`: a generation per `start()` and `shouldApply(callbackGeneration:current:)`; the cancel error after a user stop is ignored; `lastFinalTranscript`; `taskHint = .search` and `contextualStrings` (areas, categories, eight venues); `permissionsGranted()` and `refreshPermissionStatus()`, re-checked on tap and on `scenePhase == .active`. Unavailable/error gives a toast. |
| S14 | done | `AskPulseIntent.query` is optional; `resolvedQuery` trims, caps at 300 and falls back to "What's good to do in Des Moines tonight?". New `TonightIntent` sends `.findEvents(category: nil, datePreset: "tonight")` and owns the "What should I do tonight" phrase. |
| S15 | done | `searchText` and `filters` ignore equal assignments. `SavedSearchResultsView` seeds once, spins only when empty, has `.refreshable`, an all-failed state, and puts the saved tab's group first. |
| S16 | done | Tab labels use `ViewThatFits` (icon+name+count, name+count, icon+count) with `lineLimit(1).minimumScaleFactor(0.8)`; at accessibility sizes the row scrolls. Recent "Clear" has `minHitTarget()`, a hint, and a confirmation dialog (ToastMessage has no action, so no undo). |

Deviations, all deliberate:

- S09: `rawFilters` is `[String: SavedSearchJSON]`, a small Codable enum in `Models/SavedSearch.swift`,
  not supabase's `AnyJSON`. The test target does not link Supabase, so tests could not build one.
- S09: `alertsEnabled` reads the top-level column only for `event_list` rows. That column is
  `NOT NULL DEFAULT true` (20260623000003), so every iOS row saved before IOS-AUDIT-FEAT-024 reads
  true there while its own flag says false. `testTopLevelAlertsWins` uses an `event_list` row.
- S06: the routing is `PulseIntentDispatcher.Pending.searchRoute`, not a `SearchView` static, so the
  test needs no view.
- S03/S07: each leg returns a `Leg` (rows, fuzzy, hasMore) rather than a bare array.
- S10: the bell also shows on a promotable row (an old iOS Events search stored as `advanced`).
- S05: with Open Now the restaurants leg asks for 40 rows, since the filter runs on the device.
- The suggestions screen stays up while the field holds one character, instead of an empty list.

## Tests added or extended

New: `AttractionsSearchFilterTests`, `SearchQueryParserTests`, `PulseIntentRoutingTests`,
`SavedSearchesViewModelTests`, `SpeechDictationGenerationTests`. Extended: `SearchRefreshTests`
(failure states, whitespace, history on intent, parsed filters reaching `EventsQuery`, tab
selection, fuzzy flag, hasMore, equal assignment), `SearchHistoryServiceTests` (prefix replacement),
`SavedSearchTests` (web rows, merged filters, eligibility, alert count, structured keys on save).
None has been run.

## Deferred

- D05: a confirmation tap before Ask Pulse auto-sends an intent query. The server quota bounds it.
- D07: a "New" badge on saved-search results since the last visit. Needs a per-search last-seen mark.
- Trending / popular searches on the empty screen. There is no server source; `TrendingChipsRow` is
  kept for it.
- Saving a search that has filters but no words (a Tonight chip on its own). The save button still
  needs text.
- `attractions_within_radius` (nearby RPC) does not filter `is_active`; the table fallback does. It
  is a backend change for group 8 (Map).
- Server-side caps on saved-search `name`/`filters` size (abuse #4 server half).

## Rejected findings

None of this plan's items were rejected; every item was implemented.

## Review pass

Read-only review (no compiler) changed five things:

- Return on the keyboard now runs the search immediately and records Recent after its results
  arrive. It used to record against whatever the previous keystroke's debounced search had found.
- A saved search whose words say "tonight" re-runs as Tonight. It is stored as the web's `today`
  preset (there is no tonight slug), and that explicit preset used to override the words.
- A failed save closes the name sheet, so the error toast drawn by SearchView is visible.
- `SpeechDictationService`'s recognition callback names the type instead of `Self` inside the
  escaping closure.
- `SavedSearchResultsView` builds its view model with a plain `SearchViewModel()`; `seedOnce()`
  already turns `recordsHistory` off, and the closure initializer called a main-actor setter from a
  property default.

## What a human must do

1. Build and run the iOS unit tests (`xcodegen`, then the DesMoinesInsiderTests scheme). Nothing here
   has been compiled.
2. Apply `supabase/migrations/20261011000001_fuzzy_search_events_escape_typos.sql` (`supabase db push`).
   The app works without it; the fuzzy fallback just keeps accepting `%` and has no typo arm. After
   applying, `select * from fuzzy_search_events('concrt', 5)` should return concerts and
   `fuzzy_search_events('_', 1000)` nothing.
3. Check `word_similarity` resolves under `search_path = public, pg_temp`, as `similarity` already
   does (pg_trgm must be in `public`, per 20250107000007).
4. Say "What should I do tonight in Des Moines Insider" on a device to confirm Siri picks up the moved
   phrase; App Shortcut phrases are only indexed on install.
