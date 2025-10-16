# Scraper Backend Configuration

This project supports **multiple scraping backends** for different use cases.

## Available Backends

1. **Fetch** (Default) - Simple HTTP requests, works in edge functions ✅
2. **Firecrawl** (Recommended for JS sites) - Cloud service with full JS support ✅
3. **Puppeteer** ⚠️ - Does NOT work in Supabase edge functions
4. **Playwright** ⚠️ - Does NOT work in Supabase edge functions

## Quick Start

### Default Configuration (Fetch)

No setup required! The scraper uses simple HTTP fetch by default, which works in Supabase edge functions.

**Limitations:**
- ❌ Does NOT execute JavaScript
- ❌ Won't see dynamically loaded content
- ✅ Fast and reliable for server-rendered HTML
- ✅ No external dependencies

### For JavaScript-Heavy Sites (Firecrawl)

If you need to scrape sites that load content with JavaScript (like many modern SPAs):

1. Get your API key from [Firecrawl](https://firecrawl.dev)
2. Add to Supabase Edge Functions secrets:
   ```bash
   SCRAPER_BACKEND=firecrawl
   FIRECRAWL_API_KEY=fc-your-api-key-here
   ```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCRAPER_BACKEND` | `fetch` | Backend: `fetch` or `firecrawl` |
| `SCRAPER_WAIT_TIME` | `5000` | Milliseconds to wait for JS rendering |
| `SCRAPER_TIMEOUT` | `30000` | Max time for page load (ms) |
| `FIRECRAWL_API_KEY` | - | Required for Firecrawl backend |

## How It Works

### Automatic Failover

If your primary backend fails:
1. Falls back to **Firecrawl** (if API key is set)
2. Falls back to **fetch** as last resort

```typescript
// Example usage in edge function
import { scrapeUrl } from "../_shared/scraper.ts";

const result = await scrapeUrl("https://example.com", {
  backend: 'fetch', // Optional: override default
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
const results = await scrapeUrls(urls, { backend: 'fetch' }, 2);
```

## Functions Updated

The following edge functions now use the universal scraper:

1. ✅ **restaurant-opening-scraper** - Restaurant opening scraper
2. ✅ **firecrawl-scraper** - Generic event/content scraper
3. ✅ **ai-crawler** - AI content crawler

## Testing Different Backends

### Test with fetch (default):
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/firecrawl-scraper' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://www.catchdesmoines.com/events/",
    "category": "events"
  }'
```

### Test with Firecrawl:
```bash
# First set FIRECRAWL_API_KEY in edge function secrets, then:
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/firecrawl-scraper' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://www.catchdesmoines.com/events/",
    "category": "events",
    "scraperBackend": "firecrawl"
  }'
```

## Performance Comparison

| Backend | Speed | JS Support | Reliability | Cost | Works in Edge Functions |
|---------|-------|------------|-------------|------|------------------------|
| Fetch | Very Fast | ❌ None | High | Free | ✅ Yes |
| Firecrawl | Medium | ✅ Full | High | $$ | ✅ Yes |
| Puppeteer | - | - | - | - | ❌ No (requires Chrome binary) |
| Playwright | - | - | - | - | ❌ No (requires browser binary) |

## Cost Comparison

- **Fetch**: Free, runs on your Supabase functions
- **Firecrawl**: Paid API, ~$0.50 per 1000 pages (varies by plan)

## Troubleshooting

### "0 events found" or empty results

This usually means the site uses JavaScript to load content. Solutions:

1. **Switch to Firecrawl**:
   ```bash
   SCRAPER_BACKEND=firecrawl
   FIRECRAWL_API_KEY=your-key
   ```

2. **Check the HTML**: The fetch backend only gets the initial HTML response. If the site loads data via JavaScript after page load, you won't see that content.

### Firecrawl API errors

- **402 Payment Required**: Out of credits, add more or switch to fetch (for static sites)
- **429 Rate Limit**: Too many requests, reduce concurrency or wait
- **401 Unauthorized**: Check your `FIRECRAWL_API_KEY`

### Why don't Puppeteer/Playwright work?

Supabase edge functions run in isolated Deno environments that don't have:
- Chrome/Chromium binary
- Browser automation capabilities
- Graphics rendering support

For browser automation, you need:
- A cloud service like Firecrawl
- Your own server running Puppeteer/Playwright
- Or use the fetch backend for static content

## When to Use Each Backend

### Use Fetch (Default) When:
- Site content is server-rendered (traditional HTML)
- You're scraping static pages
- Speed is critical
- You want to minimize costs

### Use Firecrawl When:
- Site uses React/Vue/Angular with client-side rendering
- Content loads via AJAX/XHR after page load
- You need to interact with the page (click buttons, etc.)
- Site requires JavaScript to display content

## Migration from Firecrawl-Only Setup

If you were using only Firecrawl before:

1. **Try fetch first** - Many sites work fine with it
2. **Keep Firecrawl as fallback** - Set `FIRECRAWL_API_KEY` for automatic fallback
3. **Save money** - Use fetch by default, Firecrawl only when needed

## Support

- **Scraper Issues**: Check function logs in Supabase Dashboard
- **Firecrawl Issues**: Visit [Firecrawl Docs](https://docs.firecrawl.dev)
- **Edge Function Limits**: See [Supabase Docs](https://supabase.com/docs/guides/functions/limits)
