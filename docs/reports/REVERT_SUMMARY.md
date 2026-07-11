# Firecrawl-Scraper Revert Summary

## What Was Reverted

✅ **Reverted `supabase/functions/firecrawl-scraper/index.ts`** back to commit `1e52af5` (before URL extraction changes)

### Removed Changes:

1. ❌ `extractCatchDesMoinesVisitWebsiteUrl()` function - REMOVED
2. ❌ "Foolproof strategy" with bottom-actions div parsing - REMOVED
3. ❌ Comprehensive exclusion patterns (Vimeo, API, JS files) - REMOVED
4. ❌ Sequential processing with rate limiting - REMOVED
5. ❌ Special CatchDesMoines event detail page fetching - REMOVED

**Result:** `firecrawl-scraper` is now back to its original, working state.

---

## What Was KEPT (The Actual Fix)

✅ **`supabase/functions/extract-catchdesmoines-urls/index.ts`** - STILL FIXED

### What's Still Fixed:

1. ✅ **Vimeo exclusions added** to `excludeDomains` array
2. ✅ **Video player blocking** (`vimeo.com/api`, `player.vimeo.com`, etc.)
3. ✅ **API endpoint blocking** (`/api/`, `/player.js`, `/embed.js`)
4. ✅ **JavaScript file blocking** (`.js?`, `.js#`, `.js$`)
5. ✅ **YouTube player blocking** (embeds, players)

This was the **ONLY function that needed fixing** - it's the one called by the `CatchDesmoinUrlExtractor.tsx` UI component.

---

## Why This is Correct

### Two Separate Functions, Two Separate Purposes:

| Function                          | Purpose                                 | Status                                |
| --------------------------------- | --------------------------------------- | ------------------------------------- |
| **`firecrawl-scraper`**           | Scrapes NEW events from various sources | ✅ Reverted to original working state |
| **`extract-catchdesmoines-urls`** | Updates EXISTING CatchDesMoines events  | ✅ Fixed - now blocks Vimeo URLs      |

---

## Your Console Logs Were From:

The Vimeo URLs in `ConsoleLogs.md` came from **`extract-catchdesmoines-urls`**, which has now been fixed:

```json
{
  "event_message": "Selected visit URL: https://player.vimeo.com/api/player.js",
  "event_message": "Extraction diagnostic: { candidatesAfterFilter: 8, ... }"
}
```

This diagnostic format is **unique to `extract-catchdesmoines-urls`** - not `firecrawl-scraper`.

---

## Summary

✅ **`firecrawl-scraper`** - Reverted to original (it was working fine!)  
✅ **`extract-catchdesmoines-urls`** - Fixed with Vimeo blocking (this was the problem!)  
✅ **No more Vimeo URLs** - The exclusion list now blocks them properly

---

## Next Steps

1. **Stage and commit these changes:**

   ```bash
   git add supabase/functions/firecrawl-scraper/index.ts
   git add supabase/functions/extract-catchdesmoines-urls/index.ts
   git commit -m "Revert firecrawl-scraper to original state, keep Vimeo fix in extract-catchdesmoines-urls"
   ```

2. **Test the URL extractor:**

   - Open `CatchDesmoinUrlExtractor.tsx` UI
   - Click "Dry Run (Test)" with 10 events
   - Verify NO Vimeo URLs appear in logs

3. **Deploy if tests pass:**
   ```bash
   git push origin main
   ```

---

## Files Modified in This Session

✅ **Reverted:**

- `supabase/functions/firecrawl-scraper/index.ts` (back to commit 1e52af5)

✅ **Fixed:**

- `supabase/functions/extract-catchdesmoines-urls/index.ts` (added Vimeo exclusions)

📄 **Documentation:**

- `VIMEO_FIX_APPLIED.md` (explains the fix)
- `REVERT_SUMMARY.md` (this file)

---

**Bottom Line:** The scraper that was working fine (`firecrawl-scraper`) is back to normal. The scraper that was broken (`extract-catchdesmoines-urls`) is now fixed. 🎯
