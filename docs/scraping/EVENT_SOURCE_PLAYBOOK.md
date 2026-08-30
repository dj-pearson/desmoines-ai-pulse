# Event Source Playbook

How each seeded event source is parsed, what was wrong, and what to do when one
of them breaks.

**Audit date**: 2026-07-29 (code) · **Live verification**: 2026-08-28 ·
**Scope**: `ai-crawler`, `firecrawl-scraper`, and
the shared `_shared/domain-adapters/` registry they both use.

> **Verification status: RUN, 2026-08-28.** The bugs under "Findings" were
> identified from the code, the migrations and the `n8n/` workflow definitions,
> and each fix is covered by unit tests against fixtures. What could not be
> settled from the repo is which strategy each *live* site satisfies — the audit
> environment had no outbound access to these hosts, and for a month no machine
> that did had run the harness.
>
> It has now been run, and every verdict in the table below comes from
> **`docs/scraping/event-source-harness-2026-08-28.json`**, committed beside this
> file so the table can be re-derived rather than retyped. Re-run with
> `deno run --allow-net --allow-env scripts/verify-event-sources.ts --json`.
>
> The verdicts are about the CHEAP tiers only. A `TIER 3` row is not a broken
> source — it is one that fetches fine and yields nothing to an API or to
> structured data, so it costs a render and a model call every time it runs.

---

## 1. The three extraction tiers

Cheapest and most exact first. Every tier falls through to the next, so adding a
source can only add coverage.

| Tier | Mechanism | Why it is preferred | Cost |
|---|---|---|---|
| **1. API / REST** | `statsapi.mlb.com`, SeatGeek Platform API, WordPress "The Events Calendar" REST (`/wp-json/tribe/events/v1/events`) | Exact start times, real per-event permalinks, real images, a documented schema that does not rot | 1 HTTP request |
| **2. Structured data** | `schema.org/Event` in `<script type="application/ld+json">`, then microdata, then OpenGraph | Site-agnostic, published by the site itself, unambiguous ISO dates | 1 request per page |
| **3. Rendered HTML + Claude** | Browserless render → prompt | Last resort. Fuzzy, token-expensive, and only sees a truncated slice of the page | 1 render + 1 Claude call |

Dispatch order lives in `_shared/domain-adapters/index.ts`; the loop that walks
it is `dispatch.ts`.

## 2. Source-by-source

`Owner` is the adapter that handles the host. `Layers` is how deep the events
are relative to the seeded URL.

| Source | Seeded URL | Owner | Layers | Verified strategy |
|---|---|---|---|---|
| Catch Des Moines | `/events` | `catchdesmoines.ts` | list → detail (ld+json) + "Visit Website" | ✅ working — **do not touch** |
| SeatGeek | `/search?...des+moines` | `seatgeek.ts` | API (URL ignored) | ✅ Platform API, 50 mi radius |
| Iowa Cubs | `/iowa/schedule/2026/fullseason` | `milb.ts` | API | ✅ statsapi.mlb.com, sportId 11 |
| Iowa Barnstormers | `/sports/fball/2026/schedule` | `barnstormers.ts` | single page | ✅ PrestoSports cards |
| Eventbrite (WDM) | `/d/ia--west-des-moines/events/` | `eventbrite.ts` | embedded `__SERVER_DATA__` | ✅ |
| Vibrant Music Hall | `/shows` | `vibrantmusichall.ts` | single page ld+json | ✅ (was blocked by the allowlist — fixed) |
| Hoyt Sherman Place | `/events/` | `tribeEvents.ts` → `venueProfile.ts` | REST, else list → detail | TIER 3 - no cheap strategy. Listing fetched fine (172KB), 43 detail link(s), 0 events |
| Des Moines Symphony | `/concerts-events/` | `tribeEvents.ts` → `venueProfile.ts` | season page → concert detail | TIER 3 - no cheap strategy. Listing fetched fine (46KB), 9 detail link(s), 0 events |
| DM Community Playhouse | `/` (root!) | `tribeEvents.ts` → `venueProfile.ts` | root → `/shows/` → production detail | TIER 3 - no cheap strategy. Listing fetched fine (362KB), 23 detail link(s), 0 events |
| Theater Des Moines | `/events/` | `tribeEvents.ts` → `venueProfile.ts` | list → detail | OK `listing-jsonld` - 84 events, 84 dated, 84 own-url, 8 image |
| Horizon Events Center | `/upcoming-events/` | `tribeEvents.ts` → `venueProfile.ts` | list → detail | OK `tribe-rest` - 7 events, 7 dated, 7 own-url, 7 image |
| Wooly's / First Fleet | `/first-fleet-venues/woolys` | `venueProfile.ts` | venue page → `/events` → `/events/detail/<slug>` | TIER 3 - no cheap strategy. Listing fetched fine (47KB), 6 detail link(s), 0 events |
| Iowa Wild | `/games` | `venueProfile.ts` | list → detail, home-only | TIER 3 - no cheap strategy. Listing fetched fine (167KB), 0 detail link(s), 0 events |
| Iowa Wolves | `/schedule?month=3` | `venueProfile.ts` | list → detail, home-only | TIER 3 - no cheap strategy. Listing fetched fine (105KB), 0 detail link(s), 0 events |
| des-moines-theater.com | `/shows/concert` | `venueProfile.ts` | — | ⚠️ **review before enabling** — parses fine (`listing-jsonld`, 6 events, full coverage). The caution is about whether a RESALE site belongs in the feed, which the harness cannot answer |
| Hy-Vee Tix | `evenue.net/list/CONC` | *(none — disabled)* | — | ⛔ PerimeterX bot wall |

