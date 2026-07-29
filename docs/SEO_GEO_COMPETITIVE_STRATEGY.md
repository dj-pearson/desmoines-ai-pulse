# Des Moines Insider — SEO & GEO Competitive Strategy

**Goal:** Become the default answer — in Google and in AI assistants — for *"what's happening in Des Moines"* and *"where should I eat in Des Moines,"* displacing Catch Des Moines on the queries that matter.

**Date:** 2026-07-29
**Status:** Strategy / audit. No production code changed by this document.

---

## 1. The one-paragraph version

We are not losing to Catch Des Moines because our content is worse. We are losing because **our best pages are structurally invisible and our best assets are unshipped.** The two highest-intent pages on the site — `/events/this-weekend` and `/things-to-do` — are excluded from prerendering, so AI crawlers (which do not execute JavaScript) see nothing at all there, while `/pricing`, `/advertise`, and `/search` *are* prerendered. A weaker duplicate (`/weekend`) is the crawlable one. 884 detail URLs are advertised in sitemaps but rendered client-side only. A complete ~950-page programmatic SEO system exists in `src/pseo/` and is absent from every sitemap. The daily event crawler runs and its output never reaches a sitemap or the Indexing API. **The strategy is not "make more content." It is: ship what exists, then attack the queries where freshness and granularity beat domain authority.**

---

## 2. Where we actually stand

### Indexation: working, but earning nothing

Brand searches surface the site and individual event pages (`/events/steve-martin-martin-short-2026-10-11`), which proves Googlebot **is** rendering the SPA and indexing detail pages. That is genuinely good news — the JS rendering path works for Google.

But across every non-brand query tested — *things to do in Des Moines this weekend*, *Des Moines events this weekend calendar*, *best restaurants in Des Moines*, *restaurants open now Des Moines*, *free things to do in Des Moines with kids* — **Des Moines Insider does not appear anywhere in results.** Not page one, not in the AI-generated summaries, not in the cited source set.

### Google Search Console is reporting a real, fixable error

`GSC/Critical issues.csv`:

```
Issue,Validation,Items
"Duplicate field ""FAQPage""",Not Started,34
```

Invalid items have been oscillating between 9 and 56 for six months (`GSC/Chart.csv`) with **zero impressions recorded** on the enhancement report the entire time. Root cause is identified in §4.

### The competitive set is not one competitor

Catch Des Moines is the obvious rival, but the SERPs say the real picture is segmented:

| Query cluster | Who actually ranks | Beatable? |
|---|---|---|
| "things to do this weekend" | catchdesmoines.com, Eventbrite, dsmpartnership.com, Axios Local | **Yes, 3–6 mo** |
| "events calendar" | desmoinesparent.com, Eventbrite, catchdesmoines.com | **Yes** |
| "free things to do / with kids" | desmoinesparent.com, catchdesmoines itineraries, indie blogs | **Yes** |
| "best restaurants" | TripAdvisor, Yelp, OpenTable, Cozymeal | **No — don't fight this** |
| "restaurants open now / late night" | Yelp, TripAdvisor, Uber Eats, catchdesmoines | **Partially** |
| "attractions / hotels" | TripAdvisor, Expedia, Booking | **No — don't fight this** |

**The single most important observation in this table:** `desmoinesparent.com` — a small local parenting blog with no DMO backlink profile — outranks Catch Des Moines for *"free things to do in Des Moines"* and for calendar queries. That is proof that these terms are won with topical depth and freshness, not domain authority. It is the template.

### Catch Des Moines' real weaknesses

They have the backlink profile of a destination marketing organization: every hotel, venue, and chamber in Polk County links to them. We will not out-authority them. But a DMO has four structural weaknesses we can exploit:

1. **Submission-based coverage.** Venues submit; staff curate. It lags and it is incomplete. We crawl daily.
2. **One page per concept.** They have exactly one `/events/events-this-weekend/`. They do not have "free events this weekend in Ankeny."
3. **Disposable event pages.** DMO event detail pages are thin and often removed post-event. Ours persist with full `Event` schema.
4. **No real-time state.** A DMO cannot answer "what's open right now." We have hours data and already have `/restaurants/open-now`.

Freshness, granularity, entity depth, and real-time state. That is the entire opening.

---

## 3. The strategy: three battlegrounds, in order

