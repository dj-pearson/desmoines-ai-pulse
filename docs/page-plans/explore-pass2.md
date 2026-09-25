# Explore plan, second pass (`/things-to-do`, `/map`, attractions, playgrounds, `/music`, `/sports`, `/outdoors`, `/deals`)

Coordinator output, 2026-09-25. Built from one holistic audit and five section audits (hub, map, attractions and playgrounds, music/sports/outdoors, deals) against the first-pass plan `docs/page-plans/explore.md`, implemented in 0d69774. Later commits on this branch (Home, Events and Eat & Drink second passes, Search, Account, Pricing, Business) touched shared files, so every prior item was re-opened in today's tree. Every P0 and P1 below was re-read at its cited line; what didn't hold is under **Rejected**.

## Scorecard of the first pass

70 numbered items across WP1-WP8, plus six deferred.

| WP | Items | Shipped and working | Shipped but broken or half-done | Dropped, not deferred |
|---|---|---|---|---|
| WP1 hub | 9 | 8 | 1 (item 4) | 0 |
| WP2 map | 11 | 7 | 4 (items 4, 8, 9, 11) | 0 |
| WP3 attractions | 11 | 10 | 1 (item 6) | 0 |
| WP4 playgrounds | 9 | 7 | 2 (items 3, 9) | 0 |
| WP5 music and sports | 10 | 7 | 3 (items 6, 9, 10) | 0 |
| WP6 outdoors | 8 | 7 | 1 (item 3) | 0 |
| WP7 deals | 9 | 7 | 2 (items 3, 5) | 0 |
| WP8 lanes | 3 | 2 | 0 | 1 (item 3) |
| **Total** | **70** | **55** | **14** | **1** |

Deferred D1-D6 are unchanged, with one new angle on D2 (duplicate-name slug ranking), listed under Deferred.

The broken and half-done items, each with where it breaks today:

- **WP1.4, hub weekend line.** The comment at `ThingsToDoHub.tsx:43` says it shares a cache entry with `/events/this-weekend`. It stopped doing that when Events pass 2 gave the landing `includeOngoing: true` and `columns: LANDING_LIGHT_COLUMNS` (`EventsThisWeekend.tsx:141-149`), and both are part of the key (`useEventLanding.ts:115-116`). The hub now fetches up to 500 full rows to print one number, and the number leaves out running multi-day events the landing shows. It also isn't guarded by `isPrerender()`, so the build-time count and weather get frozen into the static HTML.
- **WP2.4, map visibility window.** `DiscoverMap.tsx:276` still uses `upcomingOrFilter`. Events pass 2 moved every other surface to `notOverFilter`, so under Any time the map lists this morning's finished events.
- **WP2.8, time chips.** `inEventWindow` (`DiscoverMap.tsx:152-158`) drops any event with no `end_date` the minute it starts, so at 7:10 PM the 7 PM show is gone from Tonight, the default chip after 4 PM. Untimed events carry the 19:31:58 marker and read "Starts 7:31 PM" (`:165-175`; `DATE_ONLY` at `:203` never matches a timestamptz). Attractions pass through Now and Tonight unfiltered (`:699-701`).
- **WP2.9, URL state.** `?sel=` on a cold load doesn't centre on a place outside the default viewport, and closing the popup never clears it.
- **WP2.11, mobile height.** `h-[calc(100dvh-5rem)]` (`:938`) ignores the safe-area term in `main`'s padding, so on a notched phone the page scrolls under the map.
- **WP3.6, one Website control.** There are three on mobile (`AttractionDetails.tsx:463,537,691`).
- **WP4.3, "by families".** Gone from the page body but still in the meta, OG, Twitter and JSON-LD descriptions (`EnhancedPlaygroundSEO.tsx:42`).
- **WP4.9, one facts row.** "Parent essentials" shipped, but the old tile grids and "Things To Know" stayed beside it (`PlaygroundDetails.tsx:381-473,522-559`), so admission appears four times.
- **WP5.6, venue "Next:" line.** `normaliseVenueName` (`hubEventPartition.ts:114-123`) turns "Wooly's" into "wooly s", which never equals "Woolys". The scrapers write "Casey's Center" and the venues row still says "Wells Fargo Arena".
- **WP5.9, "See all N".** The hubs count `category ilike %Music%|%Concert%` (`MusicHub.tsx:53`) and link `/events?category=Music` (`:303`), which applies `.eq('category', ...)` (`eventsHubQuery.ts:250-251`). The number on the link isn't the set it opens.
- **WP5.10, sports copy.** The replacement hero puts three teams "at Wells Fargo Arena" (`SportsHub.tsx:193`); the repo's own migration calls it Casey's Center (`20260729000001_event_source_venue_aliases.sql:24`).
- **WP6.3, "checked" dates.** All eight read "Details checked Aug 31, 2026" (`OutdoorsDestinationSection.tsx:72-75`), and the field's own doc comment says that is the date the guide was written (`outdoorsGuide.ts:38-44`).
- **WP7.3, "Today" vs "Live now".** `isDealOnToday` checks only today's weekday (`useDeals.ts:349-357`), so a Fri 9 PM-2 AM deal is live at 1 AM Saturday and missing from Today.
- **WP7.5, venue link.** `useDealVenueLinks` works, but the only write path, `DealManager`, has no `entity_id` field (`DealManager.tsx:398-418`). The spec passes because its fixture injects one (`tests/deals.spec.ts:56`).
- **WP8.3, dropped.** `tests/touch-targets.spec.ts:43` still runs only `/`, `/events`, `/contact`, `/trip-planner`.

Worth keeping as they are: the fixed hub model and `hubLinks.ts` split with its tests, `hubSeason.ts`, TonightRail reuse, the kept-mounted map with bounds-scoped counts and the split link row, `attractionHours.ts` and its tests, the attraction events rail, playground shade and restroom facts with Near me, `hubEventPartition.ts`, the Outdoors weather and `metroCount` honesty, the deals schedule engine (`isDealLiveAt`, `formatDealSchedule`) and reveal-first claim, and the fixture-backed specs, all seven of which are in the smoke lane (`playwright.smoke.config.ts:171`).

## Where it stands

