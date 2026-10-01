# Des Moines Insider: Page-by-Page SEO and AI Search Plan (Q4 2026)

Written 2026-09-30 from the GSC export in `Keyword/desmoinesinsider.com-Performance-on-Search-2026-09-30` (web search, last 3 months), live crawls of desmoinesinsider.com as Googlebot, the keyword volumes in `docs/seo/keyword-research/keyword-opportunities.csv`, and a review of catchdesmoines.com. It supersedes nothing in `DES_MOINES_AI_PULSE_SEO_GEO_MASTER_STRATEGY.md`; that doc's "flank, don't fight head terms" thesis still holds. This one says what to do to each page type, in what order.

## Where we stand

Three months: **1,040 clicks, 108,773 impressions, 0.96% CTR, average position 13.3.** Monthly clicks went 292 (Jul), 349 (Aug), 385 (Sep). Average position improved from about 16 in early July to 10.5 in the last week of September. Mobile is 72% of clicks and ranks far better than desktop (9.3 vs 22.8).

| Section | Pages with impressions | Clicks | Impressions | CTR | Avg pos |
|---|---|---|---|---|---|
| `/restaurants/:slug` | 336 | 714 | 77,333 | 0.92% | 10.3 |
| `/events/*` (detail + month + hubs) | 422 | 157 | 8,904 | 1.76% | 18.5 |
| `/restaurants` hub | 2 | 48 | 4,805 | 1.00% | 27.5 |
| `/things-to-do/*` | 22 | 41 | 3,948 | 1.04% | 20.7 |
| `/playgrounds/*` | 33 | 15 | 2,492 | 0.60% | 10.4 |
| `/articles/*` | 9 | 16 | 2,402 | 0.67% | 15.8 |
| `/events` hub | 2 | 7 | 1,865 | 0.38% | 32.5 |
| `/playgrounds` hub | 2 | 0 | 1,655 | 0% | 25.5 |
| `/stay` hub + detail | 29 | 2 | 1,793 | 0.1% | 50+ |
| `/attractions` hub + detail | 9 | 1 | 1,089 | 0.1% | 30+ |
| Cuisine x area pSEO (`/asian`, `/mexican`, `/brunch`, `/bbq`, `/italian`, `/festivals`) | 56 | 23 | 1,858 | 1.2% | 15 |

Two facts drive the plan:

1. **We win on restaurant names, not on Des Moines.** 69% of clicks come from people searching a specific restaurant ("atlas cafe", "jungle tea", "kura sushi des moines"). We sit at position 7-10, under the restaurant's own site, Google Maps, Yelp and TripAdvisor.
2. **Every high-volume generic term is on page 3 or worse.** "restaurants in des moines" pos 39.6 (535 impr), "des moines restaurants" 41, "things to do in des moines" 31.8, "des moines events this weekend" 32.8, `/events/this-weekend` 63, `/events/near-me` 72. Those are the terms Catch Des Moines owns.

## How we beat Catch Des Moines

Catch Des Moines (Simpleview CMS) ranks #1-2 for "des moines events" and "things to do in des moines this weekend". It has domain age and .gov-adjacent links we won't match in a quarter. Its weak spots are specific and checkable:

- **Event lists are rendered by JavaScript.** The raw HTML of `/events/events-this-weekend/` (301 KB) contains zero event URLs. Google renders it; most AI crawlers (GPTBot, ClaudeBot, PerplexityBot) don't execute JS and see an empty calendar.
- **Restaurant listings are thin.** Zombie Burger's listing has Restaurant JSON-LD with no `openingHours`, `priceRange`, `servesCuisine`, `hasMenu` or rating. Hours load client-side. Copy is member-supplied.
- **Coverage is member-based.** Non-member restaurants and suburbs (Ankeny, Johnston, Norwalk, Pleasant Hill) are spotty. Our best performers are exactly these: Marv's in Norwalk, Taste of New York in Pleasant Hill, Triple B's in Johnston.
- **Blog posts are unsigned and stale.** "Best Burgers in Greater Des Moines" is dated January 2025, no author, no addresses or hours.
- **A third of their nav serves meeting planners and sports tourism**, not residents.

