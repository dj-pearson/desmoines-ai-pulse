# Des Moines Insider - ChatGPT Plugin Integration Guide

## Overview

This guide explains how to integrate Des Moines Insider's events and restaurants API with ChatGPT, allowing users to discover local happenings directly within ChatGPT conversations.

## Architecture

The integration consists of three main components:

1. **Supabase Edge Functions** - RESTful API endpoints
2. **ChatGPT Plugin Manifest** - Configuration file for ChatGPT
3. **OpenAPI Specification** - API documentation in machine-readable format

## API Endpoints

### Events API (`api-events`)

**Base URL**: `https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1/api-events`

#### List Events

```
GET /api-events
```

**Query Parameters:**

- `limit` (integer, default 20, max 100) - Number of events to return
- `offset` (integer, default 0) - Pagination offset
- `category` (string) - Filter by category (Music, Family, Sports, etc.)
- `city` (string) - Filter by city/location
- `search` (string) - Search by title, description, or venue
- `start_date` (date) - Filter from date (YYYY-MM-DD, defaults to today)
- `end_date` (date) - Filter until date (YYYY-MM-DD)

**Example Request:**

```bash
curl "https://your-project.supabase.co/functions/v1/api-events?limit=10&city=Des%20Moines&category=Music"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Jazz Night at the Garden",
      "date": "2025-10-15",
      "time": "7:00 PM",
      "venue": "Botanical Center",
      "location": "909 Robert D Ray Dr, Des Moines, IA",
      "city": "Des Moines",
      "price": "$15",
      "category": "Music",
      "description": "An evening of smooth jazz...",
      "image_url": "https://...",
      "event_url": "https://...",
      "coordinates": {
        "latitude": 41.5868,
        "longitude": -93.625
      },
      "is_featured": true
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 10,
    "offset": 0,
    "has_more": true
  }
}
```

#### Get Event Details

```
GET /api-events/{eventId}
```

**Path Parameters:**

- `eventId` (UUID) - Unique event identifier

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Jazz Night at the Garden",
    // ... all fields from list endpoint
    "event_start_utc": "2025-10-16T00:00:00Z",
    "ai_writeup": "Detailed AI-generated description...",
    "source": "https://catchdesmoines.com/..."
  }
}
```

### Restaurants API (`api-restaurants`)

**Base URL**: `https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1/api-restaurants`

#### List Restaurants

```
GET /api-restaurants
```

**Query Parameters:**

- `limit` (integer, default 20, max 100) - Number of restaurants to return
- `offset` (integer, default 0) - Pagination offset
- `cuisine` (string) - Filter by cuisine type
- `city` (string) - Filter by city/location
- `search` (string) - Search by name, description, or cuisine
- `price_range` (string: 1-4) - Filter by price (1=$, 4=$$$$)
- `status` (string: open/coming_soon/closed) - Filter by status

**Example Request:**

```bash
curl "https://your-project.supabase.co/functions/v1/api-restaurants?cuisine=Italian&city=West%20Des%20Moines"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Pasta Palace",
      "cuisine": "Italian",
      "description": "Authentic Italian cuisine...",
      "location": "123 Main St, West Des Moines, IA",
      "city": "West Des Moines",
      "rating": 4.5,
      "price_range": "2",
      "phone": "(515) 555-1234",
      "website": "https://pastapalace.com",
      "image_url": "https://...",
      "opening_date": "2024-05-15",
      "opening_timeframe": null,
      "status": "open",
      "coordinates": {
        "latitude": 41.5772,
        "longitude": -93.7114
      }
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

#### Get Restaurant Details

```
GET /api-restaurants/{restaurantId}
```

**Path Parameters:**

- `restaurantId` (UUID) - Unique restaurant identifier

**Response includes additional fields:**

- `google_place_id` - Google Places identifier
- `ai_writeup` - AI-generated detailed description
- `hours` - Operating hours (JSON object)
- `menu_url` - Link to menu

## Deployment Steps

### 1. Deploy Supabase Edge Functions

```bash
# Navigate to your project directory
cd desmoines-ai-pulse

# Deploy the events API
supabase functions deploy api-events

# Deploy the restaurants API
supabase functions deploy api-restaurants
```

### 2. Configure Environment Variables

Ensure your Supabase project has these environment variables:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key

### 3. Update OpenAPI Specification

Edit `public/openapi.yaml` and replace `YOUR_SUPABASE_PROJECT_ID` with your actual Supabase project ID:

```yaml
servers:
  - url: https://abcdefghijk.supabase.co/functions/v1
    description: Supabase Edge Functions API
```

### 4. Deploy Static Files

Push your changes to deploy the updated files:

```bash
git add .
git commit -m "Add ChatGPT plugin integration"
git push
```

The following files will be accessible:

- `https://desmoinesinsider.com/.well-known/ai-plugin.json`
- `https://desmoinesinsider.com/openapi.yaml`

### 5. Register with ChatGPT

#### For Development/Testing:

1. Go to ChatGPT: https://chat.openai.com
2. Click your profile → Settings → Beta Features
3. Enable "Plugins" (if available)
4. Go to Plugin Store → "Develop your own plugin"
5. Enter your domain: `desmoinesinsider.com`

