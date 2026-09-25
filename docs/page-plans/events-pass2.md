# Events plan, second pass (`/events` hub, landings, near me, suburbs, month pages, event detail)

Coordinator output, 2026-09-25. Built from one holistic audit and five section audits (hub and filters, map and near me, date and audience landings, event detail, SEO and directory). The first-pass plan is `docs/page-plans/events.md`, implemented in 566f082. Every P0 and P1 below was re-opened at its cited line before it was accepted; what didn't hold, or was downgraded, is under **Rejected**. Production state comes from `scripts/db-snapshot.json` (captured 2026-08-24) and `docs/RLS_AUDIT.md`. No live probe was run.

Routes: `/events`, `/events/today`, `/events/this-weekend`, `/events/free`, `/events/kids`, `/events/date-night`, `/events/near-me`, `/events/<suburb>`, `/events/<month>-<year>`, `/events/:slug`.

## Scorecard for the first pass

74 numbered items in `events.md`, classified by the section audits against the code as it stands after the Search, Account, Pricing, Business and Home pass-2 commits.

| Area (prior WPs) | Items | Shipped, working | Shipped, broken or half-done | Dropped, no deferral note |
|---|---|---|---|---|
| Hub, filters, card (WP0-WP3) | 30 | 24 | 6 | 0 |
| Map, near me, suburbs (WP4, WP6) | 17 | 9 | 8 | 0 |
| Landings (WP5) | 10 | 6 | 3 | 1 |
| Directory and SEO (WP7) | 4 | 3 | 1 | 0 |
| Detail and id links (WP8, WP9) | 13 | 9 | 4 | 0 |
| **Total** | **74** | **51** | **22** | **1** |

Deferred D1-D11: 11, of which two changed (below). The holistic audit counted 64 / 8 / 2 because it scored "shipped but only on one of two surfaces" as shipped; the section audits didn't, and their count is the one used here.

**Broken or half-done**, each with the place it fails:

- **WP1 1, weekend window.** The hub's window branch is a bare `gte/lte` on `date` (`src/components/events/eventsHubQuery.ts:181-182`), while `/events/this-weekend` asks for ongoing festivals (`src/pages/EventsThisWeekend.tsx:123`). The acceptance "same ids as the landing" fails, and `tests/events-hub-dates.spec.ts:60-86` was loosened to compare bounds only.
- **WP1 6, near me on the hub.** RPC order (featured, then distance) goes through the day grouper (`src/pages/EventsPage.tsx:753`), so headers repeat and React keys and element ids collide (`src/components/events/DayGroupedList.tsx:77-80`). The request sends unrounded coordinates (`eventsHubQuery.ts:287-292`).
- **WP1 8 / WP2 1, quick picks.** Left in an "interim" `bg-slate-900` tray below the list and Load More (`EventsPage.tsx:818-832`), with gradient chips that repeat the hero's.
- **WP1 9, Tonight strip.** Treats the 19:31:58 no-time marker as a start (`eventsHubQuery.ts:418-440`), is titled "Tonight" at 9 AM (`TonightStrip.tsx:60-62`), and its `limit(40)` from midnight starves on busy days (`eventsHubQuery.ts:471-479`).
- **WP1 12, FAQ.** The live-music and venue answers name pages and venues but carry no `links` (`src/components/events/eventsHubFaqs.ts:33-36`).
- **WP3 3, card time line.** An unknown time prints "All day" (`src/components/SocialEventCard.tsx:126`); detail prints "Time TBA" for the same row.
- **WP4 4-7, map work.** Only `EventsMap.tsx` got it. `/events/near-me` renders `InteractiveMap` under the name `EventsMap` (`src/pages/EventsNearMe.tsx:36`): no venue grouping, scroll-wheel trap, no dates in popups, "mi away" from a picked origin.
- **WP6 3 and 5, near-me window.** Still filtered in the browser after a featured-first `LIMIT 200` (`src/hooks/useProximitySearch.ts:97-123`), so "Next 7 days" can miss this week.
- **WP6 7, coordinates.** Printed in the map's "Your location" popup (`src/components/InteractiveMap.tsx:460-466`) and unrounded on the hub request.
- **WP6 8, suburb stats.** "Local Restaurants" is the length of a `.limit(6)` query (`src/pages/EventsByLocation.tsx:128,309`), and every stat reads 0 while loading.
- **WP5 5, indoor flags.** Today still sends up to 200 ids through `useEventIndoorFlags` (`src/pages/EventsToday.tsx:60-61`); Weekend moved to `useWindowIndoorFlags`.
- **WP5 6, month grouping.** Renders the month's first 36 rows (`src/pages/MonthlyEventsPage.tsx:121`), so on `/events/september-2026` today every card is already over.
- **WP5 7, overflow links.** Month goes to bare `/events` (`MonthlyEventsPage.tsx:345`), Kids to `category=Family`, Date Night to `category=Music`. None opens the same set.
- **WP7 4, venues select-star.** `useVenueLinks` shipped, but `src/pages/EventDetails.tsx:163` still calls `useVenues()` (`select('*')`), so `.github/select-star-baseline.json:129` stays.
- **WP8 5, ticket label.** `free === false` earns "Get tickets" (`EventDetails.tsx:305`), and `isFreePrice` returns false for "Varies" or "See website".
- **WP8 6, dinner before the show.** No rule for a dinner time already past or a morning start (`src/lib/tonightPairings.ts:583-608`, called at `EventDetails.tsx:520`).
- **WP8, same-night rail.** Runs from 00:00 Central (`src/hooks/useRelatedEvents.ts:94-108`), so a 7 PM show lists this morning's market.
- **WP8 12, next occurrence.** Title match only. The comment at `useRelatedEvents.ts:122-123` says `recurrence_parent_id` is unprobed, but it's in the snapshot.
- **WP9, id links (regressed).** New `/events/<uuid>` links arrived after 566f082: `src/components/account/SubmissionTimeline.tsx:57`, `src/components/business/YourEvents.tsx:86`, `src/components/admin/SocialPostQueue.tsx:132`.

**Dropped:** WP5 10 half landed. The gradients are gone, but the month title still reads "Complete Calendar" (`MonthlyEventsPage.tsx:145`) without the brand name, and it renders 36.

**Hand-offs into Events that never shipped:** Search asked Events WP2 for `from`/`to`/`area` on saved searches and for SearchAutocomplete tokens plus a "search everything" row (`docs/page-plans/search.md:203,205`). Account asked for `stashPendingAction` replay on SaveSearchButton (`docs/page-plans/account.md:223`). Plan & Stay's EventHotelCallout hand-off did ship (`EventHotelCallout.tsx:10,35`).

**Deferred items that changed:**
- **D6.** `get_trending_events` and `events.trending_score` are both in the snapshot now, and Home pass 2 builds on them. Population is still unverified, so it stays deferred, but the gate is a sample query now, not a migration.
- **D9.** `notify-event-submission` moved to `:268`. It now has company: three email senders build dateless slugs that can't resolve (new D12, and WP4 item 1).
- **D5** is unchanged but costs more. The strip, the Today grouping and Date Night all make time claims that the SeatGeek 03:30 placeholder breaks.

## Where it stands