So the game is: **be the page with the complete answer in the HTML.** Hours, price, menu link, address, "open now", the full weekend list, the month list. That wins the long tail in Google, and it's the only version AI crawlers can read. It only works if our prerender actually delivers it, which today it doesn't for a whole class of pages (P0 below).

Who else ranks top 5 for the head terms: TripAdvisor, Eventbrite, desmoinesparent.com, greaterdsmusa.com, dsmpartnership.com, Yelp. The Register, dsm magazine and Axios didn't make the top 5 for any of the three test queries. desmoinesparent.com ranking for "this weekend" is the best evidence that a focused, frequently updated local list beats the CVB's JS calendar.

## P0: fix what's broken (this week)

These are bugs, not strategy. Nothing else in this plan pays off while they exist.

### 1. pSEO and things-to-do pages serve the homepage to crawlers

Live check, 2026-09-30, Googlebot UA: `/things-to-do/east-village`, `/things-to-do/ankeny`, `/things-to-do/festivals`, `/things-to-do/families`, `/things-to-do/date-night`, `/things-to-do/fall`, `/asian/east-village`, `/brunch/valley-junction`, `/mexican/downtown` and `/festivals/valley-junction` all return the homepage's `<title>` ("Des Moines Insider | Events, Restaurants & Things to Do"), meta description and H1 ("What's Happening in Des Moines"). A local build has the correct titles (e.g. `Fall Things to Do in Des Moines IA | Autumn Activities`), so the prerender is producing them sometimes and production isn't getting them.

Cause, per the code: pSEO pages are rendered in the **entity pass** of `scripts/prerender.mjs`, which is time-budgeted (up to 900 s, `prerender.mjs:136`) and runs pSEO after restaurants and events (`prerender.mjs:209-218`). Pages that don't finish fall back to the SPA shell, and `functions/_middleware.ts:156-214` gives that shell a self-canonical and strips JSON-LD. Google then sees 20+ near-duplicate homepages until it gets round to rendering JS.

These pages already have 3,948 impressions in `/things-to-do/*` alone, at position ~20 despite the wrong title. "east village des moines" (458 impr, pos 12.1) and "des moines east village" (228, pos 11.9) are landing on a page titled as our homepage.

Fix:
- Move every pSEO URL with GSC impressions into the always-run hub pass (`scripts/prerender-routes.mjs`), or give pSEO its own unbudgeted pass. There are under 100 such URLs.
- Make the build fail if any pSEO page's rendered `<title>` equals the homepage title, the same way the hub pass already fails on a missing hub.
- Add the missing URLs to `sitemap-pseo.xml`. It has 14 URLs; GSC shows 56+ cuisine x area pages and 22 things-to-do pages getting impressions.

### 2. Restaurant titles in the database override the better template

The code template is `${name} - ${cuisine} in ${city}, Iowa | Menu, Hours & Reviews` (`RestaurantDetails.tsx:224-233`), but `seo_title` in the DB wins and is weaker. Live: "The Contrary - Reviews", "Dutch Bros Coffee Des Moines - Reviews", "Marv's Mainstreet Dive Norwalk - Reviews". The searches are "the contrary menu" (811 impr), "dutch bros hours" (333), "jungle tea des moines photos" (210), "bonchon des moines menu" (840). A title that says "Reviews" only doesn't match the intent of most of those.

Fix: one backfill of `restaurants.seo_title` to `{Name} {City}: Menu, Hours & Reviews` (trim cuisine when it pushes past ~60 characters). Only write "Menu" when we actually link a menu; otherwise "Hours, Photos & Reviews". Target list is in the CTR table under Restaurants below.

