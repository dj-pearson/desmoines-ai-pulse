# Eat & Drink page plan

Scope: `/restaurants` hub (`src/pages/Restaurants.tsx`), `/restaurants/open-now`, `/restaurants/new`, `/restaurants/dietary`, `/breweries`, `/restaurants/:slug`.
Compiled 2026-09-24 from one full-page audit and seven section audits. Every P0 below was re-opened at the cited line before it was kept.

## Where it stands

The plumbing is good: URL-synced filters, a bounded paged RPC with a window-function count, honest ItemList schema, a lazy map chunk.
What sits on top of it doesn't hold up. Only 30 of 477 restaurants can be reached, because the pagination gate compares a 30-row page against 30 (`Restaurants.tsx:799`).
"Open Now" is a flag nothing reads (`useRestaurants.ts:42` is its only mention), yet the banner reports the full total as open (`Restaurants.tsx:668`).
The copy contradicts itself (200 vs 450+ vs 477 in the sitemap), the dietary page invents statistics, and the brewery trail promises XP that nothing awards. All of it ships as FAQPage JSON-LD.
The detail page renders closed and merged restaurants as live, and it puts scraped text into `<script>` and `href` without the guards the repo already has.

## What makes it ours

Yelp and Catch Des Moines can't join tonight's calendar to dinner, and we already can. These are the bets we're adopting:

1. **Dinner before the show, on the hub.** `useTonightPairings` (`src/hooks/useTonightPairings.ts:113`) already pairs tonight's events with open restaurants within 1.5 mi on the Central clock, for the home page's `TonightRail`. The hub gets it as a compact strip. No new query.
2. **Hours you can trust, in Des Moines time.** We fix one evaluator (`src/lib/restaurantHours.ts`) so it reads Central wall-clock time, handles 2am closes, fails closed on ambiguous text and returns "open until 10 PM". Every card, the map, the open-now page and the detail page read from it. A wrong "Open" badge costs more trust than no badge.
3. **Tonight near this restaurant.** The detail page swaps its generic "events within two miles, any date" grid for "After dinner, nearby tonight", built on the same `tonightPairings` helpers.
4. **A dated openings watch.** "Opened Sep 12 / Opening Oct 2026 / Announced" as one line per place. Locals search for this every week, and we already hold `opening_date` and `opening_timeframe`.
5. **Say only what the data backs.** Counts come from queries, and "real-time", "verified", "48 hours", "building permits", the invented percentages and the XP copy all go. Being the honest local source is itself a difference.

Named Des Moines areas (East Village, Ingersoll, Valley Junction, suburbs by city) are the sixth bet. They reuse `src/lib/eventAreas.ts`, but they need an additive RPC parameter, so they're in the deferred list.

## Conflicts resolved

- **Interim Open Now.** Three agents proposed three stopgaps: link to `/restaurants/open-now`, label it "Hours coming soon", or filter the current 30-row page client-side and call it "open now on this page". **Adopted: the link.** A page-local filter is its own misleading partial result, and "coming soon" leaves a dead control. The open-now page becomes the one honest implementation (WP5) until the server filter lands (D2).
- **Neighborhood facet.** Holistic proposed hand-drawn polygons plus a new `neighborhood` column assigned at ingest. The filters agent proposed reusing `EVENT_AREAS` city/bbox definitions. **Adopted: `eventAreas.ts`.** It exists, it's tested (`src/lib/__tests__/eventAreas.test.ts`), and it needs no new column or ingest change. Holistic's "switch to `.in('city')` now" isn't frontend-only either, because the default sort goes through `get_rotated_restaurants`, which has no city parameter. For now, remove the broken pill and defer the rest (D3).
- **Sponsored rows.** One agent suggested a separate labelled "Sponsored" row, another suggested counting boosted rows in the counter. **Adopted: pass the visitor's filters into the sponsored query, keep boosting in place, and make the counter match the cards rendered.** That keeps the paid placement contract and makes it relevant.
- **Hours source.** Several items say "prefer `hours_json`". `business_claims.sql:283` says migration 20260919000009 "is not applied". The evaluator therefore *accepts* `hours_json` when a row carries it, and no list query adds `hours_json` or `business_status` to a select until `npm run check-schema:probe` shows them (D6). If the column is missing, a select naming it fails the whole query with 42703.
- **`ai_writeup` in the RPC projection.** One agent filed this as a P0. It's a payload cost, not a defect, and dropping a response field that an older iOS/Android binary may read is a "never in one release" item under CLAUDE.md. Moved to deferred (D8) as P2.

## Work packages

Each package owns a disjoint set of files. Where one package consumes another's output, the dependency is named. The package that owns a file makes every change to it.

Suggested order: WP3 (hours library) first, since WP1, WP4, WP5 and WP8 read its API. WP9 has no dependencies and can go at any time. Everything else runs in parallel.

---

### WP1: Hub page (results first, honest controls, directory)

**Goal:** a visitor on a phone sees restaurants in the first viewport, can reach all 477, and every control on the hub changes the result set it claims to change.

**Files owned:** `src/pages/Restaurants.tsx`, `src/components/OpenNowBanner.tsx`, `src/components/seo/HubArticles.tsx`, new `src/components/seo/RestaurantsHubDirectory.tsx`, new `src/components/RestaurantsHubGuide.tsx` (the FAQ, guide and "by the numbers" copy extracted from the 1110-line page), new `src/components/RestaurantsTonightStrip.tsx`, new `tests/restaurants-hub.spec.ts`, `tests/support/fixtureBackend.ts`, `playwright.smoke.config.ts`, `.github/e2e-lane-baseline.json`.

**Depends on:** WP2 for `placeholderData` in `useRestaurants` (item 9) and for the presets' new `filters` prop (item 5). WP4 for the `RestaurantsMap` `filters` prop (item 11).

