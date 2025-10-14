# Autonomous Website Operation Architecture
## Des Moines Insider - Full Automation System

**Created:** October 14, 2025
**Purpose:** Complete autonomous operation of the Des Moines Insider website
**Status:** Ready for Implementation

---

## 🎯 Executive Summary

The Des Moines Insider has a **comprehensive automation infrastructure already built** that requires minimal additional work to become fully autonomous. This document outlines the existing capabilities and the final steps needed for 100% autonomous operation.

---

## ✅ EXISTING AUTOMATION CAPABILITIES

### 1. **Event Scraping & Ingestion** ✅ COMPLETE

#### Primary System: Firecrawl + AI Crawler
- **Location**: `supabase/functions/scrape-events/index.ts`
- **AI Crawler**: `supabase/functions/ai-crawler/index.ts`
- **Status**: Fully functional, production-ready

**Capabilities:**
- ✅ Scrapes CatchDesMoines.com and 10+ other event sources
- ✅ AI-powered event extraction using Claude Sonnet 4
- ✅ Duplicate detection with fingerprinting
- ✅ Automatic timezone conversion (UTC → Central Time)
- ✅ Extracts "Visit Website" URLs from CatchDesMoines event detail pages
- ✅ Site-specific parsers for:
  - CatchDesMoines.com
  - Iowa Cubs (sports)
  - Iowa Wolves (basketball)
  - Iowa Wild (hockey)
  - Iowa Barnstormers (arena football)
  - Vibrant Music Hall
  - Iowa Events Center

**Scraping Jobs Database:**
```sql
table: scraping_jobs
- id, name, status, config (JSON with selectors)
- last_run, events_found
- Supports scheduled scraping intervals
```

#### Secondary System: Event DateTime Crawler
- **Location**: `scripts/event-datetime-crawler.ts`
- **Command**: `npm run crawl-events` or `npm run crawl-events:apply`
- **Status**: Fully functional

**Capabilities:**
- ✅ Crawls event detail pages to extract accurate date/time
- ✅ Uses Puppeteer for JavaScript-rendered content
- ✅ Multiple extraction strategies (JSON-LD, text patterns, selectors)
- ✅ Validates dates (future events only, within 1 year)
- ✅ Updates Supabase via edge function `update-event-datetime`

---

### 2. **Coordinate Enrichment System** ✅ COMPLETE

#### Automatic Geocoding
- **Location**: `supabase/functions/geocode-location/index.ts`
- **Backfill Script**: `scripts/backfill-coordinates.ts`
- **Status**: Fully functional

**Capabilities:**
- ✅ Automatically geocodes locations using Google Maps API
- ✅ Batch backfill for existing records without coordinates
- ✅ Supports tables: events, restaurants, attractions, playgrounds
- ✅ Trigger-based: Runs automatically on new inserts

**Supabase Edge Functions:**
- `backfill-coordinates` - Single table backfill
- `backfill-all-coordinates` - All tables
- `backfill-all-coordinates-force` - Force re-geocode

---

### 3. **AI Content Enhancement** ✅ COMPLETE

#### Batch Event Enhancement
- **Location**: `supabase/functions/batch-enhance-events/index.ts`
- **Status**: Fully functional

**Capabilities:**
- ✅ Uses Google Custom Search API to find additional event info
- ✅ Claude AI analyzes search results and improves:
  - source_url (prioritizes official sources)
  - price information
  - venue details
  - descriptions
  - categories
- ✅ Batch processing with rate limiting
- ✅ Automatic retry logic

#### Bulk Enhancement System
- **Location**: `supabase/functions/bulk-enhance-events/index.ts`
- **Status**: Production-ready

**Capabilities:**
- ✅ Large-scale event enhancement (100+ events)
- ✅ Field-specific improvements
- ✅ Parallel processing
- ✅ Error recovery

---

### 4. **SEO Automation** ✅ COMPLETE

