# Home page plan, second pass (`/`, `src/pages/Index.tsx` and everything it mounts)

Coordinator output, 2026-09-25. Scope: the hero and search box, the Tonight rail, quick actions, the neighbourhood strip, the dated snapshot, the For You and recently viewed rails, the dashboard, MostSearched, the event quick view, the GEO/FAQ content, and the header, footer and shell as a Home visitor meets them.

Built from one holistic audit and five section audits (hero and search, Tonight, rails, places and GEO, shell). Every P0 and P1 was re-opened at its cited line; the ones that didn't hold, or that another finding made moot, are under **Rejected**. Production state comes from `scripts/db-snapshot.json` (captured 2026-08-24) and `docs/RLS_AUDIT.md`. No live probe was run, so every "gate" below still needs `npm run check-schema:probe`.

This plan doesn't replace `docs/page-plans/home.md`. It scores that plan against the code (commit 2da3ca0 and everything since) and plans what's left.

## Scorecard of the first pass

73 numbered items plus two unnumbered follow-ups. WP2 items 1-5, 8 and 9 were only spot-checked this pass, because the Account plan has since worked in the same files.

| Outcome | Count | Items |
|---|---|---|
| Shipped and working | 58 | WP0 1-4; WP1 1-4, 7-9, 12; WP2 1-5, 8, 9; WP3 1-3, 5-8; WP4 1-4; WP5 1, 2, 5-11; WP6 1-6; WP7 1, 2; WP8 1, 3-7; WP9 1, 2, 4; WP10 2, 3 |
| Shipped but broken or half-done | 13 | WP1 5, 6, 10, 11; WP2 6, 7, 10; WP3 4; WP5 3, 4; WP8 2; WP9 3; WP10 1 |
| Dropped with no deferral note | 2 + 2 follow-ups | WP6 7, WP7 3; the per-area tonight counts (WP5 10 follow-up) and the visitor band (WP10 gated follow-up) |
| Deferred | 10 rows | 2 changed since, 8 unchanged (below) |

**Broken or half-done, with the evidence:**

- **WP1 10 (LazySection) undoes bet 4.** `scripts/prerender.mjs` opens `/` at puppeteer's default 800x600 and never scrolls, so every `LazySection` stays a placeholder (`LazySection.tsx:69-80`). The dated snapshot, the neighbourhood links, the dashboard and MostSearched are missing from the HTML that non-JS crawlers get. `homeContent.ts:96-104` lists `h1` as a Speakable selector to cover the gap. The `aria-busy` placeholders also make the prerender wait out its 10s timeout on `/` every build (`prerender.mjs:728`).
- **WP1 5 (compact first viewport)** works at 390x844 but not at 1366x768: the hero runs 101-793px, so no card shows. The demoted "AI Plan My Night [Insider]" link has since become false twice over, because `AI_PLANNER_AVAILABLE` is `false` (`src/lib/tripPlannerStatus.ts:10`) and `/trip-planner` is now free (`QuickActions.tsx:47-62`).
- **WP1 6 (NLP bar a11y).** Escape pressed inside the panel doesn't close it: `handleKeyDown` sets `isFocused` false and then focuses the input, whose `onFocus` sets it true again (`NLPSearchBar.tsx:154-160`, `:245`).
- **WP1 11 (tiles match their destination).** "New this week" still links to `/events` (`EnhancedHero.tsx:197`), and the restaurants count skips the `is_merged` filter `/restaurants` applies (`useHomepageStats.ts:77-79`).
- **WP2 6 (no late insert).** `RecentlyViewedRail` is `React.lazy` with `fallback={null}` (`Index.tsx:33`, `:140-142`), so it inserts about 230px after first paint. The comment above it says it doesn't.
- **WP2 7 (taste chips).** Any pick flips the heading to "For you" (`ForYouRail.tsx:75`) even when no row matched. The matcher's comment says the RPC returns no price or coordinates (`forYouRerank.ts:11-15`); the RPC returns both (migration `20260822000002:64`).
- **WP2 10 (weather line with a count).** It has the temperature and no count, and it sits in the For You header while the verdict reorders the Tonight rail (`useTonightPairings.ts:78`).
- **WP3 4 (tonight and weekend first).** The dashboard fetches the 9 soonest events from Central midnight (`AllInclusiveDashboard.tsx:187`), then `orderHomeEvents` reorders those 9 (`dashboardItems.ts:108-122`). On any day with 9 events no weekend event can appear.
- **WP5 3 (GEOContent eager)** didn't happen: it's lazy and inside a `LazySection` (`Index.tsx:31`, `:179`).
- **WP5 4 (dated snapshot)** builds its own weekend window (`useHomeSnapshot.ts:84-99`) and its own free filter (`:154`), so its numbers don't match `/events/this-weekend` (which uses `centralWindow('this-weekend')` plus ongoing events) or `FREE_PRICE_FILTER` (`src/lib/eventPrice.ts:19`).
- **WP8 2 (logo weight).** The header draws the small logo, but `index.html:284-290` still preloads the unused 20.9KB `DMI-Logo-Header.webp` at high priority.
- **WP9 3 (at most 4 parallel requests).** MostSearched makes 5 requests in 2 rounds, and two of them (`trending_scores`, `search_analytics`) are admin-only under RLS (`docs/RLS_AUDIT.md:607`, `:496`), so they're always empty for the public.
- **WP10 1 (pairings).** "Tonight" means the rest of the Central day with no evening floor (`tonightPairings.ts:179-199`). At 9:00 CT the rail prints "Dinner at X, then Storytime at 10:00 AM" under "Tonight in Des Moines".

**Changed since pass 1:**

- The two deferred `nlp-search` P0s (visibility filters, Chicago dates) shipped with the Search plan (`supabase/functions/nlp-search/search.ts:292`, `:518`). The response now carries `appliedFilters`, `unappliedFilters`, `matchType` and `degraded` (`:847-862`).
- `get_popular_searches` already exists and is granted to anon (migration `20251110000009:318-343`). It's SECURITY INVOKER, so RLS blanks it for the public. The deferred fix is a `CREATE OR REPLACE`, not a new RPC.
- The Search, Account and Pricing plans each handed items to Home files (search icon in the header, `mode=signup`, the white-H1 rule, `openPaywall` in FavoriteButton, chips that navigate). None has landed. They're planned below.

## Where it stands