Do not lead with the head term. Win the queries where our data model is structurally advantaged, convert that into traffic and links, then take the head terms with the authority that earns.

### Battleground A — Temporal intent ("tonight", "this weekend", "today")
**Winnable in 3–6 months. Start here.**

Highest commercial intent, highest repeat usage, and it is the one axis where a daily-crawling database beats a curated calendar outright. Catch Des Moines has one weekend page; we can own a matrix of them. This is also the exact phrasing the user brief called out.

### Battleground B — Entity-level (individual events, venues, restaurants)
**Winnable in weeks. Highest aggregate volume.**

We already rank for some event queries. 884 entity URLs exist. Individual event and venue queries are low-competition, high-intent, and — critically — **entity pages are what AI assistants cite.** This battleground is also the whole GEO play.

### Battleground C — Head terms ("things to do in Des Moines")
**12–24 months. Do not lead with it.**

Requires genuine editorial depth and links. Fund it with the traffic from A and B. The `desmoinesparent.com` precedent says it is achievable, but not first.

**Explicitly out of scope:** "best restaurants in Des Moines," "Des Moines hotels," "Des Moines attractions." TripAdvisor, Yelp, OpenTable, and Expedia own these on aggregate review volume we cannot replicate. Competing here burns budget for nothing.

---

## 4. The seven blockers

Ranked by impact. Each is evidenced against the codebase.

### Blocker 1 — The two highest-value pages are not prerendered
**Severity: critical.**

`scripts/prerender.mjs:31-62` lists 31 hub routes. Missing from that list but present in `public/sitemap-static.xml`:

- `/events/this-weekend` — the exact query in the brief
- `/things-to-do` — the primary head term
- `/events/west-des-moines`, `/events/windsor-heights`
- `/neighborhoods/downtown`, `/east-village`, `/beaverdale`, `/highland-park`
- `/contact`

Present in the prerender list and of near-zero organic value: `/pricing`, `/advertise`, `/business`, `/map`, `/search`.

Google can render these client-side. **GPTBot, PerplexityBot, ClaudeBot, and OAI-SearchBot cannot — they do not execute JavaScript.** Our `robots.txt` explicitly invites all of them (`public/robots.txt`), and they arrive to find an empty shell. Every AI-search ambition in the project dies on this line.

### Blocker 2 — 884 entity URLs are JavaScript-only
**Severity: critical.**

Sitemaps advertise 284 events, 480 restaurants, 22 attractions, 69 playgrounds, 18 articles, 11 guides. `scripts/prerender.mjs:18-20` states detail pages are "data-driven and intentionally out of scope."

Google renders them (proven). AI crawlers do not. Entity pages are precisely the content AI answers cite by name. This is the single highest-leverage fix available and it is the difference between the GEO strategy existing and not existing.

### Blocker 3 — `/weekend` cannibalizes `/events/this-weekend`, and the weaker page is the crawlable one
**Severity: high.**

| | `/weekend` (`WeekendPage.tsx`) | `/events/this-weekend` (`EventsThisWeekend.tsx`) |
|---|---|---|
| Title | "This Weekend in Des Moines - AI-Curated Event Guide" | proper, dynamic |
| Canonical | **none set** | `getCanonicalUrl('/events/this-weekend')` |
| FAQ data | none | yes |
| `EventListJsonLd` | none | yes |
| Breadcrumbs | none | yes |
| **Prerendered** | **yes** | **no** |

Two pages, same intent, same title concept. The one with no canonical, no schema, and no FAQ is the one crawlers can read.

### Blocker 4 — Structured data is actively working against us

Three distinct problems:

**(a) Duplicate `FAQPage` — this is the GSC critical error.**
`FAQSection.tsx:42` emits its own `FAQPage`. The `Enhanced*SEO` components each emit a second one. Eight page types render both:

```
AttractionDetails.tsx   Attractions.tsx    FreeEvents.tsx      KidsEvents.tsx
Playgrounds.tsx         PlaygroundDetails.tsx   GuidesPage.tsx  MonthlyEventsPage.tsx
```

Several are dynamic routes, which is how 8 page types become 34 flagged URLs.