### 3. Small bugs worth an hour

- Restaurant JSON-LD `@id` uses `https://desmoinespulse.com/...` (`RestaurantDetails.tsx:265`). Wrong domain; it breaks entity consolidation.
- `/events/schedule-2026-09-26` renders as "Schedule - Sat, Sep 26 | Principal Park". It's ranking position 2 (479 impr, 13 clicks) with a scraper title. Fix the crawler so team-schedule rows get the team name and opponent in the title.
- `public/rss.xml` was last built 2025-07-30 and isn't linked from `<head>`. Either generate it at build time from articles + upcoming events, or delete it. A stale feed is worse than none.
- `robots.txt` still has `Allow: /weekend` for a route that now 301s.
- Restaurants hub description says "200+ restaurants"; the sitemap has 477.

## P1: page-type plans

Order is by expected clicks per hour of work.

### Restaurant detail pages (`/restaurants/:slug`): 714 clicks, 77,333 impressions

The engine of the site. 329 pages get impressions; 239 of them got zero clicks (13,522 impressions between them).

**CTR targets (position 12 or better, 500+ impressions, CTR under 1%):**

| Page | Clicks | Impr | CTR | Pos | Query intent seen |
|---|---|---|---|---|---|
| jungle-tea | 45 | 4,880 | 0.92% | 8.1 | reviews, photos, menu |
| bonchon | 5 | 3,545 | 0.14% | 10.7 | menu, reviews, West Des Moines |
| dutch-bros-coffee | 20 | 3,423 | 0.58% | 10.1 | near me, hours, menu |
| the-contrary | 24 | 3,339 | 0.72% | 9.7 | menu |
| triple-bs | 9 | 1,776 | 0.51% | 10.1 | menu |
| tous-les-jours | 1 | 1,743 | 0.06% | 9.7 | menu |
| taste-of-new-york-pizza-bar | 9 | 1,198 | 0.75% | 11.8 | Pleasant Hill |
| el-rincn-catracho-2 | 2 | 1,183 | 0.17% | 8.4 | name |
| bandit-burrito | 2 | 1,151 | 0.17% | 11.4 | menu |
| 100th-st-corner-cafe | 2 | 1,035 | 0.19% | 10.9 | name |
| bix-co, sushi-a-go-go, el-molcajete, pallys-pub-pizza, cajun-belle, texas-roadhouse, wayback-burgers, gus-and-lisas | 0-4 each | 500-850 each | under 0.6% | 9-10.5 | menu, hours |

Getting these 18 pages from ~0.4% to 2% CTR at the same position is roughly +500 clicks a quarter, which is half our current total.

What to do on every restaurant page:
1. **Title** per P0 #2.
2. **Answer the query above the fold, in text:** today's hours and an "Open now / Closes at 9 pm" line, price range, the menu link, address with neighborhood, phone. These are the facts Catch Des Moines loads by JS and Yelp hides under ads. They're also what AI Overviews quote.
3. **Complete the Restaurant schema:** `servesCuisine`, `priceRange`, `hasMenu` (URL), `openingHoursSpecification`, `acceptsReservations`, `geo`, `sameAs` (official site, Google Maps URL, Instagram). Keep `AggregateRating` only if the ratings are ours and first-party; Google ignores or penalises self-serving third-party aggregates on LocalBusiness.
4. **One paragraph that only we have:** what to order, when it's busy, parking, kid-friendly, the patio. Two or three specific, checkable sentences beat 300 words of generic AI copy. This is the thing that makes us citable.
5. **"Last verified" date** in visible text and `dateModified`. Freshness correlates with AI citation (Ahrefs, ~17M citations: AI-cited URLs run ~25% newer than organic results).
6. **Photos** with descriptive alt text. "jungle tea des moines photos" alone is 210 impressions; Google Images is a real channel here.
7. **Internal links out** to the matching cuisine x area pSEO page and the neighborhood page, and in from them. Today the restaurant pages are islands.

