# CatchDesMoines.com Event URL Extraction - CORRECTED

## Overview

This document explains how the scraping system properly extracts "Visit Website" URLs from CatchDesMoines.com event pages instead of storing the CatchDesMoines.com URL itself.

## The Architecture

The actual flow is:

1. **Frontend** (`src/hooks/useScraping.ts`) → calls `scrape-events`
2. **scrape-events** → calls `firecrawl-scraper`
3. **firecrawl-scraper** → Uses Firecrawl API + Claude AI to extract events
4. Events are returned with proper source URLs

## The Problem

Previously, when scraping events from CatchDesMoines.com, the scraper would store the CatchDesMoines event page URL (e.g., `https://www.catchdesmoines.com/event/chef-georges-steak-bar-classics/53924/`) as the `source_url`.

However, each event page on CatchDesMoines has a **"Visit Website"** button that links to the actual venue or event website, which is more valuable for users.

### Multiple Issues Discovered

1. **List Page Problem**: When scraping the events list page (`https://www.catchdesmoines.com/events/`), the AI only sees the list content, not the individual event detail pages where the "Visit Website" buttons are located.

2. **JavaScript Rendering Problem**: CatchDesMoines.com uses **JavaScript to dynamically render** the "Visit Website" buttons. Using plain `fetch()` only gets server-rendered HTML, which doesn't include these buttons. This is why the extraction was failing with "⚠️ No external URL found" errors.

## The Solution

### HTML Structure Analysis

CatchDesMoines event detail pages have this structure:

```html
<div class="bottom-actions">
  <a
    href="https://www.facebook.com/events/reinhardt-room/chef-georges-steak-bar-classics/1488274002187996/"
    target="_blank"
    class="action-item"
  >
    <i aria-hidden="true" class="fas fa-external-link-alt"></i>
    Visit Website
  </a>
</div>
```

### Implementation

**File**: `supabase/functions/firecrawl-scraper/index.ts`

#### 1. Updated AI Prompt (Lines 236-247)

The AI now extracts BOTH:

- **Event detail URL** - The individual event page on catchdesmoines.com (e.g., `/event/concert-name/12345/`)
- **Visit Website URL** (if visible) - External venue/event website links

```typescript
🎯 PRIORITY URL EXTRACTION:
For CatchDesMoines event list pages, you need to extract BOTH:
1. **Event detail page URL** - The individual event page on catchdesmoines.com
2. **Visit Website URL** (if visible in the list) - External venue/event website links

Look for these patterns:
- Event detail URLs: href="/event/event-name/NUMBER/"
- Visit Website links: <a href="https://external-venue.com" class="action-item">Visit Website</a>
```

#### 2. URL Extraction Function (Lines 36-120)

`extractCatchDesMoinesVisitWebsiteUrl()` - Uses **Firecrawl API** (not plain fetch) to get JavaScript-rendered content, then extracts "Visit Website" URLs:

**Key Fix**: Uses Firecrawl instead of `fetch()` to ensure JavaScript-rendered buttons are visible.

- **Strategy 1**: Look for any `<a class="action-item">` link containing "Visit Website" text (flexible attribute order)
- **Strategy 2**: Search within `<div class="bottom-actions">` for external links
- **Filtering**: Excludes `catchdesmoines.com` URLs and `mailto:` links

```typescript
async function extractCatchDesMoinesVisitWebsiteUrl(
  eventUrl: string,
  firecrawlApiKey: string
): Promise<string | null> {
  // Uses Firecrawl API to get JavaScript-rendered HTML
  // Extracts the "Visit Website" URL using regex patterns
  // Returns the external URL or null if not found
}
```

#### 3. Integration with Event Processing (Lines 622-666)

After AI extracts events from the list page, the system:

1. Checks if each event has a `detail_url` field
2. Converts relative URLs to absolute URLs
3. Fetches each event detail page
4. Extracts the "Visit Website" URL
5. Updates the `source_url` field

```typescript
if (category === "events" && url.includes("catchdesmoines.com")) {
  filteredItems = await Promise.all(
    filteredItems.map(async (item) => {
      if (item.detail_url) {
        const visitWebsiteUrl = await extractCatchDesMoinesVisitWebsiteUrl(
          eventDetailUrl
        );
        if (visitWebsiteUrl) {
          finalSourceUrl = visitWebsiteUrl;
        }
      }
      return { ...item, source_url: finalSourceUrl };
    })
  );
}
```