**(b) Concluded events are marked `EventPostponed`.**
`EnhancedEventSEO.tsx:129`:
```ts
"eventStatus": isUpcoming ? "https://schema.org/EventScheduled" : "https://schema.org/EventPostponed"
```
`EventPostponed` means *moved to an as-yet-unannounced future date*. A finished concert is not postponed. Hundreds of URLs asserting a false status degrades trust in **all** our Event markup — and past events are never `noindex`ed (`EnhancedEventSEO.tsx:267` sets `index, follow` unconditionally), so they stay in the index carrying it.

**(c) We claim to organize and perform at events we don't.**
`EventSchema.tsx:79-95` defaults both `organizer` and `performer` to `"Des Moines Insider"` when unknown. We are not the organizer of a Broadway tour or the performer at a symphony concert. This is inaccurate structured data on an aggregator, which is exactly the pattern spam classifiers look for.

**Strategic note on FAQPage generally:** Google deprecated FAQ rich results for non-government/health sites in August 2023. The extensive `FAQPage` investment across this codebase produces **zero Google rich results today.** It still has real value for AI extraction — so the move is to consolidate to one `FAQPage` per page and make the answers substantive, not to delete it. But it should stop being treated as a Google ranking play, and the current mad-lib answers (`EnhancedEventSEO.tsx:176-210`: *"When is {title}?" → "{title} takes place {date} at {venue}"*) add nothing a crawler couldn't already read.

### Blocker 5 — Our only structural advantage is never shipped
**Severity: critical, and the most strategically damaging.**

`.github/workflows/event-crawler.yml` crawls events daily at `0 12 * * *`. After it runs, **nothing**:

- regenerates sitemaps — `generate-sitemaps` only runs inside `npm run build` (`package.json`), which only fires on push to `main`
- rebuilds the prerendered hub HTML, so the static `/events/today` a crawler fetches is frozen at last deploy
- pings the Indexing API — the `google-indexing-api` and `regenerate-sitemaps` edge functions exist and are on **no schedule**

Freshness is the entire competitive thesis against a DMO. We generate it daily and then discard it.

### Blocker 6 — The homepage targets nothing
**Severity: high — this is our highest-authority page.**

`Index.tsx`:
- Title: `"Des Moines Insider - Conversational City Guide | AI-Powered Event & Restaurant Discovery"`
- On-page FAQ: *"Frequently Asked Questions About Des Moines AI Pulse"* → *"Learn how our conversational AI technology transforms the way you discover and experience Des Moines."*

The homepage is selling the product to itself. "Conversational City Guide" and "AI-Powered Discovery" have no search volume. Nobody searches for our architecture. The homepage should answer *"what is there to do in Des Moines"* and rank for it.

### Blocker 7 — The pSEO system is built and orphaned
**Severity: high. Largest unshipped asset in the repo.**

`src/pseo/` contains a complete programmatic SEO system: a 1,169-line taxonomy, 10 page types, a generation pipeline, a six-week rollout roadmap targeting ~950 pages, `generate-pseo-page` and `pseo-batch-worker` edge functions, and live routes at `/things-to-do/:seg1` and `/things-to-do/:seg1/:seg2`.

`scripts/generate-dynamic-sitemaps.ts` never queries `pseo_pages`. **No pSEO page appears in any sitemap.** The pages are unreachable except by direct URL.

### Also worth flagging: unverifiable statistics

The site publishes *"98% of public events,"* *"50,000 monthly users,"* *"95% accuracy."* AI assistants are already repeating these back as fact, attributed to us. If they are not defensible, they are an E-E-A-T liability on a site whose entire pitch is accuracy. Either substantiate them with methodology or remove them.

---

## 5. Content architecture: the query matrix

The winning structure is a disciplined three-dimensional matrix — **not** the full cross-product.

**Dimensions**
- **Time:** today/tonight · this weekend · this week · this month · `[Month] [Year]` · NYE · July 4th · Halloween · Christmas
- **Category:** free · kids & family · live music · food & drink · art · sports · outdoor · date night · 21+ · festivals
- **Location:** Des Moines · West Des Moines · Ankeny · Urbandale · Johnston · Waukee · Clive · Altoona · Windsor Heights · Downtown · East Village · Valley Junction · Beaverdale · Court District

The full cross-product is ~1,540 pages. **Generating it would be a doorway-page penalty.** The discipline that separates good pSEO from a manual action:

