# Security Audit: Unauthenticated Edge Functions

**Last Updated**: 2026-02-21
**Auditor**: Automated Security Review
**Scope**: All Supabase edge functions with `verify_jwt = false`

---

## Summary

| Metric | Value |
|--------|-------|
| Total Edge Functions | 76 |
| Unauthenticated (verify_jwt = false) | 18 |
| Percentage | ~24% |

---

## Risk Classification

| Risk Level | Count | Functions |
|------------|-------|-----------|
| **HIGH** | 2 | ai-crawler, analyze-competitor |
| **MEDIUM** | 12 | restaurant-opening-scraper, firecrawl-scraper, bulk-enhance-events, publish-article-webhook, test-article-webhook, scrape-events, personalized-recommendations, bulk-event-updater, backfill-all-coordinates-force, populate-playgrounds, generate-seo-content, image-transform |
| **LOW** | 4 | log-content-metrics, geocode-location, extract-catchdesmoines-urls, backfill-coordinates |

---

## Detailed Function Audit

### 1. restaurant-opening-scraper

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Scrapes restaurant opening announcements from news sites, blogs, and directories |
| **Why JWT Disabled** | Background data processing job; triggered by cron/admin, not end users |
| **Security Measures** | Service role key, Claude API key validation, CORS headers |
| **Recommendation** | Add API key authentication (US-013) |

### 2. firecrawl-scraper

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Web scraper using Firecrawl service to extract events/restaurants from targeted websites |
| **Why JWT Disabled** | Background data ingestion; called by admin tools and cron jobs |
| **Security Measures** | URL validation, domain exclusion list, CORS headers, input validation |
| **Recommendation** | Add API key authentication (US-013) |

### 3. ai-crawler

| Property | Value |
|----------|-------|
| **Risk Level** | HIGH |
| **Purpose** | AI-powered crawler that uses Claude to extract structured data from any website |
| **Why JWT Disabled** | Admin data processing tool; fetches arbitrary URLs for content extraction |
| **Security Measures** | Service role key, Claude API key validation, input validation |
| **Recommendation** | Add API key authentication (US-013); add URL allowlist/validation |

### 4. analyze-competitor

| Property | Value |
|----------|-------|
| **Risk Level** | HIGH |
| **Purpose** | Analyzes competitor websites using Claude AI for insights |
| **Why JWT Disabled** | Admin competitive analysis tool |
| **Security Measures** | Claude API key validation, input validation, CORS headers |
| **Recommendation** | Add API key authentication; add URL allowlist for known competitor domains |

### 5. bulk-enhance-events

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Batch processes events to enhance descriptions using Claude AI |
| **Why JWT Disabled** | Background batch processing job; too expensive for per-user JWT auth |
| **Security Measures** | Service role key, Claude API key, batch size limits |
| **Recommendation** | Add API key authentication (US-013) |

### 6. log-content-metrics

| Property | Value |
|----------|-------|
| **Risk Level** | LOW |
| **Purpose** | Logs user interaction metrics (views, clicks, searches) for analytics |
| **Why JWT Disabled** | Must accept metrics from unauthenticated visitors; core analytics function |
| **Security Measures** | Enum whitelist validation (8 metric types, 6 content types), CORS headers |
| **Recommendation** | Acceptable as-is. Add rate limiting to prevent metric flooding |

### 7. publish-article-webhook

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Publishes articles and triggers webhook notifications to external systems |
| **Why JWT Disabled** | Webhook endpoint; may be called by external CI/CD or CMS systems |
| **Security Measures** | Service role key, article ID validation, CORS headers |
| **Recommendation** | Add webhook secret validation |

### 8. test-article-webhook

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Tests webhook endpoints with sample payload |
| **Why JWT Disabled** | Admin testing utility |
| **Security Measures** | URL parameter validation, uses dummy data only |
| **Recommendation** | Add API key authentication; restrict to admin usage |

### 9. scrape-events

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Scrapes events from configured sources with job tracking |
| **Why JWT Disabled** | Background job triggered by GitHub Actions cron workflow |
| **Security Measures** | Service role key, job configuration validation, CORS headers |
| **Recommendation** | Add API key authentication (US-013) |

### 10. personalized-recommendations

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Generates personalized recommendations based on user profile |
| **Why JWT Disabled** | Needs to serve recommendations to users who may not have JWT tokens yet |
| **Security Measures** | userId validation, row-level data access filtering, OpenAI API key |
| **Recommendation** | Consider enabling JWT auth; userId should come from auth context |

