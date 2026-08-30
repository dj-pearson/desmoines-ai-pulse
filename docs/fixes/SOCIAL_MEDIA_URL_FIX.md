# Social Media URL Generation Fix

## Problem Identified

The Social Media Manager was generating event URLs that didn't match the actual event page URLs, causing 404 errors when users clicked on social media links.

### Example Issue
- **Social Media Generated**: `https://desmoinesinsider.com/events/everybodys-favorite-bbq-hot-sauce-festival-edm-fest-2025-09-04`
- **Actual Event Page**: `https://desmoinesinsider.com/events/everybody-s-favorite-bbq-hot-sauce-festival-edm-fest-2025-09-04`

### Root Cause
Two different slug generation functions with inconsistent apostrophe handling:

**Social Media Manager (`createSlug`):**
```typescript
.replace(/[^a-z0-9\s-]/g, "")  // Remove apostrophe
.replace(/\s+/g, "-")          // Convert spaces to hyphens
```

**Main Event Slug Function (`createEventSlugWithCentralTime`):**
```typescript
.replace(/[^a-z0-9]+/g, "-")   // Convert apostrophe to hyphen
```

## Solution Implemented

### Fixed Social Media Manager Slug Generation
Updated `supabase/functions/social-media-manager/index.ts`:

```typescript
const createSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")  // ✅ Now matches main function
    .replace(/(^-|-$)/g, "");
};
```

### Impact
- Social media posts now generate URLs that match actual event pages
- Eliminates 404 errors from social media clicks
- Consistent URL structure across all systems
- Apostrophes properly converted to hyphens in both systems

## Testing
For "Everybody's Favorite BBQ":
- ✅ **Before**: `everybodys-favorite-bbq` (wrong)
- ✅ **After**: `everybody-s-favorite-bbq` (correct)

## Future Prevention
- Both slug generation functions now use identical regex patterns
- Any new slug generators should follow the `[^a-z0-9]+` pattern
- Consider consolidating to single slug utility function

## Files Modified
- `supabase/functions/social-media-manager/index.ts` - Fixed `createSlug` function

## Deployment Status
✅ **Deployed**: September 2, 2025
- Pushed to both origin and upstream repositories
- Function will take effect on next social media post generation
