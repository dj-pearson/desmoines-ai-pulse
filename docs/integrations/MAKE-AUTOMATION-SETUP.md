# Make.com Automation Setup
## Des Moines Insider - Scheduled Automation via Make.com

**Created:** October 14, 2025
**Purpose:** Complete autonomous operation using Make.com webhooks and HTTP requests
**Advantage:** More reliable than Supabase pg_cron, better monitoring, visual workflow builder

---

## 🎯 Why Make.com Instead of Supabase Cron?

### **Supabase pg_cron Issues:**
- ❌ Limited error handling
- ❌ No visual workflow builder
- ❌ Difficult to debug
- ❌ No notification on failures
- ❌ Limited scheduling options

### **Make.com Advantages:**
- ✅ Visual workflow builder
- ✅ Email/Slack notifications on errors
- ✅ Detailed execution logs
- ✅ Easy to modify schedules
- ✅ Conditional logic support
- ✅ Built-in error retry
- ✅ Free tier: 1,000 operations/month
- ✅ Multiple time zone support

---

## 🔐 Required Information

### 1. Supabase Service Role Key
- **Where to find:** Supabase Dashboard → Settings → API → `service_role` secret
- **Format:** `eyJhbGc...` (long JWT token)
- **Security:** Never commit to git, only use in Make.com

### 2. Supabase Project URL
- **Your URL:** `https://wtkhfqpmcegzcbngroui.supabase.co`

### 3. Supabase Function URLs
All functions are at: `https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/FUNCTION_NAME`

---

## 📋 Make.com Scenarios to Create

### **Scenario 1: Event Scraping (Every 6 Hours)**

**Trigger:** Schedule - Every 6 hours (0, 6, 12, 18 hours)

**Module 1: HTTP Request**
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/scrape-events
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{YOUR_SERVICE_ROLE_KEY}}
  - x-trigger-source: make-cron-auto
Body (JSON):
  {}
```

**Module 2: Router (Error Handling)**
- Route 1: If status_code = 200 → Log success
- Route 2: If status_code != 200 → Send error notification

**Module 3: Email Notification (Only on errors)**
```
Subject: Event Scraping Failed - {{now}}
Body:
Error scraping events at {{now}}
Status: {{status}}
Response: {{body}}
```

---

### **Scenario 2: SEO Generation for Events (Daily at 2:00 AM Central)**

**Trigger:** Schedule - Every day at 2:00 AM (America/Chicago)

**Module 1: HTTP Request - Generate SEO**
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-seo-content
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{YOUR_SERVICE_ROLE_KEY}}
Body (JSON):
{
  "contentType": "event",
  "batchSize": 20
}
```

**Module 2: Conditional - Check if processed > 0**
- If processed > 0 → Send success summary (optional)
- If processed = 0 → Skip (no events needed SEO)

---

### **Scenario 3: SEO Generation for Restaurants (Daily at 2:30 AM Central)**

**Trigger:** Schedule - Every day at 2:30 AM (America/Chicago)

**Module 1: HTTP Request - Generate SEO**
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-seo-content
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{YOUR_SERVICE_ROLE_KEY}}
Body (JSON):
{
  "contentType": "restaurant",
  "batchSize": 10
}
```

---

### **Scenario 4: Coordinate Backfill (Every 12 Hours)**

**Trigger:** Schedule - Every 12 hours (0, 12 hours)

**Module 1: HTTP Request**
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/backfill-all-coordinates
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{YOUR_SERVICE_ROLE_KEY}}
Body (JSON):
  {}
```

---

### **Scenario 5: Search New Restaurants (Weekly - Monday 10 AM)**

**Trigger:** Schedule - Every Monday at 10:00 AM (America/Chicago)

**Module 1: HTTP Request**
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/search-new-restaurants
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{YOUR_SERVICE_ROLE_KEY}}
Body (JSON):
{
  "searchQuery": "new restaurants Des Moines Iowa 2025",
  "maxResults": 10
}
```

**Module 2: Parse Response**
- Extract: found restaurants count
- Send summary email (optional)

---

### **Scenario 6: Cleanup Old Events (Daily at 3:00 AM Central)**

**Trigger:** Schedule - Every day at 3:00 AM (America/Chicago)

**Module 1: HTTP Request**
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/cleanup-old-events
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{YOUR_SERVICE_ROLE_KEY}}
Body (JSON):
{
  "daysOld": 30
}
```