## Example Use Cases

### Example 1: Event List Page Scraping

**Input URL**:

```
https://www.catchdesmoines.com/events/
```

**Process**:

1. Firecrawl fetches the list page HTML
2. Claude AI extracts all events AND their detail URLs like `/event/concert-name/12345/`
3. For each event:
   - System fetches `https://www.catchdesmoines.com/event/concert-name/12345/`
   - Extracts the "Visit Website" URL (e.g., `https://venue-website.com`)
   - Stores that as the `source_url`
4. If no "Visit Website" URL found, falls back to the event detail URL

**Result**: Events in database have venue/event website URLs, not catchdesmoines.com URLs

### Example 2: Single Event Page

**Input URL**:

```
https://www.catchdesmoines.com/event/chef-georges-steak-bar-classics/53924/
```

**Extracted Visit Website URL**:

```
https://www.facebook.com/events/reinhardt-room/chef-georges-steak-bar-classics/1488274002187996/
```

**Result**: The event in your database will have `source_url` = Facebook event URL

## Console Output

When running the scraper, you'll see logs like:

```
🔗 Processing 12 events to extract Visit Website URLs...
🔍 Extracting Visit Website URL from: https://www.catchdesmoines.com/event/concert-name/12345/
✅ Found via action-item: https://venue-website.com/events/concert
✅ Extracted Visit Website URL for "Concert Name": https://venue-website.com/events/concert
✅ Completed URL extraction for 12 events
```

Or if no URL is found:

```
⚠️ No external URL found
⚠️ No Visit Website found for "Event Name", using detail URL: https://www.catchdesmoines.com/event/event-name/12345/
```

## Error Handling

The extraction function gracefully handles errors:

- If extraction fails, falls back to the event detail URL
- Logs warnings when "Visit Website" link isn't found
- 15-second timeout to avoid hanging
- Comprehensive error logging for debugging
- Continues processing other events even if one fails

## Testing

### Via Frontend

1. Go to your admin dashboard
2. Navigate to the Scraping section
3. Run the "Catch Des Moines Events" job
4. Check the console logs in Supabase Functions
5. Verify in the database that `source_url` fields contain venue websites, not catchdesmoines.com URLs

### Via Supabase Functions UI

Test the `firecrawl-scraper` function directly:

```json
{
  "url": "https://www.catchdesmoines.com/events/",
  "category": "events",
  "maxPages": 1
}
```

Check the logs and verify that:

1. Events are extracted
2. Detail URLs are found
3. Visit Website URLs are extracted
4. Final `source_url` values are correct

## Fallback Behavior

The system has multiple fallback levels:

1. **Best**: External venue/event website URL from "Visit Website" button
2. **Good**: CatchDesMoines event detail page URL
3. **Fallback**: CatchDesMoines events list page URL

This ensures events are always stored with the best available URL.

## Performance Considerations

- Each event detail page fetch adds ~1-2 seconds
- For 12 events, expect ~15-30 seconds total processing time
- Requests run in parallel using `Promise.all()` for efficiency
- 15-second timeout per request prevents hanging

## Related Files

- `supabase/functions/firecrawl-scraper/index.ts` - Main implementation (THIS IS THE ACTIVE ONE)
- `supabase/functions/scrape-events/index.ts` - Orchestrator that calls firecrawl-scraper
- `supabase/functions/ai-crawler/index.ts` - Alternative implementation (less commonly used)
- `src/hooks/useScraping.ts` - Frontend hook that triggers scraping
- `src/components/CompetitorAnalysis.tsx` - UI that calls firecrawl-scraper directly

## Future Enhancements

Potential improvements:

1. **Caching**: Cache extracted URLs to avoid re-fetching
2. **Batch Processing**: Process multiple detail pages in parallel batches
3. **URL Validation**: Verify extracted URLs are accessible
4. **Priority System**: Prefer official venue websites over social media links
5. **Retry Logic**: Retry failed extractions with exponential backoff
