# Plan & Stay plan, second pass (`/trip-planner`, `/stay`, `/stay/:slug`, `/visitors-guide`, `/getting-around`, `/group-travel`, `/articles`, `/articles/:slug`, `/best-of`, `/best-of/:category`, `/whats-new`)

Coordinator output, 2026-09-25. Built from one holistic audit and five section audits (trip planner, hotels, visitor/getting around/group travel, articles and what's new, best-of plus the weekend hand-off). The first-pass plan is `docs/page-plans/plan-stay.md`, implemented in 0982788. Every P0 and P1 below was re-opened at its cited line before it was accepted; what didn't hold, or was reclassified, is under **Rejected**. Production state comes from `scripts/db-snapshot.json` (captured 2026-08-24) and `docs/RLS_AUDIT.md`. No live probe was run, so anything that depends on a migration being applied says so.

`/weekend` is still the 301 to `/events/this-weekend`, which Events pass 2 owns. Nothing here plans that page.

## Scorecard for the first pass

56 numbered items in `plan-stay.md`, classified against the code as it stands after the Search, Account, Pricing, Business, Home, Events, Eat & Drink and Explore pass-2 commits.

| Area (prior WPs) | Items | Shipped, working | Shipped, broken | Shipped, half-done | Dropped, no deferral note |
|---|---|---|---|---|---|
| Trip planner (WP1) | 9 | 8 | 0 | 1 | 0 |
| Hotels (WP2) | 10 | 8 | 1 | 1 | 0 |
| Visitor guide, getting around, group travel (WP3) | 9 | 4 | 0 | 5 | 0 |
| Articles (WP4) | 9 | 6 | 1 | 2 | 0 |
| Best-of (WP5) | 8 | 5 | 1 | 2 | 0 |
| What's new (WP6) | 7 | 7 | 0 | 0 | 0 |
| Nav links (WP7), lanes (WP8) | 4 | 4 | 0 | 0 | 0 |
| **Total** | **56** | **42** | **3** | **11** | **0** |

Deferred: D2 shipped as `supabase/migrations/20260924000001_hotels_admin_only_writes.sql`, but nothing records it being pushed; `docs/RLS_AUDIT.md:318-320,383-389` still shows the old policies. D1 and D3-D12 are still deferred. Two of them changed and are re-listed below: D9 (hotel coordinates) now sits under three shipped features, and D6's `guide_requests` half is unblocked because web stopped writing it. The weekend hand-off shipped and now belongs to Events pass 2.

The holistic audit counted 49 / 5 because it scored "works on fixtures, fails on production data" as shipped. The section audits didn't, and their count is the one used here.

**Broken:**

- **WP2 4, booking label.** `resolveBooking` prints "Book via {affiliate_provider}" (`src/lib/hotelBooking.ts:86-90`), and the only writer of that column stores the network name (`supabase/functions/generate-hotel-affiliate-urls/index.ts:207-215`: "Partnerize", "Awin", "Commission Junction"). A visitor reads "Book via Awin" on a link that lands on hilton.com. `tests/stay.spec.ts` uses `affiliate_provider: 'expedia'`, a value no code writes.
- **WP4 4, `useArticleBySlug`.** The `isLoading` branch (`src/pages/ArticleDetails.tsx:66-80`) has no canonical. `node scripts/check-loading-canonical.mjs` fails today with "ArticleDetails.tsx: the isLoading branch returns without a canonical", and that check runs in `.github/workflows/pr-checks.yml:472`.
- **WP5 1, atomic vote change.** The upsert (`src/hooks/useVoting.ts:425-431`) needs the UPDATE policy in `20260829000001_votes_ballot_privacy.sql:32-37`. `prd.json:6843` records that migration as written and held for the owner, and `docs/RLS_AUDIT.md:689-691` lists INSERT, SELECT and DELETE only. The first vote in a category works; every change fails with 42501. The booth still says "You can change it while voting is open" (`src/components/VotingBooth.tsx:207`).

**Half-done:**

- **WP1 5, date-window planner.** Multi-day events file under one day only (`src/hooks/useEventsInRange.ts:82-90`), an exhibit that opened in March shows its March start time on the first day (`src/components/trip/DateWindowPlanner.tsx:198-200`), long-running rows eat the `limit(100)` (`useEventsInRange.ts:45-51`) and the cut days then say "Nothing listed yet." (`DateWindowPlanner.tsx:188-189`), and past windows are accepted (`src/lib/dateOnly.ts:66-72`).
- **WP2 7, `?near=`.** Works on fixtures. Nothing writes hotel coordinates (D9), and the result line appends "nearest X first" whether or not any row has a distance (`src/pages/Hotels.tsx:655`).
- **WP3 2, sourced facts.** The hero says "with where each figure came from" (`src/pages/GettingAround.tsx:102`), but only DART fares carry a source. `DISTANCE_TABLE` (`:46-54`) and the skywalk and airport lines in `src/lib/transitFacts.ts` don't.
- **WP3 4, the guide is the page.** "This weekend" asks for the Friday-to-Sunday window from Friday 00:00 (`src/lib/timezone.ts:440-443`) with `limit: 6` and no ongoing rows (`src/pages/VisitorsGuide.tsx:70`), so on Saturday the six slots are Friday's finished events. "Open now" is a paragraph and a link (`:189-199`).
- **WP3 5, venue website.** The seed leaves `website` out of its column list (`supabase/migrations/20260228000007_create_meeting_venues_and_rfps.sql:76`), so "Visit website" never renders in production, and the form copy points at "its website above" (`src/pages/GroupTravel.tsx:67-68`).
- **WP3 7, garages.** "Civic Center Garage" is the theater's own address and coordinates, and "Iowa Events Center lots" reuses the arena's (`GettingAround.tsx:37-38`). No row names a source.
- **WP3 9, cross-links.** Link text still says Wells Fargo Arena (`GettingAround.tsx:314`); `src/lib/venuePages.ts:86-98` has `currentVenueName` for exactly this.
- **WP4 3, read time.** The plan said `word_count` was in the snapshot. It isn't (the snapshot has 21 `articles.*` columns), so the code rightly held it back and the cards lost read time. The plan was wrong, not the code.
- **WP4 7, "On now".** The block is titled "On now: Des Moines restaurants" (`src/components/articles/RelatedArticles.tsx:84`) over the top four rows by popularity, with no open-now check.
- **WP5 6, index leaders.** "Leading: X" comes from `voting_winners`, which filters `entity_id IS NOT NULL` (`20260823000001:56`), so a write-in that leads the category page never leads the index (`src/pages/BestOf.tsx:41-49`). A failed tallies RPC maps every category to 0 and prints "No votes yet" (`useVoting.ts:158-174`).
- **WP5 7, honest results.** The page withholds ranking below 25 votes, but `ItemListSchema` still publishes a ranked list named "Best Best Pizza in Des Moines" from any sample (`src/pages/BestOfCategory.tsx:56-84`).

`plan-stay.md:11` lists "private ballots" as a strength. That's false in production: "Public read votes" `USING (true)` is live (`docs/RLS_AUDIT.md:690`).

## Where it stands

- **The planner works and then lies at the edges.** It's free, needs no login, makes three requests, and its chunk is 7.6KB gzip. But Saturday reads "Nothing listed yet" while a festival runs all weekend, a 14-day window silently stops partway, and nothing links into it from a hotel page, the visitor guide or getting around.
- **Four surfaces show numbers the data can't back.** "0 views" on every article and a "Most Popular" sort over zeros (`src/pages/Articles.tsx:238,368-371`; `increment_article_view` isn't in the snapshot). A best-of ItemList below the voting floor. "Highest Rated" sorting by hotel class (`Hotels.tsx:85`). Garages and drive times with no source.
- **Hotels show admin-import guesses as fact.** `src/components/GooglePlacesHotelTools.tsx:305-333` hardcodes check-in "3:00 PM" and check-out "11:00 AM", defaults `price_range` to "$$" and `brand_parent` to "Independent", and writes Google's review average into `star_rating`, which the detail page prints as "4.5 stars" and emits as schema.org `starRating`.
- **Leads go nowhere.** The RFP form confirms "Request received" into `rfp_submissions`, which no code reads (only `src/hooks/useMeetingVenues.ts` touches it). `contact_submissions` already has an admin inbox (`src/components/admin/FeedbackInbox.tsx`), anon INSERT (`docs/RLS_AUDIT.md:231`) and support-ticket mirroring (`20260709000035:146`).
- **One committed migration is a trap.** `20260919000010` adds `increment_article_view`, which UPDATEs `articles`. The BEFORE UPDATE trigger `update_articles_updated_at` (`20250825195148:110-114`) sets `updated_at = now()` on every update. Applied as written, one page view makes an article read "Updated today" to people, to JSON-LD `dateModified` and to both sitemap generators.
- **Keep:** `resolveBooking`/`hotelRateLabel` as the one booking and rate truth with no arithmetic, `safeWebUrl` on every href, the three-state article and hotel detail pages, `TransitFactSet` with `verificationLine` and its staleness test, aggregate-only vote RPCs with the 25-vote floor, keyset paging on What's New, and `?from=&to=` in the planner URL. All eight Plan & Stay specs run in the smoke lane and pass against a placeholder build.