New-restaurant content is the one generic restaurant query we already win: "new restaurants des moines 2026" (203 impr, 15 clicks, pos 8.8) plus "new des moines restaurants 2026" (31, 3 clicks). Make `/restaurants/new` (or a monthly "New in Des Moines: October 2026" article) a standing page updated every two weeks. Openings are news, which also matters for Top Stories and preferred sources (P2).

### Restaurants hub (`/restaurants`): 48 clicks, 4,805 impressions, pos 27.5

Targets "restaurants in des moines" (50,000/mo in the Ads planner bucket), "des moines restaurants", "best restaurants in des moines" (pos 38). TripAdvisor and the Downtown Partnership own this. We won't take #1 this quarter; page 1 is achievable.

- Put an actual ranked, editorial "Best restaurants in Des Moines right now" list (15-25 places, with one line on each and why) at the top of the HTML, not a filter grid. TripAdvisor gives you 652 restaurants; give people 20 and a reason.
- Sections by neighborhood and suburb linking to `/restaurants/west-des-moines`, `/restaurants/ankeny`, `/restaurants/east-village`, `/restaurants/downtown`. The keyword file scores these routes highest (West Des Moines 50,000, Ankeny 5,000, East Village 5,000, Downtown 5,000) and marks them `suburb-out-of-cvb-scope` or `cvb-has-no-neighborhood-pages`. Confirm each exists, renders in prerender, and is in a sitemap.
- Cuisine sections linking to the pSEO pages ("best pizza in des moines" 5,000, "best burger" 5,000, "best breakfast" 5,000).
- Fix the description count; add `ItemList` of the editorial list.

### Restaurants open now (`/restaurants/open-now`): 3 clicks, 828 impressions, pos 8.5

"food open now" (353, pos 9.3), "food near me open now" (159), "restaurants near me open now" (64), "open restaurants near me now" (32), "food places open" (51). These are near-me queries Google mostly answers with the map pack, so the ceiling is limited, but the page is already on page 1. Add a server-rendered list of what's open late tonight (the prerender time is stale by the time it's crawled, so phrase it by schedule: "Open until midnight on weekdays"), and spin out `/restaurants/open-late` for "restaurants open late des moines" (500/mo, CVB lacks hours data).

### Event hubs (`/events`, `/events/today`, `/events/this-weekend`): ~10 clicks, ~3,000 impressions, pos 30-63

These are the terms Catch Des Moines owns ("des moines events" 5,000/mo; "things to do in des moines this weekend" 131 impressions for us at pos 24). Our advantage is a complete event list in the HTML.

- **Confirm the prerendered HTML actually contains the event list,** with names, dates, venues and links, for all three hubs. The hubs are in the hub pass, so this should be true; verify after each deploy with a curl, because it's the whole edge over Catch Des Moines.
- **Rebuild the prerender daily** (a scheduled Cloudflare Pages deploy hook) so `/events/today` and `/events/this-weekend` aren't serving last Tuesday's list. A stale "today" page is a quality signal against us.
- **Put the date in the H1 and the first sentence:** "This weekend in Des Moines: Oct 2-4, 2026. 47 events, 12 free." That's the answer-first line AI Overviews and Perplexity lift.
- **Editorial "top 5 this weekend"** at the top, written by a person, then the full list. desmoinesparent.com ranks top 5 doing exactly this.
- **`/events/near-me`** gets 494 impressions at pos 72, isn't prerendered and isn't in a sitemap. A server can't know where "me" is. Point its canonical at `/events/this-weekend` or `/events/today` and stop splitting signals.
- **Weekly article "This weekend in Des Moines: [dates]"** published every Thursday under `/articles/`, linking into the hub. That gives Google a fresh, dated, crawlable news-style URL every week (also the content that preferred sources rewards, P2), and the hub collects the internal links.

### Monthly event pages (`/events/october-2026`): best CTR on the site

