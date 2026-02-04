# 📋 COPY-PASTE READY: Invoke Random Restaurant Writeup

## 🎯 The Minimal Request

Just copy this JSON body and send it to the edge function:

```json
{
  "type": "restaurant"
}
```

---

## 🚀 Complete Example (PowerShell)

Copy this entire block and run in PowerShell:

```powershell
# Replace these values
$SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
$ANON_KEY = "YOUR_ANON_KEY_HERE"

# Make the request
$response = Invoke-RestMethod -Method Post `
    -Uri "$SUPABASE_URL/functions/v1/generate-writeup" `
    -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "Content-Type" = "application/json"
    } `
    -Body '{"type":"restaurant"}'

# Display results
Write-Host "✅ Success!" -ForegroundColor Green
Write-Host "Restaurant: $($response.restaurantName)" -ForegroundColor Cyan
Write-Host "ID: $($response.restaurantId)" -ForegroundColor Gray
Write-Host "`nWriteup:" -ForegroundColor Yellow
Write-Host $response.writeup
```

---

## 🔧 Or Use the Provided Script

Even easier - just run this:

```powershell
cd c:\Users\dpearson\Documents\Des-Moines-Insider\Des-Moines-Insider\desmoines-ai-pulse
.\generate-random-writeup.ps1
```

The script will:
1. Prompt for your Supabase URL
2. Prompt for your API key
3. Make the request
4. Display beautiful formatted results

---

## 📦 What You Get Back

```json
{
  "success": true,
  "writeup": "Your AI-generated writeup text here...",
  "restaurantId": "uuid-of-selected-restaurant",
  "restaurantName": "Name of the Restaurant",
  "extractedContentLength": 1234,
  "featuresFound": 5
}
```

---

## 🎲 For Events Instead

Just change `"type"` to `"event"`:

```json
{
  "type": "event"
}
```

---

## 🔑 Where to Find Your Credentials

1. **Supabase URL**: 
   - Dashboard → Settings → API → "Project URL"
   - Format: `https://xxxxx.supabase.co`

2. **Anon Key**: 
   - Dashboard → Settings → API → "anon public"
   - Safe to use in frontend/scripts

---

## ✅ That's All You Need!

The function will:
- ✅ Find a random restaurant without a writeup
- ✅ Get its website URL from the database
- ✅ Scrape the website content
- ✅ Generate an AI writeup using Claude
- ✅ Save it to the database
- ✅ Return the results to you

**No other fields needed!** 🎉
