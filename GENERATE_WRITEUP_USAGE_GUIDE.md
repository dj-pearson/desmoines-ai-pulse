# Generate Writeup Function - Usage Guide

## Overview

The `generate-writeup` edge function creates AI-powered writeups for restaurants and events. It now supports two modes:
1. **Specific Mode**: Generate writeup for a specific restaurant/event
2. **Random Mode**: Automatically select and generate writeup for a random restaurant/event that hasn't been written up yet

---

## 🎯 Mode 1: Specific Restaurant/Event (Original Functionality)

Use this when you want to generate a writeup for a specific restaurant or event.

### Request Format

**Method**: `POST`

**Endpoint**: `https://your-project.supabase.co/functions/v1/generate-writeup`

**Headers**:
```json
{
  "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY",
  "Content-Type": "application/json"
}
```

**Body** (Restaurant):
```json
{
  "type": "restaurant",
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "url": "https://restaurantwebsite.com",
  "title": "Bubba's BBQ",
  "description": "Southern BBQ restaurant",
  "location": "1234 Main St, Des Moines, IA",
  "cuisine": "BBQ"
}
```

**Body** (Event):
```json
{
  "type": "event",
  "id": "223e4567-e89b-12d3-a456-426614174000",
  "url": "https://eventpage.com",
  "title": "Summer Music Festival",
  "description": "Annual outdoor music event",
  "location": "Water Works Park, Des Moines",
  "category": "Music"
}
```

### cURL Example (Specific Restaurant)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-writeup \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "restaurant",
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "url": "https://restaurantwebsite.com",
    "title": "Bubba'\''s BBQ",
    "description": "Southern BBQ restaurant",
    "location": "1234 Main St, Des Moines, IA",
    "cuisine": "BBQ"
  }'
```

---

## 🎲 Mode 2: Random Restaurant/Event (New Functionality)

Use this when you want the system to automatically select a restaurant or event that hasn't been written up yet.

### Request Format

**Method**: `POST`

**Endpoint**: `https://your-project.supabase.co/functions/v1/generate-writeup`

**Headers**:
```json
{
  "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY",
  "Content-Type": "application/json"
}
```

**Body** (Random Restaurant):
```json
{
  "type": "restaurant"
}
```

**Body** (Random Event):
```json
{
  "type": "event"
}
```

### How Random Selection Works

1. System queries database for items WITHOUT an `ai_writeup`
2. Filters to only include items with a valid `website` (restaurants) or `url` (events)
3. Retrieves up to 100 candidates
4. Randomly selects one from the pool
5. Generates the writeup automatically
6. Returns the writeup along with the selected item details

### cURL Example (Random Restaurant)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-writeup \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "restaurant"
  }'
```

### cURL Example (Random Event)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-writeup \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "event"
  }'
```

### PowerShell Example (Random Restaurant)
```powershell
$headers = @{
    "Authorization" = "Bearer YOUR_SUPABASE_ANON_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    type = "restaurant"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
    -Uri "https://your-project.supabase.co/functions/v1/generate-writeup" `
    -Headers $headers `
    -Body $body
```

---

## 📦 Response Format

### Success Response
```json
{
  "success": true,
  "writeup": "Generated AI writeup text here...",
  "restaurantId": "123e4567-e89b-12d3-a456-426614174000",
  "restaurantName": "Bubba's BBQ",
  "extractedContentLength": 1234,
  "featuresFound": 5
}
```

### Error Response (No Candidates)
```json
{
  "success": false,
  "error": "No restaurants found without writeups that have a valid URL/website"
}
```

### Error Response (Missing Type)
```json
{
  "success": false,
  "error": "Missing required field: type (must be 'event' or 'restaurant')"
}
```

---

## 🔧 Using with Supabase JavaScript Client

### Random Restaurant Writeup
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-key'
);

async function generateRandomRestaurantWriteup() {
  const { data, error } = await supabase.functions.invoke('generate-writeup', {
    body: {
      type: 'restaurant'
    }
  });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Generated writeup for:', data.restaurantName);
  console.log('ID:', data.restaurantId);
  console.log('Writeup:', data.writeup);
}

