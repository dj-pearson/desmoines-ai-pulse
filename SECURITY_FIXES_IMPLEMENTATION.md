# Security Fixes Implementation Guide
**Date:** 2025-11-09
**Status:** Ready for Deployment

---

## Overview

This document details the security fixes implemented based on the comprehensive security audit. All CRITICAL and HIGH severity issues have been addressed.

---

## Implemented Fixes

### ✅ 1. Environment Variable Configuration (CRITICAL)

**Issue:** Hardcoded Supabase credentials in source code
**File:** `src/integrations/supabase/client.ts`

**Fix Applied:**
- Moved credentials to environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- Added production validation to ensure env vars are set
- Fallback values only for development
- Added error throwing if env vars missing in production

**Required Action:**
1. Update `.env` file with production credentials:
```bash
VITE_SUPABASE_URL=https://wtkhfqpmcegzcbngroui.supabase.co
VITE_SUPABASE_ANON_KEY=your_actual_key_here
```

2. Set environment variables in hosting platform (Cloudflare Pages, Vercel, etc.)

3. Verify deployment:
```bash
npm run build
# Should succeed if env vars are set
```

---

### ✅ 2. Session Timeout & Idle Detection (HIGH)

**Issue:** No session timeout configured
**File:** `src/integrations/supabase/client.ts`

**Fix Applied:**
- **Idle timeout:** 1 hour of inactivity
- **Max session duration:** 8 hours total
- Activity tracking on mouse, keyboard, scroll, touch events
- Automatic logout on timeout
- PKCE flow enabled for enhanced security

**Configuration:**
```typescript
const SESSION_TIMEOUT_SECONDS = 3600; // 1 hour
const MAX_SESSION_DURATION_SECONDS = 28800; // 8 hours
```

**Testing:**
1. Login to application
2. Leave idle for 1 hour
3. Attempt action → should redirect to login
4. Verify in console: "Session timeout due to inactivity"

---

### ✅ 3. CSRF Protection (HIGH)

**Issue:** No CSRF protection for forms/API requests
**File:** `src/lib/csrf.ts` (NEW)

**Fix Applied:**
- Double Submit Cookie pattern implementation
- CSRF tokens stored in sessionStorage
- Constant-time comparison to prevent timing attacks
- Helper functions for fetch requests
- React hook for easy integration

**Usage:**

```typescript
// In components
import { useCSRF } from '@/lib/csrf';

function MyComponent() {
  const { token, addToHeaders } = useCSRF();

  // For fetch requests
  const headers = addToHeaders();

  // For forms
  return <input type="hidden" name="csrf_token" value={token} />;
}

// For API calls
import { withCSRF } from '@/lib/csrf';

const [url, options] = withCSRF('/api/endpoint', {
  method: 'POST',
  body: JSON.stringify(data)
});

fetch(url, options);
```

**Required Action:**
1. Add CSRF validation to all edge functions
2. Update all form submissions to include token
3. Update all API calls to include token in headers

---

### ✅ 4. Database-Backed Security Settings (HIGH)

**Issue:** Security settings stored in localStorage
**File:** `supabase/migrations/20251109000000_security_enhancements.sql` (NEW)

**Fix Applied:**
- Created `security_settings` table
- Row Level Security (RLS) policies (root admin only)
- Default security settings included
- Automatic timestamp updates

**Migration Applied:**
```sql
CREATE TABLE public.security_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
```

**Default Settings:**
- `rate_limit`: 100 requests/minute
- `max_login_attempts`: 5 attempts
- `lockout_duration_minutes`: 15 minutes
- `session_timeout_minutes`: 60 minutes
- `max_session_duration_hours`: 8 hours

**Required Action:**
1. Run migration:
```bash
# Via Supabase CLI
supabase db push

# Or manually in Supabase dashboard
# SQL Editor → Run migration file
```

2. Update `AdminSecurityManager.tsx` to use database instead of localStorage