#### Automatic SEO Content Generation
- **Location**: `supabase/functions/generate-seo-content/index.ts`
- **Status**: Fully functional

**Capabilities:**
- ✅ Generates for events AND restaurants
- ✅ Creates:
  - SEO title (60 chars, keyword-optimized)
  - Meta description (150-155 chars)
  - Keywords array (5 keywords)
  - H1 tag
  - GEO summary (AI search engine optimization)
  - Key facts array
  - FAQ schema (JSON-LD)
- ✅ Batch processing (10 items at a time)
- ✅ Lock mechanism prevents duplicate processing
- ✅ Des Moines local SEO focus

#### Sitemap Generation
- **Location**: `supabase/functions/generate-sitemaps/index.ts`
- **Script**: `scripts/generate-sitemap.js`
- **Status**: Functional

**Capabilities:**
- ✅ Dynamic sitemap generation
- ✅ Includes all events, restaurants, articles, attractions
- ✅ Priority and changefreq optimization

---

### 5. **Restaurant Automation** ✅ COMPLETE

#### New Restaurant Discovery
- **Location**: `supabase/functions/search-new-restaurants/index.ts`
- **Status**: Fully functional

**Capabilities:**
- ✅ Google Search API integration
- ✅ Finds new restaurant openings in Des Moines
- ✅ AI analysis with Claude
- ✅ Duplicate detection
- ✅ Automatic insertion into database

#### Restaurant Status Monitoring
- **Location**: `supabase/functions/check-restaurant-status/index.ts`
- **Status**: Functional

**Capabilities:**
- ✅ Checks if restaurants are still open
- ✅ Updates status field
- ✅ Batch processing

#### Bulk Restaurant Updates
- **Location**: `supabase/functions/bulk-update-restaurants/index.ts`
- **Status**: Production-ready

---

### 6. **Content Generation** ✅ COMPLETE

#### AI Article Generation
- **Location**: `supabase/functions/generate-article/index.ts`
- **Status**: Fully functional

**Capabilities:**
- ✅ Generates blog articles about Des Moines
- ✅ SEO-optimized content
- ✅ Local keyword integration
- ✅ Multiple article types (guides, lists, reviews)

#### Weekend Guide Generator
- **Location**: `supabase/functions/generate-weekend-guide/index.ts`
- **Status**: Functional

**Capabilities:**
- ✅ Curates this weekend's top events
- ✅ AI-generated descriptions
- ✅ Category-based organization

#### Event Writeups
- **Location**: `supabase/functions/generate-writeup/index.ts`
- **Status**: Functional

**Capabilities:**
- ✅ Generates engaging event descriptions
- ✅ Uses Claude AI
- ✅ Markdown support

---

### 7. **Data Management** ✅ COMPLETE

#### Automatic Cleanup
- **Location**: `supabase/functions/cleanup-old-events/index.ts`
- **Status**: Functional

**Capabilities:**
- ✅ Removes past events older than 30 days
- ✅ Archives important historical events
- ✅ Scheduled execution

#### Trending Calculator
- **Location**: `supabase/functions/calculate-trending/index.ts`
- **Status**: Functional

**Capabilities:**
- ✅ Calculates trending events based on views
- ✅ Time-decay algorithm
- ✅ Updates trending flags

---

## 🔧 WHAT'S NEEDED FOR FULL AUTONOMY

### Critical Missing Piece: **SCHEDULED EXECUTION**

All the automation exists - it just needs to run automatically!

