# Scraper Backend Configuration

This project now supports **multiple scraping backends** with automatic failover. You can choose between:

1. **Puppeteer** (Chromium-based, local) - Default
2. **Playwright** (Multi-browser, local)
3. **Firecrawl** (Cloud service, paid)

## Quick Start

### Set Your Preferred Backend

Add this environment variable to your Supabase Edge Functions:

```bash
# Choose one:
SCRAPER_BACKEND=puppeteer   # Default - Uses Chromium locally
SCRAPER_BACKEND=playwright  # Uses Playwright locally
SCRAPER_BACKEND=firecrawl   # Uses Firecrawl cloud service (requires API key)
```

### Configure Firecrawl (Optional Fallback)

If you want Firecrawl as a fallback when Puppeteer/Playwright fail:

1. Get your API key from [Firecrawl](https://firecrawl.dev)
2. Add to Supabase Edge Functions secrets:
   ```bash
   FIRECRAWL_API_KEY=fc-your-api-key-here
   ```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRAPER_BACKEND` | `puppeteer` | Which backend to use: `puppeteer`, `playwright`, or `firecrawl` |
| `SCRAPER_WAIT_TIME` | `5000` | Milliseconds to wait for JS rendering |
| `SCRAPER_TIMEOUT` | `30000` | Max time for page load (ms) |
| `SCRAPER_USER_AGENT` | Chrome 120 | User agent string |
| `FIRECRAWL_API_KEY` | - | Required for Firecrawl backend |

## How It Works

### Automatic Failover

If your primary backend (Puppeteer/Playwright) fails and you have `FIRECRAWL_API_KEY` set, the scraper will automatically fall back to Firecrawl.

```typescript
// Example usage in edge function
import { scrapeUrl } from "../_shared/scraper.ts";

const result = await scrapeUrl("https://example.com", {
  backend: 'puppeteer', // Optional: override default
  waitTime: 5000,
  timeout: 30000,
});

if (result.success) {
  console.log(`Scraped ${result.html?.length} chars using ${result.backend}`);
  const content = result.markdown || result.text || result.html;
}
```

### Multiple URLs

```typescript
import { scrapeUrls } from "../_shared/scraper.ts";

const urls = [
  "https://example.com/events",
  "https://example.com/restaurants",
];

// Scrape 2 URLs at a time
const results = await scrapeUrls(urls, { backend: 'puppeteer' }, 2);
```

## Functions Updated

The following edge functions now use the universal scraper:

1. ✅ **restaurant-opening-scraper** - Restaurant opening scraper
2. ✅ **firecrawl-scraper** - Generic event/content scraper
3. 🔄 **ai-crawler** - AI content crawler (uses native fetch, no changes needed)
4. 🔄 **scrape-events** - Calls firecrawl-scraper (automatically uses new system)

## Testing Different Backends

You can test each backend from the admin dashboard:

1. Go to **Admin** → **Scraping** tab
2. Click "Run Restaurant Scraper" or other scraping jobs
3. Check the logs to see which backend was used

To change backends:

1. Go to Supabase Dashboard
2. Navigate to **Edge Functions** → **Secrets**
3. Update `SCRAPER_BACKEND` value
4. Save and retry your scraping job

## Performance Comparison

| Backend | Speed | JS Support | Reliability | Cost |
|---------|-------|------------|-------------|------|
| Puppeteer | Fast | Excellent | High | Free |
| Playwright | Fast | Excellent | Very High | Free |
| Firecrawl | Medium | Excellent | High | $$ |

## Cost Comparison

- **Puppeteer/Playwright**: Free, runs on your Supabase functions
- **Firecrawl**: Paid API, $0.50 per 1000 pages (as of 2024)

## Troubleshooting

### "Browser executable not found"

If Puppeteer/Playwright fails to launch:
1. Set `SCRAPER_BACKEND=firecrawl` temporarily
2. Check Supabase function logs for details
3. Contact Supabase support if issue persists

### Firecrawl API errors

- **402 Payment Required**: Out of credits, add more or switch to Puppeteer
- **429 Rate Limit**: Too many requests, reduce concurrency or wait
- **401 Unauthorized**: Check your `FIRECRAWL_API_KEY`

### Puppeteer/Playwright timeout

Increase timeouts:
```bash
SCRAPER_TIMEOUT=60000  # 60 seconds
SCRAPER_WAIT_TIME=10000  # 10 seconds
```

## Migration from Firecrawl

If you were previously using only Firecrawl:

1. **No action required** - System defaults to Puppeteer
2. **Keep Firecrawl as fallback** - Leave `FIRECRAWL_API_KEY` set
3. **Save money** - Remove `FIRECRAWL_API_KEY` to use only local scrapers

## Advanced Configuration

### Per-Function Backend Selection

You can override the backend for specific scraping jobs:

```typescript
// In your edge function
const result = await scrapeUrl(url, {
  backend: 'playwright', // Override default
  waitForSelector: '.event-list', // Wait for specific element
  waitTime: 8000,
});
```

### Custom User Agents

Set custom user agent for specific sites:

```typescript
const result = await scrapeUrl(url, {
  userAgent: 'MyBot/1.0 (+https://mysite.com/bot)',
});
```

## Support

- **Scraper Issues**: Check function logs in Supabase Dashboard
- **Firecrawl Issues**: Visit [Firecrawl Docs](https://docs.firecrawl.dev)
- **Puppeteer Docs**: [puppeteer.dev](https://pptr.dev/)
- **Playwright Docs**: [playwright.dev](https://playwright.dev/)