- **The crawler copy is empty.** The parts of the page written for search engines and assistants (the dated paragraph, the `/neighborhoods/*` links, the dashboard) aren't in the prerendered HTML, while the parts that go stale (the hero's "Friday: N events today", the Tonight cards) are frozen into it with no date.
- **Paid placement isn't labelled on Home.** `get_trending_events` adds 20 for `is_featured` plus `random()*5` and filters none of the three unpublish switches (`20260822000002:84-108`). Since `20260902000004`, a featured event or restaurant is a sponsored one or an admin pick. So the "Trending now" rail and MostSearched's "Featured restaurants" (`useTrending.ts:258-265`) put paid rows under editorial labels, and no Home surface uses `SponsoredBadge`. The FAQ says the opposite, in FAQPage JSON-LD: sponsored placements "do not change the ordinary listings around them" (`homeContent.ts:194`), while `arrangeSponsored` lifts up to two paid rows to the top of `/events` and `/restaurants` (`src/lib/sponsored.ts:43-55`).
- **One event can appear four times**: Tonight, Trending, the dashboard's events group and the snapshot's "Next up".
- **The shell breaks other pages.** `index.html:153-158` paints every `h1` `#fff`, so `/whats-new` (`WhatsNew.tsx:89`), `/restaurants/new` and "Event Not Found" have invisible headings on light surfaces. `esbuild.drop` sits inside `build` where Vite ignores it (`vite.config.ts:228-232`), so `console.*` ships. The page loads an Inter stylesheet no rule uses, before consent (`index.html:261-302`).
- **Weight.** At 390px the first view downloads 61 JS files, 541,407 bytes gzipped (holistic audit's measurement against a vite build). Home's own share: `AdBanner` is a static import that pulls `HouseAd` and `UpgradeModal` into the first view, and on desktop the three.js hero background (`HeroCityLite`, 215KB gz) downloads at idle for a band that's now compact.
- **Keep:** the compact hero with one search box, the Central-time greeting, the dash-not-zero for unknown counts, the Tonight pure/fixed-clock split and fail-closed hours, the dashboard card model, `useStickyRows`, the `<details>` FAQ with escaped JSON-LD, `NEIGHBORHOODS`-driven chips, the quick view's bottom sheet and Directions button, the footer's double opt-in, and the fixture-backed specs.

## What makes it ours

Each bet uses data or code the app already has.

1. **Honest ranking, with paid rows labelled.** Rank the anonymous rail on `events.trending_score` (in the snapshot, written by `calculate_trending_scores`, read by nothing on Home) through a plain PostgREST read with the standard visibility predicate, and call it "Trending" only when scores exist. Label every `isSponsoredActive(row)` with `SponsoredBadge` and log it with `useSponsoredImpression`, on every Home rail. The FAQ states exactly what money buys. Yelp and TripAdvisor mix commercial signals into "popular" without saying which is which. Files: `src/hooks/useForYouRail.ts`, `src/lib/sponsored.ts`, `src/components/SponsoredBadge.tsx`, `src/hooks/useSponsoredImpression.ts`, `src/content/homeContent.ts`.
2. **Tonight means tonight, as a timed plan.** Events from `max(now, 16:00 CT)` to 04:00, running multi-day events included, dinner only in the evening, and the card reads "Dinner 6:00 at X (open until 10), 0.3 mi, then Y at 7:30 PM". The rail's header says why the order is what it is ("Rain likely: indoor picks first"). `closesAt` already comes out of `getRestaurantOpenStatus`; indoor flags come from `useEventIndoorFlags`. Eventbrite has no restaurants and Yelp has no events. Files: `src/lib/tonightPairings.ts`, `src/lib/restaurantHours.ts` (read-only), `src/hooks/useEventIndoorFlags.ts`, `src/hooks/useWeather.ts`.
3. **A dated answer crawlers can actually read.** The prerender mounts every section, so `dist/index.html` carries "As of Friday, September 25 (Central): N events this weekend, M listed as free", inside `[data-speakable]`, with an ItemList of the linked events. The nightly crawl-then-deploy hook (`event-crawler.yml:140-202`) re-prerenders, so the date is at most a day old and says so. Every number equals the number on the page it links to, because the snapshot uses the landing's own `centralWindow` and `FREE_PRICE_FILTER`. Files: `scripts/prerender.mjs`, `src/components/LazySection.tsx`, `src/hooks/useHomeSnapshot.ts`, `src/lib/timezone.ts`, `src/lib/eventPrice.ts`.
4. **Neighbourhood chips that answer "where tonight".** "East Village, 6 tonight" computed from the Tonight rail's cached query, no extra request, shown as a floor ("3+") when the row cap was hit. Files: `src/components/SocialProof.tsx`, `src/lib/neighborhoods.ts`, `src/hooks/useTonightPairings.ts`.
5. **Type a name, land on the place.** The hero box suggests matching events, restaurants and attractions after three characters, linking straight to detail pages with no model call, using the visibility-filtered, LIKE-escaped rules `SearchAutocomplete.tsx:131-200` already has. Example chips only use facets `nlp-search` turns into SQL, pinned by a test. Files: `src/components/NLPSearchBar.tsx`, `src/hooks/useNLPSearch.ts`, `supabase/functions/nlp-search/search.ts` (read-only).
6. **Each event once, in planning order.** Tonight, then this weekend, then later this week, with ids the Tonight rail already shows excluded from every rail below it, read from the query cache.

The visitor band ("Stay near {venue}" on Tonight cards) stays deferred: see **Deferred**.

## How the packages fit together

Six packages. WP1-WP5 own disjoint files and run in parallel in one tree. **WP6 lands last** and is the only package that edits `playwright.smoke.config.ts`, `.github/workflows/e2e.yml` and `.github/e2e-lane-baseline.json`. Every other package writes its spec as a new file (or edits a spec it owns) and installs table fixtures with `page.route` after `installFixtureBackend(page)`, so nobody edits `tests/support/fixtureBackend.ts`.

**Only WP1 edits `src/pages/Index.tsx`.** Two cross-package contracts, written out so neither side guesses:

- WP1 creates `src/lib/isPrerender.ts` exporting `isPrerender(): boolean` (returns `typeof window !== "undefined" && (window as { __DMI_PRERENDER__?: boolean }).__DMI_PRERENDER__ === true`). WP2 imports it. WP1's item 1 lands first inside the tree.
- WP4 exports `HOME_META_DESCRIPTION` from `src/content/homeContent.ts` with the text now in `Index.tsx:59-60`; WP1 imports it and deletes its local copy.

Cross-plan files, read-only here:

- `src/lib/restaurantHours.ts`, `src/hooks/useSupabase.ts` (`useRestaurantOpenings`) and `src/components/seo/HubArticles.tsx` belong to Eat & Drink. The dashboard calls `useRestaurantOpenings({ includeRecentlyOpened: true })` as it is.
- `src/lib/timezone.ts`, `src/lib/eventQuery.ts`, `src/lib/eventPrice.ts`, `src/content/eventsCopy.ts`, `src/hooks/useEventLanding.ts`, `src/pages/EventsToday.tsx` and `src/components/EventHotelCallout.tsx` belong to Events.
- `src/components/SearchAutocomplete.tsx`, `src/lib/searchResultHref.ts` and `src/hooks/useSearchResults.ts` belong to Search. WP1 copies SearchAutocomplete's query rules into a new hook rather than editing it.
- `src/lib/tripPlannerStatus.ts` belongs to Plan & Stay. `src/lib/paywallStore.ts` / `openPaywall` and `src/lib/authReturn.ts` / `stashPendingAction` (Pricing, Account) are imported unmodified.
- `src/lib/tonightPairings.ts` is Home's (WP2), but Eat & Drink and Events call `pickDinner` and `useTonightPairings`. WP2 keeps those exports' behaviour for existing callers and puts the evening rule behind an option.

---

## WP1: Hero, search, page composition and prerender (owns `Index.tsx`)

**Goal:** the first screen is true at every hour and every width, the search box goes somewhere without a model call when it can, and the prerendered HTML carries the page's crawler content and none of its stale content.

**Files:** `src/pages/Index.tsx`, `src/components/LazySection.tsx`, new `src/lib/isPrerender.ts`, `scripts/prerender.mjs`, `scripts/check-prerender-content.mjs`, `src/components/EnhancedHero.tsx`, `src/components/QuickActions.tsx`, `src/components/NLPSearchBar.tsx`, `src/hooks/useNLPSearch.ts`, `src/hooks/useHomepageStats.ts`, `src/hooks/__tests__/useHomepageStats.test.ts`, new `src/hooks/useEntitySuggestions.ts`, new `src/hooks/__tests__/nlpSearchExamples.test.ts`, `tests/home-search.spec.ts`, `tests/home-request-budget.spec.ts`. Deletes: `src/components/HeroCityLite.tsx`, `src/components/HomeInterestNav.tsx` (grep shows Index and EnhancedHero are their only importers).

1. **P0 / S. The prerender mounts every section.** In `prerender.mjs`, before `page.goto`, call `page.evaluateOnNewDocument(() => { window.__DMI_PRERENDER__ = true; })`. `LazySection` initialises `visible` to true when `isPrerender()` holds. Don't key this on `navigator.webdriver`: Playwright sets it too, and `home-request-budget.spec.ts` would then mount everything and fail its first-view budget. Drop `aria-busy` from the idle placeholder (it's deferred, not loading) and keep `data-lazy-section="pending"`. `check-prerender-content.mjs` asserts that `dist/index.html` contains a link to every `NEIGHBORHOOD_ROUTES` entry and no `data-lazy-section="pending"`, and warns (not fails) when `[data-speakable]` is missing, since a placeholder-env build can't fetch the snapshot.
2. **P0 / S. The planner link says what it is.** `QuickActions.tsx:47-62`: while `AI_PLANNER_AVAILABLE` is false, render "Visiting? Plan your dates" to `/trip-planner` with no tier badge and no sparkles icon. Show "AI Plan My Night" with the Insider badge only when the flag is true. A spec step asserts the hero has no "AI" text while the flag is false.
3. **P1 / S. No stale time-bound text in the static HTML.** Under `isPrerender()`, the hero renders its greeting and "weekday: N events today" line as an empty box of the same height (`min-h` on the `<p>`), so the frozen HTML carries no undated count. After mount it renders as today. Add `data-nosnippet` to that line. The dated sentence belongs to the snapshot (WP4).
4. **P1 / S. Desktop first viewport.** Delete the desktop stat tiles (`EnhancedHero.tsx:185-210`); the context line already carries today's count and links `/events/today`. Add `text-balance` to the H1 so "Moines" doesn't wrap alone, and cut desktop padding from `py-12` to `py-10`. With the tiles gone, `useHomepageStats` drops the restaurants and new-this-week counts (two fewer first-view requests). The remaining count is built with `applyEventVisibility` (`src/lib/eventQuery.ts:33`) and `centralWindow('today')`, and a null count throws instead of becoming `?? 0` (`useHomepageStats.ts:100`).
5. **P1 / M. Example chips navigate; the inline results panel goes.** Chips become links to `/search?q=<example>`, the same as Enter. Delete the inline panel, `ResultItem`, the private `resultHref` (`NLPSearchBar.tsx:55-64`), the unsourced rating star (`:460-465`), the "N results in Xms" readout (`:375`), the `['search-suggestions']` invalidation (`useNLPSearch.ts:210`), and correct the rate-limit comment (`:248-250`; the function allows 30 per minute, `nlp-search/index.ts:62-64`). This removes the second model call per example and takes Tabs, ScrollArea and the result renderer out of the hero chunk.
6. **P1 / S. Examples that do what they say.** Rewrite `NLP_SEARCH_EXAMPLES` (`useNLPSearch.ts:67-78`) to use only facets the planner applies (when, free, area, cuisine, category, kid, type), for example "Free things to do this weekend with kids", "Tacos in East Village", "Kid-friendly attractions", "Comedy this weekend". The new unit test fails on any example containing `under $`, `near me`, `near downtown`, `dog`, `pet`, `outdoor seating`, `romantic`, `date night`, `morning`, `afternoon` or `evening`.
7. **P1 / S. Escape closes the panel; honest roles.** Hold an explicit `panelOpen` state instead of deriving it from focus, and suppress the reopen that `onFocus` fires after Escape. Drop `role="combobox"` and `aria-haspopup="dialog"` (`:236-237`); the input is a searchbox with `aria-expanded`/`aria-controls` as a disclosure onto the suggestions region. Add a spec step that tabs to a chip and presses Escape.
8. **P1 / M. Entity typeahead.** New `useEntitySuggestions(term)` runs SearchAutocomplete's rules (visibility filters, LIKE escaping, 5 rows) for events, restaurants and attractions in parallel after 3 or more characters with a 300ms debounce. The panel shows up to 3 per type as direct links (hrefs from `searchResultHref.ts`) above a "Search everything for 'x'" row. On focus with an empty input, recent searches from safeStorage (key `dmi_recent_searches_all_v1`) come first and examples are the fallback. No query fires on first view.
9. **P1 / M. Drop the three.js background.** Delete `HeroCityLite.tsx` and its idle loader (`EnhancedHero.tsx:18-20`, `:69-82`); keep the static grid. This removes 215KB gz from desktop, the unconditional `useFrame` loops, the `powerPreference: "high-performance"` request and the two-stage background swap, and it fixes reduced motion by removal. Remove the light-mode seam softener (`:142`), which only existed to blend into the scene.
10. **P1 / S. Page composition.** `AdBanner` becomes `lazy()` inside its `LazySection`, so `HouseAd` and `UpgradeModal` leave the first view. Remove the `below_fold` ad slot, which on an ad-free day shows a second trip-planner upsell. Delete `HomeInterestNav` and its `LazySection`; it repeats the header, BottomNav and the hero chips, and writes a `user_analytics` cohort row nobody reads. Import `RecentlyViewedRail` eagerly (it reads safeStorage synchronously) and fix the comment. Render `SocialProof` with a static import outside `LazySection` (it makes no queries of its own). Import `HOME_META_DESCRIPTION` from `homeContent.ts`.
11. **P2 / M. `?event=` URL state (pass-1 WP6 item 7, dropped).** Selected event id lives in `useSearchParams`: push on open, replace on close, so Back closes the sheet on Android. On load with `?event=`, fetch that one row with `EVENT_LIST_COLUMNS` and the visibility predicate, then open the sheet.
12. **P2 / S. Input details.** `pr-14` while the input is empty and `pr-28` once Clear shows (`NLPSearchBar.tsx:247`); placeholder "Search Des Moines" below `sm`. Keep submit enabled; the empty-query guard already makes it a no-op, and it can focus the input instead.
13. **P2 / S. After 15:00 CT the context line answers "still on".** Count events with `date >= now` in tonight's window and print "N still to start tonight". Link the Tonight chip to `/events/today#today-tonight`; the scroll-to-hash on `EventsToday` is handed to the Events plan.
14. **P2 / S. First-viewport assertion.** In `home-request-budget.spec.ts`, with consent pre-dismissed through storage, assert at 390x844 and 1366x768 that the input and at least one Tonight rail link sit inside the viewport. Lower `MAX_REQUESTS` from 6 to 4 once items 4 and 10 land.