generateRandomRestaurantWriteup();
```

### Specific Restaurant Writeup
```javascript
async function generateSpecificRestaurantWriteup(restaurantData) {
  const { data, error } = await supabase.functions.invoke('generate-writeup', {
    body: {
      type: 'restaurant',
      id: restaurantData.id,
      url: restaurantData.website,
      title: restaurantData.name,
      description: restaurantData.description,
      location: restaurantData.location,
      cuisine: restaurantData.cuisine
    }
  });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Success:', data);
}
```

---

## 🤖 Automation Examples

### Schedule Random Writeups with Cron

You can create a scheduled function that generates writeups automatically:

**New Edge Function**: `supabase/functions/auto-generate-writeups/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Generate writeup for a random restaurant
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-writeup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'restaurant'
      })
    });

    const result = await response.json();

    return new Response(
      JSON.stringify({
        success: true,
        result: result
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

**Schedule with Supabase Cron**:
```sql
-- Run every day at 2 AM to generate a random restaurant writeup
SELECT cron.schedule(
  'daily-restaurant-writeup',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/auto-generate-writeups',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

### Batch Process Multiple Random Writeups

**PowerShell Script**:
```powershell
# Generate 5 random restaurant writeups
$headers = @{
    "Authorization" = "Bearer YOUR_SUPABASE_ANON_KEY"
    "Content-Type" = "application/json"
}

$body = @{
    type = "restaurant"
} | ConvertTo-Json

for ($i = 1; $i -le 5; $i++) {
    Write-Host "Generating writeup $i of 5..."
    
    $response = Invoke-RestMethod -Method Post `
        -Uri "https://your-project.supabase.co/functions/v1/generate-writeup" `
        -Headers $headers `
        -Body $body
    
    Write-Host "✅ Generated writeup for: $($response.restaurantName)"
    
    # Wait 2 seconds between requests to avoid rate limits
    Start-Sleep -Seconds 2
}

Write-Host "✅ Completed generating 5 writeups!"
```

**Bash Script**:
```bash
#!/bin/bash

# Generate 5 random restaurant writeups
for i in {1..5}; do
  echo "Generating writeup $i of 5..."
  
  response=$(curl -X POST https://your-project.supabase.co/functions/v1/generate-writeup \
    -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"type": "restaurant"}')
  
  echo "✅ Response: $response"
  
  # Wait 2 seconds between requests
  sleep 2
done

echo "✅ Completed generating 5 writeups!"
```

---

## 🎯 Use Cases

### Random Mode is Perfect For:
- **Daily automation**: Generate one writeup per day automatically
- **Bulk processing**: Generate writeups for all restaurants without one
- **Testing**: Quickly generate sample writeups
- **Background jobs**: Process writeups in batches overnight

### Specific Mode is Perfect For:
- **Admin panel**: Generate writeup when viewing specific restaurant
- **Manual curation**: Select specific high-priority restaurants
- **Re-generation**: Update writeup for a specific restaurant
- **API integration**: Third-party systems requesting specific content

---

## 🔐 Authentication

### Using Anon Key (Frontend)
```javascript
const { data } = await supabase.functions.invoke('generate-writeup', {
  body: { type: 'restaurant' }
});
```

### Using Service Role Key (Backend/Cron)
```javascript
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
```

---

## ⚡ Quick Reference

| Field | Required | Mode | Description |
|-------|----------|------|-------------|
| `type` | ✅ Yes | Both | Must be "restaurant" or "event" |
| `id` | ❌ No | Specific Only | Database ID of item |
| `url` | ❌ No | Specific Only | Website URL to scrape |
| `title` | ❌ No | Specific Only | Restaurant name or event title |
| `description` | ❌ No | Both | Optional description |
| `location` | ❌ No | Both | Optional location |
| `cuisine` | ❌ No | Restaurant | Optional cuisine type |
| `category` | ❌ No | Event | Optional event category |

---

## 🐛 Troubleshooting

### "No restaurants found without writeups"
- All restaurants already have writeups
- No restaurants have valid website URLs
- Check database: `SELECT COUNT(*) FROM restaurants WHERE ai_writeup IS NULL AND website IS NOT NULL;`

### "Missing required fields after selection"
- Selected item doesn't have a valid URL/website
- Database data may be incomplete

### Rate Limiting
- If generating multiple writeups, add delays between requests (2-3 seconds)
- Claude API has rate limits - space out bulk operations

---

## 📝 Notes

- Random selection pulls from pool of 100 candidates for better randomness
- Only items WITHOUT existing `ai_writeup` are selected
- Only items WITH valid website/URL are considered
- Generated writeups are automatically saved to database
- Function uses Claude AI for content generation
- Typical processing time: 5-15 seconds per writeup

---

## 🚀 Next Steps

1. **Test random mode**: Try generating a random restaurant writeup
2. **Set up automation**: Schedule daily writeup generation
3. **Monitor results**: Check writeup quality in admin panel
4. **Batch process**: Generate writeups for all remaining restaurants
5. **Customize prompts**: Modify AI prompts in edge function code

---

For more information, see:
- [AI Writeup Feature Guide](./AI_WRITEUP_FEATURE.md)
- [AI Writeup Implementation](./AI_WRITEUP_IMPLEMENTATION.md)
- [Edge Functions Catalog](./docs/EDGE_FUNCTIONS_CATALOG.md)
