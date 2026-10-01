# 01 Events: Home feed, rails, event detail, filters

Deep dive of 2026-09-27. Paths are relative to `ios/` unless they start with `supabase/` or `src/`.
Nothing here was compiled: the container has no Swift toolchain. Every change was checked by reading
the code it touches, and the new XCTests have not been run. Run the iOS test target before merging.

## What the feature is

The Home tab: the main event feed with search, filter pills and smart presets; the rails (Tonight,
For You / Trending, Featured, Popular Restaurants, Top Attractions, This Weekend); the Right Now
weather ribbon; and Event Detail (header, info, actions, insider tips, reviews, related events).

The audit found the feed disagreeing with the database and the web in ways a user sees: category
chips that returned nothing, events that ended this morning listed first, merged and hidden rows
shown as live, fake 7:31 PM and 3:30 AM showtimes, a "This Weekend" that meant next Saturday on a
Sunday, a Free filter that counted "price not listed" as free, and overlapping page loads that
mixed results from two filters.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| E01 | done | `EventCategory` is now the 15 canonical values of `supabase/functions/_shared/eventCategories.json`, with display names, icons, colours and a legacy alias table (word-prefix match, so "Party" is not Arts). `Models/AppEnums.swift` |
| E02 | done | Every events read applies `is_merged`/`is_hidden`/`archived_at`. The list, featured, related, category-terms and nearby reads use the web's three-arm `notOverFilter`; several or-groups are nested into one `or=` via `combineOrGroups`. `Event` decodes `end_date` and `time_tbd`, has `isHappeningNow`, and `urgencyLabel` says "Happening now". Detail shows "This event is no longer available" on PGRST116 and cancels its reminder. `Services/EventsService.swift`, `Models/Event.swift`, `ViewModels/EventDetailViewModel.swift`, `Views/EventDetail/EventDetailView.swift` |
| E03 | done | Feed VM has a generation token, owns its load-more task, clears flags in a `defer`, treats cancellation as no error, sets the offset from the request's own offset, dedupes appends, and indexes `arrangedEvents` for load-more. Every sort ends on `id`. New role protocol `EventFeedProviding` (inherits `EventSearchProviding` rather than widening `EventPageProviding`, so the Discover and Search fakes are untouched). `ViewModels/EventsViewModel.swift`, `Views/Home/HomeView.swift` |
| E04 | done | `DateFilterPreset.thisWeekend` returns `WeekendWindow.current` (Fri 00:00 to Mon 00:00 Central). The testable form is `range(now:calendar:)`, not an overload of `dateRange`, to avoid an ambiguous-member error. |
| E05 | done | New `Services/DesMoinesTime.swift`. `Event.hasSpecificTime` mirrors `src/lib/timezone.ts` (time_tbd, SeatGeek 03:30 via `source` or `source_url`, the 19:31:58 marker). Cards, detail header and share text format in Central with " CT" when the phone is elsewhere, and print "Time TBA". Calendar entries are Central and all-day when untimed, 3h default. Unused `calendarURL` removed. |
| E06 | done | `Event.isFreePrice` and `EventsService.freePriceFilter` copy `src/lib/eventPrice.ts`. Detail price row says "Price not listed" for nil. |
| E07 | done | `LocationArea` is `EVENT_AREAS`: 9 cities plus 4 bbox districts. Clauses copy `eventAreaOrFilter`/`applyEventArea`. Unknown stored values fall back to a quoted, escaped ilike (`postgrestQuoted`/`ilikeContains`), also used by category terms. |
| E08 | done | Cache key prefix `events2`, plus free, area and distance. `servedFromStaleCache` drives reload on reconnect. |
| E09 | done | Errors are always recorded; `isRefiltering` shows a spinner, "Updating...", and dims the list; the chip bar shows `totalCount`. |
| E10 | done | Every filter `didSet` except sort clears `activePreset` outside bulk updates; the manual clears in `EventInlineFilters.swift` are gone. |
| E11 | done | Popular Restaurants "See all" switches to the Dining tab through new `DeepLinkHandler.open(_:)`; the misleading toolbar filter button is gone; searching hides the discovery chrome and adds a search chip; the list has an "All upcoming events" heading; rail order is state, recomputed on appear and foreground. |
| E12 | done | `EventsViewModel(service:initialDatePreset:loadsFeatured:)` and `hasLoadedOnce`. The weekend VM starts on its window and loads with the rest; Featured and Tonight rails hide when empty. |
| E13 | done | `isActivelySponsored` honours `sponsored_until` for Event and Restaurant. (Correction, group 10: attractions do have `is_sponsored`/`sponsored_until` since 20260620000003; see 10-browse.md BROWSE-09.) Only the first page is sponsor-arranged. |
| E14 | done | Save gives a toast (sign-in prompt for guests, silent for the favorites cap). `ReminderResult` plus pure `reminderFireDate`: 1h before, else 15 min, 9:00 CT on the day for TBA rows; each outcome gets a toast. Remind Me is hidden once an event is over. Reminders now use an interval trigger so a phone in another zone fires at the right instant. |
| E15 | done | `shareURL` (`https://desmoinesinsider.com/events/<id>`) is shared as its own item; text is "Want to go? ...". |
| E16 | done | iOS sends `moderation_status` (pending with text), reads approved plus the user's own. Server trigger in `supabase/migrations/20261007000001_user_ratings_moderation_guard.sql`. `Services/RatingsService.swift`, `ViewModels/ReviewsViewModel.swift` |
| E17 | done | `supabase/migrations/20261007000002_events_stop_public_submitter_contact.sql`: `publish_submission` copied from 20260926000002 with NULL for the two contact columns, then existing copies nulled (guarded on the columns existing). |
| E18 | done | `DateFilterPreset.tonight` (now-3h, floored at 00:00, to 03:00 tomorrow, Central), a Tonight rail that always leads, the Tonight preset uses it, and rail cards show the urgency capsule. |
| E19 | done | Bare search with no hits falls back to `fuzzy_search_events` with a "Did you mean..." caption; the empty state names the query. |
| E20 | done | For You card shows date and venue, drops the repeated "Trending now", the rail hides when empty, and 3+ saved events unlock personalized picks (falling back to trending when that RPC is empty). `ForYouCard` is now internal for its tests. |
| E21 | done | `geo_summary`, `geo_key_facts`, `geo_faq` decoded (FAQ tolerantly). New `Views/EventDetail/EventDetailGoodToKnow.swift`: Insider take, Good to know, Questions. |
| E22 | done | Popularity sort orders by `trending_score`. `EventsService.recordView` calls `increment_event_view` once per id per session, consent-gated like `HomeRailOrdering`. |
| E23 | done | Custom `Event.init(from:)` (null title becomes "Untitled event", null date becomes no date) and `LossyEventArray` for feed pages. |
| E24 | done | "Live music tonight" opens Music + Tonight; the ribbon re-runs on location bucket, hour and foreground; `guard !isLoading` removed; patio copy only 7:00-19:00. |
| E25 | done | Rail titles use `.primary` with the tint on the icon; urgency and Featured labels are white on `PremiumTokens.urgencyFill` (#B85400, about 4.9:1); filter pills expose label, value and selected state. |

Two small deviations from the plan, both deliberate:

- E25: the plan said "a filled Capsule of the tint", but white on system orange is itself about
  2.2:1, so the fill is a darker orange token. Android's `Dimens.kt` has no matching token yet.
- E07: the plan sketched `city.ilike."<City>"`; the code copies the web string exactly
  (`city.ilike.<City>`, unquoted), as the plan also asked.

## Tests added or extended

New: `EventCategoryTests`, `EventQueryFilterTests` (with `EventViewRecordingTests`), `EventPriceTests`,
`EventAreaTests`, `EventTimeTests`, `EventDecodingTests`, `ReminderTimingTests`, `ForYouCardTests`,
`EventsViewModelPagingTests`, `EventsViewModelStateTests` (cache key, preset, init), and the shared
fake `EventFeedFakes.swift`. Extended: `EventDetailRefreshTests` (unavailable, share link),
`WeekendTests` (weekend and tonight windows, Tonight title), `HomeRailOrderingTests` (Tonight leads),
`SponsoredArrangerTests` (`sponsored_until`), `ReviewsTests` (moderation status),
`LocationWeatherTests` (ribbon templates). None has been run.

## Deferred

- RLS SELECT tightening on `user_ratings` to hide non-approved rows server-side: one release later,
  per CLAUDE.md's deprecation flow. Older binaries still read every row.
- `events.submitted_by` on the public row (D-submitted_by in the E17 migration).
- Dropping `events.contact_email`/`contact_phone`: a later release.
- `WeekendView` and `WeekendWindow.day(for:)` still use `Calendar.current`; they belong to group 10
  (Browse). The Home rail and its preset now use Central.
- `search_events_near_location` (nearby RPC) does not apply visibility; the table fallback now does.
  The RPC is a backend change for group 8 (Map).
- `%`/`_` escaping inside a double-quoted PostgREST value: resolved in review. PostgREST's
  `pQuotedValue` (src/library/PostgREST/ApiRequest/QueryParams.hs) reads `\X` as a literal X, so
  one level of escaping was stripped and `\%` reached Postgres as a wildcard. `ilikeContains` now
  LIKE-escapes and then quote-escapes (`%` goes out as `\\%`). Still untested against a live backend.

## Rejected findings

None in this group's plan; every item was implemented.

## What a human has to do

1. Build and run the iOS unit tests (`xcodegen` then the DesMoinesInsiderTests scheme). Nothing here
   has been compiled.
2. Apply the two migrations (`supabase db push`). Apply `20261007000002` together with
   `20260920000001` and `20260926000002` (their own deferred D2); its backfill is skipped until the
   contact columns exist.
3. After deploying, check `GET /rest/v1/events?select=contact_email&contact_email=not.is.null` returns
   `[]`, and that a new iOS review with text lands as `pending`.
