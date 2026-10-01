# Explore plan (`/things-to-do` hub, map, attractions, playgrounds, music, sports, outdoors, deals)

Coordinator output, 2026-09-24. Built from one holistic audit and seven section audits (hub, Discover map, attractions, playgrounds, music and sports, outdoors, deals). Every P0 was re-opened at its cited line before it was accepted; claims that didn't hold, were downgraded, or were cut are under **Rejected**.

Entry: `src/pages/ThingsToDoHub.tsx`. Routes: `/things-to-do`, `/map`, `/attractions`, `/attractions/:slug`, `/playgrounds`, `/playgrounds/:slug`, `/music`, `/sports`, `/outdoors`, `/deals`.

## Where it stands

- `/things-to-do` is a static link directory with no events, counts, weather or photos. Its one query (`usePseoPageSlugs`, `src/pseo/hooks/usePseoPage.ts:57-63`) swallows errors and decides which cards exist, so 11 cards pop in after load or vanish for the session (`ThingsToDoHub.tsx:81-93`). It never links `/map`, `/sports` or `/deals`, which the Explore nav puts under it (`navigationConfig.ts:78-85`).
- The page states things nothing computes: a static "Live" badge (`ThingsToDoHub.tsx:54`), "The most searched things to do in DSM" over a hardcoded list (`:94-101`, `:277`), "69 mapped play spaces" when the hook's own comment says 21 of the 69 are out of state (`OutdoorsHub.tsx:61,454`, `useOutdoorsNearby.ts:16-18`), "New this week" on any deal ending 14+ days out (`useDeals.ts:100-103`), and "Good For: Families, Couples, Solo Travelers, Groups" plus "must-visit" on every attraction (`AttractionDetails.tsx:584-586,644`).
- `/map` misbehaves on first contact: `DiscoverMapCanvas.tsx` never imports `leaflet/dist/leaflet.css` (only the other map chunks do), "Search this area" unmounts the map because the `isLoading` gate swaps it for a skeleton (`DiscoverMap.tsx:377-389`), the first query has no bounds so "N in view" is the 200/300/200 cap (`:174`, `:201-207`), events skip `applyEventVisibility` (`:86-97`), and every detail link is `/<type>/<uuid>` (`:167-168`).
- Section data that would answer "can I go now, what does it cost, is it good for my kids" is stored and not shown: attraction `hours` JSONB goes to a string-only parser and always reads "check official site" (`AttractionDetails.tsx:407-411`, `restaurantHours.ts:581`); playground shade/restrooms/surface are selected (`listColumns.ts:94-95`) and never rendered; deal day/time windows are never read.
- Correctness bugs on sub-hubs: `/music` "This Weekend" jumps to next weekend on Sat/Sun (`MusicHub.tsx:33`), both music and sports show "No shows tonight" with a 0 badge while loading, the playground Location filter offers values that can't match (`Playgrounds.tsx:302-306` vs `usePlaygrounds.ts:91`), and attraction search 400s on a comma (`useAttractions.ts:69-71`).

## What makes it ours

The bets this plan adopts. Each one uses data or code already in the repo; none needs a new table.

1. **Right now, in Des Moines time.** The hub opens with what's on tonight and this weekend, with a real count and the weather line (`TonightRail`, `useEventLanding`, `useWeather`). The map gets Now / Tonight / This weekend chips and an open-now filter for restaurants. Deals get "Live now" from their stored day/time window. Yelp, Eventbrite and Catch Des Moines don't answer "what's open or on near me right now" on one screen.
2. **The facts a parent or visitor acts on.** Attraction hours with today's open status, free / kid-friendly / indoor filters; playground shade, restrooms, surface and accessibility notes; trail directions and "last checked" dates on the outdoors guide. All these columns or fields exist; they just don't reach the page.
3. **Everything connects.** A music venue card says what's playing there next. An attraction page lists events at and near it. A deal links to the venue. The hub links every Explore section, and `/map?layers=playground` is one tap from it.
4. **Honest by construction.** Every badge, count and superlative is computed from a query on the page or worded as editorial. No "Live" without data, no "69" without a count, no "Good For" or "dawn to dusk" without a column. This is cheap to do and the competitors don't.

Cut from the bets: weather-reordering the activity chips (the strip already carries the weather signal) and a hotels layer on the map (outside Explore).

## How the packages avoid edit conflicts

WP1-WP7 own disjoint files and can run in parallel. **WP8 lands last**: it is the only package that edits the shared Playwright config and lane baseline. Every other package writes its spec as a new file and installs its own table fixtures with `page.route` registered after `installFixtureBackend(page)` (`tests/support/fixtureBackend.ts:247-253` documents that the last handler wins), so nobody edits `fixtureBackend.ts`.

Two in-plan dependencies, both read-only: WP3's events rail calls `useVenueEvents` after WP5 adds visibility to it (WP3 doesn't edit `useVenues.ts`), and WP1's map teaser links `/map?layers=playground`, which works once WP2 ships the URL param (until then it links `/map`).

