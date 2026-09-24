# Events plan (`/events` hub, its landings, and event detail)

Coordinator output, 2026-09-24. Built from one holistic audit and seven section audits (hub filters, results and cards, map, SEO and directory, date/audience landings, near me, event detail). Every P0 was re-opened at its cited line before it was accepted. Claims that didn't hold, or that were downgraded, are under **Rejected**.

Entry: `src/pages/EventsPage.tsx`. Routes: `/events`, `/events/today`, `/events/this-weekend`, `/events/free`, `/events/kids`, `/events/date-night`, `/events/near-me`, `/events/<month>-<year>`, `/events/<suburb>`, `/events/:slug`.

## Where it stands

- The hub can't answer "what's on tonight". `events.date` is TIMESTAMPTZ (`20250100000000_baseline_tables.sql:15`), yet Today/Tomorrow run `.eq("date", "<UTC yyyy-mm-dd>")` (`EventsPage.tsx:350,353`), the single-date filter is an always-true OR (`:334-336`), and "This Weekend" is Sat-Sun and skips to next week on a Sunday (`:361-366`). The landing page for the same label uses Fri-Sun Central.
- The list misstates itself. "Load More" swaps page 1 for page 2 (`:318`, `:941`), the header prints the page length as the total (`:862`), and any event with no price is badged and filtered "Free" (`SocialEventCard.tsx:111`, `EventsPage.tsx:68,403`, `FreeEvents.tsx:76`).
- Paid sponsored placement never fires on the hub: the select at `EventsPage.tsx:292` omits `is_sponsored`/`sponsored_until`, while `EVENT_LIST_COLUMNS` (`src/lib/listColumns.ts`) carries both.
- Controls that look finished return nothing or the wrong thing: "Free This Weekend" loses its price half (react-router 6.30.4 runs each `setSearchParams` updater against render-time params, `node_modules/react-router-dom/dist/index.js:1031`), and "Food & Drink" / "Art & Culture" / lowercase "For you" ids match no canonical category. Near-me map pins link to `/events/<uuid>` (`EventsNearMe.tsx:74`), which 404s. Esc wipes every filter (`useFilterKeyboardShortcuts.ts:77-82`).
- Event detail serializes scraped descriptions into prerendered HTML with bare `JSON.stringify` (`EnhancedEventSEO.tsx:248-249`, baselined as a known offender in `json-ld-escape.test.mjs:87`), renders a backend error as "Event Not Found" plus noindex (`EventDetails.tsx:61`), and calls an event starting tonight "Tomorrow" (`:207-208`).

## What makes it ours

These are the bets this plan adopts. Each uses data or code the app already has.

1. **The right clock, everywhere.** One Central-time window helper drives the hub, every landing, the map colours and the detail badge, so "tonight", "this weekend" and "August" mean the same set on every page. Today there are four different definitions. Nobody notices this until they're standing outside a closed venue.
2. **"Tonight in Des Moines" strip on the hub.** Starting in the next 3 hours plus happening now (multi-day events via `end_date`), reordered by the weather verdict with a one-line reason. It reuses `useWeather`, `reorderForWeather` and `useEventIndoorFlags` from `EventsToday.tsx:102-116`; the indoor hook already degrades when `is_indoor` is missing (`useEventIndoorFlags.ts:54-63`). Eventbrite and Catch Des Moines show static lists.
3. **A list you read like a local calendar.** Results grouped under Central-day headers ("Tonight", "Tomorrow", "Saturday, Sep 27"), and each card leads with "7:30 PM CT - Wooly's - East Village" before the poster. Neighbourhood filters (East Village, Court Ave, Valley Junction, Ingersoll) join the suburbs.
4. **Dinner before the show.** On event detail, up to 3 restaurants within 1.5 mi that are open 90 minutes before the start, built on `src/lib/tonightPairings.ts` (`PAIR_MAX_MILES`, `DINNER_LEAD_MINUTES`), which only the home rail uses today. Yelp and Eventbrite each hold one half of that answer.
5. **Near me, tonight, from a place you pick.** A time window on near-me and an origin picker (Downtown, Ankeny, Valley Junction...) so a visitor who denies location still gets "1.2 mi from Downtown", not a distance from nowhere.
6. **Honest by construction.** Unknown price is "price not listed", never "Free". No unsourced statistics. Every FAQ sentence is checkable on the page, and the hub shows when its list was last updated.

