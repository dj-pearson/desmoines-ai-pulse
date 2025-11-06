# Environment Setup Guide

Complete guide for setting up environment variables and configuration for all environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Required Variables](#required-variables)
- [Optional Variables](#optional-variables)
- [Environment-Specific Setup](#environment-specific-setup)
- [Supabase Configuration](#supabase-configuration)
- [Security Best Practices](#security-best-practices)

---

## Quick Start

```bash
# 1. Copy the example file
cp .env.example .env

# 2. Edit .env with your values
nano .env  # or use your preferred editor

# 3. Never commit .env files
# Already in .gitignore, but verify:
git status  # Should NOT show .env

# 4. Set Supabase secrets for edge functions
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key_here
```

---

## Required Variables

### Supabase (Database & Auth)

```bash
# Get these from: https://app.supabase.com/project/_/settings/api
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...your_anon_key_here
```

**How to get:**
1. Go to your Supabase project
2. Settings → API
3. Copy "Project URL" and "anon/public" key

⚠️ **Important:** The anon key is safe to expose publicly. It has Row Level Security (RLS) protection.

### PageSpeed Insights (FREE - Required)

```bash
# Get from: https://console.cloud.google.com/
PAGESPEED_INSIGHTS_API_KEY=AIzaSy...your_key_here
```

**How to get:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable "PageSpeed Insights API"
4. Credentials → Create Credentials → API Key
5. Copy the API key

**Free tier:** 25,000 requests/day

---

## Optional Variables

### Site Configuration

```bash
# Your production domain
VITE_SITE_URL=https://desmoinesinsider.com

# Google Analytics
VITE_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
```

### Error Tracking (Recommended for Production)

```bash
# Sentry DSN (https://sentry.io)
VITE_SENTRY_DSN=https://...@sentry.io/...
```

**Setup:**
1. Sign up at https://sentry.io
2. Create a React project
3. Copy the DSN
4. See `src/lib/errorTracking.ts` for integration

### Email Notifications

```bash
# Choose one:
EMAIL_PROVIDER=console  # Just logs to console (default)
EMAIL_PROVIDER=resend   # Use Resend ($20/mo for 50k emails)
EMAIL_PROVIDER=sendgrid # Use SendGrid

# If using Resend (https://resend.com)
RESEND_API_KEY=re_...your_key_here
EMAIL_FROM=noreply@yourdomain.com

# If using SendGrid
SENDGRID_API_KEY=SG....your_key_here
```

### Slack/Discord Notifications

```bash
# Slack incoming webhook
# Get from: https://api.slack.com/messaging/webhooks
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Discord webhook
# Get from: Channel Settings → Integrations → Webhooks
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL
```

### SEO Tools (Optional - Paid)

```bash
# Google Search Console API (FREE)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=https://your-domain.com/oauth/callback

# Backlink tracking (choose one)
AHREFS_API_KEY=your_key_here          # $99/month
MOZ_ACCESS_ID=your_access_id          # $79/month
MOZ_SECRET_KEY=your_secret_key

# SERP position tracking (choose one)
SERPAPI_KEY=your_key_here              # $50/month
DATAFORSEO_LOGIN=your_login            # $30/month
DATAFORSEO_PASSWORD=your_password
```

### AI Services

```bash
# OpenAI for content generation
OPENAI_API_KEY=sk-...your_key_here

# Anthropic Claude for AI features
ANTHROPIC_API_KEY=sk-ant-...your_key_here
```

### Cron Job Authentication

```bash
# Random secret for authenticating scheduled tasks
# Generate with: openssl rand -hex 32
CRON_SECRET=your_random_secret_key_here
```

---

## Environment-Specific Setup

### Development (.env.local)

```bash
# Create .env.local for local development overrides
# This file is gitignored and won't be committed

# Use local Supabase instance (optional)
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGci...local_anon_key

# Use console for emails
EMAIL_PROVIDER=console

# Disable analytics in dev
VITE_GOOGLE_ANALYTICS_ID=

# Enable debug mode
VITE_DEBUG=true
```

### Staging (.env.staging)

```bash
# Staging environment (for testing before production)
VITE_SITE_URL=https://staging.desmoinesinsider.com
VITE_SUPABASE_URL=https://staging-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...staging_key

# Use lower rate limits for testing
VITE_RATE_LIMIT_MAX=10
VITE_RATE_LIMIT_WINDOW_MS=60000

# Enable all logging
VITE_DEBUG=true

# Staging analytics
VITE_GOOGLE_ANALYTICS_ID=G-STAGING-ID
```

### Production (.env.production)

```bash
# Production environment
VITE_SITE_URL=https://desmoinesinsider.com
VITE_SUPABASE_URL=https://production-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...production_key

# Production analytics
VITE_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX

# Error tracking
VITE_SENTRY_DSN=https://...@sentry.io/...

# Disable debug
VITE_DEBUG=false

# Email configuration
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...your_production_key
```

---

## Supabase Configuration

### Edge Function Secrets

Edge functions need their own secrets (separate from .env):

```bash
# Set required secrets
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key_here

# Set optional secrets (if using)
supabase secrets set OPENAI_API_KEY=sk-...your_key
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...your_key
supabase secrets set RESEND_API_KEY=re_...your_key
supabase secrets set EMAIL_FROM=noreply@yourdomain.com
supabase secrets set SLACK_WEBHOOK_URL=https://hooks.slack.com/...
supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/...

# Important: Set environment type for CORS
supabase secrets set ENVIRONMENT=production
supabase secrets set VITE_SITE_URL=https://desmoinesinsider.com

# List all secrets (doesn't show values)
supabase secrets list

# Unset a secret
supabase secrets unset SECRET_NAME
```

### Database Environment Variables

If using Supabase database functions:

```bash
# In Supabase Dashboard: Settings → Database → Connection Pooling
# Get the connection string and set:
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres
```

---

## Security Best Practices

### DO ✅

1. **Use different keys per environment**
   - Development, staging, and production should have separate API keys
   - This prevents dev/testing from affecting production

2. **Rotate keys regularly**
   - Set calendar reminders to rotate API keys
   - Especially important for:
     - Supabase service role keys (if used)
     - External API keys (OpenAI, Anthropic)
     - Webhook URLs

3. **Use environment-specific Supabase projects**
   - Development: Local Supabase or dev project
   - Staging: Separate staging project
   - Production: Production project

4. **Set proper CORS origins**
   ```bash
   # In production edge functions
   ENVIRONMENT=production
   VITE_SITE_URL=https://desmoinesinsider.com
   ```

5. **Use .env.*.local for secrets you don't want in git**
   ```bash
   .env.local          # Local development overrides
   .env.staging.local  # Staging secrets
   .env.production.local  # Production secrets
   ```

### DON'T ❌

1. **Never commit .env files**
   - Already in .gitignore
   - Double-check before commits

2. **Never use production keys in development**
   - Could accidentally modify production data
   - Could hit rate limits affecting users

3. **Never share keys in:**
   - Slack/Discord (use secret managers)
   - Email (use 1Password, LastPass, etc.)
   - Code comments
   - Git commits
   - Screenshots

4. **Never use the service_role key in client code**
   - Only use in edge functions
   - Bypasses RLS security

5. **Don't use API keys that have write access**
   - For PageSpeed, Ahrefs, etc., use read-only keys when possible

---

## Verification

### Check Your Setup

```bash
# 1. Verify .env exists and is not tracked by git
ls -la .env
git status  # Should NOT show .env

# 2. Verify required variables are set
grep VITE_SUPABASE_URL .env
grep VITE_SUPABASE_ANON_KEY .env
grep PAGESPEED_INSIGHTS_API_KEY .env

# 3. Verify Supabase secrets
supabase secrets list

# 4. Test the connection
npm run dev
# Check console for connection errors

# 5. Test edge functions locally
supabase functions serve
# Test with curl or Postman
```

### Common Issues

**Issue:** "Supabase URL is not defined"
```bash
# Solution: Check .env file has VITE_ prefix
# Vite requires VITE_ prefix for client-side variables
VITE_SUPABASE_URL=...  # ✅ Correct
SUPABASE_URL=...       # ❌ Won't work in client code
```

**Issue:** Edge function can't read secrets
```bash
# Solution: Set secrets with supabase CLI, not .env
supabase secrets set SECRET_NAME=value
```

**Issue:** CORS errors in production
```bash
# Solution: Set environment and site URL in Supabase secrets
supabase secrets set ENVIRONMENT=production
supabase secrets set VITE_SITE_URL=https://yourdomain.com
```

**Issue:** Rate limiting not working
```bash
# Solution: Ensure shared middleware is deployed
supabase functions deploy --no-verify-jwt
```

---

## Environment Templates

### Minimal .env (Required Only)

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
PAGESPEED_INSIGHTS_API_KEY=AIzaSy...
```

### Recommended .env (Production)

```bash
# Required
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
PAGESPEED_INSIGHTS_API_KEY=AIzaSy...

# Site config
VITE_SITE_URL=https://desmoinesinsider.com
VITE_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX

# Error tracking
VITE_SENTRY_DSN=https://...@sentry.io/...

# Email
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@desmoinesinsider.com

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### Full .env (All Features)

See `.env.example` in the repository for a complete template with all available options.

---

## Need Help?

- Check [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for usage examples
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow
- Review [.env.example](./.env.example) for all available options

---

**Last Updated:** 2025-01-06