## What makes it ours

1. **A trip page that answers for your dates and means it.** Multi-day events on every day they run, "Ongoing, through Dec 31" in place of a stale clock time, "Showing through Oct 14" when the list is cut, and the hotels nearest the venue hosting most of the window's events. Built on `src/hooks/useEventsInRange.ts`, `src/lib/dateOnly.ts`, `useHotelPins` (`src/hooks/useHotels.ts`) and `useVenueMatchRows` (`src/hooks/useVenues.ts:157`). Eventbrite and Catch Des Moines list events; neither says "nothing on Saturday" and means it.
2. **A free trip calendar, no account, no AI.** Star events per day in the window, keep the picks in the URL (`?e=id,id`) and in `storage` from `src/lib/safeStorage.ts` under a versioned key, and download one `.ics` built with the existing `buildTripICS`/`centralWallClock` in `src/lib/tripCalendar.ts`. A visitor from Denver gets Des Moines wall-clock times. It gives everyone the AI planner's calendar export without the missing `trip_plans` tables (D1).
3. **Dinner before the show, per day.** For each day in the window, the day's top located event and the two or three closest restaurants open before it starts, from `restaurantBoxes` and `pickDinnerBeforeShow` in `src/lib/tonightPairings.ts` (read-only) and `getRestaurantOpenStatus` in `src/lib/restaurantHours.ts`. This is the per-day pairing `plan-stay.md` recorded under "Conflicts resolved" and never scheduled.
4. **What's on near this hotel.** Each hotel page lists events within a mile of that hotel over the next seven days (or the trip window carried in `?from=&to=`), from `useEventsInRange` rows sorted by `haversineDistance` (`src/lib/geo.ts`) to the hotel, with "Plan these dates" into `/trip-planner`. Booking sites and TripAdvisor list static attractions next to a hotel, not Saturday's shows. It renders only for hotels with coordinates, which is why D9 is the first deferred item.
5. **Book direct, said plainly.** Every booking button names the host you land on ("Book on hilton.com, we earn a commission"), decoded from the affiliate URL `resolveBooking` already holds, and no page shows a price it can't stand behind (`hotelRateLabel`). The affiliate disclosure page lists the programmes that actually exist (`BRAND_CONFIGS` in `generate-hotel-affiliate-urls/index.ts:46-76`).

Considered and not chosen: a dated hotel hand-off (check-in and check-out parameters on the booking link) is under **Rejected**; year-over-year best-of archives and article venue re-checks need new columns and wait for D5 and a publish-time job.

## How the packages fit together

WP1-WP5 own disjoint files and can run in parallel in one tree. **WP6 lands last**: it's the only package that edits `playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`, `package.json`, `scripts/prerender-routes.mjs` and `public/sitemap-static.xml`. Every other package writes its Playwright spec as a new file under `tests/`, calls `installFixtureBackend(page)` from `tests/support/fixtureBackend.ts`, and adds its own tables with `page.route` afterwards (the last handler wins). Nobody edits `fixtureBackend.ts`. Existing specs a WP already owned in the first pass (`tests/stay.spec.ts`, `tests/trip-planner-window.spec.ts`, `tests/visitors-guide.spec.ts`, `tests/getting-around.spec.ts`, `tests/articles.spec.ts`, `tests/whats-new.spec.ts`, `tests/best-of-voting.spec.ts`) stay with that WP and may be edited there.

WP2 and WP3 import `useEventsInRange` from WP1 without changing its signature. WP1 adds a return field (`truncatedAfter`) and a behaviour change to `groupByCentralDay`; neither breaks those imports.