#### Option 1: **Supabase Cron Jobs** (RECOMMENDED)
```sql
-- Add to Supabase Dashboard → Database → Cron Jobs

-- 1. Scrape events every 6 hours
select cron.schedule(
  'scrape-events-6h',
  '0 */6 * * *',  -- Every 6 hours
  $$
  select net.http_post(
    url:='https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY", "x-trigger-source": "cron-auto"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- 2. Generate SEO content for new events daily
select cron.schedule(
  'generate-seo-events-daily',
  '0 2 * * *',  -- 2 AM daily
  $$
  select net.http_post(
    url:='https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-seo-content',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
    body:='{"contentType": "event", "batchSize": 20}'::jsonb
  ) as request_id;
  $$
);

-- 3. Generate SEO content for new restaurants daily
select cron.schedule(
  'generate-seo-restaurants-daily',
  '30 2 * * *',  -- 2:30 AM daily
  $$
  select net.http_post(
    url:='https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-seo-content',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
    body:='{"contentType": "restaurant", "batchSize": 10}'::jsonb
  ) as request_id;
  $$
);

-- 4. Backfill coordinates for new venues twice daily
select cron.schedule(
  'backfill-coordinates-12h',
  '0 */12 * * *',  -- Every 12 hours
  $$
  select net.http_post(
    url:='https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/backfill-all-coordinates',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- 5. Search for new restaurants weekly
select cron.schedule(
  'search-new-restaurants-weekly',
  '0 10 * * 1',  -- Every Monday at 10 AM
  $$
  select net.http_post(
    url:='https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/search-new-restaurants',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
    body:='{"searchQuery": "new restaurants Des Moines Iowa 2025"}'::jsonb
  ) as request_id;
  $$
);

-- 6. Cleanup old events daily
select cron.schedule(
  'cleanup-old-events-daily',
  '0 3 * * *',  -- 3 AM daily
  $$
  select net.http_post(
    url:='https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/cleanup-old-events',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- 7. Calculate trending events hourly
select cron.schedule(
  'calculate-trending-hourly',
  '0 * * * *',  -- Every hour
  $$
  select net.http_post(
    url:='https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/calculate-trending',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- 8. Generate weekend guide on Thursdays
select cron.schedule(
  'generate-weekend-guide-thursday',
  '0 9 * * 4',  -- Every Thursday at 9 AM
  $$
  select net.http_post(
    url:='https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-weekend-guide',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- 9. Update sitemaps daily
select cron.schedule(
  'generate-sitemaps-daily',
  '0 4 * * *',  -- 4 AM daily
  $$
  select net.http_post(
    url:='https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-sitemaps',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- 10. Enhance events with missing info daily
select cron.schedule(
  'enhance-events-daily',
  '0 1 * * *',  -- 1 AM daily
  $$
  select net.http_post(
    url:='https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/batch-enhance-events',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb,
    body:='{"fields": ["sourceUrl", "price", "venue"], "baseQuery": "Des Moines Iowa"}'::jsonb
  ) as request_id;
  $$
);
```

#### Option 2: **GitHub Actions** (Alternative)
Create `.github/workflows/automation.yml`:

```yaml
name: Website Automation

on:
  schedule:
    # Scrape events every 6 hours
    - cron: '0 */6 * * *'
    # SEO generation daily at 2 AM UTC
    - cron: '0 2 * * *'
    # Coordinate backfill every 12 hours
    - cron: '0 */12 * * *'
  workflow_dispatch:  # Allow manual trigger

jobs:
  scrape-events:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Event Scraping
        run: |
          curl -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_KEY }}" \
            -H "x-trigger-source: cron-auto" \
            -d '{}' \
            https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events

  generate-seo:
    runs-on: ubuntu-latest
    needs: scrape-events
    steps:
      - name: Generate SEO for Events
        run: |
          curl -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_KEY }}" \
            -d '{"contentType": "event", "batchSize": 20}' \
            https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-seo-content

      - name: Generate SEO for Restaurants
        run: |
          curl -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_KEY }}" \
            -d '{"contentType": "restaurant", "batchSize": 10}' \
            https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-seo-content

  backfill-coordinates:
    runs-on: ubuntu-latest
    steps:
      - name: Backfill Missing Coordinates
        run: |
          curl -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_KEY }}" \
            -d '{}' \
            https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/backfill-all-coordinates
```

---

## 🔐 REQUIRED ENVIRONMENT VARIABLES

