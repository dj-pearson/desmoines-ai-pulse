# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

None. Loop 28 (drain round) closed WEB-PERF-035's last line: useBreweries
filters on `is_brewery` instead of nine name ILIKEs.

What loop 28 found, worth more than the one-line change:
- Migrations 20260919000007 (restaurants.is_brewery) and 20260919000008
  (attractions/playgrounds slug) ARE applied in production. Evidence is in the
  repo, not a probe: the production exports under
  scripts/content-backups/seo-061 and seo-063 (taken 2026-10-01) carry
  `is_brewery` on every restaurant row (Exile Brewing Co. = true) and `slug`
  on the attractions (seo-046) and playgrounds (seo-061) rows. Before writing
  "OWNER-BLOCKED on applying the migration", grep those backups for the column.
- So WEB-PERF-031's remaining code steps are workable now: delete the fallback
  branch in resolveBySlug's fetchBySlug, add slug to ATTRACTION_LIST_COLUMNS
  and PLAYGROUND_LIST_COLUMNS, switch AttractionDetails' related links to it.
  Only the types.ts regeneration still needs credentials; check-list-columns
  reads types.ts, so adding slug there may need the column registered first.
- The brewery filter keeps the two cuisine patterns beside the flag, because
  nothing at ingest sets is_brewery (it was backfilled once). Dropping them
  would hide any brewery scraped in after 2026-09-19.
- WEB-PERF-023 (DOM size) needs design calls the notes reserve for the owner;
  WEB-PERF-034 AC2 needs a new RPC migration plus regenerated types.

Loop 27 closed WEB-PERF-080 (restaurantStatus.ts split out of
restaurantHours.ts).

What loop 27 added:
- restaurantStatus.ts holds OpenStatus, RestaurantOpenResult,
  StoredOpeningHours, DES_MOINES_TIME_ZONE, the two PostgREST closed filters,
  isVisitableStatus, isPermanentlyClosedRestaurant, isShutRestaurant,
  isServingToday, businessStatusLabel and formatOpenStatusLine. It has no
  imports. restaurantHours.ts re-exports all of it (plus a plain import of the
  three names it still uses). 25 modules that import only those names now
  import restaurantStatus.
- Measured: 9 routes 3.5-3.6 KB gz lighter beyond the critical path
  (PseoRoutePage, NeighborhoodPage, BestOfCategory, Deals, PlaygroundDetails,
  WhatsNew, AdvancedSearchPage, AdminTools, AdminAnalyticsPage). 22 routes
  that need the parser anyway gained one file and 0.1-0.2 KB (the status
  module is now its own shared chunk); that is the floor. Summed 7,898.8 ->
  7,870.4 KB gz, files 6,771 -> 6,793. restaurantStatusSplit.test.ts pins the
  nine routes and the re-export identity.
- Still on the parser for real: Articles/ArticleDetails (useArticles calls
  resolveOpenStatus), DiscoverMap (discoverMapRestaurant), RestaurantCard
  users, OpenStatusChip users, attractionAtAGlance (desMoinesNow,
  formatClockLabel, the only path on Attractions). Moving those two out
  could take /attractions off the parser, but they need date-fns-tz, so not
  into restaurantStatus; check ThingsToDoHub/VisitorsGuide chains and
  measure first.
- Next candidates: public form fields on ui/select (Contact, TripPlanner,
  BusinessPartnership, GroupTravel; check the form still posts).

What loop 26 added:
- tonightTime.ts holds the Tonight constants, TonightEvent and the window
  types, centralDayWindow, tonightWindow, tonightQueryBounds,
  eventStartInstant and the card formatters (formatMiles, formatCentralTime,
  formatTonightDate, formatCentralShortDate, truncateName). It imports only
  date-fns and date-fns-tz. tonightPairings.ts re-exports all of it, so old
  imports still work. hubEventPartition, eventsHubQuery, useEventLanding,
  tripShortlist and the cards that only format now import tonightTime, which
  took restaurantHours.ts, the pairing code and useWeather off 15 routes
  (event landings, music/sports/outdoors hubs, /stay, venue, playgrounds):
  -5.6 to -6.5 KB gz each, and 12 more routes -1.9 to -2.6. Eight routes
  that still need the pairing code (Index, EventDetails, EventsPage,
  Restaurants, RestaurantDetails, AttractionDetails, SearchResults,
  TripPlanner) gained 0.5 KB gz and two small files (tonightTime and a
  useWeather chunk that no longer shares one with tonightPairings).
  tonightTimeSplit.test.ts pins the 15 routes and the re-export identity.
