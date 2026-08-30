# ChatGPT Plugin Integration - Quick Start

## What You Have

✅ **API Endpoints** - Two Supabase edge functions exposing events and restaurants  
✅ **Plugin Manifest** - ChatGPT configuration at `/.well-known/ai-plugin.json`  
✅ **OpenAPI Spec** - Complete API documentation at `/openapi.yaml`  
✅ **Documentation** - Full guides and deployment scripts

## Deploy in 5 Steps

### 1️⃣ Install Prerequisites

```bash
npm install -g supabase
```

### 2️⃣ Configure OpenAPI Spec

Edit `public/openapi.yaml` line 9 and replace `YOUR_SUPABASE_PROJECT_ID`:

```yaml
servers:
  - url: https://abcdefghijk.supabase.co/functions/v1
    description: Supabase Edge Functions API
```

**Find your project ID:**

- Go to https://supabase.com/dashboard
- Select your project
- Copy the project reference (e.g., `abcdefghijk`)

### 3️⃣ Deploy Edge Functions

```bash
./deploy-chatgpt-plugin.ps1
```

This deploys:

- `api-events` - Events search and details
- `api-restaurants` - Restaurant search and details

### 4️⃣ Deploy Static Files

```bash
git add .
git commit -m "Add ChatGPT plugin integration"
git push
```

This publishes:

- `https://desmoinesinsider.com/.well-known/ai-plugin.json`
- `https://desmoinesinsider.com/openapi.yaml`

### 5️⃣ Test & Register

**Test your APIs:**

```bash
./test-chatgpt-integration.ps1
```

**Register with ChatGPT:**

1. Go to https://chat.openai.com
2. Click Settings → Beta Features
3. Enable "Plugins"
4. Plugin Store → "Develop your own plugin"
5. Enter: `desmoinesinsider.com`

## Test It Out

Ask ChatGPT:

- "What events are happening in Des Moines this weekend?"
- "Find Italian restaurants in West Des Moines"
- "Show me free family events"
- "What concerts are coming up?"

## API Endpoints

| Endpoint                    | Description             | Example                              |
| --------------------------- | ----------------------- | ------------------------------------ |
| `GET /api-events`           | List/search events      | `?category=Music&limit=10`           |
| `GET /api-events/{id}`      | Event details           | `/api-events/uuid`                   |
| `GET /api-restaurants`      | List/search restaurants | `?cuisine=Italian&city=Des%20Moines` |
| `GET /api-restaurants/{id}` | Restaurant details      | `/api-restaurants/uuid`              |

## Query Parameters

### Events

- `limit`, `offset` - Pagination
- `category` - Music, Family, Sports, etc.
- `city` - Des Moines, West Des Moines, etc.
- `search` - Search text
- `start_date`, `end_date` - Date range

### Restaurants

- `limit`, `offset` - Pagination
- `cuisine` - Italian, Mexican, Asian, etc.
- `city` - Location filter
- `search` - Search text
- `price_range` - 1-4 ($ to $$$$)
- `status` - open, coming_soon, closed

## Example API Calls

```bash
# Get upcoming events
curl "https://your-project.supabase.co/functions/v1/api-events?limit=5"

# Search Italian restaurants
curl "https://your-project.supabase.co/functions/v1/api-restaurants?cuisine=Italian"

# Get event details
curl "https://your-project.supabase.co/functions/v1/api-events/YOUR_EVENT_ID"
```

## Troubleshooting

**"Plugin not found"**

- Verify manifest is accessible: Visit `https://desmoinesinsider.com/.well-known/ai-plugin.json`
- Check JSON is valid: Use [JSONLint](https://jsonlint.com)

**"API returns 500 error"**

- Check function logs: `supabase functions logs api-events`
- Verify environment variables are set in Supabase

**"No data returned"**

- Confirm database has events/restaurants
- Check date filters (events default to today and future)

## Get Help

- **Full Guide**: `CHATGPT_INTEGRATION_GUIDE.md` (detailed 300+ line documentation)
- **Summary**: `CHATGPT_PLUGIN_SUMMARY.md` (implementation overview)
- **Email**: info@desmoinesinsider.com

## File Structure

```
desmoines-ai-pulse/
├── supabase/functions/
│   ├── api-events/index.ts          # Events API
│   └── api-restaurants/index.ts     # Restaurants API
├── public/
│   ├── .well-known/
│   │   └── ai-plugin.json           # ChatGPT manifest
│   └── openapi.yaml                 # API specification
├── CHATGPT_INTEGRATION_GUIDE.md     # Full documentation
├── CHATGPT_PLUGIN_SUMMARY.md        # Implementation summary
├── CHATGPT_QUICK_START.md          # This file
├── deploy-chatgpt-plugin.ps1        # Deployment script
└── test-chatgpt-integration.ps1     # Testing script
```

## What ChatGPT Can Do

✅ Search for events by date, category, location  
✅ Find restaurants by cuisine, price, city  
✅ Get detailed information about specific venues  
✅ Provide recommendations based on user preferences  
✅ Answer location-based queries with coordinates  
✅ Show pricing, ratings, and contact information

## Costs

**Free Tier Sufficient:**

- Supabase: 500K API calls/month
- Cloudflare Pages: Unlimited static requests
- OpenAI: Users need ChatGPT Plus ($20/month)

## Next Steps After Deployment

1. **Monitor Usage**: Check Supabase dashboard for API metrics
2. **Gather Feedback**: See what queries users make
3. **Expand**: Add reviews, bookings, recommendations
4. **Promote**: Announce plugin to your audience

---

**Ready?** Start with Step 1 above, or run `./test-chatgpt-integration.ps1` to validate your setup!
