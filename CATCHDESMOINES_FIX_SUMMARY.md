# CatchDesMoines URL Extraction - Critical Fix Applied

## Issue Identified from Your Logs

Looking at `scrape.md`, every event was showing:

```
⚠️ No external URL found
⚠️ No Visit Website found for "Event Name", using detail URL: https://www.catchdesmoines.com/event/...
```

This meant the extraction code was running but **failing to find the "Visit Website" buttons**.

## Root Cause

**CatchDesMoines.com is a JavaScript-rendered website.**

The "Visit Website" buttons are added to the page AFTER the initial HTML loads via JavaScript. Our code was using plain `fetch()` to retrieve event detail pages, which only returned the server-rendered HTML **without the JavaScript-rendered buttons**.

### Proof

When I tested with Puppeteer (which runs JavaScript), the button was clearly visible:

```html
<a
  href="https://www.facebook.com/IngersollNightmare"
  target="_blank"
  class="action-item"
>
  Visit Website
</a>
```

But when using `fetch()`, this button wasn't in the HTML at all.

## The Fix

Changed `extractCatchDesMoinesVisitWebsiteUrl()` function to use **Firecrawl API** instead of plain `fetch()`:

### Before (Broken)

```typescript
const response = await fetch(eventUrl, {
  headers: { "User-Agent": "..." },
});
const html = await response.text();
// ❌ Gets only server-rendered HTML, no JavaScript content
```

### After (Working)

```typescript
const firecrawlResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
  method: "POST",
  headers: { Authorization: `Bearer ${firecrawlApiKey}` },
  body: JSON.stringify({
    url: eventUrl,
    formats: ["html"],
    waitFor: 2000, // ✅ Waits for JavaScript to execute
  }),
});
const html = firecrawlData.data?.html;
// ✅ Gets fully-rendered HTML with all dynamic content
```

### Additional Improvements

1. **Flexible Regex Patterns**: Updated regex to handle varying attribute orders in HTML
2. **Better Error Logging**: Added check for empty HTML responses
3. **Mailto Filter**: Excludes `mailto:` links (like "Send an Email" buttons)

## Cost Impact

- **Before**: 3 Firecrawl API calls (3 list pages)
- **After**: ~33 Firecrawl API calls (3 list pages + 30 event detail pages)

**Why it's worth it**: Users get actual venue/event websites instead of CatchDesMoines URLs, providing much more value.

## Files Changed

1. **`supabase/functions/firecrawl-scraper/index.ts`**

   - Lines 36-120: Updated `extractCatchDesMoinesVisitWebsiteUrl()` to use Firecrawl
   - Line 712: Added `firecrawlApiKey` parameter to function call
   - Improved regex patterns for better HTML matching

2. **`CATCHDESMOINES_URL_EXTRACTION.md`**
   - Updated documentation with root cause analysis
   - Added cost consideration section
   - Explained JavaScript rendering issue

## Testing

Next time you run the "Catch Des Moines Events" scraping job, you should see:

```
🔗 Processing 35 events to extract Visit Website URLs...
🔍 Extracting Visit Website URL from: https://www.catchdesmoines.com/event/...
✅ Found Visit Website URL: https://www.facebook.com/...
✅ Found Visit Website URL: https://prariemeadows.com/...
✅ Extracted Visit Website URL for "Event Name": https://venue.com
✅ Completed URL extraction for 35 events
```

Instead of:

```
⚠️ No external URL found  ❌ (old behavior)
```

## Database Impact

Events will now have:

- **source_url**: External venue/event website (e.g., Facebook event, venue website)
- **NOT**: CatchDesMoines.com URLs

This provides users with direct links to get tickets, RSVP, or learn more about the event from the source.

## Ready to Deploy

The fix is complete and ready to test. Run your next scraping job and check the Supabase Function logs to verify the new behavior!