- Next candidate, now worth more: a restaurantStatus.ts split of
  restaurantHours.ts (the status helpers, NOT_CLOSED_RESTAURANT_FILTER,
  DES_MOINES_TIME_ZONE, formatOpenStatusLine and the result/stored types,
  re-exported from restaurantHours). Tried first this loop, before the
  tonight split: 7 routes -3.5 KB gz but 39 routes +1 file and +0.1-0.2 KB,
  because most routes reached the parser through tonightPairings anyway.
  After this loop, Articles, ArticleDetails, Deals, DiscoverMap and
  PlaygroundDetails reach restaurantHours only through those light names
  (useDeals, useNearbyListings, the page's DES_MOINES_TIME_ZONE import), so
  re-measure before deciding. HotelDetails, Attractions, VisitorsGuide and
  ThingsToDoHub need real parser calls (OpenStatusChip, attractionAtAGlance's
  formatClockLabel/desMoinesNow, useOpenNowRestaurants).
- Trap: `export { X } from "./m"` makes no local binding. When moving names
  out of a module, every name its remaining code still uses needs a plain
  import as well as the re-export (MAX_TONIGHT_CARDS bit here).

What loop 25 added:
- RestaurantInlineFilters draws four static PillButtons (forwardRef, same
  classes before and after) and fetches RestaurantFilterPopover on the first
  click (Enter/Space arrive as clicks; Radix PopoverTrigger has no arrow-key
  open). The lazy half holds the Popover, all four panels and the rating
  Slider, so the panels moved there too: a child element built in the static
  module would have kept ui/slider in the hub. Open state stays in the static
  pill, so the lazy Popover is controlled and mounts open; Radix focuses the
  content and returns focus to its own trigger on close. /restaurants
  141.9 -> 108.5 KB gz, 18 fewer files; it was the last importer of
  react-popover, popper, floating-ui and react-slider there.
  restaurantFilterPopoverLazy.test.ts pins it; restaurants-hub.spec.ts has the
  smoke test. sliderThumbNames.test.tsx now scans the new file.
- Next candidates: restaurantHours.ts (4.0 KB on ~46 routes) is still the
  biggest app module by gz x routes; public form fields on ui/select
  (Contact, TripPlanner, BusinessPartnership, GroupTravel) need a check that
  the form still posts before converting.

What loop 24 added:
- AIDisclosureBadge renders the pill alone and fetches AIDisclosureTooltip
  (the Radix half) on the first non-touch pointerenter. The tooltip was the
  only popper on EventDetails, RestaurantDetails, ArticleDetails and
  HotelDetails, so it carried react-tooltip, react-popper and all four
  floating-ui packages there: those four routes dropped 15.8-19.8 KB gz.
  The half mounts closed and Radix opens it on the next pointermove over its
  trigger; mounting it open under a pointer risks a tooltip that never gets
  its pointerleave. aiDisclosureTooltipLazy.test.ts pins the four routes and
  restaurant-detail.spec.ts has a smoke test (chunk fetched only on hover,
  tooltip opens, pill keeps its size).
- Remaining popper users on public routes, from the same per-module walk:
  RestaurantInlineFilters' Popover on /restaurants (the next candidate:
  @floating-ui is about 9 KB gz of the closure there), and form-field
  ui/select on Contact, TripPlanner, BusinessPartnership, GroupTravel.
  restaurantHours.ts (4.0 KB on 46 routes) is still the biggest app module
  by gz x routes.