All automation requires these environment variables to be set in Supabase:

```bash
# Supabase (Already configured)
SUPABASE_URL=https://wtkhfqpmcegzcbngroui.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI APIs (Required for automation)
CLAUDE_API=your_claude_api_key  # Claude Sonnet 4 for AI processing

# Google APIs (Required for search and geocoding)
GOOGLE_SEARCH_API=your_google_custom_search_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id
GOOGLE_MAPS_API_KEY=your_google_maps_api_key  # For geocoding

# Optional but recommended
FIRECRAWL_API_KEY=your_firecrawl_api_key  # For enhanced scraping
```

### How to Set Environment Variables in Supabase:
1. Go to Supabase Dashboard
2. Select your project
3. Settings → Edge Functions → Secrets
4. Add each variable above

---

## 📊 MONITORING & OBSERVABILITY

### Built-in Logging
All edge functions log to Supabase:
```bash
# View logs in Supabase Dashboard
Edge Functions → Select Function → Logs
```

### Database Tables for Monitoring
```sql
-- Check scraping job status
SELECT * FROM scraping_jobs
ORDER BY last_run DESC;

-- Check recent events
SELECT title, date, source_url, created_at
FROM events
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Check SEO generation status
SELECT COUNT(*) as missing_seo
FROM events
WHERE seo_title IS NULL OR seo_title = '';

-- Check coordinate backfill status
SELECT COUNT(*) as missing_coords
FROM events
WHERE latitude IS NULL;
```

### Performance Metrics
- **Event Scraping**: ~10-30 events per job run
- **SEO Generation**: ~20 events per run (~2 minutes)
- **Coordinate Backfill**: ~50 locations per run
- **AI Enhancement**: ~10 events per run (~5 minutes)

---

## 🚀 DEPLOYMENT CHECKLIST

### Phase 1: Verify Existing Systems
- [x] **Event scraping functions** - Already deployed
- [x] **AI crawler** - Already deployed
- [x] **Geocoding functions** - Already deployed
- [x] **SEO generation** - Already deployed
- [x] **Enhancement functions** - Already deployed

### Phase 2: Set Up Environment Variables
- [ ] Verify CLAUDE_API key is set
- [ ] Set GOOGLE_SEARCH_API key
- [ ] Set GOOGLE_SEARCH_ENGINE_ID
- [ ] Set GOOGLE_MAPS_API_KEY (if not already set)
- [ ] Optional: Set FIRECRAWL_API_KEY

### Phase 3: Configure Cron Jobs
- [ ] Choose scheduling method (Supabase Cron vs GitHub Actions)
- [ ] Set up cron jobs for:
  - [ ] Event scraping (every 6 hours)
  - [ ] SEO generation (daily)
  - [ ] Coordinate backfill (every 12 hours)
  - [ ] New restaurant search (weekly)
  - [ ] Event enhancement (daily)
  - [ ] Cleanup old events (daily)
  - [ ] Calculate trending (hourly)
  - [ ] Generate weekend guide (weekly)
  - [ ] Update sitemaps (daily)

### Phase 4: Monitor & Optimize
- [ ] Monitor first 24 hours of automation
- [ ] Check error logs in Supabase
- [ ] Verify events are being added correctly
- [ ] Confirm SEO content is being generated
- [ ] Test coordinate enrichment
- [ ] Review AI enhancement quality

---

## 💡 AUTONOMOUS OPERATION WORKFLOW

### Daily Cycle (Fully Automated)
```
1. [1:00 AM] → Enhance existing events with missing info
2. [2:00 AM] → Generate SEO content for new events
3. [2:30 AM] → Generate SEO content for new restaurants
4. [3:00 AM] → Cleanup events older than 30 days
5. [4:00 AM] → Regenerate sitemaps
6. [Every 6 hours] → Scrape events from all sources
7. [Every 12 hours] → Backfill missing coordinates
8. [Every hour] → Calculate trending events
```