### 2a. The six that cost money (measured 2026-08-28)

Six of the sixteen resolve to no cheap strategy at all. **They are not failing
to fetch** — every one returns a full page, from 46KB to 362KB — and they are
not failing at the network. They fail at *extraction*, which means each of them
spends one Browserless render plus one Claude call on every run, while the other
ten cost a single HTTP request.

| Source | Listing size | Detail links found |
|---|---|---|
| `dm-symphony` | 46KB | 9 |
| `first-fleet-woolys` | 47KB | 6 |
| `iowa-wolves` | 105KB | 0 |
| `iowa-wild` | 167KB | 0 |
| `hoyt-sherman` | 172KB | 43 |
| `dm-playhouse` | 362KB | 23 |

That is the entire render and token bill for event ingestion, and it is the set
the hub takes over (see the `dmi-hub-ingest` PRD in the Server repo).

**`hoyt-sherman` finds 43 detail links and still extracts nothing**, which is
the most promising row here: the links exist and something downstream is not
following them. **`iowa-wild` and `iowa-wolves` find zero**, which is the
signature of a client-rendered calendar — those two genuinely need a browser.

### 2b. The WordPress REST assumption is false on four of five sources

The playbook routes five venues through `tribeEvents.ts`, the WordPress "The
Events Calendar" REST adapter. The harness probed each for
`/wp-json/tribe/events/v1/events`:

| Source | `tribeRest` | What it actually does |
|---|---|---|
| `horizon-events-center` | **hit** | The only one. 7 events, full date/url/image/venue coverage |
| `theater-desmoines` | miss | Succeeds anyway via `listing-jsonld` — 84 events, full date and url coverage |
| `hoyt-sherman` | miss | Falls all the way to tier 3 |
| `dm-symphony` | miss | Falls all the way to tier 3 |
| `dm-playhouse` | miss | Falls all the way to tier 3 |

**One of the five venues assumed to be running The Events Calendar is running
it.** The assumption was reasonable from the code and it is wrong, and it is
stated here rather than quietly deleted, because the fallback chain is what
saved three of the four — `theater-desmoines` lands on structured data and does
better than the REST adapter would have, while the other three land on the
expensive tier and nobody was told.

`theater-desmoines` is also the proof that this class of site CAN be cheap: 84
events with a real date and a real permalink each, from one request, on a venue
whose adapter was pointed at the wrong contract.

### Catch Des Moines is deliberately frozen