- **The hub is wrong about now at the edges.** The unfiltered list floors at Central midnight (`eventsHubQuery.ts:153-155`, `src/lib/timezone.ts:459-461`) and `dayHeading` calls today "Tonight" after 17:00 (`eventsHubQuery.ts:367-369`). At 8 PM the first header on the page sits over the 8 AM yoga class. The strip counts down to 7:31 PM for every untimed event. The prerender captures all of this around 07:00 CT and freezes "Starts in 40 min" and "Tomorrow" into the static HTML.
- **Four definitions of tonight.** Hub strip: the next 3 hours. Hub chip: the whole Central day (`EventsHubHero.tsx:147-149`). `/events/today`: 17:00 to midnight. Date Night: 17:00 to 02:00 (`src/hooks/useEventLanding.ts:198-203`). Home's rail: 16:00 to 04:00 (`tonightPairings.ts:41-44`).
- **The first screen repeats itself.** Two Filters buttons, a List/Map row, a sticky bar, Tonight cards that reappear in the Today group underneath, and the quick-picks tray below everything.
- **Honesty leaks.** "$25; kids under 5 free" is badged Free and passes the Free filter (`src/lib/eventPrice.ts:35`). "LIVE" fires on any all-time check-in (`SocialEventCard.tsx:140`). A paid sponsored row only leads the hub if it was already on page 1 (`EventsPage.tsx:318-333`), while the placement is sold as "moved to the top of the list" (`src/lib/placementSpecs.ts:158`). Month cards say "N+ people viewed this in the last hour" from a 24-hour number (`src/components/EventCard.tsx:211`, `src/hooks/useViewTracking.ts:67`).
- **Detail is solid, with three gaps.** A dateless slug can never resolve (`src/hooks/useEventBySlug.ts:86-89`), and three email senders build exactly that shape. The JSON-LD, the `.ics` export and the summary each have their own time rule, so an untimed row publishes 7:31 PM to Google and to calendars. And the list JSON-LD still serializes scraped text with bare `JSON.stringify` (`src/components/schema/EventListJsonLd.tsx:46`), with `unpkg.com` and `cdn.jsdelivr.net` allowed in `script-src` (`public/_headers:18`).
- **Worth keeping:** the one Central-window helper, the append-and-count list, the stretched-link card, the filters sheet, the map's own full-scope query, `useEventLanding`, the detail `dl`, the UUID and stale-slug rescue, dinner before the show, `pickSlugCandidate`'s refusal to guess, `eventTicketUrl`, and the fixture-backed specs already in the smoke lane.

## What makes it ours

Each bet uses data or code the app already has.

1. **The calendar that is never wrong about now.** One rule for "not over yet" and one for "tonight", used by the hub list, the strip, Today, Date Night and near me. Untimed rows say "Time not listed", running festivals say "Runs through Sun", and the static HTML carries absolute dates only. Built on `src/lib/eventTiming.ts`, `eventStartInstant` and `EVENING_START_HOUR`/`NIGHT_END_HOUR` from `src/lib/tonightPairings.ts`, `centralWindow` in `src/lib/timezone.ts`, and `isPrerender()` in `src/lib/isPrerender.ts`. Eventbrite and Catch Des Moines print scraped times as given.
2. **Dinner before the show, on the hub.** Each evening card in the Tonight strip gets "Dinner nearby: X, 0.2 mi, open until 10". One restaurants request for the whole strip, shaped by `restaurantBoxes()` and filtered by `isOpenForDinner()` (both in `tonightPairings.ts`), with `RESTAURANT_LIST_COLUMNS`. The first pass cut this for lack of a batched query shape; `restaurantBoxes` is that shape. Yelp has no events and Eventbrite has no restaurants.
3. **Where the time came from.** Under "When" on detail: "Time from ticketmaster.com, link checked Sep 23", or "The source didn't publish a start time". The CTA reads "Get tickets" only when the host sells them, otherwise "Event listing on <host>". Uses `source_url`, `source_url_checked_at`, `source_url_broken` (all in the snapshot) and `hasSpecificTime`. No local competitor says where a showtime came from or when it was checked.
4. **Series, not orphans.** Detail shows "Other dates: Sat Sep 26, Sat Oct 3" from `recurrence_parent_id` and `is_recurring_instance`, a merged duplicate forwards to its survivor through `merged_into`, and a past instance points at the next one. All three columns are in the snapshot.
5. **The month as a Central calendar.** `/events/<month>-<year>` gets a 7-column grid with per-day counts from a light projection, each day linking to `/events?from=<day>&to=<day>`, past days muted, then the current week's cards. Only months with at least 3 events are indexable, matching the sitemap's floor. Uses `useEventLanding`, `centralWindow('month')` and `scripts/generate-dynamic-sitemaps.ts`'s existing rule.

**Considered and not chosen.** Faceted counts on every chip: one HEAD request per option on sheet open breaks the request budget until a counts RPC exists (D16). Weather chips per card: `events.is_indoor` is not in the snapshot (D17). Neighbourhood event pages (`/events/east-village`): new routes over bboxes nobody has checked against `knownVenues`, while the hub's area filter already covers them. A new `/events/tonight` landing: the hub strip and Home's rail already answer it, and a fifth "tonight" is the problem this plan fixes. Kids-by-the-parent's-clock with playgrounds: sound, but a second bbox query on a page that has no budget spec yet; revisit after WP6's budget lands.

## How the packages fit together

Six packages, disjoint file sets, all runnable in parallel in one tree. **WP6 is the only package that edits lane registration** (`playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`). Every other package writes its spec as a new file (or extends a spec it owns) under `tests/`, calls `installFixtureBackend(page)` from `tests/support/fixtureBackend.ts`, and adds its own `page.route` fixtures after it. Nobody edits `fixtureBackend.ts`.

Interfaces fixed now so packages don't wait on each other:
- **WP2 adds to `src/lib/eventTiming.ts`:** `eventTimeLabel(event): string` ("7:30 PM CT" or "Time not listed") and `eventRunLabel(event, now): string | null` ("Runs through Sun, Aug 23", or a range "Aug 13 - Aug 23" / "7:00 - 10:00 PM CT"). WP1, WP3 and WP4 import them. Until WP2 lands, callers import the names and the build fails loudly, which is the point.
- **WP2 adds `data-testid="event-card-link"`** to SocialEventCard's stretched link, and a `headingLevel?: 3 | 4` prop. WP1 passes 4 from DayGroupedList; WP6's route-smoke uses the test id.
- **WP3 creates `src/components/events/EventsLandingLinks.tsx`** (`{ current: string }`) and `src/lib/monthPages.ts` (`MIN_EVENTS_PER_MONTH`, `isIndexableMonth`). WP5 mounts the links on suburb pages; WP6's sitemap generator imports the constant.

**Cross-plan files, read-only here.** `src/lib/tonightPairings.ts`, `src/lib/listColumns.ts`, `src/hooks/useNow.ts`, `src/lib/isPrerender.ts`, `src/components/LazySection.tsx` and `scripts/check-prerender-content.mjs` belong to Home pass 2. `src/hooks/useNearbyListings.ts` and `src/components/InteractiveMap.tsx` belong to Eat & Drink. `useVenueEvents` in `src/hooks/useVenues.ts` belongs to Explore (WP4 here adds a separate export in the same file; whoever lands second rebases). `src/lib/savedSearchFilters.ts` belongs to Search. `src/components/EventCard.tsx` belongs to Home; this plan stops rendering it on month pages instead of editing it. One exception, named in WP2: the free-price string is pinned equal across `src/lib/eventPrice.ts`, `supabase/functions/nlp-search/search.ts` and `supabase/functions/_shared/savedSearchMatch.ts` by `nlp-search/search.test.ts:101`, so WP2 edits the literal in all three in one PR. Search owns the other two files; nothing else in them changes.

---

## WP1: Hub list, clock and strip (sole owner of `EventsPage.tsx`)

**Goal:** the first screen on `/events` shows only events that aren't over, one set of controls, and a strip that means what its title says.