| # | Item | Pri | Effort |
|---|---|---|---|
| 1 | **Pagination and Load More.** Replace `restaurants.length > ITEMS_PER_PAGE` (`:799`) with `totalCount > ITEMS_PER_PAGE`, desktop on `totalPages > 1`, mobile on `hasMorePages` (`:219-222`). Give `PaginationLink` a real `href` (`?page=N` built from the current search params) and keep the onClick scroll. `ui/pagination.tsx:58` renders an `<a>` with no href, so it isn't tabbable or crawlable. Pass `href` through props and don't edit the primitive. | P0 | S |
| 2 | **Open Now, stopgap.** Turn the hero "Open Now" pill (`:498-510`) into a `<Link to="/restaurants/open-now">`. Remove `<OpenNowBanner>` from the hub (`:660-670`), since it states `totalCount` as the open count, and delete the component if nothing else imports it. Stop writing `?open=1` from any hub control. Keep reading it so old links don't break: a hub loaded with `?open=1` shows a one-line notice linking to the open-now page. | P0 | S |
| 3 | **Sponsored rows follow the filters.** `:187-192` fetches `{ sponsoredOnly: true, ... }` with no filters, so a Mexican search leads with unrelated paid rows. Spread `filters` into that query and keep the dedupe. Make the "Showing X-Y of N" line (`:783-786`) count the cards actually rendered. | P0 | S |
| 4 | **Remove the broken Area/Neighborhood pill wiring** on the hub side: no chip for `location` values that contain commas (`:131-132`). WP2 removes the pill itself. Keep reading `?location=` for one release per the URL rule. | P0 | S |
| 5 | **Copy and FAQ from data.** Move the guide, tips and FAQ (`:915-1100`) into `RestaurantsHubGuide.tsx`. Every number comes from props: `totalCount` from the unfiltered query rounded down ("470+"), cuisine count from `cuisineCounts.length`. Delete "over 200" (`:929`, `:1068`), "real-time" (`:315`, `:1072`), "verified by local experts" (`:1042`), "Free, unbiased reviews" (`:1044`), "within 48 hours ... building permits" (`:1080`). Drop Django (`:1068`, `:1092`; 0 hits in `public/sitemap-restaurants.xml`). Add `links` to FAQ items (FAQSection already supports them) for open-now, dietary, new, the neighborhood guides and Harbinger/Alba/Centro/Bubba. Replace the icon-tile "Dining Tips" stack (`:992-1034`) with a short prose paragraph. | P0 | S |
| 6 | **Results first.** Mobile hero `pt-8 pb-10`, h1 `text-3xl` on one line, subcopy hidden below `sm`. Render the results grid right under the filters. Move `RestaurantOpenings` (as a compact strip), `HubArticles` and the `featured_spot` ad below the first 9 results, and render none of them when `hasActiveFilters`. Delete the Featured row (`:673-704`), which repeats cards from the same page (`:279-282`), and mark featured cards in place. Pass `priority` only to the first three grid images. Make the pill row, sort and count one sticky bar (`top-16`) in both list and map views. | P1 | M |
| 7 | **Tonight strip.** `RestaurantsTonightStrip` calls the existing `useTonightPairings()` and renders up to 3 "Dinner before <event>" rows: event link, 7:30 PM CT, restaurant link, distance via `formatMiles`. Rows are at least 44px tall. It renders nothing when there's no pairing and only when `!hasActiveFilters`. It goes directly under the filters on the unfiltered hub. | P1 | S |
| 8 | **Directory and internal links.** `RestaurantsHubDirectory.tsx`, modelled on `EventsHubDirectory.tsx`, is one `<nav aria-labelledby>` with h3 groups. "When and what" links to open-now, new, dietary and `/breweries`. "Where" links to each `NEIGHBORHOODS` entry's `/neighborhoods/<slug>`. "Cuisine" makes the Browse-by-Cuisine chips (`:895-905`) `<Link to="/restaurants?cuisine=...">` instead of buttons. It replaces the four unlinked neighborhood cards (`:941-988`). | P1 | M |
| 9 | **Mobile Load More** keeps loaded cards mounted: show a spinner on the button instead of swapping to `CardsGridSkeleton` (`:722`). Needs WP2's `placeholderData`. | P1 | S |
| 10 | **Chips and the single chip row.** Add dietary `tags` to `restaurantChips` (`:121-141`), labelled from `DIETARY_OPTIONS`. WP2 deletes the inline duplicate chip row. | P1 | S |
| 11 | **View in URL.** Back `viewMode` (`:143`) with `setParam('view', ..., { def: 'list' })`. Add `aria-pressed` and keep the toggles at `h-11 w-11` at every breakpoint (`:528-555`). Pass `filters` to `RestaurantsMap` (WP4 fetches the full set). When the map toggle is pressed, scroll to `#all-restaurants-heading`. | P1 | S |
| 12 | **Schema.** ItemList `ListItem.url` and `@id` point to `/restaurants/<slug>` on `BRAND.baseUrl`, with the website moved to `sameAs` (`:351`). Emit it only when `!hasActiveFilters && page === 1`, and rename it "Restaurants in Des Moines, Iowa". Pass `breadcrumbs` to SEOHead. Pass `robots="noindex, follow"` when `filters.search` is set (the prop comes from WP9). | P1 | S |
| 13 | **Craft floor.** Hero SVG `fill="#f9fafb"` (`:561`) becomes `currentColor` with `text-gray-50 dark:text-background`. The hero gradient and orbs (`:386-392`) become one flat surface. The Search button (`:465`) becomes solid `bg-primary`. Delete the empty `<aside aria-label="Sidebar advertisement">` (`:1052`). HubArticles links get `inline-flex min-h-11 items-center`. | P2 | S |
| 14 | **Surprise Me** draws only from rows whose status isn't closed or opening_soon, and toasts when none qualify (`:196-200`). | P2 | S |

**Acceptance:**
- With fixture `total_count` 478, desktop shows page links 1-5 plus Next, each a tabbable `<a href*="page=">`. Clicking 2 shows "Showing 31-60 of 478". At 390px, Load More appends to 60 with no skeleton.
- No hub control writes `?open=1`, and no text says "N restaurants open".
- With `?cuisine=Mexican`, no non-Mexican sponsored card renders, and openings, articles and featured aren't rendered.
- At 390x844 with no filters, a restaurant card title is visible without scrolling. No restaurant id appears twice on page 1.
- `rg -n 'over 200|real-time|48 hours|building permits|verified by local|unbiased|Django' src/pages/Restaurants.tsx src/components/RestaurantsHubGuide.tsx` returns nothing, and one restaurant count appears on the page.
- The prerendered HTML has `<a href>` to `/restaurants/open-now`, `/restaurants/new`, `/restaurants/dietary`, `/breweries` and every `/neighborhoods/<slug>`. Every ItemList `ListItem.url` starts with `BRAND.baseUrl + '/restaurants/'`. There's exactly one BreadcrumbList.

