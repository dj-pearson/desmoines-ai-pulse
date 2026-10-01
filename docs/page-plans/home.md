# Home page plan (`/`, `src/pages/Index.tsx`)

Coordinator output, 2026-09-24. Built from one holistic audit and seven section audits. Every P0 was re-opened at its cited line before it was accepted; the ones that didn't hold are under **Rejected**.

## Where it stands

- On a 390px phone the first screen is all brand. `EnhancedHero.tsx:88` is `min-h-[80vh] md:min-h-screen`, and the search input first appears at `Index.tsx:404`, below the hero.
- The page claims things that don't exist: SMS/Voice/ChatGPT channels (`EnhancedHero.tsx:236-255`), "sell-out predictions" (`Index.tsx:551`), "40% / 60% / 35% more" (`GEOContent.tsx:228,236,244`), per-neighbourhood coverage for five areas with no page (`Index.tsx:728` vs `src/lib/neighborhoods.ts:60-164`), and a hardcoded "popular searches" list with trending arrows (`useSearchInsights.ts:148-159`).
- Several things that look clickable are broken. NLP results link to `/${type}/${item.id}` (`NLPSearchBar.tsx:373`), which the event and attraction slug resolvers can't match. Dashboard restaurant cards build a slug in the browser that differs from the stored one (`AllInclusiveDashboard.tsx:673-677` vs migration `20250729031000`). MostSearched cards only fire analytics (`MostSearched.tsx:152-154`).
- Time handling runs on the wrong clock: `useEvents.ts:59` bounds a timestamptz on the UTC date, and the quick view formats in the viewer's zone and prints the no-time marker as a showtime (`Index.tsx:337-343`).
- The page repeats itself: counts x3, recently viewed x2, trending x3, a 100-event list x2. All lazy sections mount at once, so roughly a dozen Supabase requests fire before first interaction.

## What makes it ours

These are the differentiation bets this plan adopts. Each one uses data the app already has.

1. **Tonight, answered for free.** A rail under the hero pairs a Central-time event tonight with a restaurant that will be open nearby at dinner time, ordered by the weather verdict. Coordinates come from ingest (`knownVenues.ts`), hours from `getRestaurantOpenStatus(opening, now)` in `src/lib/restaurantHours.ts:263`, and weather from `useWeather`. Today the biggest button on the page is "AI Plan My Night", which leads to an Insider paywall (`QuickActions.tsx:107-122`). Yelp, Eventbrite and Catch Des Moines each hold one half of that answer.
2. **One search box that goes somewhere.** A single input in the hero submits to `/search?q=`, which the `SearchAction` schema already names as canonical. One-tap chips (Tonight, This weekend, Open now, Near me, Free) go to the SEO landings that already filter server-side.
3. **Neighbourhoods as places.** Neighbourhood chips become links to `/neighborhoods/:slug`, generated from `NEIGHBORHOODS` so the page can't claim an area it has no page for. Tonight counts per area come later, computed from the Tonight rail's events.
4. **A dated, quotable paragraph.** "As of Thursday, September 24 (Central): 38 events this weekend, 12 free; next up ..." Built from live counts, linked, marked `data-speakable`. It replaces the product self-description in GEOContent, and it's the passage an AI assistant would quote with a date and a source.
5. **Honesty as a feature.** Every number on the page comes from a query or isn't shown. Sponsored items are labelled. No fake channels, no invented trends.

The visitor path (hotels, itineraries and weekend guides above the footer) is the sixth bet. It's gated on a schema probe; see WP10.

## How the packages avoid edit conflicts

`src/pages/Index.tsx` is touched by nearly every finding, so it gets one owner.

**WP0 lands first, alone (about half a day).** It turns Index into a thin composition file and extracts the pieces other packages will own. Behaviour stays the same apart from the dead-code removal.

After WP0, WP1 through WP10 own disjoint file sets and can run in parallel. **Only WP1 edits `Index.tsx`.** Another package that needs a mount point or prop change on the page ships its component and adds a line to its PR describing the mount. WP1 wires it in.

New Playwright specs are written by each package in its own new spec file. **WP1 owns lane registration** (`playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`) and adds each spec to the smoke lane, so `npm run check-e2e-lanes` stays green. A spec no lane runs never runs again (WEB-CI-028).

---

## WP0: Prep and dead code (sequential, lands first)

**Goal:** make Index small enough to own, and remove code nothing can reach.

**Files:** `src/pages/Index.tsx`, new `src/components/EventQuickView.tsx`, new `src/content/homeContent.ts`

1. **P1 / S.** Delete the unreachable social hub. `handleViewSocial` (`Index.tsx:333`) is never passed to a child, so `activeView` can't become `socialHub`. Remove `handleViewSocial`, the `activeView` state (`:127-130`), the branch at `:650-671`, the `activeView.type === 'default'` guard (`:605`) and the lazy import (`:46`). `EventSocialHub.tsx` is still named in `useCommunityFeatures.ts` and `lib/security/ownership.ts`, so leave the file in place.
2. **P1 / S.** Remove the empty microdata `<div itemScope itemType="https://schema.org/WebPage">` (`Index.tsx:391`); SpeakableSchema already emits the WebPage. Remove `<BreadcrumbListSchema>` at `:377-382`, which returns null for one item.
3. **P2 / M.** Move the quick-view dialog, `handleShareEvent` (`:177-205`) and `formatEventDate` (`:337-343`) into `EventQuickView.tsx`: a named export with props `{ event, open, onOpenChange }`, lazy-imported and rendered only after a card is selected. No behaviour change yet; WP6 fixes it.
4. **P2 / S.** Move the FAQ array (`:698-740`), `structuredData` (`:220-275`) and the Speakable props (`:384-388`) into `src/content/homeContent.ts` as exported constants. Index imports them. WP5 then owns the content.

