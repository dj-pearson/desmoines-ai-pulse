# Scraper Backend Configuration

This project supports **multiple scraping backends** for JavaScript-heavy websites.

## Available Backends (for JS Sites)

### 1. **Browserless** (Recommended) ✅
- Cloud-based Chrome automation API
- **Free tier: 6 hours/month** (usually enough for regular scraping)
- Full JavaScript execution
- Works perfectly in edge functions
- Sign up: https://browserless.io

**Setup:**
```bash
SCRAPER_BACKEND=browserless
BROWSERLESS_API_KEY=your-api-key-here
```

### 2. **Self-Hosted Puppeteer** (Best for heavy usage)
- Deploy your own Puppeteer service
- **Free** on services like Render.com, Railway.app, or Fly.io
- Unlimited scraping (within your server limits)
- See "Self-Hosting Guide" below

### 3. **Firecrawl** (Premium option)
- Most reliable, professional service
- $0.50 per 1000 pages
- Best for mission-critical scraping

### 4. **Fetch** (Static sites only)
- Simple HTTP requests
- ❌ Does NOT execute JavaScript
- Only use for server-rendered HTML sites

## Quick Start

### Option A: Browserless (Easiest)

1. Sign up at https://browserless.io (free tier available)
2. Get your API token
3. Add to Supabase Edge Function Secrets:
   ```bash
   BROWSERLESS_API_KEY=your-token-here
   SCRAPER_BACKEND=browserless
   ```
4. Done! Your scraper now handles JavaScript sites

### Option B: Self-Host Puppeteer

Deploy this simple service to Render/Railway/Fly.io:

```javascript
// server.js
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

app.use(express.json());

app.post('/scrape', async (req, res) => {
  const { url, waitTime = 5000 } = req.body;
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(waitTime);
    
    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);
    
    res.json({ success: true, html, text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    await browser.close();
  }
});

app.listen(3000);
```

Then set:
```bash
SCRAPER_BACKEND=browserless
BROWSERLESS_URL=https://your-service.onrender.com/scrape
BROWSERLESS_API_KEY=optional-auth-token
```

## Environment Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `SCRAPER_BACKEND` | `browserless` | Which backend to use |
| `BROWSERLESS_API_KEY` | `abc123...` | Browserless.io API token |
| `BROWSERLESS_URL` | Custom URL | For self-hosted Puppeteer |
| `SCRAPER_WAIT_TIME` | `5000` | Wait time for JS (ms) |
| `SCRAPER_TIMEOUT` | `30000` | Request timeout (ms) |
| `FIRECRAWL_API_KEY` | `fc-...` | Firecrawl fallback key |

## How It Works

### Automatic Backend Selection

```typescript
// If BROWSERLESS_API_KEY is set
→ Uses Browserless by default
→ Falls back to Firecrawl if available
→ Falls back to fetch as last resort

// If no API keys set
→ Uses fetch (won't work for JS sites)
```

### Per-Request Override

```typescript
const result = await scrapeUrl(url, {
  backend: 'browserless', // Override default
  waitTime: 8000,
});
```

## Testing

```bash
# Test with Browserless
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/firecrawl-scraper' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://www.catchdesmoines.com/events/",
    "category": "events"
  }'
```

## Cost Comparison

| Backend | Free Tier | Cost | JS Support | Best For |
|---------|-----------|------|------------|----------|
| Browserless | 6 hrs/month | $10/mo for 20 hrs | ✅ Full | Getting started |
| Self-Hosted | Unlimited | ~$5/mo hosting | ✅ Full | Heavy usage |
| Firecrawl | Limited | $0.50/1000 pages | ✅ Full | Enterprise |
| Fetch | Unlimited | Free | ❌ None | Static sites only |

## Recommended Setup

For your use case (scraping CatchDesMoines.com and similar JS sites):

**Start with Browserless:**
- Free tier is probably enough
- Set it up in 2 minutes
- Upgrade to $10/mo if needed

**Scale to Self-Hosted:**
- Deploy when you exceed free tier
- Full control, no limits
- Costs ~$5/mo for hosting

## Troubleshooting

### "0 events found" with fetch backend

✅ **Solution:** Switch to Browserless - the site uses JavaScript

```bash
SCRAPER_BACKEND=browserless
BROWSERLESS_API_KEY=your-key
```

### Browserless timeout errors

Increase wait time for slow sites:
```bash
SCRAPER_WAIT_TIME=10000  # 10 seconds
SCRAPER_TIMEOUT=60000    # 60 seconds
```

### Self-hosted service failing

Check your service logs and ensure:
- Puppeteer dependencies are installed
- Enough memory (512MB minimum)
- `--no-sandbox` flag is set

## Self-Hosting Puppeteer (Detailed Guide)

### Deploy to Render.com (Free)

1. Create `package.json`:
```json
{
  "name": "puppeteer-scraper",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "puppeteer": "^21.0.0"
  }
}
```

2. Create `server.js` (see code above)

3. Deploy to Render:
   - Connect GitHub repo
   - Select "Web Service"
   - Build command: `npm install`
   - Start command: `npm start`

4. Set in Supabase:
```bash
SCRAPER_BACKEND=browserless
BROWSERLESS_URL=https://your-app.onrender.com/scrape
```

### Deploy to Railway.app (Free)

Railway auto-detects Node.js apps - just:
1. Connect repo
2. Deploy
3. Copy URL to `BROWSERLESS_URL`

### Deploy to Fly.io

```bash
fly launch
fly deploy
```

## Support

- **Browserless Issues**: https://docs.browserless.io
- **Self-hosting Help**: Check your hosting provider's logs
- **Scraper Issues**: Check Supabase edge function logs

## Migration from Fetch

If you were using `fetch` and getting no results:

1. Sign up for Browserless free tier
2. Add API key to Supabase secrets
3. Done! Your scraper now works with JS sites

No code changes needed - the scraper automatically uses the best available backend.