**Files:** `src/pages/EventsPage.tsx`, `src/components/events/eventsHubQuery.ts`, `src/components/events/__tests__/eventsHubQuery.test.ts`, `src/components/events/TonightStrip.tsx`, `src/components/events/DayGroupedList.tsx`, `src/components/events/EventsHubHero.tsx`, `src/components/events/EventsStickyBar.tsx`, `src/components/events/eventsHubFaqs.ts`, `src/hooks/useBatchEventSocial.ts`, new `src/hooks/useStripDinners.ts`, `tests/events-hub-dates.spec.ts`, `tests/events-hub-list.spec.ts`, new `tests/events-hub-clock.spec.ts`.

1. **P0 / S. Nothing that's over at the top.** Replace `upcomingOrFilter` (`eventsHubQuery.ts:153-155`) with three arms: timed rows with `date >= now - 2h`; rows with `end_date >= now`; and untimed rows starting today (the 19:31:58 Central marker instant for today, matched exactly, so a "Time not listed" row stays all day). The list, the count and the map (`useEventsMapData` goes through `applyHubFilters`) all pick it up. When a preset window contains now, add the same "not over" arm. Fixed-clock unit test at 20:00 CDT: an 08:00 row is out, a 19:00 row and an untimed row are in.
2. **P0 / S. The strip never counts down to a time nobody published.** Build `selectTonight` on `eventStartInstant` from `tonightPairings.ts` (null for `time_tbd`, the marker, and after WP2 the SeatGeek placeholder via `hasSpecificTime`). Untimed rows get no "Starts in"; they appear after timed ones as "Today, time not listed". Test: `event_start_local` ending `19:31:58`, viewed at 18:50 CDT, is not labelled "Starts in 41 min".
3. **P1 / S. Strip query that can't starve.** Two bounded requests merged in `selectTonight`: soon = `date` in `[now, now+3h15m]`, order `date` asc, limit 12; running = `date < now and end_date >= now`, order `end_date` asc, limit 12. Add `placeholderData: keepPreviousData` to `useTonightStripEvents` (`:461-466`) so the strip doesn't vanish and shove the list every 15 minutes.
4. **P1 / S. One word per window.** Strip heading: "Starting soon" before `EVENING_START_HOUR` (16:00 CT), "Tonight, Thu Sep 25" after. Rename the hero chip at `EventsHubHero.tsx:147-149` to "Today", since it sets `preset=today`; the sticky chip already says Today. `dayHeading` keeps "Tonight" after 17:00, which is now true because of item 1.
5. **P1 / S. Windows include running festivals.** When `filters.window` is set, push `ongoingStartFilter(window.start)` (from `useEventLanding.ts`) into `orGroups` and keep `.lte('date', window.end)`. Mirror it in `fetchNearMe`'s client filter (`:305-311`). Restore `events-hub-dates.spec.ts:60-86` to compare returned ids against a fixture holding a Thu-Sun festival, not just bounds.
6. **P1 / S. No relative time in static HTML.** Under `isPrerender()`, day headers render absolute ("Thursday, Sep 25") and TonightStrip renders nothing. Relative words appear after mount. `resolveHubDate`'s memo (`EventsPage.tsx:115-118`) also keys on `centralDateOf(now)` so a tab left open rolls over at Central midnight; swap `from`/`to` when inverted.
7. **P1 / S. Near-me mode on the hub reads like near me.** In `fetchNearMe`: round the origin with `roundCoordinate` from `nearMeOrigins.ts` before the RPC (the page promises half-mile rounding, `EventsNearMe.tsx:218-220`); replace `filterVisibleIds` with one `in.(ids)` read of `EVENT_LIST_COLUMNS` under `applyEventVisibility`, so sponsorship, `end_date` and time fields are real and a paid row shows "Sponsored", not "Featured"; sort kept rows by `distance_meters`; set `complete: false` when the RPC returned `NEAR_ME_LIMIT` rows. In EventsPage: `grouped={sortBy === 'date_asc' && !isNearMeActive}`, count line "Nearest 42 within 30 mi" (plus "more exist, narrow the filters" when capped), sort control shows "Distance". DayGroupedList keys sections by `${day}-${index}`.
8. **P1 / M. Denied location doesn't dead-end.** On `PERMISSION_DENIED` (`EventsPage.tsx:163-170`), navigate to `/events/near-me?when=<preset>&category=<category>` instead of a toast that names a page without linking it. WP5 makes near-me read those params.
9. **P1 / M. Sponsored rows lead as sold.** A page-1-only query: the same `applyHubFilters` plus `is_sponsored=eq.true` and `or(sponsored_until.is.null,sponsored_until.gt.<now>)`, order `sponsored_until`, limit `SPONSORED_CAP`. Pin those, and drop their ids from the organic pages in `flattenPages`. Position only; the price is still decided server-side. Extend `events-hub-list.spec.ts` so a sponsored row at organic position 40 leads.
10. **P1 / M. Per-page social batch.** `useBatchEventSocial` becomes `useQueries`, one query per `HubPage` (at most 30 ids) plus one for the strip, merged into one map, each with `placeholderData`. Load More adds a query instead of refetching everything, and a `?page=10` link no longer builds a ~12KB URL. Count only `status in (going, interested)` in the attendees select (`useBatchEventSocial.ts:52-56`).
11. **P1 / S. One LCP priority.** One counter: when strip rows exist, the first two strip cards get `priority` and the list gets none; otherwise the list keeps `index < 3` (`EventsPage.tsx:511-520`, TonightStrip passes none today).
12. **P1 / S. Search that matches while you type.** Build the tsquery with a prefix on the last token (`to_tsquery` with `:*`, tsquery metacharacters escaped), falling back to `websearch` when the input has quotes or `OR`. "jaz" matches jazz. No empty state or noindex until the input has been idle 800ms.
13. **P1 / S. Say when the list is updating.** Read `listQuery.isPlaceholderData`: grid `aria-busy="true"` and dimmed, count line "Updating...", and the sheet footer (`:601`) disabled with the same text until fresh data lands. Pin it with a delayed route in `events-hub-list.spec.ts`.
14. **P1 / M. One control row, no repeats.** Drop the hero's Filters chip (`EventsHubHero.tsx:168-170`); move List/Map into EventsStickyBar as two icon toggles (44px) and delete the header row at `EventsPage.tsx:634-665`. Remove the quick-picks tray (`:818-832`); WP2 moves the presets into the sheet and exports `QuickPicks` for the empty state, which EventsPage mounts. On page 1, strip ids are left out of the Today group, which ends with "and N more today in the strip above" if any were removed.
15. **P2 / S. Mount what's below the fold when it's near.** Wrap `EventsHubDirectory` and `HubArticles` in `LazySection` (it mounts everything under `isPrerender`, so crawlers keep the links). `get_event_categories` runs only when the sheet opens or a category param is set, and falls back to `EVENT_CATEGORIES` filtered by `isCanonicalCategory` on error or empty.
16. **P2 / S. FAQ says only what it links.** The live-music answer links `/music` and drops the five venue names and "each venue we track has a page" (`eventsHubFaqs.ts:33-36`); the venues answer links `#events-directory` and says "these music venues have pages". The FAQ is static JSON-LD, so it names nothing it can't link at build time.
17. **P2 / S. Sticky offsets from measurement.** EventsStickyBar sets `--events-bar-h` on `:root` from a ResizeObserver; day headers use `top-[calc(4rem+var(--events-bar-h))]` instead of `top-44 sm:top-32`. The header-height half is a shell hand-off (below).
18. **P2 / M. Dinner nearby on strip cards (bet 2).** `useStripDinners(items)` makes one restaurants request: `or=` of `restaurantBoxes()` for the strip's timed evening rows, `RESTAURANT_LIST_COLUMNS`, `.neq('is_merged', true)`, limit 60. For each card, the nearest restaurant within `PAIR_MAX_MILES` that passes `isOpenForDinner` at start minus `DINNER_LEAD_MINUTES`, with that time still in the future. Line: "Dinner nearby: Lucca, 0.2 mi, open until 10 PM". No line when nothing pairs. Skipped under `isPrerender()`.