**Acceptance:** `rg 'EventSocialHub|activeView|handleViewSocial|itemScope' src/pages/Index.tsx` returns nothing. Index is under 650 lines. The quick view opens, saves and shares exactly as before.

**Verify:** `npm run validate`; smoke lane (`route-smoke`, `page-headings`); manually open, save and share from a card on `/`.

---

## WP1: Hero, one search, page order (owns `Index.tsx`)

**Goal:** a visitor on a phone sees the search input and a real item without scrolling, and each kind of content appears once.

**Files:** `src/pages/Index.tsx`, `src/components/EnhancedHero.tsx`, `src/components/QuickActions.tsx`, `src/components/NLPSearchBar.tsx`, `src/hooks/useNLPSearch.ts`, `src/hooks/useHomepageStats.ts`, `src/components/HomeInterestNav.tsx`, new `src/components/LazySection.tsx`, lane files (`playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`). Deletes: `SearchSection.tsx`, `SmartEventNavigation.tsx`, `PersonalizedDashboard.tsx`, `useSmartRecommendations.ts`, `RecentlyViewed.tsx`, `PersonalizedRecommendations.tsx`, `useEnhancedRecommendations.ts`. Grep confirms each is referenced only from Index or from another file on this list.

1. **P0 / S. Remove false capability claims.** Delete the "Available access channels" list (`EnhancedHero.tsx:235-255`) and the "First AI-Powered Conversational City Guide" badge (`:136-146`). The repo's own comments say these don't exist (WEB-SEO-026, XPLAT-009).
2. **P0 / S. Delete the "AI City Companion" grid** (`Index.tsx:465-603`). It's an icon-medallion card grid, which the craft floor refuses, and it promises demand forecasts, sell-out predictions and weather alerts that no code implements, plus a hardcoded "50+ attractions". Nothing replaces it in place; the Tonight rail and neighbourhood strip take its space.
3. **P0 / S. Fix NLP result links.** Add `resultHref(item, type)`. Events use `/events/${createEventSlugWithCentralTime(item.title, item)}`. Attractions use `/attractions/${item.slug ?? createSlug(item.name)}` (from `@/lib/slug`). Restaurants use `/restaurants/${item.slug ?? item.id}`. Delete the unused `getResultLink` (`NLPSearchBar.tsx:92-96`) and type `item` as `Event | Restaurant | Attraction`, not `any`.
4. **P1 / M. One search, in the hero.** Move `NLPSearchBar` into EnhancedHero under the H1, wrapped in `<form role="search">` with `type="search"` and `enterKeyHint="search"`. Submitting navigates to `/search?q=`. Remove `<SearchSection>`, the "Prefer to filter" strip, the separate NLP section (`Index.tsx:403-426`), and the `searchFilters` / `handleSearch` / `handleClearFilters` plumbing and its toast (`:289-326`). Delete `SearchSection.tsx`.
5. **P1 / M. Compact first viewport.** Mobile gets no min-height; the hero holds the H1, a one-line live context (weekday, today's count from `useHomepageStats`, a dash while loading), the search input, and a chip row: Tonight -> `/events/today`, This weekend -> `/events/this-weekend`, Open now -> `/restaurants/open-now`, Near me -> `/events/near-me`, Free -> `/events/free`. Replace the navy-to-purple gradient (`EnhancedHero.tsx:100-102,117`) and the gold-to-orange CTA gradient (`QuickActions.tsx:39,184`) with flat brand tokens. Demote "AI Plan My Night" to a secondary link that still shows its Insider label. Stat tiles stay on desktop only. Remove `animate-slide-in` / `animate-fade-in` from the H1 block (`EnhancedHero.tsx:138,163`), because `createRoot` discards the prerendered DOM and the LCP text fades in from opacity 0. Base the greeting on the Central hour, not the visitor's clock (`EnhancedHero.tsx:61`).
6. **P1 / S. NLP bar accessibility.** Example chips become `<button type="button">` (they're Badge divs today, `NLPSearchBar.tsx:163-170`). Close on Escape and on focus leaving. Add `aria-expanded` / `aria-controls` and an `aria-live="polite"` status line. Clear and submit buttons go from h-8 to h-11 (`:127,142`).
7. **P1 / S. Stale results and dead-end empty state.** Track `lastQuery`; dim results while the input differs from it, and label them "Results for X". "View all" uses `lastQuery`. The zero-result state links to `/search?q=` plus one loosened query. Order example chips by the Central hour.
8. **P1 / M. Page order and de-duplication.** Target order: hero and search, Tonight rail (WP10), For You rail (WP2), recently viewed rail (WP2), neighbourhood strip (WP5), This-week dashboard (WP3), MostSearched (WP9), dated snapshot and FAQ (WP5), footer (WP7). Remove `<RecentlyViewed>` (`:606-612`), `<PersonalizedRecommendations>` (`:614-619`), `<PersonalizedDashboard>` (`:621-624`, which ranks sponsored events higher and badges them "NN% match", `useSmartRecommendations.ts:412` / `PersonalizedDashboard.tsx:169`), and `<SmartEventNavigation>` (`:626-642`, a second 100-event list). Remove `<Newsletter/>`; the footer form is the one signup (WP7). Turn HomeInterestNav's three icon-tile cards (`HomeInterestNav.tsx:67-86`) into a one-line text link row, or delete it if the chip row covers it. Remove the ad wrapper `py-4` bands in Index; AdBanner renders its own sized wrapper (WP4). Delete the orphaned files listed above.
9. **P1 / S. No surprise modal.** Delete the effect that auto-opens PreferencesOnboarding 1s after load (`Index.tsx:151-163`). WP2 puts an inline prompt in the For You rail instead.
10. **P1 / M. Mount below-the-fold sections near the viewport.** Build `LazySection` (IntersectionObserver, `rootMargin: 400px`, fixed-height placeholder). Wrap everything after the recently viewed rail except the FAQ text, which stays in the initial DOM for indexing.
11. **P2 / S. Stat tiles match their destination.** The restaurants tile counts all restaurants but links to open-now (`EnhancedHero.tsx:193`; `useHomepageStats.ts:73-76` admits it). Link it to `/restaurants`, or relabel it and count open ones.
12. **Lane registration.** Add every new spec from WP1-WP10 to `playwright.smoke.config.ts` and the e2e baseline.

**Acceptance:**
- At 390x844 and 1366x768, the search input and at least one real card are inside the first viewport.
- `/` has exactly one free-text search input. Typing a known open restaurant's name and pressing Enter lands on `/search?q=<name>`.
- `rg 'SMS Concierge|Voice Assistant|ChatGPT Plugin|sell-out|demand forecast|50\+ attractions' src/components/EnhancedHero.tsx src/pages/Index.tsx` returns nothing.
- An anonymous load of `/` with no scroll makes 6 or fewer Supabase requests, and `get_trending_events` is called at most once.
- A signed-in user who hasn't done onboarding sees no modal on load.

**Verify:** new `tests/home-search.spec.ts` (fixtureBackend; one input, Enter navigates, NLP result hrefs match `/events/<slug>-YYYY-MM-DD` with a stubbed `nlp-search` response). New `tests/home-request-budget.spec.ts`, or an extension of `request-budget.spec.ts`, for the request count. Also `touch-targets`, `page-headings`, the a11y lane, `npx impeccable detect src/components/EnhancedHero.tsx src/components/QuickActions.tsx`, and `npm run validate`.

---

## WP2: Personalization, preferences, recently viewed

**Goal:** one For You rail and one recently viewed store that work for guests, don't leak between accounts, and don't shift the layout.

**Files:** `src/components/ForYouRail.tsx`, `src/hooks/useForYouRail.ts`, `src/components/WeatherNotice.tsx`, `src/components/RecentlyViewedRail.tsx`, `src/lib/recentlyViewed.ts`, `src/hooks/useRecentlyViewed.ts`, `src/hooks/useUserPreferences.ts`, `src/components/PreferencesOnboarding.tsx`, `src/types/preferences.ts`, `src/contexts/AuthContext.tsx`, `src/components/EventCard.tsx`, `src/pages/RestaurantDetails.tsx`, `src/pages/AttractionDetails.tsx`

1. **P0 / M. Stop the cross-account leak.** Preferences use one unscoped key (`useUserPreferences.ts:16`). The AC3 branch uploads any local copy into whoever signs in (`:150-154`, no check on `local.userId`). Logout clears only `sb-`/`supabase` keys (`AuthContext.tsx:843-868`). Fix: only upload when `local.userId` is `'anonymous'` or equals `user.id`. Scope the signed-in key per user. On logout, clear the per-user prefs key and `dmi_recently_viewed_v1`. Migrate-on-read from the old key for one release, per the storage rule.
2. **P0 / M. Onboarding says only what it does.** The "Google Calendar" button only flips local state and then shows "Connected" (`PreferencesOnboarding.tsx:42,373`). The location step discards picks (`:53` TODO). The notifications step has no controls. Cut to three steps: interests, food and price, neighbourhoods. Save neighbourhoods through `updateLocation`. Escape means "later" and not "completed" (`:536` calls `handleSkip`), with a separate "Don't ask again" action.
3. **P1 / S. Inline "Tune your picks" prompt** at the head of ForYouRail. It opens PreferencesOnboarding, and dismissal is saved with `storage.set('dmi_prefs_prompt_dismissed_v1', true)` from `@/lib/safeStorage`. Pairs with WP1 item 9.
4. **P1 / M. Preferences as one shared query.** Four instances each fetch `profiles` and hold their own `useState` (`useUserPreferences.ts:89-102`), so saving in onboarding doesn't reach the rail until a reload. Back the hook with `useQuery(['user-preferences', userId])`, with safeStorage as `initialData` and `setQueryData` on save.
5. **P1 / M. One recently viewed store, for every type.** `EventCard.tsx:109` writes the legacy `desmoines_recently_viewed` key, and only `EventDetails` calls `useRecordRecentView`. Call it from RestaurantDetails and AttractionDetails too. Stop EventCard writing the legacy key, and fold its entries into `dmi_recently_viewed_v1` on first read (one release). This also lets HomeInterestNav's reorder promote something other than events.
6. **P1 / S. No collapse, no late insert.** ForYouRail returns null after six skeleton cards when the RPC is empty (`ForYouRail.tsx:17-19,49-56`). When empty, keep the height and render "Nothing trending yet. See what's on today" linking to `/events/today`. Move the weather line into a fixed-height slot in the rail header, so a late or failed weather call changes text, not layout (`WeatherNotice.tsx:71-72`).
7. **P1 / L. Guest-usable personalization, client side.** Web never writes `swipe_interactions`, so the rail says "Trending now" for everyone for good (`useForYouRail.ts:47,62`). Add 5-6 Des Moines chips to the rail header (Live music, Free, Family, Patio, East Village, Downtown). They save via `useUserPreferences` for guests and members, re-rank the RPC rows client-side, and show a reason on each card ("Because you picked Free"). No new query; server-side cold-start is deferred.
8. **P1 / S. Accessibility.** The remove button on RecentlyViewedRail is 44px and visible on touch and focus (today it's `opacity-0` and h-7, `RecentlyViewedRail.tsx:79-86`). Onboarding choice cards become `<button aria-pressed>`. Add DialogTitle / DialogDescription and "Step n of 3" text.
9. **P1 / S. RestaurantDetails:** only try `.eq('id', slug)` when the param is a UUID (`RestaurantDetails.tsx:72-77`). A non-UUID raises 22P02 and shows the error page instead of not-found.
10. **P2 / S. Weather line with substance:** temperature (already returned, `useWeather.ts:21`) plus a count, deep-linked to `/events/today` with the indoor/outdoor filter set.

**Acceptance:**
- Sign in as A, onboard, view three events, log out, sign in as a new user B. B has no taste preferences from A, sees the prompt, and has an empty recently viewed rail.
- Onboarding is three steps and makes no calendar claim. Chosen neighbourhoods survive a reload.
- With an empty `get_trending_events` and weather delayed 3s, layout shift from these nodes is 0.
- A guest who taps Free sees the rail retitled "For you", with reasons on the cards.

**Verify:** unit tests for the AC3 guard and the legacy-key migration (`npm run test:offline`). New `tests/home-rails-cls.spec.ts` (fixtureBackend plus a PerformanceObserver layout-shift sum under 0.05). Also `touch-targets`, the a11y lane, and `npm run validate`.

---

## WP3: "This week" dashboard

**Goal:** turn the 100-event client-side catch-all into a small, correct, mixed "This week in Des Moines" block with working links.

**Files:** `src/components/AllInclusiveDashboard.tsx`, `src/hooks/useSupabase.ts`, `src/hooks/useEvents.ts`, `src/hooks/usePlaygrounds.ts`, `src/hooks/useHotels.ts`, `src/lib/listColumns.ts`, `src/components/ui/loading-skeleton.tsx`

1. **P0 / S. Use the stored slug.** `transformRestaurant` drops `slug` (`useSupabase.ts:183-205`) although the list columns select it, and the card builds `proof-s` where the row says `proofs`. Add `slug` to the transform output (a new key, so existing callers are unaffected). Cards link to `/restaurants/${item.slug || item.id}`. Attractions and playgrounds use their row slug, falling back to `createSlug` from `@/lib/slug`. Delete the local `createSlug` (`AllInclusiveDashboard.tsx:673-677`). Add `slug` to ATTRACTION_LIST_COLUMNS only after `npm run check-schema:probe` confirms the column.
2. **P0 / S. Read the transformed restaurant fields.** The dashboard reads `opening_date` / `source_url` (`AllInclusiveDashboard.tsx:765-772,792,387`), but the transform returns `openingDate` / `sourceUrl`. So opening dates and Learn More never render, and any date filter produces Invalid Date. Also surface the openings query error in `loadError` (it's discarded at `:151`).
3. **P0 / M. Central-time day boundary.** `useEvents.ts:59` bounds `.gte('date', <UTC date>)` on a timestamptz, so before 7pm CDT last night's events show and after 7pm tonight's in-progress events drop. Bound on `centralDayStartUtcISO()` (`src/lib/timezone.ts`), or on `event_start_utc >= now - grace`. This changes `useEvents` for every list page, so run the `/events` specs too. Render card dates with `formatEventDateShort` (Central, `time_tbd`-aware), and compute date presets against `nowInCentralTime()`.
4. **P1 / M. A real mix, plus hotels.** The default view shows 2-3 each of events (tonight and weekend first), new openings (tab renamed "New openings", since that's what `useRestaurantOpenings` returns), attractions, playgrounds, and hotels via `useHotels` with a small limit. Each group gets a "See all" link to its hub. Remove the `filters` / search props (WP1 removes the search). Show real totals or none; `Events (100)` is the limit, not the count.
5. **P1 / M. Fetch what the first view needs.** 30 rows or fewer in total. Add an optional `countMode` to `useEvents` (default unchanged, so other callers keep `exact`) and pass `'none'` here. Give playgrounds a list projection instead of `*` (`usePlaygrounds.ts:51`). Bound the openings query. Enable per-tab queries only when that tab is active.
6. **P1 / M. Cards.** Render the `image_url` that's already selected, with explicit dimensions, `loading="lazy"` and a neutral fallback. Put the when/where line first. The title is one real `<a href>`, with only an icon link for the external source. Type badges move from white-on-orange-500 / green-500 (about 2.8:1 and 2.3:1) to the -700 shades or tinted text.
7. **P1 / S. "Show more" replaces pagination.** No `href="javascript:void(0)"` (`:485,515,530`). Focus moves to the first new card.
8. **P1 / S. A skeleton that matches.** Add `DashboardGridSkeleton` (heading, tab row, 9 cards). Use it for the component's loading state; WP1 uses it as the Suspense fallback.

**Acceptance:**
- A restaurant named with an apostrophe or `&`, or a duplicate name, opens its detail page.
- At 10:00 CT no event from yesterday is listed; at 20:00 CT an 18:00 event is still listed.
- The first view contains one of each type when data exists.
- No `Prefer: count=exact` on the home events request, and 30 rows or fewer on first paint.
- axe shows no badge contrast violations.

**Verify:** unit test with a fixed clock for the Central boundary, plus a card-href-equals-row-slug test. New `tests/home-dashboard.spec.ts` (fixtureBackend). The existing `/events` specs (`search-filters`, `url-filter-state`, `sticky-filter-chips`), `request-budget`, and `npm run validate`.

---

## WP4: Safe external links and ads

**Goal:** nothing from a scraper or an advertiser can open a non-http URL, and ad slots don't shift the page.

**Files:** `src/lib/capacitorUtils.ts`, `src/components/AdBanner.tsx`, `src/components/HouseAd.tsx`, `src/components/advertising/CreativeUploadForm.tsx`

1. **P1 / S. Guard the URL scheme in `openExternalUrl`.** Parse with `new URL()` and refuse anything that isn't `http:` or `https:` (`capacitorUtils.ts:131-145` passes any string to `Browser.open` / `window.open`). This covers quick-view `source_url` and dashboard Learn More in one place.
2. **P1 / S. AdBanner:** apply the same guard to the `window.open(ad.link_url)` path (`AdBanner.tsx:55-63`), and render a non-clickable ad when it fails. Quote the CSS `url("...")` for `image_url` (`:97`). Reserve `min-h-20 md:min-h-28` while loading, and render nothing at all (no empty band) for ad-free tiers. The wrapper moves inside AdBanner.
3. **P1 / S. CreativeUploadForm:** reject a non-http(s) `link_url` client-side. The server-side CHECK is deferred.
4. **P2 / S. HouseAd:** the same `pl-12 md:pl-14` badge clearance AdBanner got for WEB-QA-006 (`HouseAd.tsx:77`), flat surfaces instead of gradients (`:66,89`), a CTA of h-11 or taller that carries the click (not a div wrapper).

**Acceptance:** `openExternalUrl('javascript:alert(1)')` returns false and opens nothing (unit test). No layout-shift entry above 0.02 from ad containers. `npx impeccable detect src/components/HouseAd.tsx src/components/AdBanner.tsx` is clean.

**Verify:** `npm run test:offline`, `touch-targets`, `npm run validate`.

---

## WP5: Truth, FAQ, structured data, neighbourhood strip

**Goal:** every claim on the page is one the code or the data backs, the FAQ is single and linked, and the structured-data graph describes one page.

**Files:** `src/content/homeContent.ts` (created in WP0), `src/components/GEOContent.tsx`, `src/components/FAQSection.tsx`, `src/components/SEOHead.tsx`, `src/components/schema/SpeakableSchema.tsx`, `src/components/schema/BreadcrumbListSchema.tsx`, `src/components/SocialProof.tsx`, new `src/lib/jsonLd.ts`, new `src/hooks/useHomeSnapshot.ts`, `scripts/__tests__/geo-content-claims.test.mjs`

1. **P0 / S. Delete the invented percentages** (`GEOContent.tsx:228,236,244`) and the "last-minute ticket availability" promise (`:243`). Extend `geo-content-claims.test.mjs` to fail on `/\b\d{1,3}%\s+(more|less|fewer|higher|increase|faster)/i` outside comments.
2. **P0 / S. Coverage and cadence claims.** The FAQ answer (now in `homeContent.ts`, from `Index.tsx:728`) names areas that have no page. Build the list from `NEIGHBORHOODS` so it can't drift. "Updated multiple times daily" (`GEOContent.tsx:87`) contradicts `event-crawler.yml:10` (once a day): say "daily". Drop "restaurants reviewed weekly / attractions monthly" unless a production schedule can be named in a comment. Delete "AI rankings consider review scores" (`GEOContent.tsx:161`); the `reviews` table returns 42P01.
3. **P1 / M. One FAQ.** Delete GEOContent's FAQ, its "Why Des Moines Insider" list and its how-to section. Move its two informative answers (the paid-placement disclosure, and "if we disagree with the venue, believe the venue") into the single FAQ. Import what's left of GEOContent eagerly.
4. **P1 / L. The dated snapshot.** `useHomeSnapshot` (TanStack Query, 5-minute staleTime, `handleError`, the same visibility predicate as `fetchHomepageCounts`). It renders 2-4 sentences with a `<time dateTime>` element, links to `/events/this-weekend` and `/events/free`, `data-speakable`, and nothing at all on failure. It replaces GEOContent's count tiles. The hero keeps the only count row.
5. **P1 / S. FAQ links.** Add an optional `links: { label; to }[]` to `FAQItem`, rendered as `<Link>`s. `acceptedAnswer.text` stays plain, so the JSON-LD doesn't change. Link the eight hubs the answers already describe: `/events/this-weekend`, `/events/today`, `/restaurants/open-now`, `/playgrounds`, `/events/kids`, `/events/free`, `/iowa-state-fair`, `/neighborhoods`.
6. **P1 / S. Answers always in the DOM.** Use `<details>/<summary>` (today `FAQSection.tsx:93` mounts an answer only when it's open). Chevrons get `aria-hidden`. Add a `headingLevel` prop defaulting to `h2`.
7. **P1 / S. Escape JSON-LD.** Add `toJsonLd()`, which escapes `<`, `>`, U+2028 and U+2029, and use it in FAQSection, SEOHead, SpeakableSchema and BreadcrumbListSchema. Event pages feed AI-written `geo_faq` into FAQSection, so a `</script>` in a row breaks out today. Add an offline check against a bare `JSON.stringify` inside an ld+json script.
8. **P1 / S. One graph.** Speakable is named `HOME_TITLE`, with `speakableCssSelectors: ['[data-speakable]']`. Both inline publishers become `{ "@id": ".../#organization" }`. WebSite gets `@id .../#website`, and Speakable's `isPartOf` points to it. Delete the `keywords` claiming "predictive analytics, behavioral intelligence" and the iOS/Android `actionPlatform` on a web URL.
9. **P1 / S. Viewport meta.** Remove SEOHead's second viewport meta (`SEOHead.tsx:179`), which drops `viewport-fit=cover`, and its duplicate font preconnects (`:185-190`). `index.html` owns them.
10. **P1 / M. Neighbourhood strip.** SocialProof drops its stat tiles (a third copy of the counts) and its eyebrow badge. Its static badges (`SocialProof.tsx:24-35,76-80`) become `<Link to="/neighborhoods/:slug">` chips generated from `NEIGHBORHOODS`, each at least 44px, on a background that differs from its neighbour. Per-area tonight counts are a follow-up once WP10 lands (P2).
11. **P2 / S. Venue facts.** Harbinger isn't in the East Village. Remove the clock times from the late-night answer and link `/restaurants/open-now` instead. Date the skatepark superlative. Add an owner and review-date comment above the array.

**Acceptance:**
- `rg -n '\d+%' src/components/GEOContent.tsx` matches only comments.
- Exactly one "Frequently Asked Questions" heading on `/`. FAQPage `mainEntity` count equals the number of visible questions, and every answer is in the prerendered HTML.
- Rich Results Test shows one WebSite, one WebPage and one Organization, all resolved by `@id`.
- One viewport meta, containing `viewport-fit=cover`.
- Every neighbourhood chip resolves via `findNeighborhood`.

**Verify:** `npm run test:offline` (geo-content-claims, faq-single-emitter, the new JSON-LD escape test), `npm run check-schema-dupes`, `npm run check-neighborhoods`, `page-headings`, the a11y lane, `npx impeccable detect src/components/SocialProof.tsx`.

---

## WP6: Event quick view

**Goal:** the quick view shows the correct Des Moines time and answers "how do I get there".

**Files:** `src/components/EventQuickView.tsx` (from WP0), `src/components/ui/dialog.tsx`, `src/components/FavoriteButton.tsx`, `src/hooks/useFavorites.ts`

1. **P0 / S. Correct time.** Replace the local formatter (browser zone, prints the 19:31:58 no-time marker as 7:31 PM) with `formatEventDate(event)` from `@/lib/timezone`, and add "CT".
2. **P1 / S. Share that doesn't throw.** Use `nativeShare()` first. Guard `navigator.canShare` with `typeof === 'function'` (`Index.tsx:185` calls it unguarded). Wrap the clipboard write in try/catch. If everything fails, show a toast with the URL in a selectable input. Route unexpected errors to `handleError`. Put the date and venue in the share text.
3. **P1 / S. One toast.** FavoriteButton fires a sonner success before the mutation resolves (`FavoriteButton.tsx:111-115`), and `useFavorites.ts:72-83` fires its own success or error afterwards. Keep only the mutation's toasts.
4. **P1 / M. Usable on a phone.** The dialog Close becomes a 44x44 box (today a bare h-4 icon, `dialog.tsx:45-48`). This fixes every dialog on the site, so run `touch-targets` across routes. Below `sm`, the quick view is a bottom sheet with a sticky action footer, and the description is clamped to 5 lines.
5. **P1 / S.** An sr-only `DialogDescription` with the date, venue and price.
6. **P1 / M. Directions and clearer facts.** Add a Directions link built from `latitude`/`longitude` (falling back to the address). Show venue and location once when they're equal. Show a "Free" badge when the price is 0 or matches `/free/i`. The source button reads "Event website". "Get tickets" waits for a probed `ticket_url` (deferred).
7. **P2 / M.** A `?event=<id>` URL state, so Back closes the sheet. This needs WP1 to wire `useSearchParams`; do it after both packages land.

**Acceptance:** with the browser in America/Los_Angeles, the quick view shows the same clock time as the card and the detail page. A `time_tbd` event shows no time. At 375x667 the Close control is 44px or larger, and View details, Save and Share are visible without scrolling. A signed-in save shows one toast.

**Verify:** new `tests/home-quick-view.spec.ts` (fixtureBackend, `timezoneId: 'America/Los_Angeles'`, stubbed `canShare`/clipboard), `touch-targets`, the a11y lane, `npm run validate`.

---

## WP7: Newsletter and footer

**Goal:** signup uses the double opt-in path built for WEB-FEAT-019, and the page has one signup form.

**Files:** `src/components/Footer.tsx`, `src/components/Newsletter.tsx`, `src/hooks/useNewsletterSubscription.ts`

1. **P0 / S. Use the edge function.** `Newsletter.tsx:31-39` and `Footer.tsx:26-31` insert into `newsletter_subscribers` from the browser. That skips confirmation (the column default is `active`), leaks subscription status through the 23505 "Already subscribed" branch, and writes `consent_records` before any confirmation (`Footer.tsx:45-51`). Call `useNewsletterSubscription().subscribe({ email, source: 'footer' })`. Delete the 23505 branches and the client `logConsent` call, and show the server's generic "check your inbox for a confirmation link".
2. **P1 / M. One form, no costume.** The footer form is the only signup on Home (WP1 removes `<Newsletter/>`). Replace the footer CTA gradient (`Footer.tsx:70`) with a flat surface. Change `<Link><Button>` (`:83-89`) to `<Button asChild><Link/></Button>`. Grep shows Index is the only importer of `components/Newsletter`, so delete `Newsletter.tsx` once WP1 removes the mount.
3. **P2 / S. App Store badge:** serve it locally with explicit width and height instead of hotlinking `tools.applemediaservices.com` (`Footer.tsx:207-211`).

**Acceptance:** `rg "from\('newsletter_subscribers'\)" src/components` returns only admin files. A submit sends a POST to `/functions/v1/newsletter-subscribe`, and new and existing addresses get the same toast. `/` renders one email field. axe reports no nested-interactive violations in the footer.

**Verify:** `npm run check-marketing-consent`, `npm run validate`, the a11y lane, manual submit with the network panel open.

---

## WP8: Header and shell defects visible on Home

**Goal:** fix the shell bugs a Home visitor hits, without the cross-page re-architecture (see "Cross-page shell work" below).

**Files:** `src/components/Header.tsx`, new `src/hooks/useUserLevel.ts`, `src/lib/queryKeys.ts`, `src/components/header/MobileNav.tsx`, `src/components/header/UserMenu.tsx`, `src/components/header/DesktopNav.tsx`, `src/components/ui/sheet.tsx`, `src/components/OptimizedLogo.tsx`, `public/DMI-Logo2-*.{webp,png}` (new), `src/components/BackToTop.tsx`

1. **P0 / S. Six queries per navigation.** Header calls `useGamification()` just for level and XP (`Header.tsx:23`). That hook reads the full `useAuth()` (`useGamification.ts:83`) and runs a 6-way `Promise.all` (`:363`) on every Header mount, and Header mounts per page. Add `useUserLevel()`: one cached `user_reputation` read (`current_level, experience_points`, `maybeSingle`, 5-minute staleTime) keyed by user id from a narrow selector. Change `userLevel &&` to `userLevel != null` (`MobileNav.tsx:179`, `UserMenu.tsx:107`). Gate: `npm run check-schema:probe` must report `user_reputation` present. The hook already queries it, so this adds no dependency.
2. **P1 / S. Logo weight.** `public/DMI-Logo2.webp` is 78,244 bytes against a 29,502-byte PNG, and the `<source>` puts the WebP first at `fetchPriority='high'` (`OptimizedLogo.tsx:44-45,84`). Generate 40/80/120w variants with `sizes="40px"`, and pass `fetchPriority="auto"` from Header.
3. **P1 / S. BackToTop is hidden behind BottomNav on phones.** Both are `z-50`, and BottomNav renders after `<main>` (`App.tsx:644`), so it paints over BackToTop's `bottom-6` box (`BackToTop.tsx:61`). Offset to `bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6`. Honour reduced motion, move focus to `#main-content` after scrolling, and drop the redundant `onKeyDown`.
4. **P1 / S. Double route announcement.** Delete Header's announce effect (`Header.tsx:30-36`); `useFocusOnRouteChange` is the single announcer.
5. **P1 / S. UserMenu.** Remove the hardcoded `aria-expanded="false"`, `role="menu"` and `forceMount` (`UserMenu.tsx:79,92,94`). Replace `SubmitEventButton` / `AdvertiseButton` inside `DropdownMenuItem asChild` with MenuLinks, so arrow keys reach them.
6. **P1 / S. Mobile sheet.** Add a `hideClose` prop to `SheetContent`; MobileNav passes it and makes its own close button h-11.
7. **P1 / S. Upgrade CTA.** It shows to paying members and uses amber gradients (`UserMenu.tsx:63-72`, `MobileNav.tsx:139-152`). Hide it for insider/VIP using a narrow cached tier read, and use a flat surface. Replace `border-l-2 border-primary` on featured nav items (`DesktopNav.tsx:51`) with weight and a subtle background. Gate: probe `user_subscriptions` first.

**Acceptance:** signed in, navigating `/` -> `/events` -> `/` sends at most 1 `user_reputation` request and 0 to `user_badges` / `community_challenges` / `user_activities`. The logo request is under 6KB. At 390x844 scrolled 2000px, BackToTop is visible and tappable, and so is the Account tab. One aria-live insertion per navigation, none on initial load. `npx impeccable detect src/components/header` is clean.

**Verify:** new `tests/shell-mobile.spec.ts` (elementFromPoint on BackToTop and the Account tab; one close button of 44px or more in the sheet), `touch-targets`, the a11y lane, the network panel, `npm run validate`.

---

## WP9: MostSearched

**Goal:** the one non-event discovery rail links somewhere and shows only measured data.

**Files:** `src/components/MostSearched.tsx`, `src/hooks/useSearchInsights.ts`, `src/hooks/useTrending.ts`

1. **P0 / S. Make the cards links.** Restaurant, attraction and playground cards have `cursor-pointer` and an onClick that only tracks (`MostSearched.tsx:151-154,228-231,296-299`); the search cards have no handler at all (`:106`). Wrap them in `<Link>`: restaurants `/restaurants/${slug || id}`, attractions and playgrounds by row slug or `createSlug`, searches `/search?q=`. Keep `trackEvent` on click.
2. **P0 / S. No invented trends.** `search_analytics` SELECT is admin-only, so anonymous visitors always get the hardcoded list, with counts and `trending: true` (`useSearchInsights.ts:148-159`), and a green arrow renders for each. Without real data, retitle it "Try searching", show no counts and no arrows, and remove the numbers and flags from the fallback.
3. **P1 / M. Waterfall.** Run the fallback reads with `Promise.all`. Add a `types` option so MostSearched skips the two events reads it never renders. Add `is_hidden` / `archived_at` filters to `recentEvents`. Move `useSearchInsights` to `useQuery`. (WP1 mounts the section in `LazySection`.)
4. **P2 / S.** Title as h2 and columns as h3. Replace `text-[#DC143C]` with tokens. Skip empty columns.

**Acceptance:** Enter on any item navigates to a page that renders content. For an anonymous visitor, no count or trending icon appears. Once the section is visible it makes at most 4 parallel requests, none for events.

**Verify:** `links-and-buttons` (broad lane), `page-headings`, `request-budget`, `npm run validate`.

---

## WP10: Tonight rail (new files only)

**Goal:** the free "Tonight in Des Moines" answer, as the page's primary content under the hero.

**Files:** new `src/hooks/useTonightPairings.ts`, new `src/components/TonightRail.tsx`, new `src/lib/geo.ts` (haversine) if no helper exists. It reads `src/lib/restaurantHours.ts` and `src/lib/timezone.ts` without editing them.

1. **P1 / L. Pairings.** Take 3-5 visible events in today's Central window from now on (the same visibility predicate as `useEvents`). Order them outdoor-first or indoor-first by the `useWeather` verdict. For each, fetch restaurants with coordinates in a bounding box around the venue (a bounded query using `RESTAURANT_LIST_COLUMNS`). Pick the nearest one for which `getRestaurantOpenStatus(opening, eventStart - 90min)` is open, within 1.5 mi. Card: "Dinner at X (0.3 mi), then Y at 7:30 PM", linking to both detail pages. When nothing pairs, show the event alone; never an empty rail.
2. **P1 / S.** A fixed-height skeleton, a real error state (not an empty one) on failure, `handleError`, TanStack Query with a 5-minute staleTime.
3. **P2 / S.** Export tonight's events so WP5 can add per-neighbourhood counts to the strip.

**Acceptance:** after 15:00 CT with fixture data, the rail shows 3 or more pairs. Each restaurant is open at the paired time and within 1.5 mi. An anonymous visitor reaches a complete plan without meeting a paywall. No layout shift when data arrives.

**Verify:** unit tests for pairing and ordering with a fixed clock (`npm run test:offline`). New `tests/home-tonight.spec.ts` (fixtureBackend). The request budget stays within WP1's limit, since this rail replaces the dashboard's 100-row fetch in the first viewport.

**Gated follow-up (P2), visitor band.** Add `src/components/VisitorBand.tsx`: where to stay by area (`/stay`), 2-3 itineraries, the current weekend guide, and "Stay near {venue}" on Tonight cards from `event_hotels`. `/stay` is linked only from the footer today (`Footer.tsx:264`). These tables are listed in `scripts/db-snapshot.json` (2026-08-24) but weren't probed live. Run `npm run check-schema:probe` for `hotels`, `hotel_areas`, `event_hotels`, `curated_itineraries` and `weekend_guides`; if any is missing, the item moves to the deferred list.

---

## Frontend-only now vs needs backend

**Frontend-only now.** Everything in WP0-WP10 above. Items marked "Gate" need only a read-only `npm run check-schema:probe` before merging (`user_reputation`, `user_subscriptions`, the attraction `slug` column, and the visitor-band tables), not a schema change.

**Needs backend or DB (deferred, needs approval)**

| Priority | Item | Why it's deferred |
|---|---|---|
| P0 | `nlp-search`: add `.neq('is_hidden',true).neq('is_merged',true).is('archived_at',null)` and replace `select('*')` with a list-card column set (`supabase/functions/nlp-search/index.ts:312-316,360,405`). It uses the service-role key, so hidden and merged events leak into results. | Edge function. Shrinking the response is a contract change, so check the iOS/Android readers before dropping columns. **Recommend approving this first.** |
| P0 | `nlp-search`: compute "today / tonight / weekend" in America/Chicago (`:142,260-290` use UTC, so evening searches return tomorrow). | Edge function |
| P1 | `nlp-search`: 3.5s Claude timeout, a keyword fallback that still returns 200, per-token AND matching instead of one phrase, and a 10-minute intent cache. | Edge function |
| P1 | `newsletter_subscribers`: change the `status` default to `pending`, or tighten the anon INSERT policy, once no shipped client inserts directly (after WP7 ships, per the deprecation flow). | Migration, and a later release |
| P1 | Creatives: server-side `link_url` scheme validation, plus `CHECK (link_url ~* '^https?://') NOT VALID`. | Migration and edge path |
| P2 | `get_popular_searches(p_days, p_limit)` SECURITY DEFINER RPC with a distinct-session threshold, and public read on today's `trending_scores`. Until then MostSearched's measured branch is unreachable for anonymous visitors. | New RPC and policy |
| P2 | Count web preferences toward the For You cold-start signal in `get_personalized_recommendations`, and pass real lat/lon instead of `null` (`useForYouRail.ts:65-66`). | RPC change |
| P2 | "Get tickets" and venue links in the quick view: probe `ticket_url` and the venue mapping first. | Unverified columns |
| P2 | Move Tonight pairing into an RPC if the client payload grows past the request budget. | New RPC |
| P2 | Confirm whether restaurant and attraction refreshes are scheduled in production `cron.job`, so the FAQ can state a cadence. | Needs production access |

## Cross-page shell work (not this page's packages)

These are real, but each touches every route. They belong in a shell plan, not in a Home PR: moving `<Header />` out of the 102 pages into the App shell (which also fixes the skip link landing inside `<main>` and the missing banner landmark); a top-level Stay nav group; making group labels click through to their hubs; driving `prefetch.ts` from one lazy-route module; a Cmd/Ctrl+K header search built on `SearchAutocomplete`; and rendering `BackToTop` once in the App shell.

## Conflicts resolved

- **Search: route to `/search` or pass the query to server hooks in the dashboard?** Route to `/search`. The WebSite `SearchAction` already names it, it's shareable, and it removes a second search UI. The dashboard agent's "pass `filters.query` to hooks" is dropped.
- **SmartEventNavigation: fix it or remove it?** Remove it from Home. It duplicates the dashboard's 100-event list, and grep shows Index is its only user. The hero chips replace its date buttons with links to the server-filtered SEO landings.
- **Search inside the hero: P0 (hero agent) or P1 (holistic)?** P1. Nothing is broken; it's the largest UX gain, and it's first in WP1's order after the P0s.
- **Newsletter section or footer form?** Footer form. Every page already has it, which removes one component from Home and one duplicate form.
- **GEOContent snapshot vs Tonight rail.** Keep both. The rail is the visual answer for tonight; the snapshot is a dated prose paragraph for the week, aimed at search and AI citation. They use separate hooks so the packages stay disjoint.
- **Header logo P0.** Downgraded to P1. It's about 50KB of waste on a high-priority fetch, which is slow but not broken.

## Rejected

- **"BackToTop covers the BottomNav Account/Sign In tab"** (shell, P0). The stacking claim is backwards: BottomNav renders after `<main>` at `App.tsx:644` with the same `z-50`, so BottomNav paints over BackToTop. The real defect is a hidden BackToTop, restated as WP8 item 3 at P1.
- **PersonalizedDashboard fixes** (sponsored badge, dead button, dark-mode text). The component comes off Home and has no other user, so it's deleted instead.
- **SmartEventNavigation fixes** (date buttons, no-time sentinel, Trending rail, keyboard access). Same reason.
- **SearchSection restaurant filter fix, calendar bundle, events category facet** (hero agent). SearchSection is deleted.
- **EventSocialHub Buzz Score / Reply fixes.** The view is unreachable from Home and is removed in WP0. Fix those if the hub is ever mounted on the detail page.
- **Trim `useEnhancedRecommendations`, and point it at the unified recently-viewed feed.** The hook is only used by PersonalizedRecommendations, which is deleted; the For You re-rank replaces it.
- **"Home search filters only 100 rows, pass search to hooks"** (dashboard). Superseded by routing search to `/search`.
- **SocialProof "last updated" freshness line.** It depends on an unprobed `updated_at` read inside `useHomepageStats`, which WP1 owns. The dated snapshot (WP5 item 4) already carries a timestamp.
- **HouseAd aria-label em dash.** Not a user-facing defect.
