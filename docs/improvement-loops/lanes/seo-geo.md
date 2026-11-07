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