> **Inventory gate:** generate a page only when it has ≥ 8 distinct qualifying events (or ≥ 6 restaurants) in the current window. Below that, `301` to the parent. Re-evaluate on every regeneration — a page that falls below the gate gets folded back up, not left thin.

**Tiering**

| Tier | What | Count | Treatment |
|---|---|---|---|
| 1 | Money pages: `/events/today`, `/events/this-weekend`, `/events/free`, `/events/kids`, `/things-to-do`, `/restaurants/open-now`, `/events`, `/restaurants` | ~10 | Hand-tuned copy, prerendered, rebuilt daily |
| 2 | Time × Category, and top-5 suburbs × events | 40–60 | Templated + curated intro, prerendered |
| 3 | pSEO long tail, inventory-gated | cap at **300**, not 950 | Generated, in sitemap, monitored weekly |
| 4 | Entity pages (events, restaurants, venues, attractions) | ~900, growing | **Prerendered — highest priority** |

Cap Tier 3 at 300 for the first two quarters. The roadmap in `src/pseo/roadmap.ts` correctly warns that sudden page-count spikes look suspicious; 950 pages on a site with this authority profile is a spike.

### Queries to target, by winnability

**Win now (weeks):** individual event names + "Des Moines" · venue names · "new restaurants in Des Moines 2026" · `[suburb]` events · neighborhood dining

**Win in 3–6 months:** "des moines events this weekend" · "events in des moines tonight" · "free events in des moines" · "kids events des moines this weekend" · "things to do in des moines this weekend"

**Long game (12–24 months):** "things to do in des moines" · "des moines events calendar"

**Do not fight:** "best restaurants in des moines" · "des moines hotels" · "des moines attractions"

---

## 6. GEO — the AI-search play

This is where we can genuinely leapfrog, because a DMO on a Simpleview CMS will not move quickly here, and the citation set is still forming.

**The hard prerequisite:** AI crawlers do not run JavaScript. Blockers 1 and 2 are not "SEO tasks that also help AI" — they are the entire precondition. Until entity pages ship as static HTML, no other GEO work has any effect.

**What actually drives AI citation, in order:**

1. **Crawlable as plain text.** See above.
2. **Liftable facts adjacent to the answer.** The ideal source page for *"what's happening this weekend in Des Moines"* contains, in the HTML text: `Event Name — Saturday, Aug 2, 7:00 PM — Wells Fargo Arena — $45`. Verify the prerendered output actually contains this as text, not just as component props.
3. **Corroboration elsewhere.** AI answers lean toward consensus. Local press mentions matter more for GEO than for classic SEO.
4. **Freshness signals.** Fix Blocker 5.

**Assets we already have and should use:**
- `public/llms.txt` is genuinely well-built. Keep it current — but calibrate expectations: no major crawler currently consumes `llms.txt` as a ranking input. Cheap insurance, not a lever. Do not invest further here.
- `public/openapi.yaml` + the `api-events` edge function is a real asset. The ChatGPT *plugin* format it was built for is deprecated; the current equivalents are an **MCP server** and a ChatGPT app. Re-targeting this spec is a high-leverage, low-cost GEO move that Catch Des Moines will not make.
- `robots.txt` AI-crawler allowlist is already correct and ahead of most local competitors.

**One correction to make:** we allow every AI search crawler and then serve them empty shells. Right now that is worse than blocking them — we are teaching them the site has no content.

---

## 7. Prioritized roadmap

### Phase 0 — Stop the bleeding (week 1, ~2 days of work)

These are small, self-contained, and unblock everything else.

1. Add to `scripts/prerender.mjs` ROUTES: `/events/this-weekend`, `/things-to-do`, `/events/west-des-moines`, `/events/windsor-heights`, the four `/neighborhoods/*` pages.
2. Remove from ROUTES: `/search`, `/pricing`, `/advertise`, `/business`. Add `noindex` to `/search` (`SearchResults.tsx` has none).
3. Resolve `/weekend` vs `/events/this-weekend`: `301` `/weekend` → `/events/this-weekend` in `public/_redirects`. Keep the page with schema and canonical; delete the one without.
4. Fix duplicate `FAQPage`: give `FAQSection` a `showSchema` default of `false`, or strip `FAQPage` from the `Enhanced*SEO` components. One emitter per page. Clears the GSC critical error.
5. Fix `eventStatus`: concluded events are `EventScheduled` with a past `endDate` — never `EventPostponed`. Add `noindex, follow` to events more than ~30 days past.
6. Fix `organizer`/`performer`: omit the fields when unknown rather than defaulting to `"Des Moines Insider"`.
7. Rewrite the homepage title, description, and FAQ to target *things to do in Des Moines* instead of describing our own technology.

