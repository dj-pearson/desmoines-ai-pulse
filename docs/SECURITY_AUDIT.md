# Edge Function Security Audit

**Date:** 2026-02-23
**Scope:** All Supabase edge functions with `verify_jwt = false` in `supabase/config.toml`

---

## Summary

18 of 76 edge functions have `verify_jwt = false`. This audit classifies each by risk level and recommends remediation.

**Risk Levels:**
- **HIGH** - Bulk data modification, SSRF vectors, or AI API budget abuse with no authentication
- **MEDIUM** - Limited data modification or information disclosure
- **LOW** - Read-only, no side effects, or has existing security measures

---

## Audit Results

### HIGH Risk (Require Immediate Remediation)

| Function | Purpose | Risk | Remediation |
|----------|---------|------|-------------|
| `firecrawl-scraper` | Scrapes URLs via Puppeteer, extracts data with Claude AI, inserts DB records | SSRF + AI budget abuse + bulk DB writes | Enable JWT (admin only), add URL domain allowlist |
| `ai-crawler` | Crawls URLs, extracts content with Claude AI, inserts into multiple tables | SSRF + AI budget abuse + bulk DB writes | Enable JWT (admin only), add URL domain allowlist |
| `publish-article-webhook` | Fetches article, generates social descriptions via Claude, POSTs to caller-supplied webhookUrl | SSRF via webhookUrl + AI budget abuse + data exfiltration | Enable JWT (admin only), add webhook URL allowlist |
| `bulk-event-updater` | Fetches ALL events, calls Google Places API, overwrites location field | Bulk data corruption + Google API budget abuse | Enable JWT (admin only) |
| `backfill-all-coordinates-force` | Bulk overwrites event locations via Google Places API | Bulk data corruption + Google API budget abuse | Enable JWT (admin only); disable after backfill |
| `bulk-enhance-events` | Sends events to Claude AI for AI writeup generation | Uncapped batchSize + AI budget abuse | Enable JWT (admin only), cap batchSize |
| `restaurant-opening-scraper` | Scrapes websites for new restaurant openings, inserts DB records | AI budget abuse + arbitrary URL scraping | Enable JWT (admin only) |
| `generate-seo-content` | Generates SEO content via Claude AI, updates events/restaurants | Uncapped batchSize + AI budget abuse | Enable JWT (admin only), cap batchSize |

### MEDIUM Risk

| Function | Purpose | Risk | Remediation |
|----------|---------|------|-------------|
| `scrape-events` | Orchestrates scraping jobs, delegates to firecrawl-scraper | Bypassable header-based auth check | Replace with real JWT verification |
| `analyze-competitor` | Scrapes competitor sites, generates analysis via Claude AI | AI budget abuse + data pollution | Enable JWT (admin only) |
| `personalized-recommendations` | Returns personalized event recommendations for a userId | BOLA/IDOR - any caller can request any user's data | Enable JWT, validate userId matches caller |
| `test-article-webhook` | POSTs test payload to caller-supplied URL | SSRF probe tool | Enable JWT (admin only) |
| `populate-playgrounds` | Searches Google Places for playgrounds, inserts records | Google API budget abuse + DB flooding | Enable JWT (admin only) |
| `extract-catchdesmoines-urls` | Scrapes CatchDesMoines for external URLs, updates events | Resource-intensive scraping + DB writes | Enable JWT (admin only) |
| `backfill-coordinates` | Geocodes events/restaurants missing coordinates | Resource-intensive geocoding | Enable JWT (admin only) |
| `log-content-metrics` | Tracks content views/clicks/shares from frontend | Analytics poisoning without rate limiting | Keep unauthenticated, add rate limiting |

### LOW Risk

| Function | Purpose | Risk | Remediation |
|----------|---------|------|-------------|
| `geocode-location` | Geocodes location strings via Nominatim | Nominatim rate limit abuse | Keep unauthenticated, add rate limiting |
| `image-transform` | Proxies/transforms images from external URLs | Has SSRF protection via validateURLForSSRF | Keep unauthenticated, add rate limiting |

---

## Functions Remaining Unauthenticated (Intentional)

These 3 functions are intentionally unauthenticated because they are called from the frontend for unauthenticated users:

1. **`log-content-metrics`** - Tracks page views for all visitors. Rate limiting needed.
2. **`geocode-location`** - Frontend map features need geocoding for all users. Rate limiting needed.
3. **`image-transform`** - Image proxy for frontend rendering. Has SSRF validation. Rate limiting needed.

---

## Functions Changed to Authenticated

The following 15 functions were changed to `verify_jwt = true` as part of this audit:

1. `restaurant-opening-scraper` - Admin-only scraper
2. `firecrawl-scraper` - Admin-only scraper
3. `ai-crawler` - Admin-only crawler
4. `analyze-competitor` - Admin-only analytics
5. `bulk-enhance-events` - Admin-only AI enrichment
6. `publish-article-webhook` - Admin-only webhook
7. `test-article-webhook` - Admin-only utility
8. `scrape-events` - Admin-only orchestrator
9. `personalized-recommendations` - Requires user context
10. `bulk-event-updater` - Admin-only bulk update
11. `backfill-all-coordinates-force` - Admin-only backfill
12. `populate-playgrounds` - Admin-only data population
13. `extract-catchdesmoines-urls` - Admin-only enrichment
14. `backfill-coordinates` - Admin-only backfill
15. `generate-seo-content` - Admin-only SEO generation

---

## Remaining Recommendations

1. **Add rate limiting** to `log-content-metrics`, `geocode-location`, and `image-transform`
2. **Add URL domain allowlists** to `firecrawl-scraper`, `ai-crawler`, and `publish-article-webhook`
3. **Cap batchSize** parameters in `bulk-enhance-events` and `generate-seo-content`
4. **Consider disabling** `backfill-all-coordinates-force` after initial use
5. **Replace forged-header auth** in `scrape-events` with proper JWT verification