#### For Production:

1. Visit the OpenAI Plugin Store submission page
2. Submit your plugin for review
3. Provide:
   - Plugin manifest URL: `https://desmoinesinsider.com/.well-known/ai-plugin.json`
   - Description and screenshots
   - Contact information

## Testing the Integration

### Test API Endpoints

```bash
# Test events API
curl "https://YOUR_PROJECT.supabase.co/functions/v1/api-events?limit=5"

# Test restaurants API
curl "https://YOUR_PROJECT.supabase.co/functions/v1/api-restaurants?limit=5"

# Test specific event
curl "https://YOUR_PROJECT.supabase.co/functions/v1/api-events/EVENT_UUID"

# Test specific restaurant
curl "https://YOUR_PROJECT.supabase.co/functions/v1/api-restaurants/RESTAURANT_UUID"
```

### Test Plugin Manifest

```bash
curl https://desmoinesinsider.com/.well-known/ai-plugin.json
```

### Test OpenAPI Spec

```bash
curl https://desmoinesinsider.com/openapi.yaml
```

### Validate OpenAPI Spec

Use the Swagger Editor to validate:

1. Go to https://editor.swagger.io
2. Copy the contents of `openapi.yaml`
3. Paste into the editor
4. Fix any validation errors

## Example ChatGPT Queries

Once the plugin is registered, users can ask ChatGPT:

- "What events are happening in Des Moines this weekend?"
- "Find Italian restaurants in West Des Moines"
- "Show me free family events in Ankeny"
- "What concerts are coming up in Des Moines?"
- "Find restaurants near downtown Des Moines with outdoor seating"
- "Tell me about music events this week"

## Security Considerations

### Rate Limiting

The APIs use Supabase's built-in rate limiting. For additional protection:

- Monitor usage through Supabase dashboard
- Set up alerts for unusual traffic
- Consider implementing API keys for high-volume users

### CORS

CORS headers are configured to allow all origins (`*`) for public access. This is appropriate for a ChatGPT plugin.

### Data Privacy

- No user authentication is required
- No personal data is collected
- All data returned is already public on desmoinesinsider.com

## Monitoring and Maintenance

### Monitor API Usage

```bash
# View function logs
supabase functions logs api-events
supabase functions logs api-restaurants
```

### Update Content

The APIs automatically reflect updates to the Supabase database:

- Events added via admin panel appear immediately
- Restaurant updates sync in real-time
- No plugin redeployment needed for content updates

### Update API

If you modify the edge functions:

```bash
supabase functions deploy api-events
supabase functions deploy api-restaurants
```

If you modify the OpenAPI spec or manifest, redeploy your static site.

## Troubleshooting

### Plugin Not Loading

1. Verify manifest is accessible: `curl https://desmoinesinsider.com/.well-known/ai-plugin.json`
2. Check JSON is valid: Use jsonlint.com
3. Ensure CORS headers are present
4. Verify SSL certificate is valid

### API Errors

1. Check Supabase function logs: `supabase functions logs api-events`
2. Verify environment variables are set
3. Test endpoints directly with curl
4. Check database permissions

### Empty Results

1. Verify database has data: Check Supabase dashboard
2. Check date filters (events default to today and future)
3. Verify location/city names match database values
4. Check for typos in category names

## Cost Considerations

### Supabase

- Edge Functions: First 500K requests/month free
- Database: Free tier includes 500MB database
- Bandwidth: 5GB egress/month free

### OpenAI

- Plugin hosting: Free (uses your domain)
- ChatGPT Plus required for users to access plugins

## Future Enhancements

Potential additions to the API:

1. **Reviews endpoint** - POST/GET reviews and ratings
2. **User submissions** - POST new events or restaurants
3. **Bookings** - Reserve tables at restaurants
4. **Favorites** - Save events/restaurants (requires auth)
5. **Recommendations** - Personalized suggestions (requires auth)
6. **Attractions & Playgrounds** - Additional content types

## Support

For issues or questions:

- Email: info@desmoinesinsider.com
- Documentation: https://desmoinesinsider.com
- API Status: Check Supabase dashboard

## API Versioning

Current version: `v1`

Future API updates will use versioned URLs:

- `v1/api-events` - Current version
- `v2/api-events` - Future version (if breaking changes)

The plugin manifest and OpenAPI spec will be updated to point to the latest stable version.

## Compliance

- **Data**: Public information only
- **Privacy**: No PII collected
- **Terms**: Same as desmoinesinsider.com
- **Rate Limits**: Fair use policy applies

## Quick Reference

| Resource        | URL                                                           |
| --------------- | ------------------------------------------------------------- |
| Plugin Manifest | https://desmoinesinsider.com/.well-known/ai-plugin.json       |
| OpenAPI Spec    | https://desmoinesinsider.com/openapi.yaml                     |
| Events API      | https://YOUR_PROJECT.supabase.co/functions/v1/api-events      |
| Restaurants API | https://YOUR_PROJECT.supabase.co/functions/v1/api-restaurants |
| Main Site       | https://desmoinesinsider.com                                  |

---

Last Updated: October 2025