What loop 23 added (WEB-PERF-076):
- AddToCalendarButton is a static trigger; AddToCalendarMenu holds the Radix
  DropdownMenu and the export handlers and mounts already open
  (defaultOpen). It was the only DropdownMenu on the event routes, so it
  carried react-menu, popper, floating-ui, roving focus and collection there:
  seven event landings dropped 35.3 KB gz each. addToCalendarLazy.test.ts pins
  ten routes. Trap for any lazy Radix Menu: Radix moves focus to the first
  item on a keyboard open only if its document keydown listener saw the key,
  and that listener is added when the menu root mounts, after the key that
  opened it. The impl takes focusFirstItem (click with detail 0, or
  ArrowDown) and hands focus from the content to the first item in onFocus;
  onOpenAutoFocus would do it too but is a private Menu prop and fails
  type-check. Radix Select (DeferredSelect) has no such step.
- Next candidates by (gz x public routes) from a per-module walk:
  restaurantHours.ts 4.0 KB on 42 routes (homepage reaches it via
  tonightPairings; a split needs care, it is real logic), @floating-ui and
  react-collection still on ~25 routes via tooltip/popover/dialog, and
  react-select on 11 routes that are form fields (see below).

What the next loop should know:
- .content-auto's placeholder is `auto 0 auto calc(26rem + 3px)`: the card is
  sized in rem and the root font-size steps 16/18/20px at md/lg, so one rem
  value matches 419/471/523px. If RestaurantCard gains or loses a line, re-run
  the "holds still" tests in restaurants-dietary.spec.ts; they read the start
  position in the same task as the scroll, because scrolling with Playwright
  first let the 1280px shift land before the measurement began.
- The rest of the entry's __vite__mapDeps (about 13 KB gz) is the routes' own
  closures, and it cannot be cut without a waterfall. Rollup hoists transitive
  imports, so a lazy route chunk already imports its whole closure directly:
  a "direct deps only" build cut 36 of 8,018 refs and 0.2 KB gz. The only
  bigger cut is "target only", which costs one full RTT on every navigation
  by construction. Not worth re-measuring unless the chunking changes.
- A clean `vite build` now prints no remove-lazy-preloads warning. If one
  appears, it is real: a non-critical chunk over 150 KB raw is preloaded from
  the HTML. CRITICAL_PATH_CHUNKS in vite.config.ts is the exemption list and
  heavyPreloads.test.ts pins it to what manualChunks forces.
- The open WEB-PERF stories 023, 031, 034 and 035 are still waiting on a
  migration or live data (023 needs a prerender against real rows); the next
  loop likely needs to audit for a new gap.
- Per-module cost of one route: hook generateBundle like
  measure-route-preload.mjs does, take the route chunk's chunkClosure minus
  the critical set, and split each chunk's gz across its modules by
  renderedLength. The script must sit inside the repo to resolve `vite`.
  sonner is done (WEB-PERF-070: import `toast` from `@/lib/toast`, never
  from "sonner"; toastLazy.test.ts enforces it). UpgradeModal is done
  (WEB-PERF-072: open it with openPaywall() from `@/lib/paywallStore`;
  upgradeModalLazy.test.ts enforces it). ShareDialog is done (WEB-PERF-073:
  ShareDialog.tsx is a Slot trigger only and loads ShareDialogPanel on first
  click; shareDialogLazy.test.ts enforces it). It was worth 7-19 KB gz per
  route, not the 2.6 KB estimated, because on Attraction/Playground/
  Restaurant/Article detail it was the only thing holding @radix-ui/
  react-dialog in the route closure: estimate a lazy cut by the libraries it
  is the last importer of, not by the module's own size. A dialog opened
  from a Slot trigger has no Radix DialogTrigger, so return focus in
  onCloseAutoFocus yourself. Radix Select is done (WEB-PERF-074):
  a closed single-choice control on a public route is `DeferredSelect` from
  `@/components/ui/deferred-select` with an `options` array. It draws a
  static role=combobox trigger and swaps in the Radix Select already open
  (defaultOpen) on click or ArrowUp/Down; it swaps on click, not
  pointerdown, so no stray pointerup lands on the fresh list.
  deferredSelectLazy.test.ts pins the three hubs and that the static
  trigger's classes equal SelectTrigger's. The class string is copied, not
  shared: a shared select-styles.ts became its own chunk and added a file to
  40 admin routes. /attractions dropped 21.4 KB gz, more than react-select's
  own size, so it was the last importer of popper/focus-scope there too.
  Playgrounds, Hotels, EventsNearMe and Articles followed in loop 22
  (WEB-PERF-075). With seven importers, deferred-select.tsx
  became its own shared chunk, so the three earlier hubs gained one file and
  0.3-0.4 KB gz; that is the floor for any new user. Public routes still on
  ui/select are form fields (Contact, TripPlanner, BusinessPartnership,
  InteractiveDateSelector) that may rely on Radix's hidden native select;
  check a form posts before converting one, and measure first.