Its per-event "Visit Website" extraction works, so the profile sets
`preserveSourceUrl: true` and `venueProfile`/`tribeEvents` both refuse to match
the host. `eventSourceProfiles.test.ts` asserts it is the only source with that
flag, so nothing can quietly start rewriting its URLs.

### des-moines-theater.com needs a decision

The host shape — a generic `<city>-<venue>.com` domain serving
`/shows/<category>` — is characteristic of a ticket **resale** aggregator, not a
venue. Ingesting a reseller yields marked-up prices, affiliate `source_url`s that
route readers away from the box office, and duplicates of events already arriving
via SeatGeek and Catch Des Moines. It is recorded in the registry so the decision
is written down, but it should stay out of the seeded crawl list until someone
confirms it is a primary source.

### Hy-Vee Tix is blocked, not broken

`hyveetix.ts` is written and tested but not registered: PerimeterX returns 403 to
Supabase egress IPs and serves the challenge page to Browserless + stealth.
Re-enable only behind a residential-proxy path. Most Iowa Events Center concerts
also arrive via SeatGeek and Catch Des Moines, so this is a partial gap, not a
total one.

---

## 3. Findings

### F1 — The allowlist silently rejected 9 of the 15 sources 🔴

`_shared/fetchGuard.ts` gates `ai-crawler` before any scrape. It listed
`hoyt-sherman.org` — **hyphenated**, which is not the real host. Every crawl of
`https://hoytsherman.org/events/` returned `403 URL not permitted`, so that
source produced zero events for that reason alone, with no parsing involved.
Also absent: `vibrantmusichall.com` (which has a *working adapter* that could
never run), `dmplayhouse.com`, `theaterdesmoines.com`, `des-moines-theater.com`,
`firstfleetconcerts.com`, `woolysdm.com`, `dmsymphony.org`,
`horizoneventscenter.com`, `evenue.net`.

**Fixed** — allowlist extended (additive only). `eventSourceProfiles.test.ts`
now asserts every seeded host and every profile listing URL is allowlisted, so
adding a source without allowlisting it fails CI.

### F2 — `const` reassignment threw away whole pages 🔴

`extractContentWithAI` declared `const relevantContent`, then reassigned it when
an in-page event API returned data. ES modules run in strict mode, so that
assignment threw a `TypeError`, the surrounding `catch` swallowed it, and the
function returned `[]` — reported to the operator as "No events found on the
website". Any page whose scripts mentioned an `/api/…events` URL was affected.
The block also sat *after* the prompt string had been interpolated, so even
without the throw it could never have changed what Claude saw.

**Fixed** — hoisted into `augmentWithApiData()` before prompt construction, with
`let`. The helper now also restricts itself to **same-origin, allowlisted**
endpoints: `findApiEndpoints` harvests URLs out of arbitrary page JavaScript, so
fetching them unchecked let a target page steer the function at any host it
liked, straight past the SSRF gate on the entry point.

### F3 — Claude only ever saw the top of the page 🔴

`extractRelevantContent` did `cleanHtml.substring(0, maxChars)` — the **first**
15 000 characters of script-stripped HTML. On a modern site that is `<head>`,
the cookie banner, the nav and the hero; the event list starts past it. Claude
was routinely asked to find events in markup containing none.

The same front-slice existed in `firecrawl-scraper`, where all seven prompts do
`content.substring(0, 15000)`.

**Fixed** — `_shared/htmlContentWindow.ts` now does the work for both functions:
chrome is stripped outright (`head`/`nav`/`footer`/`form`/`svg`/`noscript`), the
content is scoped to `<main>` or a run of sibling `<article>` blocks,
non-semantic attributes are collapsed while `href`/`src`/`datetime`/`content` are
deliberately **kept** (they carry the per-event URL, image and exact start time),
and if the result still exceeds budget the window slides to the **densest** run
of event signals instead of taking the front. A unit test asserts the windowed
slice beats the front slice on a page with 20 KB of chrome ahead of the
calendar — where the front slice scores exactly zero.

### F4 — Every event from a site shared one `source_url` 🔴

The generic path fetched only the listing page and stamped
`source_url = <listing URL>` on every extracted event. No row deep-linked to its
own event, so "more info" and "buy tickets" both landed on a calendar index.