**Verify:** `npx playwright test --config=playwright.smoke.config.ts tests/restaurants-hub.spec.ts` (new spec, added to the smoke `testMatch` and the lane baseline, using `installFixtureBackend` with a `total_count` override). Also `npm run check-e2e-lanes`, `npm run test:a11y:axe`, the existing `sticky-filter-chips`, `search-filters`, `url-filter-state` and `request-budget` specs, `node scripts/check-duplicate-schema.mjs`, `npx impeccable detect src/pages/Restaurants.tsx`, and a manual dark-mode check of the hero curve.

---

### WP2: Filters, presets, search

**Goal:** every filter and preset changes the result set it claims to, is reachable by keyboard, and can be shared by URL.

**Files owned:** `src/components/RestaurantInlineFilters.tsx`, `src/components/RestaurantSmartPresets.tsx`, `src/components/SearchAutocomplete.tsx`, `src/hooks/useRestaurants.ts`, `src/lib/restaurantRotation.ts`, new `src/lib/__tests__/restaurantPresets.test.ts`.

| # | Item | Pri | Effort |
|---|---|---|---|
| 1 | **Remove the Area/"Neighborhood" pill** (`RestaurantInlineFilters.tsx:221-240`). It lists one street address per restaurant, from `get_restaurant_filter_options` over `location`. `useUrlFilters` splits list params on commas (`useUrlFilters.ts:35`), so selecting an address yields four bogus values and zero results. Named areas come back with D3. | P0 | S |
| 2 | **Presets that filter.** Drop Quick Lunch and Late Night, which are `openNow`-only and therefore no-ops (`RestaurantSmartPresets.tsx:42`, `:65`). Remove the tags-only filters from Date Night, Family Friendly and With Kids (`:30`, `:52`, `:101`), since `resolveDietarySelections` drops non-dietary tags (`useRestaurants.ts:499-505`), and merge With Kids into Family Friendly. Show a cuisine preset only when its cuisines have `count > 0` in the facet. Derive the active preset from a new `filters` prop instead of local `useState` (`:117`). Replace the per-preset gradients (`:147`, `:155`) with neutral chips that have a solid selected state. | P1 | M |
| 3 | **One chip row.** Delete the inline Badge chip row (`RestaurantInlineFilters.tsx:377-448`). It uses non-focusable `<div onClick>` at about 20px and duplicates `ActiveFilterChips`. | P1 | S |
| 4 | **Popover a11y.** Add `aria-pressed` to option buttons (`:153`, `:193`, `:270`, `:314`) and `min-h-[44px]`. Label the Slider (`:286`) `aria-label="Minimum rating"`. Write to the URL on `onValueCommit` rather than `onValueChange`, so a drag makes one history entry and one request. Replace `#2D1B69` (`:262`) with `text-primary` / `bg-primary`. Replace the dietary emoji (`:27-31`) with Lucide icons or text. | P1 | S |
| 5 | **Cuisine popover shows everything, with counts.** Remove `slice(0, 15)` (`:125`). Keep `count` in `useRestaurantFilterOptions` (`useRestaurants.ts:591`), render "(12)", and add a type-to-filter input when there are more than 15. | P1 | S |
| 6 | **Autocomplete opens the restaurant.** Select `slug` and set `href: /restaurants/${slug || id}` on restaurant suggestions (`SearchAutocomplete.tsx:162-166`). Add `.neq('is_merged', true)` to that query (`:153-157`). Add a "Cuisines" group matched against the cached facet list, which applies `?cuisine=`. All option rows get `min-h-[44px]`. | P1 | M |
| 7 | **Did-you-mean on the default sort.** When the RPC returns 0 rows for a non-empty search, call `fuzzy_search_restaurants` and expose `suggestions` from the hook. Don't swap the result set. | P2 | S |
| 8 | **Mobile paging data.** Add `placeholderData: keepPreviousData` to `useRestaurants` so Load More doesn't blank the grid (WP1 item 9 consumes this). | P1 | S |
| 9 | **Rotation seed in Central.** `restaurantRotation.ts:7-9` seeds on the UTC day, so the order reshuffles at 7pm Central, between page 1 and page 2 at dinner time. Seed from the America/Chicago date with `formatInTimeZone`. | P1 | S |

**Acceptance:**
- Every remaining preset, run against fixtures, produces a query different from unfiltered, and no two presets produce the same query. A unit test asserts no preset writes `tags` outside `DIETARY_KEYWORDS` or sets `openNow`. Reloading a preset's URL shows it active, and editing any filter clears it.
- Dragging the rating slider from 0 to 4.5 adds one history entry and one request. The axe lane reports no unlabelled slider.
- Picking a restaurant suggestion navigates to its detail page. Typing "thai" offers the Thai cuisine filter.
- Page 1 and page 2 don't overlap between 6pm and 8pm Central. There's a unit test with a fixed clock.

**Verify:** `npm run test:unit`, `npm run test:a11y:axe`, smoke `search-filters`, `url-filter-state`, `touch-targets`, `search-request-loop`, `npx impeccable detect src/components/RestaurantSmartPresets.tsx src/components/RestaurantInlineFilters.tsx`.

---

### WP3: Hours evaluator and restaurant card

**Goal:** one correct, Central-time, fail-closed open/closed evaluator that every surface uses, and a card that leads with the decision line.

**Files owned:** `src/lib/restaurantHours.ts`, new `src/lib/__tests__/restaurantHours.test.ts`, `src/lib/tonightPairings.ts` (caller update only), `src/components/RestaurantCard.tsx`, `src/components/SponsoredBadge.tsx`, new `src/hooks/useMinuteClock.ts`.