**Acceptance:**
- `dist/index.html` for `/` contains `href="/neighborhoods/<slug>"` for every `NEIGHBORHOOD_ROUTES` entry and no `data-lazy-section="pending"`; the prerender log no longer lists `/` as captured mid-skeleton.
- With `AI_PLANNER_AVAILABLE=false`, `rg -n "AI Plan" src/components/QuickActions.tsx` matches only the flag-true branch.
- At 1366x768 and 390x844 a Tonight card is in the first viewport.
- Pressing a chip navigates to `/search?q=`; `/` makes no `nlp-search` call without a navigation.
- Anonymous first view of `/` makes 4 or fewer Supabase requests.

**Verify:** `npm run validate`, `npm run build` then `node scripts/check-prerender-content.mjs`, `npm run test:unit` (examples test, `useHomepageStats` test), `tests/home-search.spec.ts` and `tests/home-request-budget.spec.ts` with `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome --project=chromium-desktop`, `touch-targets`, `npx impeccable detect src/components/EnhancedHero.tsx src/components/QuickActions.tsx src/components/NLPSearchBar.tsx`.

---

## WP2: Tonight rail

**Goal:** every card on the rail is on tonight, every dinner is a dinner, the order is explained, and the rail doesn't keep past shows while the tab stays open.