---

### **Scenario 7: Calculate Trending (Every Hour)**

**Trigger:** Schedule - Every hour (America/Chicago)

**Module 1: HTTP Request**
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/calculate-trending
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{YOUR_SERVICE_ROLE_KEY}}
Body (JSON):
  {}
```

---

### **Scenario 8: Generate Weekend Guide (Thursday 9 AM)**

**Trigger:** Schedule - Every Thursday at 9:00 AM (America/Chicago)

**Module 1: HTTP Request**
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-weekend-guide
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{YOUR_SERVICE_ROLE_KEY}}
Body (JSON):
  {}
```

**Module 2: Email Summary (Success)**
```
Subject: Weekend Guide Generated - {{formatDate(now, "MMM D, YYYY")}}
Body:
Successfully generated weekend guide for {{formatDate(addDays(now, 1), "MMM D")}} - {{formatDate(addDays(now, 3), "MMM D")}}.

View at: https://desmoinesinsider.com/weekend-guide
```

---

### **Scenario 9: Generate Sitemaps (Daily at 4:00 AM Central)**

**Trigger:** Schedule - Every day at 4:00 AM (America/Chicago)

**Module 1: HTTP Request**
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/generate-sitemaps
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{YOUR_SERVICE_ROLE_KEY}}
Body (JSON):
  {}
```

---

### **Scenario 10: Enhance Events (Daily at 1:00 AM Central)**

**Trigger:** Schedule - Every day at 1:00 AM (America/Chicago)

**Module 1: HTTP Request - Get Events Needing Enhancement**
```
Method: POST
URL: https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/batch-enhance-events
Headers:
  - Content-Type: application/json
  - Authorization: Bearer {{YOUR_SERVICE_ROLE_KEY}}
Body (JSON):
{
  "fields": ["sourceUrl", "price", "venue", "originalDescription"],
  "baseQuery": "Des Moines Iowa",
  "maxEvents": 20
}
```

**Module 2: Parse Results**
- Count successful enhancements
- Count errors
- Send summary if > 10 events enhanced

---

## 🏗️ Make.com Setup Instructions

### **Step 1: Create Make.com Account**
1. Go to https://www.make.com/
2. Sign up (free tier includes 1,000 operations/month)
3. Verify email

### **Step 2: Create Your First Scenario**

1. **Click "Create a new scenario"**

2. **Add Clock/Schedule Module**
   - Search for "Schedule"
   - Choose "Schedule: Every day at" or "Schedule: Every X hours"
   - Set your desired interval
   - Set timezone to "America/Chicago" (Central Time)

3. **Add HTTP Module**
   - Search for "HTTP"
   - Choose "HTTP: Make a request"
   - Configure as shown in scenarios above

4. **Add Error Handler (Optional but Recommended)**
   - Click wrench icon on HTTP module
   - Add error handler
   - Choose "Email" module
   - Send notification on failures

5. **Save and Activate**
   - Click "Save" (bottom left)
   - Toggle "Scheduling" ON
   - Scenario will now run automatically!

### **Step 3: Template Scenario Structure**

Here's a visual representation:

```
┌─────────────────┐
│   ⏰ Schedule   │
│  (Set Interval) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   🌐 HTTP POST  │
│  (Call Function)│
└────────┬────────┘
         │
         ├─────────────┐
         │             │
    (Success)      (Error)
         │             │
         ▼             ▼
