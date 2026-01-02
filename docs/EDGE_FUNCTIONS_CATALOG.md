# Edge Functions Catalog

**Last Updated**: 2026-01-01
**Total Functions**: 73
**Location**: `supabase/functions/`

This catalog documents all Supabase Edge Functions in the Des Moines AI Pulse platform, organized by category with descriptions and usage notes.

---

## Table of Contents

1. [AI & Content Generation](#ai--content-generation)
2. [Payments & Subscriptions](#payments--subscriptions)
3. [Web Scraping & Data Collection](#web-scraping--data-collection)
4. [Search & Discovery](#search--discovery)
5. [SEO & Analytics](#seo--analytics)
6. [Image Processing](#image-processing)
7. [Geocoding & Location](#geocoding--location)
8. [Events Management](#events-management)
9. [Restaurant Management](#restaurant-management)
10. [Communications](#communications)
11. [System & Infrastructure](#system--infrastructure)
12. [Testing & Development](#testing--development)
13. [Shared Utilities](#shared-utilities)

---

## AI & Content Generation

Functions that use AI (Claude, OpenAI) to generate or enhance content.

| Function | Description | AI Model |
|----------|-------------|----------|
| `ai-crawler` | Crawls websites using Claude AI to extract events, restaurants, attractions from HTML with intelligent parsing and deduplication | Claude |
| `analyze-competitor` | Analyzes competitor websites to generate competitive insights, content gaps, and strategic recommendations | Claude |
| `analyze-content` | Analyzes content for quality, readability, and optimization suggestions | Claude |
| `enhance-content` | Enhances existing content with AI-powered improvements and SEO optimization | Claude |
| `generate-article` | Generates SEO-optimized blog articles for Des Moines content with local optimization and keyword research | Claude |
| `generate-itinerary` | Generates personalized multi-day trip itineraries based on user preferences and available local content | Claude |
| `generate-seo-content` | Generates SEO meta tags, descriptions, H1s, FAQs, and GEO optimization content | Claude Haiku |
| `generate-weekend-guide` | Generates weekly weekend activity guides featuring top events and attractions | Claude |
| `generate-writeup` | Creates detailed writeups and descriptions for venues and events | Claude |
| `personalized-recommendations` | Generates AI-powered event recommendations based on user history and preferences | Claude/Rules |
| `suggest-article-topics` | Suggests trending article topics based on local events and search trends | Claude |

---

## Payments & Subscriptions

Functions handling Stripe payments, subscriptions, and billing.

| Function | Description | Provider |
|----------|-------------|----------|
| `create-campaign-checkout` | Creates Stripe checkout sessions for one-time advertising campaign payments | Stripe |
| `create-subscription-checkout` | Creates Stripe checkout sessions for recurring subscription plans (Insider/VIP tiers) | Stripe |
| `process-stripe-refund` | Processes refund requests for campaigns and subscriptions | Stripe |
| `stripe-webhook` | Handles Stripe webhook events for payments, subscriptions, and invoices | Stripe |
| `verify-campaign-payment` | Verifies campaign payment status and updates database records | Stripe |

---

## Web Scraping & Data Collection

Functions for crawling websites and extracting data.

| Function | Description | Method |
|----------|-------------|--------|
| `crawl-site` | Crawls external websites to extract structured content | Puppeteer/Fetch |
| `extract-catchdesmoines-urls` | Extracts event URLs from CatchDesMoines.com listings | Custom Parser |
| `firecrawl-scraper` | Advanced web scraping using Firecrawl API for complex sites | Firecrawl API |
| `restaurant-opening-scraper` | Scrapes news sources for new restaurant opening announcements | Custom Parser |
| `scrape-events` | Orchestrates event scraping from configured sources with AI extraction | Multi-source |
| `search-new-restaurants` | Searches for and discovers new restaurant listings from various sources | Multi-source |

---

## Search & Discovery

Functions powering search and content discovery features.

| Function | Description | Technology |
|----------|-------------|------------|
| `nlp-search` | Parses natural language queries using AI to extract intent and filters, then searches content | Claude + PostgreSQL |
| `calculate-trending` | Calculates trending scores for content based on engagement and popularity | PostgreSQL Functions |

---

## SEO & Analytics

Functions for SEO auditing, monitoring, and analytics.

| Function | Description | Output |
|----------|-------------|--------|
| `check-broken-links` | Scans content for broken links and reports 404 errors | JSON Report |
| `check-core-web-vitals` | Monitors Core Web Vitals metrics (LCP, FID, CLS) for key pages | Metrics Data |
| `check-security-headers` | Audits security headers (CSP, HSTS, X-Frame-Options) | Security Report |
| `export-analytics-data` | Exports analytics data in various formats for reporting | CSV/JSON |
| `generate-sitemap` | Generates XML sitemaps for search engine indexing | sitemap.xml |
| `generate-sitemaps` | Generates multiple specialized sitemaps (events, restaurants, etc.) | Multiple XMLs |
| `log-content-metrics` | Logs content performance metrics for analysis | Database |
| `run-scheduled-audit` | Runs scheduled SEO audits on configured pages | Audit Report |
| `seo-audit` | Performs comprehensive SEO audits analyzing meta tags, headings, images, links | Detailed Report |
| `send-seo-notification` | Sends notifications about SEO issues and improvements | Email/Webhook |
| `sync-analytics-data` | Syncs analytics data from external sources to database | Database Sync |

### Google Search Console Integration

| Function | Description |
|----------|-------------|
| `gsc-fetch-properties` | Fetches verified site properties from Google Search Console |
| `gsc-oauth` | Handles Google Search Console OAuth authentication flow |
| `gsc-sync-data` | Synchronizes search performance data from GSC to database |
| `oauth-callback` | Generic OAuth callback handler for third-party integrations |

---

## Image Processing

Functions for image optimization and manipulation.

| Function | Description | Technology |
|----------|-------------|------------|
| `analyze-images` | Analyzes images for quality, dimensions, and optimization opportunities | Sharp/Custom |
| `batch-process-images` | Batch processes and optimizes multiple images | Sharp |
| `image-proxy` | Proxies and caches external images with optimization | Sharp |
| `image-transform` | Transforms images (resize, crop, format conversion) | Sharp |

---

## Geocoding & Location

Functions for location and coordinate processing.

| Function | Description | API |
|----------|-------------|-----|
| `backfill-all-coordinates` | Backfills missing coordinates for all content (dry run mode) | Nominatim |
| `backfill-all-coordinates-force` | Force backfills coordinates for all content | Nominatim |
| `backfill-coordinates` | Backfills missing coordinates for specific records | Nominatim |
| `geocode-location` | Converts addresses to latitude/longitude coordinates | OpenStreetMap Nominatim |

---

## Events Management

Functions specifically for event data management.

| Function | Description |
|----------|-------------|
| `api-events` | Public API endpoint for querying events with filtering |
| `batch-enhance-events` | Batch enhances events with AI-generated descriptions and SEO |
| `bulk-enhance-events` | Bulk enhancement of multiple events in parallel |
| `bulk-event-updater` | Bulk updates event fields across multiple records |
| `cleanup-old-events` | Archives or removes past events from active listings |
| `fix-broken-event-urls` | Fixes and updates broken event URLs |
| `update-event-datetime` | Updates event date/time information from source |
| `validate-source-urls` | Validates that source URLs are still accessible |

---

## Restaurant Management

Functions specifically for restaurant data management.

| Function | Description |
|----------|-------------|
| `api-restaurants` | Public API endpoint for querying restaurants with filtering |
| `auto-enrich-restaurants` | Automatically enriches restaurant data from multiple sources |
| `bulk-update-restaurants` | Bulk updates restaurant fields across multiple records |
| `check-restaurant-status` | Verifies restaurant operational status (open/closed) |

---

## Communications

Functions for sending notifications and communications.

| Function | Description | Provider |
|----------|-------------|----------|
| `publish-article-webhook` | Sends webhooks when articles are published | Webhooks |
| `send-event-reminders` | Sends customized event reminder emails at scheduled intervals | Resend |
| `send-weekly-digest` | Sends weekly digest emails with top events and content | Resend |
| `social-media-manager` | Manages social media posting and scheduling | Multi-platform |

---

## System & Infrastructure

Functions for system maintenance and infrastructure.

| Function | Description |
|----------|-------------|
| `clear-system-cache` | Clears application and CDN caches |
| `populate-playgrounds` | Populates playground/park data for family features |
| `refresh-cdn-cache` | Refreshes CDN cache for updated content |
| `restart-web-server` | Triggers web server restart (for deployments) |
| `security-middleware` | Shared security middleware for request validation |
| `system-backup` | Creates system backups of database and configurations |

---

## Testing & Development

Functions for testing and development purposes.

| Function | Description |
|----------|-------------|
| `test-ai-model` | Tests AI model connectivity and responses |
| `test-article-webhook` | Tests article webhook delivery |
| `test-google-api` | Tests Google API connectivity and credentials |

---

## Shared Utilities

Located in `supabase/functions/_shared/`, these are reusable utilities used by multiple functions.

| Module | Description |
|--------|-------------|
| `cors.ts` | CORS headers configuration with environment-aware origins |
| `rateLimit.ts` | Rate limiting middleware (100 requests per 15 minutes per IP) |
| `validation.ts` | Input validation utilities with schema-based validation |
| `supabase.ts` | Supabase client initialization with service role |
| `anthropic.ts` | Anthropic Claude API client setup |
| `openai.ts` | OpenAI API client setup |

---

## Deployment

### Deploy a Single Function

```bash
supabase functions deploy <function-name>
```

### Deploy All Functions

```bash
supabase functions deploy
```

### Set Secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=<key>
supabase secrets set STRIPE_SECRET_KEY=<key>
supabase secrets set STRIPE_WEBHOOK_SECRET=<key>
supabase secrets set RESEND_API_KEY=<key>
# ... other secrets
```

### View Function Logs

```bash
supabase functions logs <function-name>
```

---

## Common Patterns

### Standard Function Structure

```typescript
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body
    const body = await req.json();

    // Your logic here...

    return new Response(
      JSON.stringify({ success: true, data: result }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
```

### Rate Limiting Pattern

```typescript
import { rateLimiter } from '../_shared/rateLimit.ts';

const rateLimit = await rateLimiter(req);
if (!rateLimit.success) {
  return new Response(
    JSON.stringify({ error: 'Rate limit exceeded' }),
    { status: 429, headers: corsHeaders }
  );
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-01 | Initial catalog with 73 functions documented |