**Files:** `src/lib/tonightPairings.ts`, `src/lib/__tests__/tonightPairings.test.ts`, `src/hooks/useTonightPairings.ts`, `src/components/TonightRail.tsx`, `src/components/WeatherNotice.tsx`, `src/lib/listColumns.ts`, new `src/hooks/useNow.ts`, `tests/home-tonight.spec.ts`. Reads `src/lib/isPrerender.ts` (WP1), `src/hooks/useEventIndoorFlags.ts`, `src/lib/restaurantHours.ts`.

1. **P0 / S. An evening window.** Tonight is events starting between `max(now, 16:00 CT)` and 04:00 CT the next day; from 00:00 to 04:00 CT the window is what's left of the previous evening. Add `tonightWindow(now)` beside `centralDayWindow` and use it in `selectTonightEvents` and the query. `buildTonightPairings` takes an `eveningOnly` option (Home passes true) that refuses a dinner whose `dinnerAt` is before 16:00 CT or already past. `pickDinner`'s default behaviour doesn't change, because Eat & Drink and Events call it. The heading carries the date: "Tonight, <time dateTime="2026-09-25">Friday, Sep 25</time>". Fixed-clock tests at 09:00, 18:15, 23:30 and 00:30 CT.
2. **P1 / S. Started shows drop off.** New `useNow(60_000)` (an interval cleared on unmount, paused while `document.visibilityState` is hidden) feeds both memos' deps and the window, so the query key rolls over at the boundary. The comment at `useTonightPairings.ts:88-89` claiming it happens "at the next refetch" goes.
3. **P1 / S. Query what the rail needs.** Bound the events query to `[max(window start, now - 15 min), window end)` instead of Central midnight, so morning rows can't use up the 40-row limit (`useTonightPairings.ts:45-52`). Add `TONIGHT_EVENT_COLUMNS` (`id,title,date,event_start_utc,event_start_local,end_date,venue,location,city,category,price,latitude,longitude,is_sponsored,sponsored_until`) and `TONIGHT_RESTAURANT_COLUMNS` (`id,name,slug,cuisine,latitude,longitude,opening,opening_date,status`) to `listColumns.ts` and use them. `RestaurantsTonightStrip` reads nothing beyond those; check before merging. The restaurant query pre-filters `.not('opening','is',null)` and excludes closed, temporarily closed and opening-soon statuses, and orders by `id` so a truncated result is at least deterministic.
4. **P1 / M. One definition of tonight across the site.** Include multi-day events that started earlier and run tonight (`or=(and(date.gte.S,date.lt.E),and(date.lt.S,end_date.gte.S))`), matching `TonightStrip` on `/events`; such a row gets no dinner unless `event_start_local` carries today's time. Read `is_indoor` through `useEventIndoorFlags` (it only fires when the weather verdict could change the order, and fails open), keeping the regex as the fallback. Remove the comment saying events has no `is_indoor` column.
5. **P1 / S. Weather rank first, then time.** `buildTonightPairings` currently puts paired cards before unpaired ones (`tonightPairings.ts:300-308`), which overrides the weather order the rail claims. Weather rank is the primary key, start time the secondary, and "has dinner" only a tie-break. Update the "puts paired cards first" test.
6. **P1 / S. The reason sits on the rail it explains.** Render `RailWeatherLine` in TonightRail's header in a fixed `h-6` slot, with a count from the rail's own events: "Rain after 7: 4 indoor picks tonight". WP3 removes it from ForYouRail.
7. **P1 / S. Cards that fit.** `line-clamp-3` on the plan sentence with the full text in an sr-only span; truncate restaurant and event names separately (about 40ch each) so time and distance always show. Add a 120-character title fixture and assert `scrollHeight <= clientHeight` on the card.
8. **P1 / S. No frozen rail in the static HTML.** Under `isPrerender()` the rail renders its fixed-height skeleton. Add `data-nosnippet` to the section, as `/events`' `TonightStrip.tsx:58` does.
9. **P2 / S. A timed plan.** Return the `RestaurantOpenResult` from `isOpenForDinner` instead of a boolean, and render "Dinner 6:00 PM at X (open until 10 PM), 0.3 mi" using `closesAt`. "Open at 6:00 PM" reads as "opens at 6" and goes.
10. **P2 / S. Honest copy.** A no-time event reads "time not listed", not "tonight". The empty state says "Nothing more is listed for tonight." instead of "Nothing else".
11. **P2 / S. Events render before restaurants arrive.** `isLoading` stops waiting on the restaurants request (`useTonightPairings.ts:157`); the dinner line reserves its height and fills in. After first render the order is frozen until the next refetch, so a late weather verdict can't move a card under a thumb.
12. **P2 / S. Desktop grid.** At `lg` and above, a 5-column grid with the narrower card so nothing hides off-screen; the snap scroller stays for mobile.
13. **P2 / S. Time zone in the spec.** `test.use({ timezoneId: 'America/Los_Angeles' })`, a 09:00 CT case asserting no "Dinner at" is rendered before 16:00 CT, and the long-title case.