`/events/october-2026`: 24 clicks from 79 impressions, **30.4% CTR at position 3.1.** `/events/november-2026`: 7.8% CTR at pos 5.4. These work.

- Publish each month's page **6-8 weeks ahead** (December 2026 and January 2027 should exist now) so it's indexed before demand peaks.
- Target the phrasing people use: "things to do in des moines in october", "october events des moines", "des moines halloween events 2026". Put those in H2s.
- Seasonal block at the top of each month: October gets haunted houses, pumpkin patches, corn mazes, trick-or-treat times. "haunted houses des moines" is 5,000/mo and +900% over three months in the keyword file; "pumpkin patch" already gives us 73 impressions at pos 10 with no page built for it. **Build `/articles/haunted-houses-des-moines-2026` and `/articles/pumpkin-patches-near-des-moines-2026` this week.** It's the end of September; this demand peaks in the next three weeks.
- Link last month's page to next month's; noindex months more than 2 months past, or 301 them to the current month.

### Event detail pages (`/events/:slug`): 97 clicks across 401 pages

Event pages die after the event date, so they're low value individually. What works: annual events people search by name and year ("cloris awards 2026" 101 impr pos 4.4; "forever in love bridal show" 21% CTR; "rainbow safari blank park zoo" 15.8% CTR; "prairie trail labor day fest").

- **Event series pages for recurring events:** `/events/series/cloris-awards` with the current year's date, last year's recap, and a link to the dated instance. Authority accumulates on one URL year after year instead of resetting. Start with the 20 biggest annual events (Arts Festival, World Food & Music, Iowa State Fair, Cloris Awards, Celebrate Ankeny, Valley Junction farmers market).
- Full `Event` schema (`eventStatus`, `eventAttendanceMode`, `offers` with price or `isAccessibleForFree`, `organizer`, `performer`) for event rich results. Already mostly in `src/lib/eventSchema`; audit against Google's Event docs.
- Keep noindexing past events (already done in `EnhancedEventSEO.tsx`), but 301 a past dated event to its series page when one exists.

### Things to do (`/things-to-do`, `/things-to-do/*`) and neighborhoods (`/neighborhoods/*`)

After P0 #1, these are our strongest structural answer to Catch Des Moines, which has no neighborhood pages.

| Page | Clicks | Impr | Pos | Note |
|---|---|---|---|---|
| /things-to-do/east-village | 14 | 1,208 | 11.8 | wrong title live (P0) |
| /things-to-do/ankeny | 5 | 645 | 21.5 | wrong title; "things to do in ankeny" 5,000/mo |
| /things-to-do/festivals | 9 | 555 | 18.2 | wrong title; "des moines festivals 2026" pos 9.3 |
| /things-to-do/families | 0 | 307 | 26.3 | wrong title |
| /things-to-do/date-night | 0 | 215 | 24.6 | competes with /events/date-night (390 impr, 13 clicks) |
| /neighborhoods/east-village | 2 | 124 | 17.0 | competes with /things-to-do/east-village |

- **Pick one URL per intent.** East Village has `/things-to-do/east-village` and `/neighborhoods/east-village`; date night has `/things-to-do/date-night`, `/events/date-night` and `/events/date-night/`. Choose the winner by GSC (things-to-do/east-village; events/date-night), make the other a section that links to it or 301 it.
- Each neighborhood page: what it is in two sentences, where to park, 8-10 restaurants (linking to detail pages), bars, what's on this week (live list), a map. That's what "east village des moines" searchers want and what nobody else has in one place.
- Suburb pages are the clearest gap the keyword file found (`suburb-out-of-cvb-scope`): Ankeny, West Des Moines, Johnston, Urbandale, Waukee, Altoona, Norwalk, Pleasant Hill. Our best restaurant pages are in exactly these suburbs.

### Cuisine x area pSEO (`/asian/east-village`, `/brunch/valley-junction`, ...)

