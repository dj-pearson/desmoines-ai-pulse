# API Reference — Supabase Edge Functions

**Last Updated**: 2026-02-28
**Total Functions**: 85
**Base URL**: `https://<project-ref>.supabase.co/functions/v1/`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limiting](#rate-limiting)
3. [Content Functions](#content-functions)
4. [Payment Functions](#payment-functions)
5. [Data Processing Functions](#data-processing-functions)
6. [AI/ML Functions](#aiml-functions)
7. [Analytics Functions](#analytics-functions)
8. [SEO Functions](#seo-functions)
9. [Notification Functions](#notification-functions)
10. [Admin Functions](#admin-functions)
11. [Utility Functions](#utility-functions)
12. [Integration Functions](#integration-functions)

---

## Authentication

Edge functions use three authentication methods:

| Method | Header | Description |
|--------|--------|-------------|
| **JWT** (default) | `Authorization: Bearer <token>` | Supabase Auth JWT token. Required unless `verify_jwt = false` in config.toml |
| **API Key** | `X-API-Key: <key>` | Server-to-server auth using `WORKER_API_KEY` secret. Used by scrapers and data processors |
| **None** | — | Public endpoints (e.g., webhooks). Rate-limited to prevent abuse |

All functions accept CORS preflight requests (OPTIONS method).

---

## Rate Limiting

Rate limits are enforced via `_shared/rateLimit.ts`:

| Tier | Limit | Used By |
|------|-------|---------|
| **Default** | 100 req / 15 min per IP | Read operations, public endpoints |
| **Write** | 30 req / 15 min per IP | Mutations, form submissions |
| **AI/Strict** | 10 req / 15 min per IP | AI generation, payment operations |

Rate-limited responses return `429 Too Many Requests` with `Retry-After` header.

---

## Content Functions

### api-events
- **Method**: GET, POST
- **Auth**: JWT
- **Rate Limit**: Default (100/15min)
- **Description**: CRUD operations for events. GET returns filtered event list, POST creates new events.
- **Request (GET)**: Query params: `?category=Music&city=Des Moines&limit=20&offset=0`
- **Response**: `{ data: Event[], count: number }`

### api-restaurants
- **Method**: GET, POST
- **Auth**: JWT
- **Rate Limit**: Default (100/15min)
- **Description**: CRUD operations for restaurants. GET returns filtered restaurant list, POST creates new restaurant.
- **Request (GET)**: Query params: `?cuisine=Italian&city=Des Moines&limit=20`
- **Response**: `{ data: Restaurant[], count: number }`

### check-restaurant-status
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Verifies whether a restaurant is currently open or closed by checking its hours JSONB.
- **Request**: `{ restaurant_id: string }`
- **Response**: `{ is_open: boolean, hours_today: string }`

### calculate-trending
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Calculates trending events, restaurants, and attractions based on views, favorites, and shares from content_metrics.
- **Request**: `{ timeframe?: "24h" | "7d" | "30d" }`
- **Response**: `{ trending_events: Event[], trending_restaurants: Restaurant[], trending_attractions: Attraction[] }`

### cleanup-old-events
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None (server-only)
- **Description**: Removes events that have already passed by more than 30 days.
- **Request**: `{ dry_run?: boolean }`
- **Response**: `{ deleted_count: number, dry_run: boolean }`

### fix-broken-event-urls
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None (server-only)
- **Description**: Scans events for broken source_url and image_url links, marks or removes broken ones.
- **Request**: `{ batch_size?: number }`
- **Response**: `{ checked: number, fixed: number, errors: string[] }`

### validate-source-urls
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None (server-only)
- **Description**: Validates source URLs for events and restaurants, checking HTTP status codes.
- **Request**: `{ entity_type: "events" | "restaurants", batch_size?: number }`
- **Response**: `{ validated: number, broken: number, details: object[] }`

### update-event-datetime
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Updates event date and time fields, handling timezone conversion.
- **Request**: `{ event_id: string, date: string, timezone?: string }`
- **Response**: `{ success: boolean, event: Event }`

---

## Payment Functions

### create-subscription-checkout
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: Creates a Stripe Checkout session for subscription (Insider/VIP tier).
- **Request**: `{ tier: "insider" | "vip", success_url: string, cancel_url: string }`
- **Response**: `{ url: string }` (Stripe Checkout URL)

### manage-subscription
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: Manages existing subscriptions — cancel, reactivate, or change tier.
- **Request**: `{ action: "cancel" | "reactivate" | "change_tier", new_tier?: string }`
- **Response**: `{ success: boolean, subscription: object }`

### create-campaign-checkout
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: Creates Stripe Checkout for advertising campaign purchases.
- **Request**: `{ campaign_id: string, package: string, success_url: string, cancel_url: string }`
- **Response**: `{ url: string }`

### stripe-webhook
- **Method**: POST
- **Auth**: None (Stripe signature verification)
- **Rate Limit**: None
- **Description**: Handles Stripe webhook events: checkout.session.completed, invoice.paid, customer.subscription.updated/deleted.
- **Request**: Raw Stripe event payload
- **Response**: `{ received: true }`
- **Note**: Internal only. Verifies `Stripe-Signature` header against `STRIPE_WEBHOOK_SIGNING_SECRET`.

### process-stripe-refund
- **Method**: POST
- **Auth**: JWT (admin only)
- **Rate Limit**: Strict (10/15min)
- **Description**: Processes refund for a Stripe payment.
- **Request**: `{ payment_intent_id: string, amount?: number, reason?: string }`
- **Response**: `{ success: boolean, refund: object }`

### verify-campaign-payment
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Verifies a campaign payment was completed via Stripe session ID.
- **Request**: `{ session_id: string }`
- **Response**: `{ verified: boolean, campaign_id: string }`

### generate-invoice-pdf
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Generates a PDF invoice for a completed campaign payment.
- **Request**: `{ campaign_id: string }`
- **Response**: PDF binary (Content-Type: application/pdf)

### verify-apple-receipt
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: Validates iOS StoreKit 2 transactions and syncs subscription entitlements.
- **Request**: `{ transactionId: string, productId: string, originalTransactionId?: string }`
- **Response**: `{ success: boolean, tier: "insider" | "vip" }`

---

## Data Processing Functions

### scrape-events
- **Method**: POST
- **Auth**: API Key (`X-API-Key`)
- **Rate Limit**: None (server-only)
- **Description**: Scrapes events from configured sources (Catch DSM, Iowa Cubs, etc.).
- **Request**: `{ source?: string, dry_run?: boolean }`
- **Response**: `{ scraped: number, inserted: number, errors: string[] }`

### scrape-ticketmaster-events
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None (server-only)
- **Description**: Fetches events from Ticketmaster API for Des Moines area.
- **Request**: `{ page?: number, size?: number }`
- **Response**: `{ fetched: number, inserted: number }`

### restaurant-opening-scraper
- **Method**: POST
- **Auth**: API Key (verify_jwt=false)
- **Rate Limit**: None
- **Description**: Scrapes new restaurant openings from configured sources.
- **Request**: `{ source?: string }`
- **Response**: `{ found: number, new: number }`

### firecrawl-scraper
- **Method**: POST
- **Auth**: API Key (verify_jwt=false)
- **Rate Limit**: None
- **Description**: Uses Firecrawl API to crawl and extract structured data from websites.
- **Request**: `{ url: string, extract_schema?: object }`
- **Response**: `{ data: object, metadata: object }`

### ai-crawler
- **Method**: POST
- **Auth**: API Key (verify_jwt=false)
- **Rate Limit**: None
- **Description**: AI-powered web crawler that extracts structured event/venue data using LLM.
- **Request**: `{ url: string, entity_type: string }`
- **Response**: `{ entities: object[], raw_text: string }`

### crawl-site
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: General-purpose site crawler for admin use.
- **Request**: `{ url: string, depth?: number, max_pages?: number }`
- **Response**: `{ pages: object[], links: string[] }`

### bulk-enhance-events
- **Method**: POST
- **Auth**: API Key (verify_jwt=false)
- **Rate Limit**: None
- **Description**: Batch-enhances events with AI-generated descriptions and SEO content.
- **Request**: `{ batch_size?: number, offset?: number }`
- **Response**: `{ enhanced: number, skipped: number, errors: string[] }`

### bulk-event-updater
- **Method**: POST
- **Auth**: API Key (verify_jwt=false)
- **Rate Limit**: None
- **Description**: Batch updates event fields (e.g., timezone corrections, category normalization).
- **Request**: `{ action: string, filters?: object, updates?: object }`
- **Response**: `{ updated: number }`

### batch-enhance-events
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None
- **Description**: Enhanced batch processing for events with AI enrichment.
- **Request**: `{ batch_size?: number, category?: string }`
- **Response**: `{ processed: number, enhanced: number }`

### bulk-update-restaurants
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Batch updates restaurant records.
- **Request**: `{ filters: object, updates: object }`
- **Response**: `{ updated: number }`

### auto-enrich-restaurants
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Automatically enriches restaurant data with missing fields (hours, cuisine, coordinates).
- **Request**: `{ batch_size?: number }`
- **Response**: `{ enriched: number, skipped: number }`

### search-new-hotels
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Searches for new hotels in the Des Moines area and adds them to the database.
- **Request**: `{ area?: string }`
- **Response**: `{ found: number, added: number }`

### search-new-restaurants
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Searches for new restaurants and adds them to the database.
- **Request**: `{ area?: string, cuisine?: string }`
- **Response**: `{ found: number, added: number }`

### populate-playgrounds
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Default
- **Description**: Populates playground data for the Des Moines area.
- **Request**: `{ source?: string }`
- **Response**: `{ added: number, updated: number }`

### extract-catchdesmoines-urls
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Default
- **Description**: Extracts event and attraction URLs from catchdesmoines.com for crawling.
- **Request**: `{ max_pages?: number }`
- **Response**: `{ urls: string[] }`

---

## AI/ML Functions

### generate-itinerary
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: Generates AI-powered trip itinerary using Claude. Core of the Trip Planner feature.
- **Request**: `{ preferences: { interests: string[], budget: string, pace: string, duration: string, group_size?: number, dietary?: string[] } }`
- **Response**: `{ itinerary: { days: Day[], tips: string[], packing_list: string[] } }`

### generate-writeup
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: Generates AI writeup for an event, restaurant, or attraction using Claude.
- **Request**: `{ entity_type: string, entity_id: string, style?: string }`
- **Response**: `{ writeup: string, seo_title: string, seo_description: string }`

### generate-article
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: Generates a full editorial article using Claude.
- **Request**: `{ topic: string, style?: string, word_count?: number }`
- **Response**: `{ title: string, content: string, seo_metadata: object }`

### generate-weekend-guide
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: Generates a weekend activity guide based on upcoming events and weather.
- **Request**: `{ weekend_date?: string }`
- **Response**: `{ guide: { sections: Section[], highlights: string[] } }`

### enhance-content
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: AI-enhances existing content (descriptions, SEO fields) using Claude.
- **Request**: `{ entity_type: string, entity_id: string, fields?: string[] }`
- **Response**: `{ enhanced: object }`

### nlp-search
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Strict (10/15min)
- **Description**: Natural language search powered by AI. Converts user queries to structured searches.
- **Request**: `{ query: string, entity_types?: string[] }`
- **Response**: `{ results: SearchResult[], interpretation: string }`

### personalized-recommendations
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Strict (10/15min)
- **Description**: AI-powered personalized recommendations based on user behavior and preferences.
- **Request**: `{ user_id?: string, preferences?: object, limit?: number }`
- **Response**: `{ recommendations: Recommendation[] }`

### analyze-competitor
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Strict (10/15min)
- **Description**: Analyzes competitor websites using Claude for content gap analysis.
- **Request**: `{ url: string, analysis_type?: string }`
- **Response**: `{ analysis: object, recommendations: string[] }`

### suggest-article-topics
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: AI-suggests article topics based on trending content, gaps, and seasonal relevance.
- **Request**: `{ count?: number, category?: string }`
- **Response**: `{ topics: Topic[] }`

### test-ai-model
- **Method**: POST
- **Auth**: JWT (verify_jwt=true)
- **Rate Limit**: Strict (10/15min)
- **Description**: Test endpoint for AI model responses. Development/admin use.
- **Request**: `{ prompt: string, model?: string }`
- **Response**: `{ response: string, model: string, tokens: number }`

### analyze-content
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: Analyzes content quality, readability, and SEO compliance using AI.
- **Request**: `{ content: string, content_type?: string }`
- **Response**: `{ score: number, issues: Issue[], suggestions: string[] }`

### analyze-images
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Strict (10/15min)
- **Description**: Analyzes images using vision AI for quality, relevance, and alt text generation.
- **Request**: `{ image_url: string }`
- **Response**: `{ quality_score: number, alt_text: string, tags: string[] }`

---

## Analytics Functions

### log-content-metrics
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Default (100/15min)
- **Description**: Logs content interaction metrics (views, clicks, shares, favorites). Fire-and-forget from frontend.
- **Request**: `{ content_id: string, content_type: string, metric_type: "view" | "click" | "share" | "favorite" }`
- **Response**: `{ logged: true }`
- **Note**: Public endpoint. No auth required to minimize friction for tracking.

### export-analytics-data
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Exports analytics data in CSV or JSON format for reporting.
- **Request**: `{ format: "csv" | "json", date_range: { start: string, end: string }, metrics?: string[] }`
- **Response**: CSV or JSON data

### sync-analytics-data
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Syncs analytics data from external sources into the analytics tables.
- **Request**: `{ source: string }`
- **Response**: `{ synced: number }`

---

## SEO Functions

### generate-seo-content
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Strict (10/15min)
- **Description**: Generates SEO metadata (title, description, keywords, FAQ) for content pages using Claude.
- **Request**: `{ entity_type: string, entity_id: string }`
- **Response**: `{ seo_title: string, seo_description: string, seo_keywords: string[], faq: object[] }`

### generate-sitemap
- **Method**: GET
- **Auth**: None
- **Rate Limit**: Default
- **Description**: Dynamically generates XML sitemap for all published content.
- **Request**: None
- **Response**: XML sitemap (Content-Type: application/xml)

### generate-sitemaps
- **Method**: GET
- **Auth**: None
- **Rate Limit**: Default
- **Description**: Generates sitemap index with multiple sitemaps for large content sets.
- **Request**: None
- **Response**: XML sitemap index

### seo-audit
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Runs SEO audit on a URL or the entire site, checking meta tags, structure, and performance.
- **Request**: `{ url?: string, full_site?: boolean }`
- **Response**: `{ score: number, issues: Issue[], recommendations: string[] }`

### check-core-web-vitals
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Checks Core Web Vitals (LCP, FID, CLS) via PageSpeed Insights API.
- **Request**: `{ url: string }`
- **Response**: `{ lcp: number, fid: number, cls: number, score: number }`

### check-broken-links
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Scans for broken links across the site.
- **Request**: `{ max_pages?: number }`
- **Response**: `{ broken: BrokenLink[], total_checked: number }`

### check-security-headers
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Checks security headers (CSP, HSTS, etc.) for a given URL.
- **Request**: `{ url: string }`
- **Response**: `{ headers: object, score: number, missing: string[] }`

### generate-hotel-affiliate-urls
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Generates affiliate tracking URLs for hotel booking links.
- **Request**: `{ hotel_id: string, platform: "booking" | "hotels" }`
- **Response**: `{ affiliate_url: string }`

---

## Notification Functions

### send-event-reminders
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None (server-only, scheduled)
- **Description**: Sends email reminders for favorited events happening soon (24h and 1h before).
- **Request**: `{ hours_before?: number }`
- **Response**: `{ sent: number, errors: string[] }`

### send-weekly-digest
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None (server-only, scheduled)
- **Description**: Sends weekly email digest with trending events, new restaurants, and recommendations.
- **Request**: `{ test_email?: string }`
- **Response**: `{ sent: number }`

### send-seo-notification
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Sends SEO-related notifications to admin (ranking changes, crawl errors).
- **Request**: `{ type: string, message: string, data?: object }`
- **Response**: `{ sent: true }`

### send-campaign-notification
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Sends notification to campaign owners about campaign status changes.
- **Request**: `{ campaign_id: string, notification_type: string }`
- **Response**: `{ sent: true }`

### notify-event-submission
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Write (30/15min)
- **Description**: Notifies admins when a new event is submitted by a community member.
- **Request**: `{ event_id: string, submitter_email?: string }`
- **Response**: `{ notified: true }`

### report-accessibility-issue
- **Method**: POST
- **Auth**: None
- **Rate Limit**: Write (30/15min)
- **Description**: Allows users to report accessibility issues on the platform.
- **Request**: `{ page_url: string, issue_description: string, contact_email?: string }`
- **Response**: `{ reported: true, ticket_id: string }`

---

## Admin Functions

### delete-user-account
- **Method**: POST
- **Auth**: JWT (admin or self)
- **Rate Limit**: Strict (10/15min)
- **Description**: Deletes a user account and associated data (GDPR compliance).
- **Request**: `{ user_id: string, confirm: boolean }`
- **Response**: `{ deleted: true }`

### run-scheduled-audit
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None (server-only)
- **Description**: Runs scheduled security and content audits.
- **Request**: `{ audit_type: "security" | "content" | "seo" }`
- **Response**: `{ findings: Finding[] }`

### process-campaign-lifecycle
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None (server-only)
- **Description**: Processes campaign lifecycle events (start, pause, end, renew).
- **Request**: `{}`
- **Response**: `{ processed: number, started: number, ended: number }`

### system-backup
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None (server-only)
- **Description**: Triggers system backup procedures.
- **Request**: `{ backup_type?: "full" | "incremental" }`
- **Response**: `{ backup_id: string, status: string }`

### restart-web-server
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: None (server-only)
- **Description**: Triggers CDN cache purge / restart procedures.
- **Request**: `{}`
- **Response**: `{ success: boolean }`

### clear-system-cache
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Clears server-side caches (CDN, query cache).
- **Request**: `{ cache_type?: "cdn" | "query" | "all" }`
- **Response**: `{ cleared: true }`

### refresh-cdn-cache
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Purges and refreshes CDN cache for specified paths.
- **Request**: `{ paths?: string[] }`
- **Response**: `{ purged: number }`

---

## Utility Functions

### geocode-location
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Default (100/15min)
- **Description**: Geocodes an address to latitude/longitude coordinates.
- **Request**: `{ address: string }`
- **Response**: `{ latitude: number, longitude: number, formatted_address: string }`

### backfill-coordinates
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Default
- **Description**: Backfills missing latitude/longitude for records with addresses.
- **Request**: `{ entity_type: "events" | "restaurants" | "attractions", batch_size?: number }`
- **Response**: `{ updated: number, skipped: number, errors: number }`

### backfill-all-coordinates
- **Method**: POST
- **Auth**: None
- **Rate Limit**: Default
- **Description**: Runs coordinate backfill across all entity types.
- **Request**: `{ batch_size?: number }`
- **Response**: `{ events: number, restaurants: number, attractions: number }`

### backfill-all-coordinates-force
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Default
- **Description**: Force-overwrites existing coordinates with fresh geocoding results.
- **Request**: `{ entity_type: string, batch_size?: number }`
- **Response**: `{ updated: number }`

### backfill-images
- **Method**: POST
- **Auth**: API Key
- **Rate Limit**: Default
- **Description**: Backfills missing images for content records from external sources.
- **Request**: `{ entity_type: string, batch_size?: number, offset?: number }`
- **Response**: `{ updated: number, skipped: number, failed: number, nextOffset: number | null }`

### batch-process-images
- **Method**: POST
- **Auth**: JWT (verify_jwt=true)
- **Rate Limit**: Default
- **Description**: Processes images from optimization queue (resize, format conversion).
- **Request**: `{ action: "process_pending", batchSize?: number }`
- **Response**: `{ processed: number, failed: number }`
- **Note**: Currently simulated — see US-066 for real Cloudflare Images implementation.

### image-proxy
- **Method**: GET
- **Auth**: None
- **Rate Limit**: Default
- **Description**: Proxies external images through Supabase for CORS and caching.
- **Request**: Query param: `?url=<encoded-image-url>`
- **Response**: Image binary with appropriate Content-Type

### image-transform
- **Method**: GET, POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Default
- **Description**: Transforms images (resize, crop, format conversion).
- **Request**: `{ url: string, width?: number, height?: number, format?: string }`
- **Response**: Transformed image binary

### register-device-token
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Registers a mobile device push notification token (APNs/FCM).
- **Request**: `{ token: string, platform: "ios" | "android", device_id?: string }`
- **Response**: `{ registered: true }`

### security-middleware
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Shared security middleware endpoint for validation and rate limit checks.
- **Request**: Varies
- **Response**: `{ allowed: boolean }`

### social-media-manager
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Manages social media post scheduling and publishing.
- **Request**: `{ action: "schedule" | "publish" | "list", post?: object }`
- **Response**: `{ posts: Post[] }` or `{ published: true }`

---

## Integration Functions

### gsc-oauth
- **Method**: GET
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Initiates Google Search Console OAuth flow.
- **Request**: None (redirects to Google)
- **Response**: Redirect to Google OAuth consent screen

### oauth-callback
- **Method**: GET
- **Auth**: None
- **Rate Limit**: Default
- **Description**: Handles OAuth callback from Google after authorization.
- **Request**: Query params from Google: `?code=<code>&state=<state>`
- **Response**: Redirect back to admin panel with token stored

### gsc-fetch-properties
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Fetches Google Search Console properties linked to the account.
- **Request**: `{}`
- **Response**: `{ properties: Property[] }`

### gsc-sync-data
- **Method**: POST
- **Auth**: JWT (admin)
- **Rate Limit**: Default
- **Description**: Syncs search performance data from Google Search Console.
- **Request**: `{ property: string, date_range?: { start: string, end: string } }`
- **Response**: `{ synced: number, queries: QueryData[] }`

### test-google-api
- **Method**: POST
- **Auth**: JWT
- **Rate Limit**: Default
- **Description**: Tests Google API connection and credentials.
- **Request**: `{}`
- **Response**: `{ connected: boolean, scopes: string[] }`

### publish-article-webhook
- **Method**: POST
- **Auth**: None (verify_jwt=false, webhook signature)
- **Rate Limit**: Default
- **Description**: Webhook endpoint triggered when an article is published (CMS integration).
- **Request**: Webhook payload with article data
- **Response**: `{ received: true }`

### test-article-webhook
- **Method**: POST
- **Auth**: None (verify_jwt=false)
- **Rate Limit**: Default
- **Description**: Test endpoint for article webhook integration.
- **Request**: `{ test: true }`
- **Response**: `{ ok: true }`

---

## Function Summary by Auth Type

### No Auth Required (verify_jwt=false)
> These functions are public or use alternative auth (API key, webhook signature).

| Function | Alternative Auth | Justification |
|----------|-----------------|---------------|
| ai-crawler | API Key | Server-to-server scraping |
| analyze-competitor | API Key | Server-to-server analysis |
| backfill-all-coordinates-force | API Key | Server-to-server batch job |
| backfill-coordinates | API Key | Server-to-server batch job |
| bulk-enhance-events | API Key | Server-to-server batch job |
| bulk-event-updater | API Key | Server-to-server batch job |
| extract-catchdesmoines-urls | API Key | Server-to-server crawling |
| firecrawl-scraper | API Key | Server-to-server scraping |
| generate-seo-content | Rate limited (10/15min) | Public AI endpoint |
| geocode-location | Rate limited | Public utility |
| image-transform | Rate limited | Public image serving |
| log-content-metrics | Rate limited | Frontend fire-and-forget tracking |
| nlp-search | Rate limited (10/15min) | Public search |
| personalized-recommendations | Rate limited (10/15min) | Public recommendations |
| populate-playgrounds | Rate limited | Server data population |
| publish-article-webhook | Webhook signature | CMS integration |
| restaurant-opening-scraper | API Key | Server-to-server scraping |
| scrape-events | API Key | Server-to-server scraping |
| test-article-webhook | None (test only) | Development testing |

---

## Error Responses

All functions return errors in a consistent format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

| Status Code | Meaning |
|-------------|---------|
| 400 | Bad Request — Invalid input |
| 401 | Unauthorized — Missing or invalid auth |
| 403 | Forbidden — Insufficient permissions |
| 404 | Not Found — Resource doesn't exist |
| 429 | Too Many Requests — Rate limit exceeded |
| 500 | Internal Server Error — Unexpected failure |

---

## Environment Variables

Required secrets for edge functions (set via `supabase secrets set`):

| Variable | Used By | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | All | Supabase project URL (auto-set) |
| `SUPABASE_ANON_KEY` | All | Supabase anonymous key (auto-set) |
| `SUPABASE_SERVICE_ROLE_KEY` | All | Service role key for admin operations (auto-set) |
| `WORKER_API_KEY` | Scrapers, data processors | API key for server-to-server auth |
| `STRIPE_SECRET_KEY` | Payment functions | Stripe API secret key |
| `STRIPE_WEBHOOK_SIGNING_SECRET` | stripe-webhook | Stripe webhook signature verification |
| `ANTHROPIC_API_KEY` | AI functions | Claude API key |
| `OPENAI_API_KEY` | AI functions | OpenAI API key |
| `PAGESPEED_INSIGHTS_API_KEY` | SEO functions | Google PageSpeed API key |
| `RESEND_API_KEY` | Notification functions | Resend email API key |
| `APNS_KEY_ID` | Push notifications | Apple Push Notification key ID |
| `APNS_TEAM_ID` | Push notifications | Apple Developer team ID |
| `APNS_PRIVATE_KEY` | Push notifications | APNs auth key |
| `FCM_SERVICE_ACCOUNT_KEY` | Push notifications | Firebase Cloud Messaging key |