**Fixed** — `eventPageDiscovery.ts` generalizes what `catchdesmoines.ts` already
did for one site: discover same-host event detail links, fetch them with bounded
concurrency, and read each page's own ld+json / microdata / OpenGraph. Per-event
URLs now come from the page's ticket CTA (preferring known vendors), else its
canonical URL, else the page itself. Off-host links are used as `source_url` but
**never** crawled, so a listing page cannot drag the crawler into a vendor's
whole catalogue.

### F5 — Images were guessed by the LLM 🟠

Nothing extracted images structurally; the prompt asked Claude to spot an image
URL inside truncated HTML. Results were frequently the site logo, a tracking
pixel, or a relative path that then failed to download.

**Fixed** — `extractHeroImage()` reads `og:image` (both attribute orders),
`og:image:secure_url`, `twitter:image`, `link[rel=image_src]`, `itemprop=image`,
then a content `<img>` whose attributes mark it as hero/featured/event —
including `data-src` for lazy-loaded galleries. Logos, favicons, spacers,
placeholders and 1×1 pixels are rejected outright, and every result is
absolutized against the page URL. The Tribe adapter picks the **largest**
published size rather than the default thumbnail.

### F6 — JSON-LD in `<head>` was thrown away before it was read 🔴

`_shared/scraper.ts` called Browserless `/scrape` with
`elements: [{ selector: 'body' }]`, which returns the **body subtree only**. The
`schema.org/Event` pre-pass and the `og:image` fallback both read from `<head>`,
so on every site that publishes structured data there — WordPress "The Events
Calendar", Squarespace, Wix, most Next.js themes — they found nothing and the
crawl fell back to fuzzy text extraction.

**Fixed** — the selector is now `html`.

### F7 — DST was approximated by a month range 🟠

`ai-crawler`'s `parseEventDateTime` decided CDT vs CST with
`month >= 2 && month <= 10`, i.e. "March through November is CDT". US DST starts
the 2nd Sunday of March and ends the 1st Sunday of November, so events in early
March and most of November were stored **an hour off** — a 7:00 PM show
displayed as 8:00 PM. Worse, `firecrawl-scraper` does the conversion correctly
via `date-fns-tz`, so the two ingestion paths produced *different* UTC values for
the same event, and the `title_date_venue` dedupe fingerprint then failed to
match them.

The root cause was a broken import: the file pulled `fromZonedTime` from
`date-fns-tz@2`, which does not export it (that name arrived in v3), so it was
silently `undefined` — which is why the offset was hand-rolled in the first
place.

**Fixed** — `_shared/centralTime.ts` derives the real offset from the runtime's
IANA tz database via `Intl`. `centralTime.test.ts` pins both 2026 boundaries.
`milb.ts`'s duplicate Central-time formatter now delegates to the same module.

### F8 — The "future events" filter kept events up to 6 hours stale 🟡

`filterFutureEvents` compared an event's genuine UTC instant against
`utcToZonedTime(new Date(), 'America/Chicago').getTime()` — a `Date` shifted
*back* by the Central offset. The cutoff therefore sat 5–6 hours in the past.

**Fixed** — compares against `Date.now()`, with an explicit and documented
2-hour grace window so an in-progress event still shows (doors open early; a
festival day runs for hours). The grace is deliberate: dropping straight to an
exact cutoff would remove rows the site has been surfacing.

### F9 — A location that was just the venue name lost the city 🟠

A `schema.org` `Place` with a `name` and no `address` — very common — makes the
JSON-LD extractor return the name for **both** `venue` and `location`, so
`location` came out as `"Horizon Events Center"` rather than `"Clive, IA"`. The
geocoder, the map pin and every "near me" filter depend on the city. Horizon is
in **Clive**, and the generic path's `"Des Moines, IA"` default put it in the
wrong city either way.

**Fixed** — `isUsableLocation()` rejects a blank location, the generic
`"Des Moines, IA"` default, and a bare copy of the venue name; the profile's
known street address is used instead. Found by a unit test, not by inspection.

