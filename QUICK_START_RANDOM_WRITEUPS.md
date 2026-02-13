# 🎯 Quick Start: Generate Random Restaurant Writeup

## ✨ The New Feature

The `generate-writeup` edge function can now **automatically select and generate writeups for random restaurants** that haven't been written up yet!

---

## 🚀 Quickest Way to Test

### Option 1: PowerShell Script (Easiest)
```powershell
cd c:\Users\dpearson\Documents\Des-Moines-Insider\Des-Moines-Insider\desmoines-ai-pulse
.\generate-random-writeup.ps1
```

### Option 2: Batch Generate Multiple (Recommended for Bulk)
```powershell
# Generate 5 random restaurant writeups
.\batch-generate-writeups.ps1 -Count 5

# Generate 10 with longer delays
.\batch-generate-writeups.ps1 -Count 10 -DelaySeconds 5

# Generate random events instead
.\batch-generate-writeups.ps1 -Count 3 -Type "event"
```

### Option 3: Direct cURL Command
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/generate-writeup \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "restaurant"}'
```

---

## 📝 Minimal Request Body

### For Random Restaurant
```json
{
  "type": "restaurant"
}
```

### For Random Event
```json
{
  "type": "event"
}
```

**That's it!** Just specify the type, and the system does the rest.

---

## 🎯 What Happens Automatically

1. ✅ Queries database for restaurants WITHOUT writeups
2. ✅ Filters to only those WITH valid website URLs
3. ✅ Randomly selects one from pool of 100 candidates
4. ✅ Scrapes content from the website
5. ✅ Generates AI writeup using Claude
6. ✅ Saves to database automatically
7. ✅ Returns the writeup and restaurant details

---

## 📦 Example Response

```json
{
  "success": true,
  "writeup": "Bubba's BBQ brings authentic Southern barbecue to Des Moines...",
  "restaurantId": "123e4567-e89b-12d3-a456-426614174000",
  "restaurantName": "Bubba's BBQ",
  "extractedContentLength": 1234,
  "featuresFound": 5
}
```

---

## 🔧 Using in Your Code

### JavaScript/TypeScript
```javascript
const { data, error } = await supabase.functions.invoke('generate-writeup', {
  body: { type: 'restaurant' }
});

console.log('Generated for:', data.restaurantName);
```

### Python
```python
response = supabase.functions.invoke('generate-writeup', {
  'body': {'type': 'restaurant'}
})

print(f"Generated for: {response.data['restaurantName']}")
```

### PowerShell One-Liner
```powershell
Invoke-RestMethod -Method Post -Uri "$env:SUPABASE_URL/functions/v1/generate-writeup" -Headers @{"Authorization"="Bearer $env:SUPABASE_ANON_KEY";"Content-Type"="application/json"} -Body '{"type":"restaurant"}'
```

---

## 🤖 Automation Ideas

### Daily Cron Job
Generate one random restaurant writeup every day at 2 AM:

```sql
SELECT cron.schedule(
  'daily-restaurant-writeup',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/generate-writeup',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{"type": "restaurant"}'::jsonb
  );
  $$
);
```

### Batch Process All Restaurants
Run the batch script to generate writeups for all restaurants:

```powershell
# Generate 50 writeups with 3-second delays
.\batch-generate-writeups.ps1 -Count 50 -DelaySeconds 3
```

---

## 🎓 Key Differences from Specific Mode

| Aspect | Specific Mode (Old) | Random Mode (New) |
|--------|-------------------|------------------|
| **Required Fields** | type, id, url, title | type only |
| **Selection** | You choose | System chooses |
| **Use Case** | Manual/targeted | Automation/bulk |
| **Filtering** | N/A | Only unwritten items |

---

## ⚡ Environment Variables (Optional)

For easier repeated use, set these:

```powershell
# PowerShell
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY = "your-anon-key"

# Then just run:
.\batch-generate-writeups.ps1 -Count 5
```

```bash
# Bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"

# Then just run:
./batch-generate-writeups.sh 5
```

---

## 🐛 Common Issues

### "No restaurants found without writeups"
**Solution**: All restaurants already have writeups! Check with:
```sql
SELECT COUNT(*) FROM restaurants 
WHERE ai_writeup IS NULL 
AND website IS NOT NULL;
```

### "Invalid URL"
**Solution**: Selected restaurant has invalid/missing website. System will try another on next run.

### Rate Limiting
**Solution**: Increase delay between requests:
```powershell
.\batch-generate-writeups.ps1 -Count 10 -DelaySeconds 5
```

---

## 📚 Full Documentation

For complete details, see:
- [GENERATE_WRITEUP_USAGE_GUIDE.md](./GENERATE_WRITEUP_USAGE_GUIDE.md) - Complete guide
- [AI_WRITEUP_FEATURE.md](./AI_WRITEUP_FEATURE.md) - Feature overview
- [AI_WRITEUP_IMPLEMENTATION.md](./AI_WRITEUP_IMPLEMENTATION.md) - Implementation details

---

## 🎉 Next Steps

1. **Test it**: Run `.\generate-random-writeup.ps1`
2. **Batch process**: Generate 10-20 writeups: `.\batch-generate-writeups.ps1 -Count 20`
3. **Set up automation**: Schedule daily cron job
4. **Monitor**: Check writeup quality in admin panel
5. **Customize**: Modify AI prompts in edge function if needed

---

**You're all set! 🚀**