**Acceptance:**
- With the clock fixed at Thu 2026-09-25 20:00 CDT: no card above the first "Tomorrow" header has a start before 18:00 unless it's untimed or has `end_date >= now`, and no card says "Starts in" for a 19:31:58 row.
- `?preset=this-weekend` returns the same ids as `/events/this-weekend` for a fixture with a Thu-Sun festival.
- `?near=1` renders no repeated day header, section ids are unique, and the RPC body's `user_lat` has at most 2 decimals.
- On a 390px viewport there is one Filters control and one List/Map control above the first card, and no event id renders twice.
- `rg 'bg-slate-900' src/pages/EventsPage.tsx` returns nothing.
- A sponsored fixture row with 40 earlier organic rows leads page 1 with the Sponsored badge.

**Verify:** `npm run test:unit` (eventsHubQuery, fixed clocks), `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test tests/events-hub-clock.spec.ts tests/events-hub-dates.spec.ts tests/events-hub-list.spec.ts --config playwright.smoke.config.ts --project=chromium-desktop` against `npm run build && npm run preview`, `touch-targets`, `page-headings`, `npm run validate`.

---

## WP2: Card, time words, price and filter controls

**Goal:** a card never claims a time, a price or a liveness the row can't back, and the filter controls exist once each.

**Files:** `src/components/SocialEventCard.tsx`, `src/lib/eventTiming.ts`, `src/lib/__tests__/eventTiming.test.ts`, `src/lib/timezone.ts` (`hasSpecificTime` only), `src/lib/eventPrice.ts`, `src/lib/__tests__/eventPrice.test.ts`, `supabase/functions/nlp-search/search.ts` and `supabase/functions/_shared/savedSearchMatch.ts` (the mirrored free string only, see cross-plan note), `src/lib/eventPresets.ts`, `src/components/EventSmartPresets.tsx`, `src/components/events/EventFiltersSheet.tsx`, `src/components/EventInlineFilters.tsx` (delete), `src/components/SaveSearchButton.tsx`, `src/components/SearchAutocomplete.tsx`, new `tests/events-card-honesty.spec.ts`.

1. **P1 / S. "Time not listed", from one helper.** Add `eventTimeLabel` and `eventRunLabel` to `eventTiming.ts` (signatures in "How the packages fit together"). SocialEventCard's lead line uses them (`SocialEventCard.tsx:126` prints "All day" today). "All day" is reserved for a row whose `end_date` covers the day. WP3, WP4 and the map popup import the same helper, so card, detail and JSON-LD can't disagree.
2. **P1 / S. SeatGeek's 03:30 is not a showtime (interim for D5).** In `hasSpecificTime` (`timezone.ts:115`), return false when the local time is `03:30:00` and `source_url` matches `seatgeek` (the column is in `EVENT_LIST_COLUMNS`; the matching rule is the one `20260902000016` uses). Remove it when D5's probe puts `time_tbd` in the projection. Every surface that calls `hasSpecificTime` picks it up; `tonightPairings.eventStartInstant` is Home's and gets the same line as a hand-off.
3. **P1 / S. Free means free.** `isFreePrice` returns true only when the text says free and names no nonzero amount (`/\$\s*[1-9]/`). `FREE_PRICE_FILTER` becomes the matching PostgREST expression (the `ilike %free%` arm and-ed with a `not.match` on a nonzero dollar amount, quoted for PostgREST). Change the literal in `nlp-search/search.ts` and `_shared/savedSearchMatch.ts:326-329` in the same PR so `search.test.ts:101` stays green; deploying those functions is D14. Unit cases: "$25; kids under 5 free", "Free parking, $40 tickets" and "Free for members, $15 public" are not free; "Free", "$0" and "FREE admission" are.
4. **P1 / S. LIVE means now.** Show "LIVE" only when `eventTiming(event).isHappeningNow` and a check-in exists; otherwise "<n> checked in" with no badge (`SocialEventCard.tsx:140,235-240`).
5. **P2 / S. Running festivals look running.** When start is before today and `end_date >= now`, the date badge shows today and the lead line carries `eventRunLabel` ("Runs through Sun, Aug 23"), matching the day header it sits under.
6. **P2 / S. Card details.** Distance badge uses `distanceMeters != null` and `formatNearMeDistance` (`:247-252`). A `headingLevel` prop (default 3). Poster `alt=""`, since the title link carries the name (`:185` repeats it). `data-testid="event-card-link"` on the stretched link.
7. **P1 / S. Quick picks live in the sheet.** Restyle EventSmartPresets on surface tokens, no gradients (`EventSmartPresets.tsx:38-47,62-65`). Drop Tonight and This week from `EVENT_SMART_PRESETS` (`eventPresets.ts:230`), since the hero owns them. Render it inside EventFiltersSheet under "Quick picks" and export a `QuickPicks` wrapper for WP1's empty state. Delete `EventInlineFilters.tsx`, which nothing mounts.
8. **P2 / S. One history entry per sheet session.** While the sheet is open its handlers write with `replace: true`; opening pushes once (`EventFiltersSheet.tsx:293-303`).
9. **P1 / S. Save search says what it saves.** Lazy-load the dialog body and the zod-validating hook on first click, so zod (12.2KB gz) leaves the EventsPage chunk. Until Search adds `from`/`to`/`area` to `SAVED_SEARCH_FILTER_KEYS` (hand-off), the dialog lists what won't be matched: dates, near me. Signed out, `stashPendingAction` before `/auth` and replay on mount (`src/lib/authReturn.ts`).
10. **P2 / S. Autocomplete, the Search hand-off.** Tokens instead of `bg-white`/`gray-*` (`SearchAutocomplete.tsx:398-424`), Clear moved outside `role=listbox`, `tabIndex={-1}` on options, and a last option "Search everything for 'X'" to `/search?q=`.

**Acceptance:**
- `rg "'All day'" src/components/SocialEventCard.tsx` returns nothing; a sentinel fixture card reads "Time not listed".
- A "$25; kids under 5 free" fixture row has no Free badge and isn't returned under `?price=free`.
- A card with `total_checkins: 3` for an event next week shows no LIVE badge.
- `deno test supabase/functions/nlp-search/search.test.ts` passes (string parity).
- The EventsPage chunk no longer contains zod (check the built chunk list).

**Verify:** `npm run test:unit` (eventTiming, eventPrice), `npm i -g deno && deno test supabase/functions/nlp-search/search.test.ts supabase/functions/_shared/savedSearchMatch.test.ts`, new `tests/events-card-honesty.spec.ts` on fixtureBackend, `search-filters` and `sticky-filter-chips` in the smoke lane, `npx impeccable detect src/components/EventSmartPresets.tsx src/components/SocialEventCard.tsx`, `npm run validate`.

---

## WP3: Date, audience and month landings

**Goal:** Today holds what's happening today including running festivals, the month page shows the weeks that haven't happened, and every landing uses the same tonight.

