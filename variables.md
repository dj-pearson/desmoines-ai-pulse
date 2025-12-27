# Environment Variables Master Sheet

**Last Updated**: 2025-12-27
**Project**: Des Moines AI Pulse
**Purpose**: Complete reference of all environment variables used across the platform

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Frontend Variables (Vite)](#frontend-variables-vite)
3. [Supabase Auto-Provided Variables](#supabase-auto-provided-variables)
4. [Supabase Secrets (Edge Functions)](#supabase-secrets-edge-functions)
5. [Build & Testing Variables](#build--testing-variables)
6. [Script Variables](#script-variables)
7. [Setup Commands](#setup-commands)
8. [Troubleshooting](#troubleshooting)

---

## Quick Reference

### Required for Production
| Variable | Location | Type |
|----------|----------|------|
| `VITE_SUPABASE_URL` | `.env` | Plain text |
| `VITE_SUPABASE_ANON_KEY` | `.env` | Plain text |
| `VITE_SITE_URL` | `.env` + Supabase secrets | Plain text |
| `STRIPE_SECRET_KEY` | Supabase secrets | Secret |
| `STRIPE_WEBHOOK_SECRET` | Supabase secrets | Secret |

### Minimum Setup
```bash
# Local .env file
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_SITE_URL=https://desmoinesinsider.com

# Supabase secrets (required for edge functions)
supabase secrets set VITE_SITE_URL=https://desmoinesinsider.com
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Frontend Variables (Vite)

These variables are prefixed with `VITE_` and are accessible in the browser via `import.meta.env.VITE_*`.

> **Important**: These are exposed to the client. Never put secrets here.

### Core Configuration (Required)

| Variable | Description | Format | Used In |
|----------|-------------|--------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` | `src/integrations/supabase/client.ts` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key | JWT string `eyJhbG...` | `src/integrations/supabase/client.ts` |
| `VITE_SITE_URL` | Production site URL | `https://desmoinesinsider.com` | SEO, OAuth redirects, edge functions |

### Payments (Required for Subscriptions)

| Variable | Description | Format | Used In |
|----------|-------------|--------|---------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (safe for browser) | `pk_test_...` or `pk_live_...` | Payment components |

### Monitoring & Analytics (Optional)

| Variable | Description | Format | Used In |
|----------|-------------|--------|---------|
| `VITE_SENTRY_DSN` | Sentry DSN for error tracking | `https://xxx@sentry.io/xxx` | `src/lib/errorTracking.ts` |
| `VITE_GA_MEASUREMENT_ID` | Google Analytics 4 Measurement ID | `G-XXXXXXXXXX` | Analytics tracking |
| `VITE_GOOGLE_ANALYTICS_ID` | Alias for GA Measurement ID | `G-XXXXXXXXXX` | Analytics tracking |

### Authentication (Optional)

| Variable | Description | Format | Used In |
|----------|-------------|--------|---------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID | `xxx.apps.googleusercontent.com` | Google Sign-In |

### Feature Flags (Optional)

| Variable | Description | Default | Used In |
|----------|-------------|---------|---------|
| `VITE_ENABLE_AI_FEATURES` | Enable AI-powered features | `true` | Feature gating |
| `VITE_ENABLE_PAYMENTS` | Enable payment processing | `true` | Feature gating |
| `VITE_ENABLE_ANALYTICS` | Enable analytics tracking | `true` | Feature gating |
| `VITE_DEBUG` | Enable debug mode | `false` | Debug logging |

### Rate Limiting (Optional)

| Variable | Description | Default | Used In |
|----------|-------------|---------|---------|
| `VITE_RATE_LIMIT_MAX` | Max requests per window | `100` | API rate limiting |
| `VITE_RATE_LIMIT_WINDOW_MS` | Rate limit window in ms | `900000` (15 min) | API rate limiting |

### Email (Optional - Edge Function Preferred)

| Variable | Description | Format | Used In |
|----------|-------------|--------|---------|
| `VITE_RESEND_API_KEY` | Resend API key (client-side) | `re_...` | `src/lib/email-integration.ts` |

> **Note**: Prefer using `RESEND_API_KEY` in Supabase secrets for server-side email sending.

---

## Supabase Auto-Provided Variables

These variables are automatically available in Supabase Edge Functions. **Do not set these manually.**

| Variable | Description | Availability |
|----------|-------------|--------------|
| `SUPABASE_URL` | Supabase project URL | Edge functions |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Edge functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin) | Edge functions |

### Usage in Edge Functions
```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
```

---

## Supabase Secrets (Edge Functions)

These are set via `supabase secrets set` and are only accessible in Edge Functions.

### Stripe Integration (Required for Payments)

| Variable | Description | Format | Used In |
|----------|-------------|--------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_test_...` or `sk_live_...` | `stripe-webhook`, `create-subscription-checkout`, `create-campaign-checkout`, `verify-campaign-payment`, `process-stripe-refund` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` | `stripe-webhook` |

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### AI/ML Services

| Variable | Description | Format | Used In |
|----------|-------------|--------|---------|
| `CLAUDE_API` | Anthropic Claude API key (primary) | `sk-ant-...` | Most AI functions |
| `CLAUDE_API_KEY` | Anthropic Claude API key (alias) | `sk-ant-...` | Fallback for `CLAUDE_API` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` | `personalized-recommendations` |
| `LOVABLE_API_KEY` | Lovable API key | String | `test-ai-model` |

```bash
supabase secrets set CLAUDE_API=sk-ant-xxx
# OR
supabase secrets set CLAUDE_API_KEY=sk-ant-xxx
supabase secrets set OPENAI_API_KEY=sk-xxx
```

**Edge functions using AI:**
- `generate-itinerary` - Trip planning
- `nlp-search` - Natural language search
- `generate-article` - Article generation
- `generate-seo-content` - SEO content
- `enhance-content` - Content enhancement
- `analyze-competitor` - Competitor analysis
- `suggest-article-topics` - Topic suggestions
- `generate-weekend-guide` - Weekend guides
- `scrape-events` - Event extraction with AI
- `ai-crawler` - AI-powered web crawling
- `firecrawl-scraper` - Firecrawl with AI parsing
- `social-media-manager` - Social media content
- `validate-source-urls` - URL validation

### Google APIs

| Variable | Description | Format | Used In |
|----------|-------------|--------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `xxx.apps.googleusercontent.com` | `gsc-oauth` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | String | `gsc-oauth` |
| `GOOGLE_REDIRECT_URI` | Google OAuth Redirect URI | URL | `gsc-oauth` |
| `GOOGLE_SEARCH_API` | Google Custom Search API key | String | `bulk-update-restaurants`, `fix-broken-event-urls`, `batch-enhance-events`, `check-restaurant-status`, `search-new-restaurants` |
| `GOOGLE_PLACES_API` | Google Places API key | String | `populate-playgrounds`, `bulk-event-updater`, `backfill-all-coordinates-force` |
| `GOOGLE_MAPS_KEY` | Google Maps API key | String | `fix-broken-event-urls` |
| `GOOGLE_CUSTOM_SEARCH_API` | Google Custom Search API key | String | `fix-broken-event-urls` |
| `GOOGLE_PROGRAMMATIC_KEY` | Alias for GOOGLE_SEARCH_API | String | `batch-enhance-events` |
| `GOOGLE_SEARCH_ENGINE_ID` | Custom Search Engine ID | `a67b454ea60fc4b35` | `batch-enhance-events` |
| `PAGESPEED_INSIGHTS_API_KEY` | PageSpeed Insights API key | String | `check-core-web-vitals` |

```bash
supabase secrets set GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
supabase secrets set GOOGLE_CLIENT_SECRET=xxx
supabase secrets set GOOGLE_REDIRECT_URI=https://your-project.supabase.co/functions/v1/gsc-oauth/callback
supabase secrets set GOOGLE_SEARCH_API=AIzaSy...
supabase secrets set GOOGLE_PLACES_API=AIzaSy...
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=AIzaSy...
```

### Email & Notifications

| Variable | Description | Format | Used In |
|----------|-------------|--------|---------|
| `RESEND_API_KEY` | Resend email API key | `re_...` | `send-event-reminders`, `send-weekly-digest`, `send-seo-notification` |
| `EMAIL_PROVIDER` | Email provider to use | `console`, `resend`, `slack`, `discord` | `send-seo-notification` |
| `EMAIL_FROM` | Default from email address | `noreply@domain.com` | `send-seo-notification` |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | URL | `send-seo-notification` |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL | URL | `send-seo-notification` |

```bash
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set EMAIL_PROVIDER=resend
supabase secrets set EMAIL_FROM=noreply@desmoinesinsider.com
supabase secrets set SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx
```

### Web Scraping & Crawling

| Variable | Description | Format | Default | Used In |
|----------|-------------|--------|---------|---------|
| `BROWSERLESS_API` | Browserless.io API key (primary) | String | - | `_shared/scraper.ts` |
| `BROWSERLESS_API_KEY` | Browserless.io API key (alias) | String | - | `_shared/scraper.ts` |
| `BROWSERLESS_URL` | Browserless.io URL | URL | `https://production-sfo.browserless.io` | `_shared/scraper.ts` |
| `FIRECRAWL_API_KEY` | Firecrawl API key | String | - | `_shared/scraper.ts` |
| `SCRAPER_BACKEND` | Scraper backend to use | `browserless`, `firecrawl` | `browserless` | `_shared/scraper.ts` |
| `SCRAPER_WAIT_TIME` | Wait time after page load (ms) | Number | `5000` | `_shared/scraper.ts` |
| `SCRAPER_TIMEOUT` | Request timeout (ms) | Number | `30000` | `_shared/scraper.ts` |
| `SCRAPER_USER_AGENT` | Custom user agent | String | Chrome UA | `_shared/scraper.ts` |

```bash
supabase secrets set BROWSERLESS_API=xxx
supabase secrets set BROWSERLESS_URL=https://production-sfo.browserless.io
supabase secrets set FIRECRAWL_API_KEY=xxx
supabase secrets set SCRAPER_BACKEND=browserless
```

### Environment & Security

| Variable | Description | Format | Default | Used In |
|----------|-------------|--------|---------|---------|
| `ENVIRONMENT` | Current environment | `development`, `staging`, `production` | `development` | `_shared/cors.ts` |
| `VITE_SITE_URL` | Site URL (also needed in secrets) | URL | - | `_shared/cors.ts`, various functions |
| `CRON_SECRET` | Secret for cron job authentication | String | - | `run-scheduled-audit` |

```bash
supabase secrets set ENVIRONMENT=production
supabase secrets set VITE_SITE_URL=https://desmoinesinsider.com
supabase secrets set CRON_SECRET=your-secret-here
```

### Redis (Optional - For Advanced Rate Limiting)

| Variable | Description | Format | Used In |
|----------|-------------|--------|---------|
| `UPSTASH_REDIS_URL` | Upstash Redis REST URL | URL | Rate limiting (documented) |
| `UPSTASH_REDIS_TOKEN` | Upstash Redis REST token | String | Rate limiting (documented) |

```bash
supabase secrets set UPSTASH_REDIS_URL=https://xxx.upstash.io
supabase secrets set UPSTASH_REDIS_TOKEN=xxx
```

---

## Build & Testing Variables

These are standard Node.js environment variables used during build and testing.

| Variable | Description | Where Set | Used In |
|----------|-------------|-----------|---------|
| `NODE_ENV` | Node environment | System/CI | `postcss.config.cjs`, documentation examples |
| `ANALYZE` | Enable bundle analyzer | Command line | `vite.config.ts` |
| `CI` | CI environment indicator | CI system | `playwright.config.ts` |
| `PLAYWRIGHT_TEST_BASE_URL` | Base URL for Playwright tests | CI/local | `playwright.config.ts` |
| `AUDIT_URL` | URL for audit script | Command line | `audit-comprehensive.ts` |

### Usage Examples
```bash
# Build with bundle analyzer
ANALYZE=true npm run build

# Run Playwright tests against specific URL
PLAYWRIGHT_TEST_BASE_URL=http://localhost:8080 npm test

# Run audit against specific URL
AUDIT_URL=https://desmoinesinsider.com npx tsx audit-comprehensive.ts
```

---

## Script Variables

These are used by scripts in the `scripts/` directory.

### Scripts Using `.env` Variables

| Script | Variables Used |
|--------|----------------|
| `scripts/analyze-event-dates.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `scripts/analyze-event-urls.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `scripts/backfill-coordinates.ts` | `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| `scripts/check-catchdesmoines-urls.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `scripts/check-harbour-update.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `scripts/convert-timezones.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `scripts/event-datetime-crawler.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `scripts/find-platform-events.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `scripts/find-wine-event.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `scripts/generate-dynamic-sitemaps.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `scripts/run-migration.ts` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `scripts/test-direct-update.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `scripts/test-eventbrite-extraction.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

### Supabase Scripts

| Script | Variables Used |
|--------|----------------|
| `supabase/scripts/Bulk_Event_Updater.ts` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API` |

---

## Setup Commands

### Complete Setup Checklist

```bash
# 1. Create .env file from template
cp .env.example .env

# 2. Edit .env with your values
# Required:
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_SITE_URL=https://desmoinesinsider.com

# For payments:
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

# 3. Set Supabase secrets

# Required for production
supabase secrets set VITE_SITE_URL=https://desmoinesinsider.com
supabase secrets set ENVIRONMENT=production

# Stripe (required for payments)
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

# AI features
supabase secrets set CLAUDE_API=sk-ant-...

# Email notifications
supabase secrets set RESEND_API_KEY=re_...

# Google integrations
supabase secrets set GOOGLE_SEARCH_API=AIzaSy...
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=AIzaSy...

# Web scraping
supabase secrets set BROWSERLESS_API=...

# 4. Verify secrets
supabase secrets list
```

### Environment-Specific Configurations

#### Development
```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGci...local_key
VITE_SITE_URL=http://localhost:8080
VITE_DEBUG=true
```

#### Staging
```env
VITE_SUPABASE_URL=https://staging-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...staging_key
VITE_SITE_URL=https://staging.desmoinesinsider.com
VITE_DEBUG=true
```

#### Production
```env
VITE_SUPABASE_URL=https://production-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...production_key
VITE_SITE_URL=https://desmoinesinsider.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_SENTRY_DSN=https://...@sentry.io/...
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_DEBUG=false
```

---

## Troubleshooting

### Common Issues

#### "VITE_SUPABASE_URL is not defined"
```bash
# Check .env file exists and has the variable
grep VITE_SUPABASE_URL .env

# Ensure no typos (must start with VITE_)
VITE_SUPABASE_URL=...  # ✅ Correct
SUPABASE_URL=...       # ❌ Won't work in frontend
```

#### "CORS error in edge functions"
```bash
# Ensure VITE_SITE_URL is set in Supabase secrets
supabase secrets set VITE_SITE_URL=https://desmoinesinsider.com
supabase secrets set ENVIRONMENT=production
```

#### "Stripe checkout not working"
```bash
# Verify Stripe secrets are set
supabase secrets list | grep STRIPE

# Set if missing
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

#### "AI features not working"
```bash
# Check Claude API key
supabase secrets list | grep CLAUDE

# Set using either name (both work)
supabase secrets set CLAUDE_API=sk-ant-...
# OR
supabase secrets set CLAUDE_API_KEY=sk-ant-...
```

#### "PageSpeed Insights not working"
```bash
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=AIzaSy...
```

### Checking Current Secrets
```bash
# List all secrets (values hidden)
supabase secrets list

# List specific secret (will show if set)
supabase secrets list | grep STRIPE_SECRET_KEY
```

### Removing Secrets
```bash
# Remove a secret
supabase secrets unset SECRET_NAME
```

---

## Variable Usage by Feature

### Feature: Payments & Subscriptions
- Frontend: `VITE_STRIPE_PUBLISHABLE_KEY`
- Edge Functions: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### Feature: AI Content Generation
- Edge Functions: `CLAUDE_API` or `CLAUDE_API_KEY`

### Feature: Personalized Recommendations
- Edge Functions: `OPENAI_API_KEY`

### Feature: Event Scraping
- Edge Functions: `BROWSERLESS_API`, `FIRECRAWL_API_KEY`, `CLAUDE_API`

### Feature: Google Search Console
- Edge Functions: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

### Feature: SEO Auditing
- Edge Functions: `PAGESPEED_INSIGHTS_API_KEY`

### Feature: Email Notifications
- Edge Functions: `RESEND_API_KEY`, `EMAIL_FROM`

### Feature: Slack/Discord Alerts
- Edge Functions: `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL`

### Feature: Error Tracking
- Frontend: `VITE_SENTRY_DSN`

### Feature: Analytics
- Frontend: `VITE_GA_MEASUREMENT_ID`

---

## Security Notes

1. **Never commit `.env` files** - They're in `.gitignore` for a reason
2. **`VITE_*` variables are public** - Anyone can see them in browser DevTools
3. **Use Supabase secrets for sensitive data** - API keys, webhooks, etc.
4. **Rotate secrets regularly** - Especially after team member changes
5. **Use test keys in development** - Never use production keys locally
6. **Keep service role key secret** - It bypasses RLS policies

---

---

## Stripe Product Configuration

### Consumer Subscription Products

The platform uses two paid subscription tiers managed through Stripe. These products must be created in your Stripe account before subscriptions can be processed.

#### Products to Create

| Product | Monthly Price | Yearly Price | Features |
|---------|--------------|--------------|----------|
| **Des Moines Insider** | $4.99 | $49.99 | Unlimited favorites, early event access, advanced filters, ad-free, priority support |
| **Des Moines VIP** | $12.99 | $129.99 | Everything in Insider + VIP events, reservation assistance, SMS alerts, concierge |

#### Setup Script

Use the provided setup scripts to create Stripe products:

```bash
# Using Node.js script (recommended - cross-platform)
npm run setup:stripe              # Create products in test mode
npm run setup:stripe:dry-run      # Preview without creating

# Using PowerShell (Windows with Stripe CLI)
.\scripts\setup-stripe-products.ps1
.\scripts\setup-stripe-products.ps1 -DryRun
.\scripts\setup-stripe-products.ps1 -Live  # For production
```

#### Database Configuration

After running the setup script, update the `subscription_plans` table with the Stripe price IDs:

```sql
-- Example (replace with actual IDs from script output)
UPDATE public.subscription_plans
SET
    stripe_price_id_monthly = 'price_xxx_monthly',
    stripe_price_id_yearly = 'price_xxx_yearly',
    updated_at = NOW()
WHERE name = 'insider';

UPDATE public.subscription_plans
SET
    stripe_price_id_monthly = 'price_yyy_monthly',
    stripe_price_id_yearly = 'price_yyy_yearly',
    updated_at = NOW()
WHERE name = 'vip';
```

Or use the helper function:

```sql
SELECT update_subscription_stripe_prices('insider', 'price_xxx_monthly', 'price_xxx_yearly');
SELECT update_subscription_stripe_prices('vip', 'price_yyy_monthly', 'price_yyy_yearly');
```

#### Webhook Configuration

Configure a webhook endpoint in Stripe Dashboard:
- **Endpoint URL**: `https://your-project.supabase.co/functions/v1/stripe-webhook`
- **Events to listen for**:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

#### Required Supabase Secrets

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx  # or sk_test_xxx for testing
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### Advertising Campaigns

Advertising campaigns use dynamic pricing based on placement types and duration. Products are created on-the-fly during checkout (not pre-configured in Stripe).

| Placement Type | Description |
|----------------|-------------|
| `top_banner` | Top Banner Ad |
| `featured_spot` | Featured Spot Ad |
| `below_fold` | Below the Fold Ad |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | 2025-12-27 | Added Stripe product configuration section |
| 1.0 | 2025-12-27 | Initial comprehensive documentation |