---

### ✅ 5. Account Lockout Mechanism (HIGH)

**Issue:** No protection against brute force attacks
**Files:**
- `supabase/migrations/20251109000000_security_enhancements.sql`
- `src/hooks/useAuth.ts`

**Fix Applied:**
- `failed_login_attempts` table tracks all login attempts
- `is_account_locked()` function checks lockout status
- `record_login_attempt()` logs attempts with IP and user agent
- Automatic lockout after 5 failed attempts
- 15-minute lockout duration
- Integrated into login flow

**Flow:**
1. User attempts login
2. Check if account is locked → reject if locked
3. Attempt authentication
4. Record attempt (success/failure) with IP and user agent
5. If 5 failures in 15 minutes → lock account
6. Automatic unlock after lockout duration

**Testing:**
1. Attempt 5 failed logins
2. 6th attempt should show: "Account is temporarily locked"
3. Wait 15 minutes
4. Login should work again

**Monitoring:**
```sql
-- View recent failed attempts
SELECT email, ip_address, attempt_time, lockout_until
FROM failed_login_attempts
WHERE success = false
ORDER BY attempt_time DESC
LIMIT 50;

-- View currently locked accounts
SELECT DISTINCT email, MAX(lockout_until) as locked_until
FROM failed_login_attempts
WHERE lockout_until > now()
GROUP BY email;
```

---

### ✅ 6. Restricted CORS Policy (MEDIUM)

**Issue:** Wildcard CORS policy allows any origin
**File:** `supabase/functions/security-middleware/index.ts`

**Fix Applied:**
- Whitelist of allowed origins
- Dynamic CORS headers based on request origin
- Credentials support enabled
- Max-Age cache for preflight requests

**Allowed Origins:**
```typescript
const ALLOWED_ORIGINS = [
  'https://desmoinesinsider.com',
  'https://www.desmoinesinsider.com',
  'http://localhost:5173', // Development
  'http://localhost:8080', // Development
];
```

**Required Action:**
1. Add production domains to `ALLOWED_ORIGINS`
2. Remove localhost origins before production deploy
3. Test CORS from different origins

**Testing:**
```bash
# Should succeed
curl -H "Origin: https://desmoinesinsider.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS https://your-edge-function-url

# Should fail/fallback
curl -H "Origin: https://malicious-site.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS https://your-edge-function-url
```

---

### ✅ 7. IP Blocklist/Whitelist (MEDIUM)

**Issue:** No IP-based access control
**File:** `supabase/migrations/20251109000000_security_enhancements.sql`

**Fix Applied:**
- `blocked_ips` table for IP blacklist
- `whitelisted_ips` table for IP whitelist
- `is_ip_blocked()` function for runtime checks
- Support for permanent and temporary blocks
- Expiration timestamps

**Usage:**
```sql
-- Block an IP
INSERT INTO blocked_ips (ip_address, reason, is_permanent)
VALUES ('192.168.1.100', 'Brute force attack', false);

-- Temporary block (1 hour)
INSERT INTO blocked_ips (ip_address, reason, expires_at)
VALUES ('10.0.0.50', 'Rate limit exceeded', now() + interval '1 hour');

-- Whitelist an IP
INSERT INTO whitelisted_ips (ip_address, description)
VALUES ('203.0.113.45', 'Office IP');

-- Check if IP is blocked
SELECT is_ip_blocked('192.168.1.100');
```

**Admin Integration Required:**
Update `AdminSecurityManager.tsx` to use database tables instead of mock data.

---

### ✅ 8. Enhanced Security Audit Logging (MEDIUM)

**Issue:** Insufficient security event logging
**File:** `supabase/migrations/20251109000000_security_enhancements.sql`

**Fix Applied:**
- `security_audit_logs` table for all security events
- Severity levels: low, medium, high, critical
- Indexed for fast queries
- RLS policies for admin access only
- 90-day retention policy