**Files:** `src/pages/EventsToday.tsx`, `src/pages/EventsThisWeekend.tsx`, `src/pages/FreeEvents.tsx`, `src/pages/KidsEvents.tsx`, `src/pages/DateNightEvents.tsx`, `src/pages/MonthlyEventsPage.tsx`, `src/hooks/useEventLanding.ts`, `src/hooks/__tests__/useEventLanding.test.ts`, `src/hooks/__tests__/useEventLanding.weekend.test.ts`, `src/hooks/__tests__/landingQueries.test.ts`, `src/components/ListFreshness.tsx`, `src/components/EventsSegmentHandler.tsx`, new `src/components/events/EventsLandingLinks.tsx`, new `src/components/events/MonthCalendarGrid.tsx`, new `src/lib/monthPages.ts`, new `tests/events-landings.spec.ts`.

1. **P1 / S. Today includes what's still running.** `includeOngoing: true` (`EventsToday.tsx:54`). Between 00:00 and `NIGHT_END_HOUR`, also carry the previous evening's rows with `end_date >= now`. Carried rows group as "Happening now".
2. **P1 / S. One tonight.** `groupTodayEvents` and `isEveningStart` (`useEventLanding.ts:198-203,281-282`) use `EVENING_START_HOUR` and `NIGHT_END_HOUR` from `tonightPairings.ts`. FAQ copy quotes the hours from those constants. `landingStartInstant` returns null when `hasSpecificTime` is false, so WP2's SeatGeek rule reaches Today and Date Night.
3. **P1 / S. Today says which day.** Render the window's day ("Thursday, September 25") under the h1, as the weekend page does. Regroup on a minute clock (`useNow`, read-only). Swap `useEventIndoorFlags` for `useWindowIndoorFlags` (`:60-61`).
4. **P1 / S. Month cards are the real card.** MonthlyEventsPage renders SocialEventCard with `useBatchEventSocial` (`:326`). That removes the dead "View Details" button that only increments view counts, the Button-in-Link nesting, 36 `get_content_view_stats` RPCs, and "viewed this in the last hour" from a 24-hour number.
5. **P1 / S. The current month starts today.** For the current month, weeks ending before today collapse into a `<details>` ("Earlier this month, N events"), and the 36-card cap fills from today forward. Past months unchanged.
6. **P1 / S. Bounded, honest month pages.** `src/lib/monthPages.ts` exports `MIN_EVENTS_PER_MONTH = 3` and `isIndexableMonth(month, count, now)` (within [current - 1, current + 12] and at least 3 events). Outside that, `NoIndexMeta` and no prev/next link; years outside it render the not-found state. Title "<Month> <Year> Events in Des Moines, Central Time", no "Complete", brand name per WP5 10.
7. **P1 / M. Light rows for counts, full rows for cards.** `useEventLanding` takes an optional `columns` (id, title, date, event_start_utc, event_start_local, end_date, category, city, price, venue, source_url, is_featured, updated_at) for the full window, then fetches `EVENT_LIST_COLUMNS` `.in('id', renderedIds)` for the cards. Month (1000 rows) and Weekend (500) stop shipping two descriptions per row.
8. **P1 / S. Carried events don't crowd out the day.** In `groupByCentralDay`, carried rows follow that day's own starts, capped at 3 under "Still running", with the rest behind "and N more running".
9. **P1 / S. Shared landing links.** `EventsLandingLinks` holds the when/who pills and the suburb pills from EventsHubDirectory's lists, current page excluded, 44px targets. Mount above the FAQ on every landing and month page. WP5 mounts it on suburb pages.
10. **P2 / S. Overflow links open the same set.** Month: `/events?from=<max(today, monthStart)>&to=<monthEnd>`. Weekend: carry the location chip as an `eventAreas` slug. Kids and Date Night: word the link for what it opens ("Browse Family-category events").
11. **P2 / S. Counts say their scope.** `countLabel` on capped counts; "of the next 100" where capped (Date Night heading, Kids free line, Free category breakdown). Date Night queries a 14-day `centralWindow` with the light projection and applies `isEveningStart` before the render cap. The weekend "Family Events" stat is relabelled "Family category".
12. **P2 / S. SEO and a11y leftovers.** `NoIndexMeta` on a failed first query (Today, Free, Kids, Date Night, Month). Free and Kids drop `showSchema={false}` so FAQPage emits once. Weekend FAQ and "More Weekend Ideas" move out of the non-empty branch (`EventsThisWeekend.tsx:398,570`), and the past-day h2 moves out of `<summary>` (`:458-466`). ListFreshness formats and dates in Central (`ListFreshness.tsx:72-76`). `landingDay` reads `event_start_utc` first, like the card.
13. **P2 / S. Lazy segment branches.** EventsSegmentHandler lazy-loads EventDetails and MonthlyEventsPage behind one Suspense with `EventLoadingState`, so neither page pays for the other.
14. **P2 / M. Month calendar grid (bet 5).** `MonthCalendarGrid` renders a 7-column Central grid from the light rows: per-day counts, each day a link to `/events?from=<day>&to=<day>`, past days muted, today outlined. Cards for the current week follow. On a phone it collapses to a two-column list of days with counts.

**Acceptance:**
- Clock fixed at Thu 2026-09-25 20:00 CDT: a Thu-Sun festival is under "Happening now" on `/events/today`; a 03:30 SeatGeek fixture row is under "Time not listed"; a 16:30 row is under Tonight.
- `/events/september-2026` shows Sep 25-30 cards first and has no `EventCard`; `/events/march-1998` has `noindex` and no rel=prev/next.
- `rg 'Complete Calendar|Complete list' src/pages/MonthlyEventsPage.tsx` returns nothing.
- The month request for the full window selects no `enhanced_description`.

**Verify:** `npm run test:unit` (useEventLanding, landingQueries), new `tests/events-landings.spec.ts` with `page.clock.setFixedTime`, `events-weekend-days`, `route-smoke`, `page-headings`, the a11y lane, `npm run validate`.

---

## WP4: Event detail

**Goal:** every link that reaches a detail page resolves, and the page, its JSON-LD and its calendar export agree about when the event is.

**Files:** `src/pages/EventDetails.tsx`, `src/components/EnhancedEventSEO.tsx`, `src/hooks/useEventBySlug.ts`, `src/hooks/__tests__/useEventBySlug.pick.test.ts`, `src/lib/eventSchema.ts`, `src/lib/__tests__/eventSchema.test.ts`, `src/lib/icsEvent.ts`, `src/lib/__tests__/icsEvent.test.ts`, `src/lib/eventMeta.ts`, `src/lib/__tests__/eventMeta.test.ts`, `src/lib/eventOffers.ts`, `src/components/EventCheckIn.tsx`, `src/hooks/useRelatedEvents.ts`, `src/components/EventHotelCallout.tsx`, `src/hooks/useVenues.ts` (new `useVenueMatchRows` export only), `.github/select-star-baseline.json`, new `src/components/events/EventProvenance.tsx`, `tests/event-detail.spec.ts`.

