# Des Moines Insider - Timezone Conversion Guide

## Problem

Events in the database are stored as UTC midnight (e.g., `2025-07-31 00:00:00+00`) but should represent CDT evening events (e.g., July 30th at 7:00 PM CDT).

## Solution Options

### Option 1: Quick SQL Fix (Recommended for Initial Conversion)

1. Go to your Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `scripts/timezone-conversion.sql`
3. Run the preview queries first to see what will change
4. Uncomment and run the UPDATE query when ready

### Option 2: Node.js Script (Programmatic Approach)

1. Set your environment variables:

   ```bash
   # In your .env file or environment
   SUPABASE_URL=your-supabase-url
   SUPABASE_ANON_KEY=your-anon-key
   ```

2. Run a dry run to preview changes:

   ```bash
   npm run convert-timezones
   ```

3. Apply the changes:
   ```bash
   npm run convert-timezones:apply
   ```

### Option 3: Web Crawler for Precise Times (Future Enhancement)

For events that need specific times (not just 7:30 PM default):

1. Run the web crawler to extract exact times:
   ```bash
   npm run crawl-events          # Dry run
   npm run crawl-events:apply    # Apply changes
   ```

## What the Conversion Does

- **Before**: `2025-07-31 00:00:00+00` (UTC) → Displays as "July 31st" in CDT
- **After**: `2025-07-31 00:30:00+00` (UTC) → Displays as "July 30th 7:30 PM" in CDT

## Example Events

### Eddie and the Getaway

- **Current**: `2025-07-31 00:00:00+00` → Shows as July 31st
- **Fixed**: `2025-07-31 00:30:00+00` → Shows as July 30th 7:30 PM CDT
- **URL**: Changes from `/events/eddie-and-the-getaway-2025-07-31` to `/events/eddie-and-the-getaway-2025-07-30`

### Def Leppard

- **Current**: `2025-08-14 00:00:00+00` → Shows as August 14th
- **Fixed**: `2025-08-14 01:00:00+00` → Shows as August 14th 8:00 PM CDT
- **URL**: Stays `/events/def-leppard-2025-08-14` (same date, correct time)

## Important Notes

1. **Backup First**: Always backup your events table before running conversions
2. **Test Small**: Start with a single event to verify the conversion works correctly
3. **URL Impact**: Some event URLs may change due to date corrections
4. **Future Events**: New events should be stored correctly with the timezone utilities we implemented

## Verification

After conversion, verify that:

1. Event dates display correctly on the website
2. Event URLs are consistent
3. Social media manager respects future-only posting
4. All timezone-sensitive components show the same dates

## Files Created

- `scripts/timezone-conversion.sql` - Direct SQL conversion
- `scripts/convert-timezones.ts` - Node.js conversion script
- `scripts/event-datetime-crawler.ts` - Web crawler for precise times
- `supabase/migrations/20250730040000_convert_utc_to_cdt_events.sql` - Migration file