**Cross-plan overlap.**
- `src/lib/restaurantHours.ts` belongs to eat-drink WP (`docs/page-plans/eat-drink.md`). This plan only imports `resolveOpenStatus` / `formatOpenStatusLine` from it and never edits it.
- `src/hooks/useVenues.ts`: events WP7 changes `useVenueLinks`; this plan's WP5 changes only `useVenueEvents`. Whoever lands second rebases.
- `scripts/__tests__/json-ld-escape.test.mjs`: events WP8 moves `EnhancedEventSEO`, this plan's WP3 moves `EnhancedAttractionSEO`. One-line moves, rebase.
- `src/lib/listColumns.ts` belongs to home WP3. This plan makes no edit to it in the frontend-now work (slug additions are in Deferred D2).
- `playwright.smoke.config.ts`, `.github/e2e-lane-baseline.json`, `tests/route-smoke.spec.ts`: events WP1 and home also append. WP8 rebases and appends.
- `TonightRail`, `useWeather`, `useEventLanding`, `WeatherNotice`, `NearbyContent`: consumed unmodified.

---

## WP1: Things-to-do hub

**Goal:** the Explore landing answers "what should I do today or this weekend" on the first phone screen, links every Explore section, and never changes shape after load.

**Files:** `src/pages/ThingsToDoHub.tsx`, `src/pseo/hooks/usePseoPage.ts` (the hub is `usePseoPageSlugs`' only caller), `src/lib/hubLinks.ts`, `src/lib/__tests__/hubLinks.test.ts`, new `src/lib/hubSeason.ts`, new `src/lib/__tests__/hubSeason.test.ts`, new `tests/things-to-do-hub.spec.ts`.

1. **P0 / S. Stop the pop-in and the silent failure.** In `usePseoPageSlugs`, select `slug` only, add `.like('slug', '/things-to-do/%')`, and throw on `error` so TanStack retries and reports `isError`. On the page, report the error through `handleError({ component: 'ThingsToDoHub', action: 'pseo-slugs' })` without a toast. Split the constants: the top sections (areas, audiences, when, activities) contain only items with a real destination (a `fallback` or a fixed route), and a published pSEO page only upgrades the href. The 11 items with no fallback (downtown, valley-junction, drake, beaverdale, ingersoll, sherman-hill at `:24-35`; pet-friendly, groups, couples at `:48-50`; spring `:59`; coffee `:68`) move to a "More guides" text-link list at the bottom of the page, rendered only on `isSuccess`. Nothing above the fold can then appear or disappear. Keep the `resolveHubLink` contract (`hubLinks.ts:23-32`) and its test.
2. **P0 / S. Remove claims nothing backs.** Drop the "Live" and "Popular" badges (`:54-55`) or replace "Live" with the real count from item 4 ("23 today"). Retitle "Popular Searches / The most searched things to do in DSM" (`:276-277`) as editorial ("Start here"), or order it by the GSC impressions in `scripts/prerender-priority.json` and say that's the source. Rewrite "Dive into specific types of experiences" (`:253`).
3. **P1 / S. Link the visitor guide directly.** Make "For Visitors" a static `{ href: '/visitors-guide' }` outside `resolve()` and delete `/things-to-do/tourists` from `popularLinks` (`:47`, `:100`). `public/_redirects:5` 301s that path, but a client-side `<Link>` never reaches `_redirects`, so the SPA renders the duplicate. Add a `hubLinks.test.ts` case that reads `public/_redirects` and fails when any hub constant href is a redirect source.
4. **P1 / M. "Right now" block under the hero.** Mount `<TonightRail />` (`src/components/TonightRail.tsx:111`, fixed height, used on `/`), then one line from `useEventLanding({ window: 'this-weekend' })` with `countLabel` and `countFree` (`useEventLanding.ts:63,131,136`): "N events this weekend, M free", linking `/events/this-weekend` and `/events/free`. Show `weather.conditions` only when `hasVerdict` (`useWeather.ts:110`). Lazy-load the block inside `Suspense` with a fixed-height skeleton. No new queries beyond what `/` and `/events` already cache.
5. **P1 / S. Order by demand, action in the hero.** Put Today / Tonight / This Weekend / current-season chips directly under the h1, cut the hero paragraph to one line and its mobile padding. Section order: Right now, Explore Des Moines (item 6), When, Who's going, Areas. Below `sm`, areas become a horizontal chip row instead of a 6-row grid. Search Console demand backs this: `/events/today` 1701 and `/events/this-weekend` 1052 impressions vs 76 for the hub (`scripts/prerender-priority.json`).
6. **P1 / S. "Explore Des Moines" row.** Plain text links, outside `resolve()` so pSEO state can't hide them: Map, Playgrounds, Attractions, Trails & Outdoors, Live Music, Sports, Deals, Visitor guide, Plan my day (`/trip-planner`). Point "Parks & Nature" (`:70`) at `/outdoors` now that Playgrounds has its own link. Remove same-section duplicate hrefs (Arts & Culture and Museums both `/attractions`, `:65,69`). Add one line "Playgrounds near you on the map" linking `/map?layers=playground` (plain `/map` until WP2 item 10 lands). No Leaflet on this page.
7. **P1 / S. Season-aware When row.** `hubSeason.ts`: a pure `currentSeason(centralDateOf(now))` and `nextSeason`. Render Today, This Weekend, current season, next season; drop the two out-of-season cards. Resolve each season's href from `useSeasonalGuides()` by `season`, falling back to the existing static guide hrefs, and delete the `/guides/summer-2026` literal (`:56`). Lead with the State Fair card inside the fair window taken from `src/lib/annualEvents.ts` (`id: 'iowa-state-fair'`, `route: '/iowa-state-fair'`), not a hardcoded date. `seasonal_guides.season` is in the 2026-08-24 snapshot and the hook is already in production use; run `npm run check-schema:probe` before merge anyway.
8. **P2 / S. Craft floor.** Flat hero surface instead of `bg-gradient-to-br from-primary/10 ... to-secondary/10` (`:136`); audiences as a two-column text list with one neutral surface instead of eight tinted icon tiles (`:42-51`, `:197-215`); drop the area emoji (`:24-35`); `aria-hidden` on decorative chevrons (`:178`, `:208`, `:289`); activity chips `min-h-11` (`:262`).
9. **P2 / S. Structured data.** Emit `hasPart` as an `ItemList` of `{ name, url }` from the resolved links (`:104-113`), not bare `WebPage` urls.

**Acceptance:** with `pseo_pages` returning `[]`, the full list, or a 500, every section above "More guides" has the same card count and hrefs change only from fallback to pSEO path; a 500 reaches `handleError`. At 390x844, a Today and a This Weekend link are visible without scrolling. Every href in `navigationConfig.explore.items` appears on the page. No hub href matches a `_redirects` source. In a mocked September, the When row reads Today, This Weekend, Fall, Winter and no `2026` literal remains in the file. No badge or heading asserts a live or popularity fact that isn't computed.

**Verify:** `npm run test:unit` (hubLinks, hubSeason); new `tests/things-to-do-hub.spec.ts` with the fixture backend plus `page.route` overrides for `pseo_pages` (empty / full / 500), asserting stable counts before and after the slug response and a PerformanceObserver layout-shift sum under 0.1; `npx impeccable detect src/pages/ThingsToDoHub.tsx`; `npm run validate`.

---

## WP2: Discover map

**Goal:** `/map` renders correctly on a cold load, keeps the user's view, counts truthfully, links to real pages, and answers "what's on or open near me right now".

**Files:** `src/pages/DiscoverMap.tsx`, `src/components/map/DiscoverMapCanvas.tsx`, new `tests/discover-map.spec.ts`.

1. **P0 / S. Leaflet CSS and explicit icons.** Add `import 'leaflet/dist/leaflet.css'` to `DiscoverMapCanvas.tsx` (it imports react-leaflet at `:1-12` and nothing else brings the CSS into this chunk). Give every `Marker` an explicit icon (item 7) so Leaflet never falls back to its `marker-icon.png` path detection.
2. **P0 / S. Keep the map mounted.** Always render the `Suspense`/`DiscoverMapCanvas`; add `placeholderData: keepPreviousData` to `useMapEntities`; show loading as a small `role="status"` overlay pill. Today a new bounds key sets `isLoading` and swaps the map for a skeleton (`:377-389`), which remounts it at the hardcoded centre. This also lets the Leaflet chunk and the first query load in parallel.
3. **P0 / S. Truthful counts.** Don't query until the canvas emits its first bounds: on the first `onBoundsChange` set both pending and applied bounds and gate with `enabled: !!appliedBounds` (`:174`). Count layer badges from `inView`, not `entities` (`:348-351`). A layer that returns exactly its limit renders "200+" with the existing truncation copy. Compare bounds by value, not reference (`:229-230`).
4. **P0 / S. Visible rows only.** Wrap the events query in `applyEventVisibility()` (`src/lib/eventQuery.ts:33`) and replace `.gte('date', now)` with `.or(upcomingOrFilter(new Date()))` (`eventsHubQuery.ts:153`) so running multi-day events stay. For restaurants add `.or('status.is.null,status.neq.closed')` and `.neq('is_merged', true)` (both in the snapshot and already selected in production by `useOpenNowRestaurants`).
5. **P0 / S. Detail links that resolve without a reload.** Events via `createEventSlugWithCentralTime` (`timezone.ts:51`); restaurants select `slug`; attractions link `/attractions/${createSlug(name)}` (the slug resolver's own fallback) until Deferred D2. Use react-router `<Link>` in the list and popup. Split each list row into a select `<button>` and a sibling "View details" `<Link>` at least 44px tall; today an `<a>` sits inside a `<button>` (`:262-294`).
6. **P1 / S. Errors and Near Me.** Read `.error` on each response: all three failing throws (page shows an error with Retry through `handleError({ component: 'DiscoverMap', action: 'fetchEntities' })`); a partial failure names the failed layers. Stop saying "No results in this area" (`:257`) on an outage. Give `getCurrentPosition` an error callback and `{ timeout: 10000 }`, draw a user dot, and apply bounds after the fly-to settles.
7. **P1 / M. Named, typed markers.** A cached `L.divIcon` per type following `InteractiveMap.tsx:22-42` (shape and glyph, not colour alone, no shadow); `title`/`alt` of `${name}, ${type}${status ? ', ' + status : ''}`; open the selected marker's popup from the list; popup actions `min-h-11` as in `InteractiveMap.tsx:339-367`; a compact legend. No clustering unless bounds-scoped counts stay above ~300.
8. **P1 / M. Time chips.** Now / Tonight / This weekend / Any time next to the layers, defaulting to Tonight after 4 PM Central. Events use the hub's Central window predicates (`eventsHubQuery.ts:409-444`). Restaurants select `opening` and filter with `resolveOpenStatus(undefined, opening, now)` from `restaurantHours.ts` (import only), re-derived each minute. Carry a `statusLabel` ("Open until 10 PM", "Starts 7:30 PM") into the popup, list row and marker title.
9. **P1 / M. State in the URL.** `useSearchParams` for `layers`, `when`, `bbox` (4 dp, written on Search this area) and `sel`, with `replace`. New optional params only, per the URL-contract rule.
10. **P1 / M. Playground and trail layers.** Add `playground` and `trail` to `LAYER_CONFIG` (`:20-24`) and `MapEntity.type` with the same bounds/order/limit pattern. Bounds scoping drops the 21 out-of-state playgrounds for free. Link playgrounds as `/playgrounds/${createSlug(name)}` (what `PlaygroundsMap.tsx` does today, until D2) and trails as `/outdoors/${slug}`. `playgrounds.latitude` and `trails.latitude/slug` are in the 2026-08-24 snapshot and read in production by `useOutdoorsNearby.ts:94` and `useTrails`; probe before merge.
11. **P1 / M. Mobile.** Below `md`, size the map to `calc(100dvh - header - bottom nav)` and skip the Footer; one horizontally scrolling chip row for layers and time; the collapsed sheet peeks the first two results (`:406-421`).

**Acceptance:** cold-load `/map` in a fresh profile shows contiguous tiles and no 404 for `marker-icon.png`. Pan to Valley Junction, zoom 15, press Search this area: the map stays put and the button disables. On load, "N in view" equals the markers inside `map.getBounds()` and no badge shows a bare cap. A fixture event with `is_hidden=true` and a restaurant with `status='closed'` produce no pin. Every View details link lands on a canonical slug URL with no redirect and no document reload. axe reports no `nested-interactive` on `/map`. `/map?layers=playground&when=now` opens pre-filtered.

**Verify:** new `tests/discover-map.spec.ts` (fixture backend; asserts `.leaflet-container` is `position: relative`, `map.getCenter()` unchanged after search, the PostgREST URL carries `is_merged=neq.true`, error state with a 500); `npm run test:a11y`; manual cold load on a phone.

---

## WP3: Attractions hub and detail

**Goal:** each attraction answers "is it open, is it free, is it good for kids or a rainy day, what's on there", and says nothing it can't back.

**Files:** `src/pages/Attractions.tsx`, `src/pages/AttractionDetails.tsx`, `src/hooks/useAttractions.ts`, `src/components/EnhancedAttractionSEO.tsx`, `src/components/OpenStatusChip.tsx` (additive prop), `src/components/AttractionsMap.tsx`, `scripts/__tests__/json-ld-escape.test.mjs` (one line, see cross-plan note), new `src/lib/attractionHours.ts` and test, new `src/components/attractions/AttractionEventsRail.tsx`.

1. **P0 / S. Sanitize search.** `const q = sanitizePostgrestPattern(filters.search)` (`postgrestPattern.ts:45`) in `useAttractions.ts:69-71`; skip the `.or` when empty.
2. **P0 / S. Escape JSON-LD.** Replace both bare `JSON.stringify` blocks (`EnhancedAttractionSEO.tsx:216,219`) with `toJsonLd` (`src/lib/jsonLd.ts:18`) and move the file from BASELINE to REQUIRED_CLEAN (`json-ld-escape.test.mjs:92`).
3. **P0 / M. Hours that render.** `attractionHours.ts` converts the `{ mon: { open, close }, ... }` JSONB (`20260520000004_add_attraction_admin_fields.sql:8,22`) into the `periods` shape and calls `resolveOpenStatus(periods, hours_summary, now)` (`restaurantHours.ts:735`, import only), plus a 7-row weekly table. Add an optional `status` prop to `OpenStatusChip` (existing callers unchanged). Detail shows today's row highlighted; hub cards show one status line when `hours_summary` parses. Rewrite the hub FAQ answers that promise "hours and admission as listed" (`Attractions.tsx:931,935`), since no price column exists.
4. **P0 / S. Remove false claims.** Delete "Good For: Families, Couples, Solo Travelers, Groups" (`:644`) or derive "Kid-friendly" from `is_kid_friendly`; drop "by visitors", "vibrant", "must-visit" (`:584-586`), "a popular X attraction" (`:266`) and the editors claim (`:560`); stop appending `BRAND.city` under every address (`:460,489,609`); use `geo_summary` or remove the summary paragraph and its speakable selector; stop passing `location` to `SEOHead` so the page emits one place entity.
5. **P1 / S. Rails that don't dead-end.** `.eq('is_active', true)` on both related queries (`:121-126`, `:138-144`). Rebuild the second rail as geographic (bounding box around lat/lng, nearest first, distance in miles), falling back to rating only without coordinates, and title it by what it is.
6. **P1 / M. One "Plan your visit" panel.** Replace the four-tile stat grid and the two detail blocks (`:442-648`) with one definition list: Hours, Admission (from `is_free`), Indoor/Outdoor, Kid-friendly, Accessibility (`accessibility_notes`), Address with Directions, Est. visit time (marked as an estimate), Website. A row renders only with data. One Share and one Website control; rating in the hero and reviews only.
7. **P1 / M. Free / Kids / Indoors filters.** URL-synced chips mapped to the params `useAttractions` already applies server-side (`:22-27`, `:86-99`); remove the "Admin-only" comments. Cards get one fact line (Free, Indoor, Kids, today's status) and `rating.toFixed(1)`.
8. **P1 / M. "Happening here and nearby".** `AttractionEventsRail`: upcoming events at the venue via `useVenueEvents(name)` (after WP5 adds visibility), then `useNearbyListings('events', lat, lng)` deduped, soonest first. Renders nothing without coordinates or matches. Remove the `useVenues()` full-table fetch (`:115`) and keep the `/music/venues` link only on a venue match. `NearbyContent` is not edited.
9. **P1 / S. Map toggle.** Local `Suspense` with a 600px skeleton around `AttractionsMap` (`:588`), `startTransition` on toggle, `?view=map` via `useUrlFilters`, marker PNGs imported from the leaflet package instead of unpkg (`AttractionsMap.tsx:8-11`).
10. **P1 / S. Keyboard and touch.** Pagination links get `href="?page=n"` (`:745-793`); card favorite `h-11 w-11` (`:681`); mobile filter labels tied to their triggers (`:347-390`); "Browse By Type" as `<Link>`s (`:834-849`); delete the empty ad `<aside>` (`:806-809`).
11. **P2 / S. Flat hero.** Replace the purple-to-crimson gradient (`:274`, and the imageless-card placeholders in both files) with a solid surface at about half the height; take the prose count from `useAttractionTypeCounts`' total, not the filtered list.

**Acceptance:** `/attractions?q=Ankeny,%20IA` shows results or empty state, not ErrorState. An attraction with `hours = { mon: { open: '09:00', close: '17:00' }, ... }` shows the right status at a fixed clock; one with only `hours_summary` shows that text. `rg 'Solo Travelers|must-visit|by visitors' src/pages/AttractionDetails.tsx` is empty. An inactive attraction appears in no rail. `/attractions?free=1&kids=1` sends `is_free=eq.true&is_kid_friendly=eq.true`. No request goes to `unpkg.com` or `venues?select=*`.

**Verify:** `npm run test:unit` (attractionHours with a missing day key, sanitize case), `node --test scripts/__tests__/json-ld-escape.test.mjs`, new `tests/attractions-hub.spec.ts` (fixture backend, filter params, map skeleton), `npx impeccable detect src/pages/Attractions.tsx src/pages/AttractionDetails.tsx`, `npm run validate`.

---

## WP4: Playgrounds hub and detail

**Goal:** the parent's page: filters that work, shade/restroom/surface facts, a nearby list that is actually nearby.

**Files:** `src/pages/Playgrounds.tsx`, `src/pages/PlaygroundDetails.tsx`, `src/hooks/usePlaygrounds.ts`, `src/components/PlaygroundsMap.tsx`, new `tests/playgrounds-hub.spec.ts`.

1. **P0 / S. Location filter.** Delete the five hardcoded `SelectItem`s in both blocks (`:302-306`, `:423-429`); `ilike('%west-des-moines%')` can't match "West Des Moines" and the facet list duplicates three of them. Apply the metro-bounds `or()` (`usePlaygrounds.ts:104-109`) to the facets query too (`:244-246`) via one shared helper, and show a count per suburb.
2. **P0 / M. Real "nearby".** Replace both side queries (`PlaygroundDetails.tsx:59-82`): a bounding box around the playground, metro bounds applied, sorted by computed distance, `nullsFirst: false` on any rating order, an explicit card column list, and "1.2 mi away" on each card. Today `rating.desc` puts unrated rows first and out-of-state rows link to Not Found.
3. **P1 / S. Remove unbacked claims.** "Open dawn to dusk." (`:509`, marked speakable), "by families" (`:506`), the fixed "Good For: Families, Children, Toddlers" (`:574`), and the hub paragraph asserting hours and amenities (`Playgrounds.tsx:700-704`).
4. **P1 / M. Parent essentials.** Detail block with Shade, Restrooms, Surface, Accessibility; null reads "Not yet confirmed". Shade and Restrooms chips on hub cards when true. `shade`, `restrooms` and `accessible` URL toggles applied server-side. The four columns are in the 2026-08-24 snapshot and already selected by `PLAYGROUND_LIST_COLUMNS` in production (`AllInclusiveDashboard.tsx:193`); run `npm run check-schema:probe` before merge.
5. **P1 / S. List projection.** Pass `projection: 'list'` from `Playgrounds.tsx:110-116`; no `select=*` from either page.
6. **P1 / M. Amenity filter.** A multi-select stored as `?amenity=a,b`, applied with `.contains('amenities', [...])`; the "Browse By Amenity" chips (`:660-664`) toggle it with `aria-pressed` instead of typing into search. This makes the FAQ's "use the amenity filters" (`:768`) true.
7. **P1 / M. Map and Near me.** Local `Suspense` with a 600px skeleton (`:481`), route the map branch through the list's loading/error states, a "Near me" button that calls `requestLocation` (`useProximitySearch.ts:221`) and sorts by distance, `?view=map`. Denial shows an inline message. This makes the promise at `:708` true.
8. **P1 / S. a11y.** `<Button asChild><Link/></Button>` instead of a button inside a link (`PlaygroundDetails.tsx:143-147,231-235,723-727,338-346`); mobile `SelectTrigger`s get ids or aria-labels (`Playgrounds.tsx:278-319`).
9. **P2 / M. Craft.** Flat hero instead of the purple/emerald/crimson gradient (`:228`); one facts row (Ages, Shade, Restrooms, Surface, Free) instead of the tile grid (`PlaygroundDetails.tsx:358-393`); one Share; `bg-card` instead of `bg-white` (`:389`, `:611`).

**Acceptance:** every Location option returns at least one playground and no out-of-state city is listed. No related/nearby card renders "Playground Not Found". `/playgrounds?shade=1` returns only `has_shade=true` rows. `grep -n 'dawn to dusk' src/pages/Playgrounds.tsx src/pages/PlaygroundDetails.tsx` is empty. Pressing Map keeps hero and filters on screen.

**Verify:** new `tests/playgrounds-hub.spec.ts` (fixture backend, filter URLs, map skeleton); `npm run test:a11y`; `npx impeccable detect src/pages/Playgrounds.tsx src/pages/PlaygroundDetails.tsx`; `npm run validate`.

---

## WP5: Music and sports hubs

**Goal:** the right events for the right window, one query per hub, and venues and teams that tell you what's next.

**Files:** `src/pages/MusicHub.tsx`, `src/pages/SportsHub.tsx`, `src/hooks/useVenues.ts` (`useVenueEvents` only), `src/hooks/useTeams.ts`, `scripts/check-event-unpublish-filters.mjs`, new `src/lib/hubEventPartition.ts` and test, new `tests/music-sports-hubs.spec.ts`.

1. **P0 / S. Visibility.** Wrap both hub queries (`MusicHub.tsx:43-48`, `SportsHub.tsx:33-38`), `useVenueEvents` and `useTeamGames` in `applyEventVisibility()`. Extend the check script so a reader-facing `events` query under `src/pages` or `src/hooks` that filters neither switch fails (today it only flags asymmetric filters).
2. **P0 / S. One definition of the weekend.** Replace the hand-rolled `daysToFriday` (`MusicHub.tsx:33`; on Saturday it is 6) with `centralWindow('this-weekend')` (`timezone.ts:389`), and use `centralWindow` for sports today/week.
3. **P0 / S. Loading isn't empty.** Read `isPending` per section and render card-shaped skeletons; hide count badges until settled; empty copy only when `status === 'success'` and length is 0. Today the empty phrases `backend-down.spec.ts` forbids show during every load.
4. **P1 / M. One windowed query per hub.** Music over today to +14 days, sports today to +6, limit ~60. `hubEventPartition.ts` splits by `centralDateOf` into tonight / weekend / later, each event in only its first section, drops today's events that have ended (`end_date`, or start + 3h), and labels running ones "On now". Put the window start date in the query key. Cuts events requests from 3 and 2 to 1 each.
5. **P1 / S. One alert.** A single `ErrorState` under the hero when events fail (the comment at `MusicHub.tsx:81-86` already asks for this); compact `ErrorState` with refetch for venues and teams, which are silent today.
6. **P1 / M. What's playing at each venue.** Match the loaded events to the venues table by normalised name; each card shows "Next: <title>, Fri 8 PM" and "N shows in the next 2 weeks"; venues with shows sort first. No match means no "Next" line.
7. **P1 / S. Out of season isn't a dead end.** When the week is empty, list each team's `schedule_url ?? website` as an external link named for the team (`useTeams.ts:16-17` already selects them); render `logo_url` when present.
8. **P1 / S. Sports category match.** Drop `category.ilike.%Game%` (`SportsHub.tsx:36`, which pulls in trivia and board-game nights) and the redundant `%Live Music%`. First run a read-only distinct-category query to list the real values; this is a data check, not a schema change.
9. **P1 / S. See all.** "See all N" to the filtered `/events` URL under weekend and upcoming lists; make the badge equal that count. Delete the unused `GENRE_FILTERS` and `Button` import (`MusicHub.tsx:18,24`).
10. **P2 / S. Focus and copy.** `focus-visible` ring on card links; `aria-hidden` on the team emoji (`SportsHub.tsx:253`); replace the unsourced "#1 minor league market in America" (`:146,152`) with a line naming the teams and venues.

**Acceptance:** a unit test at Saturday 14:00 and Sunday 20:00 Central puts the weekend start on the preceding Friday. The fixture spec sees `is_merged=neq.true` on every events request, one events request per hub, no event id rendered twice, and no empty phrase or "0" badge during a 5s delayed response. With the backend cut, each hub has exactly one events alert.

**Verify:** `npm run test:unit`; `npm run check-event-unpublish`; `tests/backend-down.spec.ts` and `tests/request-budget.spec.ts` (smoke lane) still pass; new `tests/music-sports-hubs.spec.ts`.

---

## WP6: Outdoors hub

**Goal:** the editorial guide stays, gets today's weather, directions and "last checked" dates, and stops overstating.

**Files:** `src/pages/OutdoorsHub.tsx`, `src/hooks/useOutdoorsNearby.ts`, `src/data/outdoorsGuide.ts`, `src/components/outdoors/OutdoorsDestinationSection.tsx`, new `src/data/__tests__/outdoorsGuide.test.ts`.

1. **P0 / S. The 69 claim.** Expose `metroCount` from `usePlaygroundsNearDestinations` (rows within ~30 mi of downtown) and render that, or no number while loading or on error (`:61`, `:454-456`). Delete "the best-ranking part of this site".
2. **P1 / S. Today's weather.** `useWeather()` and one `weather.conditions` line under the intro when `hasVerdict`, nothing otherwise. Below 32F effective, link to the winter facts; at 50%+ precipitation, note unpaved trails are likely muddy. The line renders below the intro so absence causes no shift.
3. **P1 / S. "Checked" dates.** Required `checkedOn` (ISO date) on `OutdoorsLogistics` (`outdoorsGuide.ts:27-37`), set for all eight from git history, rendered under each `<dl>`; a test fails when any is over 365 days old.
4. **P1 / S. Filters.** `role="group"` with `aria-labelledby`, `aria-pressed` on each toggle (`:318-343`), `?difficulty=&activity=` via `useSearchParams`, a polite "N trails" count, Clear filters on empty.
5. **P1 / M. Directions.** A Google Maps directions link per destination and per trail with coordinates. Trail cards are whole-card `<Link>`s (`:358`), so make the title the link with a stretched overlay and put the directions anchor outside it. Rename "Every trail we have mapped" (`:309`), since there is no map.
6. **P2 / S. Empty vs filtered.** When `allTrails` is empty, say the list isn't available, not "No trails match the selected filters" (`:413-414`).
7. **P2 / S. Server-side type filter.** `.in('type', OUTDOOR_ATTRACTION_TYPES)` on the attractions read (`useOutdoorsNearby.ts:136-140`), keeping the client filter as a guard.
8. **P2 / S. One FAQ heading.** Remove the sr-only h2 (`:489-491`) or pass `h3` to `FAQSection`.

**Acceptance:** no literal `69` in `OutdoorsHub.tsx`; the count matches metro rows and is absent when the query fails. Every destination shows a checked date. `/outdoors?difficulty=moderate` loads pre-filtered and Back restores the prior filter. No nested `<a>`.

**Verify:** `npm run test:unit`; `page-headings` smoke spec; `npm run test:a11y`; `npm run validate`.

---

## WP7: Deals

**Goal:** Des Moines happy hours and specials by time of day, each linked to its venue, with honest labels.

**Files:** `src/pages/Deals.tsx`, `src/hooks/useDeals.ts`, `src/components/DealCard.tsx`, new `src/hooks/__tests__/useDeals.test.ts`, new `tests/deals.spec.ts`.

1. **P0 / S. "New this week".** Base it on `max(start_date, created_at)` within 7 days, and only when no urgency badge applies. Today it fires whenever the deal ends 14+ days out (`useDeals.ts:100-103`).
2. **P1 / S. Say the window in the query.** `.lte('start_date', now)` and `.or('end_date.is.null,end_date.gte.<now>')` on `useDeals` and `useFeaturedDeals`, so admins, whom the FOR ALL policy lets read everything, see what the public sees.
3. **P1 / M. Schedule and "Live now".** Add `days_of_week`, `start_time`, `end_time` to `Deal` (all in the snapshot); render "Tue-Thu, 4-6 PM"; a `?when=now|today` filter via `useUrlFilters` evaluated in America/Chicago; a "Live now" badge inside the window.
4. **P1 / S. Label promoted order.** `is_featured` sorts first (`:31`) with no badge. Show "Featured", and replace `AffiliateDisclosureBanner` (`Deals.tsx:74-76`), which describes affiliate booking links the cards don't have, with one accurate line about how featured deals are chosen.
5. **P1 / M. Link the venue.** Resolve `entity_id` per `entity_type` with one batched `.in('id', ids)` per type selecting `id, slug` from restaurants/attractions, and link `business_name`. (The hub link to `/deals` is WP1 item 6.)
6. **P1 / S. Claim errors.** `onError: handleError(e, { component: 'Deals', action: 'claimDeal' })`; keep the optimistic reveal; drop the blanket `invalidateQueries(['deals'])` since the count isn't rendered.
7. **P1 / S. Clipboard fallback.** try/catch around `writeText` (`DealCard.tsx:24-30`); on failure select the code and show "Press and hold to copy"; announce success in an `aria-live="polite"` region.
8. **P2 / S. Filter state.** `aria-pressed` and a labelled group on category buttons (`Deals.tsx:80-89`); unknown `?category=` normalises to all.
9. **P2 / S. Offer JSON-LD.** An `ItemList` of `Offer` (validFrom, validThrough, offeredBy) serialized with `toJsonLd`, not bare `JSON.stringify`.

**Acceptance:** a deal whose `created_at` and `start_date` are both older than 7 days never shows "New". Signed in as admin, `/deals` lists the same set as anonymous. A Tue-Thu 16:00-18:00 deal shows its schedule, appears with "Live now" under `?when=now` at Wed 17:00 CT and is filtered out at Mon 12:00 CT. A failed claim reaches `handleError` and the code is still shown.

**Verify:** `npm run test:unit` (badge and schedule cases with a fixed clock); new `tests/deals.spec.ts` (fixture backend, stubbed clipboard rejection); `npm run test:a11y`; `npm run validate`.

---

## WP8: Lane registration (sequential, lands last)

**Goal:** every new spec from WP1-WP7 actually runs in CI (WEB-CI-028).

**Files:** `playwright.smoke.config.ts`, `.github/e2e-lane-baseline.json`, `tests/route-smoke.spec.ts`, `tests/touch-targets.spec.ts`.

1. **P1 / S.** Append `things-to-do-hub`, `discover-map`, `attractions-hub`, `playgrounds-hub`, `music-sports-hubs`, `deals` to the smoke `testMatch` (`playwright.smoke.config.ts:95`) and the baseline. Rebase over events WP1 and home, which append to the same regex.
2. **P1 / S.** Add `/things-to-do` to `route-smoke.spec.ts` (it covers `/map` at `:108` but not the hub).
3. **P2 / S.** Extend `touch-targets.spec.ts` to `/things-to-do`, `/attractions` and `/playgrounds` at 44px.

**Verify:** `npm run check-e2e-lanes` lists every new spec as covered; the smoke lane passes against `npm run build`.

---

## Frontend-only now vs needs backend

**Frontend-only now:** everything in WP1-WP8. Items that read columns not yet exercised by these pages (WP1 item 7 `seasonal_guides.season`, WP2 item 10 playground/trail coordinates, WP4 item 4 playground essentials, WP7 item 3 deal schedule) rely on columns present in the 2026-08-24 `scripts/db-snapshot.json` and, in most cases, already read by production code. The snapshot is not a live probe, so each of those PRs runs `npm run check-schema:probe` and pastes the result before merge.

**Needs backend/DB (deferred, needs approval):**

- **D1. `pseo_pages.shippable`.** Additive `boolean NULL` column written by the `computePseoShippable` run (`scripts/lib/pseoShippable.ts:49`); the hub then links only shippable pages. `scripts/generate-dynamic-sitemaps.ts:731-752` records 22 shippable of 244 published, so the hub links pages the sitemap withholds. Until it exists, WP1 keeps today's published-only rule.
- **D2. Stored slugs for attractions and playgrounds.** Migration `20260919000008_content_slugs.sql` adds them with `-2` suffixes for duplicate names, but `attractions.slug` and `playgrounds.slug` are absent from the 2026-08-24 snapshot, and selecting a missing column fails the whole query with 42703. Once the probe shows them live: add `slug` to `ATTRACTION_LIST_COLUMNS` and `PLAYGROUND_LIST_COLUMNS` (home WP3 owns `listColumns.ts`), link `row.slug ?? createSlug(row.name)` in `Attractions.tsx`, `AttractionsMap.tsx`, `Playgrounds.tsx`, `PlaygroundsMap.tsx`, `useOutdoorsNearby.ts` and `DiscoverMap.tsx`, fix the attraction canonical (`AttractionDetails.tsx:216-217`), and delete the private `createSlug` copies.
- **D3. Trail status.** `ALTER TABLE trails ADD COLUMN status text NULL CHECK (status in ('open','partial','closed')), status_note text NULL, status_updated_at timestamptz NULL`, admin-write only; the card shows it only when under 14 days old. Floodplain trails (Bill Riley, Neal Smith) are the reason.
- **D4. Trail copy corrections.** A data-only migration: the Neal Smith seed row describes a route to Colfax while its highlights say Big Creek State Park (`20260228000004_create_trails.sql:51`). Check the production row and the other seven against county/INHF sources first.
- **D5. `increment_deal_redemption` active window.** Return NULL outside `start_date`/`end_date`, same signature (`20260902000013`). The RPC checks only that the id exists.
- **D6. Deal codes behind the claim.** Every code ships in the list response (`useDeals.ts:30`). Moving it to an RPC is a column-grant tightening that iOS `DealsService.swift` and Android `DealsRemoteDataSource.kt` read, so it needs the multi-release split. Cheaper interim: label the admin metric "reveals".

## Conflicts resolved

- **Stable hub cards.** The holistic audit wanted a real fallback for every card; the hub audit wanted placeholders until the query settles. Six areas have no `/neighborhoods` page (`src/lib/neighborhoods.ts`), so a fallback would invent a destination. Adopted a third option: the no-fallback items move to a "More guides" list at the bottom, and the top sections become fixed.
- **Right-now block.** Holistic proposed `TonightStrip` + `RestaurantsTonightStrip` and edits to both; the hub audit proposed `TonightRail` + `useEventLanding`. Took the second: `TonightRail` is already fixed-height and CLS-safe, pairs dinner with the event, and needs no edits to shared components.
- **Season row backend flag.** Holistic flagged it as needs-DB; the hub audit didn't. `seasonal_guides` is in the snapshot and `useSeasonalGuides` already runs in production, so it's frontend-now with a probe gate.
- **Visitor link priority.** Hub audit P0, holistic P1. Kept at P1: the pSEO href appears only if `/things-to-do/tourists` is published in `pseo_pages`, which this pass couldn't verify, and the fallback (`/attractions`) is off-canonical but not broken.
- **Hub badges.** Holistic P1, hub audit P0. Kept P0: "most searched" is a false statement on the page today, and the fix is a copy change.
- **Map playground layer and URL state.** Holistic and map audits each proposed a `?layers=` param; merged into WP2 items 9 and 10.

## Rejected

- **Neal Smith trail copy as a P0 page fix.** Moved to D4: the page renders whatever the DB row holds, and correcting it is a data migration.
- **Edit `navigationConfig.ts`** (holistic). The nav is right; the hub body is what's missing.
- **Edit `TonightStrip`, `RestaurantsTonightStrip`, `useWeather`** (holistic). Reuse them unmodified; see Conflicts.
- **Reorder activity chips by weather** (hub P2). Small payoff once the right-now block carries the weather line.
- **Hub og image** (holistic). No asset exists; not worth a design task inside this plan.
- **Deals Offer JSON-LD built with `JSON.stringify`.** Accepted as WP7 item 9 but corrected to `toJsonLd`; bare `JSON.stringify` in ld+json is the breakout `src/lib/jsonLd.ts` exists to prevent.
- **Map "unmapped rows" HEAD counts** (map P2). Adds a request per layer on the map's hot path; revisit after time chips ship.
- **Hotels layer on the map** (map P2). Outside Explore; the probe cost isn't justified here.
- **"x24 requests" on music/sports.** The music audit itself couldn't reproduce it from the code; the plan cites the verified 3 and 2 queries instead.
- **Attraction "admission price" display.** No price column exists (`types.ts` has only `is_free`); WP3 rewrites the FAQ instead of adding one.