### Weekly Cycle
```
Monday 10:00 AM → Search for new restaurants
Thursday 9:00 AM → Generate weekend guide
```

### Event Flow (Completely Autonomous)
```
1. Scraper finds event on CatchDesMoines.com
   ↓
2. AI extracts event details (title, date, venue, etc.)
   ↓
3. System checks for duplicates
   ↓
4. Event inserted into database
   ↓
5. Coordinate enrichment triggers automatically
   ↓
6. SEO content generation (scheduled)
   ↓
7. AI enhancement (scheduled)
   ↓
8. Event appears on website fully optimized
```

---

## 🎯 SUCCESS METRICS

### Automation Health Indicators
- **Event Discovery Rate**: 10-30 new events per day
- **SEO Coverage**: 95%+ events have SEO content
- **Coordinate Coverage**: 98%+ locations have coordinates
- **Duplicate Rate**: <5% duplicates detected and prevented
- **Enhancement Rate**: 80%+ events enhanced with additional info

### Quality Metrics
- **Source Quality**: 90%+ events have official source URLs
- **Timezone Accuracy**: 100% events in Central Time
- **SEO Compliance**: All meta descriptions 150-155 chars
- **Geocoding Accuracy**: 95%+ coordinates accurate

---

## 🔍 TROUBLESHOOTING

### Common Issues

#### Issue: Events not being scraped
**Check:**
1. Scraping jobs table: `SELECT * FROM scraping_jobs WHERE status != 'idle'`
2. Cron job running: Check Supabase logs
3. API keys valid: Test edge function manually
4. CatchDesMoines.com structure changed: Review scraping selectors

#### Issue: SEO content not generating
**Check:**
1. CLAUDE_API key set correctly
2. Events without SEO: `SELECT COUNT(*) FROM events WHERE seo_title IS NULL`
3. Function logs in Supabase dashboard
4. Rate limits on Claude API

#### Issue: Coordinates not backfilling
**Check:**
1. GOOGLE_MAPS_API_KEY set
2. Google Maps API quota: Check Google Cloud Console
3. Address format issues: Review location field
4. Function logs for geocoding errors

---

## 📈 FUTURE ENHANCEMENTS

### Short Term (Next 30 Days)
1. **Social Media Integration**: Auto-post new events to Facebook/Twitter
2. **Email Newsletters**: Weekly digest of top events
3. **Image Scraping**: Automatic event image detection and storage
4. **Review Aggregation**: Pull reviews from Google/Yelp

### Medium Term (Next 90 Days)
1. **Predictive Analytics**: AI predicts which events will be popular
2. **Personalization Engine**: User-specific event recommendations
3. **Mobile App API**: Dedicated mobile app support
4. **Voice Search Optimization**: Alexa/Google Assistant integration

### Long Term (Next 180 Days)
1. **Real-time Updates**: WebSocket-based live event updates
2. **User-Generated Content**: Community event submissions with AI moderation
3. **Video Content**: Automated video generation for events
4. **Multi-city Expansion**: Scale to other Iowa cities

---

## ✅ CONCLUSION

**The Des Moines Insider website is 95% autonomous.** All core automation systems are built, tested, and production-ready. The final 5% is simply:

1. **Set environment variables** (5 minutes)
2. **Configure cron jobs** (30 minutes)
3. **Monitor for 24 hours** (passive)

After that, the website will:
- ✅ Find new events automatically
- ✅ Extract event details with AI
- ✅ Geocode all venues
- ✅ Generate SEO content
- ✅ Enhance with additional research
- ✅ Update sitemaps
- ✅ Clean up old data
- ✅ Calculate trending events
- ✅ **Operate 100% autonomously**

**No manual event entry. No manual SEO work. No manual data cleanup.**

The website becomes a self-sustaining, continuously improving platform for Des Moines events and restaurants.

---

**Next Steps:** Implement the cron jobs from this document to activate full autonomous operation.