### F10 — Away games were ingested as local events 🟠

Nothing filtered team schedules to home games, so an Iowa Wild game in Milwaukee
would land on a Des Moines calendar. There was also no season bound, so a stale
carousel or a mis-parsed year could produce a July hockey game.

**Fixed** — `applyHomeOnlyFilter()` drops rows marked away (`@`, `at`, `away`)
and rows outside the league's `seasonMonths`, and normalizes titles to
`"<Team> vs <Opponent>"`. Season windows are declared per team in the profile.

### F11 — Iowa Wolves was pinned to a single month 🟠

The seeded URL was `https://iowa.gleague.nba.com/schedule?month=3`, which returns
**one month**. Even with perfect parsing, 11 of 12 months were invisible.

**Fixed** — the profile lists the unpinned `/schedule` first, and
`resolveListingUrls()` is now used by both the sports path and the generic path
in `ai-crawler`, so the canonical listing is tried before the narrowed seed.

### F12 — Seeded URLs sat above the calendar 🟠

Wooly's was seeded as `/first-fleet-venues/woolys` (a venue *profile* page) and
DM Playhouse as the bare site root. `ai-crawler`'s shallow-path expansion only
guessed `/events/`, `/calendar/`, `/events/list/` — and a dense root page then
out-*scored* the real calendar in the page-scoring loop, so the calendar was
discarded.

**Fixed** — profiles declare the canonical listing URLs, tried in order ahead of
the seeded URL, and `/shows/` was added to the blind-guess list.

### F13 — "Casey's Center" and "Wells Fargo Arena" were two venues 🟠

The adapters emit `Casey's Center` (the arena's current name);
`known_venues` only knew `Wells Fargo Arena` with aliases
`['Wells Fargo', 'The Well', 'WF Arena']`. `findMatchingKnownVenue()` therefore
**missed** on every Barnstormers and Hy-Vee Tix row, so those events got no
canonical address and no lat/lng — and the `title_date_venue` fingerprint split
the same game into two rows when it arrived via two paths.

**Fixed** — migration `20260729000001_event_source_venue_aliases.sql` appends
the alias (plus Civic Center and Hoyt Sherman variants).
`eventSourceProfiles.test.ts` asserts every profile venue name is a canonical
`known_venues` name, so a new profile cannot reintroduce the split.

### F14 — Dispatch stopped at the first matching adapter 🟠

`tryDomainAdapter` used `ADAPTERS.find(...)` and returned `null` if that one
adapter failed. A generic adapter registered behind a site-specific one was
therefore unreachable — a Tribe REST probe that 404s because the site does not
run the plugin would abandon the site to the Claude path instead of handing off.

**Fixed** — `dispatch.ts` attempts **every** matching adapter in order until one
returns items. Failures, empty results and thrown exceptions all fall through.

### F15 — `ai-crawler` skips venue canonicalization ⚪ *(open)*

`firecrawl-scraper` matches every event against `known_venues` and back-fills
the canonical name, full address and lat/lng. `ai-crawler` does not — it writes
whatever string extraction produced and no coordinates. Rows ingested by the two
functions therefore differ in venue spelling and geo coverage, which weakens the
shared dedupe key.

**Not fixed** — the profile venue defaults reduce the blast radius (a profiled
source now lands a canonical name and a real address), but the proper fix is to
lift `loadKnownVenuesCache` / `findMatchingKnownVenue` out of
`firecrawl-scraper` into `_shared/knownVenues.ts` and call it from both. Left as
a follow-up so this change stays reviewable.

### F16 — 20% of crawled events are randomly featured ⚪ *(open, by design?)*

`insertData` sets `is_featured: Math.random() > 0.8` on every inserted row, in
both `ai-crawler` and `firecrawl-scraper`. Editorial prominence is being assigned
by coin flip, and a re-crawl can flip it. Flagged rather than changed: it may be
an intentional placeholder for "seed the featured rail", and turning it off
changes what the homepage shows.

---

## 4. Adding or repairing a source

1. **Add a profile** in `_shared/eventSourceProfiles.ts`: hosts, canonical
   listing URLs (most complete first), strategies in order, detail-path patterns,
   and venue/category/ticket defaults. Write the `notes` field — it is what the
   next reader has instead of a live browser.
2. **Allowlist the host** in `_shared/fetchGuard.ts`. The profile test fails
   otherwise.
3. **Run the harness**:
   `deno run --allow-net --allow-env scripts/verify-event-sources.ts --only=<id>`
4. **Read the output.** If `strategy` came back `tribe-rest` or
   `listing-jsonld`, you are done — no code needed. If it is `detail-crawl`,
   check the `own-url` and `image` coverage. If it is `none`, the calendar is
   client-rendered: either add a bespoke adapter for the site's real data source,
   or accept the Browserless + Claude fallback.
5. **Only write a bespoke adapter** when tiers 1 and 2 both genuinely fail.
   Prefer an API the site already calls: read the endpoint and any key out of the
   page's own JavaScript during the verification run — never guess a vendor key.

### Known open questions for the first live run

- **Iowa Wild** — the AHL runs on HockeyTech. If ld+json and the detail layer are
  both empty, the durable fix is a HockeyTech Modulekit adapter. Read the client
  code and key from the page's JS; do not guess them.
- **Iowa Wolves** — same shape. NBA G League team sites may expose a schedule
  JSON feed; check the network tab before writing HTML parsing.
- **Theater Des Moines** — the profile deliberately declares **no** venue,
  because this host's identity was not verified. Stamping a venue name there
  would inject wrong data into every row. Confirm what the site is, then add it.
- **Wooly's / First Fleet** — First Fleet books several rooms (Wooly's, xBk).
  Events from the all-venues listing must keep their published venue; the
  Wooly's default applies only when the page names none. Covered by a test.