1. **P0 / S. Dateless slugs resolve.** In `pickSlugCandidate` (`useEventBySlug.ts:86-89`), with no slug date, return the soonest candidate whose `createSlug(title)` equals the slug (rows are already `date` asc); EventDetails then redirects to the canonical slug. Flip the test at `useEventBySlug.pick.test.ts:55` and add "two same-title rows pick the soonest". Every reminder and digest link (`send-event-reminders/index.ts:151`, `send-weekly-digest/index.ts:363,385,408,431`, `assemble-weekly-digest/index.ts:90`) starts working without a deploy.
2. **P1 / S. JSON-LD time matches the page.** `eventStartIso` and `eventEndIso` branch on `!hasSpecificTime(event)`, not `event.time_tbd` (`eventSchema.ts:79,106`), and take the date part from `centralDateOf`, not `iso.slice(0,10)` of a UTC string. Tests: a sentinel row and a SeatGeek 03:30 row publish a date-only `startDate` and no `endDate`.
3. **P1 / S. The `.ics` matches the page.** `toIcsEvent`: `allDay = !hasSpecificTime(row)`, end from `eventEnd()` in `eventTiming.ts` (reads `end_date`; `event_end_utc` isn't a column), one duration constant (`DEFAULT_EVENT_HOURS`), URL from `BRAND.baseUrl` plus `createEventSlugWithCentralTime` (`icsEvent.ts:49,110,120,257`). Tests for a three-day festival and a sentinel row.
4. **P1 / S. Summary tense follows the event, not its start.** `eventSummary` takes `isOver` from `eventTiming` (`eventMeta.ts:189`): "is on now" while happening, "took place" only when over, price line kept until over.
5. **P1 / S. CTA that says where it goes (bet 3).** "Get tickets" only when `buildEventOffers(event.price)` is fixed or range and the host is on a ticketing allowlist (ticketmaster, seatgeek, etix, eventbrite, axs, plus known venue domains); otherwise "Event listing on <hostname>". Same predicate for the sticky bar (`EventDetails.tsx:772-781`). Outbound clicks call `trackClick` (consent-gated).
6. **P1 / S. Showtime provenance line (bet 3).** `EventProvenance` under "When": "Time from <host>, link checked <Central date>" from `source_url` and `source_url_checked_at`; "The source didn't publish a start time" when `!hasSpecificTime`; nothing when `source_url_broken`. No relative words, so the prerender can't go stale.
7. **P1 / S. "When" shows the run.** Whenever `end_date` is at or after the start, print `eventRunLabel` (WP2): "Aug 13 - Aug 23" or "7:00 - 10:00 PM CT". Keep "Runs through" while happening (`EventDetails.tsx:427-431`).
8. **P1 / S. Dinner advice that's still advice.** At the caller (`:520`), drop picks whose `dinnerAt <= now`. When the start's Central hour is before `EVENING_START_HOUR`, the heading reads "Eat before the event" instead of "Dinner before the show". `tonightPairings.ts` is not edited.
9. **P1 / S. Head meta from this event.** `geo.position`/`ICBM` from the event's or matched venue's coordinates, omitted when there are none; `geo.placename`, `event:city` and `og:locality` from `event.city`, omitted when null (`EnhancedEventSEO.tsx:192-195,204,221`). Drop "this weekend"/"tonight" from the keywords. Guard `event.category` against null (`:38-39,82,203,227`) with a unit test.
10. **P1 / S. No "0 people" claims.** EventCheckIn hides the Community Interest block when `total` is 0, which is also what an error returns today (`useCommunityFeatures.ts:182-185`, unchanged), and shows "Be the first to say you're going". Selected buttons use -700 fills for contrast (`EventCheckIn.tsx:61-68`).
11. **P1 / M. Merged duplicates forward.** When the visible lookup returns null, one more read by id or slug candidate without the merge and archive predicates: `is_merged` with `merged_into` goes to the survivor with `<Navigate replace>`; `archived_at` set renders the past-event page with `noindex`; `is_hidden` stays a 404. Unit-test the three branches.
12. **P1 / S. Stale-event noindex measures from the end.** `EnhancedEventSEO.tsx:96-108` uses `eventEndIso` (end_date, else start + 3h). Fixed-clock test: a 60-day exhibit on day 45 stays indexable.
13. **P2 / S. Series (bet 4).** `useRelatedEvents` queries `or(recurrence_parent_id.eq.X,id.eq.X)` when `recurrence_parent_id` is set, then falls back to the title match. Render "Other dates: Sat Sep 26, Sat Oct 3" (up to 4). Fix the comment at `:122-123`.
14. **P2 / S. Same-night rail.** Bound from `max(now, start - 3h)` to the end of the Central day, drop `isEventOver` rows, print time only; "Also that day nearby" for a daytime event.
15. **P2 / S. Detail smaller fixes.** Reset `heroFailed` on `event.id` (`:153`). "Join us for" fallback becomes "{title} is a {category} event at {venue} in {city}." (`:531`). `AIDisclosureBadge` next to "About This Event" when `is_enhanced`. Hide `event.location` when it is only a city/state string. Where-row links go to `min-h-11` (`:453`). RatingSystem mounts only when happening or over (`:584-586`). `eventOffers.ts:145` omits `availability`.
16. **P2 / S. Fewer bytes per view.** `useVenueMatchRows()` selects `slug, name, address, latitude, longitude` and replaces `useVenues()` at `:163`; shrink `select-star-baseline.json` only if no other caller of `useVenues` remains. Before `<Navigate>`, `setQueryData` for the canonical key. Replace `select('*')` in `fetchFullEvent` with an `EVENT_DETAIL_COLUMNS` list defined in `useEventBySlug.ts` (list columns plus `seo_*`, `geo_*`, `ai_writeup`, `writeup_*`, `source_url_broken`, `source_url_checked_at`, `recurrence_parent_id`, `merged_into`, `is_recurring_instance`).
17. **P2 / S. Hotels when someone would book one.** EventHotelCallout renders the list only for multi-day events, Fri/Sat nights, or venues with `capacity` recorded; otherwise one link "Staying over? Hotels near {venue}" to `/stay?near=`. Reserve height while loading; `formatMiles` for `distance_miles` (`:150-152`).
18. **P2 / S. Descriptions trimmed in lists.** `buildEventJsonLd` takes `{ descriptionMax }`; `buildEventItemList` passes 300, cut at a word boundary. Detail keeps the full text.

**Acceptance:**
- `/events/jazz-night` with one upcoming "Jazz Night" fixture redirects to `/events/jazz-night-2026-10-01`.
- A sentinel row's JSON-LD `startDate` matches `^\d{4}-\d{2}-\d{2}$` and its `.ics` has `DTSTART;VALUE=DATE`.
- A "Varies" price with a `catchdesmoines.com` source renders "Event listing on catchdesmoines.com", not "Get tickets".
- A merged fixture redirects to its survivor; a Waukee event's `geo.position` is not `41.5868;-93.6250`.

**Verify:** `npm run test:unit` (eventSchema, icsEvent, eventMeta, useEventBySlug.pick), `tests/event-detail.spec.ts` extended with `page.clock.setFixedTime` (dateless slug, sentinel JSON-LD, `javascript:` source with no CTA, past event with no hotels, axe on the article) and its header comment corrected, `npm run check-select-star`, `npm run validate`.

---

## WP5: Near me, map and suburb pages

**Goal:** near me returns an exact, windowed set from any origin, with the real events map, and suburb pages state only numbers they have.

**Files:** `src/pages/EventsNearMe.tsx`, `src/hooks/useProximitySearch.ts`, `src/lib/nearMeOrigins.ts`, `src/lib/__tests__/nearMeOrigins.test.tsx`, `src/pages/EventsByLocation.tsx`, `src/lib/suburbs.ts`, `src/lib/eventAreas.ts`, `src/lib/__tests__/eventAreas.test.ts`, `src/components/EventsMap.tsx`, `src/hooks/useEventsMapData.ts`, `src/lib/eventQuery.ts`, `scripts/prerender-routes.mjs`, `public/sitemap-static.xml`, `tests/events-near-me.spec.ts`.

1. **P1 / M. Windowed near me without the RPC.** When a window is set, query `events` directly: `applyEventVisibility`, the `centralWindow` bounds plus `ongoingStartFilter`, `latitude not null`, a lat/lng box around the rounded origin (radius converted to degrees), and the category. Compute haversine distance client-side (`calculateDistance`, `useProximitySearch.ts:307`), drop rows outside the circle, sort by distance. That set is exact and visible by construction. Keep the RPC only for "Anytime".
2. **P1 / S. Honest count lines.** With item 1 the count is exact and the caveat at `EventsNearMe.tsx:334-344` goes. For "Anytime" with `limitHit`, "At least N events..." and "Showing the nearest N".
3. **P1 / M. Near me gets the events map.** Render `@/components/EventsMap` (venue grouping, gesture handling, dated popups) with the rows mapped to `MapEvent`, `userLocation={searchCenter}`, a new `originLabel` prop ("Downtown", not "You"), a circle for the committed radius, and a `distanceLabel(event)` prop so popups read "1.2 mi from Ankeny". No coordinate readout anywhere. Remove the `InteractiveMap` import from this page.
4. **P1 / S. Suburb stats that are true.** Drop the "Local Restaurants" tile, or back it with a `count: 'exact', head: true` query labelled "Restaurants listed". Render the stat block only after the events query succeeds, with a same-height placeholder. Restaurant cards link `/restaurants/${slug ?? id}` with `.neq('is_merged', true)` (`EventsByLocation.tsx:123-128,410`).
5. **P2 / S. One definition of each suburb.** Derive the city entries of `EVENT_AREAS` from `SUBURBS`, adding Waukee, and give `applyEventArea` the suburb page's `or()` so the hub's Area filter and `/events/<suburb>` count the same rows. Test: every `SUBURBS` slug is an `EVENT_AREAS` slug.
6. **P2 / M. Suburb matching by place, not substring.** Match `city` first; fall back to `location` only through a trailing `, Urbandale` / `, Urbandale, IA` pattern, so "Urbandale Ave" in Des Moines stops landing on `/events/urbandale`. Remove the client `isAfter(parseISO(date))` filter (`:148-155`) in favour of the hub's not-over rule.
7. **P2 / S. Suburb page SEO.** EventListJsonLd gets `visibleEvents` (the 24 rendered), `NoIndexMeta` on a failed first query, `EventsLandingLinks` (from WP3) above the FAQ plus "Events in nearby suburbs" from `SUBURBS`.
8. **P2 / S. Near-me origins and URL.** Add Waukee to the origins; read `from`, `r`, `category` and `when` through `useUrlFilters` (safeStorage stays the fallback for `from`), which also receives WP1 item 8's hand-off. Each suburb page links `/events/near-me?from=<slug>`. The "Tonight" window chip becomes "Today" (`nearMeOrigins.ts:83-84`).
9. **P2 / M. Near-me list and controls.** Render SocialEventCard with `distance_meters` set (fixes the "$ $15" price, `EventsNearMe.tsx:414-419`). One compact bar for origin and When; radius and category in a sheet. 24 cards, then "Show more".
10. **P2 / S. Prerender near me.** Add `/events/near-me` to `prerender-routes.mjs` and `sitemap-static.xml`; the Downtown default fetches with no permission prompt, so the static HTML carries cards "from Downtown" with an ItemList.
11. **P2 / S. Small map and query fixes.** `filterVisibleIds` runs its chunks with `Promise.all` (`eventQuery.ts:61-68`). The EventsMap legend lists only buckets present in `groups` (`EventsMap.tsx:379-391`).

**Acceptance:**
- "Next 7 days" from Ankeny at 25 mi returns every visible fixture row in the window and radius, even with 300 nearer rows on later dates.
- `/events/near-me` renders `EventsMap`, and `rg 'InteractiveMap' src/pages/EventsNearMe.tsx` returns nothing.
- `/events/ankeny` shows no restaurant number unless it came from a count query, and shows no "0" while loading.
- `?location=waukee` on the hub and `/events/waukee` return the same ids from one fixture.

**Verify:** `npm run test:unit` (nearMeOrigins, eventAreas), `tests/events-near-me.spec.ts` extended (windowed query shape, origin label in the popup, suburb stat hidden while pending), `npm run check-neighborhoods`, `npm run check-seo-routes`, `npm run check-sitemap-registration`, `npm run validate`.

---

## WP6: JSON-LD safety, sitemap, request budget and lanes (lands last)

**Goal:** no scraped string can end a script block, the sitemap and month links follow Central time and end dates, the events routes have a first-view request budget, and every new spec runs in CI.

**Files:** `src/components/schema/EventListJsonLd.tsx`, `src/pages/VenueDetail.tsx` (the JSON-LD line only), `scripts/__tests__/json-ld-escape.test.mjs`, new `src/components/schema/__tests__/EventListJsonLd.test.tsx`, `scripts/generate-dynamic-sitemaps.ts`, `src/components/seo/MonthLinks.tsx`, `src/components/seo/EventsHubDirectory.tsx`, `src/components/admin/SocialPostQueue.tsx` (one link), new `scripts/__tests__/event-id-links.test.mjs`, `tests/route-smoke.spec.ts`, `tests/backend-down.spec.ts`, new `tests/events-request-budget.spec.ts`, `playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`.

1. **P0 / S. Escape list JSON-LD.** `EventListJsonLd.tsx:46` and `VenueDetail.tsx:128-130` use `toJsonLd` from `src/lib/jsonLd.ts`. Move both from `BASELINE` to `REQUIRED_CLEAN` in `json-ld-escape.test.mjs:96-108`. Unit test: an event whose description holds `</script><img src=x onerror=1>` produces no `</script` in the output. This runs on 14 prerendered events routes plus every month page.
2. **P1 / S. Sitemap keeps running events.** Select `end_date` and filter `.or(date.gte.<cutoff>,end_date.gte.<cutoff>)` (`generate-dynamic-sitemaps.ts:194`). Bucket months with `toZonedTime(d, CENTRAL_TIMEZONE)` instead of `getUTCMonth` (`:289`), and take the 3-event floor from WP3's `MIN_EVENTS_PER_MONTH`. Fixed-clock test at 2026-10-01T01:00Z: an 8 PM CDT Sep 30 event counts toward September.
3. **P2 / S. Month links in Central.** `upcomingMonths` starts from `centralDateOf(now)` (`MonthLinks.tsx:50-56`).
4. **P2 / S. Directory says what it lists.** "What's on at each venue" becomes "Music venues" (`EventsHubDirectory.tsx:137`); export the when/who and suburb lists so WP3's `EventsLandingLinks` reads the same arrays.
5. **P1 / M. First-view request budget.** `tests/events-request-budget.spec.ts` on fixtureBackend counts Supabase requests with no scroll for `/events`, `/events/today` and one detail page, and asserts a ceiling measured after WP1-WP4 land (record the numbers in the spec header). Note that the smoke `testMatch` regex is unanchored, so `request-budget` already matches this filename; list it explicitly anyway.
6. **P2 / S. Id-link ratchet.** `event-id-links.test.mjs` fails on any new `` `/events/${...id}` `` link in `src/`, with a baseline of `SubmissionTimeline.tsx:57` and `YourEvents.tsx:86` (Account's and Business's, handed off). Fix `SocialPostQueue.tsx:132` here with `createEventSlugWithCentralTime`, since no plan owns it.
7. **P2 / S. Route smoke opens a real event.** Scope the WEB-QA-002 locator (`route-smoke.spec.ts:246`) to `[data-testid="event-card-link"]` (WP2 item 6).
8. **P2 / S. Backend down on landings.** `backend-down.spec.ts` asserts `noindex` on `/events/today` and `/events/ankeny` when the first query fails (WP3 item 12, WP5 item 7).
9. **Lane registration.** Add to `playwright.smoke.config.ts` `testMatch` and `.github/workflows/e2e.yml`: `events-hub-clock`, `events-card-honesty`, `events-landings`, `events-request-budget`, and `weather-aware-events` (the only e2e coverage of `/events/today`'s weather order; remove it from `e2e-lane-baseline.json`).

**Acceptance:**
- `node --test scripts/__tests__/json-ld-escape.test.mjs` passes with both files in `REQUIRED_CLEAN`.
- `npm run check-e2e-lanes` passes and the baseline has four orphans.
- `npm run test:offline` includes and passes `event-id-links`.

**Verify:** `npm run test:unit`, `npm run test:offline`, `npm run check-e2e-lanes`, the full smoke lane with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome --project=chromium-desktop` against a production build, `npm run validate`.

---

## Hand-offs to other plans

- **Home (`src/lib/tonightPairings.ts`):** `eventStartInstant` returns null for the SeatGeek 03:30 placeholder, the same rule as WP2 item 2. `scripts/check-prerender-content.mjs`: assert `dist/events/index.html` contains no "Starts in".
- **Home (`src/components/EventCard.tsx`):** `ViewCountBadge` is passed `timeframe="last hour"` over a 24-hour number (`:211`). Pass "last 24 hours" or drop the badge; Events stops using the component on month pages.
- **Search (`src/lib/savedSearchFilters.ts`):** add `from`, `to` and `area` to `SAVED_SEARCH_FILTER_KEYS` (`:23`); `savedSearchMatch.ts` already reads them. WP2's dialog note comes out when this lands. Also the D14 deploy.
- **Eat & Drink (`src/hooks/useNearbyListings.ts`):** order the restaurant scan by distance, or shrink the box to `PAIR_MAX_MILES`, so 60 rows cover it downtown. The dinner picks already refuse closed restaurants via `isOpenForDinner`; the "Grab a Bite Nearby" fallback grid doesn't.
- **Explore (`useVenueEvents` in `src/hooks/useVenues.ts`):** the venue page matches `ilike %<venues.name>%` while event detail uses `matchVenue`. If the D15 sample query confirms the "Woolys" / "Wooly's" split, fetch loosely and filter with `matchVenue`.
- **Account (`SubmissionTimeline.tsx:57`), Business (`YourEvents.tsx:86`):** select `title`, `date`, `event_start_utc` and link with `createEventSlugWithCentralTime`; then drop the entry from WP6's ratchet baseline.
- **Shell:** publish the header height as `--header-h` so WP1's sticky offsets can drop the `4rem` guess.

## Deferred (needs a live migration, a deploy, a secret or a decision)

- **D1 (P0), unchanged, with an addendum.** Near-me RPC visibility in place, and a v2. The v2 spec now also needs `p_start`/`p_end` applied before `LIMIT`, distance-first order with no featured boost, and the `EVENT_LIST_COLUMNS` projection. WP1 item 7 and WP5 item 1 are the interim.
- **D2, D4, D7, D8, D10, D11 (P1-P2), unchanged.** Numeric price, audience columns, `card_blurb`, event-photos MIME types, `venues.parking_notes`, per-venue counts.
- **D3 (P1), unchanged.** `get_event_social_counts(event_ids uuid[])`; WP1 item 10 feeds it per-page chunks.
- **D5 (P1), unchanged, costs more.** Probe `time_tbd`; apply `20260902000016` if absent; then add it to `EVENT_LIST_COLUMNS` (Home owns the file) and delete WP2 item 2's interim.
- **D6 (P1), changed.** `get_trending_events` and `trending_score` are in the snapshot. Gate is now a sample query showing non-zero scores on upcoming rows.
- **D9 (P2), changed.** `notify-event-submission/index.ts:268` and `agent-weekly-digest/index.ts:144`. Edge deploy.
- **D12 (P1), new.** `send-event-reminders/index.ts:151`, `send-weekly-digest/index.ts:363,385,408,431` and `assemble-weekly-digest/index.ts:90` should link `/events/<id>` or the Central dated slug (as `savedSearchMatch.ts:484` does). WP4 item 1 rescues the existing links. Edge deploy.
- **D13 (P1), new.** Apply `20260827000002` (`event_attendance_tallies`, absent from the snapshot) after a probe, then remove the `as never` casts in `useCommunityFeatures.ts`. Until then WP4 item 10 hides the counts.
- **D14 (P1), new.** Deploy `nlp-search` and `saved-search-alerts` after WP2 item 3, so `/search` and email alerts use the stricter free rule. Until then the web hub and `/search` can disagree on "$25; kids free".
- **D15 (P2), new.** Sample query: do `venues.name` values match how events spell the venue ("Woolys" in `20260228000002_create_venues.sql:45` vs "Wooly's" in `20260203000000_known_venues.sql:185`)? Longer term, `events.venue_id` set at ingest from `knownVenues`.
- **D16 (P2), new.** `get_event_categories_v2` returning category plus upcoming visible count, with the visibility predicates the current one lacks (`20251108000000_add_category_functions.sql:4-14`). Unlocks faceted counts.
- **D17 (P2), new.** `events.is_indoor` isn't in the snapshot (only `attractions.is_indoor`); per-card weather chips wait on it.
- **Decision, P2.** Whether sponsored rows should keep `is_featured` (`20260902000004:12-17`). WP1 makes the badge honest either way; this is about whether "Featured" can be bought.

## Conflicts resolved

- **Untimed rows under the new floor: hide after 19:31:58 (hub audit) or keep all day (holistic)?** Keep all day. The marker is "no time given", and a row with no time hasn't been shown to be over. It sorts under "Time not listed".
- **Hub near me: keep `?near=1` or send everyone to `/events/near-me`?** Keep `?near=1` for a granted location, fixed in WP1 item 7; a denial goes to the page with the origin picker. Retiring the hub path waits on D1 v2, when both can share one fetcher.
- **Quick picks: delete (hub audit) or restyle (holistic)?** Restyle and move into the sheet and the empty state. Music, Food, Family, Outdoors and "Free this weekend" aren't covered by the hero.
- **The hero chip: new `tonight` window or rename to "Today"?** Rename. A new window in `centralWindow` would be a sixth definition; the strip carries the tonight answer.
- **Free rule: client only, or client plus mirrors?** Both mirrors in one PR, because `search.test.ts:101` pins the string and a client-only change breaks CI.

## Rejected

- **"Closed restaurants aren't excluded from dinner before the show"** (detail, P1). The dinner picks go through `isOpenForDinner`, which refuses `NOT_SERVING` statuses (`tonightPairings.ts:437`). The ordering half holds and is handed to Eat & Drink.
- **"Every past event page 404s once agent-link-monitor archives it"** (detail, P1 as stated). Conditional on a deploy that hasn't been confirmed, so it isn't happening today. The merged-duplicate 404 is real now and keeps P1 (WP4 item 11), with archived handling folded in.
- **"Get tickets sends buyers to a competitor's listing index"** (detail). Not verified against rows; `firecrawl-scraper/index.ts:689` shows the fallback exists, not how often. The label fix stands on "Varies" and "See website" alone.
- **Venue matcher as P1** (SEO/directory). Depends on production data the audit couldn't see, and the venue page's query is Explore's. Moved to D15 and a hand-off.
- **Duplicates merged:** the hub floor (holistic P0, hub P1), the weekend window (holistic, hub, landings), the strip query (holistic, hub), "All day" (holistic, hub, landings), near-me grouping (holistic, hub, map), quick picks (holistic, hub), the social batch (holistic, hub), suburb restaurant stat (map, SEO), prerender labels (holistic, hub, detail), venues select-star (holistic, SEO, detail), month bounds (landings, SEO), new id links (holistic, detail).
- **"Tonight" day header after 17:00 is itself false** (hub). With WP1 item 1, the group under it holds only rows that aren't over, which is what the word claims; no label change needed.