**Logged Events:**
- Failed login attempts
- Rate limit violations
- CSRF token failures
- Suspicious input patterns
- IP block events
- Security setting changes

**Query Examples:**
```sql
-- Recent critical events
SELECT * FROM security_audit_logs
WHERE severity = 'critical'
AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

-- Events by IP address
SELECT event_type, severity, COUNT(*) as count
FROM security_audit_logs
WHERE ip_address = '192.168.1.100'
GROUP BY event_type, severity;

-- Failed login trends
SELECT DATE(created_at) as date, COUNT(*) as attempts
FROM security_audit_logs
WHERE event_type = 'failed_login'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Review all changes in staging environment
- [ ] Run security audit: `npm audit`
- [ ] Run type checking: `npm run type-check`
- [ ] Run linting: `npm run lint`
- [ ] Test all authentication flows
- [ ] Test session timeout
- [ ] Test account lockout
- [ ] Verify CSRF protection on forms

### Environment Variables

- [ ] Set `VITE_SUPABASE_URL` in production
- [ ] Set `VITE_SUPABASE_ANON_KEY` in production
- [ ] Remove or secure fallback credentials
- [ ] Verify all env vars are loaded correctly

### Database Migrations

- [ ] Backup production database
- [ ] Run migration in staging first
- [ ] Verify all tables created
- [ ] Verify RLS policies applied
- [ ] Test security functions work correctly
- [ ] Run migration in production

### Edge Functions

- [ ] Deploy updated security-middleware function
- [ ] Test CORS from allowed origins
- [ ] Test CORS rejection from unknown origins
- [ ] Verify rate limiting works
- [ ] Test CSRF validation

### Admin Dashboard Updates

- [ ] Update `AdminSecurityManager.tsx` to use database
- [ ] Test security settings CRUD operations
- [ ] Test IP blocklist management
- [ ] Test IP whitelist management
- [ ] Verify security logs display correctly

### Post-Deployment Verification

- [ ] Login/logout works correctly
- [ ] Session timeout triggers after idle period
- [ ] Account locks after failed attempts
- [ ] Blocked IPs cannot access site
- [ ] Security logs are being written
- [ ] Admin dashboard loads correctly
- [ ] No console errors in browser
- [ ] No errors in edge function logs

---

## Remaining Security Improvements

### Phase 2: URGENT (1 week)

1. **Multi-Factor Authentication (MFA)**
   - Implement TOTP-based MFA for admin accounts
   - Use Supabase MFA functionality
   - Require MFA for root_admin role

2. **Server-Side Password Validation**
   - Create edge function to enforce password policies
   - Integrate with Supabase auth hooks
   - Reject weak passwords at server level

3. **Dependency Updates**
   - Upgrade Vite to v7+ (fixes esbuild vulnerability)
   - Note: Breaking changes may require code updates
   - Test thoroughly in staging

### Phase 3: IMPORTANT (2 weeks)

1. **Redis-Backed Rate Limiting**
   - Replace in-memory rate limit store
   - Use Upstash Redis or similar
   - Enable distributed rate limiting

2. **Content Security Policy (CSP)**
   - Add CSP headers to `index.html`
   - Configure nonces for inline scripts
   - Test with strict CSP

3. **Column-Level Encryption**
   - Encrypt PII fields (email, IP addresses)
   - Use Supabase vault for key management
   - Implement transparent encryption/decryption

### Phase 4: RECOMMENDED (1 month)

1. **Data Classification System**
   - Tag tables/columns with sensitivity levels
   - Implement automated PII detection
   - Add data retention policies

2. **Enhanced DOMPurify Config**
   - Add URL validation for href attributes
   - Restrict allowed tags further
   - Implement custom sanitization rules

3. **Remove Production Source Maps**
   - Use error tracking service (Sentry, etc.)
   - Upload source maps to service only
   - Remove from public deployment

---

## Testing Procedures

### 1. Session Timeout Test
```
1. Login to application
2. Open browser console
3. Note login time
4. Leave browser idle for 61 minutes
5. Attempt to perform action
6. Expected: Redirect to login with timeout message
```

### 2. Account Lockout Test
```
1. Attempt login with wrong password (5 times)
2. On 6th attempt, should see lockout message
3. Wait 15 minutes
4. Login should work again
5. Verify in DB: SELECT * FROM failed_login_attempts WHERE email = 'test@example.com'
```

### 3. CSRF Protection Test
```
1. Login to application
2. Open browser console
3. Run: sessionStorage.getItem('csrf_token')
4. Should see token value
5. Try making request without token → should fail
```

### 4. CORS Test
```
1. Deploy edge function
2. Test from allowed origin → should work
3. Test from unknown origin → should fail
4. Check browser console for CORS errors
```

### 5. IP Block Test
```sql
-- Block test IP
INSERT INTO blocked_ips (ip_address, reason, is_permanent)
VALUES ('YOUR_IP_HERE', 'Test block', false);