┌─────────────┐  ┌──────────────┐
│  📧 Email   │  │  📧 Email    │
│  (Optional) │  │  (Alert!)    │
└─────────────┘  └──────────────┘
```

### **Step 4: Testing Your Scenario**

1. **Run Once Manually**
   - Click "Run once" at bottom
   - Watch execution in real-time
   - Check for errors

2. **View Execution History**
   - Click "History" tab
   - See all past executions
   - Debug any failures

3. **Monitor First 24 Hours**
   - Check history every few hours
   - Verify functions are being called
   - Confirm data is being updated in Supabase

---

## 📊 Make.com Dashboard Monitoring

### **Key Metrics to Watch:**

1. **Operations Used**
   - Free tier: 1,000 ops/month
   - Each HTTP request = 1 operation
   - Monitor in Dashboard → Usage

2. **Success Rate**
   - Should be >95%
   - Lower = check function logs in Supabase

3. **Execution Time**
   - Most functions: <30 seconds
   - Event scraping: 1-2 minutes
   - SEO generation: 2-5 minutes

### **Alerts to Set Up:**

1. **Error Notifications**
   - Send email on any HTTP status != 200
   - Include error details

2. **Daily Summary (Optional)**
   - Create scenario that runs at 9 AM
   - Queries Supabase for yesterday's stats
   - Sends summary email

3. **Zero Results Alert**
   - If event scraping returns 0 events 3 times in a row
   - Alert that sources might be down

---

## 💰 Cost Estimation

### **Make.com Operations per Month:**

| Scenario | Frequency | Ops/Month |
|----------|-----------|-----------|
| Event Scraping | Every 6 hours | 120 |
| SEO Events | Daily | 30 |
| SEO Restaurants | Daily | 30 |
| Coordinate Backfill | Every 12 hours | 60 |
| New Restaurants | Weekly | 4 |
| Cleanup Events | Daily | 30 |
| Calculate Trending | Hourly | 720 |
| Weekend Guide | Weekly | 4 |
| Generate Sitemaps | Daily | 30 |
| Enhance Events | Daily | 30 |
| **TOTAL** | | **1,058** |

**Recommendation:**
- **Free Tier** is slightly over (1,000 ops)
- **Solution:** Reduce "Calculate Trending" to every 2 hours (360 ops) = **698 total ops**
- OR upgrade to **Core Plan** ($9/month for 10,000 ops)

---

## 🚀 Quick Start Checklist

### **Pre-Setup:**
- [ ] Have Supabase Service Role Key ready
- [ ] Have Supabase Project URL ready
- [ ] Create Make.com account
- [ ] Verify all edge functions are deployed

### **Setup (30 minutes):**
- [ ] Create Scenario 1: Event Scraping (every 6 hours)
- [ ] Create Scenario 2: SEO Events (daily 2 AM)
- [ ] Create Scenario 3: SEO Restaurants (daily 2:30 AM)
- [ ] Create Scenario 4: Coordinate Backfill (every 12 hours)
- [ ] Create Scenario 5: New Restaurants (weekly Monday 10 AM)
- [ ] Create Scenario 6: Cleanup Events (daily 3 AM)
- [ ] Create Scenario 7: Calculate Trending (every 2 hours) ← Modified
- [ ] Create Scenario 8: Weekend Guide (Thursday 9 AM)
- [ ] Create Scenario 9: Sitemaps (daily 4 AM)
- [ ] Create Scenario 10: Enhance Events (daily 1 AM)

### **Testing (2 hours):**
- [ ] Run each scenario once manually
- [ ] Verify Supabase logs show function calls
- [ ] Check database for new/updated records
- [ ] Set up error email notifications
- [ ] Activate all scenarios

### **Monitoring (ongoing):**
- [ ] Check Make.com dashboard daily (first week)
- [ ] Review Supabase function logs
- [ ] Monitor database growth
- [ ] Adjust schedules if needed

---

## 🔧 Advanced Features

### **1. Conditional Execution**

Only run event scraping if it's a weekday:

```
┌─────────────────┐
│   ⏰ Schedule   │
│  (Every 6 hrs)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   🔍 Filter     │
│ (Weekday only)  │
│ {{formatDate(   │
│  now, 'd')}}    │
│  < 6            │
└────────┬────────┘
         │ (Yes)
         ▼