**Acceptance:**
- With the clock at 09:00 CT and fixture events at 10:00 and 19:30, the rail lists only the 19:30 event, under a heading with today's date, and no card reads "Dinner at" with a time before 4 PM.
- At 21:45 CT with the tab open since 18:00, a 19:00 event is gone within a minute.
- A festival that started yesterday with `end_date` tomorrow appears, with no invented dinner.
- `npm run test:unit` covers 09:00, 18:15, 23:30 and 00:30 CT.

**Verify:** `npm run test:unit` (tonightPairings), `tests/home-tonight.spec.ts`, `tests/home-request-budget.spec.ts` (the rail adds no request on a dry day), `npm run check-list-columns`, `npm run validate`.

---

## WP3: Rails, dashboard and MostSearched

**Goal:** no paid row appears without a label, nothing hidden or merged reaches Home, each event appears once, and nothing below the fold jumps.

**Files:** `src/components/ForYouRail.tsx`, `src/hooks/useForYouRail.ts`, `src/lib/forYouRerank.ts`, `src/lib/__tests__/forYouRerank.test.ts`, `src/components/AllInclusiveDashboard.tsx`, `src/lib/dashboardItems.ts`, `src/lib/__tests__/dashboardItems.test.ts`, new `src/hooks/useHomeWeekEvents.ts`, new `src/hooks/useHomeShownIds.ts`, `src/components/MostSearched.tsx`, `src/hooks/useTrending.ts`, `src/hooks/useSearchInsights.ts`, `src/components/RecentlyViewedRail.tsx`, `src/hooks/useRecentlyViewedFeed.ts`, `src/lib/recentlyViewed.ts`, `src/components/ui/loading-skeleton.tsx`, new `supabase/migrations/20260929000001_trending_rpcs_visibility.sql`, `tests/home-rails-cls.spec.ts`, `tests/home-dashboard.spec.ts`, new `tests/home-rails-honesty.spec.ts`.

1. **P0 / M. The anonymous rail reads events, not the RPC.** For the trending source, `useForYouRail` replaces `get_trending_events` with a PostgREST read: `EVENT_LIST_COLUMNS` plus `trending_score`, `date >= now`, `is_merged`/`is_hidden`/`archived_at` filters, ordered by `trending_score desc, date asc`, limit 12. That's the same request count and removes the featured boost, the random term and the hidden-row leak in one step, with no deploy. Title the rail "Trending" only when at least 3 rows have `trending_score > 0`; otherwise "Coming up", ordered by date. Signed-in users with a personal source keep `get_personalized_recommendations`. Write (don't apply) the migration adding the three unpublish filters to `get_trending_events` and `get_personalized_recommendations` with unchanged signatures, for shipped apps; see Deferred.
2. **P0 / S. MostSearched's "Featured" column isn't paid placement in disguise.** Replace the `is_featured` restaurant and attraction fallbacks (`useTrending.ts:258-273`) with organic reads (`rating >= 4.0`, restaurants `.neq('is_merged', true)` and not closed, attractions `.eq('is_active', true)`), titled "Highly rated". Sponsored rows, if shown, are capped at one per column, carry `SponsoredBadge` and log impressions and clicks.
3. **P1 / S. Label sponsored rows on every Home card.** `CardModel` gets `sponsored: isSponsoredActive(row)`; `DashboardCard` renders `SponsoredBadge` beside the type badge and calls `useSponsoredImpression` and `logSponsoredClick`, as `EventCard.tsx:91-97,154` does. ForYouRail cards do the same from the columns item 1 now selects.
4. **P1 / S. No admin-only reads for the public.** Skip the `trending_scores` read unless `useAuth().isAdmin`, and key it on `formatInTimeZone(now, CENTRAL_TIMEZONE, 'yyyy-MM-dd')` with an explicit column list (`useTrending.ts:83-89`). Remove the `search_analytics` read from MostSearched entirely (`useSearchInsights.ts:150-172`); it's empty for the public and shows other visitors' raw queries to an admin. "Try searching" stays on the static suggestions until the deferred `get_popular_searches` fix.
5. **P1 / M. The dashboard's events start tomorrow.** New `useHomeWeekEvents` queries tomorrow's Central start through the end of Sunday (`centralWeekWindow`), weekend first, limit 9, `countMode: 'none'`. The group is headed "This weekend" or "Later this week" to match. The block's H2 becomes "Explore Des Moines", which also ends the clash with GEOContent's "Des Moines this week".
6. **P1 / M. Each event once.** `useHomeShownIds()` reads the Tonight events from the query cache (`queryClient.getQueryData(['tonight','events', ...])`, no request). ForYouRail filters those ids after the rerank; the dashboard excludes them and ForYouRail's. A spec asserts no event href appears twice on `/`.
7. **P1 / S. Openings don't promise the past.** Call `useRestaurantOpenings({ limit, includeRecentlyOpened: true })`. When `opening_date` is past, print "Opened <date>" for `newly_opened` rows and leave out `opening_soon`/`announced` rows whose date has passed (`AllInclusiveDashboard.tsx:146-153`). A fixture dated last year proves "Opens" never precedes a past date.
8. **P1 / S. For You cards say when.** Add `formatEventDateShort(rec)` and the venue as the first line; hide `recommendation_reason` when it equals the heading. Carry `price`, `location`, `city`, `latitude` and `longitude` on `ForYouRecommendation`; Free matches `isFreePrice()`, the area chips match `NEIGHBORHOODS` `matchTerms` on location and city. Show "For you" only when at least one row has a `pickReason`; otherwise one line, "Nothing coming up matches Family yet", linking the matching hub. Remove `RailWeatherLine` from this rail (WP2 moves it).
9. **P1 / M. Dashboard groups reserve their space.** Each group renders a fixed 3-card skeleton slot while its query loads and drops it only when the query is empty or failed; the error note moves inside the failed group's slot instead of above every group (`:320-364`). `DashboardGridSkeleton` becomes 5 groups of 3. A CLS case delays each table by 0, 1s and 3s.
10. **P1 / S. Recently viewed doesn't insert late.** With WP1 importing the rail eagerly, show server-only entries only when the local store already rendered the rail. `useRecentlyViewedFeed` reads `.gte('viewed_at', now - 30d).limit(20)`, and `normalizeEntries` drops any href that doesn't start with a single `/`. Add a CLS case with 3 seeded entries.
11. **P2 / S. Smaller fixes.** `alt=""` on rail card images inside titled links (`ForYouRail.tsx:211`, `RecentlyViewedRail.tsx:56`). MostSearched's skeleton uses the content's breakpoints and an all-empty result renders one short line instead of `null`. Save buttons on every dashboard card kind (FavoriteButton supports them), and hotels tracked under their own content type, not `'page'`.

