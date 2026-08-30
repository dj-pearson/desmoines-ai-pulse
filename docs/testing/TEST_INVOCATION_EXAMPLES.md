# Test Invocations for Generate Writeup Function

## 🎯 Copy-Paste Ready Examples

### For Supabase Dashboard SQL Editor

#### Test Random Restaurant Writeup
```sql
-- Run this in Supabase SQL Editor to trigger a random restaurant writeup
SELECT net.http_post(
  url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup',
  headers := jsonb_build_object(
    'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
    'Content-Type', 'application/json'
  ),
  body := jsonb_build_object(
    'type', 'restaurant'
  )
);
```

#### Test Random Event Writeup
```sql
-- Run this in Supabase SQL Editor to trigger a random event writeup
SELECT net.http_post(
  url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup',
  headers := jsonb_build_object(
    'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
    'Content-Type', 'application/json'
  ),
  body := jsonb_build_object(
    'type', 'event'
  )
);
```

---

### For Postman / Thunder Client / REST Client

#### Random Restaurant
```http
POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup
Authorization: Bearer YOUR_ANON_KEY
Content-Type: application/json

{
  "type": "restaurant"
}
```

#### Random Event
```http
POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup
Authorization: Bearer YOUR_ANON_KEY
Content-Type: application/json

{
  "type": "event"
}
```

#### Specific Restaurant (Original Mode)
```http
POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup
Authorization: Bearer YOUR_ANON_KEY
Content-Type: application/json

{
  "type": "restaurant",
  "id": "your-restaurant-id-here",
  "url": "https://restaurant-website.com",
  "title": "Restaurant Name",
  "description": "Optional description",
  "location": "123 Main St, Des Moines",
  "cuisine": "Italian"
}
```

---

### For JavaScript Console (Browser)

```javascript
// Test random restaurant writeup
fetch('https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_ANON_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'restaurant'
  })
})
.then(res => res.json())
.then(data => console.log('Success:', data))
.catch(err => console.error('Error:', err));
```

---

### For Node.js / Deno

```javascript
// Using fetch (Node 18+, Deno)
const response = await fetch(
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_ANON_KEY',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'restaurant'
    })
  }
);

const data = await response.json();
console.log('Generated for:', data.restaurantName);
console.log('Writeup:', data.writeup);
```

---

### For PowerShell (Quick One-Liner)

```powershell
# Random restaurant
Invoke-RestMethod -Method Post -Uri "https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup" -Headers @{"Authorization"="Bearer YOUR_ANON_KEY"; "Content-Type"="application/json"} -Body '{"type":"restaurant"}' | ConvertTo-Json -Depth 10
```

---

### For curl (Linux/Mac/Windows Git Bash)

```bash
# Random restaurant
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"restaurant"}'

# Random event
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"event"}'
```

---

### For Python

```python
import requests
import json

url = "https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-writeup"
headers = {
    "Authorization": "Bearer YOUR_ANON_KEY",
    "Content-Type": "application/json"
}
data = {
    "type": "restaurant"
}

response = requests.post(url, headers=headers, json=data)
result = response.json()

print(f"Success: {result['success']}")
print(f"Restaurant: {result['restaurantName']}")
print(f"Writeup: {result['writeup']}")
```

---

### For Supabase JavaScript Client

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://YOUR_PROJECT_REF.supabase.co',
  'YOUR_ANON_KEY'
);

// Random restaurant
const { data, error } = await supabase.functions.invoke('generate-writeup', {
  body: {
    type: 'restaurant'
  }
});

if (error) {
  console.error('Error:', error);
} else {
  console.log('Generated for:', data.restaurantName);
  console.log('ID:', data.restaurantId);
  console.log('Writeup:', data.writeup);
}
```

---

## 🔑 Finding Your Credentials

### Project URL
1. Go to your Supabase Dashboard
2. Select your project
3. Go to Settings → API
4. Copy "Project URL" (e.g., `https://abcdefghijk.supabase.co`)

### Anon Key (For Frontend/Testing)
1. Go to Settings → API
2. Copy "anon public" key
3. Safe to use in frontend/browser

### Service Role Key (For Backend/Cron)
1. Go to Settings → API
2. Copy "service_role" key
3. **Keep secret!** Only use server-side

---

## 📊 Verify Results

After running a test, check the database:

```sql
-- View most recently generated writeups
SELECT 
  id,
  name,
  cuisine,
  LEFT(ai_writeup, 100) as writeup_preview,
  writeup_generated_at,
  website
FROM restaurants
WHERE ai_writeup IS NOT NULL
ORDER BY writeup_generated_at DESC
LIMIT 10;
```

---

## 🎯 Expected Response Times

- **Content scraping**: 2-5 seconds
- **AI generation**: 3-8 seconds
- **Database save**: <1 second
- **Total**: 5-15 seconds typically

---

## ✅ Success Indicators

When successful, you'll see:
- `"success": true`
- `restaurantName` and `restaurantId` fields
- `writeup` field with generated content
- Database updated automatically

---

## 🚨 Troubleshooting

### 503 Error
- Edge function not deployed
- Run: `supabase functions deploy generate-writeup`

### 401 Error
- Invalid API key
- Check you're using the correct key

### "No restaurants found"
- All restaurants have writeups already
- Or no restaurants have valid websites

### Timeout
- Website taking too long to scrape
- Increase timeout in your client

---

## 🎉 Next Steps

1. Replace `YOUR_PROJECT_REF` with your actual project reference
2. Replace `YOUR_ANON_KEY` with your actual anon key
3. Choose an example from above
4. Run it!
5. Check your database for the new writeup

**Happy testing! 🚀**
