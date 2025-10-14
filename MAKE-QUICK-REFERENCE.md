# Make.com Quick Reference
## HTTP Request Configurations - Copy & Paste Ready

**Replace:** `YOUR_SERVICE_ROLE_KEY` with your actual Supabase service role key

---

## 📋 10 Scenarios - HTTP Configurations

### 1️⃣ Event Scraping (Every 6 Hours)
**Schedule:** `0, 6, 12, 18` hours (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY
x-trigger-source: make-cron-auto

Body Type: JSON
Body:
{}
```

---

### 2️⃣ SEO for Events (Daily 2:00 AM)
**Schedule:** Daily at `2:00 AM` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-seo-content

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{
  "contentType": "event",
  "batchSize": 20
}
```

---

### 3️⃣ SEO for Restaurants (Daily 2:30 AM)
**Schedule:** Daily at `2:30 AM` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-seo-content

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{
  "contentType": "restaurant",
  "batchSize": 10
}
```

---

### 4️⃣ Coordinate Backfill (Every 12 Hours)
**Schedule:** `0, 12` hours (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/backfill-all-coordinates

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{}
```

---

### 5️⃣ New Restaurant Search (Weekly Monday 10 AM)
**Schedule:** Every `Monday at 10:00 AM` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/search-new-restaurants

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{
  "searchQuery": "new restaurants Des Moines Iowa 2025",
  "maxResults": 10
}
```

---

### 6️⃣ Cleanup Old Events (Daily 3:00 AM)
**Schedule:** Daily at `3:00 AM` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/cleanup-old-events

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{
  "daysOld": 30
}
```

---

### 7️⃣ Calculate Trending (Every 2 Hours)
**Schedule:** Every `2 hours` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/calculate-trending

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{}
```

---

### 8️⃣ Weekend Guide (Thursday 9:00 AM)
**Schedule:** Every `Thursday at 9:00 AM` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-weekend-guide

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{}
```

---

### 9️⃣ Generate Sitemaps (Daily 4:00 AM)
**Schedule:** Daily at `4:00 AM` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-sitemaps

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{}
```

---

### 🔟 Enhance Events (Daily 1:00 AM)
**Schedule:** Daily at `1:00 AM` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/batch-enhance-events

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{
  "fields": ["sourceUrl", "price", "venue", "originalDescription"],
  "baseQuery": "Des Moines Iowa",
  "maxEvents": 20
}
```

---

### 1️⃣1️⃣ Future Events +7 Days (Weekly Tuesday 8 AM)
**Schedule:** Every `Tuesday at 8:00 AM` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/firecrawl-scraper

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{
  "url": "https://www.catchdesmoines.com/events/?bounds=false&view=grid&sort=date&filter_daterange%5Bstart%5D={{formatDate(addDays(now; 7); "YYYY-MM-DD")}}&filter_daterange%5Bend%5D={{formatDate(addDays(now; 13); "YYYY-MM-DD")}}",
  "category": "events",
  "maxPages": 2
}
```

---

### 1️⃣2️⃣ Future Events +14 Days (Weekly Wednesday 8 AM)
**Schedule:** Every `Wednesday at 8:00 AM` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/firecrawl-scraper

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{
  "url": "https://www.catchdesmoines.com/events/?bounds=false&view=grid&sort=date&filter_daterange%5Bstart%5D={{formatDate(addDays(now; 14); "YYYY-MM-DD")}}&filter_daterange%5Bend%5D={{formatDate(addDays(now; 20); "YYYY-MM-DD")}}",
  "category": "events",
  "maxPages": 2
}
```

---

### 1️⃣3️⃣ Future Events +21 Days (Weekly Thursday 8 AM)  
**Schedule:** Every `Thursday at 8:00 AM` (America/Chicago)

```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/firecrawl-scraper

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY

Body Type: JSON
Body:
{
  "url": "https://www.catchdesmoines.com/events/?bounds=false&view=grid&sort=date&filter_daterange%5Bstart%5D={{formatDate(addDays(now; 21); "YYYY-MM-DD")}}&filter_daterange%5Bend%5D={{formatDate(addDays(now; 27); "YYYY-MM-DD")}}",
  "category": "events",
  "maxPages": 2
}
```

---

### 1️⃣4️⃣ Extract CatchDesMoines URLs (Manual/As Needed)
**Schedule:** Manual execution only (use when needed)

⚠️ **IMPORTANT**: This function requires **USER authentication**, not service role. 

**❌ Won't Work from Make.com** (Returns 401):
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/extract-catchdesmoines-urls

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ROLE_KEY  ❌ This causes 401

Body Type: JSON
Body:
{
  "batchSize": 20,
  "dryRun": false
}
```

**✅ Use from Admin Dashboard Instead**:
- Go to your website's Admin panel
- Navigate to "CatchDesMoines URL Extractor" tool
- This uses your user JWT token and will work properly

**Alternative: Use via Browser/Postman with User Token**:
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/extract-catchdesmoines-urls

Headers:
Content-Type: application/json
Authorization: Bearer YOUR_USER_JWT_TOKEN  ✅ Get from browser dev tools

Body Type: JSON
Body:
{
  "batchSize": 20,
  "dryRun": false
}
```

---

## 🎨 Color Coding for Organization

Recommended colors in Make.com:

- 🔴 **Critical (Every 6 hours):** Event Scraping
- 🟠 **High Priority (Daily):** SEO, Cleanup, Sitemaps, Enhancement
- 🟡 **Medium Priority (Every 12 hours):** Coordinates
- 🟢 **Low Priority (Every 2 hours):** Trending
- 🔵 **Weekly Tasks:** New Restaurants, Weekend Guide
- 🟣 **Future Event Tasks:** +7 Days, +14 Days, +21 Days
- ⚫ **Manual/Utility Tasks:** Extract CatchDesMoines URLs

---

## ⚡ Operations Budget (Free Tier: 1,000/month)

| Scenario | Frequency | Ops/Month |
|----------|-----------|-----------|
| Event Scraping | 4x/day | 120 |
| SEO Events | 1x/day | 30 |
| SEO Restaurants | 1x/day | 30 |
| Coordinates | 2x/day | 60 |
| New Restaurants | 1x/week | 4 |
| Cleanup | 1x/day | 30 |
| Trending | 12x/day | 360 |
| Weekend Guide | 1x/week | 4 |
| Sitemaps | 1x/day | 30 |
| Enhance Events | 1x/day | 30 |
| Future Events +7 Days | 1x/week | 4 |
| Future Events +14 Days | 1x/week | 4 |
| Future Events +21 Days | 1x/week | 4 |
| **TOTAL** | | **710** |

✅ **Still comfortably within free tier!**

---

## 🔔 Recommended Error Notifications

### Email Template (Use for all scenarios):

```
Subject: 🚨 {{scenario.name}} Failed

Error Details:
• Time: {{formatDate(now, "MMM D, YYYY h:mm A")}}
• Scenario: {{scenario.name}}
• Status: {{status}}
• Error: {{body.error}}

Response:
{{body}}

Check logs: https://supabase.com/dashboard/project/wtkhfqpmcegzcbngroui/functions
```

---

## 🚀 Deployment Checklist

### Before Starting:
- [ ] Have Supabase Service Role Key ready
- [ ] Created Make.com account (free tier)
- [ ] Verified all Supabase edge functions are deployed

### Create 13 Scenarios:
- [ ] 1. Event Scraping (6 hours)
- [ ] 2. SEO Events (daily 2 AM)
- [ ] 3. SEO Restaurants (daily 2:30 AM)
- [ ] 4. Coordinates (12 hours)
- [ ] 5. New Restaurants (Mon 10 AM)
- [ ] 6. Cleanup (daily 3 AM)
- [ ] 7. Trending (2 hours)
- [ ] 8. Weekend Guide (Thu 9 AM)
- [ ] 9. Sitemaps (daily 4 AM)
- [ ] 10. Enhance Events (daily 1 AM)
- [ ] 11. Future Events +7 Days (Tue 8 AM)
- [ ] 12. Future Events +14 Days (Wed 8 AM)
- [ ] 13. Future Events +21 Days (Thu 8 AM)

### Test Each Scenario:
- [ ] Run once manually
- [ ] Check Supabase logs
- [ ] Verify database updates
- [ ] Add error notifications
- [ ] Activate scheduling

---

## 🎯 Priority Order (If setting up gradually)

**Start with these 3 (Most Critical):**
1. Event Scraping (every 6 hours)
2. SEO for Events (daily)
3. Coordinate Backfill (every 12 hours)

**Add these 4 (High Value):**
4. Enhance Events (daily)
5. Generate Sitemaps (daily)
6. Calculate Trending (every 2 hours)
7. Cleanup Old Events (daily)

**Complete with these 3 (Nice to Have):**
8. SEO for Restaurants (daily)
9. Weekend Guide (weekly)
10. New Restaurant Search (weekly)

---

## 💡 Pro Tips

1. **Test in Off-Hours**
   - Run manual tests at 1-3 AM Central when site traffic is low

2. **Monitor First Week**
   - Check Make.com history daily
   - Review Supabase function logs
   - Watch for patterns in failures

3. **Stagger Schedules**
   - Don't run multiple heavy tasks simultaneously
   - Current schedules are optimized for minimal overlap

4. **Use Make.com Folders**
   - Create folder: "Des Moines Insider - Automation"
   - Organize scenarios by frequency
   - Add descriptions to each scenario

5. **Document Changes**
   - If you modify schedules or configs
   - Update this document
   - Note reasons for changes

---

## 📊 Expected Results (First Week)

**After 7 days of automation, you should see:**

- ✅ 70-200 new events added
- ✅ 95%+ events have SEO content
- ✅ 98%+ venues have coordinates
- ✅ <5 duplicate events
- ✅ 10-15 trending events updated hourly
- ✅ Weekend guide generated
- ✅ Fresh sitemap daily
- ✅ 5-10 new restaurants found
- ✅ Events >30 days old removed

**If numbers are significantly different, check:**
- Make.com execution history for errors
- Supabase function logs
- Environment variables are set correctly

---

## 🆘 Quick Troubleshooting

**Scenario won't activate:**
- Check scenario toggle is ON
- Verify schedule is set
- Check operations limit

**HTTP 401 error:**
- Service role key incorrect
- Missing "Bearer " prefix
- Key has spaces/linebreaks

**HTTP 500 error:**
- Check Supabase function logs
- Verify environment variables
- Test function manually in Supabase

**No data updating:**
- Check function response in Make.com
- Verify database permissions
- Test with manual HTTP call

---

**You're ready to set up Make.com automation! Start with Scenario #1 (Event Scraping) and test it before moving to the next.**