- **Time is still where it breaks.** The map's default chip hides shows once they start and labels untimed events 7:31 PM. On Monday, "This weekend" fills its 200-row cap with Monday-Thursday rows (`DiscoverMap.tsx:276-285` has no lower bound at the window). `/music` and `/sports` drop a festival that started yesterday (`.gte('date', range.start)`, `MusicHub.tsx:54`), and every Sunday the music weekend section is structurally empty. "Tonight" means three different windows across Explore.
- **Honesty gaps survived the first pass, and pass 1 added two.** The attraction Featured badge reads a flag the cleanup migration deliberately left uncleared (`20260902000004_clear_random_featured_flags.sql:26-29`). The attraction hero shows an unsourced `rating` linked to a reviews block with a different number (`AttractionDetails.tsx:438-446`). Playground pages assert "Free" five times with no column, which WP4.9 of the first plan asked for. "Exclusive discounts" (`Deals.tsx:143`), "Join 10,000+ locals ... exclusive deals" (`NewsletterSignup.tsx:144`), "Editor's Pick, selected by our editors" (`PlaygroundDetails.tsx:464-467`), "guides from our editors" over generated pSEO pages (`ThingsToDoHub.tsx:381`), "sorted by what is actually open" (`OutdoorsHub.tsx:108`), "tailgating tips" (`SportsHub.tsx:124`) and a seat-capacity badge that VenueDetail refuses to assert (`MusicHub.tsx:421-426`) are all copy nothing backs.
- **Two files pass 1 never listed are the worst in the section.** `EnhancedPlaygroundSEO.tsx:246,249` still emits bare `JSON.stringify` inside `ld+json` over Google Places text, and `TeamDetail.tsx:88-96` does the same. Both are still on the json-ld-escape BASELINE.
- **The admin form corrupts deal expiry.** `DealManager.tsx:221-226` fills the datetime inputs with UTC wall time and `:407-410` parses it back as local, so each save of an existing deal moves `start_date` and `end_date` 5 or 6 hours later.
- **The hub shows no places.** Below the Tonight rail it is five sections of links. It splits its own intents across two URLs: hero chips go to `/events/today` and `/events/this-weekend`, while the When cards upgrade to self-canonical pSEO pages whenever those are published (`hubLinks.ts:121-122`, `ThingsToDoHub.tsx:152-158`).
- **"Everything connects" exists only on the hub.** `rg '/map' src/pages/{MusicHub,SportsHub,Deals,Attractions,Playgrounds,OutdoorsHub,AttractionDetails,PlaygroundDetails}.tsx` finds nothing. `/music`, `/sports` and `/deals` link no sibling Explore page.
- **Detail pages one click down lag the hubs.** TeamDetail and VenueDetail say "No upcoming games/events" while loading. TrailDetail has none of the guide's parking, dogs and winter facts, even for the five trails that are guide destinations. The attraction and playground pages hard-code light surfaces (`bg-gray-50`, `text-gray-900`) under a site that ships a ThemeToggle.

## What makes it ours

Each bet uses data and code already in the repo. None needs a new table.

1. **"Open right now" across Explore, stated with its gaps.** The hub gets an Open-now block of attractions open at this Central minute (`src/lib/attractionHours.ts` `attractionOpenStatus`, rows from `useAttractions`, which `/attractions` already caches), ordered indoor-first when `useWeather`'s verdict says so (`reorderForWeather`, `src/hooks/useWeather.ts:126`), with a live-deals count from `isDealLiveAt` (`src/hooks/useDeals.ts:333`). The map's Now and Tonight chips give attractions the same status restaurants already get (`resolveOpenStatus` in `src/lib/restaurantHours.ts`) and say how many places have no listed hours. Yelp answers restaurants, Eventbrite answers events, and neither Catch Des Moines nor TripAdvisor answers "what can I walk into in the next hour". The count of what we don't know is part of the answer.
2. **One Tonight, one weekend, one count.** The hub's weekend line uses the landing's exact query options, so its number is the landing's number and the hub request pre-warms the page it links. `/music` uses `tonightWindow()` (`src/lib/tonightPairings.ts:210`), the same window the Tonight rail uses. A "See all" link carries a number only when the destination filter is the same predicate.
3. **Per-area weekend counts at no request cost.** The light weekend rows carry `city`, `venue` and `location`. Matched client-side against `NEIGHBORHOODS[].matchTerms` (`src/lib/neighborhoods.ts:53`), the same terms the neighbourhood pages filter on, each area chip on the hub reads "East Village: 14 this weekend" and links `/neighborhoods/<slug>`. All eight areas come from `NEIGHBORHOODS`, not a hand-copied six.
4. **Everything connects, on every Explore page.** One `ExploreSectionLinks` row on all eight pages, "Show on map" (`/map?layers=...`) from the attraction, playground and outdoors lists, a "Kids events nearby" rail on playground pages that reuses `AttractionEventsRail` (`src/components/attractions/AttractionEventsRail.tsx:52`), and one venue matcher (`matchVenue` in `src/lib/venuePages.ts`) behind the music hub card, the venue page and event detail, so "3 shows in the next 2 weeks" is a number a reader can click through and check.
5. **Ratings from people who went, and badges only where a person set them.** The attraction hero shows the `content_rating_aggregates` average with its count ("4.3 from 12 reviews") that `#reviews` already renders through `useRatings.ts:100`, instead of an unsourced column. Featured comes off attractions until an admin reviews the flags. "Checked" becomes "Written", "Exclusive" and "by families" go. TripAdvisor and Yelp mix paid and unverified signals into their rankings without saying which is which.

