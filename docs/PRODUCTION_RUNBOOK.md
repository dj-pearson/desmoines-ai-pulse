# Production Deployment Runbook

**Last Updated**: 2026-02-21
**Project**: Des Moines AI Pulse
**Production URL**: https://desmoinesinsider.com
**Hosting**: Cloudflare Pages (frontend) + Supabase (backend, database, edge functions)

---

## Table of Contents

1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [Deployment Steps](#2-deployment-steps)
3. [Post-Deployment Verification](#3-post-deployment-verification)
4. [Rollback Procedures](#4-rollback-procedures)
5. [Incident Response](#5-incident-response)
6. [Common Issues and Troubleshooting](#6-common-issues-and-troubleshooting)

---

## 1. Pre-Deployment Checklist

Complete every item before proceeding to deployment. Do not skip steps even for "small" changes.

### 1.1 CI Pipeline Checks

- [ ] All PR checks pass on the `pr-checks.yml` workflow (lint, type check, unit tests, build)
- [ ] Pull request has been reviewed and approved
- [ ] Branch is up to date with `main` (no merge conflicts)
- [ ] No open "changes requested" reviews

```bash
# Run locally to mirror CI
npm run validate         # ESLint + TypeScript type check
npm run test:unit        # Vitest unit tests
npm run build            # Production build succeeds
```

### 1.2 Test Suite Verification

- [ ] Unit tests pass: `npm run test:unit`
- [ ] Accessibility tests pass: `npm run test:a11y`
- [ ] Mobile responsive tests pass: `npm run test:mobile`
- [ ] Performance tests pass: `npm run test:performance`
- [ ] Forms tests pass: `npm run test:forms`
- [ ] Search and filter tests pass: `npm run test:search`
- [ ] Links and buttons tests pass: `npm run test:links`

```bash
# Run full Playwright suite (requires dev server running on port 8082)
npm test
```

### 1.3 Database Migration Review

- [ ] Review all pending migration files in `supabase/migrations/`
- [ ] Verify migrations are idempotent (safe to re-run)
- [ ] Check for destructive operations (DROP TABLE, DROP COLUMN, ALTER TYPE)
- [ ] Confirm RLS policies are preserved or updated correctly
- [ ] Test migrations locally against a fresh database

```bash
# Test migrations locally
supabase db reset          # Reset local DB and replay all migrations
supabase db diff           # Check for schema drift
```

- [ ] If migrations include destructive changes, prepare a rollback migration script before proceeding
- [ ] For large data migrations, verify estimated execution time and plan a maintenance window if > 30 seconds

### 1.4 Environment Variables

Verify all required environment variables are configured in both Cloudflare Pages and Supabase.

**Cloudflare Pages (Production)**:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous API key |
| `VITE_SITE_URL` | Yes | Production site URL |
| `VITE_GOOGLE_ANALYTICS_ID` | No | Google Analytics tracking ID |
| `VITE_SENTRY_DSN` | No | Sentry error tracking DSN |
| `NODE_VERSION` | Yes | Must be `20.0.0` |

**Supabase Edge Function Secrets**:

| Secret | Required | Used By |
|--------|----------|---------|
| `STRIPE_SECRET_KEY` | Yes | Payment processing |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signature verification |
| `OPENAI_API_KEY` | Yes | AI content generation |
| `ANTHROPIC_API_KEY` | Yes | AI content generation (Claude) |
| `PAGESPEED_INSIGHTS_API_KEY` | No | SEO auditing |
| `ENVIRONMENT` | Yes | Must be `production` |
| `VITE_SITE_URL` | Yes | CORS origin configuration |

```bash
# List current Supabase secrets
supabase secrets list

# Verify no secrets are missing
supabase secrets list | grep -E "STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|OPENAI_API_KEY|ANTHROPIC_API_KEY|ENVIRONMENT|VITE_SITE_URL"
```

### 1.5 Feature Flags and Configuration

- [ ] Review any feature flags or runtime configuration changes
- [ ] Verify `ai_configuration` table settings are correct for production
- [ ] Confirm subscription tier limits are set correctly
- [ ] Check that rate limiting settings are appropriate (default: 100 requests per 15 minutes per IP)
- [ ] Verify CORS allowed origins in `_shared/cors.ts` include the production domain

### 1.6 Security Checks

- [ ] No secrets or API keys committed to source code
- [ ] `npm audit` shows no critical or high vulnerabilities
- [ ] `.env` files are listed in `.gitignore`
- [ ] Edge functions with `verify_jwt = false` in `supabase/config.toml` are intentional and documented

```bash
# Security audit
npm audit
git diff main -- supabase/config.toml | grep "verify_jwt = false"
```

### 1.7 Bundle Size Check

- [ ] Production build is under 500KB gzipped
- [ ] No unexpected large chunks

```bash
npm run build:analyze
# Review output for oversized bundles
```

---

## 2. Deployment Steps

### 2.1 Frontend Deployment (Cloudflare Pages)

Cloudflare Pages is configured for automatic deployment on push to `main`.

#### Automatic Deployment (Standard)

```bash
# 1. Merge approved PR to main
git checkout main
git pull origin main
git merge feature/your-branch

# 2. Tag the release
VERSION="1.x.x"  # Use appropriate version
git tag -a "v${VERSION}" -m "Release v${VERSION}"

# 3. Push to trigger deployment
git push origin main
git push origin "v${VERSION}"
```

#### Manual Deployment (Emergency)

1. Navigate to Cloudflare Dashboard > Pages > desmoines-ai-pulse
2. Go to Deployments tab
3. Click "Retry deployment" on the latest commit, or push a new commit to `main`

#### Monitoring the Build

- Build logs: Cloudflare Dashboard > Pages > Project > Deployments > Click build
- Expected build time: 2-5 minutes
- Build command: `npm run build`
- Output directory: `dist`
- Node version: 20

### 2.2 Database Migrations (Supabase)

**IMPORTANT**: Always deploy database migrations BEFORE the frontend if the frontend depends on new schema. Deploy the frontend BEFORE migrations only if removing usage of deprecated schema.

```bash
# 1. Link to the production project
supabase link --project-ref wtkhfqpmcegzcbngroui

# 2. Create a database backup (via Supabase Dashboard)
#    Dashboard > Database > Backups > Create backup

# 3. Review pending migrations
supabase db diff

# 4. Push migrations to production
supabase db push

# 5. Verify migrations applied
#    Dashboard > Database > Migrations (check latest timestamp)
```

#### Migration Safety Rules

- Never run `DROP TABLE` or `DROP COLUMN` without a migration window
- Always add columns as `NULL`-able first, then backfill, then add constraints in a follow-up migration
- Test all RLS policies after migration with both anonymous and authenticated queries
- For index creation on large tables, use `CREATE INDEX CONCURRENTLY`

### 2.3 Edge Function Deployment (Supabase)

```bash
# Deploy all edge functions
supabase functions deploy

# Or deploy specific functions (preferred for targeted changes)
supabase functions deploy stripe-webhook
supabase functions deploy api-events
supabase functions deploy api-restaurants
supabase functions deploy generate-itinerary
supabase functions deploy manage-subscription

# Verify secrets are set for the deployed functions
supabase secrets list
```

#### Edge Functions Requiring Special Attention

These functions have `verify_jwt = false` in `supabase/config.toml` and are publicly accessible. Extra care is required when modifying them:

- `stripe-webhook` -- Stripe signature verification handles authentication
- `scrape-events` -- Rate limited, intended for automated crawling
- `geocode-location` -- Rate limited, used for address lookups
- `generate-seo-content` -- Rate limited, used for SEO generation
- `image-transform` -- Rate limited, used for image processing

### 2.4 Deployment Order

For changes spanning multiple layers, follow this order:

1. **Database migrations** (if new tables/columns are required by new code)
2. **Edge functions** (if API contract changes)
3. **Frontend** (push to `main` to trigger Cloudflare Pages build)

For removals, reverse the order:

1. **Frontend** (remove usage of deprecated features)
2. **Edge functions** (remove deprecated endpoints)
3. **Database migrations** (drop unused tables/columns)

---

## 3. Post-Deployment Verification

### 3.1 Health Check URLs

Verify each of the following returns a successful response:

| Check | URL | Expected |
|-------|-----|----------|
| Homepage | `https://desmoinesinsider.com` | 200, content renders |
| Events page | `https://desmoinesinsider.com/events` | 200, event listings visible |
| Restaurants page | `https://desmoinesinsider.com/restaurants` | 200, restaurant listings visible |
| Attractions page | `https://desmoinesinsider.com/attractions` | 200, attraction listings visible |
| Auth page | `https://desmoinesinsider.com/auth` | 200, login form renders |
| Sitemap | `https://desmoinesinsider.com/sitemap.xml` | 200, valid XML |
| Robots.txt | `https://desmoinesinsider.com/robots.txt` | 200, valid directives |
| Events API | `https://<project>.supabase.co/functions/v1/api-events?limit=5` | 200, JSON array |
| Restaurants API | `https://<project>.supabase.co/functions/v1/api-restaurants?limit=5` | 200, JSON array |

```bash
# Quick health check script
SITE_URL="https://desmoinesinsider.com"
SUPABASE_URL="https://wtkhfqpmcegzcbngroui.supabase.co"

for path in "" "/events" "/restaurants" "/attractions" "/auth" "/sitemap.xml" "/robots.txt"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SITE_URL}${path}")
  echo "${SITE_URL}${path} => ${STATUS}"
done

for fn in "api-events?limit=1" "api-restaurants?limit=1"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SUPABASE_URL}/functions/v1/${fn}")
  echo "${SUPABASE_URL}/functions/v1/${fn} => ${STATUS}"
done
```

### 3.2 Smoke Tests

Perform the following manual checks after every production deployment:

#### Homepage
- [ ] Page loads without console errors
- [ ] Hero section and featured content display
- [ ] Navigation menu works (desktop and mobile)
- [ ] Footer links are functional
- [ ] Search bar is functional

#### Authentication
- [ ] Sign-in form renders on `/auth`
- [ ] Existing user can sign in with email/password
- [ ] Google OAuth sign-in flow works
- [ ] Sign-out works and redirects correctly
- [ ] Password reset email sends successfully
- [ ] New user registration creates a profile

#### Events
- [ ] Events list page loads with content
- [ ] Event filtering by category works
- [ ] Date-based filtering works (today, this weekend)
- [ ] Individual event detail page loads (`/events/:id`)
- [ ] Event search returns relevant results
- [ ] "Add to Calendar" functionality works

#### Restaurants
- [ ] Restaurants list page loads with content
- [ ] Cuisine filtering works
- [ ] Price range filtering works
- [ ] Individual restaurant detail page loads (`/restaurants/:id`)
- [ ] "Open Now" filter returns correct results
- [ ] Map view renders with restaurant markers

#### Admin Panel
- [ ] Admin user can access `/admin` dashboard
- [ ] Non-admin users are redirected away from admin routes
- [ ] Admin analytics dashboard renders charts
- [ ] Content management (CRUD) operations work
- [ ] Edge function logs are accessible

#### Payments (Stripe)
- [ ] Subscription checkout flow initiates correctly
- [ ] Stripe Checkout redirects to Stripe-hosted page
- [ ] Webhook endpoint is receiving events (check Stripe Dashboard > Webhooks)
- [ ] Successful payment updates user subscription tier
- [ ] Campaign payment flow works for business owners

#### AI Features
- [ ] Trip Planner (`/trip-planner`) loads and accepts input
- [ ] AI-generated itinerary returns valid results
- [ ] SEO content generation edge function responds

### 3.3 Monitoring

After deployment, monitor for at least 1 hour:

#### Cloudflare Analytics
- [ ] No spike in 4xx/5xx error rates
- [ ] Page load times remain within normal range
- [ ] CDN cache hit ratio is stable

#### Supabase Dashboard
- [ ] Database connection pool is healthy
- [ ] Edge function error rates are below 1%
- [ ] Edge function invocation counts are normal
- [ ] No anomalous database query patterns
- [ ] Realtime connections are stable

#### Stripe Dashboard
- [ ] Webhook deliveries are succeeding (no failures in Webhook logs)
- [ ] No unexpected payment failures

#### Error Tracking (Sentry, if configured)
- [ ] No new error types introduced
- [ ] Error rate has not increased
- [ ] No unhandled promise rejections

### 3.4 Performance Validation

```bash
# Run Lighthouse via CLI (requires Chrome)
npx lighthouse https://desmoinesinsider.com --output json --output html

# Targets:
# Performance:    > 90
# Accessibility:  > 95
# Best Practices: > 95
# SEO:            > 95
```

- [ ] Core Web Vitals within thresholds:
  - LCP (Largest Contentful Paint): < 2.5s
  - FID (First Input Delay): < 100ms
  - CLS (Cumulative Layout Shift): < 0.1

---

## 4. Rollback Procedures

### 4.1 Cloudflare Pages Rollback (Frontend)

**Time to rollback**: ~1 minute

1. Go to **Cloudflare Dashboard > Pages > desmoines-ai-pulse > Deployments**
2. Find the last known-good production deployment
3. Click the three-dot menu on that deployment
4. Select **"Rollback to this deployment"**
5. Confirm the rollback

The rollback takes effect immediately -- Cloudflare serves the previous build from CDN.

**Alternative (via Git)**:

```bash
# Revert the problematic commit
git revert <problematic-commit-hash>
git push origin main
# Wait for Cloudflare Pages to rebuild (~2-5 minutes)
```

### 4.2 Database Migration Rollback

**Time to rollback**: 5-30 minutes depending on approach

#### Option A: Manual Reverse Migration (Preferred)

Write and apply a reverse migration that undoes the problematic changes:

```bash
# Create a rollback migration
supabase migration new rollback_problematic_change

# Edit the migration file with reverse SQL
# Then apply it
supabase db push
```

Common reverse operations:

```sql
-- Undo ADD COLUMN
ALTER TABLE events DROP COLUMN IF EXISTS new_column;

-- Undo CREATE TABLE
DROP TABLE IF EXISTS new_table;

-- Undo CREATE INDEX
DROP INDEX IF EXISTS idx_new_index;

-- Undo RLS policy change
DROP POLICY IF EXISTS "new_policy" ON events;
CREATE POLICY "original_policy" ON events ...;
```

#### Option B: Point-in-Time Recovery (Supabase Pro plan)

1. Go to **Supabase Dashboard > Database > Backups**
2. Select **Point-in-Time Recovery**
3. Choose a timestamp before the problematic migration
4. Confirm the recovery

**WARNING**: This rolls back ALL data changes, not just schema. Use only as a last resort.

#### Option C: Restore from Backup

1. Go to **Supabase Dashboard > Database > Backups**
2. Select the backup taken before the deployment
3. Click **Restore**

**WARNING**: Same data-loss caveat as Option B.

### 4.3 Edge Function Rollback

**Time to rollback**: ~2 minutes

```bash
# Check out the last working version
git log --oneline supabase/functions/  # Find the last good commit
git checkout <last-good-commit> -- supabase/functions/<function-name>/

# Redeploy the reverted function
supabase functions deploy <function-name>

# Verify the function is working
curl -s -o /dev/null -w "%{http_code}" \
  "https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/<function-name>"
```

To rollback ALL edge functions:

```bash
git checkout <last-good-commit> -- supabase/functions/
supabase functions deploy
```

### 4.4 Full Rollback (All Layers)

If a coordinated rollback across all layers is needed:

1. **Rollback frontend** via Cloudflare Pages (immediate)
2. **Rollback edge functions** via `supabase functions deploy` from previous commit
3. **Rollback database** via reverse migration or backup restore
4. Verify all health checks pass (Section 3.1)
5. Notify the team and document the incident

---

## 5. Incident Response

### 5.1 Severity Levels

| Level | Description | Examples | Response Time | Resolution Target |
|-------|-------------|----------|---------------|-------------------|
| **P1 - Critical** | Complete service outage or data loss | Site completely down; database corruption; payment processing broken; authentication system down | < 15 minutes | < 1 hour |
| **P2 - High** | Major feature broken affecting most users | Events page not loading; search completely broken; admin panel inaccessible; Stripe webhooks failing | < 30 minutes | < 4 hours |
| **P3 - Medium** | Feature degraded, workaround available | Map not rendering but list view works; slow performance on specific pages; one edge function timing out; email notifications delayed | < 2 hours | < 24 hours |
| **P4 - Low** | Minor issue, cosmetic, or edge case | Styling glitch on one browser; minor text error; non-critical analytics missing; deprecated feature misbehavior | Next business day | < 1 week |

### 5.2 Escalation Contacts

> **NOTE**: Replace the placeholders below with actual contact information.

| Role | Contact | Escalation Level |
|------|---------|------------------|
| On-Call Engineer | `<name>` / `<phone>` / `<email>` | P1-P4 first responder |
| Engineering Lead | `<name>` / `<phone>` / `<email>` | P1-P2 escalation |
| Infrastructure / DevOps | `<name>` / `<phone>` / `<email>` | P1 infrastructure issues |
| Supabase Support | https://supabase.com/dashboard/support | Database/edge function emergencies |
| Cloudflare Support | https://dash.cloudflare.com/support | CDN / Pages deployment issues |
| Stripe Support | https://support.stripe.com/ | Payment processing emergencies |

### 5.3 Incident Response Process

#### Step 1: Detect and Acknowledge

- Identify the severity level using the table above
- Acknowledge the incident in the team communication channel
- Start a dedicated incident thread or channel

#### Step 2: Assess and Communicate

- Determine scope of impact (how many users, which features)
- Identify the likely cause (recent deployment, external service, traffic spike)
- Send the initial communication (see templates below)

#### Step 3: Mitigate

- For deployment-related issues: **rollback immediately** (see Section 4)
- For external service issues: enable fallbacks or graceful degradation
- For traffic spikes: verify rate limiting is active, consider scaling

#### Step 4: Resolve

- Apply the fix (hotfix branch if needed)
- Verify the fix in a preview deployment before pushing to production
- Run full smoke test suite (Section 3.2)

#### Step 5: Communicate Resolution

- Send the resolution communication (see templates below)
- Update status page if applicable

#### Step 6: Post-Incident Review

- Document the timeline of events
- Identify root cause
- List action items to prevent recurrence
- Schedule post-mortem meeting within 48 hours for P1/P2 incidents

### 5.4 Communication Templates

#### Initial Incident Notification

```
INCIDENT: [P1/P2/P3/P4] - [Brief description]
TIME DETECTED: [YYYY-MM-DD HH:MM UTC]
IMPACT: [Description of user impact]
STATUS: Investigating
NEXT UPDATE: [Time of next update, e.g., 30 minutes]

We are aware of [description of the issue] and are actively investigating.
[Number/percentage] of users may be affected.
We will provide an update by [time].
```

#### Incident Update

```
INCIDENT UPDATE: [P1/P2/P3/P4] - [Brief description]
TIME: [YYYY-MM-DD HH:MM UTC]
STATUS: [Investigating / Identified / Mitigating / Monitoring]
CAUSE: [Preliminary root cause if identified]
ACTION: [What is being done]
NEXT UPDATE: [Time of next update]
```

#### Incident Resolution

```
INCIDENT RESOLVED: [P1/P2/P3/P4] - [Brief description]
TIME RESOLVED: [YYYY-MM-DD HH:MM UTC]
DURATION: [Total incident duration]
ROOT CAUSE: [Brief root cause]
RESOLUTION: [What was done to fix it]
FOLLOW-UP: [Any follow-up actions planned]

The issue has been resolved. All systems are operating normally.
A post-incident review will be conducted on [date].
```

### 5.5 Post-Incident Review Template

```markdown
## Post-Incident Review

**Incident**: [Title]
**Severity**: [P1/P2/P3/P4]
**Date**: [YYYY-MM-DD]
**Duration**: [HH:MM]
**Author**: [Name]

### Timeline
- HH:MM UTC - [Event]
- HH:MM UTC - [Event]
- HH:MM UTC - [Resolution]

### Root Cause
[Detailed description of what caused the incident]

### Impact
- Users affected: [Number/percentage]
- Revenue impact: [If applicable]
- Data impact: [If applicable]

### What Went Well
- [Item]

### What Could Be Improved
- [Item]

### Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| [Action] | [Name] | [Date] | [Open/Done] |
```

---

## 6. Common Issues and Troubleshooting

### 6.1 Supabase Connection Issues

#### Symptom: "Failed to fetch" or "NetworkError" in the browser console

**Possible Causes and Fixes**:

1. **Incorrect Supabase URL or anon key**
   ```bash
   # Verify environment variables in Cloudflare Pages dashboard
   # Settings > Environment Variables > Production
   # VITE_SUPABASE_URL should be: https://wtkhfqpmcegzcbngroui.supabase.co
   ```

2. **Supabase project paused (free tier)**
   - Go to Supabase Dashboard > Project > Check if project is paused
   - Resume the project if paused
   - Free-tier projects pause after 1 week of inactivity

3. **Database connection pool exhausted**
   - Check Supabase Dashboard > Database > Connection Pooling
   - Review active connections count vs. pool size
   - Look for connection leaks (queries that never close)
   - Increase pool size if needed (Dashboard > Database > Settings)

4. **RLS policy blocking queries**
   ```sql
   -- In Supabase SQL Editor, test the query as the anonymous role
   SET ROLE anon;
   SELECT * FROM events LIMIT 1;
   -- If this returns 0 rows, check RLS policies
   SELECT * FROM pg_policies WHERE tablename = 'events';
   ```

5. **CORS blocking requests**
   - Check browser console for CORS errors
   - Verify `VITE_SITE_URL` secret is set correctly in Supabase
   - Verify `ENVIRONMENT` secret is set to `production`
   - Check `supabase/functions/_shared/cors.ts` for allowed origins

#### Symptom: Edge functions return 500 errors

```bash
# Check edge function logs
# Supabase Dashboard > Edge Functions > Select function > Logs

# Test function directly
curl -v "https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/api-events?limit=1"

# Common fixes:
# 1. Verify all required secrets are set
supabase secrets list

# 2. Check for syntax errors in the function code
supabase functions serve <function-name>  # Test locally

# 3. Check if the function is importing from _shared correctly
```

### 6.2 Stripe Webhook Failures

#### Symptom: Payments succeed in Stripe but subscription/campaign status does not update in the app

**Diagnosis**:

1. **Check Stripe webhook delivery logs**
   - Go to Stripe Dashboard > Developers > Webhooks
   - Click the webhook endpoint
   - Review recent delivery attempts
   - Check for HTTP status codes (should be 200)

2. **Common causes**:

   a. **Webhook secret mismatch**
   ```bash
   # The STRIPE_WEBHOOK_SECRET in Supabase must match the signing secret
   # shown in Stripe Dashboard > Developers > Webhooks > Signing secret
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxx
   ```

   b. **Edge function timeout**
   - Supabase edge functions have a 60-second timeout
   - If webhook processing takes too long, Stripe will retry
   - Check function logs for timeout errors

   c. **Supabase service role key expired or invalid**
   ```bash
   # Verify the service role key
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<current-service-role-key>
   ```

   d. **Webhook URL misconfigured**
   - Verify the webhook URL in Stripe Dashboard points to:
     `https://wtkhfqpmcegzcbngroui.supabase.co/functions/v1/stripe-webhook`
   - Ensure the endpoint is set to receive the correct event types:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

3. **Manual recovery**:
   ```bash
   # Resend a failed webhook event from Stripe Dashboard
   # Stripe > Developers > Webhooks > Select endpoint > Failed events > Resend

   # Or manually update the subscription status in Supabase
   # Dashboard > Table Editor > subscriptions > Find the user > Update tier
   ```

#### Symptom: Stripe Checkout session fails to create

- Check that `STRIPE_SECRET_KEY` is set and valid in Supabase secrets
- Verify Stripe API version compatibility (currently using `2023-10-16`)
- Check edge function logs for the `create-subscription-checkout` or `create-campaign-checkout` function
- Verify the Stripe product/price IDs referenced in the code exist in the Stripe account

### 6.3 Edge Function Timeouts

#### Symptom: Edge functions return 504 Gateway Timeout or take > 10 seconds

**Common causes and fixes**:

1. **Heavy database queries**
   - Add appropriate indexes for frequently queried columns
   - Use pagination (`LIMIT`/`OFFSET`) instead of fetching all rows
   - Check query plans in Supabase Dashboard > SQL Editor with `EXPLAIN ANALYZE`

   ```sql
   -- Example: Add index for slow event queries
   CREATE INDEX CONCURRENTLY idx_events_date_category
   ON events (date, category);
   ```

2. **External API calls timing out**
   - AI generation calls (OpenAI/Anthropic) can be slow
   - Add timeout handling to external HTTP requests:
   ```typescript
   const controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout
   try {
     const response = await fetch(url, { signal: controller.signal });
   } finally {
     clearTimeout(timeout);
   }
   ```

3. **Cold start latency**
   - Supabase edge functions may have cold starts (~1-2 seconds)
   - This is normal for infrequently called functions
   - For latency-sensitive functions, consider keeping them warm with periodic pings

4. **Memory issues**
   - Edge functions have limited memory
   - Avoid loading large datasets into memory
   - Stream responses for large payloads

5. **Function-specific timeouts to watch**:

   | Function | Typical Duration | Timeout Risk |
   |----------|-----------------|--------------|
   | `generate-itinerary` | 5-15s | Medium (AI generation) |
   | `generate-seo-content` | 3-10s | Medium (AI generation) |
   | `scrape-events` | 10-30s | High (external crawling) |
   | `batch-process-images` | 10-45s | High (image processing) |
   | `bulk-enhance-events` | 15-50s | High (batch AI calls) |
   | `seo-audit` | 5-20s | Medium (external API) |
   | `api-events` | < 1s | Low |
   | `api-restaurants` | < 1s | Low |

### 6.4 Build Failures on Cloudflare Pages

#### Symptom: Cloudflare Pages build fails

1. **Node version mismatch**
   - Verify `NODE_VERSION` is set to `20.0.0` in Cloudflare Pages environment variables
   - Check `package.json` engine requirement: `"node": ">=20.0.0"`

2. **Missing environment variables**
   - Build will fail if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are not set
   - Check Cloudflare Pages > Settings > Environment Variables

3. **TypeScript errors**
   - Run `npm run type-check` locally before pushing
   - Check build logs for specific TypeScript errors

4. **Dependency issues**
   - Delete `node_modules` and `package-lock.json`, then `npm install` to regenerate
   - Check for peer dependency conflicts in build logs

### 6.5 Authentication Failures

#### Symptom: Users cannot sign in or sessions expire unexpectedly

1. **Supabase Auth configuration**
   - Check Supabase Dashboard > Authentication > Settings
   - Verify site URL and redirect URLs are correct
   - Ensure email auth is enabled

2. **OAuth redirect mismatch**
   - Google OAuth: Verify authorized redirect URIs in Google Cloud Console include:
     - `https://wtkhfqpmcegzcbngroui.supabase.co/auth/v1/callback`
   - Check Supabase Dashboard > Authentication > Providers > Google

3. **Session refresh failures**
   - The `AuthContext` handles automatic session refresh
   - Check browser console for auth-related errors
   - Verify the Supabase anon key has not been rotated without updating Cloudflare Pages

### 6.6 Event Crawler Failures

#### Symptom: Daily event crawler GitHub Action fails

1. **Check GitHub Actions logs**
   - Go to the repository > Actions > "Daily Event Crawler"
   - Review the failed run logs

2. **Common causes**:
   - Source website structure changed (crawler selectors need updating)
   - `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` GitHub secrets expired
   - `ANTHROPIC_API_KEY` GitHub secret expired or quota exceeded
   - Playwright browser installation failed
   - Rate limiting by source website

3. **Manual trigger for testing**:
   - Go to Actions > "Daily Event Crawler" > "Run workflow"
   - Set `dry_run: true` for safe testing
   - Set `max_pages: 1` for quick verification

### 6.7 Rate Limiting Issues

#### Symptom: Legitimate users receiving 429 Too Many Requests

- The default rate limit is 100 requests per 15 minutes per IP
- Rate limiting uses in-memory storage and resets on cold start
- If false positives occur, consider:
  - Increasing the limit in `_shared/rateLimit.ts`
  - Adding IP allowlisting for known partners
  - Implementing user-based rate limiting instead of IP-based for authenticated users

### 6.8 Performance Degradation

#### Symptom: Pages loading slowly after deployment

1. **Check bundle size**
   ```bash
   npm run build:analyze
   ```

2. **Check for missing lazy loading**
   - Heavy components (maps, 3D, charts) should use `React.lazy()` and `Suspense`
   - Review `src/App.tsx` for lazy-loaded route components

3. **Check Supabase query performance**
   - Supabase Dashboard > Database > Query Performance
   - Look for slow queries (> 500ms)
   - Add indexes for frequently filtered columns

4. **Check Cloudflare caching**
   - Cloudflare Dashboard > Caching > Overview
   - Verify static assets are being cached (cache hit ratio > 80%)
   - Check Cache-Control headers on API responses

---

## Appendix: Quick Reference Commands

```bash
# === Pre-deployment ===
npm run validate                      # Lint + type check
npm run test:unit                     # Unit tests
npm run build                         # Production build
npm audit                             # Security audit

# === Deployment ===
supabase link --project-ref wtkhfqpmcegzcbngroui
supabase db push                      # Apply DB migrations
supabase functions deploy             # Deploy all edge functions
supabase functions deploy <name>      # Deploy single function
supabase secrets list                 # Verify secrets
supabase secrets set KEY=value        # Set a secret

# === Monitoring ===
supabase functions list               # List deployed functions
# Cloudflare Dashboard > Analytics
# Supabase Dashboard > Edge Functions > Logs
# Stripe Dashboard > Developers > Webhooks > Logs

# === Rollback ===
# Cloudflare: Dashboard > Pages > Deployments > Rollback
git revert <commit>                   # Revert a commit
supabase functions deploy <name>      # Redeploy previous version
supabase db push                      # Apply rollback migration
```

---

**Document Owner**: Engineering Team
**Review Cadence**: Quarterly or after any P1/P2 incident
**Last Reviewed**: 2026-02-21
