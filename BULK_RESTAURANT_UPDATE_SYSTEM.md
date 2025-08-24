# Bulk Restaurant Update System

## Overview
This system provides bulk restaurant updates using the Google Places (New) API to enhance restaurant data with accurate information from Google's database.

## Components Created

### 1. Database Migration
- **File**: `supabase/migrations/20250729160000_add_enhanced_column.sql`
- **Purpose**: Adds an `enhanced` column to track which restaurants have been updated
- **Default**: NULL (not enhanced)
- **After Update**: "completed"

### 2. Supabase Edge Function
- **File**: `supabase/functions/bulk-update-restaurants/index.ts`
- **Purpose**: Processes restaurants in batches using Google Places (New) API
- **API Key**: Uses `GOOGLE_SEARCH_API` from Supabase secrets

#### Features:
- **Search Phase**: Finds Google Place ID if missing using restaurant name + location
- **Details Phase**: Retrieves comprehensive place information
- **Batch Processing**: Configurable batch size (1-50 restaurants)
- **Rate Limiting**: 100ms delay between API calls
- **Force Update**: Option to update already enhanced restaurants

#### Data Updated:
- ✅ **Cuisine**: Derived from Google place types (American, Italian, etc.)
- ✅ **Location**: Full formatted address from Google
- ✅ **Rating**: Google rating (rounded to 1 decimal)
- ✅ **Description**: Editorial summary from Google (not "Discovered via Google Places")
- ✅ **Phone**: National phone number format
- ✅ **Website**: Official website URL
- ✅ **Image URL**: High-quality main photo (1200x800px)
- ✅ **Google Place ID**: For future API calls
- ✅ **Enhanced**: Set to "completed" after processing

### 3. React Hook
- **File**: `src/hooks/useBulkRestaurantUpdate.ts`
- **Purpose**: Interface for calling the edge function from React
- **Returns**: Progress updates, results, and error handling

### 4. Admin Component
- **File**: `src/components/RestaurantBulkUpdater.tsx`
- **Purpose**: User interface for running bulk updates
- **Location**: Admin panel → Restaurants tab

#### UI Features:
- 📊 **Configuration**: Batch size, force update toggle
- 📈 **Progress Tracking**: Real-time progress updates
- 📋 **Results Display**: Success/error counts and details
- 🔧 **Error Handling**: Detailed error messages per restaurant
- ⚠️ **Safety Features**: Rate limiting, batch processing

## Usage Instructions

### Prerequisites
1. Ensure `GOOGLE_SEARCH_API` secret is set in Supabase with a valid Google Places (New) API key
2. Deploy the edge function: `npx supabase functions deploy bulk-update-restaurants`
3. Run the database migration: `npx supabase db push`

### Using the Bulk Updater

1. **Access Admin Panel**
   - Navigate to `/admin`
   - Click on "Restaurants" tab
   - Scroll down to "Bulk Restaurant Updater" section

2. **Configure Update**
   - **Batch Size**: Number of restaurants to process (recommended: 10-20)
   - **Force Update**: Check to re-process already enhanced restaurants

3. **Start Update**
   - Click "Start Update" button
   - Monitor progress in real-time
   - Review results after completion

### API Rate Limits
- Google Places (New) API has quotas and rate limits
- Built-in 100ms delay between requests
- Recommended batch size: 10-20 restaurants
- Monitor your Google Cloud Console for quota usage

### Error Handling
- Individual restaurant failures don't stop the batch
- Detailed error messages for each failure
- Partial success is reported (e.g., 8/10 restaurants updated)
- Common errors: Place not found, API quota exceeded, invalid data

## Database Schema Changes

```sql
-- Enhanced column tracking
ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS enhanced TEXT DEFAULT NULL;

-- Example values:
-- NULL: Not yet processed
-- "completed": Successfully enhanced with Google data
-- "failed": Processing attempted but failed
```

## Google Places (New) API Integration

### API Endpoints Used:
1. **Text Search**: `/v1/places:searchText` - Find place by name/location
2. **Place Details**: `/v1/places/{place_id}` - Get detailed information
3. **Photos**: `/v1/{photo.name}/media` - Get high-quality images

### Field Mappings:
- `types[]` → `cuisine` (e.g., "italian_restaurant" → "Italian")
- `formattedAddress` → `location`
- `rating` → `rating`
- `editorialSummary.text` → `description`
- `nationalPhoneNumber` → `phone`
- `websiteUri` → `website`
- `photos[0]` → `image_url`
- `id` → `google_place_id`

## Monitoring and Maintenance

### Success Tracking
- Check `enhanced` column for completion status
- Monitor success rates in admin results
- Review error details for failed updates

### Recommended Schedule
- Run initial bulk update for all restaurants
- Periodic updates for new restaurants (enhanced IS NULL)
- Quarterly force updates to refresh data

### Troubleshooting
1. **API Key Issues**: Verify `GOOGLE_SEARCH_API` secret in Supabase
2. **Quota Exceeded**: Check Google Cloud Console quotas
3. **No Results**: Ensure restaurant names/locations are accurate
4. **Slow Performance**: Reduce batch size, check network connectivity

## Integration with Existing System

The bulk updater integrates seamlessly with existing restaurant management:
- Preserves existing restaurant data
- Only updates with better Google data
- Maintains all relationships and references
- Works alongside manual restaurant creation
- Compatible with existing search and filtering