Considered and not adopted this pass: live-deal badges on map pins (needs `entity_id` populated, which WP6 makes possible; revisit next pass), retiring `AttractionsMap`/`PlaygroundsMap` in favour of `/map` (needs WP2's `sel` cold-load first), sunset times for High Trestle, and a "confirm or correct" control for playground facts (needs a moderated table).

## How the packages fit together

Six packages with disjoint file sets, implemented in parallel in one tree. **WP6 lands last**: it is the only package that edits `playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`, `tests/touch-targets.spec.ts` and `tests/request-budget.spec.ts`. Every other package writes new Playwright specs as new files under `tests/`, or extends the Explore spec it already owns, using `installFixtureBackend(page)` from `tests/support/fixtureBackend.ts` and its own `page.route` fixtures registered after it (the last handler wins). Nobody edits `fixtureBackend.ts`.

**In-plan contracts, so the parallel work compiles together.**

- WP1 creates `src/components/explore/ExploreSectionLinks.tsx` with `export function ExploreSectionLinks({ current }: { current: string })`, a plain text row of `HUB_EXPLORE_LINKS` with `aria-current="page"` on `current`. WP2-WP6 mount it on their pages with one import line and write nothing else in that file.
- WP3 adds `?open=now` to `/attractions`. WP1 links to exactly that URL.
- WP3 adds an `attractionOpeningHoursSpec(hours)` export to `src/lib/attractionHours.ts`. WP2 imports only the existing `attractionOpenStatus`.
- WP4 owns `scripts/__tests__/json-ld-escape.test.mjs` and moves both `components/EnhancedPlaygroundSEO.tsx` and `pages/TeamDetail.tsx` from BASELINE to REQUIRED_CLEAN. WP5 converts TeamDetail to `toJsonLd`. The test is green only when both land, which they do in the same tree.
- WP4 imports `AttractionEventsRail` (WP3's file) read-only, with its current props.

**Cross-plan files, read-only here.** `src/lib/tonightPairings.ts`, `src/hooks/useNow.ts`, `src/lib/isPrerender.ts`, `src/components/TonightRail.tsx` and `src/lib/listColumns.ts` belong to Home pass 2. `src/components/events/eventsHubQuery.ts`, `src/hooks/useEventLanding.ts`, `src/lib/timezone.ts` and `src/pages/EventsPage.tsx` belong to Events. `src/lib/restaurantHours.ts`, `src/lib/safeUrl.ts`, `src/hooks/useNearbyListings.ts` and `functions/_middleware.ts` belong to Eat & Drink. `src/hooks/useWeather.ts`, `src/hooks/useRatings.ts` and `src/components/RatingSystem.tsx` are consumed unmodified. `useVenueEvents` in `src/hooks/useVenues.ts` belongs to Explore (Events pass 2 added `useVenueMatchRows` in the same file; WP5 edits only `useVenueEvents`). `src/components/NewsletterSignup.tsx` is consumed unmodified by `plan-stay.md` and owned by nobody, so WP6 takes it for a copy change and changes no props.

---

## WP1: Things-to-do hub

**Goal:** the hub's numbers are the numbers on the pages it links, it shows places open now, and each intent has one destination.

**Files:** `src/pages/ThingsToDoHub.tsx`, `src/lib/hubLinks.ts`, `src/lib/__tests__/hubLinks.test.ts`, `src/lib/hubSeason.ts`, `src/lib/__tests__/hubSeason.test.ts`, `src/hooks/useSeasonalGuides.ts` (new `useSeasonalGuideSlugs` export only), new `src/components/explore/ExploreSectionLinks.tsx`, new `src/components/explore/OpenNowAttractions.tsx`, new `src/lib/areaCounts.ts`, new `src/lib/__tests__/areaCounts.test.ts`, `tests/things-to-do-hub.spec.ts`, new `tests/explore-section-links.spec.ts`.

1. **P1 / S. Weekend line matches the landing.** Call `useEventLanding` with the options `EventsThisWeekend.tsx:141-149` passes: `key: { landing: 'this-weekend' }`, `window: 'this-weekend'`, `limit: 500`, `includeOngoing: true`, `columns: LANDING_LIGHT_COLUMNS`. Correct the comment at `:43`. On Saturday and Sunday exclude rows `isEventOver` and label "N still to come this weekend". Point "M free" at `/events?preset=this-weekend&price=free` (both keys are read at `EventsPage.tsx:85`; confirm the `price` value that means free before linking, else render M as plain text). Unit test in `hubLinks.test.ts` or a new small helper: the hub's option object deep-equals the landing's.
2. **P1 / S. Nothing time-bound in the prerendered HTML.** Under `isPrerender()`, WeekendLine renders only "See what's on this weekend" at the same height. Delete WeekendLine's weather paragraph and its `useWeather` call; the rail's `RailWeatherLine` already states the conditions, and under the weekend count the current hour reads as a weekend forecast. Remove `aria-live` from the line (`:104`).
3. **P1 / S. One URL per intent.** Remove `pseoSlug` from `HUB_WHEN_FIXED` (today, this-weekend) and from `live-music`, `arts-culture`, `outdoors`, `budget` and `families`, which have a first-party page. `seasonCard` (`ThingsToDoHub.tsx:152-158`) links the seasonal guide, not `/things-to-do/<season>`. Keep pSEO upgrades only where no first-party page exists (festivals, brunch, areas). Test in `hubLinks.test.ts`: an item whose fallback href is a route in `src/App.tsx` carries no `pseoSlug`. Update `tests/things-to-do-hub.spec.ts:106` to expect `/events/today`.
4. **P1 / M. Open now.** `OpenNowAttractions.tsx` below the weekend line: rows from `useAttractions` with default filters (same key `/attractions` uses, read-only import), active rows with coordinates whose `attractionOpenStatus(hours, hours_summary, now).isOpen` is true, up to 6, passed through `reorderForWeather` when `hasVerdict`. Each card: name, `formatOpenStatusLine` ("Open until 5 PM"), and Free / Indoor / Kids from the columns. Header states the denominator: "Open now: 7 of 23 attractions with listed hours". "See all open now" links `/attractions?open=now`. Fixed height, `useNow(60_000)` for the clock, nothing rendered under `isPrerender()` or with zero rows. One line under it when `useDeals` has live rows: "3 deals running now" linking `/deals?when=now`, from `filterDealsByWhen`.
5. **P1 / S. Honest subtitle.** "More guides" subtitle (`:381`) becomes "More neighborhood and occasion pages". "Playgrounds near you on the map" (`:286`) becomes "Playgrounds on the map"; the map only locates the user after a tap.
6. **P1 / S. Explore row everywhere.** Create `ExploreSectionLinks` per the contract above, and mount it on the hub in place of the inline list. `tests/explore-section-links.spec.ts` loads all eight Explore routes under the fixture backend and asserts the row is present with exactly one `aria-current="page"` link.
7. **P2 / S. Areas from `NEIGHBORHOODS`, with counts.** Derive `HUB_AREAS` from `NEIGHBORHOODS` (all eight, their own descriptions, pSEO upgrade kept), drop the generic fallback description, add "All neighborhoods" to `/neighborhoods`. `areaCounts.ts` counts item 1's light rows per area with the same `matchTerms` rule the neighbourhood page uses; the chip shows "14 this weekend" only once the line has settled and never under prerender.
8. **P2 / S. When row adds, not repeats.** Chips stay in the hero. The When row becomes the State Fair (in window), this month (`/events/<month>-<year>`), next season and Date night (`/events/date-night`).
9. **P2 / S. Activity chips go somewhere new.** Festivals to `/events?category=Festival`, Brunch to `/restaurants?cuisine=Cafe,Brunch,Breakfast` (the brunch preset), and drop Live Music, Parks & Outdoors and Arts & Museums, which duplicate the Explore row. Test: no activity href equals an Explore-row href.
10. **P2 / S. Seasonal guides, cheap and current.** `useSeasonalGuideSlugs` selects `slug, season, publish_date` under its own key. `seasonHref` skips guides older than 10 months or whose slug carries a past year, then falls back. `hubSeason.test.ts` case dated 2027-06-15 expects the fallback.
11. **P2 / S. Layout and schema.** Suspense fallback height matches the rail after Home pass 2's `RailWeatherLine` (19.5rem, with a comment naming both terms). Move the ItemList from `hasPart` to `mainEntity`, serialized with `toJsonLd`. Audience list keeps row dividers at every width.

**Acceptance:** with fixtures, the hub and `/events/this-weekend` issue one windowed events request between them, and the hub count equals the landing count. `dist/things-to-do/index.html` holds no "events this weekend" count and no "Open until". No hub link points at `/things-to-do/today`, `/things-to-do/this-weekend` or `/things-to-do/live-music`.

**Verify:** `npm run test:unit` (hubLinks, hubSeason, areaCounts), `tests/things-to-do-hub.spec.ts` and `tests/explore-section-links.spec.ts` with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome --project=chromium-desktop`, including a 390px assertion that every `main a[href]` is at least 44px tall; `npm run build && node scripts/check-prerender-content.mjs`; `npm run validate`.

---

## WP2: Discover map

**Goal:** the time chips mean what they say for every layer, and the map shows only places that exist.

**Files:** `src/pages/DiscoverMap.tsx`, `src/components/map/DiscoverMapCanvas.tsx`, new `src/lib/mapEventWindow.ts`, new `src/lib/__tests__/mapEventWindow.test.ts`, `tests/discover-map.spec.ts`, new `tests/discover-map-time.spec.ts`.

1. **P0 / S. A show that started is still on Tonight.** Move `eventWindow`, `inEventWindow` and `eventStatusLabel` into `mapEventWindow.ts` as pure functions. For now and tonight, keep a row with no `end_date` whose start is within `RECENT_START_GRACE_MS` of now (`eventsHubQuery.ts:173`, import only). Unit test: Tonight at 19:10 CT keeps a 19:00 row with no end and labels it "Started 7 PM".
2. **P0 / S. No 7:31 PM.** Select `event_start_local` in `fetchEvents` (`:268-270`) and compute `hasSpecificTime(row)` (`timezone.ts:144`) at fetch time. When false, the label is the day only ("Today", "Sat, Sep 27"). Delete the dead `DATE_ONLY` branch (`:203-207`). Unit test with a `T19:31:58` Central row: no "7:31" in the label.
3. **P1 / S. The request asks for the window.** Replace `upcomingOrFilter` with `notOverFilter(new Date(at))` for Any time and Now. When a window exists, add its lower bound server-side next to the existing `lte`: `date >= from - grace` or `end_date >= from`. `tests/discover-map-time.spec.ts` on a Monday (`page.clock.setSystemTime`, not `install`, so Leaflet's timers run) asserts the weekend request carries a `date` lower bound at Friday.
4. **P1 / S. Active attractions only.** `.eq('is_active', true)` in `fetchAttractions` (`:375-381`) plus a client guard. Spec: an inactive fixture row is absent and the request URL has `is_active=eq.true`.
5. **P1 / M. Attractions answer Now and Tonight.** Select `hours, hours_summary` on the attraction layer; in the clock pass compute `attractionOpenStatus` and filter under Now and Tonight the way restaurants are filtered, with `statusLabel` on the row, popup and marker title. Keep unknown-hours attractions only under Any time. Playgrounds and trails have no hours: under Now and Tonight show one line, "Parks and trails show at any time". Count restaurants and attractions hidden for missing hours and say so in the truncation line ("12 places without listed hours are hidden").
6. **P1 / M. Open-now isn't an alphabetical slice.** When Now or Tonight is on and the restaurant layer hits its 300 cap, fetch the next page by name (one more request, hard ceiling 600) before filtering, and when still truncated say "Showing the first 600 restaurants in view by name; zoom in for the rest".
7. **P1 / S. OSM attribution visible on phones.** `attributionControl={false}` and `<AttributionControl position="topright" />` below `md`. Spec at 390x844: `elementFromPoint` at the attribution's centre returns the attribution.
8. **P2 / S. Nearest first after Near me.** With `userLocation` set, sort `inView` by `haversineDistance` from `src/lib/geo.ts` and show "0.4 mi" on each row and popup; `sort=near` in the URL.
9. **P2 / S. `sel` works cold, and markers don't lurch.** On first data, if `sel` isn't in view, fly to it once (ref-guarded). Clear `sel` on popup close. A marker click selects without `flyTo`; a list-row click flies, or pans without zooming when the pin is already in view.
10. **P2 / S. Phone height.** `h-[calc(100dvh-4rem-max(1rem,env(safe-area-inset-bottom)))]`. Spec at 390x844: `scrollHeight === innerHeight`.
11. **P2 / S. Render churn and keyboard.** `useQueries` with `combine` returning a stable per-layer record; memoized `EntityMarker` with `eventHandlers` memoized on `entity.id`; `keyboard={false}` on markers when more than 60 are plotted (the list is the keyboard path). On `popupopen`, focus the popup's first link; on `popupclose`, return focus to the marker. Log the in-view count in dev for a downtown z13 view with all layers on, and paste it into the PR.
12. **P2 / S.** Mount `ExploreSectionLinks current="/map"` in the desktop list footer.

**Acceptance:** at 19:10 CT with a 19:00 no-end fixture, Tonight shows it. No list row, popup or marker title contains "7:31". On Monday, This weekend shows the weekend fixtures. An inactive attraction has no pin. Under Now, a museum whose hours ended at 17:00 has no pin at 21:00.

**Verify:** `npm run test:unit` (mapEventWindow), `tests/discover-map.spec.ts` and `tests/discover-map-time.spec.ts` (partial failure: one layer 500s and the others render with "Could not load Trails"), `npm run validate`.

---

## WP3: Attractions hub and detail

**Goal:** every attraction fact has a source, open status is true at the minute it's read, and the page works in dark mode.

**Files:** `src/pages/Attractions.tsx`, `src/pages/AttractionDetails.tsx`, `src/components/EnhancedAttractionSEO.tsx`, `src/lib/attractionHours.ts`, `src/lib/__tests__/attractionHours.test.ts`, `src/components/AttractionsMap.tsx`, `src/components/attractions/AttractionEventsRail.tsx` (no change planned; owned so WP4 can rely on its props), `tests/attractions-hub.spec.ts`, new `tests/attraction-detail.spec.ts`.

1. **P1 / S. No Featured on attractions.** Hide the Featured badge (`AttractionDetails.tsx:415-422`) and the "Featured Only" filter (`Attractions.tsx:447-458,570-580`); an unknown `?featured=` reads as all. Keep `SponsoredBadge`, which is a real signal. Deferred D8 brings it back once flags are reviewed.
2. **P1 / M. One rating, with its source.** In the hero, show the `content_rating_aggregates` average and count from `useRatings` ("4.3 from 12 reviews") when `total_ratings > 0`, linked to `#reviews`. Otherwise show no star. Stop using `attractions.rating` in the hero and in the meta description ("Rated X/5", `EnhancedAttractionSEO.tsx:54-56`). Hub default sort becomes name; `sort=rating` stays available and unknown values read as name.
3. **P1 / S. Status true at the minute, and absent from static HTML.** Under `isPrerender()`, no status chip, no fact-line status and no today highlight in the weekly table, on both pages. Otherwise compute with `useNow(60_000)` so a tab left open updates.
4. **P1 / S. Hours in JSON-LD.** `attractionOpeningHoursSpec(hours)` in `attractionHours.ts` returns `OpeningHoursSpecification[]` for days with complete data only. Emit it on the TouristAttraction node, give that node `@id: ${url}#place` so it stops merging with the WebPage node, and drop `place:city` (`:206`). Unit test: a row missing `sun` emits six entries.
5. **P1 / S. Open now on the hub.** An "Open now" chip (`?open=now`) filters client-side on `attractionOpenStatus(...).isOpen` and says "Open now: 7 of 23 with listed hours". A Near me sort via `useGeolocation` and the existing distance sort. Neither applies under prerender.
6. **P1 / M. Dark mode.** Replace `gray-*` and `bg-white` in both files with tokens (`bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`), including the Not Found card's `#2D1B69` (`AttractionDetails.tsx:224-236`). Spec: axe color-contrast with `html.dark` on `/attractions` and one detail page.
7. **P2 / S. Links and buttons.** `<Button asChild><Link/></Button>` at the three nested spots (`AttractionDetails.tsx:233-238,366-371,664-669`). Hub card becomes an `<article>` with the title as a stretched link and FavoriteButton as a sibling; drop the card `aria-label` so the fact line is read.
8. **P2 / S. Copy that points at nothing.** "Paid admission" alone when `website` is null (`:262-266`). One Website row plus the sticky CTA; the status chip's fallback is plain text. Render "Est. visit time" only for types in `VISIT_DURATION_BY_TYPE` and drop that question from the FAQ schema.
9. **P2 / S. Map fits the data.** `AttractionsMap` calls `fitBounds` over rows with coordinates, says "N of M attractions have no map location", and puts type, fact line and today's status in the popup.
10. **P2 / S. Connected.** Mount `ExploreSectionLinks` on the hub and a "Show on map" link to `/map?layers=attraction`.

**Acceptance:** no attraction page shows "Featured" or a star without a review count. `dist/attractions/index.html` contains no "Open until" or "Closes". A detail page's JSON-LD includes `openingHoursSpecification` when `hours` is set.

**Verify:** `npm run test:unit` (attractionHours), `tests/attractions-hub.spec.ts`, `tests/attraction-detail.spec.ts`, `npx impeccable detect src/pages/Attractions.tsx src/pages/AttractionDetails.tsx`, `npm run validate`.

---

## WP4: Playgrounds hub and detail

**Goal:** a parent on a phone sees a playground on the first screen, and every claim on the page has a column behind it.

**Files:** `src/pages/Playgrounds.tsx`, `src/pages/PlaygroundDetails.tsx`, `src/components/EnhancedPlaygroundSEO.tsx`, `src/hooks/usePlaygrounds.ts`, `src/hooks/__tests__/usePlaygrounds.helpers.test.ts`, `src/components/PlaygroundsMap.tsx`, `scripts/__tests__/json-ld-escape.test.mjs`, `tests/playgrounds-hub.spec.ts`, new `tests/playground-detail.spec.ts`.

1. **P0 / S. Escape the JSON-LD.** `toJsonLd` for both blocks (`EnhancedPlaygroundSEO.tsx:246,249`). Move `components/EnhancedPlaygroundSEO.tsx` and `pages/TeamDetail.tsx` from BASELINE to REQUIRED_CLEAN (`json-ld-escape.test.mjs:101,110`).
2. **P1 / S. No "Free" without a column.** Remove the hard-coded Free at `PlaygroundDetails.tsx:279-281,366-367,419-420,494,545` and `isAccessibleForFree`/`publicAccess` (`EnhancedPlaygroundSEO.tsx:117-118`). The page's own SEO-014 note (`:151-156`) says indoor play spaces are in this table, which is why the schema-side justification doesn't hold. D9 adds the column.
3. **P1 / S. Meta that matches the page.** Drop "by families" (`EnhancedPlaygroundSEO.tsx:42`). Locality from `suburbFromLocation(location)` or omitted, never `BRAND.city` for every row (`:50,53,196,224`). `geo.position`/ICBM only from the row's own coordinates (`:183-184`). `@type: Playground`, `@id: ${url}#place`, speakable `['h1']`.
4. **P1 / S. No invented copy on the page.** "Featured" only, no editors' claim (`:464-467,493,186`). Null `age_range` renders nothing. Drop the `BRAND.city, BRAND.state` lines under addresses (`:394,489,534`). Delete the `.playground-summary` template (`:486-496`) and its speakable selector.
5. **P1 / S. One facts block.** Keep Parent essentials plus one Address block with one Directions link and the map. Delete `:418-472` and `:522-559`. One plain line that hours aren't listed.
6. **P1 / S. First screen shows a playground.** Drop `min-h-[400px]` and `py-16` on phones (`Playgrounds.tsx:473-474`), one-line subcopy, Near me beside the search input. Spec at 390x844: the first result card's top is under 844px.
7. **P1 / S. Hub meta description.** "{n} playgrounds across the Des Moines metro, with shade, restrooms, surface and accessibility notes where we have them.", with n the metro count from `usePlaygroundFacets` and no number while loading (`:416`).
8. **P1 / M. Kids events nearby.** Mount `AttractionEventsRail` on the detail page with the playground's name and coordinates under "Happening nearby". It already merges venue-name matches and events within two miles.
9. **P2 / S. Location filter is a suburb, not a substring.** Match `suburbFromLocation(row.location) === s` or a comma-segment `ilike`, escaped, so "Des Moines" no longer returns West Des Moines; facets count the same way (`usePlaygrounds.ts:208,402-411`). Unit test.
10. **P2 / S. Order and recovery.** Default sort name A-Z with a Name / Near me control; `rating != null && rating.toFixed(1)` on cards. Error state uses `ErrorState` with `onRetry` (`:680`). `useNearbyPlaygrounds` drops the rating order before the 40 cut (`usePlaygrounds.ts:474`). One polite live region, not two (`:638,894`).
11. **P2 / S.** Mount `ExploreSectionLinks` on the hub and a "Show on map" link to `/map?layers=playground`. Replace `gray-*`/`bg-white` with tokens in both files.

**Acceptance:** `rg -n 'JSON.stringify' src/components/EnhancedPlaygroundSEO.tsx` returns nothing. No playground page contains "Free", "by families", "editors" or "All ages welcome". At 390x844 a result card is on the first screen.

**Verify:** `node --test scripts/__tests__/json-ld-escape.test.mjs`, `npm run test:unit`, `tests/playgrounds-hub.spec.ts`, `tests/playground-detail.spec.ts`, `npm run validate`.

---

## WP5: Music, sports, outdoors and their detail pages

**Goal:** one venue identity, one Tonight, running events included, and detail pages that match their hubs.

**Files:** `src/pages/MusicHub.tsx`, `src/pages/SportsHub.tsx`, `src/lib/hubEventPartition.ts`, `src/lib/__tests__/hubEventPartition.test.ts`, `src/lib/venuePages.ts`, `src/lib/__tests__/venuePages.test.ts`, `src/hooks/useVenues.ts` (`useVenueEvents` only), `src/hooks/useTeams.ts`, `src/pages/TeamDetail.tsx`, `src/pages/VenueDetail.tsx` (loading state and links only; Events pass 2 already fixed its JSON-LD), `src/pages/TrailDetail.tsx`, `src/pages/OutdoorsHub.tsx`, `src/components/outdoors/OutdoorsDestinationSection.tsx`, new `src/components/outdoors/DestinationLogistics.tsx`, `src/data/outdoorsGuide.ts`, `src/data/__tests__/outdoorsGuide.test.ts`, `tests/music-sports-hubs.spec.ts`, `tests/outdoors-hub.spec.ts`, new `tests/team-venue-trail-detail.spec.ts`.

1. **P1 / S. Apostrophes and the arena's new name.** Strip `'` and U+2019 before the punctuation replace in `normaliseVenueName`. Add an in-code alias map keyed by venue slug (Casey's Center / Caseys Center for the arena row, Leftys for Lefty's Live Music), taken from `20260729000001_event_source_venue_aliases.sql`, so no request is added. Unit cases: Wooly's/Woolys, Lefty's/Leftys Live Music, Casey's Center/Wells Fargo Arena.
2. **P1 / M. One matcher.** `matchVenue` in `venuePages.ts` (plus item 1) becomes the rule; `eventAtVenue` wraps it, and `useVenueEvents` fetches loosely by `ilike` and filters with `matchVenue` (the Events pass 2 hand-off, `events-pass2.md:277`). Spec: on the fixture backend, the `/music` venue card's count equals the list on `/music/venues/woolys`.
3. **P1 / S. "See all" carries no number it can't back.** Keep the hubs' `ilike` sets (the WEB-BE-049 backfill isn't confirmed live). Word the links "This weekend on the events calendar" and "Next 7 days on the events calendar" with no count (`MusicHub.tsx:302-306`, `SportsHub.tsx:246,287`). D12 switches to `eq` once the backfill is confirmed.
4. **P1 / S. Sports copy from the rows.** Build the hero sentence from `teams` rows grouped by `venue_name` after they load, nothing while loading (`SportsHub.tsx:193`). Meta description describes what renders: "Des Moines sports this week: Iowa Cubs, Iowa Wild, Iowa Wolves and Iowa Barnstormers games, with each team's schedule and venue." (`:124`).
5. **P1 / S. No capacity on venue cards.** Remove the capacity badge (`MusicHub.tsx:421-426`) and `maximumAttendeeCapacity` (`:160`), matching `VenueDetail.tsx:161-163`.
6. **P1 / S. Sunday isn't an empty weekend.** On Sunday don't render the weekend section; on Saturday title it "Tomorrow (Sunday)". Spec with `page.clock.setSystemTime` at Sunday 20:00 CT.
7. **P1 / S. Loading isn't empty on detail pages.** TeamDetail and VenueDetail read `isPending` from `useTeamGames`/`useVenueEvents`, render card skeletons, and show empty copy only on `status === 'success'` with zero rows. `tests/team-venue-trail-detail.spec.ts` delays the events response and asserts no "No upcoming" text during the delay.
8. **P1 / M. TrailDetail carries the guide.** When an `OUTDOORS_DESTINATIONS` entry has `internalPath === /outdoors/${slug}`, render its logistics `<dl>` through `DestinationLogistics.tsx` (extracted from `OutdoorsDestinationSection`). Emit TouristAttraction JSON-LD via `toJsonLd` with geo and address. Directions via `getDirectionsUrl`.
9. **P1 / S. "Written", not "checked".** Rename `checkedOn` to `writtenOn`, add optional `checkedOn`, and render "Checked <date>" only when `checkedOn` is set, else "Written Aug 31, 2026". The 365-day test applies to whichever is shown.
10. **P1 / S. Outdoors copy.** "Keep going" note for `/things-to-do` (`OutdoorsHub.tsx:108`) becomes "Every Explore section, plus seasonal picks". "Today in Des Moines" becomes "Right now in Des Moines"; the mud note is conditional ("Rain is likely today; unpaved trails may be muddy"). Playground distances say "straight line" once in the heading.
11. **P1 / S. TeamDetail safety.** `toJsonLd` for its JSON-LD (`:88-96`). `safeHttpUrl` from `src/lib/safeUrl.ts` (import only) for `team.website`, `team.schedule_url`, and the admin-written hrefs at `TrailDetail.tsx:186` and `VenueDetail.tsx:190`; delete SportsHub's private `safeExternalUrl` in favour of it.
12. **P2 / S. Running events and one Tonight.** Replace `.gte('date', range.start)` on both hubs with a nested `and(...)` that also admits rows started earlier with `end_date >= now`; if the fixture backend can't express the nesting, a second small query for running rows merged before partitioning. `/music` "Tonight's Shows" uses `tonightWindow(now)` from `tonightPairings.ts` (read-only); sports keeps "Today". Partition with `useNow(60_000)` and `centralDateOf(now)` in the memo deps. Unit case: a row that started yesterday with `end_date` tomorrow lands in tonight with `onNow`.
13. **P2 / S. Counts and dead ends.** Mark weekend and tonight badges with "+" when the 60-row cap is hit and the last row is on or before the window end. Empty Tonight names the next date with shows from `later[0]`. Difficulty options derive from `allTrails` with counts; zero-count options are hidden after load.
14. **P2 / S. Team matching.** `useTeamGames` adds `eq('category','Sports')`-or-`ilike` guard and a short alias list per team beside the teams data (I-Cubs). Button-in-anchor at `TeamDetail.tsx:125-136`, `TrailDetail.tsx:164-169,186-190`, `VenueDetail.tsx:178-183` become `<Button asChild><a/></Button>`; breadcrumbs get `aria-label="Breadcrumb"`.
15. **P2 / S. Connected.** Mount `ExploreSectionLinks` on `/music`, `/sports` and `/outdoors`, and "Show on map" to `/map?layers=trail,attraction` on `/outdoors`.

**Acceptance:** a "Casey's Center" fixture event gives the arena card a "Next:" line. No page says "Wells Fargo Arena", "tailgating", "Details checked" or a seat capacity. `/sports/iowa-cubs` never shows "No upcoming games" while its events request is pending.

**Verify:** `npm run test:unit` (hubEventPartition, venuePages, outdoorsGuide), `tests/music-sports-hubs.spec.ts`, `tests/outdoors-hub.spec.ts`, `tests/team-venue-trail-detail.spec.ts`, `npm run validate`.

---

## WP6: Deals, newsletter copy, and lane registration (lands last)

**Goal:** deal times survive an edit, the page promises only what the rows hold, and every new spec runs in CI.

**Files:** `src/pages/Deals.tsx`, `src/hooks/useDeals.ts`, `src/hooks/__tests__/useDeals.test.ts`, `src/components/DealCard.tsx`, `src/components/admin/DealManager.tsx`, new `src/lib/dealFormTime.ts`, new `src/lib/__tests__/dealFormTime.test.ts`, `src/components/NewsletterSignup.tsx` (copy only), `tests/deals.spec.ts`, `tests/touch-targets.spec.ts`, `tests/request-budget.spec.ts`, `playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`.

1. **P0 / S. Deal times in Des Moines time, both ways.** `dealFormTime.ts`: `toCentralInput(iso)` via `formatInTimeZone(d, 'America/Chicago', "yyyy-MM-dd'T'HH:mm")` and `fromCentralInput(value)` via `fromZonedTime(value, 'America/Chicago')`. Use them at `DealManager.tsx:221-226` and `:407-410`, and label the inputs "(Des Moines time)". Unit test: open-and-save round trip leaves `start_date`/`end_date` byte-identical in a UTC and a CDT process zone.
2. **P1 / M. Venue picker.** In DealManager, search restaurants, attractions or hotels by name (filtered by the chosen `entity_type`), write `entity_id` and prefill `business_name`. The admin list shows a "No venue linked" count. Hotel deals link `/stay/<slug>` through a third batched `.in('id', ids)` select of `id, slug` in `useDealVenueLinks` (`hotels.slug` is in the 2026-08-24 snapshot).
3. **P1 / S. Say what's there.** Hero: "Happy hours, specials and coupons at Des Moines businesses, with the days and times they run." Drop "Exclusive" from the hero and Helmet (`Deals.tsx:112,122,125,143`). Remove the Verified badge (`DealCard.tsx:102-104`) until D10 gives it a date and a meaning.
4. **P1 / S. Newsletter copy.** Default description drops "10,000+" and "exclusive deals" (`NewsletterSignup.tsx:144`); hide the "Deals & offers" preference (`:227,305,325`) because no job sends deals. Props unchanged, so `plan-stay.md`'s mounts are untouched.
5. **P1 / S. Empty isn't a dead end.** The empty state links `/restaurants/open-now` and `/events/today`, plus "Run a deal at your business? Tell us" to the existing business contact route. The INSERT policy stays admin-only (WEB-ADS-009).
6. **P2 / S. Today and Live now agree.** `isDealOnToday` is true while the previous day's overnight window is running. Cards say "Starts 4 PM" or "Ended for today" from the same clock. Rename the chip "Running now", or list unscheduled deals under "Good any time" so the Live now badge and the chip mean one thing. `filterDealsByWhen` applies `inDateRange` for every value including all, so the minute clock drops a deal that expires while the page is open. Urgency uses Des Moines calendar days ("Ends today at 9 AM", "Ends tomorrow"). Unit cases for each.
7. **P2 / S. Smaller, honest payload.** Replace `select('*')` (`useDeals.ts:69`) with the columns the card reads, which drops `created_by` and `redemption_count`. Delete the unused `useFeaturedDeals` (`:87-106`). "Claim Deal" becomes "Show code" or "Show deal", and the revealed panel restates title, discount, terms and "Valid through <date>".
8. **P2 / S. Chrome and connection.** On phones, a one-line hero, category and time as one scrolling chip row with Running now first, the disclosure under the grid. Breadcrumbs. Mount `ExploreSectionLinks current="/deals"`.
9. **P1 / S. Lane registration.** Append `explore-section-links`, `discover-map-time`, `attraction-detail`, `playground-detail` and `team-venue-trail-detail` to the smoke `testMatch` (`playwright.smoke.config.ts:171`), `.github/e2e-lane-baseline.json`, and `.github/workflows/e2e.yml` wherever it names specs. Run `npm run check-e2e-lanes`.
10. **P2 / S. The dropped WP8.3, and the hub's budget.** Add `/things-to-do`, `/attractions` and `/playgrounds` to `touch-targets.spec.ts:43` under `installFixtureBackend` (the footer is what it measures; the page bodies are covered by each WP's 44px assertion). Add `/things-to-do` to `request-budget.spec.ts` ROUTES, with a limit that counts the Open-now block.

**Acceptance:** editing a deal and saving without changes leaves its dates identical. `/deals` shows no "Exclusive" or "Verified". `npm run check-e2e-lanes` reports no unregistered Explore spec.

**Verify:** `npm run test:unit` (useDeals, dealFormTime), `tests/deals.spec.ts`, the full smoke config with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome --project=chromium-desktop`, `npm run check-e2e-lanes`, `npm run validate`.

---

## Frontend-only now

Everything in WP1-WP6. Items that read columns this pass hasn't exercised before (`events.event_start_local` on the map, `attractions.hours`/`hours_summary` on the map, `hotels.slug` for deals, `content_rating_aggregates` in the attraction hero) rely on the 2026-08-24 `scripts/db-snapshot.json`, and each is already read somewhere in production code. The snapshot isn't a live probe, so each PR runs `npm run check-schema:probe` and pastes the lines for those columns before merge.

## Deferred (needs a live migration, a deploy, a secret or a decision)

- **D1-D6, unchanged** from `explore.md`: `pseo_pages.shippable`, stored slugs, trail status, trail copy, `increment_deal_redemption` window, deal codes behind the claim.
- **D2 addendum.** `20260919000008_content_slugs.sql:62` ranks duplicate names by `created_at` alone, so an older inactive or out-of-state row can hold the bare slug for "Riverside Park". When D2 ships, link `row.slug`; if the backfill is re-run, rank active in-metro rows first. Until then `resolveBySlug.ts:60-62` should prefer an in-metro, active match (outside this plan's files; hand-off below).
- **D7. `playgrounds.is_active`.** `ALTER TABLE playgrounds ADD COLUMN is_active boolean NOT NULL DEFAULT true` (no rewrite on Postgres 11+), then false on the 21 out-of-state rows. Then filter it in `usePlaygrounds`, the facets, both side queries, the detail page, the sitemap and the middleware. Migration to apply live.
- **D8. `attractions.featured_reviewed_at timestamptz NULL`**, set by AttractionManager when an admin features a row. Featured returns on attractions only when it's set. Needs a decision on who reviews the existing flags.
- **D9. `playgrounds.is_free boolean NULL`.** Render "Free" only when true. Migration plus a data pass.
- **D10. `deals.verified_at timestamptz NULL`**, set when the box is ticked, rendered "Confirmed with the business Sep 12" and hidden after 60 days. Needs a decision on what verification means.
- **D11. Deals digest.** A weekly send of deals whose window meets the next 7 days to `promotions = true` subscribers. Edge function and deploy; WP6 hides the preference until then.
- **D12. Canonical categories on the hubs.** Once a probe confirms WEB-BE-049 (`20260919000003`) left no `Concert`/`Live Music` rows, switch `/music` and `/sports` to `eq('category', ...)` and restore counts on "See all".
- **D13. Arena rename in data.** Update `venues.name` and `teams.venue_name` to Casey's Center with the old slug redirected. Data migration.
- **D14. `events.team_id`**, set at ingest, to replace title matching on team pages. Column plus scraper deploys.
- **D15. `/deals` noindex while empty.** Needs an admin count of active rows and a product call.

## Hand-offs to other plans

- **Eat & Drink (`functions/_middleware.ts`, playground branch at `:297`):** select latitude and longitude and apply `isInMetro` before treating a playground as found; today an out-of-state slug gets a 200 shell while the app renders Not Found with noindex.
- **Search, which cites it (`src/lib/resolveBySlug.ts:60-62`):** among duplicate-name matches, prefer the in-metro, active row (D2 addendum).
- **Events (`src/components/events/eventsHubQuery.ts:184-191`):** the `notOverFilter` docblock says the map goes through it; true once WP2 item 3 lands, so no edit needed if that ships.

## Conflicts resolved

- **Playground "Free": P0 (attractions audit) or keep (WEB-SEO-024 comment at `EnhancedPlaygroundSEO.tsx:103-111`)?** Remove it, at P1. The SEO-024 note reasons that the whole set is municipal equipment; the page's own SEO-014 note says indoor play spaces are in the table. With no column to tell them apart, the claim can't be made per row.
- **"See all" on `/music`: switch the hub to `eq` (music audit) or add a hub-group param to `/events` (holistic)?** Neither now. `eq` depends on a backfill this pass can't confirm, and a new `/events` param is the Events plan's file. The link drops its number (WP5 item 3); D12 restores it.
- **Venue aliases: read `known_venues(aliases)` or an in-code map?** In-code map. It covers the three names that fail, adds no request to `/music`, and `known_venues` is still readable later.
- **Hub `?open=` value.** `?open=now` (holistic) over `?open=1` (attractions audit), so it reads like `/deals?when=now`.
- **Map Near me distance sort.** Map audit P1, taken as P2: nothing is broken, the list is just unsorted.
- **Map restaurant cap.** The audit's "order by id" only moves the bias. WP2 item 6 fetches one more page and says what's still cut.
- **Tonight rail fallback height.** The hub audit's `TONIGHT_RAIL_MIN_HEIGHT` export would edit a Home-owned file; WP1 sets the height locally with a comment naming the parts.

## Rejected

- **"WP8.2 dropped: `/things-to-do` is not in route-smoke"** (holistic P2). It is covered: `tests/route-smoke.spec.ts:166-214` parses every public route out of `src/App.tsx` and loads each one.
- **Retire `AttractionsMap` and `PlaygroundsMap` for `/map`** (holistic differentiator). Not this pass; `sel` cold-load (WP2 item 9) has to work first, and it's a bundle change across three pages.
- **Map "order by distance via a small RPC"** (holistic P2). A new RPC for a sort the client can do after Near me; replaced by WP2 item 8.
- **Wrap map markers in `MarkerClusterGroup` now** (map P2). No measurement says the count passes 300; WP2 item 11 logs it first and ships the `keyboard={false}` part.
- **Map first data without waiting for Leaflet bounds** (map P2). It reverses pass 1's truthful-count gate for a saving nobody has measured on this route; revisit with a trace.
- **Preload the map chunk on nav hover** (map P2). Touches header and BottomNav, which are shell files outside this plan.
- **"Deals venue picker can't fire in production" as a spec bug.** The spec is right to inject `entity_id`; the gap is the admin form, fixed in WP6 item 2.
- **Hub "Playgrounds near you" via a `near=1` param that auto-locates** (hub P2). Asking for location on arrival from a link is worse than renaming the link.
- **Seasonal staleness as a data fix.** Handled in code (WP1 item 10); no migration.
