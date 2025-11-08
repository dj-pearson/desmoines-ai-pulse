# Restaurant Opening Scraper - Make.com Integration Guide

## Overview
The Restaurant Opening Scraper is an edge function that automatically discovers new restaurant openings from multiple sources and adds them to your database with appropriate status tags (opening_soon, announced, newly_opened).

## HTTP POST Configuration for Make.com

### Endpoint URL
```
https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/restaurant-opening-scraper
```

### HTTP Method
`POST`

### Headers
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE"
}
```

### Request Body Options

#### Option 1: Use Default Sources (Recommended)
Send an empty JSON object to use the default sources:
```json
{}
```

This will scrape:
- Des Moines Register - Restaurant Openings Search
- Catch Des Moines - Restaurants Directory  
- Eater Des Moines - New Restaurants Map

#### Option 2: Custom Sources
Specify your own sources to scrape:
```json
{
  "sources": [
    {
      "url": "https://www.desmoinesregister.com/search/?q=restaurant+opening",
      "name": "Des Moines Register",
      "type": "news"
    },
    {
      "url": "https://dsm.eater.com/maps/best-new-restaurants-des-moines",
      "name": "Eater Des Moines",
      "type": "blog"
    }
  ]
}
```

### Response Format

#### Success Response (200 OK)
```json
{
  "success": true,
  "totalFound": 15,
  "inserted": 8,
  "updated": 7,
  "errors": []
}
```

#### Success with Errors Response (200 OK)
```json
{
  "success": true,
  "totalFound": 10,
  "inserted": 6,
  "updated": 2,
  "errors": [
    "Failed to scrape Some Source: timeout",
    "No usable content from Another Source"
  ]
}
```

#### Error Response (500)
```json
{
  "error": "Internal server error",
  "details": "Specific error message"
}
```

## Make.com Scenario Setup

### Step 1: Add HTTP Module
1. Create a new scenario in Make.com
2. Add the **HTTP** > **Make a request** module

### Step 2: Configure the HTTP Request

**URL:**
```
https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/restaurant-opening-scraper
```

**Method:**
```
POST
```

**Headers:**
Add two headers:

| Key | Value |
|-----|-------|
| Content-Type | application/json |
| Authorization | Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE |

**Request content:**
For default sources (recommended):
```json
{}
```

**Parse response:**
Enable this option to parse the JSON response

### Step 3: Add Error Handling (Optional)
Add an error handler route to handle failed requests:
1. Right-click on the HTTP module
2. Select "Add error handler route"
3. Add actions to handle errors (email notification, log to database, etc.)

### Step 4: Add Success Actions
After the HTTP module, you can add actions based on the response:

**Example: Send Email on Completion**
```
Subject: Restaurant Scraper Complete
Body: 
Found: {{totalFound}} restaurants
Inserted: {{inserted}} new restaurants
Updated: {{updated}} existing restaurants
{{#if errors}}Errors: {{errors}}{{/if}}
```

### Step 5: Schedule the Scenario
1. Click the clock icon on the scenario
2. Set your preferred schedule:
   - **Daily**: Run once per day at a specific time
   - **Weekly**: Run once per week
   - **Custom**: Set specific interval (e.g., every 3 days)

**Recommended Schedule:** Daily at 6:00 AM

## Data Flow

1. **Make.com triggers** → HTTP POST to edge function
2. **Edge function** → Scrapes configured sources using Firecrawl API
3. **Firecrawl** → Returns website content
4. **Claude AI** → Extracts restaurant information from content
5. **Edge function** → Inserts/updates restaurants in database
6. **Response** → Returns summary to Make.com
7. **Make.com** → Executes follow-up actions (emails, notifications, etc.)

## Restaurant Status Tags

The scraper automatically assigns appropriate status tags:

- **`opening_soon`**: Restaurant has a confirmed opening date in the near future
- **`announced`**: Restaurant opening has been announced but no exact date
- **`newly_opened`**: Restaurant opened within the last 3 months

## Database Fields Populated

For each restaurant found, the scraper populates:
- `name` (required)
- `description`
- `location` (defaults to "Des Moines, IA")
- `cuisine`
- `opening_date` (exact date if available)
- `opening_timeframe` (approximate timeframe like "Summer 2025")
- `status` (opening_soon, announced, or newly_opened)
- `source_url` (link to article/source)
- `phone`
- `website`
- `price_range` ($, $$, $$$, $$$$)
- `is_featured` (defaults to false)

## Testing the Integration

### Test in Make.com
1. Set up the HTTP module as described above
2. Click "Run once" at the bottom of the scenario
3. Check the execution log for the response
4. Verify restaurants were added in your Supabase database

### Test Directly (via cURL)
```bash
curl -X POST \
  https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/restaurant-opening-scraper \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a2hmcXBtY2VnemNibmdyb3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM1Mzc5NzcsImV4cCI6MjA2OTExMzk3N30.a-qKhaxy7l72IyT0eLq7kYuxm-wypuMxgycDy95r1aE" \
  -d '{}'
```

## Monitoring & Debugging

### Check Edge Function Logs
View logs in Supabase Dashboard:
```
https://supabase.com/dashboard/project/wtkhfqpmcegzcbngroui/functions/restaurant-opening-scraper/logs
```

### Common Issues

**Issue: "Failed to scrape" errors**
- Source website may be blocking scrapers
- Try adding custom user agent or adjusting Firecrawl timeout

**Issue: "No restaurants found"**
- Sources may have changed their HTML structure
- Update the Claude AI prompt to match new structure

**Issue: Duplicate restaurants**
- The scraper checks for existing restaurants by name
- Consider adding location matching for better deduplication

## Advanced Configuration

### Custom Sources Object Structure
```json
{
  "sources": [
    {
      "url": "https://example.com/restaurant-news",
      "name": "Display Name",
      "type": "news" | "blog" | "directory"
    }
  ]
}
```

### Adding Authentication (if needed in future)
If you want to restrict access:
1. Update `supabase/config.toml`:
```toml
[functions.restaurant-opening-scraper]
verify_jwt = true
```
2. Use service role key instead of anon key in Authorization header

## Support

For issues or questions:
- Check Supabase Edge Function logs
- Review Claude AI extraction prompts in the code
- Contact support with Make.com execution logs