| # | Item | Pri | Effort |
|---|---|---|---|
| 1 | **Central time.** `getRestaurantOpenStatus` reads `getDay/getHours` from the browser zone (`restaurantHours.ts:297-299`). Add `desMoinesNow(now = new Date())` returning `toZonedTime(now, 'America/Chicago')`, and use it when `now` is omitted. **Trap:** `tonightPairings.ts:248-249` already passes a zoned wall-clock `Date`. Change that caller in the same commit to pass the instant, or add an explicit `{ wallClock: true }` option, so it isn't converted twice. `tonightPairings.test.ts` must stay green. | P0 | S |
| 2 | **Overnight spans.** The after-midnight branch (`:321-322`) checks today's range, not yesterday's. When `currentMinutes < closeMinutes` and the range wraps, test whether the range's days include `(dayOfWeek + 6) % 7`. | P0 | S |
| 3 | **Fail closed.** (a) A meridiem-less open takes the close's meridiem when that makes open < close ("5-10pm" becomes 17:00-22:00, `:44-52`). (b) A non-empty day prefix that `parseDayRange` can't read drops the segment instead of meaning all 7 days (`:240-251`). (c) The closed-day match accepts "Closed Mon" and "Mon." from `DAY_ABBREVS` (`:281`). (d) Split shifts are collected with `matchAll` (`:228-229`). | P0 | M |
| 4 | **Richer result.** Add `closesAt` and `nextOpensAt` (Central, formatted "10 PM") to `RestaurantOpenResult` (`:16-20`), and a `resolveOpenStatus(hoursJson, opening, now)` that prefers `hours_json` periods when the row carries them (cross-midnight handled natively), mirroring `resolveOpeningHoursSpecification`. Reads only what's passed. Adds no column to any select. | P1 | M |
| 5 | **Tests.** A table-driven `restaurantHours.test.ts` with a fixed clock, run with `process.env.TZ` set to `UTC` and then `America/Los_Angeles` inside the suite (Node honours a runtime TZ change), covering: the header-comment formats, "Fri-Sat 6pm-2am" at 01:00 Fri, Sat and Sun, closing-soon at 59 and 61 minutes, "Mon-Fri 5-10pm" at Mon 07:00, "Brunch Sat-Sun 10am-2pm" on Tue, "Daily 11-9, Closed Mon" on Mon, "Tue-Sat 11am-2pm, 5-9pm" at Wed 18:00, null, and unparseable. | P0 | S |
| 6 | **Card decision line.** The first body row is "Open until 10 PM / Closed, opens 11 AM · $$ · <city>", then cuisine. Price moves out of the `absolute top-3 right-3` corner where FavoriteButton covers it (`RestaurantCard.tsx:170`, `:206`). Render a "Permanently closed" or "Opening soon" chip from `status`, never with an Open badge. Drop the "No rating yet" filler (`:239`). Show dietary chips only from structured tags, since the substring match (`:36-40`) turns "no vegan options" into Vegan. Accept an optional `openingLabel` prop (WP6 passes it). Status re-evaluates on `useMinuteClock()` instead of memoizing on `opening` alone (`:109`). | P1 | M |
| 7 | **Card a11y.** Use the stretched-link pattern from `RestaurantOpenings.tsx:101-127`: the `<h3>` name is the link and FavoriteButton sits outside the anchor. Remove the card-level `aria-label` (`:122-129`) that hides status, price and Sponsored. Delete the gradient hover strip (`:287`). | P1 | S |
| 8 | **Sponsored label.** `SponsoredBadge` goes to `text-xs`, and "Sponsored" repeats beside the name in the card body. | P1 | S |

**Acceptance:**
- The hours suite passes under both TZ values and fails if `getHours()` on a raw `new Date()` comes back.
- "Fri-Sat 6pm-2am" is open Sat 01:00 and Sun 01:00 and closed Fri 01:00.
- At 375px and 1280px every priced card shows its price unobscured. Each card exposes one link named after the restaurant plus a separate Save button. axe reports no nested-interactive violation.
- `rg -n 'gradient' src/components/RestaurantCard.tsx` returns nothing.

**Verify:** `npm run test:unit` (with `restaurantHoursJson`, `tonightPairings` and `dinnerBeforeShow` suites still green), `npm run test:a11y:axe`, `touch-targets` smoke, `npx impeccable detect src/components/RestaurantCard.tsx`.

---

### WP4: Restaurants map

**Goal:** map view shows every mapped restaurant for the current filters, coloured by open status, usable by keyboard and on a phone.

**Files owned:** `src/components/RestaurantsMap.tsx`, `src/components/InteractiveMap.tsx`, new `src/hooks/useRestaurantMapPoints.ts`, `package.json` and `package-lock.json` (clustering dependency, item 7).

**Depends on:** WP3 items 1 and 4 for status colours. WP1 item 11 passes `filters`.

| # | Item | Pri | Effort |
|---|---|---|---|
| 1 | **Full set, not one page.** `useRestaurantMapPoints(filters)` runs the legacy table query with the same filters and `.neq('is_merged', true)`, a narrow projection (id, name, slug, latitude, longitude, cuisine, opening, price_range, rating, image_url, phone, status), coordinates not null, and a limit of about 1000. It's enabled only in map view. The badge reads "N of totalCount mapped". Today the map gets the same 30-row page as the list (`Restaurants.tsx:170-177`, `:767`). | P0 | M |
| 2 | **Status colours, not cuisine grey.** Every cuisine falls back to `DEFAULT_COLOR` because `categoryColors.ts` holds only event categories. Colour pins with `getRestaurantOpenStatus`: open, closing soon, closed, unknown. Use a four-row legend with capped height, and show status as text in the popup and the list alternative too, not by colour alone. | P0 | S |
| 3 | **Unmapped rows.** Show "N restaurants not on the map" and list them under "Location not mapped" in the list alternative (`RestaurantsMap.tsx:25`, `InteractiveMap.tsx:168-171` drop them silently). | P1 | S |
| 4 | **Stop refitting on re-render.** `useMemo` the `mapLocations` array. MapControls fits bounds only on first load or when the joined-id key changes (`InteractiveMap.tsx:79-95`). Cache divIcons per colour at module level. | P1 | S |
| 5 | **A11y.** Markers get `title` and `alt` set to "<name>, <status>". Use `role="region"` with an `aria-label` instead of `role="application"` (`:308`). Controls get an `aria-label` and `h-11 w-11` (`:112-141`). Fullscreen calls `invalidateSize()`, exits on Escape and sets `aria-pressed` (`:208-210`). | P1 | S |
| 6 | **Near me.** A button that calls `requestLocation` on click only (`RestaurantsMap.tsx:22` never calls it). Show the user marker and fill `distance_miles`. Report errors in a polite live region. | P1 | S |
| 7 | **Clustering.** Implement `showClustering` (`InteractiveMap.tsx:155`, which is never read) with a cluster lib imported only inside the lazy map chunk. Clusters are named "12 restaurants, zoom in". | P2 | M |
| 8 | **Popup actions.** A Directions link (`google.com/maps/dir/?api=1&destination=lat,lng`, `rel=noopener`) and `tel:` when a phone exists, each 44px. The Lucide Star replaces the emoji (`:257`). | P2 | S |