- A real-browser check of a lazy module needs no hooks into the app: build,
  `vite preview --port <free>`, `grep -l <a string unique to the module>
  dist/assets/*.js`, then in Chrome `import()` that chunk and find the export
  by shape (mangled names). That is how the lazy toast was confirmed to render
  in the lazy Toaster.
- Entry chunk, by module, after this loop: App.tsx 46 KB raw (route table),
  tailwind-merge 20 KB, react-helmet-async 11.8 KB (HelmetProvider and Helmet
  are one module), AuthContext 9.9 KB. Measure with a sourcemap walk
  (source-map-js eachMapping, sum generated columns per source) before
  guessing.

Measuring routes is one command: `node scripts/measure-route-preload.mjs
[--min-chunk N] [--out f.json]` (needs placeholder VITE_SUPABASE_URL/ANON_KEY/
SITE_URL, exported in the same shell as the build); diff two --out files. Any
forced manual chunk silently absorbs shared dependencies; do not add a fourth
for a lazy library (WEB-PERF-067).

Earlier notes still hold: eagerGraph.ts is the static-graph walker for
entry-chunk tests (write `import type`, not `import { type X }`); headless
app-root lazy components use src/lib/lazyOrNothing.ts. /usr/bin/google-chrome
exists in the container, so `chromium.launch({ channel: "chrome" })` against
`vite preview --host 127.0.0.1` can load routes and `import()` chunks even
though Playwright's own browsers are not installed. Playwright's
keyboard.press("?") sends shiftKey, which the shortcut hook rejects; dispatch
a keydown on document.body to test "?".

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-PERF-041 | f5ae9fd0 | Six DB-image cards on OptimizedImage (transform srcset); /stay first row eager and added to check-lcp-priority; raw-img 24 -> 17; story stays open for the tail |
| 2026-11-07 | WEB-PERF-041 | this commit | RatingSystem review photos (80px preview, 96px thumbs, lightbox) on OptimizedImage with box-sized transform widths; raw-img 17 -> 14; EventPhotoGallery found dead; story stays open |
| 2026-11-07 | WEB-PERF-041 | this commit | Map popup, event-review dialog and article-editor previews on OptimizedImage with box-sized widths; DB-image hard gate widened from src/pages to every scanned file (negative control fires); raw-img 14 -> 11, all deliberate; story closed |
| 2026-11-07 | WEB-PERF-058 | this commit | /guides cards stop fetching /api/placeholder (8 Function hits per visit, 3 at fetchpriority=high) and draw an icon panel; new hard rule in check-raw-img (negative control fires); raw-img 11 -> 10; story closed |
| 2026-11-07 | WEB-PERF-059 | this commit | Cookie banner lazy-loaded behind CookieConsentGate, fetched only with no stored choice or on reopen; Radix Checkbox/Label/Presence out of the entry chunk; critical path 187.2 -> 181.9 KB gz; story closed |
| 2026-11-07 | WEB-PERF-060 | this commit | Spinner split into ui/spinner.tsx; eager ProtectedRoute no longer drags loading-skeleton.tsx into the entry chunk; critical path 181.9 -> 180.8 KB gz, baseline ratcheted; static-graph test with negative control; story closed |
| 2026-11-07 | WEB-PERF-061 | this commit | Admin idle timeout and guest-favorite migration lazy-loaded behind useAuthFlags gates; six modules out of the entry chunk; critical path 180.8 -> 178 KB gz, baseline ratcheted; static-graph test with negative control; story closed |
| 2026-11-08 | WEB-PERF-062 | this commit | ProtectedRoute permission half split into lazy RoutePermissionGate; usePermission, useSecurityContext and lib/security out of the entry chunk; critical path 178 -> 175.8 KB gz, baseline ratcheted; static-graph test with negative control (8 fail on a static import); story closed |
| 2026-11-08 | WEB-PERF-063 | this commit | AuthProvider's sign-in/sign-up/OAuth/reset/password/email/resend bodies moved to lazily imported lib/authActions; signUpResult out of the entry chunk; critical path 175.8 -> 174.9 KB gz, baseline ratcheted; static-graph test with negative control (2 fail on a static import); story closed |
| 2026-11-08 | WEB-PERF-064 | this commit | Forced vendor-dates manual chunk removed; per-route JS beyond the critical path 11,779 -> 10,840 KB gz summed over 131 lazy routes (/pricing -20.9, /auth -23.5, /events/:id -4.4, /hotels +5.5); critical path unchanged; manualChunks test with negative control (3 fail on re-adding); 24 routes loaded clean in Chrome; story closed |
| 2026-11-08 | WEB-PERF-065 | this commit | experimentalMinChunkSize 1000 -> 1; per-route JS 10,853 -> 9,734 KB gz summed over 137 lazy routes, unused passengers 1,892 -> 615; 131 lighter, none heavier >0.2 KB; critical path 174.9 -> 176.0 (in tolerance); new scripts/measure-route-preload.mjs; test with negative control; 24 routes clean in Chrome; story closed |
| 2026-11-08 | WEB-PERF-067 | this commit | Forced vendor-editor chunk removed (it absorbed fast-equals, shared with recharts, and the app's tiptap-styles.css); unused passengers 614.8 -> 0, routes 9,743 -> 9,121 KB gz, five admin routes 123-125 KB lighter, none heavier; critical path 176.0 unchanged; manualChunks test with negative control (4 fail on re-adding); six chunks import clean in Chrome; story closed |
| 2026-11-08 | WEB-PERF-066 | this commit | Preload lists drop chunks the importing chunk already loaded (modulePreload.resolveDependencies + bundle capture); entry refs 8,381 -> 7,905, lazy hosts 1,660 -> 792, entry 55.4 -> 55.2 KB gz; check-bundle-budget guards it (pre-change dist fails); 20 routes clean in Chrome; story stays open for AC2/AC3 |
| 2026-11-08 | WEB-PERF-066 | this commit | AC3: AccessibilityWidget announces via new lib/announce (useAccessibility out of the entry, two duplicate announcers merged) and the shortcut listener is a lazy headless component; critical path 175.8 -> 174.7 KB gz, baseline ratcheted 174.9 -> 174.7; static-graph test with negative control (2 fail on revert). AC2 assessed, not shipped: direct-deps-only cuts 36/8,018 refs (0.2 KB gz) because rollup hoists transitive imports; target-only costs a full RTT per navigation. Story closed |
| 2026-11-08 | WEB-PERF-068 | this commit | Heavy-preload check extracted to findHeavyPreloads and exempts CRITICAL_PATH_CHUNKS by chunk name; a clean build goes from 1 warning (vendor-supabase 216 KB) to 0; critical path 174.7 unchanged; test with negative controls (no exemption: 2 fail; prefix match: 1 fail); story closed |
| 2026-11-08 | WEB-PERF-069 | this commit | savedSearchFilters reads saved filters with plain code instead of zod, its only zod import on three routes; /events 205.9 -> 192.5, /search 94.1 -> 81.9, /dashboard 155.4 -> 143.2 KB gz beyond the critical path, none heavier; critical path 174.7 unchanged; graph test with detector and walker controls (3 fail on re-adding the import); story closed |
| 2026-11-08 | WEB-PERF-070 | this commit | 87 modules import `toast` from new lib/toast.ts, which loads sonner on first call (queued, ids minted and passed through); 64 routes 8.8-9.0 KB gz lighter beyond the critical path (/events 191.2 -> 182.3), none heavier, summed 9,162.7 -> 8,596.1; critical path 174.7 unchanged; graph test with negative control (6 of 9 fail on one reverted import); toast renders in the lazy Toaster in Chrome; story closed |
| 2026-11-08 | WEB-PERF-071 | this commit | .content-auto placeholder 420px -> auto calc(26rem + 3px), measured from a full card at 390/768/1024/1280 (419/471/523/523px); control under the dietary grid moved 1/51/103px at 390/768/1280 on the old value, 0 now; three smoke-lane tests with negative control (all 3 fail on 420px); dietary/open-now specs 63/63 over 3 repeats; story closed |
| 2026-11-08 | WEB-PERF-072 | this commit | PremiumGate, PremiumButton, Save/Watch search buttons and TripPlanner open the app-root lazy GlobalUpgradeModal via openPaywall() instead of mounting UpgradeModal; useUpgradeModal deleted; /search -8.3, /search/advanced -7.8, /events -7.2, /trip-planner -7.2 KB gz beyond the critical path (5-8 fewer files each), plus the lazy RatingSystem chunk, none heavier, summed 8,605.3 -> 8,574.1; critical path 174.8 unchanged; graph test with negative control (4 then 3 fail on reverted sources); paywall/search-watch/search-results/trip-planner specs 27/27 in Chrome; story closed |
| 2026-11-08 | WEB-PERF-073 | this commit | ShareDialog split into a Slot trigger and a lazy ShareDialogPanel fetched on first click (focus returned via onCloseAutoFocus); 15 routes lighter beyond the critical path, none heavier: AttractionDetails 105.6 -> 86.5, PlaygroundDetails 86.5 -> 67.6, RestaurantDetails 131.6 -> 118.0, ArticleDetails 140.1 -> 127.8, EventDetails 144.0 -> 136.8, event landings ~7, EventsPage 175.0 -> 171.9 KB gz; summed 8,570.3 -> 8,441.9, 135 fewer files; critical path 175.1 unchanged; graph test with negative controls (12 fail on a static panel import, 1 on the old trigger); panel fetched only on click and focus returned in Chrome; story closed |
| 2026-11-15 | WEB-PERF-074 | this commit | Closed sort/filter selects on /events, /restaurants and /attractions (plus the calendar-feed select) are DeferredSelect, which loads @radix-ui/react-select on first click/arrow key; Attractions 134.3 -> 112.9, EventsPage 171.8 -> 164.2, Restaurants 147.3 -> 140.4 KB gz beyond the critical path (10/5/2 fewer files), no route heavier by more than 0.1; summed 8,454.8 -> 8,419.8; critical path 175.1 unchanged; graph test with negative control (2 fail on a static ui/select import); 111 smoke tests on those pages and 4 Chrome checks (click, ArrowDown, Enter, in-dialog; no layout shift, focus returned) pass; story closed |
| 2026-11-15 | WEB-PERF-075 | this commit | Closed filter/sort selects on /playgrounds, /stay, /events/near-me and /articles are DeferredSelect; Articles 86.4 -> 52.9, Playgrounds 105.5 -> 84.5, Hotels 88.2 -> 67.9, EventsNearMe 122.8 -> 116.0 KB gz beyond the critical path (17/9/7/2 fewer files); EventsPage/Restaurants/Attractions +0.3-0.4 and one file (deferred-select now a shared chunk); summed 8,438.8 -> 8,361.0; critical path 175.2 unchanged; graph test extended to 7 routes with negative control (1 fails on a static ui/select import); 118 smoke tests on those pages plus 4 throwaway Chrome checks (click, ArrowDown, pick updates URL, focus returned, no size change) pass; vitest 3588/3588 |
| 2026-11-15 | WEB-PERF-076 | this commit | AddToCalendarButton is a static trigger and loads AddToCalendarMenu (Radix DropdownMenu + export handlers) on first click/Enter/ArrowDown, opened with the first item focused on a keyboard open; seven event landings 118-124 -> 83-89 KB gz beyond the critical path (-35.3, 17 fewer files each), EventsPage 165.4 -> 142.7, EventsNearMe 116.5 -> 96.9, EventDetails 138.3 -> 120.3, none heavier by more than 0.1; summed 8,384.8 -> 8,080.7; critical path 175.2 unchanged; graph test with negative control (12 of 13 fail on the old button); 55 smoke tests on event pages plus 2 throwaway Chrome checks (chunk fetched only on use, keyboard focus, Escape returns focus, same size) pass |
| 2026-11-15 | WEB-PERF-077 | this commit | AIDisclosureBadge renders the pill alone and loads AIDisclosureTooltip (Radix Tooltip) on the first mouse hover; EventDetails 120.3 -> 100.5, HotelDetails 88.5 -> 68.9, RestaurantDetails 119.8 -> 103.8, ArticleDetails 129.0 -> 113.2, TripPlanner 116.9 -> 114.0 KB gz beyond the critical path (6-10 fewer files), none heavier; summed 8,120.1 -> 8,042.0; critical path 175.2 unchanged; graph test with negative control (6 of 7 fail on the old badge); new smoke test in restaurant-detail.spec.ts (chunk only on hover, tooltip opens, same size) passes 3/3 repeats with 50 other detail-page smoke tests; vitest 3659/3659 |
| 2026-11-15 | WEB-PERF-078 | this commit | RestaurantInlineFilters pills are static buttons and load RestaurantFilterPopover (Radix Popover, the four panels, the rating Slider) on first click/Enter; /restaurants 141.9 -> 108.5 KB gz beyond the critical path (18 fewer files); 17 other routes moved by 0.1 either way (chunk reshuffle), none more; summed 8,046.7 -> 8,012.8; critical path 175.2 unchanged; graph test with negative control (2 of 4 fail on a static ui/popover import); new smoke test (no chunk on load, click and Enter open, Escape returns focus, same size) 3/3 repeats plus 108 smoke tests on filter/restaurant pages; vitest 3692/3692 |
| 2026-11-15 | WEB-PERF-079 | this commit | Tonight clock (constants, window, eventStartInstant, card formatters) moved from tonightPairings.ts to new tonightTime.ts and re-exported; 15 routes 5.6-6.5 KB gz lighter beyond the critical path (Hotels 68.8 -> 62.5, EventsNearMe 97.3 -> 90.8, MusicHub 51.4 -> 45.1, event landings ~-6.3) and 12 more 1.9-2.6 lighter; 8 pairing routes +0.5 and +2 files; summed 8,013.4 -> 7,900.9, files 6,773 -> 6,771; critical path 175.2 unchanged; graph test with negative control (12 of 18 fail on one reverted import); 128 + 75 smoke tests on the touched pages in Chrome; vitest 3731/3731 |
| 2026-11-15 | WEB-PERF-080 | this commit | Status helpers and result/stored types moved from restaurantHours.ts to new import-free restaurantStatus.ts and re-exported; 25 light importers switched; 9 routes 3.5-3.6 KB gz lighter beyond the critical path (PseoRoutePage 68.8 -> 65.3, PlaygroundDetails 65.4 -> 61.8, Deals 44.6 -> 41.1, NeighborhoodPage 33.1 -> 29.6), 22 parser routes +1 file and +0.1-0.2; summed 7,898.8 -> 7,870.4, files 6,771 -> 6,793; critical path 175.2 unchanged; graph test with negative control (1 fails on one reverted import); vitest 3760/3760 |
| 2026-11-15 | WEB-PERF-035 | this commit | useBreweries filters on is_brewery plus the two cuisine patterns instead of nine hardcoded name ILIKEs (BREWERY_NAMES deleted); column confirmed live from 2026-10-01 production exports in scripts/content-backups; 4 new unit tests, all 4 fail against the old hook; brewery-trail smoke spec 21/21 over 3 repeats; type-check ratchet 30/30, check-schema/list-columns/select-star clean; story closed |