**Acceptance:**
- An anonymous first view makes no `get_trending_events` call; a fixture row with `is_hidden: true` never renders; a row with an active `sponsored_until` shows "Sponsored" wherever it appears on `/`.
- After a full scroll, no `trending_scores` or `search_analytics` request is made for an anonymous visitor, and dashboard plus MostSearched make 8 or fewer requests.
- No event href appears twice on `/`.
- Layout shift from the dashboard with staggered fixtures stays under 0.05.

**Verify:** `npm run test:unit` (forYouRerank, dashboardItems), `tests/home-rails-honesty.spec.ts`, `tests/home-rails-cls.spec.ts`, `tests/home-dashboard.spec.ts`, `npm run check-schema` (for `trending_score` in `types.ts`), `npm run validate`.

---

## WP4: Truth, dated snapshot, structured data, neighbourhood strip

**Goal:** every claim and number in the page's crawler-facing content matches the code and the page it links to.

**Files:** `src/content/homeContent.ts`, `src/components/GEOContent.tsx`, `src/hooks/useHomeSnapshot.ts`, `src/hooks/__tests__/useHomeSnapshot.test.ts`, `src/components/SocialProof.tsx`, new `src/lib/neighborhoodTonight.ts`, new `src/lib/__tests__/neighborhoodTonight.test.ts`, `scripts/__tests__/geo-content-claims.test.mjs`, new `tests/home-truth.spec.ts`.

1. **P0 / S. The paid-placement answer says what the code does.** Rewrite `homeContent.ts:194`: listing is free; we sell banner slots and sponsored listings, which can appear first on the events and restaurants pages, at most two per list, each labelled Sponsored; nothing else is reordered for money. Link `/advertise`. Align `GEOContent.tsx:88`. Add "do not change the ordinary listings" and "rank higher in the ordinary listings" to the `geo-content-claims` deny list.
2. **P1 / M. The weekend count matches `/events/this-weekend`.** Build the window with `centralWindow('this-weekend')` and count with the same ongoing predicate `useEventLanding` uses (`ongoingStartFilter`). If the day is Saturday or Sunday, print both: "N events this weekend, M still to come". A unit test asserts the snapshot and `useEventLanding({ window: 'this-weekend', includeOngoing: true })` build the same filter.
3. **P1 / S. The free count uses the site's filter.** Import `FREE_PRICE_FILTER`; delete the stale comment at `useHomeSnapshot.ts:143`. The free figure is worded "M of them listed as free" with the clause linked to `/events/this-weekend`, and `/events/free` is linked separately as "all free events", since that page isn't weekend-bounded.
4. **P1 / S. Structured data describes what ships.** `HOME_STRUCTURED_DATA`'s WebSite node and `HOME_SPEAKABLE` use `BRAND.description` ("real-time updates, personalized recommendations", `homeContent.ts:34`, `:102`). Export `HOME_META_DESCRIPTION` (the text now in `Index.tsx:59-60`) and use it for the WebPage node; give WebSite a factual description ("Events, restaurants, attractions and playgrounds across the Des Moines metro; event listings refreshed daily, times in Central."). Add `real-time` to the deny list for `homeContent.ts`.
5. **P1 / S. Speakable points at the dated paragraph.** Once WP1 item 1 lands, remove `h1` from `speakableCssSelectors`. Set the WebPage node's `dateModified` to the snapshot's `asOfDate` when it renders.
6. **P2 / S. An ItemList for the snapshot.** Emit an ItemList of the next-up and weekend event URLs through `toJsonLd`, alongside the paragraph, only when the snapshot rendered. Add `about: { "@type": "City", name: "Des Moines", containedInPlace: { "@type": "State", name: "Iowa" } }` to the WebPage node.
7. **P2 / S. FAQ facts.** `:150` says the today page is "filterable by category"; it groups by time of day, so say that. `:155` claims a neighbourhood field restaurants don't have; replace with "city" and link `/neighborhoods`. Import `EVENTS_UPDATE_ANSWER` from `src/content/eventsCopy.ts` for the cadence answer (`:188`) and in `GEOContent.tsx:87`, so the fact lives once.
8. **P2 / S. Snapshot edges.** Bound next-up to the next 7 Central days and print "EEEE, MMMM d" beyond tomorrow; a one-day window prints one day. The heading reads "Des Moines this weekend" and renders only with the snapshot; the fallback block is titled "How these listings are made".
9. **P2 / M. Per-area tonight counts (pass-1 follow-up, dropped).** `countTonightByArea(events, NEIGHBORHOODS)` in `neighborhoodTonight.ts` matches city, venue and location against `matchTerms` with `useNeighborhoodContent`'s case-insensitive rule. SocialProof reads `useTonightEvents()` (same cache key, no request) and renders "Ankeny, 3 tonight", or "3+ tonight" when the row set hit its cap. Nothing renders while loading, on error, or at zero. Retitle the strip "Explore by area": 7 of its 8 entries are separate cities.
10. **P2 / M. A spec for this section.** `tests/home-truth.spec.ts`: parse every ld+json block on `/` and assert one WebSite, one WebPage and one Organization linked by `@id`; FAQ `mainEntity` length equals the visible `<details>` count; a stubbed count appears in the snapshot with a `<time datetime>`; a stubbed failure renders no paragraph and no "0"; every strip chip href is in `NEIGHBORHOOD_ROUTES`. Answer the HEAD count fixtures with a `Content-Range` header and no body, in the spec's own `page.route`.

**Acceptance:**
- `node --test scripts/__tests__/geo-content-claims.test.mjs` fails on the old FAQ sentence and passes on the new one.
- With fixtures for a Saturday, the snapshot's weekend number equals the count `/events/this-weekend` shows for the same fixtures.
- `rg -n "real-time|personalized recommendations" src/content/homeContent.ts` returns nothing.

**Verify:** `npm run test:offline`, `npm run test:unit` (useHomeSnapshot, neighborhoodTonight), `tests/home-truth.spec.ts`, `npm run check-schema-dupes`, `npm run check-neighborhoods`, `npx impeccable detect src/components/SocialProof.tsx src/components/GEOContent.tsx`.

---

## WP5: Shell, footer and quick view as Home meets them

**Goal:** the shell stops breaking other pages, ships less, tells the truth in its footer, and closes the hand-offs other plans left on Home's files.