### Phase 1 — Ship the freshness advantage (weeks 2–3)

8. Extend `event-crawler.yml`: after the daily crawl, invoke `regenerate-sitemaps`, then trigger a Cloudflare Pages deploy hook so prerendered hubs rebuild with the day's events.
9. Put `google-indexing-api` on a schedule — submit new and updated event URLs daily. The Indexing API officially covers `JobPosting` and `BroadcastEvent`, so also implement **IndexNow** (Bing/Yandex) and rely on fast sitemap `lastmod` for Google.
10. Add `sitemap-pseo.xml` to `generate-dynamic-sitemaps.ts` and the sitemap index.

### Phase 2 — Prerender the entity layer (weeks 3–6)

11. Enumerate entity URLs from the database in `prerender.mjs` and render them. At ~900 URLs this is the main build-time cost — batch it, cap concurrency, and keep the existing never-fail-the-build guarantee.
12. If build time becomes prohibitive, the alternative is a Cloudflare Pages Function that serves a cached server-rendered snapshot to non-JS user agents. `functions/_middleware.ts` already exists as the hook point.
13. Verify prerendered output contains event date/time/venue/price **as text**.

### Phase 3 — Content offensive (weeks 6–16)

14. Hand-tune the ten Tier 1 pages: real editorial intro copy, substantive FAQs, internal links to Tier 2.
15. Build Tier 2 (40–60 pages) behind the inventory gate.
16. Release Tier 3 pSEO in batches of ~50/week, capped at 300, monitoring GSC indexation ratio after each batch. Pause if "Crawled – not indexed" exceeds 20%.

### Phase 4 — Authority (ongoing, start in parallel at week 4)

This is the actual gap versus Catch Des Moines, and no amount of technical work substitutes for it.

17. **Organizer reciprocity.** Every event we list has an organizer. Offer an embeddable "Listed on Des Moines Insider" badge and a free embeddable weekend-events widget. This is the highest-yield local link source available.
18. **Be Axios Des Moines' source.** Axios Local already ranks for weekend roundups. Publish a weekly data-backed "weekend in numbers" and pitch it.
19. **Data journalism.** An annual *Des Moines Events Report* — volume by neighborhood, seasonality, category growth. Local press (Register, KCCI, Business Record) cite original local data.
20. **Chamber and neighborhood association listings:** Valley Junction, East Village, Beaverdale, Ankeny, West Des Moines chambers.

---

## 8. Measurement

**Pull real query data first.** `gsc_keyword_performance`, `gsc_page_performance`, and `gsc_properties` tables exist (`supabase/migrations/20260331000001_create_gsc_tables.sql`) with a working OAuth flow (`gsc-oauth`, `gsc-sync-data`, `AdminGscCallback.tsx`). Everything in §5 is informed by SERP observation, not by our own impression data. **Sync GSC and re-derive the keyword matrix from actual queries before building Tier 2 and 3.** That is the highest-value single action in this document after Phase 0.

**Leading indicators (weeks 1–6)**
- GSC "Duplicate field FAQPage" → 0 items
- Valid Event enhancement items rising; invalid → 0
- Indexed entity pages / submitted entity pages → > 85%
- Median days from event ingest → indexed URL: target < 3

**Lagging indicators (months 3–12)**
- Non-brand impressions (currently ~nil on tracked enhancement reports)
- Top-10 rankings for the "win in 3–6 months" cluster
- Citation rate in ChatGPT / Perplexity / Google AI Overviews for the ten target questions — track manually monthly; there is no reliable automated tool
- Referring domains — the true proxy for closing the Catch Des Moines gap

---

## 9. What to do Monday

1. Sync Google Search Console and export 12 months of query data.
2. Do Phase 0 items 1–4. They are hours of work and they unblock the AI-search strategy entirely.
3. Decide Phase 2's approach: build-time prerendering of 900 URLs, or edge-side snapshot serving. Everything downstream depends on that choice.
