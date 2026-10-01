# Plan & Stay: action plan

Scope: `/trip-planner` (entry `src/pages/TripPlanner.tsx`), `/weekend`, `/stay`, `/stay/:slug`, `/visitors-guide`, `/getting-around`, `/group-travel`, `/articles`, `/articles/:slug`, `/best-of`, `/best-of/:category`, `/whats-new`.
Inputs: the holistic audit plus seven section audits (trip planner, weekend, hotels, visitor/getting-around/group, articles, best-of, what's new). Every P0 below was re-opened at the cited line on 2026-09-24. Production state comes from `scripts/db-snapshot.json` (captured 2026-08-24) and `docs/RLS_AUDIT.md`. I didn't run a live probe, so run `npm run check-schema:probe` before starting any deferred item.

## Where it stands

- The AI trip planner can't work in production. `trip_plans`, `trip_plan_items`, `get_trip_itinerary` and `generate_trip_share_code` aren't in the snapshot, and `scripts/check-mobile-schema-usage.mjs:16-19` says migration 20251126000001 was "ledgered as applied and produced nothing". Meanwhile the nav's "Plan" target (`navigationConfig.ts:91`) shows free visitors a lock card and nothing else (`TripPlanner.tsx:306-313`).
- Several pages state things that aren't true. `/visitors-guide` says "Check your email" when no code sends email (`VisitorsGuide.tsx:42-46`). `/stay` shows "No hotels available yet" under a full grid (`Hotels.tsx:505-520`). The trip-planner FAQ sells editing, printing and an unconditional trial as FAQPage schema (`TripPlanner.tsx:968,980,983`). AI articles carry a "reviewed by a human editor" notice that never renders on the auto-published ones anyway (`ArticleDetails.tsx:233,267-275`).
- There are two open write paths. Any signed-in user can update or delete every hotel, including its Book Now URL (`20260216000000_create_hotels.sql:91-105`, confirmed live in `docs/RLS_AUDIT.md:318-320,387`). Anonymous users can insert unlimited RFP and guide-request rows (`20260228000007:53`, `20260228000006:19`), and nothing reads them.
- Worth keeping: server-side paywall and quota in `generate-itinerary`, ErrorState-not-empty on My Trips and What's New, sourced DART fares in `transitFacts.ts`, private ballots with aggregate-only tallies in best-of, and react-markdown with no rehype-raw on articles.
- `/weekend` is an honest 301 to `/events/this-weekend`, a page the Events plan owns. That's why this plan's weekend work is a hand-off plus a nav fix.

## What makes it ours

1. **"I'm here Oct 9-11": free, no login.** Pick dates on `/trip-planner` and get the real events on those dates, grouped by Central day, the hotels closest to where those events are, and a link to getting around. It uses the same event rows `generate-itinerary` already grounds on (`index.ts:260-267`) and the hotel coordinates `useHotelPins` already loads (`useHotels.ts:398-412`). Catch Des Moines has a calendar and Eventbrite has listings, but neither answers this in one screen. The AI itinerary becomes the upgrade on top of it instead of the price of entry.
2. **Hotels by the thing you came for.** `/stay?near=<venue>` sorts hotels by straight-line distance to a venue, labels the distance honestly, and is linked from venue and event hotel callouts.
3. **Guides that are live data, not PDFs.** `/visitors-guide` becomes the guide: this weekend's events, open-now restaurants, where to stay, how to get around. Each article links out to current listings in its hub.
4. **Honest numbers.** Every fare, rate, count and "best of" percentage carries a source, a date, or a minimum sample. Anything that can't be sourced gets deleted. That's a trust signal the aggregators don't give.

## How the packages fit together

WP1-WP7 own disjoint files and can run in parallel. **WP8 lands last.** It's the only package that edits the Playwright lane config and baseline. Every other package writes its spec as a new file and installs its own table fixtures with `page.route` after `installFixtureBackend(page)` (the last handler wins; see `tests/support/fixtureBackend.ts:247-253`), so nobody edits `fixtureBackend.ts`.

Cross-plan ownership (read-only here, never edited by this plan):
- `src/pages/EventsThisWeekend.tsx`, `src/hooks/useEventLanding.ts`, `src/components/EventHotelCallout.tsx`, `scripts/__tests__/json-ld-escape.test.mjs` and `src/lib/tonightPairings.ts` belong to the Events plan (`docs/page-plans/events.md` WP5 and the EventDetails WP). The weekend and callout items are handed off below.
- `src/hooks/useHotels.ts`, `src/components/SEOHead.tsx`, `src/components/FAQSection.tsx` and `src/lib/queryKeys.ts` belong to the Home plan. This plan calls `useHotels`/`useHotelPins` and `SEOHead` as they are.
- `src/components/seo/HubArticles.tsx` belongs to Eat & Drink. `src/lib/restaurantHours.ts` is imported only.
- `src/components/AIDisclosureBadge.tsx`, `src/components/NewsletterSignup.tsx`, `src/components/PremiumGate.tsx` and `src/components/UpgradeModal.tsx` are consumed unmodified.

---

## WP1: Trip planner (free date-window planner, AI as the upgrade)

**Goal:** `/trip-planner` gives every visitor something useful in the first viewport, shows correct dates, and stops selling features or storage that don't exist.

**Files owned:** `src/pages/TripPlanner.tsx`, `src/hooks/useTripPlanner.ts`, `src/lib/tripCalendar.ts`, new `src/lib/dateOnly.ts` (+ unit test), new `src/hooks/useEventsInRange.ts`, new `src/components/trip/DateWindowPlanner.tsx`, new `src/components/trip/TripItineraryDays.tsx`, new `src/lib/tripPlannerStatus.ts`, new `tests/trip-planner-window.spec.ts`.

1. **P0 / S. Dates are one day early.** `new Date('yyyy-MM-dd')` parses as UTC midnight, so in Central time the trip badge (`TripPlanner.tsx:572-573`), the day header (`:636`), the My Trips cards (`:929-930`) and every `.ics` stop (`tripCalendar.ts:34`) all land on the previous day. Add `parseDateOnly()` in `src/lib/dateOnly.ts` (date-fns `parseISO`) and use it at all five sites, plus `:127`. Build the ICS stops as America/Chicago wall-clock times with `fromZonedTime`, so a visitor planning from Denver still gets Des Moines times.
2. **P0 / S. Controlled tabs; dead buttons.** `<Tabs defaultValue>` is read once at mount (`:313`), so a new or reopened itinerary never shows. "Plan a Trip" and "Plan Your First Trip" (`:850`, `:899`) query `[value="plan"]`, and Radix `TabsTrigger` doesn't render a `value` attribute (`node_modules/@radix-ui/react-tabs/dist/index.mjs:97-120`), so both buttons do nothing. Hold the tab in `useState<'plan'|'itinerary'|'my-trips'>`, switch to `itinerary` after generate and in `handleViewTrip` (`:167-172`), and move focus to the itinerary heading. Delete the `EmailCaptureModal` (`:32`, `:156`, `:990`), which fires at a signed-in subscriber the moment their trip is ready.
3. **P0 / S. FAQ matches the product.** `:980` promises swapping, adding stops, multiple versions and printing. Only reorder, `.ics` and delete ship (`addItem`/`removeItem`/`updateItem` in `useTripPlanner.ts` have no UI). `:968` hardcodes $4.99/$12.99 and "Start with a 7-day free trial" unconditionally. Rewrite the answers to what ships. Replace the price literals with a link to `/pricing`, since the server decides the charge. Word the trial as "new subscribers may be eligible for a free trial". Keep `showSchema` only once every answer is true.
4. **P0 / S. Say the AI planner is paused while its storage is missing.** Add `AI_PLANNER_AVAILABLE = false` in `src/lib/tripPlannerStatus.ts`. While it's false, hide Generate, My Trips and Share, and show one plain line ("AI itineraries are paused while we fix saving; the date planner below works"). The D1 PR flips it. In `useTripPlanner.fetchTripDetails`, throw on `itemsError` instead of returning `items: []` (`useTripPlanner.ts:218-222`). Await `navigator.clipboard.writeText` inside try/catch with `handleError`.
5. **P1 / L. Date-window planner (bet 1).** `DateWindowPlanner` sits under an ungated date-range picker. `useEventsInRange(from, to)` is a TanStack hook with a Central-day window (use `centralWindow('range')` once the Events plan's WP0 lands, and `centralDayWindow`-equivalent logic until then), the standard visibility predicate, `EVENT_LIST_COLUMNS` and limit 100, grouped by Central day. Under the events, "Stay near the action" ranks hotels from `useHotelPins()` by haversine distance to the centroid of that window's events that have coordinates, shows 3-5 with "x.x mi (straight line)", and links "See all" to `/stay?near=...` (WP2). Under that sits a "Getting here and around" link to `/getting-around`. Mirror `?from=&to=` in the URL. Put the AI "Turn this into an itinerary" button below the result as the upgrade.
6. **P1 / M. Gate the action, not the page.** Remove the outer `PremiumGate` (`:306-312`). The form renders for everyone. The existing click-time checks already send signed-out users to `/auth` (`:130-133`) and free users to `UpgradeModal` (`:137-140`), and the server enforces the tier (`generate-itinerary/index.ts:117-131`). My Trips and the itinerary view stay available to any signed-in owner, so a lapsed subscriber keeps their trips. Move the six-line AI disclosure (`:293-304`) next to the Generate button.
7. **P1 / S. Keyboard and touch.** Budget and pace are `<div onClick>` with `as any` (`:452-459`, `:482-489`), so use `RadioGroup` typed with the `TripPreferences` union. Make the day header a `<button aria-expanded>` (`:641-643`) and give the interest chips `aria-pressed` (`:426-435`). Each My Trips card becomes one button (`:907-944`). The 28px icon controls (`:658-661`, `:747-776`) get `min-h-11 min-w-11` on touch, and Delete (`:606`) goes behind `AlertDialog`.
8. **P1 / S. Extract `TripItineraryDays`** from `:632-794` so D10's shared-trip page can reuse it. Times render with `formatClockLabel` (`restaurantHours.ts:481`) instead of raw `HH:MM:SS` (`:699-700`).
9. **P2 / S. SEO and craft.** Pass `url`, `canonicalUrl` and `breadcrumbs` to `SEOHead` (`:262-266`), matching the visible Breadcrumbs (`:272-278`). Replace the gradient card (`:503`) with a flat bordered section and the `purple-500` VIP text (`:514`) with the tier token. Route errors through `handleError({ component: 'TripPlanner' })` instead of `log.error` (`:158`).

**Acceptance:**
- With `TZ=America/Chicago`, `start_date: '2026-10-02'` renders "Friday, October 2", and an 18:00 stop's ICS reads `DTSTART:20261002T230000Z`.
- Signed out at 390x844, the first viewport shows the h1, a date range and a primary button. `?from=2026-10-09&to=2026-10-11` restores the view, lists events by day and at least three hotels nearest-first, and makes no auth or subscription request.
- No `document.querySelector`, `as any`, `$4.99` or `EmailCaptureModal` remains in `TripPlanner.tsx`.
- With `AI_PLANNER_AVAILABLE=false`, no Generate, Share or My Trips control renders.

**Verify:** `npm run test:unit` (the dateOnly and tripCalendar tests), `npm run validate`, `npm run check-ui-craft`, new `tests/trip-planner-window.spec.ts` (fixture events and hotels via `page.route`), and the axe and touch-targets specs pointed at `/trip-planner`.

---

## WP2: Hotels hub and detail

**Goal:** `/stay` tells the truth about what it lists and what it costs, can't be turned into a link-injection vector through rendering, and answers "near what?".

**Files owned:** `src/pages/Hotels.tsx`, `src/pages/HotelDetails.tsx`, `src/components/HotelCard.tsx`, `src/components/schema/HotelSchema.tsx`, `src/components/admin/HotelEditDialog.tsx`, `src/components/venues/NearbyHotels.tsx`, new `src/lib/hotelBooking.ts` (+ test), new `src/lib/postgrestSearch.ts` (+ test), new `tests/stay.spec.ts`.

1. **P0 / S. False empty state.** In `Hotels.tsx:505-520` the else branch renders "No hotels available yet" whenever the filtered-empty condition is false, and that includes a populated grid, so crawlers index it too. Split it three ways: rows, then nothing; zero rows with filters, then "No hotels match" plus Clear; zero rows without filters, then "No hotels available yet".
2. **P0 / S. Escape the hotel JSON-LD.** `HotelSchema.tsx:81` does a bare `JSON.stringify` into an ld+json script on a prerendered route, fed by a table any signed-in user can write today. Use `toJsonLd(schema)` (`src/lib/jsonLd.ts:18`). Moving the file from BASELINE to REQUIRED_CLEAN in `json-ld-escape.test.mjs:101` is a one-line hand-off to the Events plan, which owns that file.
3. **P0 / S. Only http(s) hrefs.** Put `affiliate_url`, `website` and the `OpenStatusChip` URL through `safeWebUrl` (`src/lib/reservations.ts:45`) before rendering (`HotelDetails.tsx:358,410,457`, `HotelCard.tsx:148`). Refine the zod schema in `HotelEditDialog.tsx:78-79` to require the `http:` or `https:` protocol. This is the frontend half of D2 and ships without it.
4. **P1 / S. One booking truth.** `resolveBooking(hotel) -> { href, isAffiliate, label }` in `src/lib/hotelBooking.ts`. An affiliate link reads "Book via {provider}" with `rel="sponsored noopener noreferrer"` and gets an inline disclosure. A plain website reads "Hotel website" with no sponsored rel. `OpenStatusChip` gets `hotel.website`, never the affiliate URL (`HotelDetails.tsx:410`). Remove the duplicate `??`/`||` computations (`:56`, `:127`). Export it for the Events plan's `EventHotelCallout`.
5. **P1 / S. Honest rate wording.** `avg_nightly_rate` is seeded and never refreshed. Replace "From $X/night" (`HotelCard.tsx:140`) and "Average nightly rate" (`HotelDetails.tsx:351-353`) with one shared `hotelRateLabel()` in `hotelBooking.ts`: "Typically about $X/night; rates change by date". Display only, with no arithmetic.
6. **P1 / S. Real totals and more rows.** `Hotels.tsx:501` prints `hotels.length`, which is capped, so it always reads "24 of 24". Use `totalCount` (`:147`) and add a "Show more" button that uses the hook's existing `offset`.
7. **P1 / M. `?near=` (bet 2).** Add a "Near" select (venues from `useVenues`, plus the Fairgrounds and Wells Fargo Arena) and put `near`, `area`, `price` and `sort` in the URL through `useUrlFilters`. When `near` is set, sort `useHotelPins` rows by haversine distance and show "1.2 mi from X (straight line)" on each card. Add a "See all hotels near X" link at the foot of `NearbyHotels`.
8. **P1 / S. Filter panel a11y.** `FilterPanel` is declared inside the component (`Hotels.tsx:175`) and remounts on every toggle, so focus is lost. Render it as a top-level component with props. Swap the clickable `Badge` and bare `<X>` icons (`:203-212`, `:365-373`, `:401-431`) for `<button aria-pressed>` at `min-h-11`, give the chip removers "Remove Downtown filter" labels, add `aria-label="Search hotels"` and "Clear search", and prefix ids per instance (`desktop-`/`sheet-`).
9. **P2 / S. Search with commas.** `useHotels.ts:79-81` interpolates raw text into `.or()`, so "Hilton, Downtown" returns a 400 and ErrorState. Sanitize in `Hotels.tsx` with `sanitizePostgrestTerm()` from `src/lib/postgrestSearch.ts` before the term reaches the hook, since the Home plan owns the hook.
10. **P2 / S. Craft and duplication.** Featured hotels render twice (strip at `:475-484`, then the featured-first sort), so exclude the strip's ids from the grid. Delete the unused `amenityIcons` (`HotelCard.tsx:17-23`) and the hover-only overlay (`:79-83`). Give Book Now `min-h-11 px-3`. Replace the gradient hero and fallbacks (`Hotels.tsx:293-294`, `HotelDetails.tsx:232`) with a flat brand surface.

**Acceptance:**
- With fixture hotels, `/stay` has no EmptyState, and a no-match search shows only "No hotels match your filters".
- A row with `affiliate_url='javascript:alert(1)'` renders no Book link anywhere, and a description containing `</script>` appears escaped in the prerendered `/stay/<slug>.html`.
- `/stay?near=wells-fargo-arena` lists hotels nearest-first and survives a reload.
- With 63 rows the page reads "Showing 24 of 63".
- No hotel surface in this package says "From $".

**Verify:** new `tests/stay.spec.ts`, `npm run test:unit`, `npm run validate`, `npm run check-false-empty-state`, `npm run check-ui-craft`, axe on `/stay`, and `npm run build` followed by grepping the prerendered hotel HTML.

---

## WP3: Visitor guide, getting around, group travel

**Goal:** stop promising deliveries and numbers nobody backs, and turn the three pages into doors into our own listings.

**Files owned:** `src/pages/VisitorsGuide.tsx`, `src/pages/GettingAround.tsx`, `src/pages/GroupTravel.tsx`, `src/lib/transitFacts.ts`, `src/hooks/useMeetingVenues.ts`, `tests/getting-around.spec.ts`, new `tests/visitors-guide.spec.ts`.

1. **P0 / S. No phantom guide.** `VisitorsGuide.tsx:42-46` and `:61-65` never read `{ error }` (supabase-js doesn't throw), so success toasts fire on failure. No code reads `guide_requests`, and `public/` has no PDF. Remove the "Request Free Copy" tab and the mailing-address form (`:176-216`), the "2026 Edition" badge (`:104-107`) and the download-by-email form. Where the email box was, mount the existing `NewsletterSignup` (double opt-in, rate-limited) under an honest label ("Get the weekly Des Moines picks").
2. **P0 / S. Getting Around: one sourced fact set.** The body says "DART Route 8 ($1.75, ~20 min)" (`GettingAround.tsx:207`), while the page's own FAQ deliberately doesn't name the route (`:35`). The taxi figure "$18-22" (`:206`), the BCycle prices (`:150-153`) and the skywalk hours (`:127` vs `:36`) are all unsourced. Move the airport, BCycle and skywalk facts into `TransitFactSet` entries with `sourceUrl`/`verifiedAt` and render `verificationLine`. Drop whatever can't be verified; name Route 8 only if ridedart.com confirms it. Build the FAQ answers from the same constants.
3. **P1 / S. RFP form: don't promise, don't invite abuse through the UI.** Replace "We will get back to you within 2 business days" (`GroupTravel.tsx:62`) with copy that makes no response-time promise until D6 adds a reader. Add `maxLength` to the free-text fields, email-format validation, and a honeypot field that short-circuits submit. Check `{ error }` in `useSubmitRfp` (`useMeetingVenues.ts:61-70`) and route failures to `handleError`. This does not close the open insert; D6 does.
4. **P1 / M. The guide is the page (bet 3).** Rebuild `/visitors-guide` as modules: "This weekend" (existing events hook, limit 6), "Open now" linking `/restaurants/open-now`, "Where to stay" linking `/stay`, and "Getting here" linking `/getting-around`. Each module has a skeleton, hides itself when empty, and calls `handleError` on failure. This replaces the icon-tile grid at `:117-132`.
5. **P1 / S. Group travel venues.** `GroupTravel.tsx:36` ignores `isError`, so an outage reads "No venues match your filters" (`:179`); render ErrorState with retry. Cards gain "Visit website" (`safeWebUrl`) and "Request this venue", which pre-fills the RFP and scrolls to `#rfp`. Venue type and capacity go in the URL.
6. **P1 / S. Unsourced marketing numbers.** Delete the stat tiles at `GroupTravel.tsx:93-108` ("30% Below average convention city costs", "3hr flight to 80% of US", and so on) or keep only figures with a linked source and date. The Marriott sq_footage mismatch is a data fix (D12).
7. **P1 / M. Parking.** The garage list at `GettingAround.tsx:13-19` has no source (the page admits as much at `:85-89`). Replace it with garages verified against the city/ParkDSM list, drop any unconfirmed rates, and add a one-tap directions link from the stored lat/lng. Remove "parking map" from the meta description (`:48`) unless a lazy map ships.
8. **P1 / S. Semantics.** `<Button>` inside `<a>`/`<Link>` (`GettingAround.tsx:155-159,246-250`, `GroupTravel.tsx:192-194`) becomes `<Button asChild className="min-h-11">`. Give the SelectTriggers aria-labels (`GroupTravel.tsx:117-139`). Both forms become real `<form onSubmit>` with `required`/`aria-invalid`.
9. **P2 / S. Cross-links and SEO.** Link hotels, the Iowa Events Center and Civic Center, and "Parking for tonight's events" (`/events/today`) from Getting Around. Switch GroupTravel (`:71-74`) and VisitorsGuide to `SEOHead` with canonical and breadcrumbs. Swap the hardcoded blue and indigo hero pills (`GettingAround.tsx:67,119`, `GroupTravel.tsx:80`) for tokens.

**Acceptance:**
- With placeholder `VITE_SUPABASE_*`, no success toast appears on any form, and no copy promises an email, a mailed copy or an edition.
- Every dollar figure and schedule on `/getting-around` sits next to a source and a check date, and the airport route text in the body and FAQ comes from one constant.
- `/visitors-guide` has internal links to `/events`, `/restaurants/open-now`, `/stay` and `/getting-around`.
- `/group-travel` shows an error with retry when the backend is down.

**Verify:** `tests/getting-around.spec.ts` (extended so every rendered price has a "Checked against" line), new `tests/visitors-guide.spec.ts`, `npm run check-supabase-await`, `npm run check-ui-craft`, and axe on the three routes.

---

## WP4: Articles and article detail

**Goal:** disclose AI honestly, fetch once and cheaply, and make each article a way into current listings.

**Files owned:** `src/pages/Articles.tsx`, `src/pages/ArticleDetails.tsx`, `src/hooks/useArticles.ts`, `src/lib/articleHubs.ts`, `src/components/ShareDialog.tsx` (additive optional `kind` prop only), new `src/components/articles/RelatedArticles.tsx`, new `tests/articles.spec.ts`.

1. **P0 / S. Disclosure that fires, with copy that's true.** Both the badge and the notice key on `generated_from_suggestion_id` (`ArticleDetails.tsx:233,267`), and no writer sets it (`generate-article/index.ts:296-307`). Meanwhile `ai-article-pipeline` auto-publishes with `is_auto_published: true` (`:281-283`) and no human step. `is_auto_published` is in the production snapshot. Show the badge when `is_auto_published || generated_from_suggestion_id`. When `is_auto_published` is true the notice reads "Written by AI and published automatically after quality checks; not reviewed by an editor", and otherwise it keeps the current text. Put the same badge on list cards (`Articles.tsx:384`). Tagging `generate-article` drafts is D7.
2. **P1 / S. One fetch, published only.** Delete the mount effect `loadArticles('all')` (`Articles.tsx:106-109`). It flips the query key (`useArticles.ts:112-116`), refetches every body without a status filter, and pulls authors' and admins' drafts into the public list. Also delete the redundant client-side status checks (`:62`, `:67`).
3. **P1 / M. Lean, paged list.** `word_count` is in the production snapshot. Project `id, slug, title, excerpt, category, tags, featured_image_url, published_at, updated_at, view_count, word_count` instead of `*` (`useArticles.ts:79`), compute read time from `word_count` (`Articles.tsx:100-104`), page 12 at a time with `.range()`, and make "Load more" a working button in place of the dead "Explore More Topics" (`:443-450`). Cap the entrance stagger at 6 cards (`:355`).
4. **P1 / M. `useArticleBySlug`.** It's a `useQuery` on `queryKeys.articles.detail(slug)` with `.eq('status','published').maybeSingle()` and `recordArticleView` after success, replacing the imperative fetch (`ArticleDetails.tsx:36-52`) that turns any network error into "Article Not Found" plus noindex. There are three states: not found (noindex), error (ErrorState with retry plus NoIndexMeta, `handleError`), and success.
5. **P1 / S. Dead chrome.** Remove Save, Like, Yes and Feedback (`ArticleDetails.tsx:296-303,364-371`); they have no backing table and none should be invented. Swap the sidebar Subscribe card (`:412-414`) for `NewsletterSignup`. Delete the trigger-less `ShareDialog` (`:426-430`), and give ShareDialog an optional `kind` so the title stops saying "Share Event" (`ShareDialog.tsx:162`) on articles.
6. **P1 / S. FAQ truth.** The `/articles` FAQ (`Articles.tsx:479-495`, emitted as schema) claims fixed categories, AI related-article suggestions, maps, video and fact-checking. Cut it to 3-4 true answers, one of which describes AI use in the same terms as item 1.
7. **P1 / M. Related reading and live listings.** `RelatedArticles` scores the Eat & Drink `['articles','hub-rail',40]` query (read-only reuse of its key) by shared tags plus category and shows 3. Then 3-4 current items from the article's primary hub (`articleMatchesHub`) render as plain links. It renders nothing when there's no match.
8. **P1 / S. Dates and meta.** Show "Published / Updated" in `<time>` when `updated_at` is more than a day after publish. For pieces older than 180 days, add a muted note linking the hub for current listings. Pass `publishedTime`, `modifiedTime` and `breadcrumbs` to SEOHead (`ArticleDetails.tsx:151-158`), use `ogImageUrl` as the JSON-LD image fallback so it agrees with og:image (`:119`, `:156`), and drop the unused imports (`:12,16,26`).
9. **P2 / S. Hero and filters.** Remove the gradient band and the stat tiles (`Articles.tsx:145,162-177`). Add an h2 above the grid. Point the `<label>`s at their triggers with `htmlFor` (`:251,268`) and put the result count in `aria-live="polite"`.

**Acceptance:**
- `/articles` issues exactly one `GET /rest/v1/articles`, with `status=eq.published` and no `content` field.
- An `is_auto_published` article shows the AI badge and a notice that doesn't claim human review.
- With `/rest/v1` aborted, an article URL shows Retry, not "Article Not Found".
- `links-and-buttons` finds no handler-less button on either route.

**Verify:** new `tests/articles.spec.ts`, `npm run validate`, `npm run check-select-star`, `npm run check-ui-craft`, `npm test -- tests/links-and-buttons.spec.ts`, and prerendered head inspection after `npm run build`.

---

## WP5: Best-of voting

**Goal:** a ballot that can't silently lose votes, a leaderboard that's honest about sample size and deadlines, and an index that shows who's winning.

**Files owned:** `src/pages/BestOf.tsx`, `src/pages/BestOfCategory.tsx`, `src/components/VotingBooth.tsx`, `src/hooks/useVoting.ts`, new `tests/best-of-voting.spec.ts`.

1. **P1 / S. Atomic vote change.** `useVoting.ts:260-277` deletes (ignoring the error) and then inserts, so a failed insert loses the ballot. Use a single `upsert(..., { onConflict: 'category_id,user_id' })`; the UPDATE policy exists since `20260829000001`. Surface the server message through `handleError({ component: 'VotingBooth', action: 'castVote' })` (`VotingBooth.tsx:68,93`).
2. **P1 / S. Respect the window in the UI.** `useCategoryResults` loads by slug without `is_active` (`useVoting.ts:114-118`). Filter on it, and when `now` is outside `[voting_start, voting_end)` render "Voting closed" / "Final results" with the date and no booth. The server-side rule is D5.
3. **P1 / S. Signed-out path.** Replace the dead-end toast (`VotingBooth.tsx:76-79`) with "Sign in to vote" linking `/auth?redirect=/best-of/<slug>`. Stash the pick with `storage.set('pendingVote', ...)` from `@/lib/safeStorage` and ask for confirmation on return.
4. **P1 / S. Your pick.** The booth names the voter's choice from `useUserVote` (`VotingBooth.tsx:107-111`), with a Change button, and the matching leaderboard row gets a "Your vote" badge. Replace the hardcoded `text-green-600 bg-green-50` with tokens that work in dark mode.
5. **P1 / M. Search.** Debounce 250ms, run both queries with `Promise.all`, keep only the latest response, escape `%` and `_` (`VotingBooth.tsx:46-61,117-121`), add `aria-label` and an `aria-live` count, and offer "No match, write it in". Set `maxLength={80}` on the write-in (`:161`) and `min-h-11` on the buttons.
6. **P1 / M. Index shows leaders.** Replace the emoji icon-tile grid (`BestOf.tsx:76-119`) with a ranked list: category, current leader from `voting_winners` (in the snapshot, not yet called by web), votes, and closing date. Make `useVotingCategories` throw instead of returning `[]` (`useVoting.ts:72-75`), so the page can show ErrorState and a "Voting opens soon" empty state.
7. **P1 / S. Honest results.** Below 25 total votes, hide percentages and medals and show "Not enough votes yet". Show a first-vote prompt at 0 (today `BestOfCategory.tsx:96` hides the block). Label open categories "Live results". Derive the year from `voting_start` rather than the hardcoded "Des Best 2026" (`BestOf.tsx:57`).
8. **P2 / S. Leaderboard a11y.** Use `<ol>` with sr-only "Rank 1" next to the medals (`BestOfCategory.tsx:110-115`), make the bar `aria-hidden` with the percentage as text (`:153-158`), retitle the booth "Cast your vote" (`VotingBooth.tsx:101-104`), and give the back link `min-h-11`.

**Acceptance:**
- Changing a vote sends one request, and a forced failure leaves the previous vote intact.
- A signed-out pick survives sign-in.
- A 3-vote category shows counts only, and a closed category shows "Final results" with its date.
- `/best-of` lists each active category's leader and shows ErrorState when the backend is down.

**Verify:** new `tests/best-of-voting.spec.ts` (fixture `voting_results`, `voting_category_tallies` and `voting_winners` in their real RPC shapes), `npm run check-error-handling`, `npm run check-ui-craft`, axe on `/best-of/best-pizza`.

---

## WP6: What's new

**Goal:** a feed that shows only what its data can support, on Central-time dates, with sources.

**Files owned:** `src/pages/WhatsNew.tsx`, `src/components/SceneUpdateCard.tsx`, `src/hooks/useSceneUpdates.ts`, new `tests/whats-new.spec.ts`. `.github/select-star-baseline.json` is shared: remove one line, and rebase if another plan touches it.

1. **P0 / S. No chip that can only be empty.** Four of the six chips (`WhatsNew.tsx:13-20`) have no writer anywhere in the repo; the only writer is the restaurant INSERT trigger (`20260226000004:52-74`). Fetch the per-type counts in one query and render only the chips that have rows. "All" always shows.
2. **P1 / S. Filter in the URL; honest filtered empty.** Drive `type` from `useSearchParams`. A filtered empty state reads "<label>: none yet" with "Show all updates", and "No updates yet" is reserved for the unfiltered view (`:75-80`). Add an sr-only h2 above the feed.
3. **P1 / S. Dates.** Add `.lte('publish_date', now)` (`useSceneUpdates.ts:36-40`) so scheduled rows don't leak and future rows don't read "Just now". Format with `formatInTimeZone(..., DES_MOINES_TIME_ZONE)` and render `<time dateTime>`. After 7 days show the absolute Central date (`SceneUpdateCard.tsx:25-35`).
4. **P1 / S. Contrast and chips.** White text on green-500 or yellow-500 is about 2.1-2.3:1 (`SceneUpdateCard.tsx:7-13,57`), so use tinted `-100`/`-900` pairs with dark-mode variants and no purple. For the chips: `role="group"`, `aria-pressed`, `min-h-11` (`WhatsNew.tsx:51-60`).
5. **P1 / M. Card links and sources.** Put the link on the h3 and stretch its hit area, add `focus-visible` rings, render `source_url` through `safeWebUrl` as "Source", allow two lines for the title (`SceneUpdateCard.tsx:67,74-75`), and link restaurants by slug instead of UUID.
6. **P1 / S. SEO.** Swap the raw Helmet (`WhatsNew.tsx:31-34`) for `SEOHead` with canonical, breadcrumbs, and an ItemList of the first 10 items serialized with `toJsonLd`.
7. **P2 / S. Freshness and weight.** Show "Latest update <Central relative time>" under the h1 in place of the uppercase eyebrow (`:40-43`). Select the eight columns the card uses instead of `*` (`useSceneUpdates.ts:38`). Delete the unused `useRecentSceneUpdates` (`:76-78`). Add keyset "Load more".

**Acceptance:**
- With only `new_opening` rows, only "All" and "New Openings" chips render.
- `/whats-new?type=new_opening` preselects its chip.
- A row dated tomorrow isn't shown.
- axe color-contrast passes in both themes.
- The select-star baseline shrinks by one.

**Verify:** new `tests/whats-new.spec.ts`, the existing `tests/backend-down.spec.ts` (must still find ErrorState), `npm run check-select-star`, `npm run check-ui-craft`, axe on `/whats-new`.

---

## WP7: Nav and homepage links into this cluster

**Goal:** no internal link to a redirect, and nav labels that describe what the page is.

**Files owned:** `src/components/header/navigationConfig.ts`, `src/components/LocalContentSection.tsx`.

1. **P2 / S.** Point "Weekend Guide" (`navigationConfig.ts:94,127`) and `LocalContentSection.tsx:22` at `/events/this-weekend`, relabel it "This weekend", and remove the duplicate if Events already lists it (`:110`). Keep the `/weekend` route and its 301 (`public/_redirects:13`), as the back-compat rule requires. Drop the "farmers markets" and "Updated Daily" claims from `LocalContentSection.tsx:17`.
2. **P2 / S.** Relabel the Plan entry (`:91-93`) to describe what everyone gets once WP1 ships ("Plan a trip") instead of "AI Trip Planner", and keep it in its priority slot.

**Acceptance:** `rg '"/weekend"' src/components` returns nothing.
**Verify:** `npm run check-internal-links`, `route-smoke`.

---

## WP8: Lanes (lands last)

**Files owned:** `playwright.smoke.config.ts`, `.github/e2e-lane-baseline.json`, `tests/route-smoke.spec.ts`. The Events, Home and Explore plans also append to these; rebase and append.

1. **P1 / S.** Add `getting-around` (already written, orphaned per `.github/e2e-lane-baseline.json:6`), `trip-planner-window`, `stay`, `visitors-guide`, `articles`, `best-of-voting` and `whats-new` to the smoke `testMatch`, and shrink the baseline.
2. **P2 / S.** Add `/stay`, `/visitors-guide`, `/group-travel`, `/best-of` and `/whats-new` to route-smoke if they're missing.

**Verify:** `npm run check-e2e-lanes` lists no orphan from this plan, and `npm run test:smoke` passes.

---

## Frontend-only now

All of WP1-WP8 above. None of it adds a table, column, migration, RPC or edge function change. The reads it relies on are in the 2026-08-24 snapshot: `hotels`, `event_hotels`, `articles.is_auto_published`, `articles.word_count`, `voting_winners`, `voting_results`, `voting_category_tallies`, `scene_updates`, `meeting_venues`. Confirm with `npm run check-schema:probe` before merging WP4 item 3 and WP5 item 6.

## Needs backend/DB (deferred, needs approval)

Ordered by severity. Each needs Dj's approval and a probe first. The tightening items follow the multi-release deprecation flow in CLAUDE.md.

- **D1 P0 / M. Re-apply trip planner storage.** Add an idempotent migration that re-creates `trip_plans` and `trip_plan_items` (IF NOT EXISTS, RLS, indexes), `generate_trip_share_code`, and `get_trip_itinerary` with `a.type AS category` (the current body reads `a.category`, a column attractions doesn't have: `20251126000001:254`) plus `'slug', a.slug`. All of it is additive. Update `.github/mobile-schema-baseline.json`, then flip `AI_PLANNER_AVAILABLE`. **Must ship together with D3's ID validation**, or the first hallucinated UUID rolls back a billed plan.
- **D2 P0 / S. Hotels write RLS.** Replace the `auth.role() = 'authenticated'` INSERT/UPDATE/DELETE policies on `hotels` and `event_hotels` (`20260216000000:91-121`, live per `RLS_AUDIT.md`) with `is_admin()`, the pattern from `20260511000000:64-67`. It's a tightening, but only admin screens write these tables. Verify with a non-admin PATCH.
- **D3 P0 / M. `generate-itinerary` hardening (edge function deploy).** Drop items whose `contentId` wasn't in the set sent to the model, or whose type doesn't match (`index.ts:530-537`). Restrict `custom` items and replace the hardcoded highlights (`:384-389`). Treat a `get_trip_itinerary` error as a failure (`:580-582`). Then, at P1: a Central-time trip window (`:264-265`), `event_start_local`/`time_tbd` in the prompt, restaurant `status`, excluding unvisitable rows, an open-at-planned-time check, compact JSON, `Promise.all` for the reads, and tips/packing list persisted in `preferences` jsonb.
- **D4 P0 / M. `scene_updates` trigger guard.** `notify_new_restaurant()` publishes "is now open" for every restaurant insert and writes `city` into `neighborhood` (`20260226000004:52-74`). Emit only for `newly_opened`/`opening_soon`/`announced` or a recent `opening_date`, skip merged rows, use "Coming soon" wording, and set neighborhood NULL. Add a `closing` row on status -> `closed`. Unpublish (not delete) the bulk-ingest rows only with explicit approval.
- **D5 P0 / M. Vote integrity.** Add a BEFORE INSERT/UPDATE trigger (or a `cast_vote` SECURITY DEFINER RPC) that enforces an active category, the voting window and an entity that exists (the INSERT policy checks only `auth.uid() = user_id`, `20260226000003:58`). Add `char_length(custom_entry) BETWEEN 2 AND 80`, normalized grouping, and write-ins hidden from anon until approved or until they reach N voters. At P1: a confirmed email, a rate limit, and a cap on vote changes (an edge function using `_shared/rateLimiter`).
- **D6 P0 / M. Lead forms.** Add a `submit-group-rfp` edge function in the CLAUDE.md order: OPTIONS, rate limit, `validateInput`, Turnstile, insert with the service role, then a Resend notification. Add a minimal admin list for `rfp_submissions`. Tighten the anon INSERT on `rfp_submissions` and `guide_requests` one release after web switches.
- **D7 P1 / S. `articles.ai_generated`.** Add the nullable column, set it in `generate-article`, and backfill it; WP4 item 1 then ORs it in.
- **D8 P1 / M. Per-day weather.** Add an optional `days[]` field on the weather response (additive), aggregated over each Central day. It's a prerequisite for the weekend hand-off below.
- **D9 P1 / M. Hotel coordinates.** Add `hotels` to `data-quality-heal` TABLES (`index.ts:21`), have `search-new-hotels` write the lat/lng Places returns (or `findKnownVenue`), and show a missing-coordinates count in admin. Without this, uncoordinated hotels silently drop out of WP1's and WP2's "near" lists.
- **D10 P1 / M. Shared trip page.** Add `/trips/shared/:code` reusing `TripItineraryDays`, noindex, with an "unshare" action. It's blocked on D1 plus confirming anon SELECT on public trips. The Share button stays hidden until then (WP1 item 4).
- **D11 P2 / S. `weekend_guides`.** Probe the table. The admin `WeekendGuideManager.tsx:34-45` shows mock rows, and nothing public renders the generated guide. Remove the tab and the cron, or wire real rows.
- **D12 P2 / S. Data fixes.** Correct the Marriott `sq_footage` vs description (`20260228000007` seed), add an optional `avg_nightly_rate_updated_at` for an "as of" label, and a `profiles.display_name` byline for articles once probed.

## Hand-offs to other plans

- **Events WP5 (`EventsThisWeekend.tsx`, `useEventLanding.ts`):**
  - **P0:** weather reorders every weekend day by the current NWS hour (`weather/index.ts:198-199`, `EventsThisWeekend.tsx:119,132`). Reorder, and show `WeatherNotice`, only inside today's Central day group until D8 lands. `events.is_indoor` is absent from the 2026-08-24 snapshot, so `useEventIndoorFlags` may be returning nothing.
  - **P1:** on Saturday and Sunday, collapse the days that have already passed; include multi-day events that started before Friday (`useEventLanding.ts:77-78`); build Location chips from `city` rather than venue strings (`:48-50,149-152`); query indoor flags by window, not 500 ids; add an editorial "Our weekend picks" block from `is_featured`/`writeup_generated_at`, with a "Plan this weekend" link to `/trip-planner?from=&to=`.
- **Events EventDetails WP (`EventHotelCallout.tsx`):** use `resolveBooking`, `hotelRateLabel` and `safeWebUrl` from WP2 (the raw href is at `:77`, "~$X/night" at `:72`), add "See all hotels near X" linking `/stay?near=`, and replace the gradient placeholder (`:37`).
- **Events (`json-ld-escape.test.mjs`):** move `components/schema/HotelSchema.tsx` from BASELINE to REQUIRED_CLEAN after WP2 item 2 merges.

## Conflicts resolved

- **Free tier shape.** The holistic audit proposed a date-window planner of events plus hotels; the trip-planner audit proposed a one-day plan built from `tonightPairings`. I took the date window. It answers the visitor's actual question, uses the hotels data this cluster owns, and doesn't edit `tonightPairings.ts` (Events owns it). A per-day dinner pairing inside the window is a follow-up.
- **Shared trips: indexable vs noindex.** Noindex. These are user-generated itineraries, the tables don't exist in production yet, and an indexable page needs moderation this plan doesn't have.
- **Demote the planner in nav until storage works (trip-planner audit).** Not adopted. Once WP1 ships, the nav target is useful to everyone without storage, and the AI part says plainly that it's paused.
- **Visitor guide fulfillment.** The holistic audit proposed a new send-visitor-guide edge function. Not adopted: the page becomes the guide, and email capture reuses `NewsletterSignup`, which already has rate limiting and double opt-in.
- **One price constant shared with `UpgradeModal`/`Pricing`.** Not adopted here, because those files belong to the pricing surface. The FAQ drops its literals and links `/pricing`, which removes this page's copy of the numbers without editing theirs.
- **Tab bug severity.** Holistic rated it P1; the trip-planner audit rated it P0. P0, because the Radix source confirms both "Plan" buttons are dead.
- **ICS fix.** The trip-planner audit's version (Chicago wall-clock via `fromZonedTime`) beats a bare `parseISO`, because a visitor's browser is often in another zone.

## Rejected

- **Articles "loadArticles('all') is a P0 security leak".** Downgraded to P1 (WP4 item 2). The drafts reach only authors and admins whom RLS already lets read them, and the client filter hides them. The waste and the WEB-BE-056 regression are real.
- **"`get_trip_itinerary` fails on every call today" as a standalone P0.** The code claim holds (`20251126000001:254`), but the function isn't in production at all, so it's folded into D1.
- **"Share makes the trip public with no unshare" as a separate P0.** It can't be reached in production while `trip_plans` is missing. Folded into D10, with the button hidden meanwhile.
- **"Central-time windows / closed restaurants" as P0.** It degrades output quality on a path that can't run today. Kept as P1 inside D3.
- **"Hotels hero: use one photo of a real Des Moines skyline".** Only the gradient removal is kept. Sourcing a licensed photo isn't a code item.
- **"Weekend guide: 500 rows of description text" (perf) and "stats ignore filters".** The hand-off covers them; the Events plan's `useEventLanding` rework already changes the column set.
- **Holistic "SharedTrip page gets ItemList/TouristTrip schema".** Contradicts the noindex decision.
- **What's new "backend-down lane may fail".** The audit itself traced it as passing (`useSceneUpdates.ts:62-65`, `WhatsNew.tsx:71-74`). Nothing to fix; WP6 re-runs the spec.