**Files:** `index.html`, `public/_headers`, `vite.config.ts`, `package.json` (one script line), new `scripts/check-dist-console.mjs`, `src/index.css`, `src/lib/performanceConfig.ts`, `src/components/Header.tsx`, `src/components/header/MobileNav.tsx`, `src/components/header/UserMenu.tsx`, `src/components/header/DesktopNav.tsx`, `src/components/header/navigationConfig.ts`, `src/components/Footer.tsx`, new `src/content/newsletterCopy.ts`, `src/hooks/useNewsletterSubscription.ts`, `src/components/EventQuickView.tsx`, `src/components/FavoriteButton.tsx`, `src/lib/capacitorUtils.ts`, `src/lib/directions.ts`, `src/components/CookieConsentBanner.tsx`, `src/components/AccessibilityWidget.tsx`, new `tests/shell-pass2.spec.ts`.

1. **P0 / S. No more white H1s.** Delete `color: #fff` from the critical `h1` rule (`index.html:153-158`); EnhancedHero's H1 already carries `text-white`. Delete the critical rules that match nothing in the current hero, including the double-escaped `.md\\:grid-cols-4` (`:198`). The spec asserts the H1's computed colour differs from its background on `/`, `/whats-new` and an unknown `/events/x` slug. Closes the Pricing hand-off (`pricing.md:225`).
2. **P1 / S. `console.*` really is stripped.** Move `esbuild` to the top level of the Vite config (`mode === 'production' ? { drop: ['console','debugger'] } : undefined`). `scripts/check-dist-console.mjs` fails when an app chunk in `dist/assets` contains `console.`; wire it as `check-dist-console` in `package.json`.
3. **P1 / S. Stop fetching what nobody uses.** Remove the `DMI-Logo-Header.webp` preload (`index.html:284-290`) and the dead `criticalResourcesConfig`/`serviceWorkerConfig` entries in `performanceConfig.ts`. Remove both Google Fonts preconnects, the Inter preload and its noscript link (`:261-262`, `:292-302`); no CSS names Inter, and the request sends each visitor's IP to Google before consent.
4. **P1 / S. Icons ship with their importer.** Delete the `lucide-react` manual chunk (`vite.config.ts:350-353`) so the shell carries only its own icons. Record the critical-path gzip total before and after in the PR.
5. **P1 / S. The newsletter promise matches the pipeline.** Replace "Weekly digest of trending events + AI-powered recommendations" (`Footer.tsx:91-94`) with a sentence from `newsletterCopy.ts`: "One email a week: what's on in the next 7 days, a few top-rated places to eat, and our newest guide." (`assemble-weekly-digest/index.ts:120-140` orders by featured-then-date and by rating, with no AI and no trending metric.) Drop the button's `aria-label` so the visible "Subscribe Free" is the accessible name, add `autoComplete="email"` and `inputMode="email"`, make both controls `h-11`, and show "Subscribing..." while loading. For a 400 or 429, `useNewsletterSubscription` shows the function's own message instead of "try again".
6. **P1 / S. Sign-up links and nested interactives.** `<Button asChild><Link/></Button>` in Header (`:108-112`), UserMenu Upgrade and Sign In, and MobileNav Sign In. The header and footer "Sign Up Free" go to `/auth?mode=signup` with the auth-return redirect, and the footer one is hidden when signed in. Closes the Account hand-off (`account.md:224`).
7. **P1 / S. Search in the shell.** A 44px search icon link to `/search` beside the menu button at every width, and a `/` shortcut that ignores focused inputs. Closes the Search hand-off (`search.md:201`).
8. **P1 / S. Mobile nav business links are links.** Replace `AdvertiseButton` and the submit button in MobileNav (`:157-162`) with `<Link>` rows to `/advertise` and `/submit-event`; `/advertise` is public, so the phone path loses its sign-in wall.
9. **P1 / M. Save in the quick view reports in the dialog.** FavoriteButton gets an optional `onResult`, and EventQuickView renders the outcome in its existing `role="status"` slot (`:296`), sign-up link included, because toasts are inert while the modal is open. Signed out, FavoriteButton calls `stashPendingAction` and navigates to `/auth?mode=signup&redirect=...`; the per-instance `UpgradeModal` (`:129`, `:169`) becomes `openPaywall('unlimited_favorites')`. Opening the quick view records a recent view. Closes the Pricing and Account hand-offs.
10. **P1 / S. No white flash in dark mode.** Add a `@media (prefers-color-scheme: dark)` block with the dark tokens to the critical style, and a three-line inline script that applies a stored `dmi-theme` class before paint, with its sha256 added to `script-src` in `public/_headers`.
11. **P1 / S. Don't claim CAN-SPAM compliance that isn't met.** The footer comment (`Footer.tsx:386-387`) says the block satisfies the physical-address rule; "Des Moines, Iowa, USA" doesn't. Remove the claim from the comment now. The address itself is a product decision (Deferred).
12. **P1 / M. The consent banner leaves room for the page on a phone.** Below `sm`, one line of text plus three buttons (about 140px), with details behind "Customize"; today it covers 418-844px of an 844px screen. Hide the accessibility widget, or raise its offset, while the banner is open, so it stops covering "Reject non-essential". `tests/cookie-consent.spec.ts` must still pass.
13. **P2 / S. Honest shell copy.** Remove the hardcoded "Popular" badge (`DesktopNav.tsx:62-66`, `navigationConfig.ts:56-57,69,95`). Fix `twitter:site`/`twitter:creator` to `BRAND.twitter` (`index.html:490-491`). The noscript block says "Plan a trip" and describes what's delivered, without "AI-powered" or "personalized" (`:528`, `:542`).
14. **P2 / S. Footer.** Serve the App Store badge locally with width and height and hide it inside the app (`isCapacitor()`), closing pass-1 WP7 item 3. Hide the "Unlock Premium Features" band behind `MemberUpgradeGate`. Give the footer an sr-only `h2` and sentence-case `h3` column titles without tracking.
15. **P2 / S. Quick view details.** `nativeShare` gains a result-returning sibling (`'shared' | 'cancelled' | 'unavailable'`, additive); a cancelled share no longer overwrites the clipboard. The sticky footer uses `pb-[max(1rem,env(safe-area-inset-bottom))]` below `sm`. Directions pass the venue name with the coordinates so Maps shows a named place (`directions.ts:12-16`).
16. **P2 / S. Bottom nav padding.** `.pb-bottom-nav` becomes `calc(4rem + max(1rem, env(safe-area-inset-bottom)))` below `lg`, and `.safe-area-top` drops its 1rem floor (`index.css:499-510`). The spec checks the footer's last line with `elementFromPoint` after scrolling to the bottom.