### 11. geocode-location

| Property | Value |
|----------|-------|
| **Risk Level** | LOW |
| **Purpose** | Converts location strings to geographic coordinates via OpenStreetMap Nominatim |
| **Why JWT Disabled** | Utility function called from both client and server contexts |
| **Security Measures** | Input validation, public Nominatim API (no key exposure), proper User-Agent |
| **Recommendation** | Add rate limiting to prevent Nominatim abuse |

### 12. bulk-event-updater

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Batch updates event records with standardized addresses via Google Places API |
| **Why JWT Disabled** | Background batch processing job |
| **Security Measures** | Google Places API key (server-side), service role key, per-record error handling |
| **Recommendation** | Add API key authentication (US-013) |

### 13. backfill-all-coordinates-force

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Force-backfills lat/lng coordinates for all events/restaurants via Google Places API |
| **Why JWT Disabled** | One-time data migration/backfill job |
| **Security Measures** | Google Places API key, response validation, error recovery |
| **Recommendation** | Add API key authentication; consider disabling after initial backfill |

### 14. populate-playgrounds

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Populates playground listings by searching Google Places API |
| **Why JWT Disabled** | One-time data population job |
| **Security Measures** | Google Places API key, geofenced to Des Moines area, response validation |
| **Recommendation** | Add API key authentication; consider disabling after initial population |

### 15. extract-catchdesmoines-urls

| Property | Value |
|----------|-------|
| **Risk Level** | LOW |
| **Purpose** | Extracts and sets CatchDesMoines event URLs for events missing source URLs |
| **Why JWT Disabled** | Background data enrichment job |
| **Security Measures** | URL format validation (requires numeric ID), domain exclusion list |
| **Recommendation** | Add API key authentication |

### 16. backfill-coordinates

| Property | Value |
|----------|-------|
| **Risk Level** | LOW |
| **Purpose** | Backfills missing lat/lng for events/restaurants that have location text |
| **Why JWT Disabled** | Background data enrichment job |
| **Security Measures** | Service role key, queries only necessary fields, per-record error handling |
| **Recommendation** | Add API key authentication |

### 17. generate-seo-content

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Generates SEO metadata for events/restaurants using Claude AI |
| **Why JWT Disabled** | Background batch processing job |
| **Security Measures** | Claude API key validation, service role key, batch size validation, database locking |
| **Recommendation** | Add API key authentication (US-013) |

### 18. image-transform

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Purpose** | Public image proxy with format conversion, resizing, and optimization |
| **Why JWT Disabled** | Must serve optimized images to all visitors (CDN-like functionality) |
| **Security Measures** | SSRF protection (blocks private IPs, localhost), format whitelist, dimension limits, GET-only, ETag caching |
| **Recommendation** | Acceptable as-is. Already has comprehensive security controls. Add rate limiting |

---

## Functions That Should Have Auth Enabled

| Function | Current | Recommended | Reason |
|----------|---------|-------------|--------|
| personalized-recommendations | verify_jwt=false | verify_jwt=true | Accesses user-specific data; userId should come from JWT claims |

All other unauthenticated functions are background jobs or public utilities where JWT auth is inappropriate. They should use API key authentication instead (see US-013).

---

## Shared Security Infrastructure

Located in `supabase/functions/_shared/`:

| Module | Purpose |
|--------|---------|
| `cors.ts` | Environment-aware CORS with preview domain support |
| `rateLimit.ts` | IP-based rate limiting (100 req/15min default) |
| `validation.ts` | Input validation with SSRF, SQL injection, URL checks |
| `securityLayers.ts` | Multi-layer security (auth, authz, ownership, RLS) |
| `scraper.ts` | Safe web scraping utilities |
| `aiConfig.ts` | AI service configuration and key management |

---

## Action Items

1. **US-013**: Add API key authentication to data processing functions (ai-crawler, scrape-events, restaurant-opening-scraper, firecrawl-scraper, bulk-enhance-events, bulk-event-updater)
2. **US-014**: Standardize rate limiting across all public functions
3. Consider enabling `verify_jwt=true` for `personalized-recommendations`
4. Add URL allowlists for `ai-crawler` and `analyze-competitor`
5. Add webhook secret validation for `publish-article-webhook` and `test-article-webhook`