Cross-plan files, read-only here:
- **Home:** `src/hooks/useHotels.ts` (`useHotels`, `useHotelPins`, `useHotelFilterOptions` used as they are), `src/components/SEOHead.tsx`, `src/lib/queryKeys.ts`, `src/lib/tonightPairings.ts`, `src/lib/isPrerender.ts`.
- **Events:** `src/hooks/useEventLanding.ts`, `src/components/EventHotelCallout.tsx`, `src/pages/EventsThisWeekend.tsx`, `scripts/__tests__/json-ld-escape.test.mjs`, `scripts/generate-dynamic-sitemaps.ts`.
- **Explore:** `src/hooks/useVenues.ts` (`useVenueMatchRows` used as is), `src/lib/venuePages.ts`, `src/components/NewsletterSignup.tsx`, `src/pages/AttractionDetails.tsx`.
- **Eat & Drink:** `src/hooks/useOpenNowRestaurants.ts`, `src/lib/restaurantHours.ts`.
- **Search:** `src/components/search/SearchResultSection.tsx`.
- **Business:** `src/hooks/useContactForm.ts` (called with an existing `InquiryType`; the union isn't widened).
- `src/lib/jsonLd.ts`, `src/lib/reservations.ts` (`safeWebUrl`), `src/lib/geo.ts`, `src/components/ErrorState.tsx`, `src/components/RouteCanonical.tsx`, `src/components/schema/ItemListSchema.tsx` and `src/components/OptimizedImage.tsx` are consumed unmodified.

`.github/select-star-baseline.json` is shared: WP3 removes one line (`useMeetingVenues`); rebase if another plan touches it.

---

## WP1: Trip planner, honest window and a free trip calendar

**Goal:** the date window shows every event on every day it runs, says when it's cut, refuses past dates, and lets a visitor keep and export a shortlist without an account.

**Files:** `src/components/trip/DateWindowPlanner.tsx`, `src/hooks/useEventsInRange.ts`, new `src/hooks/__tests__/useEventsInRange.test.ts`, `src/lib/dateOnly.ts` (+ its existing test), `src/pages/TripPlanner.tsx`, `src/hooks/useTripPlanner.ts`, `src/lib/tripCalendar.ts` (+ its existing test), new `src/lib/tripShortlist.ts` (+ `src/lib/__tests__/tripShortlist.test.ts`), new `src/components/trip/TripShortlist.tsx`, new `src/components/trip/DayDinnerPairing.tsx`, new `src/hooks/useWindowDinnerRestaurants.ts`, `src/components/trip/TripItineraryDays.tsx`, `tests/trip-planner-window.spec.ts`, new `tests/trip-planner-pass2.spec.ts`.

1. **P1 / S. Multi-day events on every day.** `groupByCentralDay` (`useEventsInRange.ts:82-90`) puts each row under one day. Push a row with `end_date` into every Central day from `max(start, window.startDay)` to `min(end, window.endDay)`. On days after its start, and on day one for a row that started before the window, render "Ongoing, through MMM d" instead of `formatEventTimeOnly` (`DateWindowPlanner.tsx:198-200`). Unit-test a Fri-Sun festival (all three days) and a March-to-December exhibit (label, no clock time).
2. **P1 / M. Ongoing rows can't starve the window.** Split the query: rows starting inside the window (`gte('date', start)`, order by date, limit 100) and rows that started earlier and are still running (limit 20, order by `end_date`). Return `truncatedAfter`, the last Central day loaded, when the in-window query hits its limit. The heading line says "Showing through Wed, Oct 14", and every later day reads "More on this day" linking `/events?date=YYYY-MM-DD` in place of "Nothing listed yet."
3. **P1 / S. No past windows.** `tripWindowProblem` returns "Pick dates from today on." when `to < centralDateOf()`. A stale `?from=&to=` in the URL falls back to `defaultWindow()` with a one-line note. Pin the clock in both planner specs with `page.clock.setFixedTime` before the hardcoded 2026-10-09 fixtures go stale on Oct 12.
4. **P1 / M. The hotels are reachable on a phone.** Every event in the window renders flat (`DateWindowPlanner.tsx:182-216`), so "Stay near the action" sits screens down. Cap each day at 5 rows with a "Show all N on Saturday" button (`aria-expanded`), and put a summary under the window heading ("24 events, 5 hotels within 1 mi") whose hotel count is an in-page link to the stay section. Category chips are out of scope; the count and the cap fix the scroll.
5. **P1 / S. "Near the action" means a venue.** Replace the arithmetic-mean centroid (`:76-90`) with the venue hosting the most window events that has finite coordinates, from `useVenueMatchRows()` in place of `useVenues()` (`:72`, which is `select('*')`). Cap hotels at 15 miles and say "No hotels within 15 miles" beyond. When the events query failed, the stay section says "Hotels are ranked by distance to your events, which didn't load" and links `/stay`, instead of the false "None of these events has a mapped location" (`:224-245`).
6. **P1 / M. Free trip calendar (bet 2).** `tripShortlist.ts` holds the pick list: parse and write `?e=` (ids, max 30), mirror to `storage` under `tripShortlist.v1`, and build the `.ics` through `buildTripICS`/`centralWallClock`. Each event row gets a star `<button aria-pressed>` at `min-h-11`. `TripShortlist` shows the count, the picks by day and "Add to calendar". Events with no start time export as all-day. No request is added.
7. **P2 / M. Dinner before the show (bet 3).** `useWindowDinnerRestaurants` issues one restaurants request bounded by `restaurantBoxes()` over the window's top event per day (the query shape `useTonightPairings` uses), with the visitable-status and `is_merged` filters. `DayDinnerPairing` renders up to three per day through `pickDinnerBeforeShow`, "0.3 mi, open until 10 PM", and hides when none qualify. Enabled only after the event query settles and not during prerender.
8. **P2 / S. Focus and prerender.** After "Show what's on", move focus to `#trip-events-heading` (`tabIndex=-1`). Render the date-dependent section client-only when `isPrerender()` is true, so the static HTML carries the h1, form and FAQ and not the build week's events (`TripPlanner.tsx:71-76,130`).
9. **P2 / S. Latent AI-path fixes, behind `AI_PLANNER_AVAILABLE`.** `fetchSharedTrip` throws on the items error (`useTripPlanner.ts:440-447`). `reorderItems` throws on any `result.error` (`:315-325`). Drop the mutation's own toast so a failed generate reports once (`:199-202`). Read `isLoading` from `useSubscription` and hold Generate until it settles (`TripPlanner.tsx:224-263`). Replace "Insider: 5 AI trips per month." with `TRIP_PLANNER_MONTHLY_QUOTA` from `src/lib/planBenefits.ts` (`:349`). Label per-stop costs and the total "AI estimate" (`TripItineraryDays.tsx:128`, `TripPlanner.tsx:704-708`).

**Acceptance:**
- A fixture festival Oct 9-11 appears under Friday, Saturday and Sunday; Saturday and Sunday say "Ongoing, through Oct 11".
- With 100 in-window fixture rows ending on day 5 of a 14-day window, days 6-14 link "More on this day" and none reads "Nothing listed yet."
- `?from=2020-01-01&to=2020-01-03` renders the default window, not 2020.
- Starring two events puts `e=` in the URL, survives reload, and the downloaded `.ics` has two VEVENTs with `DTSTART` in UTC matching Central wall time.
- No `useVenues()` import in `DateWindowPlanner.tsx`.

**Verify:** `npm run test:unit` (useEventsInRange, dateOnly, tripShortlist, tripCalendar), `tests/trip-planner-window.spec.ts` and new `tests/trip-planner-pass2.spec.ts` (fixture events, hotels, venues and restaurants via `page.route`), `npm run validate`.

---

## WP2: Hotels, truth in the data path

**Goal:** `/stay` shows a hotel on the first phone screen, every label says only what the row supports, and each hotel page answers "what's on while I'm here".

**Files:** `src/pages/Hotels.tsx`, `src/pages/HotelDetails.tsx`, `src/components/HotelCard.tsx`, `src/components/schema/HotelSchema.tsx`, `src/lib/hotelBooking.ts` (+ its test), `src/pages/AffiliateDisclosure.tsx`, `src/components/AffiliateDisclosureBanner.tsx`, `src/components/GooglePlacesHotelTools.tsx`, new `src/components/hotels/HotelNearbyEvents.tsx`, new `src/lib/hotelTimes.ts` (+ `src/lib/__tests__/hotelTimes.test.ts`), `tests/stay.spec.ts`, new `tests/stay-pass2.spec.ts`.

1. **P1 / S. "Nearest first" only when true.** Derive the result line from `nearRows` (`Hotels.tsx:655`): "nearest X first" only when at least one row has a distance; "No hotel locations yet, so these are listed A-Z" when none do; "N with a known location, nearest first; M listed after" when some do.
2. **P1 / S. Name the host, not the network.** In `resolveBooking`, derive the label from the destination: decode the Awin `ued`, CJ `url` or Partnerize `destination:` parameter, else fall back to `safeWebUrl(hotel.website)`'s host, and render "Book on hilton.com". `bookingProviderName` maps network names to null. Keep `rel="sponsored"` and the inline disclosure. Change the `stay.spec.ts` fixture to `affiliate_provider: 'Awin'` with an awin1.com URL.
3. **P1 / S. Admin import stops inventing values.** `GooglePlacesHotelTools.tsx:305-333`: insert null for `check_in_time`, `check_out_time` and `price_range` when the source has none; map Places `PRICE_LEVEL_*` enum strings to 1-4 before building `$` (today `Math.max(string, 1)` is NaN and stores ""); leave `brand_parent` null instead of "Independent"; stop writing `hotel.rating` or the function's review-derived `star_rating` into `star_rating`. The cleanup of rows already imported is D15.
4. **P1 / S. Sorts and badges that mean what they say.** Rename "Highest Rated" to "Hotel class" and the price sorts to "Typical rate: low to high / high to low" (`Hotels.tsx:80-88`); keep the `sort=` values so old links work. Show the featured strip, and exclude its ids from the grid, only when `sortBy === 'featured'` (`:410-415`). Rewrite `AffiliateDisclosureBanner` to one line with "How we choose Featured" linking the disclosure page, and say there that Featured is the editor's `is_featured` flag.
5. **P1 / S. A hotel on the first phone screen.** At 390x844 the hero (`Hotels.tsx:483-519`), disclosure box and controls push every card below the fold. Shrink the hero to h1 plus search (no subtitle below `sm`), collapse the disclosure as above, and put Near and Sort on one row with Filters.
6. **P1 / S. The disclosure page names real partners.** `AffiliateDisclosure.tsx:56-62,88-92` claims Booking.com, Hotels.com, TripAdvisor and "direct hotel partnerships", and "Book Now" buttons. List what `BRAND_CONFIGS` wraps (Marriott via Partnerize; Hilton and Hyatt via Awin; IHG, Choice, Wyndham and Best Western via CJ) and use the button wording from item 2.
7. **P1 / M. What's on near this hotel (bet 4).** `HotelNearbyEvents` on `HotelDetails` (next to `NearbyVenues`, `:430`) reads `useEventsInRange` for `?from=&to=` if present, else today plus 6 days, keeps rows within 1 mile of the hotel by `haversineDistance`, shows up to 5 with day, time and distance, and links "Plan these dates" to `/trip-planner?from=&to=`. It renders nothing for a hotel without coordinates. `Hotels.tsx` gets a "Pick your dates" link above the grid to the same place.
8. **P2 / S. Unknown `?near=` says so.** While venues load and the slug isn't a fixed place, show the skeleton rather than the default list. Once loaded, an unmatched slug shows "We don't have a location for 'nope' yet" with a Clear button that drops the param (`:354`). Switch the venue list to `useVenueMatchRows()` (`:342`) and skip venues without coordinates in the Near options.
9. **P2 / S. The arena's current name.** Display `currentVenueName` for the fixed place (`Hotels.tsx:129`) and the SEO copy (`:755-756`); keep the `wells-fargo-arena` slug.
10. **P2 / S. Filters from live rows; search in the URL.** Build Area and Hotel type options from `useHotelFilterOptions()` (`useHotels.ts:347-381`) with the constants as the loading fallback. Hold `q`, `type` and `amenity` in the URL through `useUrlFilters` (debounced for `q`).
11. **P2 / S. Schema that validates.** `hotelTimes.ts` parses "3:00 PM" or "15:00" to `HH:MM` and returns null otherwise; `HotelSchema.tsx:80-81` omits unparseable times, passes `image` through `safeWebUrl`, and emits `starRating` only when `google_place_id` is null. `/stay` moves from raw Helmet (`Hotels.tsx:460-477`) to `SEOHead` with canonical, breadcrumbs and an `ItemListSchema` of the first page's `/stay/<slug>` URLs; the description becomes "Compare Des Moines hotels by area and by distance to the venue you're visiting."
12. **P2 / S. Detail page uses its own SEO fields.** `HotelDetails.tsx:137-158` uses `seo_title`/`seo_description` when present, renders `geo_summary` and `geo_key_facts` under About, and `geo_faq` as a visible FAQ plus FAQPage JSON-LD through `toJsonLd` only when rows exist (all in the snapshot).
13. **P2 / S. Detail a11y.** Breadcrumb `nav` gets `aria-label="Breadcrumb"` and `aria-current`, chevrons `aria-hidden` (`:199-216`); `Button asChild` instead of a button inside a link (`:116-118,210-215`); guard `star_rating` and `total_rooms` with `!= null && > 0` (`:271,479`) so a literal 0 doesn't render.

**Acceptance:**
- With fixture hotels that have no coordinates, `/stay?near=wells-fargo-arena` reads "listed A-Z" and never "nearest".
- An Awin-wrapped Hilton link reads "Book on hilton.com"; no page contains "Book via Awin" or "Commission Junction".
- At 390x844 the first `HotelCard` title is inside the viewport.
- A hotel with coordinates and a fixture event 0.4 mi away lists that event and links `/trip-planner?from=...&to=...`; a hotel without coordinates renders no block.
- Hotel JSON-LD has `checkinTime: "15:00"` for "3:00 PM" and no `starRating` for a row with `google_place_id`.

**Verify:** `npm run test:unit` (hotelBooking, hotelTimes), `tests/stay.spec.ts`, new `tests/stay-pass2.spec.ts`, axe and touch-targets pointed at `/stay` and `/stay/<slug>`, `npm run validate`.

---

## WP3: Visitor guide, getting around, group travel

**Goal:** every figure on these pages has a source or is gone, the weekend module shows only what's still ahead, and a group request reaches a person.

**Files:** `src/pages/VisitorsGuide.tsx`, `src/pages/GettingAround.tsx`, `src/pages/GroupTravel.tsx`, `src/lib/transitFacts.ts` (+ its test), `src/hooks/useMeetingVenues.ts`, `src/hooks/__tests__/useMeetingVenues.rfp.test.ts`, `.github/select-star-baseline.json` (one line), `tests/visitors-guide.spec.ts`, `tests/getting-around.spec.ts`, new `tests/group-travel.spec.ts`.

1. **P1 / M. RFPs go to the inbox that exists.** Send the form through `useContactForm().submitContactForm` into `contact_submissions` with `inquiry_type: 'business'`, subject "Group RFP: <event_name>", and a message built from the fields, `sourcePage: '/group-travel'` (the `PartnershipInquiryForm.tsx:25-49` pattern). Stop calling `useSubmitRfp`; leave `rfp_submissions` and its hook in place (additive). Replace the toast with an inline `role="status"` confirmation naming the reply address. Drop "through its website above" from both strings (`GroupTravel.tsx:67-68,372-373`).
2. **P1 / S. This weekend means from now.** Replace the `useEventLanding` call (`VisitorsGuide.tsx:70`) with `useEventsInRange(today, sunday)` from WP1, which includes ongoing rows and starts at today rather than Friday, and slice to 6 on the client. In the prerender capture render only the heading and the `/events/this-weekend` link (`isPrerender()`).
3. **P1 / S. Distances computed, not typed.** Rebuild `DISTANCE_TABLE` (`GettingAround.tsx:46-54`) from stored coordinates as "x.x mi straight line" from a named downtown point, drop drive times and "DART bus", and link DART's trip planner. Drop the skywalk length (`transitFacts.ts:162`) unless sourced. `VisitorsGuide.tsx:210` reads `AIRPORT_TO_DOWNTOWN.summary` instead of its own copy. Both hero lines claim sourcing only for fares ("fares carry their source and check date").
4. **P1 / M. Garages from a source or not at all.** Move garages into a `TransitFactSet` with `sourceUrl` (the city/ParkDSM list) and `verifiedAt`, render `verificationLine` under the grid, and include only garages checked there with their own entrance coordinates. If none can be checked in the PR, remove the cards and link the ParkDSM map. `getting-around.spec.ts` asserts the garage grid carries `data-fact-set` and a "Checked against" line.
5. **P1 / S. Current names and venue links.** Link text through `currentVenueName` ("Casey's Center at the Iowa Events Center", `GettingAround.tsx:314`), slug unchanged; update the spec regex (`getting-around.spec.ts:84`). "Events at the Iowa Events Center" links the venue page under `/music/venues/` instead of a text search (`:317`).
6. **P1 / S. Into the planner.** A "Pick your dates" link in the visitor guide intro (`VisitorsGuide.tsx:175-185`) and on Getting Around to `/trip-planner`.
7. **P2 / M. Open now, live.** The "Open now" module (`VisitorsGuide.tsx:189-199`) renders three restaurants from `useOpenNowRestaurants({ enabled })`, enabled when the module scrolls into view and never at prerender, with "closes 10 PM". It hides when none are open. Same query key as `/restaurants/open-now`, so the tap-through is cached.
8. **P2 / S. Form details.** Rename the honeypot to a non-semantic name and label (`hp_ref`, "Leave this empty") so autofill doesn't trip it, and report hits through `handleError` at warning level (`GroupTravel.tsx:224`). Blank attendance becomes null, not 0 (`useMeetingVenues.ts:140`). "Request this venue" scrolls with `behavior: 'auto'` under reduced motion and announces "Added <venue> to your request" in a status line (`:218`).
9. **P2 / S. Lean venue read.** Select the card's columns instead of `*`, order with `nullsFirst: false` (`useMeetingVenues.ts:44`), and remove its line from `.github/select-star-baseline.json`.
10. **P2 / S. Table semantics.** Caption (sr-only is fine) and `scope` on the distances table header cells (`GettingAround.tsx:277`).

**Acceptance:**
- Submitting the RFP posts to `contact_submissions` with `inquiry_type: 'business'` and no request goes to `rfp_submissions`.
- With the clock pinned to a Saturday 3 PM, no weekend-module row ends before now, and a Fri-Sun festival is listed.
- No `$`, "min" or "mi" figure on `/getting-around` sits outside an element with `data-fact-set`, except the computed straight-line distances.
- No page in this WP says "Wells Fargo Arena".

**Verify:** `npm run test:unit` (transitFacts, useMeetingVenues.rfp), `tests/visitors-guide.spec.ts`, `tests/getting-around.spec.ts`, new `tests/group-travel.spec.ts`, axe on all three routes, `npm run validate`.

---

## WP4: Articles and What's New

**Goal:** the PR check goes green, no article shows a count or label the data can't support, and every link in the feed resolves.

**Files:** `src/pages/Articles.tsx`, `src/pages/ArticleDetails.tsx`, `src/hooks/useArticles.ts`, `src/lib/articleHubs.ts` (+ its test), `src/components/articles/RelatedArticles.tsx`, `src/pages/WhatsNew.tsx`, `src/components/SceneUpdateCard.tsx`, `src/hooks/useSceneUpdates.ts`, `tests/articles.spec.ts`, `tests/whats-new.spec.ts`, new `tests/articles-pass2.spec.ts`.

1. **P0 / S. Canonical in the loading branch.** Render ``<RouteCanonical path={`/articles/${slug}`} />`` and an sr-only h1 in the `isLoading` branch (`ArticleDetails.tsx:66-80`). `node scripts/check-loading-canonical.mjs` passes.
2. **P1 / S. Escaped JSON-LD.** Pass `articleSchema` to `SEOHead`'s `structuredData` (serialized by `toJsonLd`) and delete the Helmet script (`ArticleDetails.tsx:190-194`). Moving `pages/ArticleDetails.tsx` from BASELINE to REQUIRED_CLEAN (`scripts/__tests__/json-ld-escape.test.mjs:112`) is a one-line hand-off to Events pass 2.
3. **P1 / S. No view counts until they count.** Add `VIEW_COUNTS_LIVE = false` in `useArticles.ts`. While false, hide the eye count on cards (`Articles.tsx:368-371`) and "N views" on detail (`ArticleDetails.tsx:288-291`), drop the "Most Popular" option (`Articles.tsx:238`), and map `?sort=popular` to newest so old links work. It flips only after D13 lands and the probe shows the RPC.
4. **P1 / S. AI label on every AI article.** Add `quality_score` (in the snapshot, written only by `ai-article-pipeline`) to the list and detail column sets and treat `quality_score != null` as AI in `isAiArticle` (`articleHubs.ts:87-89`). When `is_auto_published` is false, the notice says "Drafted by AI, scored by automated checks, and published by a person on our team." Remove "trained on public data" and "reviewed by a human editor" from `AI_ASSISTED_NOTICE` (`:94-95`); neither is recorded. The list card's badge gets a short `aria-label` ("AI-written").
5. **P1 / S. Every category is pickable.** A `['articles','categories']` query selects `category` for published rows (limit 500), dedupes client-side, and feeds the Select (`Articles.tsx:78-84`), keeping the selected-category fallback.
6. **P1 / M. "On now" that's true.** In `RelatedArticles.tsx:83-101`, restaurants filter through `getRestaurantOpenStatus` and prefer `cuisine` matches with the article's tags before popularity; heading "Open now" only when that filter ran, else "Places to try". Events use `end_date`/`event_start_utc` so one under way today isn't dropped (`useArticles.ts:525`). Heading "Coming up" for events.
7. **P1 / S. Feed links that resolve.** The slug lookup selects `id, slug, status, is_merged` (`useSceneUpdates.ts:82-96`). A missing or merged restaurant renders no link (`SceneUpdateCard.tsx:36-40`), and a closed one shows "Now closed" in place of "New".
8. **P2 / S. Chip counts without the 2,000-row body.** One HEAD count per known type plus a `limit(1)` for the latest date, in `Promise.all` (`useSceneUpdates.ts:174-185`). On a count error show every chip rather than none.
9. **P2 / S. Card a11y.** Link on the `CardTitle` with a stretched hit area, as `SceneUpdateCard` does (`Articles.tsx:329-414`); `aria-pressed` on the grid/list toggles and `aria-expanded`/`aria-controls` on Filters (`:172-203`).
10. **P2 / S. Search says what it searches.** Add `tags.cs.{q}` to the `or()` (`useArticles.ts:394-398`), and drop "comprehensive" and "Stay informed with our latest content" from the description (`Articles.tsx:124`).
11. **P2 / S. Central dates; errors keep the filters.** Format with `formatInTimeZone(..., DES_MOINES_TIME_ZONE)` (`Articles.tsx:86-92`, `ArticleDetails.tsx:40-48`). A failed list keeps the header and filters mounted, shows ErrorState in the grid, and calls `handleError` (`Articles.tsx:100-118`).
12. **P2 / S. Speakable and outbound links.** Add `article-content` to the prose container so `SpeakableSchema`'s selector matches (`ArticleDetails.tsx:195-202,391-393`). react-markdown's `a` renders external hosts with `rel="nofollow noopener"` and same-origin paths as `<Link>`.
13. **P2 / S. ItemList entries with URLs.** Add `url` from the card's entity link to each What's New ItemList entry and omit entries with none (`WhatsNew.tsx:54-68`).

**Acceptance:**
- `node scripts/check-loading-canonical.mjs` exits 0.
- No "views" text and no "Most Popular" option on `/articles` or an article page; `/articles?sort=popular` renders newest-first.
- A fixture article with `quality_score: 72, is_auto_published: false` shows the AI badge and the "published by a person" notice.
- A category present only on page 3 of fixtures is in the dropdown on first load.
- A scene update whose restaurant id isn't returned renders no link; no card links `/restaurants/<uuid>`.

**Verify:** `node scripts/check-loading-canonical.mjs`, `npm run test:unit` (articleHubs), `tests/articles.spec.ts`, `tests/whats-new.spec.ts`, new `tests/articles-pass2.spec.ts`, `npm run validate`.

---

## WP5: Best-of voting

**Goal:** the booth never offers a change production will refuse, the index and schema agree with the category page, and results only count rows that are real places.

**Files:** `src/pages/BestOf.tsx`, `src/pages/BestOfCategory.tsx`, `src/components/VotingBooth.tsx`, `src/hooks/useVoting.ts`, new `src/lib/votingStatus.ts`, new `supabase/migrations/20260930000003_votes_update_policy.sql`, new `scripts/check-upsert-update-policy.mjs` (+ `scripts/__tests__/check-upsert-update-policy.test.mjs`), `tests/best-of-voting.spec.ts`, new `tests/best-of-pass2.spec.ts`, new `src/pages/__tests__/bestOfCategorySeo.test.tsx`.

1. **P0 / S. A vote change that works, or isn't offered.** Write `20260930000003_votes_update_policy.sql` with only the "Users can update own votes" FOR UPDATE policy from `20260829000001:32-37` (`DROP POLICY IF EXISTS` then `CREATE`). It loosens access, so it's single-release safe, and it also fixes Android's upsert; applying it is D14. Until then, `VOTE_CHANGE_AVAILABLE = false` in `votingStatus.ts`: after voting the booth shows "Your vote: X. Votes are final for this round." with no Change button, and the header drops "You can change it while voting is open" (`VotingBooth.tsx:207`). The D14 PR flips the flag. Keep the error `code` on the thrown error (`useVoting.ts:435`) and map 42501 to "We couldn't change your vote. Your earlier vote still counts."
2. **P1 / S. The index names the right leader.** Open and early rows read "Top listed place: X (n votes)" (`BestOf.tsx:41-49`), since `voting_winners` excludes write-ins. Closed rows keep "Top place".
3. **P1 / S. A failed tally isn't zero.** `useVotingCategories` returns `countsFailed` (`useVoting.ts:158-174`); the index renders "Vote counts unavailable" and hides rank numbers instead of "No votes yet".
4. **P1 / S. Schema only for a ranking the page shows.** Emit `ItemListSchema` only when `ranked` (`BestOfCategory.tsx:56-84`), name it `${category.name} in Des Moines` with a leading "Best " stripped, and use the on-page rank as `position`. `bestOfCategorySeo.test.tsx` asserts nothing renders below `MIN_VOTES_FOR_RANKING`.
5. **P1 / S. Search offers real places.** Add `.not('is_merged','is',true)` and the visitable-status filter to the restaurants search and `.eq('is_active', true)` to attractions (`VotingBooth.tsx:102-105`), select `city` and `address`, and show them under the name.
6. **P2 / S. "One vote per account."** Replace "per person" (`VotingBooth.tsx:208`) until D5 adds a confirmed-email rule.
7. **P2 / S. No ballot flash.** Hold a skeleton while `useUserVote` is loading for a signed-in user (`VotingBooth.tsx:67,200`).
8. **P2 / S. Unknown names and parallel reads.** Name lookups check their errors and render "Name unavailable" instead of "Unknown" (`useVoting.ts:306-350`); restaurants and attractions enrichment run in `Promise.all`, and categories and tallies are fetched in parallel (`:138-156`). Search thumbnails use `OptimizedImage` at 64px (`VotingBooth.tsx:329-336`).
9. **P2 / S. No ranks over zeros.** Show rank numbers on the index only when some category has votes, and pluralise the leadersFailed count (`BestOf.tsx:145-156`).
10. **P2 / S. Category page SEO.** `SEOHead` with breadcrumbs and a description from real data (total votes, closing date, the leader once ranked), `robots="noindex, follow"` below the minimum, and "Results" rather than "Live results" for an upcoming category (`BestOfCategory.tsx:50,73-77`). Dropping sub-minimum pages from `sitemap-best-of.xml` is a hand-off to Events pass 2.
11. **P2 / S. An offline guard for upserts.** `check-upsert-update-policy.mjs` fails when code under `src/` calls `.upsert()` on a table with no FOR UPDATE policy in `supabase/migrations/`. WP6 wires it into `validate`.

**Acceptance:**
- With `VOTE_CHANGE_AVAILABLE=false`, a signed-in fixture voter with an existing vote sees no Change button and no "change it" copy.
- A fixture where a write-in has 10 votes and a listed place 3 shows "Top listed place" on `/best-of`, never "Leading".
- With the tallies RPC returning 500, `/best-of` contains no "No votes yet".
- A category with 2 votes emits no ItemList; no page contains "Best Best".
- The new migration contains only `DROP POLICY IF EXISTS` and `CREATE POLICY ... FOR UPDATE`.

**Verify:** `npm run test:unit` (bestOfCategorySeo), `node --test scripts/__tests__/check-upsert-update-policy.test.mjs`, `tests/best-of-voting.spec.ts`, new `tests/best-of-pass2.spec.ts` (with axe on `/best-of`), `npm run validate`.

---

## WP6: Lanes, routes and the validate hook (lands last)

**Files:** `playwright.smoke.config.ts`, `.github/workflows/e2e.yml`, `.github/e2e-lane-baseline.json`, `package.json`, `scripts/prerender-routes.mjs`, `public/sitemap-static.xml`. Other plans append to all six; rebase and append.

1. **P1 / S. Register the new specs.** Add `trip-planner-pass2`, `stay-pass2`, `group-travel`, `articles-pass2` and `best-of-pass2` to the smoke `testMatch` and to the matching step in `e2e.yml`. `npm run check-e2e-lanes` shows no Plan & Stay orphan, and the baseline doesn't grow.
2. **P2 / S. `/group-travel` and `/whats-new` in the sitemap.** Add `/group-travel` to `PRERENDER_ROUTES` and `/whats-new` to `SITEMAP_ONLY_ROUTES` (prerendering waits for D4 to clean the feed), both in `sitemap-static.xml`. Run `node scripts/check-seo-route-parity.mjs`.
3. **P2 / S. Wire the upsert guard.** Add `node scripts/check-upsert-update-policy.mjs` to the offline checks in `validate`.

**Acceptance:** `npm run check-e2e-lanes` passes; `check-seo-route-parity` passes; `npm run validate` runs the upsert guard.

**Verify:** the smoke config against a placeholder build (`npx vite preview --port 4173 --host 127.0.0.1`, `PLAYWRIGHT_CHROMIUM_PATH=...`, `--project=chromium-desktop`), `npm run check-e2e-lanes`, `npm run validate`.

---

## Deferred (needs a live migration, a deploy, a secret, or a decision)

Carried from the first pass and unchanged: D1 (trip planner storage), D3 (generate-itinerary hardening), D4 (`scene_updates` trigger guard), D5 (vote integrity), D7 (`articles.ai_generated`), D8 (per-day weather), D10 (shared trip page), D11 (`weekend_guides`). Additions and changes:

- **D9, promoted to P0 / M. Hotel coordinates.** `/stay?near=`, `NearbyHotels` on venue, event and attraction pages, the planner's "Stay near the action" and WP2's "What's on near this hotel" all read `hotels.latitude`. The seed (`20260217000001:9`) and the admin import don't write it, and `search-new-hotels`' field mask (`index.ts:275`) doesn't ask for `places.location`. First run a read-only count of active hotels with null latitude. Then backfill from stored addresses through the geocoding path other tables use, add `places.location` to the mask and carry it through the admin insert, add `hotels` to `data-quality-heal`, and show the missing count in HotelManager. Edge deploys plus a data backfill.
- **D2, verify.** Run `supabase db push` for `20260924000001`, run the non-admin PATCH check its header asks for, and regenerate `docs/RLS_AUDIT.md`.
- **D6, split.** The `guide_requests` anon INSERT can close now: web stopped writing it in 0982788 and no function or mobile client writes it. Dropping the policy is a tightening of a write no shipped client makes. Retention of the rows already stored (names and mailing addresses) needs Dj's decision. `rfp_submissions` stays on the D6 path, or retires once WP3 item 1 has been live a release.
- **D12, extended.** A data migration for `meeting_venues`: `website` and lat/lng from `venues`/`known_venues`, capacities (the Iowa Events Center row says 15000 against "16,980 seats"), current names, no unsourced superlatives ("Iowa's largest winery"), plus an admin UPDATE policy on `is_admin()` so later fixes don't need a migration.
- **D13 P0 / M. Article view counter must not touch `articles`.** Block applying `20260919000010` until an additive migration moves counting to `article_view_counts(article_id uuid primary key references articles, views bigint not null default 0)` with public read and no client write, and `increment_article_view` upserts there. Otherwise every view resets `updated_at`, `dateModified` and sitemap `lastmod`. Rate-limit the RPC per IP and slug before counts are shown. The `word_count` half of that migration is fine as written. Needs Dj's approval.
- **D14 P0 / S. Apply the votes UPDATE policy.** `supabase db push` for WP5's `20260925000001`, then flip `VOTE_CHANGE_AVAILABLE`. Separately, the SELECT tightening in `20260829000001` is Dj's call: ballots are public today, and the migration's "free while votes has zero rows" argument ends with the first real ballot. Put the trade-off to him before the booth is promoted anywhere.
- **D15 P1 / S. Clean imported hotel rows.** After a probe shows which rows have `google_place_id`, null `check_in_time`/`check_out_time` where they equal the hardcoded pair, and null `star_rating` where it came from a review average. Data migration.
- **D16 P1 / S. `search-new-hotels` is an open paid proxy.** No caller check and no rate limit (`index.ts:219-240`); anyone with the anon key spends Geocoding and Places calls. Add `requireAdminOrApiKey` after OPTIONS, then `rateLimiter`, then `validateInput` for `location` and `radius`. Only the admin UI calls it. Edge deploy.
- **D17 P1 / M. Quota ledger, ships with D1.** `generate-itinerary` counts `trip_plans` rows (`index.ts:193-198`), which the owner can delete or update, so an Insider's 5 a month becomes unlimited billed calls. Count from an append-only, service-role-written `trip_generation_ledger` inserted before the model call, month boundaries in America/Chicago. Also add `validateInput` for the body (`:220-224`): bounded arrays and strings, truncating rather than rejecting so older clients keep working. Dormant while `AI_PLANNER_AVAILABLE` is false.
- **D18 P2 / S. Hotel analytics.** Add `'hotel'` to the `log-content-metrics` allowlist (additive), then track hotel views and booking clicks, consent-gated. Edge deploy.

## Hand-offs to other plans

- **Events pass 2:** move `pages/ArticleDetails.tsx` to REQUIRED_CLEAN in `json-ld-escape.test.mjs` once WP4 item 2 lands; drop best-of categories below `MIN_VOTES_FOR_RANKING` from `sitemap-best-of.xml`; `EventHotelCallout` should say "Hotels in Des Moines" when `nearSlug` is null and use h3 under its h2 (`:67,136-141`); `WeatherNotice` claims "indoor picks are first" while `events.is_indoor` isn't in the snapshot and nothing moves (`EventsThisWeekend.tsx:548-549`).
- **Home pass 2:** add `.order('id')` as the final tiebreaker to every sort in `useHotels` (`useHotels.ts:148-152`); the 63 seeded rows share `created_at`, so Show more can repeat or skip.
- **Search:** `hubHref` for hotels should carry the term (`/stay?q=`, `SearchResultSection.tsx:46`) once WP2 item 10 reads it.
- **Explore pass 2:** `NewsletterSignup` says "You're In! Check your inbox!" for a double opt-in (`:77`); change to "Almost there: confirm from the email we just sent", and add a `visitors-guide` source value. `AttractionDetails` passes no near target to `NearbyHotels`; a `near=attraction:<slug>` form on `/stay` can follow D9.

## Rejected

- **"Promote D9 before any further near-feature work" (hotels, P0).** The gap is real, but "probably inert in production" is unverified and the fix needs deploys and a backfill, so it's deferred as a P0 rather than planned as frontend work. WP2 item 1 stops the false claim now, and WP2 item 7 renders nothing without coordinates.
- **"Open the RFP as a mailto to the venue's `contact_email`" (holistic).** Not adopted. `contact_submissions` has a reader, moderation and ticket mirroring today; a mailto sends a planner's details to a seeded address nobody here has verified, and records nothing.
- **"Dated hotel hand-off: add check-in and check-out to the booking link" (holistic differentiator).** Affiliate links are network redirects (Awin `ued`, CJ `url`, Partnerize `destination:`) to brand sites whose date parameters differ by brand. Appending parameters we can't test risks breaking attribution. The dates are carried to `/trip-planner` and `HotelDetails` instead.
- **"The first-pass commit claims a delete-then-insert fallback" (holistic).** Irrelevant to the code: `useVoting.ts:427-429` deliberately has none, and that's the right call. The finding that stands is the missing policy (WP5 item 1, D14).
- **"Category chips in the planner" (holistic, part of the P1 on row volume).** Categories on scraped rows are inconsistent; the per-day cap and summary fix the scroll without a filter that hides events for bad reasons.
- **"Hand `useVenues` off to Explore pass 2" (holistic and trip-planner P2).** No hand-off needed: `useVenueMatchRows` (`useVenues.ts:157`) already selects `slug, name, address, latitude, longitude, capacity`. WP1 and WP2 switch to it.
- **"Server-side past-window check in `generate-itinerary`" (trip-planner P1, part).** Folded into D3; the function is off behind the flag and the client check lands in WP1 item 3.
- **"Rate-limit `increment_article_view`" (content P1, part).** Folded into D13; the RPC isn't live, and WP4 hides counts until it is.