**Acceptance:**
- `/whats-new` in light mode has a visible H1.
- `npm run build && npm run check-dist-console` passes, and `rg -c "console\." dist/assets/EventCard-*.js` is 0.
- `/` requests nothing from `fonts.googleapis.com` and doesn't request `DMI-Logo-Header.webp`.
- A guest tapping Save in the quick view gets a visible in-dialog status with a working sign-up link.
- `npx impeccable detect src/components/header src/components/Footer.tsx` is clean.

**Verify:** `npm run validate`, `npm run build`, `npm run check-dist-console`, `tests/shell-pass2.spec.ts`, `tests/shell-mobile.spec.ts`, `tests/home-quick-view.spec.ts`, `tests/cookie-consent.spec.ts`, `tests/page-headings.spec.ts`, the a11y lane, `npm run check-marketing-consent`.

---

## WP6: Lane registration (lands last)

**Goal:** every spec this plan adds runs in CI.

**Files:** `playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`.

1. **P1 / S.** Add `home-rails-honesty`, `home-truth` and `shell-pass2` to the smoke `testMatch` (`playwright.smoke.config.ts:142`). The other specs this plan edits (`home-search`, `home-request-budget`, `home-tonight`, `home-rails-cls`, `home-dashboard`, `home-quick-view`, `shell-mobile`) are already registered.
2. **P1 / S.** Update `.github/e2e-lane-baseline.json` and, if the smoke job lists specs, `e2e.yml`.

**Acceptance:** `npm run check-e2e-lanes` reports no unregistered spec from this plan.

**Verify:** `npm run check-e2e-lanes`, `npm run test:smoke`.

---

## Deferred

Each needs a live migration, a secret, a product decision or an edge-function deploy.

| Priority | Item | Why it's deferred |
|---|---|---|
| P0 | Apply `20260929000001_trending_rpcs_visibility.sql` (written in WP3): `get_trending_events` and `get_personalized_recommendations` gain `is_merged IS NOT TRUE AND is_hidden IS NOT TRUE AND archived_at IS NULL`, signatures unchanged. Web no longer calls the first for anonymous visitors, but shipped iOS/Android binaries do. **Recommend approving first.** | Live migration |
| P1 | `get_popular_searches`: `CREATE OR REPLACE` as SECURITY DEFINER with a distinct-session threshold and a length/PII filter, so "Top searches" can return for the public. It already exists as SECURITY INVOKER (`20251110000009:318-343`). | Migration |
| P1 | `weather` edge function: add an optional `evening` field (the next 12 hourly periods through `assessOutdoorConditions`); the Tonight rail then takes each card's verdict from its start hour. Today it's `periods[0]` (`weather/index.ts:198-199`). Plan & Stay needs the same field. | Edge-function deploy |
| P1 | `get_tonight_pairings(p_start, p_end)` SECURITY INVOKER RPC using `geom` with `ST_DWithin` and a LATERAL nearest-N, replacing the 250-row box query. One request, no truncation, shared with the apps. | New RPC, live migration |
| P1 | Physical postal address or registered PO box for the footer and `_shared/emailLayout.ts` (CAN-SPAM). | Owner supplies it |
| P2 | Visitor band ("Stay near {venue}" on Tonight cards, `/stay` and itineraries above the footer). All five tables are in the snapshot; `event_hotels.is_active` isn't. Adding a per-rail `event_hotels` read to the first view would break the request budget, so it waits for the pairings RPC to carry the hotel, and for a probe. | Probe plus the RPC above |
| P2 | `restaurants.hours_json` in the Tonight columns and `resolveOpenStatus` in pairing. Not in the snapshot. | `npm run check-schema:probe` |
| P2 | `KnownVenue.indoor` set at ingest into `events.is_indoor`. | Edge-function deploy |
| P2 | `trending_scores` public read for today's rows. | Policy migration |
| P2 | `user_reputation`: confirm a non-admin can read their own row; if not, an additive `user_reputation_select_own` policy. `docs/RLS_AUDIT.md:669` shows only the admin policy. | Probe, then migration |
| P2 | `IOS_APP_STORE_ID = "6759137729"` in `version-check`, after confirming the listing is public. | Edge-function deploy |
| P2 | Downtown/Court Avenue and Ingersoll entries in `NEIGHBORHOODS`. | Content decision (new pages) |
| P2 | The 188KB gz entry chunk; Header moved into the App shell; Cmd/Ctrl+K search. | Cross-page shell plan |
| - | Unchanged from pass 1: `newsletter_subscribers.status` default, creatives `link_url` CHECK, For You cold-start and real lat/lon, quick-view "Get tickets" after a `ticket_url` probe, confirming restaurant/attraction refresh crons. Not re-checked this pass. | As before |

**Hand-offs to other plans:** Events, scroll to `#today-tonight` on `EventsToday` mount (WP1 item 13). Search, switch `SearchAutocomplete` to `useEntitySuggestions` once it lands (WP1 item 8), and drop `getIntentSummary` in favour of `appliedFilters` on `/search`.

## Rejected

- **Mount lazy sections when `navigator.webdriver` is true** (holistic P0 fix). The finding holds; the mechanism doesn't. Playwright sets `webdriver` too, so `home-request-budget.spec.ts` would mount every section and fail. WP1 uses a flag only the prerender sets.
- **Import GEOContent eagerly for every visitor** (places-geo P1, pass-1 WP5 item 3). It would add the snapshot's three requests to every first view. The crawler benefit comes from the prerender flag at no cost to visitors.
- **`appliedFilters` in the inline "Understood" line; "1 results"; the ms readout** (hero P1/P2). Moot: WP1 item 5 deletes the inline results panel.
- **Fix the restaurants count's merged filter; replace "New this week" with a weekend tile** (hero, places-geo, holistic). Superseded: WP1 item 4 deletes the desktop tiles and both counts.
- **`get_trending_events_v2` returning `is_sponsored`** (holistic, rails). Superseded by WP3 item 1, a plain PostgREST read on `trending_score` that needs no deploy. Only the visibility fix remains, for the apps.
- **Remove the quick view from Home and make every surface navigate** (holistic P2). Kept, with `?event=` (WP1 item 11): it's the one place Directions, Central time and Save are one tap, and the URL state fixes Back.
- **Retitle the rail "Today" and pair lunch before 15:00** (holistic, tonight option two). A rail that changes meaning by the hour is harder to trust, and daytime is `/events/today`'s job. The evening window is correct at any hour.
- **Test that every critical-CSS selector appears in hero or header source** (shell P2). Brittle; WP5 item 1 removes the dead rules instead.
- **Search tab in BottomNav in place of Map** (shell differentiator). A navigation product decision; the header icon closes the hand-off.
- **Not adopted as bets this pass:** "In town Fri-Sun?" on Home (Plan & Stay's date-window planner already does it, and WP1 item 2 now links there), "Since you were here" (new feature, needs a product call), a static SVG map of tonight's events, a footer freshness line (one extra query on every route), and "watch this search" from the hero (Search owns search-watch).