**Acceptance:**
- With no filters, map pins equal the rows with coordinates, not 30, and there's no map request in list view.
- Pins show at least 3 distinct colours. Zoom in, then blur and refocus the window: zoom and centre stay put.
- axe is clean on map view, and every control is at least 44x44 at 375px.
- The index chunk size is unchanged. The cluster lib appears only in the map chunk (`npm run build:analyze`).

**Verify:** `npm run build:analyze`, `npm run test:a11y:axe` (add a map-view case), manual VoiceOver/NVDA pass on a pin, manual fullscreen and near-me checks on a phone.

---

### WP5: /restaurants/open-now

**Goal:** the one page that answers "what's open right now" honestly, in Central time, from every restaurant with listed hours.

**Files owned:** `src/pages/OpenNowRestaurants.tsx`, new `src/hooks/useOpenNowRestaurants.ts`, new `tests/restaurants-open-now.spec.ts`.

**Depends on:** WP3 items 1-4.

| # | Item | Pri | Effort |
|---|---|---|---|
| 1 | **Fetch every row with hours.** Replace `.order("name").limit(100)` (`:60-64`) with a TanStack `useOpenNowRestaurants` that selects a narrow projection where `opening` is non-empty, `.neq('is_merged', true)`, excludes closed statuses, and is bounded at about 600. No `hours_json` or `business_status` in the select until D6. | P0 | S |
| 2 | **Recompute per minute.** Derive the open set with `useMemo([rows, currentTime])` so a place drops off at close without a refetch (it's computed once in the fetch effect today, `:72-77`). | P1 | S |
| 3 | **Honest empty state.** Replace "Loading Restaurant Hours / Checking real-time operating hours..." (`:333-343`), which shows forever when zero places are open. Use "Nothing we have hours for is open right now (2:14 AM CT)", then the next few to open (via `nextOpensAt`), with links. It's an h2. | P0 | S |
| 4 | **Honest copy.** Remove "Hours verified in real-time" (`:207`), the "Real-Time" stat (`:236-239`), "updated continuously" and the "Des Moines Restaurant Association" figure (`:97`, `:107`), and the `{n}+` lower bounds (`:200`, `:217`). State "N of M restaurants with listed hours are open". The meta description is static, with no build-time count. Replace the hardcoded late-night JSX list (`:246-266`) with an evaluator-driven "Open past midnight tonight" list. Remove Django from the FAQ (`:115`). | P0 | S |
| 5 | **Central clock.** The displayed time uses `formatInTimeZone(..., 'America/Chicago', 'h:mm a')` plus "CT" (`:187`, `:191`, `:225`). `isLateNight` and `timeOfDayMessage` read Central too. | P0 | S |
| 6 | **Sort and label.** Sort by minutes until close, descending. Put a trailing group "Closing within the hour". Cards show "Open until 10 PM". | P1 | S |
| 7 | **Craft floor.** A flat stats band with two real numbers, replacing the `from-green-50 to-teal-50` gradient (`:212`). `motion-reduce:animate-none` on the clock pulse (`:180`). Dark-safe greens. No emoji section headings. | P2 | S |

**Acceptance:**
- A fixture restaurant named "Zz Test" that's open now appears. Merged and closed rows never do.
- With the browser TZ at America/Los_Angeles and the clock at 21:30 PT, a place closing at 22:00 Central shows as closed.
- With all fixtures closed, the empty message shows the CT time and no "Loading" text.
- `rg -n 'real-time|verified|updated continuously|Association' src/pages/OpenNowRestaurants.tsx` returns nothing.

**Verify:** the new spec in the smoke lane with `installFixtureBackend` and `page.clock`, `npm run check-e2e-lanes`, `npm run test:a11y:axe`, `npx impeccable detect src/pages/OpenNowRestaurants.tsx`.

---

### WP6: Openings watch and /restaurants/new

**Goal:** openings are a dated, correct, linkable timeline that includes places that just opened.

**Files owned:** `src/components/RestaurantOpenings.tsx`, `src/hooks/useSupabase.ts` (`useRestaurantOpenings` only), `src/pages/NewRestaurants.tsx`, `src/lib/restaurantOpenings.ts`, `src/lib/__tests__/restaurantOpenings.test.ts`.

**Depends on:** WP3 item 6 for the `openingLabel` card prop.

| # | Item | Pri | Effort |
|---|---|---|---|
| 1 | **Real slugs.** Delete `createSlug` (`RestaurantOpenings.tsx:13-18`) and link to `/restaurants/${restaurant.slug \|\| restaurant.id}` (`:98`). DB slugs are unaccented and city-suffixed, so name-derived links 404 or open the wrong location. | P0 | S |
| 2 | **Query.** `useRestaurantOpenings` includes `newly_opened` rows from the last 60 days by `opening_date`, adds `.neq('is_merged', true)`, and the hub calls it with `{ limit: 8 }`. The `limit` option already exists (`useSupabase.ts:151-164`). | P1 | S |
| 3 | **Dated timeline.** One line per place: "Opened Sep 12" / "Opening Oct 2026" / "Announced", plus cuisine and city, 8 rows max, linking to `/restaurants/new`. Format date-only values with `parseISO` and `format` so 2026-10-01 doesn't render as Sep 30 (`:165-167`). Render an error state on `isError` instead of the empty copy (`:41`, `:63-77`). | P1 | S |
| 4 | **/restaurants/new.** Pass `openingLabel` to cards. Add `.order('opening_date', { ascending: false, nullsFirst: false })` before `.limit(120)` (`NewRestaurants.tsx:35-40`). `groupOpenings` drops `newly_opened` rows older than `RECENT_WINDOW_DAYS`. | P1 | S |
| 5 | **JSON-LD escaping.** Replace `JSON.stringify` at `NewRestaurants.tsx:78` with `toJsonLd`, since scraped names can contain `</script>`. | P1 | S |

**Acceptance:**
- Fixture rows `foo-altoona` and an accented name link to their exact slugs.
- A `newly_opened` row 10 days old shows "Opened <date>". One from 2023 is gone from "Recently opened".
- The openings request carries `limit=8`. With the backend cut, the section shows an error.

**Verify:** `npm run test:unit` (restaurantOpenings), smoke `backend-down`, manual TZ=America/Chicago date check.

---

### WP7: Dietary and brewery landings

**Goal:** both landings say only what the data supports, work with Back/Forward, and give a reason to visit.

**Files owned:** `src/pages/DietaryRestaurants.tsx`, new `src/hooks/useDietaryRestaurants.ts`, `src/pages/BreweryTrail.tsx`, `src/hooks/useBreweryTrail.ts`, and for item 7 only: `src/App.tsx`, `scripts/prerender-routes.mjs`, `public/sitemap-static.xml`.

| # | Item | Pri | Effort |
|---|---|---|---|
| 1 | **Delete fabricated claims.** Remove the stats card (`:276-307`) and every attributed statistic or certification (`:147-166`, `:236`, `:240`, `:320-363`): 60%, 200%, 300%, "20+ halal-certified", "Tasty Tacos halal", "Ingersoll Kosher Meat Market", "Celiac Support Group". Drop "verified menu options", "dedicated kitchens" and "Updated daily" (`:135`). The celiac, halal and kosher answers become "call ahead; ask about shared fryers and prep surfaces" plus a link to the list. These ship as FAQPage JSON-LD. | P0 | S |
| 2 | **Honest labelling of the keyword match.** Until D5 lands, the list says "mentioned in name or description" rather than "verified". Add `.neq('is_merged', true)` and exclude closed rows. With no diet selected, show the six diet entry points instead of 100 alphabetical rows labelled "Dietary-Friendly Restaurants (100)" (`:69-73`, `:388`). | P0 | S |
| 3 | **Brewery XP copy.** Remove "+40 XP" (`BreweryTrail.tsx:50`, `:284`) and "earn rewards" (`:96`, `:129`, `:309`). Nothing awards XP: the check-in mutation only inserts a row. Show the visited count the page already computes (`:38-40`). | P0 | S |
| 4 | **Dietary state.** Move the fetch into `useDietaryRestaurants(diet)` (useQuery keyed on the diet, which fixes out-of-order responses). Derive `selectedDiet` from `searchParams` (`:60` reads it once). Add `aria-pressed` to the filter buttons. A real empty state replaces "Loading Kosher Restaurants" (`:415-427`). An unknown slug is treated as unfiltered, never "undefined Restaurants" (`:131`, `:213`). | P1 | S |
| 5 | **Brewery list hygiene.** Add `.neq('is_merged', true).neq('status', 'closed')` to `useBreweries` (`useBreweryTrail.ts:49-53`), so the passport denominator counts real breweries. | P1 | S |
| 6 | **This week at the taprooms.** Add a `useBreweryEvents(names)` hook: one events query with venue `ilike` any of the escaped brewery names over the next 7 days, filtered like `useEvents`. Put the strip above the grid, hidden when empty, and add an open-status line per card from WP3. | P1 | M |
| 7 | **Check-in dialog a11y.** Pair label and input by `id`/`htmlFor`. The stars become a 44px `radiogroup`. Reset form state on close. Use `<Button asChild><Link/></Button>` (`:234-236`) and add progressbar ARIA (`:146-151`). The catch calls `handleError` (`:54-56`). | P1 | S |
| 8 | **Per-diet paths.** Add `/restaurants/dietary/:diet` for the six diets, keep `?diet=` working (it redirects to the path) for at least one release, and add them to prerender and the sitemap. | P2 | M |
| 9 | **Craft floor.** No gradient card, no emoji headings (`:435-449`), neutral icons for halal and kosher. | P2 | S |

**Acceptance:**
- `rg -n '60%|200%|300%|halal-certified|Updated daily|verified menu|According to|Association|Celiac Support|Kosher Meat' src/pages/DietaryRestaurants.tsx` and `rg -n 'XP|earn rewards' src/pages/BreweryTrail.tsx` both return nothing.
- Choose Vegan, then Keto, then press Back: the list and h1 show Vegan. `?diet=foo` never renders "undefined".
- `/breweries` makes one extra events request, not one per card.

**Verify:** `npm run test:a11y:axe` (add `/breweries` signed-in and `/restaurants/dietary`), existing `tests/restaurant-dietary-filter.spec.ts`, prerender HTML check of the FAQPage block, `npx impeccable detect src/pages/DietaryRestaurants.tsx`.

---

### WP8: Restaurant detail page

**Goal:** a detail page that never presents a closed place as open, never ships unsafe links, and answers "what's on nearby tonight".

**Files owned:** `src/pages/RestaurantDetails.tsx`, `src/components/RestaurantStatus.tsx`, `src/components/RestaurantMenuSection.tsx`, `src/components/AIWriteup.tsx`, `src/lib/reservations.ts`, `src/lib/__tests__/reservations.test.ts`, `src/hooks/useNearbyListings.ts`, `src/components/NearbyContent.tsx`, new `src/hooks/useTonightNearRestaurant.ts`, new `tests/restaurant-detail.spec.ts`.

**Depends on:** WP3 items 1 and 4.

| # | Item | Pri | Effort |
|---|---|---|---|
| 1 | **Safe external links.** Pass `website`, `reservation_url` and `google_maps_uri` through the existing `toSafeExternalUrl` (`capacitorUtils.ts:134`) inside `resolveReservation`, and use a `safeWebsite` at the top of the page. Covers `:581`, `:601`, `:760`, the sticky CTA (`:1016-1019`), `sameAs` (`:300`) and RestaurantStatus's Website link. Prefix `https://` for bare hostnames before validating. Render nothing when the result is null. | P0 | S |
| 2 | **Closed and merged.** Nothing on the page reads `status` or `is_merged` today. A merged row with `merged_into` does `navigate(replace)` to the survivor's slug. A `permanently_closed` or `temporarily_closed` row shows a plain notice and hides the Reserve, Call and sticky CTAs and the open badge. Permanent closures also get noindex. Related and nearby rails (`:111-145`) add `.neq('is_merged', true)` and exclude closed statuses. | P0 | M |
| 3 | **Dead controls.** "Write Review" (`:626-629`, no handler) becomes `<a href="#reviews">`. The Menu action and chip (`:620-625`, `:637-640`) link to `#menu` only when `useRestaurantMenu` has sections, otherwise to the safe `menu_url` as "Menu (on their site)", otherwise they're hidden. RestaurantMenuSection renders a menu_url fallback card. | P0 | S |
| 4 | **Nearby events that are live.** `useNearbyListings` events branch (`:44-45`): add `.neq('is_merged', true).neq('is_hidden', true).is('archived_at', null).order('date')`. This is shared, so it fixes event and attraction pages too. NearbyContent's `onViewDetails={() => {}}` (`:138`) navigates to the event page. | P0 | S |
| 5 | **Central status from one source.** A single `useRestaurantOpenStatus` hook with a 60s tick feeds both the hero badge (`:147-150`) and RestaurantStatus, via WP3's `resolveOpenStatus(restaurant.hours_json, restaurant.opening)`. `select("*")` already returns `hours_json` when the column exists, so the page adds no column. | P1 | S |
| 6 | **Tonight nearby.** `useTonightNearRestaurant(lat, lng)` runs today's Central-window events in a `PAIR_MAX_MILES` box with the `fetchTonightEvents` filters, then `selectTonightEvents`. Rows use the DinnerBeforeShow style: title, 7:30 PM CT, venue, 0.4 mi, and "walkable" under 0.75 mi. Falls back to the distance rail when nothing is on tonight. | P1 | M |
| 7 | **Honest facts.** `formatPrice` (`:152-155`) returns null for anything but `/^\${1,4}$/`, and the tile is hidden when null. Replace "Call {phone} for reservations" (`:843`) with `resolveReservation(...).detail`. Say "Google rating" instead of "local diners" (`:841`, `:398`). No "N/A" or dash tiles. | P1 | S |
| 8 | **Error is not not-found.** Split `if (error \|\| !restaurant)` (`:203`). On error, show a retry state, call `handleError`, and don't set noindex. | P1 | S |
| 9 | **One hours block.** RestaurantStatus shows a 7-row week with today highlighted and "Opens 11 AM CT tomorrow". Remove the duplicate hours row (`:796-806`), the duplicate Call/Website pair and "Last updated". | P1 | M |
| 10 | **A11y.** Every `<a><Button>` (`:459-464`, `:580-625`, `:996-1001`) becomes `<Button asChild>`. Nav chips and top-bar buttons get `min-h-11`. Badge colours move to `-700` shades. `motion-reduce:animate-none` on the ping (`:527`). | P1 | S |
| 11 | **Craft floor and AI disclosure.** Flat hero fallback (`:505`). Delete the icon-tile stats grid (`:658-695`). Flatten AIWriteup, add `AIDisclosureBadge`, and call it "Our take (AI-assisted)". RestaurantStatus becomes a section, not a nested Card. Drop the cuisine crumb from BreadcrumbList JSON-LD while keeping the visible crumb (`:431`). | P2 | M |

**Acceptance:**
- `reservations.test.ts` shows `javascript:alert(1)` yields no link and `www.x.com` becomes `https://www.x.com/`. `rg -n 'href=\{restaurant.website\}' src/pages/RestaurantDetails.tsx` returns nothing.
- A fixture with `status` `permanently_closed` shows the closed notice with no Reserve/Call and no Open badge. A merged row redirects.
- An archived or hidden event within 2 mi doesn't render, and View Details lands on `/events/...`.
- With PostgREST returning 500, the page shows retry and no noindex.
- axe reports no nested-interactive or contrast violations.

**Verify:** `npm run test:unit` (reservations, tonightPairings), new `tests/restaurant-detail.spec.ts` in the smoke lane with the fixture backend, existing `tests/restaurant-reservations.spec.ts`, smoke `event-detail` (useNearbyListings is shared), `npm run test:a11y:axe`, `npx impeccable detect src/pages/RestaurantDetails.tsx src/components/AIWriteup.tsx`.

---

### WP9: Shared client and schema safety

**Goal:** close the JSON-LD script-breakout paths and stop retry stacking. Both affect every hub, not just this one.

**Files owned:** `src/integrations/supabase/client.ts`, `src/components/schema/MenuSchema.tsx`, `src/components/schema/ItemListSchema.tsx`, `src/components/EnhancedLocalSEO.tsx`, `src/components/SEOHead.tsx`, `scripts/__tests__/json-ld-escape.test.mjs`, new `src/components/schema/__tests__/MenuSchema.test.tsx`.

| # | Item | Pri | Effort |
|---|---|---|---|
| 1 | **MenuSchema escape.** Replace `JSON.stringify` at `MenuSchema.tsx:107` and `:109` with `toJsonLd`. `item_name` and `item_description` are scraped or AI-extracted. Add a test with `</script><img onerror>` in a description. | P0 | S |
| 2 | **Retry stacking.** Add `db: { retry: false }` to `createClient` (`client.ts:57-75`). postgrest-js 2.116 retries GETs 3 times on network error (`index.cjs:65`, `:198-218`), and supabase-js forwards `settings.db.retry` (`supabase-js/dist/index.cjs:682`). TanStack's policy in `queryConfig.ts` then stays the only one. This is a global change, so run every request-budget spec. | P0 | S |
| 3 | **Remaining bare JSON-LD.** `ItemListSchema.tsx:97` (brewery names) and `EnhancedLocalSEO.tsx:359-382` switch to `toJsonLd`. Remove them, and NewRestaurants once WP6 lands, from `BASELINE` in `json-ld-escape.test.mjs`. | P1 | S |
| 4 | **Robots.** An additive `robots` prop on SEOHead that can emit `noindex, follow`. Existing `noindex` callers keep `noindex, nofollow`. | P1 | S |

**Acceptance:**
- `rg JSON.stringify src/components/schema/MenuSchema.tsx` returns nothing, and `json-ld-escape.test.mjs` passes with the entries removed.
- With the backend cut, `/restaurants` shows ErrorState within about 8s. `request-budget` and `home-request-budget` pass with every endpoint at 20 or fewer.

**Verify:** `npm run test:unit`, `node --test scripts/__tests__/json-ld-escape.test.mjs`, smoke `request-budget`, `home-request-budget`, `backend-down`, `npm run validate`.

## Frontend-only now vs needs backend

**Frontend-only now:** everything in WP1-WP9 above. None of it adds a table, column, migration, RPC parameter or edge function, and none of it selects a column that isn't already selected today.

**Needs backend/DB (deferred, needs approval).** Run `npm run check-schema:probe` before any of these, and follow the additive-first deprecation flow in CLAUDE.md.

| # | Change | Why | Compat note |
|---|---|---|---|
| D1 | `get_rotated_restaurants`: add `AND r.is_merged IS NOT TRUE`, and order `status IN ('closed','opening_soon')` last in SQL, then delete `deprioritizeUnvisitable` | The default sort shows merged duplicates and inflates `total_count` (migration 20260902000017:68-76 has no merged predicate), and closed rows sink per page instead of per list | Same signature via CREATE OR REPLACE. Returns fewer rows and adds no parameter. P0. |
| D2 | `open_at timestamptz DEFAULT NULL` param on `get_rotated_restaurants`, evaluating `hours_json` periods (fallback: parsed `opening`) in America/Chicago and excluding `CLOSED_PERMANENTLY`. Then restore the hub Open Now toggle and "Open late" preset. | Real server-side open-now across all rows | Additive and defaulted. Needs migration 20260919000009 applied first. |
| D3 | `city_filter text DEFAULT NULL` and `bbox_*` params on the RPC. Lift `eventAreas.ts` into a shared areas module, `?area=<slug>`, area presets ("East Village night out"), a Cuisines/Areas autocomplete group | Named Des Moines areas replace the address facet | Additive. Keep reading `?location=` for one release. |
| D4 | Drop the `USING (true)` SELECT policy on `brewery_trail_checkins` (`20260228000005_create_brewery_trail.sql:20`), and expose counts via a SECURITY DEFINER RPC | Anon can read every user's timestamped check-ins | RLS tightening. Confirm iOS/Android read only their own rows. **P0 security: ask first, ship soon.** |
| D5 | RPC grouping `search_menu_items(dietary_filter)` by restaurant, and a dietary page that lists tagged dishes | Replaces the keyword ILIKE with menu `dietary_tags` | New RPC, additive. Verify `restaurant_menu_items.dietary_tags` in production. |
| D6 | Apply/verify 20260919000009, then add `hours_json` and `business_status` to list selects, the open-now page and cards, plus a "Hours from Google, checked <fetchedAt>" freshness line | Structured hours are more reliable than free text | A select naming a missing column fails with 42703, so the probe comes first. |
| D7 | Switch `useBreweries` to `.eq('is_brewery', true)` and delete `BREWERY_NAMES` | Name list drift | Only after the probe shows `restaurants.is_brewery`. |
| D8 | Remove `ai_writeup` from the RPC projection | About 300 words per row times 30 rows | Removing a response field needs a check that no shipped binary reads it. P2. |
| D9 | `RESTAURANT_DETAIL_COLUMNS` projection for the detail page, instead of `select("*")` | Stops shipping `search_vector`, `geom` and `writeup_prompt_used` | The projection must list `hours_json` only if the probe shows it, or the detail page 42703s. Gated on D6. |
| D10 | Link published pSEO cuisine pages from the hub directory | Crawlable cuisine landings | Reads `pseo_pages`, which is unverified in production. |
| D11 | XP award trigger on brewery check-in insert, if XP is wanted | Only then restore XP copy | New trigger. |
| D12 | PostGIS RPC for tonight pairings over `geom` | Scale beyond the client-side bounding box | New RPC. |

## Rejected

- **Interim "open now on this page" client-side filter** (results agent): a 30-row partial result presented as "open now" is its own misleading claim. The link to `/restaurants/open-now` was adopted instead.
- **"Hours coming soon" label for Open Now** (filters agent): leaves a dead control on the hub.
- **Neighborhood polygons, a new `neighborhood` column and a `knownVenues.ts` change** (holistic): superseded by the existing, tested `eventAreas.ts` bboxes (D3).
- **"Switch the facet to `city` now" as frontend-only** (holistic): the default path is the RPC, which has no city parameter, so it's backend work (D3).
- **"RestaurantOpenings reads a `restaurant_openings` table via `useRestaurantOpenings.ts:45`"** (SEO agent): the hub imports the `useSupabase.ts` version (`RestaurantOpenings.tsx:19`), which queries `restaurants` (`useSupabase.ts:158-160`).
- **"Open-now never reaches past letter C" / "past letter M"** (holistic, open-now agent): the exact cutoff wasn't verified. The verified claim is "first 100 by name" (`OpenNowRestaurants.tsx:60-64`).
- **Dropping `ai_writeup` from the RPC as a P0** (results agent): it's a performance item that needs a mobile compatibility check. Deferred as D8 at P2.
- **Cuisine colour palette for map pins** (map agent option): status colours carry decision value, and a 30-cuisine palette doesn't.
- **Holiday notice table on open-now** (open-now agent): it needs a hand-maintained date list for a one-line hint. Low leverage next to fixing the evaluator.
- **Holistic's "Tonight" strip as needs-backend** (v1): `useTonightPairings` already does this client-side on the home page, so the hub reuses it (WP1 item 7). Only the PostGIS scale-up is deferred (D12).
- **Detail page `hours_json`-first status as a P0** (detail agent): the column may not exist in production (`business_claims.sql:283`). Kept as P1 via `resolveOpenStatus`, which uses it only when present.