56 pages with impressions, 23 clicks, average pos ~15. After the P0 render fix, keep only combinations with at least 5 real places. A "best BBQ in Ankeny" page with two entries is thin content that drags the rest down. Rule: under 5 published places, `noindex` and drop from the sitemap; under 3, don't generate the page. Pages worth investing in from the data: `/brunch/east-village` (pos 7.9), `/italian/east-village` (7.5), `/mexican/east-village` (7.6), `/mexican/valley-junction` (8.0), `/asian/east-village` (9.3), `/bbq/ankeny` (14), `/mexican/downtown` (11.0).

### Playgrounds (`/playgrounds`, `/playgrounds/:slug`): 15 clicks, 4,147 impressions

Detail pages rank well (pos ~10) for park names: "riverview park" 472, "beaverdale park" 107, "big creek state park playground" 72 (pos 4.3), "jester park natural playscape" 69, "chesterfield park", "miracle park". The hub gets 1,655 impressions and **zero clicks** at pos 16-29.

- Hub: target "splash pads des moines" (500/mo), "indoor playground des moines" (500), "playground for kids" (80 impr already), "inclusive playgrounds des moines". Put a short ranked "Best playgrounds by age" list and a splash pad section (with opening and closing dates) at the top.
- Detail pages: these rank on the park name, so title as `{Park} Playground, {City}: Equipment, Shade, Restrooms`. Parents want surface, shade, restrooms, fenced or not, age range. Catch Des Moines targets visitors, not parents (`cvb-targets-visitors-not-parents`), so this is open ground.
- Cross-link playgrounds with family events (`/events/kids`) and family restaurants.

### Articles (`/articles/*`): 16 clicks, 2,402 impressions

The patio guide (1,043 impr, pos 15.8) and the fall soups article (449, pos 10.7) show seasonal list content works. This is also the section that qualifies us for Top Stories and preferred sources (P2).

- **Bylines with a real author page** (`/about/<name>`) and `Person` schema. Catch Des Moines posts are unsigned; a named local writer is a trust signal for both Google and AI answers.
- `NewsArticle` or `BlogPosting` schema with `datePublished`, `dateModified`, `author`, `publisher`. Today articles only have `Article`.
- **Cadence: two posts a week minimum.** Thursday "This weekend in Des Moines", plus one of: new openings, a seasonal guide, a "best X" list. Next 8 weeks:
  - Oct 1: Haunted houses near Des Moines 2026
  - Oct 2: Pumpkin patches and corn mazes near Des Moines
  - Oct 8: Trick-or-treat times by suburb, 2026 (nobody publishes this cleanly)
  - Oct 15: New restaurants in Des Moines, October 2026
  - Oct 22: Best soup and comfort food in Des Moines (refresh last year's soups article, don't duplicate it)
  - Oct 29: Thanksgiving dinner out in Des Moines 2026
  - Nov 5: Holiday lights and Jolly Holiday Lights guide
  - Nov 12: Ice skating in Des Moines (5,000/mo in the keyword file)
  - Nov 19: Black Friday and Small Business Saturday in Valley Junction and East Village
  - Plus the Thursday weekend post every week.
- Refresh, don't rewrite. Update the patio guide each April and re-date it. One URL per evergreen topic, updated yearly.

### Attractions (`/attractions`): 1 click, 1,089 impressions, pos 30+

22 attractions. Catch Des Moines dominates here and it's their core product. Don't fight head-on this quarter. Do the cheap things: hours, admission, parking and "how long to spend" in the HTML for each, `TouristAttraction` schema with `openingHoursSpecification`, and links from neighborhood pages. Expand to 50+ only after the restaurant and events work ships.

### Stay (`/stay`): 2 clicks, 1,793 impressions, pos 50