┌─────────────────┐
│   🌐 HTTP POST  │
└─────────────────┘
```

### **2. Chain Multiple Functions**

Run SEO generation only if scraping found new events:

```
┌─────────────────┐
│  Scrape Events  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Parse Response │
│  Get event_count│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   🔍 Filter     │
│ event_count > 0 │
└────────┬────────┘
         │ (Yes)
         ▼
┌─────────────────┐
│  Generate SEO   │
└─────────────────┘
```

### **3. Slack Notifications**

Get instant alerts in Slack instead of email:

```
Module: Slack - Send a Message
Workspace: Your Workspace
Channel: #website-automation
Text:
🤖 Event Scraping Complete
• Found: {{body.total_events_found}} events
• New: {{body.new_events}}
• Duplicates: {{body.duplicates_skipped}}
• Time: {{formatDate(now, "h:mm A")}}
```

---

## 📱 Mobile Monitoring

### **Make.com Mobile App:**
1. Download "Make" app (iOS/Android)
2. Log in with your account
3. View scenario execution history
4. Get push notifications on errors
5. Manually trigger scenarios

---

## 🎯 Success Metrics Dashboard

Create a daily summary scenario:

**Trigger:** Every day at 9:00 AM

**Module 1: Supabase Query - Events Added Yesterday**
```sql
SELECT COUNT(*) as events_added
FROM events
WHERE created_at > NOW() - INTERVAL '24 hours'
```

**Module 2: Supabase Query - SEO Coverage**
```sql
SELECT
  COUNT(*) FILTER (WHERE seo_title IS NOT NULL) as with_seo,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE seo_title IS NOT NULL) / COUNT(*), 1) as percentage
FROM events
WHERE created_at > NOW() - INTERVAL '7 days'
```

**Module 3: Email Daily Summary**
```
Subject: Des Moines Insider - Daily Automation Report

Yesterday's Automation Results:
✅ Events Added: {{events_added}}
✅ SEO Coverage: {{percentage}}%
✅ Total Events: {{total}}

View full stats: https://desmoinesinsider.com/admin
```

---

## 🔐 Security Best Practices

1. **Never expose Service Role Key**
   - Only store in Make.com
   - Never commit to code
   - Rotate key if compromised

2. **Use Error Handlers**
   - Always add error handlers
   - Log failures
   - Get notified immediately

3. **Monitor Operations**
   - Check Make.com usage weekly
   - Review function logs in Supabase
   - Set up alerts for anomalies

4. **Backup Strategy**
   - Export Make.com scenarios monthly
   - Keep backup of scenario configs
   - Document any custom modifications

---

## 📞 Support & Troubleshooting

### **Common Issues:**

**Issue: HTTP 401 Unauthorized**
- **Fix:** Check Service Role Key is correct
- **Fix:** Verify Authorization header format

**Issue: HTTP 500 Internal Server Error**
- **Fix:** Check Supabase function logs
- **Fix:** Verify environment variables are set

**Issue: Scenario Not Running**
- **Fix:** Check scenario is toggled ON
- **Fix:** Verify schedule is set correctly
- **Fix:** Check Make.com operations limit

**Issue: Too Many Operations**
- **Fix:** Reduce trending calculation frequency
- **Fix:** Combine some scenarios
- **Fix:** Upgrade to Core plan ($9/month)

### **Where to Get Help:**

- **Make.com Docs:** https://www.make.com/en/help
- **Make.com Community:** https://community.make.com/
- **Supabase Docs:** https://supabase.com/docs
- **Your Function Logs:** Supabase Dashboard → Edge Functions → Logs

---

## ✅ Final Thoughts

**Make.com is the PERFECT solution for your automation needs because:**

✅ Visual workflow builder - see exactly what's happening
✅ Better error handling - get notified immediately
✅ Easier to modify - drag and drop changes
✅ Better monitoring - detailed execution logs
✅ Mobile app - monitor on the go
✅ Free tier sufficient - with minor schedule adjustments
✅ Professional appearance - clean, organized automation

**Your website will be 100% autonomous with Make.com handling all scheduled tasks reliably and professionally.**

---

**Next Steps:** Start creating your first scenario in Make.com - I recommend starting with "Event Scraping" as it's the most critical.