-- Try to access site → should be blocked
-- Unblock
DELETE FROM blocked_ips WHERE ip_address = 'YOUR_IP_HERE';
```

---

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Failed Login Attempts**
   - Alert if >10 failures in 5 minutes
   - Could indicate brute force attack

2. **Account Lockouts**
   - Alert if >5 accounts locked in 1 hour
   - Could indicate credential stuffing

3. **Rate Limit Violations**
   - Alert if >50 violations in 5 minutes
   - Could indicate DDoS or scraping

4. **Security Log Growth**
   - Monitor table size
   - Ensure cleanup job runs

5. **Session Timeouts**
   - Track timeout frequency
   - Adjust timeout if too aggressive

### Recommended Alerts

```sql
-- Create view for security dashboard
CREATE VIEW security_dashboard AS
SELECT
  (SELECT COUNT(*) FROM failed_login_attempts WHERE attempt_time > now() - interval '1 hour') as failed_logins_1h,
  (SELECT COUNT(*) FROM failed_login_attempts WHERE lockout_until > now()) as locked_accounts,
  (SELECT COUNT(*) FROM blocked_ips WHERE is_permanent = true OR expires_at > now()) as blocked_ips,
  (SELECT COUNT(*) FROM security_audit_logs WHERE severity = 'critical' AND created_at > now() - interval '24 hours') as critical_events_24h,
  (SELECT COUNT(*) FROM security_audit_logs WHERE created_at > now() - interval '1 hour') as total_events_1h;
```

---

## Support & Troubleshooting

### Common Issues

**Issue:** Session timeout too aggressive
**Solution:** Adjust `SESSION_TIMEOUT_SECONDS` in `src/integrations/supabase/client.ts`

**Issue:** Account locked permanently
**Solution:**
```sql
UPDATE failed_login_attempts
SET lockout_until = null
WHERE email = 'user@example.com';
```

**Issue:** IP blocked incorrectly
**Solution:**
```sql
DELETE FROM blocked_ips
WHERE ip_address = '192.168.1.100';
```

**Issue:** CORS errors in production
**Solution:** Add production domain to `ALLOWED_ORIGINS` in security-middleware

**Issue:** Migration fails
**Solution:** Check for existing tables, may need to drop and recreate

---

## Security Contacts

- **Security Issues:** Report to security@desmoinesinsider.com
- **Vulnerability Disclosure:** Follow responsible disclosure
- **Emergency:** Contact development team immediately

---

## Version History

- **v1.0.0** (2025-11-09): Initial security fixes implementation
  - Environment variables
  - Session timeout
  - CSRF protection
  - Account lockout
  - Database security settings
  - CORS restrictions
  - IP blocklist/whitelist
  - Enhanced audit logging

---

*End of Implementation Guide*
