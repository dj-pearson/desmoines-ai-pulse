# Deployment Checklist

Complete checklist for deploying to production safely and successfully.

## Table of Contents

- [Pre-Deployment](#pre-deployment)
- [Cloudflare Pages Deployment](#cloudflare-pages-deployment)
- [Supabase Deployment](#supabase-deployment)
- [Post-Deployment](#post-deployment)
- [Rollback Procedure](#rollback-procedure)

---

## Pre-Deployment

### Code Quality Checks

- [ ] All tests passing
  ```bash
  npm test
  ```

- [ ] No TypeScript errors
  ```bash
  npm run type-check
  ```

- [ ] No ESLint errors
  ```bash
  npm run lint
  ```

- [ ] All validations pass
  ```bash
  npm run validate
  ```

### Build Verification

- [ ] Production build succeeds
  ```bash
  npm run build
  ```

- [ ] Check build output for errors
  - No import errors
  - No missing dependencies
  - Bundle size reasonable (<1MB per chunk)

- [ ] Preview build locally
  ```bash
  npm run preview
  # Test in browser at http://localhost:4173
  ```

### Code Review

- [ ] Pull request approved by team
- [ ] All review comments addressed
- [ ] No unresolved merge conflicts
- [ ] Branch up to date with main

### Security Checks

- [ ] No secrets in code
  ```bash
  grep -r "sk-" src/  # Check for API keys
  grep -r "password" src/  # Check for passwords
  ```

- [ ] .env files not in git
  ```bash
  git status | grep -i ".env"  # Should be empty
  ```

- [ ] Dependencies up to date (security patches)
  ```bash
  npm audit
  # Fix any high/critical issues
  ```

### Environment Variables

- [ ] Production .env configured
  - [ ] VITE_SUPABASE_URL set correctly
  - [ ] VITE_SUPABASE_ANON_KEY set correctly
  - [ ] VITE_SITE_URL set to production domain
  - [ ] VITE_GOOGLE_ANALYTICS_ID set (if using)
  - [ ] VITE_SENTRY_DSN set (if using error tracking)

- [ ] Supabase secrets configured
  ```bash
  supabase secrets list
  # Verify all required secrets are set
  ```

---

## Cloudflare Pages Deployment

### Initial Setup (One-Time)

1. **Connect Git Repository**
   - Go to Cloudflare Dashboard → Pages
   - Click "Create a project"
   - Connect to GitHub
   - Select `desmoines-ai-pulse` repository

2. **Configure Build Settings**
   ```
   Framework preset: Vite
   Build command: npm run build
   Build output directory: dist
   Root directory: /
   ```

3. **Set Environment Variables**
   - Production branch: main
   - Add environment variables:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `VITE_SITE_URL`
     - `VITE_GOOGLE_ANALYTICS_ID` (optional)
     - `VITE_SENTRY_DSN` (optional)
     - `NODE_VERSION`: 20.0.0

4. **Configure Custom Domain**
   - Pages → Custom domains → Add domain
   - Add `desmoinesinsider.com` and `www.desmoinesinsider.com`
   - Follow DNS configuration instructions
   - Wait for SSL certificate provisioning

### Deployment Checklist

- [ ] Create deployment branch or tag
  ```bash
  git checkout main
  git pull origin main
  git tag -a v1.0.0 -m "Release version 1.0.0"
  git push origin v1.0.0
  ```

- [ ] Verify environment variables in Cloudflare
  - Dashboard → Pages → Project → Settings → Environment variables
  - Check Production environment has all variables

- [ ] Trigger deployment
  - Automatic: Push to main branch
  - Manual: Dashboard → Pages → Project → View build

- [ ] Monitor build logs
  - Check for errors
  - Verify build completes successfully
  - Build time typically 2-5 minutes

### Post-Build Verification

- [ ] Build completed successfully
- [ ] No build errors in logs
- [ ] Assets deployed to Cloudflare CDN
- [ ] Preview deployment URL generated

---

## Supabase Deployment

### Database Migrations

- [ ] Review pending migrations
  ```bash
  supabase db diff --file migration_name
  ```

- [ ] Test migrations locally
  ```bash
  supabase db reset
  supabase db push
  ```

- [ ] Backup production database
  ```bash
  # In Supabase Dashboard:
  # Database → Backups → Create backup
  ```

- [ ] Apply migrations to production
  ```bash
  # Link to production project
  supabase link --project-ref your-prod-ref

  # Push migrations
  supabase db push
  ```

- [ ] Verify migrations applied
  ```bash
  # Check Supabase Dashboard → Database → Migrations
  ```

### Edge Functions Deployment

- [ ] Test edge functions locally
  ```bash
  supabase functions serve
  # Test with curl or Postman
  ```

- [ ] Set production secrets
  ```bash
  supabase secrets set PAGESPEED_INSIGHTS_API_KEY=your_key
  supabase secrets set ENVIRONMENT=production
  supabase secrets set VITE_SITE_URL=https://desmoinesinsider.com
  # Add other secrets as needed
  ```

- [ ] Deploy all edge functions
  ```bash
  # Deploy all functions
  supabase functions deploy

  # Or deploy specific functions
  supabase functions deploy api-events
  supabase functions deploy api-restaurants
  ```

- [ ] Verify deployments
  ```bash
  # Test API endpoints
  curl https://your-project.supabase.co/functions/v1/api-events?limit=5
  ```

- [ ] Check function logs
  ```bash
  # In Supabase Dashboard:
  # Edge Functions → Select function → Logs
  ```

### Row Level Security (RLS)

- [ ] Verify RLS policies enabled
  ```sql
  -- In Supabase SQL Editor
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public';
  -- All tables should have rowsecurity = true
  ```

- [ ] Test RLS policies
  - Test as anonymous user
  - Test as authenticated user
  - Test with different roles

- [ ] Verify API access
  ```bash
  # Test with anon key (should have limited access)
  curl -H "apikey: YOUR_ANON_KEY" \
       https://your-project.supabase.co/rest/v1/events

  # Verify sensitive data is protected
  ```

---

## Post-Deployment

### Smoke Tests

- [ ] Homepage loads
  - Visit https://desmoinesinsider.com
  - Check no console errors
  - Verify content displays correctly

- [ ] Navigation works
  - Test all main navigation links
  - Check mobile navigation
  - Verify all routes load

- [ ] API endpoints working
  - Test events API: `/api-events`
  - Test restaurants API: `/api-restaurants`
  - Check rate limiting works

- [ ] Authentication flows
  - Sign up new user
  - Sign in existing user
  - Password reset
  - Sign out

- [ ] Core features
  - Search functionality
  - Event filtering
  - Restaurant browsing
  - Map features
  - Social features

### Performance Checks

- [ ] Run Lighthouse audit
  ```bash
  # In Chrome DevTools:
  # Lighthouse → Generate report
  # Target scores:
  # - Performance: >90
  # - Accessibility: >95
  # - Best Practices: >95
  # - SEO: >95
  ```

- [ ] Check Core Web Vitals
  - LCP (Largest Contentful Paint): <2.5s
  - FID (First Input Delay): <100ms
  - CLS (Cumulative Layout Shift): <0.1

- [ ] Test page load times
  - Homepage: <3s
  - Event pages: <2s
  - API responses: <500ms

- [ ] Check bundle sizes
  ```bash
  npm run build:analyze
  # Review dist/stats.html
  # Main bundle should be <500KB gzipped
  ```

### Security Verification

- [ ] SSL certificate active
  - https:// protocol works
  - No mixed content warnings
  - Certificate valid and trusted

- [ ] Security headers present
  ```bash
  curl -I https://desmoinesinsider.com | grep -i "x-"
  # Should see:
  # - X-Frame-Options: DENY
  # - X-Content-Type-Options: nosniff
  # - Strict-Transport-Security
  ```

- [ ] CORS configured correctly
  ```bash
  # Test from different origin
  curl -H "Origin: https://example.com" \
       -I https://your-project.supabase.co/functions/v1/api-events
  # Should see appropriate CORS headers
  ```

- [ ] Rate limiting active
  ```bash
  # Make >100 requests in 15 minutes
  for i in {1..101}; do
    curl https://your-project.supabase.co/functions/v1/api-events
  done
  # Request 101 should return 429 Too Many Requests
  ```

### Monitoring Setup

- [ ] Error tracking configured
  - [ ] Sentry receiving errors (if configured)
  - [ ] Test by triggering test error
  - [ ] Verify sourcemaps uploaded

- [ ] Analytics working
  - [ ] Google Analytics receiving data
  - [ ] Check real-time users
  - [ ] Verify page views tracked

- [ ] Uptime monitoring
  - [ ] Configure UptimeRobot or similar
  - [ ] Monitor homepage
  - [ ] Monitor API endpoints
  - [ ] Set up alerts

### SEO Verification

- [ ] Sitemap accessible
  - Visit https://desmoinesinsider.com/sitemap.xml
  - Verify all pages listed

- [ ] Robots.txt accessible
  - Visit https://desmoinesinsider.com/robots.txt
  - Verify correct configuration

- [ ] Meta tags present
  - Check Open Graph tags
  - Check Twitter Card tags
  - Verify page titles and descriptions

- [ ] Submit to search engines
  - [ ] Submit sitemap to Google Search Console
  - [ ] Submit sitemap to Bing Webmaster Tools

### Documentation

- [ ] Update CHANGELOG.md with release notes
- [ ] Document any configuration changes
- [ ] Update README if needed
- [ ] Tag release in Git
  ```bash
  git tag -a v1.0.0 -m "Production release v1.0.0"
  git push origin v1.0.0
  ```

---

## Post-Launch Monitoring

### First Hour

- [ ] Monitor error rates
  - Check Sentry dashboard
  - Review Supabase function logs
  - Check Cloudflare Analytics

- [ ] Monitor performance
  - Check Core Web Vitals in Google Search Console
  - Monitor Cloudflare Analytics for slow pages

- [ ] Watch user activity
  - Check Google Analytics real-time
  - Monitor authentication attempts
  - Watch for unusual patterns

### First 24 Hours

- [ ] Review all error logs
- [ ] Check API rate limit hits
- [ ] Monitor database performance
- [ ] Review user feedback/support tickets
- [ ] Check social media mentions

### First Week

- [ ] Analyze user behavior
  - Top pages visited
  - Common search queries
  - Drop-off points

- [ ] Performance trends
  - Average load times
  - Error rates over time
  - API response times

- [ ] Optimization opportunities
  - Identify slow pages
  - Find heavy API calls
  - Check for unused features

---

## Rollback Procedure

### If Critical Issue Detected

1. **Immediate Actions**
   ```bash
   # Rollback Cloudflare Pages deployment
   # In Dashboard → Pages → Project → Deployments
   # Find previous working deployment → Three dots → Rollback
   ```

2. **Rollback Database**
   ```bash
   # Only if migrations caused issues
   # In Supabase Dashboard → Database → Backups
   # Restore from backup before migration
   ```

3. **Rollback Edge Functions**
   ```bash
   # Redeploy previous version
   git checkout previous-working-tag
   supabase functions deploy
   ```

4. **Verify Rollback**
   - Test critical paths
   - Check error rates dropped
   - Verify user reports stopped

5. **Communicate**
   - Post status update
   - Notify team
   - Update status page if applicable

### Post-Rollback

- [ ] Document what went wrong
- [ ] Create hotfix branch
- [ ] Fix the issue
- [ ] Test thoroughly
- [ ] Schedule new deployment

---

## Deployment Script (Optional)

Save as `scripts/deploy.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Starting deployment process..."

# Pre-deployment checks
echo "Running tests..."
npm test

echo "Type checking..."
npm run type-check

echo "Linting..."
npm run lint

echo "Building..."
npm run build

# Git operations
echo "Creating git tag..."
VERSION=$(node -p "require('./package.json').version")
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"

# Deploy edge functions
echo "Deploying edge functions..."
supabase functions deploy

echo "✅ Deployment complete!"
echo "Monitor at: https://dash.cloudflare.com"
```

Usage:
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

---

## Common Issues

### Build Fails

**Symptom:** Build fails in Cloudflare Pages

**Solution:**
1. Check Node version matches (20.0.0)
2. Verify all dependencies installed
3. Check for missing environment variables
4. Review build logs for specific errors

### Edge Functions Not Working

**Symptom:** 500 errors from edge functions

**Solution:**
1. Check Supabase function logs
2. Verify secrets are set
3. Test function locally
4. Check CORS configuration

### High Error Rate

**Symptom:** Many errors after deployment

**Solution:**
1. Rollback immediately
2. Review error logs
3. Identify root cause
4. Fix and redeploy

### Slow Performance

**Symptom:** Pages loading slowly

**Solution:**
1. Check Cloudflare Analytics
2. Review bundle sizes
3. Check database query performance
4. Consider caching strategies

---

## Need Help?

- Check [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for technical details
- See [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) for configuration
- Review [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow

---

**Last Updated:** 2025-01-06