- **Multi-performance runs** — a Playhouse production or a Symphony weekend has
  several dated performances. Each is correctly its own row, but the events
  dedupe key is `title + venue` (`checkForDuplicates`), which collapses them.
  Verify whether the run's later performances are actually reaching the table.

## 5. Test coverage

```bash
deno test supabase/functions/_shared/centralTime.test.ts
deno test supabase/functions/_shared/eventSourceProfiles.test.ts
deno test supabase/functions/_shared/eventPageDiscovery.test.ts
deno test supabase/functions/_shared/htmlContentWindow.test.ts
deno test supabase/functions/_shared/jsonLdEvents.test.ts
deno test supabase/functions/_shared/domain-adapters/dispatch.test.ts
deno test supabase/functions/_shared/domain-adapters/tribeEvents.test.ts
deno test supabase/functions/_shared/domain-adapters/venueProfile.test.ts
```

78 tests, all fixture-based and needing no network; they run in CI via
`.github/workflows/subscription-sync-tests.yml`.

Three of them are guard rails rather than behaviour tests, and are the ones worth
keeping green above all others:

- **every seeded host is allowlisted** — the F1 regression. Adding a source
  without allowlisting it now fails CI instead of 403ing silently in production.
- **every profile venue is a canonical `known_venues` name** — the F13
  regression, which split one arena into two venues.
- **Catch Des Moines is the only `preserveSourceUrl` source** — so nothing can
  quietly start rewriting the URLs that already work.

### New shared modules

| Module | Responsibility |
|---|---|
| `_shared/eventSourceProfiles.ts` | Declarative per-source registry: hosts, canonical listing URLs, strategies, detail-path patterns, venue/ticket defaults |
| `_shared/eventPageDiscovery.ts` | Generic listing → detail-page walk; hero-image and ticket-URL extraction; home-only sports filtering |
| `_shared/htmlContentWindow.ts` | Chrome stripping, content-region scoping, event-density windowing |
| `_shared/centralTime.ts` | Intl-based Central Time ↔ UTC conversion |
| `_shared/domain-adapters/tribeEvents.ts` | WordPress "The Events Calendar" REST adapter |
| `_shared/domain-adapters/venueProfile.ts` | Profile-driven listing + detail-layer crawler |
| `_shared/domain-adapters/dispatch.ts` | Multi-candidate adapter dispatch loop |