Cut from the bets: a "Popular this week" rail from `trending_score` (population unverified, see Deferred D6) and a per-card "dinner nearby" line on the hub (one request per page needs a bbox query shape we don't have yet; revisit after bet 4 ships).

## How the packages avoid edit conflicts

**WP0 lands first, alone.** It adds the shared helpers every other package imports and changes no page.

After WP0, WP1 through WP9 own disjoint files. **Only WP1 edits `src/pages/EventsPage.tsx`.** WP2, WP3 and WP4 ship components and hooks with the props WP1 needs; each PR names its mount point and WP1 wires it. **WP1 also owns lane registration** (`playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`): other packages write their specs as new files and WP1 adds them to the smoke lane, so `npm run check-e2e-lanes` stays green (WEB-CI-028).

**Cross-plan overlap with `docs/page-plans/home.md`.** Home WP3 owns `src/lib/listColumns.ts` and `src/hooks/useEvents.ts`; home WP4 owns `src/components/AdBanner.tsx`. This plan makes one additive line change to `listColumns.ts` (WP0 item 3) and must rebase on home WP3 if that lands first. It doesn't edit `useEvents.ts` (WP8 uses a new hook instead). The AdBanner 32px CTA (`AdBanner.tsx:150`) is handed to home WP4.

---

## WP0: Shared helpers (sequential, lands first)

**Goal:** one definition each of "Central day/weekend/month", "free", "visible event" and "area", with tests.

**Files:** `src/lib/timezone.ts`, new `src/lib/eventPrice.ts`, new `src/lib/eventAreas.ts`, new `src/lib/eventQuery.ts`, new `src/content/eventsCopy.ts`, `src/lib/listColumns.ts` (one line, see cross-plan note), `src/hooks/useUrlFilters.ts`, new tests under `src/lib/__tests__/`.

1. **P0 / M. `centralWindow(preset, now)`.** Returns UTC ISO `{ start, end }` for `today`, `tomorrow`, `this-weekend`, `this-week`, `single(date)`, `range(from, to)`, and `month(year, month)`. Move `weekendWindow` out of `EventsThisWeekend.tsx:60-79` and reuse the `toZonedTime`/`fromZonedTime` pattern from `EventsToday.tsx:80-86` and `centralDayStartUtcISO` (`timezone.ts:273-289`). Weekend is Fri 00:00 to Sun 23:59:59.999 CT, and on Fri/Sat/Sun it is the current weekend. Add `centralHour(instant)` and `upcomingFloorUtc(now)` (start of today CT).
2. **P0 / S. `isFreePrice(price)` and `FREE_PRICE_FILTER`.** Free only when the text says free, `$0` or `0`; null or empty returns `null` (unknown), not true. Export the PostgREST OR string (`price.ilike.%free%,price.eq.$0,price.eq.0`) so no caller writes `price.is.null` again.
3. **P0 / S. Projection.** Add `end_date` to `EVENT_LIST_COLUMNS` (column added by `20260316000002_add_event_end_date.sql:6`). Do **not** add `time_tbd` until `npm run check-schema:probe` reports it present in production: it arrives in `20260902000016`, after the 2026-08-24 snapshot, and an absent column blanks every events surface with 42703 (the warning at `listColumns.ts` above `EVENT_LIST_COLUMNS`). Fix that same comment, which says `archived_at` is never on `events`; `20260823000007_events_archived_at.sql:34` adds it and the hub filters on it.
4. **P0 / S. `applyEventVisibility(query)`** in `eventQuery.ts`: the `is_merged`/`is_hidden`/`archived_at` predicates from `EventsPage.tsx:294-298`, plus `filterVisibleIds(ids)` (one `.in('id', ids)` query with those predicates) for RPC results that can't be trusted yet (near-me, see D1).
5. **P0 / S. `useUrlFilters.setMany`** takes per-key defaults so a preset writes category, price and date in one navigation (`useUrlFilters.ts:76-96` today strips no defaults).
6. **P1 / S. `eventAreas.ts`.** One table of `{ slug, label, kind: 'city' | 'bbox', city?, bbox? }`: Des Moines (city, exact), West Des Moines, Ankeny, Urbandale, Clive, Johnston, Altoona, Windsor Heights (the FAQ at `EventsPage.tsx:1051` already promises the last three), and bboxes for East Village, Downtown/Court Ave, Valley Junction and Ingersoll. Check each bbox against a sample of known-venue coordinates from `supabase/functions/_shared/knownVenues.ts` before committing it.
7. **P2 / S. `EVENTS_UPDATE_CADENCE`** in `src/content/eventsCopy.ts` ("collected daily"), so the hub, Today and Weekend FAQs stop contradicting each other (`EventsToday.tsx:150`, `EventsThisWeekend.tsx:192`).

**Acceptance:** at a fixed clock of 2026-09-25T02:00Z (Thu 9pm CDT), `today` is Sep 24 CT and `this-weekend` is Fri Sep 25 to Sun Sep 27 CT; on a Sunday it is the current weekend; the DST days in March and November produce 23h and 25h windows. `isFreePrice` covers `null`, `''`, `'Free'`, `'FREE admission'`, `'$0'`, `'$0-$25'`, `'$15'`.

**Verify:** `npm run test:unit`, `npm run validate`.

---

## WP1: Hub page (sole owner of `EventsPage.tsx` and the lanes)

**Goal:** the hub returns the right events, says how many there are, and shows one on a phone's first screen.

**Files:** `src/pages/EventsPage.tsx`, new `src/components/events/TonightStrip.tsx`, new `src/components/events/DayGroupedList.tsx`, new specs `tests/events-hub-dates.spec.ts` and `tests/events-hub-list.spec.ts`, lane files (`playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`).

1. **P0 / M. Central dates.** Replace every date bound at `:293` and `:331-385` with `centralWindow` bounds on `.gte/.lt`. The upcoming floor becomes `or(date.gte.<startOfTodayCT>,end_date.gte.<now>)` so the State Fair stays listed after day one. Delete `computePresetRange` (`:95-119`) and derive the chips and the query from the one helper. Store a custom date as `?from=`/`?to=`, render a chip for it, and pass `isActive` to the Date pill.
2. **P0 / S. Projection and sponsorship.** Replace the inline select at `:292` with `EVENT_LIST_COLUMNS`. Call `arrangeSponsored` on page 1 only, and never give a sponsored row the automatic col-span-2 card at `:930` (item 8 removes that card anyway).
3. **P0 / M. Append, and count honestly.** Move the list to `useInfiniteQuery` and render `pages.flat()`; ask for `count: 'exact'` on the first page only; `placeholderData: keepPreviousData`. Header, inline summary (`:803`) and the live region read "30 of 412 events". Drop `aria-live` from `:861` so the count is announced once. Keep `?page=N` as a deep link that loads pages 1..N.
4. **P0 / S. Price.** Server filter uses `FREE_PRICE_FILTER`; delete `filterEventsByPrice` (`:63-76`) and the null-is-free rule. The numeric ranges disappear from the options (WP2) until D2 lands, because filtering them after pagination produces 2-card pages with a Load More button.
5. **P0 / S. Presets and Esc.** `handleEventPreset` (`:625-633`) writes through `setMany` in one navigation; the Tonight preset sets `today` instead of toggling it (`:227-228`). Stop passing `onClearFilters` to the Esc path (WP2 changes the hook).
6. **P0 / S. Near-me visibility (interim).** After the RPC at `:252-283`, drop ids that fail `filterVisibleIds`, apply the active `centralWindow` to the returned rows, and use `isFreePrice`. This stops hidden and merged events dead-ending on "Event Not Found" until D1 lands. Put near-me in the URL as `?near=1` (coordinates stay in memory), and have the chip clear both state values (`:525`).
7. **P0 / S. Location.** Build the filter from `eventAreas.ts`: `city.eq` for cities, `latitude`/`longitude` `gte/lte` for bboxes. "Des Moines" no longer matches West Des Moines (`:388-397`). Chips print labels, not slugs (`:519`, `:522`).
8. **P1 / M. First screen on a phone.** Flat surface-token hero with no gradient or blur blobs (`:660-664`), `py-6` on mobile. h1, search, then one horizontally scrolling chip row: Tonight, This weekend, Free, Near me, Filters (opens WP2's sheet). Remove the `DATE_PRESETS` row (`:716-731`) and `SmartFilterChips` (`:831-838`); the Category control covers it and the chips returned zero rows anyway. Move the `top_banner` ad below the sixth card. List/map becomes a segmented control in the results header with `aria-pressed`, backed by `?view=map` (default `list`, so existing URLs don't change). Mount WP2's sticky bar.
9. **P1 / M. Tonight strip (bet 2).** `TonightStrip` renders above the grid when no filters are active: events with `event_start_utc` in `[now, now+3h]`, then ongoing ones (`start < now <= end_date`), reordered by `reorderForWeather` when `hasVerdict`, with the reason line. Relative time label from WP3. Hidden when empty, never an empty state.
10. **P1 / M. Day-grouped list (bet 3).** When sort is `date_asc`, `DayGroupedList` renders sticky Central-day headers. Delete the Featured block and its dead `/events?featured=true` link (`:884-912`; nothing reads that param); `is_featured` stays a card badge. Remove the index-0 hero card. At most 3 `priority` images (today featured(3) plus grid(3), `:901`, `:925`).
11. **P1 / S. Error and empty states.** Render errors inline in the results area with Retry, keeping hero and filters mounted; keep `NoIndexMeta` only when page 1 fails (`:592-622`). Empty state: one relaxation button built from count-only HEAD queries (drop category, then date), plus a link to `/events/this-weekend`. Remove the duplicate "Browse All" action (`:959-977`).
12. **P1 / S. SEO and FAQ truth.** `NoIndexMeta` when a search query is present or the category isn't canonical; build `seoTitle` from `debouncedSearchQuery` and a whitelisted category label (`:530-534`). Replace the inline ItemList (`:540-581`, which carries `mainEntity` and `provider`, neither valid on ItemList) with `buildEventItemList` in a `useMemo`, organic order, omitted when filtered. Render `ListFreshness` under the count so "Each list shows the date it was last updated" (`:1055`) becomes true. Fix the Free answer (`:1035`) to match WP5, add FAQ `links` (this weekend, today, free, kids, near-me, suburbs from `SUBURBS`), and rename the h2 at `:993` to "About this events calendar" with a link to `/things-to-do`.

**Acceptance:** at 20:30 CDT on a Saturday, `?preset=today` lists that night's 21:00 show; `?preset=this-weekend` returns the same ids as `/events/this-weekend`; a picked date returns only that Central day. "Free This Weekend" produces `?price=free&preset=this-weekend` in one history entry. After Load More, 60 cards render and card 1 is unchanged. A fixture row with `is_sponsored=true` and a future `sponsored_until` renders first with the badge; an expired one doesn't. No event id renders twice. At 390x844 the first `SocialEventCard` top is under 560px.

**Verify:** `npm run validate`; new specs on `tests/support/fixtureBackend.ts` with more than 30 rows, added to the smoke lane; existing `search-filters`, `url-filter-state`, `sticky-filter-chips`, `touch-targets`, `page-headings`, `request-budget` specs; `npx impeccable detect src/pages/EventsPage.tsx`; Rich Results Test on the prerendered `/events`.

---

## WP2: Filter controls

**Goal:** every control sets a value the query can match, and each filter dimension has exactly one control.

**Files:** `src/components/EventInlineFilters.tsx`, `src/components/EventSmartPresets.tsx`, `src/components/SmartFilters.tsx`, `src/components/filters/ActiveFilterChips.tsx`, `src/components/SortDropdown.tsx`, `src/components/SaveSearchButton.tsx`, `src/components/SearchAutocomplete.tsx`, `src/hooks/useFilterKeyboardShortcuts.ts`, new `src/components/events/EventFiltersSheet.tsx`, new `src/components/events/EventsStickyBar.tsx`, new `src/lib/__tests__/eventPresets.test.ts`.

1. **P0 / S. Canonical presets.** Presets use `Food` and `Arts` from `EVENT_CATEGORIES` (not "Food & Drink" / "Art & Culture", `EventSmartPresets.tsx:26,42` in the filters object). Date Night links to `/events/date-night` instead of faking a category. Derive the ON state from props (the URL), not `useState` (`:84`), so Clear all and Back turn it off. "Tonight" description says "Tonight", not "Happening now".
2. **P0 / S. Esc.** Remove Escape-clears-all (`useFilterKeyboardShortcuts.ts:77-82`). Esc in the search box clears only `q`, and only when the autocomplete is closed; return early on `e.defaultPrevented` or an open Radix layer.
3. **P0 / S. Options.** `PRICE_OPTIONS` (`EventInlineFilters.tsx:28-35`) shows Any and Free only until D2. `LOCATION_OPTIONS` (`:37-44`) comes from `eventAreas.ts`.
4. **P1 / M. Filters sheet and sticky bar.** `EventFiltersSheet` (bottom `Sheet`) holds category, area, price, date and sort. `EventsStickyBar` is one row on mobile: total count, Filters button, sort, scrolling chips. Save search visible at all widths; its auth redirect keeps the current path and query (`SaveSearchButton.tsx:55`).
5. **P1 / S. Targets and state.** Chip remove (`ActiveFilterChips.tsx:38-44`, about 16px), Clear all (`:50`, h-7), sort trigger (`SortDropdown.tsx:26`, h-9) and category options (`EventInlineFilters.tsx:116-139`) reach 44px; `aria-pressed` on toggles and options. If WP1 removes the only `SmartFilterChips` mount and nothing else imports it, delete the component instead of fixing its non-focusable Badge divs (`SmartFilters.tsx:124-136`).
6. **P1 / S. Lazy date picker.** `React.lazy` the `InteractiveDateSelector` import (`EventInlineFilters.tsx:11`) inside the Date popover.
7. **P1 / S. Autocomplete.** Open on focus or input only (`SearchAutocomplete.tsx:150-154`). Event suggestions navigate to `/events/<slug>` via `createEventSlugWithCentralTime` (select `date`, `event_start_utc`, `event_start_local`). Add a Venues group (distinct `venue` ilike, limit 3). Apply `applyEventVisibility`, and escape `%` and `_` in the term.

**Acceptance:** `eventPresets.test.ts` asserts every preset category is in `EVENT_CATEGORIES`. With category, price and date set, Esc-closing each popover, the sort select and the Save dialog leaves the URL unchanged. Loading `/events` with saved recent searches shows no dropdown until focus. `react-day-picker` is absent from the EventsPage chunk.

**Verify:** `npm run test:unit`; `npm run build:analyze`; `touch-targets` and `search-filters` smoke specs; axe lane.

---

## WP3: Event card and social batch

**Goal:** the card says what it knows, in the order a local reads it, without an N+1.

**Files:** `src/components/SocialEventCard.tsx`, `src/hooks/useBatchEventSocial.ts`.

1. **P0 / S. Price.** `isFree` becomes `isFreePrice(event.price) === true` (`SocialEventCard.tsx:111`); a null price renders a muted "Price on listing" or nothing, never the green Free badge (`:253-256`).
2. **P1 / S. Stretched link.** Put the `<Link>` on the h3 with an inset `::after`, drop the replacing `aria-label` (`:136-143`), move Favorite, Add to Calendar and Share out of the anchor (`:323-338`), and delete the fake "View Details" span (`:317-322`).
3. **P1 / S. Time and place first.** First text line "7:30 PM CT - Wooly's - East Village" (area from `eventAreas.ts` bbox), then the title. Optional `relativeStart` prop ("starts in 40 min") for WP1's strip.
4. **P1 / S. Batch.** Run the three queries with `Promise.all`; select only `event_id` from `event_attendees` and `event_id,total_checkins,current_attendees` from `event_live_stats`; drop the `event_discussions` query (the card never reads it, `useBatchEventSocial.ts:39-57`); drop `user?.id` from the key (`:31`); on error return an initialized empty map, not `{}`, so cards don't fall back to per-card fetches (`:140-142`, `SocialEventCard.tsx:70`).

**Acceptance:** a fixture with `price: null` shows no Free badge. The axe lane reports no nested-interactive violation on `/events`. Social requests for 30 cards start in parallel and return no `user_id` or message text; a forced batch error triggers no per-card `event_attendees` requests.

**Verify:** `request-budget` smoke spec; axe lane; `/events/today`, `/events/free`, `/events/kids` render the same card.

---

## WP4: Map view

**Goal:** a map of every matching event in Des Moines that you can read and scroll past.

**Files:** `src/components/EventsMap.tsx`, new `src/hooks/useEventsMapData.ts`.

1. **P1 / M. Full scope.** `useEventsMapData(filters)` runs only in map mode, uses `applyEventVisibility` and the same `centralWindow`/area/category predicates as the list, selects id, title, times, venue, price, category, lat/lng, `.not('latitude','is',null)`, cap 500, no pagination. WP1 hides Load More in map mode.
2. **P1 / S. Missing coordinates.** Line above the map: "42 of 57 on the map - 15 have no mapped location (show as list)". Empty set renders an empty state with a list button, not a bare map (`EventsMap.tsx:45-47`).
3. **P1 / S. Central-day colours.** Replace the millisecond diff (`:9-18`) with Central calendar-day comparison on `event_start_utc ?? date`.
4. **P1 / M. Venue pins.** Group events sharing lat/lng into one venue pin whose popup lists them all; drop `permanent` tooltips (`:69`). No new dependency.
5. **P1 / S. Icons.** Four `L.divIcon` inline-SVG pins built once at module scope using colour tokens, replacing the hotlinked `raw.githubusercontent.com` / `unpkg` PNGs rebuilt per render (`:23-24`, `:61`). A glyph in each pin so colour isn't the only signal; a legend above the map; tooltip text on the foreground token (orange on white at `:70` is about 2:1).
6. **P1 / S. Scroll and fit.** `scrollWheelZoom={false}`, one-finger drag off on touch with a two-finger hint, `h-[60vh] min-h-[320px]` instead of `h-[600px]`. `fitBounds` to the results, including a "You" marker when WP1 passes `userLocation`.
7. **P1 / S. Popup and names.** Popup: title link, Central date and time, venue, price (text nodes only), 44px link. Marker `alt`/`title` of "<title>, <date>" instead of Leaflet's "Marker"; `aria-label` on the map section.

**Acceptance:** with no filters, pin count equals a PostgREST count with the same predicates (less rows without coordinates, which the line reports). No requests to `raw.githubusercontent.com` or `unpkg.com`. On 375x667 a vertical swipe on the map scrolls the page. axe reports no contrast violation in map view.

**Verify:** manual on `/events?view=map`; axe lane; `npm run build:analyze` (the map stays in its own chunk, `vite.config.ts:320`).

---

## WP5: Date and audience landings

**Goal:** Today, Weekend, Free, Kids, Date Night and month pages share one query path and stop publishing claims nobody checked.

**Files:** `src/pages/EventsToday.tsx`, `src/pages/EventsThisWeekend.tsx`, `src/pages/FreeEvents.tsx`, `src/pages/KidsEvents.tsx`, `src/pages/DateNightEvents.tsx`, `src/pages/MonthlyEventsPage.tsx`, new `src/hooks/useEventLanding.ts`.

1. **P0 / S. Month window.** `MonthlyEventsPage.tsx:72-73` bounds a timestamptz on bare dates, dropping the last evening of each month and pulling in the previous month's. Use `centralWindow(month)`.
2. **P0 / S. Free means free.** Drop `price.is.null` from `FreeEvents.tsx:76` (use `FREE_PRICE_FILTER`); every "free" stat uses `isFreePrice` (`EventsToday.tsx:260`, `MonthlyEventsPage.tsx:242`, `KidsEvents.tsx:75-77` each define it differently today).
3. **P0 / S. Remove unsourced claims.** `FreeEvents.tsx:118,204,208,273` and `DateNightEvents.tsx:119,212` ("According to...", "500 free events annually", "guarantee free entry", "top 10 U.S. cities"). Replace with numbers from the fetched rows, following the KidsEvents rewrite (SEO-014, `KidsEvents.tsx:79-85`). FAQ cadence from `EVENTS_UPDATE_CADENCE`.
4. **P0 / S. Date Night clock.** Move the fetch to `useQuery` so the prerenderer sees it (WEB-SEO-031), compute "Evening only" with `centralHour` (`DateNightEvents.tsx:97-101` uses the runtime zone), and exclude untimed rows from the evening bucket.
5. **P1 / M. `useEventLanding`.** One hook: `EVENT_LIST_COLUMNS`, keys under `queryKeys.events.list(...)` (today `['events-weekend']` and `['monthly-events', slug]` escape admin invalidation), floor at start of today CT instead of `now` (`FreeEvents.tsx:75`, `KidsEvents.tsx:61`, `DateNightEvents.tsx:54`), `applyEventVisibility` (FreeEvents skips it today). Kids and Date Night gain `ListFreshness`.
6. **P1 / M. Grouping (bet 3).** Today: Happening now / This afternoon / Tonight. Weekend: Friday / Saturday / Sunday h2s with counts and a jump nav. Month: week headings. Weather reordering stays inside each group. Replace the "Locations" stat (it counts street addresses) with "Starting after 5 PM".
7. **P1 / S. Context-preserving links.** Overflow links go to `/events?preset=this-weekend` (with category), `?preset=today`, `?price=free`. Free and Kids get the same render cap plus link.
8. **P1 / S. Chips and month nav.** Weekend and Date Night chips: `role="group"`, `aria-pressed`, `min-h-11`, backed by `useUrlFilters`. Month prev/next as `<Button asChild><Link>` so crawlers follow them, h1 on its own row, lowercase slug in the canonical (`MonthlyEventsPage.tsx:154`). Weekend sub-heading date (`EventsThisWeekend.tsx:267`) rendered after hydration or from the rows, not the build clock.
9. **P1 / S. Tighter audience matching (interim).** Kids drops description-level `%family%` and bare `%kid%`; Date Night drops `title.ilike.%night%`; both use word-boundary `imatch`. The durable fix is D4.
10. **P2 / S. Craft floor.** Flat tinted surfaces instead of the gradients at `FreeEvents.tsx:213`, `KidsEvents.tsx:198`, `DateNightEvents.tsx:221`; no emoji headings; titles from `BRAND.name`.

**Acceptance:** an event at 2026-08-31 20:00 CDT appears on `/events/august-2026` and not September's. A null-price row is absent from `/events/free`, and the free count for one set of rows matches on every landing. `rg -n "According to" src/pages/FreeEvents.tsx src/pages/DateNightEvents.tsx` returns nothing. With `TZ=UTC` and `TZ=America/Los_Angeles`, a 12:00 CDT event is excluded from "Evening only" and a 19:30 CDT event included. Prerendered `/events/date-night` contains cards, not a skeleton.

**Verify:** `npm run test:unit`; `route-smoke`, `touch-targets`; `npx impeccable detect` on the three pages; inspect prerendered HTML after `npm run build`.

---

## WP6: Near me and suburb pages

**Goal:** near-me works from a tap in BottomNav, links resolve, and suburb pages fetch their suburb.

**Files:** `src/pages/EventsNearMe.tsx`, `src/hooks/useProximitySearch.ts`, `src/pages/EventsByLocation.tsx`, new `src/lib/nearMeOrigins.ts`.

1. **P0 / S. Map pin links.** `slug: event.id` (`EventsNearMe.tsx:74`) becomes `createEventSlugWithCentralTime(event.title, event)`.
2. **P0 / S. Visibility (interim).** Filter RPC results through `filterVisibleIds` until D1 lands.
3. **P0 / S. Categories.** Options from `EVENT_CATEGORIES` (`:179-185` offers "Arts & Culture"). Raise `search_limit` to 200 so the client-side category filter after LIMIT isn't starved by featured-first ordering, and say "Showing the nearest N" when the limit is hit (`:215`).
4. **P1 / M. `useQuery`.** Rewrite `useEventsNearby` (`useProximitySearch.ts:44-117`) on `useQuery` keyed on rounded lat/lng, radius, category and window; drive it from the slider's `onValueCommit` (`EventsNearMe.tsx:159` fires per tick). Gate the empty state on `isFetched` so first paint doesn't say "No events found".
5. **P1 / M. Time window (bet 5).** Tonight / This weekend / Next 7 days / Anytime, default Next 7 days, `?when=` in the URL, filtered with `centralWindow` on the client until D1's v2 takes the window. Cards show start time next to distance.
6. **P1 / M. Origin picker (bet 5).** Centroids in `nearMeOrigins.ts`. Distances read "from Downtown" when the browser didn't supply the origin. Persist only the place name via `storage.set('nearMeOrigin', ...)`. One inline denial message; drop the destructive toast (`:54-62`).
7. **P1 / S. Location privacy.** Round to 2 decimals before the key and RPC; replace the coordinate readout (`:104`) with "Near your current location"; remove the accuracy badge; `enableHighAccuracy: false` (`useProximitySearch.ts:241`); one line saying the location isn't saved.
8. **P1 / S. Suburb pages.** `EventsByLocation.tsx:76-101` downloads every upcoming event and substring-matches in JS; filter server-side on `city`/`location`/`venue` from `searchTerms` with `applyEventVisibility`, via `useQuery`. Restaurants: filter before `.limit` (`:124-141`), remove the blanket "Local Favorite" star (`:420-423`), swap `<a href>` for `<Link>`.
9. **P1 / S. Names.** `aria-label` and `aria-valuetext` on the radius slider, `htmlFor` on the category label, `aria-pressed` on List/Map, `role="status"` on the results line.
10. **P2 / S. Zero distance.** `distance_meters != null` and `?? Infinity` (`useProximitySearch.ts:88-90`, `:267`); one distance formatter.

**Acceptance:** every map popup href equals the list card href. A fixture with `is_hidden=true` inside the radius never renders. Dragging the slider end to end sends at most 2 RPCs. A visitor who denies location can pick Ankeny and reads "mi from Ankeny". `/events/ankeny`'s response holds only Ankeny rows and no hidden ones.

**Verify:** a new `tests/events-near-me.spec.ts` on `fixtureBackend` (RPC shape per its contract), registered by WP1; axe on `/events/near-me`; network panel.

---

## WP7: Directory, cross-vertical links, Waukee

**Goal:** the bottom of the hub sends people somewhere useful, including off the events vertical.

**Files:** `src/components/seo/EventsHubDirectory.tsx`, `src/components/seo/MonthLinks.tsx`, `src/components/seo/HubArticles.tsx`, `src/hooks/useVenues.ts`, `.github/select-star-baseline.json`, `src/lib/suburbs.ts`, `src/App.tsx`, `scripts/prerender-routes.mjs`, the sitemap generator that lists suburb routes.

1. **P1 / S. Plan around it.** A group linking `/things-to-do`, `/restaurants/open-now`, `/stay`, `/attractions`, `/playgrounds`; pair each suburb pill with its neighbourhood guide where `hasNeighborhoodGuide()` is true.
2. **P1 / S. Targets and landmarks.** Pills to `inline-flex min-h-11 items-center px-4` (about 34px today, `EventsHubDirectory.tsx:43-44`, `MonthLinks.tsx:87`); one `<nav aria-label="Browse Des Moines events">` with section h3s instead of five or six navs.
3. **P1 / M. Waukee.** Add `waukee` to `SUBURBS`, the route, prerender routes and sitemap; build the directory's suburb list from `SUBURBS` instead of the literal at `EventsHubDirectory.tsx:31-39`.
4. **P2 / S. Lighter below-fold queries.** `useVenueLinks()` selecting `slug, name` (and remove `useVenues.ts:28` from the select-star baseline); HubArticles fetches 40 rows or matches server-side instead of 100 (`HubArticles.tsx:22-31`).

**Acceptance:** `/events` links resolve in `route-smoke`; `touch-targets` passes on `/events` at 375px; `/events/waukee` renders `EventsByLocation` with a canonical; the inventory check passes.

**Verify:** `npm run validate`; `route-smoke`; `node scripts/check-neighborhood-inventory.mjs`.

---

## WP8: Event detail

**Goal:** the detail page is safe to prerender, tells the truth about time, and helps plan the evening.

**Files:** `src/pages/EventDetails.tsx`, `src/components/EnhancedEventSEO.tsx`, `scripts/__tests__/json-ld-escape.test.mjs`, `src/hooks/useEventBySlug.ts`, new `src/lib/eventTiming.ts`, `src/lib/eventSchema.ts`, `src/lib/tonightPairings.ts` (new export only), `src/components/NearbyContent.tsx`, new `src/hooks/useRelatedEvents.ts`, `src/components/EventHotelCallout.tsx`, `src/components/EventCheckIn.tsx`, `src/components/EventPhotoUpload.tsx`, new tests.

1. **P0 / S. Escape JSON-LD.** Both `JSON.stringify` calls at `EnhancedEventSEO.tsx:248-249` become `toJsonLd` (`src/lib/jsonLd.ts`); remove the file from `BASELINE` (`json-ld-escape.test.mjs:87`); delete the unused locals at `:91-100`.
2. **P0 / S. UUID and stale slugs.** In `fetchEventBySlug`, a UUID-shaped slug queries `.eq('id', slug)` with the visibility predicates; a dated slug with no exact title match but exactly one candidate in the window returns it. `EventDetails` redirects (`<Navigate replace>`) to the canonical slug when it differs. This rescues push taps, favorites and emails that build `/events/<uuid>` (WP9, D9).
3. **P0 / S. Errors aren't 404s.** Read `error` and `refetch` from the hook (`EventDetails.tsx:61` drops them); render "We couldn't load this event" with Retry, no robots meta, reported through `handleError`. Noindex stays only for a successful null.
4. **P0 / S. `eventTiming.ts`.** Day difference from Central calendar dates (today `Math.ceil` makes "Today" unreachable, `:207-208`); `isOver` from `end_date`, else start+3h, else end of the Central day when untimed; `isHappeningNow` with a badge; calendar, reminders and hotels stay until `isOver` (`:185` uses the start instant). "Time TBA" when `!hasSpecificTime`. Fixed-clock unit tests.
5. **P1 / S. Honest ticket CTA.** One `ticketUrl` that must pass `isHttpUrl`; "Get tickets" only when not free and a price exists, else "Event website", in the sticky bar and inline (`:390`, `:501`, `:709-715`). `offers.url` skips a broken `source_url` (`eventSchema.ts:164`). ShareDialog gets the canonical `eventUrl` (`:408`).
6. **P1 / M. Before the show (bet 4).** Export `pickDinnerBeforeShow(event, restaurants, now)` from `tonightPairings.ts` (additive; home WP10 reads the file). Up to 3 restaurants within `PAIR_MAX_MILES` open at start minus `DINNER_LEAD_MINUTES`, shown under the actions row for timed upcoming events with coordinates; distance-only `NearbyContent` stays as the fallback.
7. **P1 / M. Related rails.** `useRelatedEvents` fetches same-category upcoming events once the event resolves (limit 4, no count, excluding this id) instead of filtering the 50 soonest site-wide (`:68`, `:89-97`), shown at 1 or more. Replace "More Events in Des Moines" with "Also that night nearby" (same Central date, about 2 miles), hidden when empty.
8. **P1 / S. Getting there.** Coordinates from event, else matched venue (`venuePage`), for the map and directions; with neither, a Maps search link from venue, location and city. Show `venuePage.address`. Link `/getting-around` for downtown venues.
9. **P1 / M. Defer and dedupe.** `React.lazy` plus in-view mounting for EventCheckIn, EventPhotoUpload, RatingSystem and EventReminderSettings (fixed-height fallbacks for CLS); check-in and reminders only while upcoming. One hotel section: `EventHotelCallout` falling back to `NearbyHotels`, gated on upcoming. `EventCheckIn` on `useQuery`.
10. **P1 / S. One fact list.** Replace the icon-tile grid (`:313-386`) and "Things To Know" (`:467-517`) with one `<dl>` (When, Where plus directions, Price, Time TBA). Badges on -700 shades or foreground-on-tint (white on `orange-500`/`emerald-500`/`amber-500` fails 4.5:1). Border or shadow on section cards, not both.
11. **P2 / S. Photo upload.** Client allowlist `image/jpeg`, `image/png`, `image/webp` (`EventPhotoUpload.tsx:35` accepts SVG); show uploads on the page after the event starts, or remove the uploader. Bucket MIME config is D8.
12. **P2 / S. Next occurrence.** Past-event pages link to the next row with the same `recurrence_parent_id`, falling back to the same title with `date >= today`.

**Acceptance:** the json-ld-escape test passes without the baseline entry; a seeded description containing `</script><img src=x onerror=alert(1)>` prerenders inert. `/events/<uuid>` lands on `/events/<title>-<yyyy-mm-dd>`. With the placeholder backend, the page shows Retry and no noindex. A 19:00 CT event viewed at 09:00 CT reads "Today"; day 2 of a 3-day festival isn't "Past Event". A `javascript:` `source_url` renders no link. Exactly one hotel list, none on past events. axe reports no badge contrast violations.

**Verify:** `npm run test:unit`; `node --test scripts/__tests__/json-ld-escape.test.mjs` (or the script the test suite uses); `backend-down` smoke spec; axe on an event page; `npx impeccable detect src/pages/EventDetails.tsx`; network panel for deferred widgets.

---

## WP9: Id-based event links

**Goal:** callers build slugs, so they stop relying on WP8's UUID rescue.

**Files:** `src/components/FavoritesView.tsx`, `src/components/AdvancedSearchPage.tsx`, `src/components/PersonalizedContent.tsx`, `src/hooks/usePushNotifications.ts`.

1. **P1 / S.** Replace `/events/${event.id}` at `FavoritesView.tsx:212`, `AdvancedSearchPage.tsx:57`, `PersonalizedContent.tsx:37` and `usePushNotifications.ts:66` with `createEventSlugWithCentralTime(title, event)`, fetching the slug columns where only an id is in hand (push payloads fall back to the id, which WP8 resolves).

**Acceptance:** `rg -n '/events/\$\{[a-z.]*id\}' src` returns nothing outside WP8's fallback.

**Verify:** `npm run validate`; manual favorite and push tap.

---

## Frontend-only now vs needs backend

Everything in WP0-WP9 is frontend-only and reads columns and RPCs already in migrations. Two gates apply before merge: `time_tbd` joins `EVENT_LIST_COLUMNS` only after `npm run check-schema:probe` reports it (WP0 item 3), and the WP0 bboxes are checked against known-venue coordinates.

**Deferred: needs backend or DB (needs approval).**

- **D1 (P0). Near-me RPC.** Migration: `CREATE OR REPLACE` `search_events_near_location` with the same signature and return columns, adding `is_merged IS NOT TRUE AND is_hidden IS NOT TRUE AND archived_at IS NULL` and `SET search_path = public, extensions` (the only definition, `20251110000000_add_geospatial_proximity_search.sql:59-69`, is SECURITY DEFINER with no visibility predicates). Then a new `search_events_near_location_v2` with defaulted `p_category`, `p_start`, `p_end`, `p_offset`, distance-first order. A new function rather than new parameters on v1, because an overloaded name makes PostgREST's resolution ambiguous and old binaries keep calling v1. WP1 and WP6 then drop their interim client filters.
- **D2 (P1). Numeric price.** Nullable `price_min`/`price_max` on `events`, filled at ingest in the shared scraper path and backfilled once. Unlocks server-side price ranges (WP1/WP2 hide them until then).
- **D3 (P1). `get_event_social_counts(event_ids uuid[])`** returning counts only, replacing WP3's three narrowed selects.
- **D4 (P1). Audience columns.** `audience text[]` (or `is_kid_friendly`/`is_date_night`) set at ingest; Kids and Date Night query with `.contains`.
- **D5 (P1). `time_tbd` in production.** Not a schema change, a probe: if it's absent, apply `20260902000016`. Until then hub cards and hub JSON-LD print SeatGeek's 3:30 AM placeholder.
- **D6 (P1). Trending rail.** Confirm `get_trending_events` (in `20260822000002_fix_for_you_rail_rpc_signatures.sql`) and a populated `trending_score` via probe and a sample query, then a "Popular this week" rail replaces nothing in WP1 (the Featured block is already gone).
- **D7 (P2). `card_blurb`** generated column (200 chars) to stop shipping two full descriptions per card.
- **D8 (P2). `event-photos` bucket** `allowed_mime_types` to jpeg/png/webp.
- **D9 (P2). Edge function links.** `notify-event-submission/index.ts:175` and `agent-weekly-digest/index.ts:144` build slugs. Needs a deploy; WP8's UUID branch covers these links meanwhile.
- **D10 (P2). `venues.parking_notes`** nullable column for per-venue parking.
- **D11 (P2).** Upcoming-event count per venue (grouped RPC or view) for the directory.

## Conflicts resolved

- **Weekend window: Fri 00:00 (landing) or Fri 17:00 (results agent)?** Fri 00:00 to Sun 23:59 CT. It's what `/events/this-weekend` already ships and what the FAQ promises; the hub and landing must return the same set.
- **Near-me RPC: replace in place with new params (holistic, near-me) or add a v2 (filters, results)?** Both, split: visibility and `search_path` in place with an unchanged signature; new parameters in v2. CLAUDE.md allows adding defaulted parameters, but an overload with a different arg list is ambiguous to PostgREST.
- **Featured block: support `?featured=true` (filters) or delete (holistic, results)?** Delete. It duplicates up to 3 grid cards and nothing reads the param; `is_featured` stays a badge.
- **"For you" chips: map interest ids to categories (filters) or drop them from `/events` (holistic)?** Drop. The Category control covers it, they return zero rows today, and `src/types/preferences.ts` is owned by home WP2.
- **Price ranges: add a column (filters, results) or hide numeric ranges (holistic)?** Hide now, column as D2.
- **Dinner pairing: hub card line (holistic) or detail block (detail)?** Detail block. It reuses `tonightPairings.ts` with one fetch the page already makes; the hub version needs a batched bbox query.
- **Location "Downtown": bbox (holistic) or `city = 'Des Moines'` (filters)?** Both, named honestly: "Des Moines" is a city match; "Downtown", "East Village", "Valley Junction" and "Ingersoll" are bboxes.
- **`related` rails: add `enabled` to `useEvents` (detail agent) or a new hook?** New `useRelatedEvents`, because home WP3 owns `useEvents.ts`.
- **AdBanner CTA height (results agent).** Handed to home WP4, which owns `AdBanner.tsx`.

## Rejected

- **Map "plots only 30 rows" and "no empty state" as P0.** Downgraded to P1: the map is an alternate view that's incomplete, not wrong about any event.
- **Near-me radius slider as P0.** Downgraded to P1: wasteful and racy, but the common single-drag case ends on the right radius.
- **Near-me RPC labelled a security finding.** It returns admin-hidden public events, not private data. Kept as P0 function (dead-end cards), not security.
- **Marker PNG hotlinks as breaking.** CSP `img-src` allows `https:` (`public/_headers:17`), so pins render. Kept as P1 robustness.
- **Detail "`:198` prefers the offset-less `event_start_local` over `date`".** `dateSource` reads `event_start_utc` first (`EventDetails.tsx:198`); `event_start_local` is only reached when UTC is null. Folded into WP8 item 4 as a minor clean-up.
- **Canonicalize `?preset=today` to `/events/today` (SEO agent).** SEOHead already canonicalizes every query permutation to `/events`; pointing a hub filter at another page's canonical adds risk for no gain. Search-query noindex is kept.
- **Holistic "dinner nearby" line on hub cards (P2).** Cut in favour of bet 4 on detail.
- **Title and schema rebuilt per keystroke (P2).** Folded into WP1 item 12 (`useMemo`, debounced query), not a separate item.
- **Kids/Date Night index-plan acceptance ("query plan uses an index").** Not checkable against `ilike '%...%'`; replaced by D4.