Hotels are owned by OTAs and Google Hotels. Don't put effort into the hub. The angle the page already has ("by distance to the venue you're visiting") is the right one: build "hotels near Wells Fargo Arena", "hotels near the Iowa State Fairgrounds", "hotels near Principal Park", "hotels near Jordan Creek". Those are specific, low-competition, and tie to our events. Add `/stay/:slug` to a sitemap; it has none today.

### Homepage (`/`): 2 clicks, 349 impressions, pos 29.7

It ranks for brand plus generic and won't drive much directly. Its job is to link to the hubs and to this week's content. Make sure it has a crawlable "This weekend" block linking to the weekend article and the 3-4 biggest events, and links to every suburb and neighborhood page. Add the preferred source button here (P2).

### Everything else

`/getting-around` (278 impr), `/outdoors` (131), `/iowa-state-fair`, `/sports`, `/music`, `/breweries`: keep them prerendered and in the sitemap, and give each a seasonal refresh. The keyword file has the targets (Gray's Lake 50,000, Iowa Cubs tickets 50,000, Iowa Cubs schedule 5,000, Raccoon River Valley Trail 5,000, breweries 5,000, Iowa State Fair parking 5,000). Do these in Q1 2027 unless one is seasonal now. Legal pages (`/acceptable-use` has 99 impressions) need nothing.

## P2: Google preferred sources

What it is (Google's doc: https://developers.google.com/search/docs/appearance/preferred-sources): a signed-in user marks a site as preferred, and that user then sees more of its content, with a "preferred" badge, in **Top Stories** and in **AI Mode and AI Overviews** (the latter needs the site to be in "Search generative AI features" in Search Console). It doesn't affect regular blue-link rankings, and it only works for the users who choose us.

So it's worth doing, but it multiplies a news habit we don't have yet. A user who prefers us gets nothing extra until we publish dated, timely content that's eligible for Top Stories. That's why the weekly weekend post and the openings articles above come first.

Requirements and steps:
1. **Eligibility check (Dj, 2 minutes):** go to `https://www.google.com/preferences/source`, search `desmoinesinsider.com`. If it doesn't come up, we're not in the tool yet and the button will do nothing useful; Google doesn't document how sites get added beyond being indexed. Check again after a month of weekly articles.
2. **Add the button.** Google's official one:
   ```html
   <script async src="https://news.google.com/swg/js/v1/publisher.js"></script>
   <div google-add-preferred-source-btn data-theme="light"></div>
   ```
   Or a plain link to `https://www.google.com/preferences/source?q=desmoinesinsider.com` using Google's badge (https://services.google.com/fh/files/helpcenter/google_preferred_source_badge_all_languages.zip). Build it as a small `PreferredSourceButton` component that lazy-loads the script only when visible, so it doesn't cost LCP, with `data-theme` following our theme.
3. **Placement:** end of every article ("Get Des Moines Insider first in Google"), the weekend hub, the homepage below the fold, the footer, the newsletter, the post-signup screen. Skip restaurant and event detail pages; people there want an answer, not a subscription ask.
4. **Ask the people who already like us:** one newsletter send and one social post explaining what it does in a sentence. Local readers who pick us are the whole point.
5. **Make the content eligible:** `NewsArticle` schema with bylines and dates on timely posts, a real author page, an About page saying who runs the site and how listings are chosen, and consider a Google Publisher Center profile. Top Stories favours exactly these signals.
6. Measure: Search Console's "Search generative AI features" setting and Top Stories appearances in the Search appearance report (empty in the current export).

## P2: AI search (ChatGPT, Perplexity, Claude, AI Overviews)

What actually moves AI citations, and what doesn't:

- **Google AI Overviews / AI Mode** use normal Search indexing and ranking. Google's own guide (updated 2026-07-10) says there's no special markup or file needed and that Search ignores AI text files. Everything above is the AI Overviews plan.
- **llms.txt does nothing measurable today.** Google said it won't use it; no major provider has committed to reading it. Keep ours (it exists and costs nothing), but generate it at build time from real counts instead of hand-maintaining it, and don't spend more time on it.
- **JS-less crawlers are where we beat Catch Des Moines.** GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot generally don't run JavaScript. Our prerendered HTML has the event list and restaurant facts; Catch Des Moines's doesn't. This is the biggest AI search advantage we have, and P0 #1 is currently throwing it away for the pSEO pages.
- **Other indexes:** ChatGPT search leans on its own index (OAI-SearchBot) plus Bing; Claude's results overlap heavily with Brave. Verify the site in **Bing Webmaster Tools**, submit the sitemaps, turn on **IndexNow** (ping on every event and restaurant change), and check `site:desmoinesinsider.com` in Brave Search.
- **Brand mentions matter more than links for AI.** Ahrefs (75,000 brands): branded mentions correlate 0.66 with AI visibility, backlinks 0.22; YouTube mentions were strongest. Practical version for us: get named in Axios Des Moines, Business Record, Cityview, the Register's food coverage, local Reddit (r/desmoines) answers, and local TikTok and YouTube food creators. A "new restaurants this month" list is the kind of thing local media cite.
- **Freshness:** visible "Updated" dates and `dateModified` on hubs, restaurants and articles. AI answers skew to recent pages.
- **Answer-first sentences:** not required by Google, but cheap: first sentence on every hub answers the query with a number and a date.
- **Track it:** a monthly manual check of 20 prompts ("best brunch in east village des moines", "things to do in des moines this weekend", "is jungle tea open") in ChatGPT, Perplexity, Gemini, Claude and Google AI Mode, logging whether we're cited.

## Sequence

| When | Work | Owner |
|---|---|---|
| Week of Sep 30 | P0 #1 pSEO render fix + build assertion; P0 #2 restaurant title backfill; P0 #3 small bugs | Dev |
| Week of Sep 30 | Haunted houses and pumpkin patch articles; December 2026 + January 2027 month pages | Content |
| Week of Sep 30 | Preferred source eligibility check; Bing Webmaster + IndexNow; Brave check | Dj |
| Oct 5-16 | Restaurant page above-the-fold facts + full schema + internal links (top 50 by impressions first) | Dev |
| Oct 5-16 | Weekly weekend article starts (every Thursday); daily prerender rebuild | Content / Dev |
| Oct 5-16 | `PreferredSourceButton` component, placements, NewsArticle schema, author page | Dev |
| Oct 19-30 | Restaurants hub editorial list; suburb and neighborhood restaurant pages; consolidate duplicate intents | Dev + Content |
| Oct 19-30 | pSEO thin-page rule (noindex under 5 places); playgrounds hub rework | Dev |
| November | Event series pages (top 20 annual events); new-restaurants page; stay-near-venue pages | Dev + Content |
| December | Attractions facts pass; Q1 seasonal content (ice skating, winter); review this plan against the next GSC export | All |

## How we'll know it's working

Re-export GSC (Last 3 months, Web) at the end of each month into `Keyword/` and compare.

| Metric | Now (Jul-Sep) | Target (Oct-Dec) |
|---|---|---|
| Clicks per month | 385 (Sep) | 900 (Dec) |
| CTR on the 18 restaurant pages in the CTR table | ~0.4% | 2% |
| `/things-to-do/*` clicks per quarter | 41 | 250 |
| `/events/this-weekend` avg position | 63 | under 20 |
| `/restaurants` avg position | 27.5 | under 15 |
| Pages titled as the homepage in prerendered HTML | 10+ checked | 0 (build fails otherwise) |
| AI citations in the 20-prompt check | not measured | baseline in October, then up month over month |
| Preferred source | not set up | in the tool, button live, Top Stories appearances showing in GSC |

Seasonality caveat: Oct-Dec is a lower month for patio and festival searches and a higher one for holiday events. Compare year over year when we have it; until then, compare the restaurant-name segment (fairly stable) separately from events.
