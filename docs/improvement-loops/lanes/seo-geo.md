# Lane: seo-geo

**Mission.** Rank for Des Moines events/restaurants queries and get cited in AI answers.

**Owns.** src/components/SEO*, structured data, scripts/generate-sitemaps*, public/robots.txt, pSEO landing pages, geo_* fields

**Backlog.** Open stories in `prd.json` with prefix WEB-SEO. See `../README.md` for the loop.

## Handoff

None. (When a loop splits work, write here: story id, what's done, what's next, files, traps.)

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-SEO-048 | this commit | Venue, trail, team, guide and hotels-near-venue pages now publish a BreadcrumbList built from the same list as the visible nav (DetailBreadcrumb). Smoke spec team-venue-trail-detail asserts nav and schema match; 8/8 pass, plus 139/139 across music-sports-hubs, stay-pass2, getting-around, route-smoke. |
| 2026-11-07 | WEB-SEO-049 | this commit | parseEventPrice now returns unknown for null, empty and whitespace, so those rows get no $0 Offer, no isAccessibleForFree and no "free" in the meta description; it agrees with isFreePrice. eventOffers tests rewritten for the new rule plus an agreement block; vitest 2740/2740, eslint clean, app type ratchet 61/61. |
| 2026-11-07 | WEB-SEO-051 | this commit | Itinerary detail pages swap the bare "All Itineraries" back link for DetailBreadcrumb (Home / Itineraries / title, print-hidden), so the last sitemapped detail family now publishes a BreadcrumbList. New smoke spec itinerary-detail asserts nav == schema, one BreadcrumbList, TouristTrip intact, hidden in print; fails on the old page, 9/9 with team-venue-trail-detail against a vite build. |
| 2026-11-07 | WEB-SEO-050 | this commit | EnhancedLocalSEO now uses the suburb for geo.placename and locality on /events/<suburb> pages and omits the downtown geo.position/ICBM there (no checked suburb coordinate exists); pages without a suburb are unchanged. New vitest enhancedLocalSeoGeo fails on the old component, passes now; vitest src/components+src/lib 2093/2093, app type ratchet 61/61, eslint 0 errors. |
| 2026-11-07 | WEB-SEO-052 | this commit | llms.txt linked 17 hubs and none of the 14 added since SEO-047 (/music, /sports, /outdoors, /stay, /deals, /best-of ...). Renderer now lists them plus the suburb events pattern; llms-txt test fails when a top-level sitemap-static hub is neither linked nor on a named exclusion list, when a link is in no sitemap, or when a named suburb has no page. Fails on the old renderer (14 missing), passes now; test:offline 60/60, eslint clean. public/llms.txt re-rendered with its existing counts and date. |
| 2026-11-07 | WEB-SEO-053 | this commit | Attraction <title> said "in Des Moines, Iowa" for every row (Adventureland Resort and Altoona Aquatics Park included) and the meta description was description.slice(0,160) of a mostly two-word column ("Dog park"). New src/lib/attractionMeta.ts reads the city from the address or says "Des Moines area", drops a type the name already says, fits 60/155; the WebPage node's name and place:location stopped stamping Des Moines too. attractionMeta test 23/23 (source guards fail on the old page), vitest src/lib+components+pages 2287/2287, app type ratchet 61/61, eslint clean, seo-meta-length/document-title/duplicate-schema green. |
| 2026-11-07 | WEB-SEO-054 | this commit | Attraction pages dropped the {type} crumb (/attractions?type=Museum canonicalizes to /attractions) and swapped the hand-built Breadcrumbs plus SEOHead breadcrumbs for DetailBreadcrumb, so nav and BreadcrumbList come from one list: Home / Attractions / name. New smoke test in attraction-detail asserts nav == schema, one BreadcrumbList, no query-string item; fails on the old page, 25/25 with attractions-hub against a vite build. check-schema-dupes, check-seo-routes, app type ratchet 61/61, eslint clean. |
| 2026-11-08 | WEB-SEO-055 | this commit | playgrounds.rating is model-extracted (ai-crawler and firecrawl-scraper store `item.rating \|\| null` from crawled pages; enhance-content asks a model to fill it), so not first-party. Playground FAQ moved to src/lib/playgroundFaqs.ts with no rating answer, and EnhancedPlaygroundSEO drops place:rating. playgroundFaqs test 5/5 (source guards fail on the old page), vitest src/components+lib+pages 2336/2336, app type ratchet 32/32, eslint clean, check-schema-dupes green. The visible hero and nearby-card star badges still show the same number. |
