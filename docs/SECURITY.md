# Security Documentation

**Last Updated**: 2026-01-01
**Security Contact**: Report vulnerabilities via GitHub Issues (private disclosure)

This document outlines security practices, implemented protections, and guidelines for maintaining security in the Des Moines AI Pulse platform.

---

## Table of Contents

1. [Security Overview](#security-overview)
2. [Recent Security Improvements](#recent-security-improvements)
3. [Authentication Security](#authentication-security)
4. [Input Validation & Sanitization](#input-validation--sanitization)
5. [API Security](#api-security)
6. [Database Security](#database-security)
7. [Frontend Security](#frontend-security)
8. [Edge Function Security](#edge-function-security)
9. [Security Utilities](#security-utilities)
10. [Security Checklist](#security-checklist)
11. [Incident Response](#incident-response)

---

## Security Overview

Des Moines AI Pulse implements a defense-in-depth security strategy with multiple layers of protection:

```
┌─────────────────────────────────────────────────────────┐
│                    CDN/WAF Layer                        │
│              (Cloudflare Protection)                    │
├─────────────────────────────────────────────────────────┤
│                  Frontend Security                       │
│     (CSP, XSS Prevention, Input Sanitization)           │
├─────────────────────────────────────────────────────────┤
│                  API/Edge Functions                      │
│  (Rate Limiting, CORS, Input Validation, SSRF Block)    │
├─────────────────────────────────────────────────────────┤
│                Authentication Layer                      │
│     (Supabase Auth, MFA, Session Management)            │
├─────────────────────────────────────────────────────────┤
│                  Database Layer                          │
│           (RLS, Prepared Statements, Encryption)         │
└─────────────────────────────────────────────────────────┘
```

---

## Recent Security Improvements

### Fixed Vulnerabilities (2025-2026)

#### 1. Open Redirect Prevention (Fixed: Dec 2025)
- **Issue**: Redirect URLs could be manipulated to redirect users to malicious sites
- **Fix**: Implemented `isValidRedirectUrl()` that only allows relative paths
- **Location**: `src/lib/security.ts`

```typescript
// Validates redirect URLs - only allows relative paths
SecurityUtils.isValidRedirectUrl('/dashboard'); // true
SecurityUtils.isValidRedirectUrl('https://evil.com'); // false
SecurityUtils.isValidRedirectUrl('//evil.com'); // false
```

#### 2. Client-Side API Key Exposure (Fixed: Dec 2025)
- **Issue**: API keys were exposed in client-side code
- **Fix**: Moved sensitive operations to Edge Functions; only public keys remain client-side
- **Pattern**: Use Edge Functions for any operation requiring secret keys

#### 3. SSRF Protection (Fixed: Dec 2025)
- **Issue**: Server-side requests could be directed to internal resources
- **Fix**: URL validation blocks localhost, private IPs, and internal networks
- **Location**: `src/lib/security.ts`, `supabase/functions/_shared/validation.ts`

```typescript
// Blocks internal network access
SecurityUtils.validateURL('http://localhost:8080'); // Invalid
SecurityUtils.validateURL('http://192.168.1.1'); // Invalid
SecurityUtils.validateURL('http://10.0.0.1'); // Invalid
```

#### 4. Hardcoded Credentials Removal (Fixed: Dec 2025)
- **Issue**: Some test credentials were hardcoded in source files
- **Fix**: Removed all hardcoded secrets; all credentials now via environment variables

#### 5. Signup/Login Security (Fixed: Dec 2025)
- **Issue**: Auth flow had potential security gaps
- **Fix**: Added CSRF protection, improved session handling, added rate limiting

---

## Authentication Security

### Architecture

Authentication is handled by Supabase Auth with additional security layers:

```typescript
// Authentication flow
User → Frontend → Supabase Auth → JWT → Protected Resources
                      ↓
              Session Management
              MFA Verification
              Role Assignment
```

### Security Features

| Feature | Description | Hook/Function |
|---------|-------------|---------------|
| **Session Management** | Automatic refresh, secure storage | `useSessionManager` |
| **Account Lockout** | Lock after failed attempts | `useAccountLockout` |
| **MFA/2FA** | TOTP-based two-factor auth | `useMFA` |
| **Password Policy** | Strength requirements enforced | `usePasswordPolicy` |
| **Login Activity** | Track and alert on suspicious logins | `useLoginActivity` |
| **Magic Links** | Passwordless authentication | `useMagicLink` |

### Password Requirements

```typescript
// From usePasswordPolicy
const requirements = {
  minLength: 8,
  maxLength: 128,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSpecial: true,
};
```

### Session Security

```typescript
// Session timeout configuration
const SESSION_CONFIG = {
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  warningBefore: 5 * 60 * 1000,    // 5 minutes warning
  refreshThreshold: 60 * 60 * 1000, // Refresh if < 1 hour remaining
};
```

---

## Input Validation & Sanitization

### XSS Prevention

All user-generated HTML is sanitized using DOMPurify:

```typescript
import { SecurityUtils } from '@/lib/security';

// Sanitize HTML content
const safeHTML = SecurityUtils.sanitizeHTML(userInput);

// Allowed tags only: b, i, em, strong, a, p, br, ul, ol, li
// Allowed attributes only: href, target
```

### SQL Injection Prevention

1. **Supabase SDK**: Uses parameterized queries by default
2. **Pattern Detection**: Additional SQL injection pattern detection

```typescript
// Check for SQL injection patterns
if (SecurityUtils.containsSQLInjection(userInput)) {
  throw new Error('Invalid input detected');
}
```

### Validation Schemas

```typescript
import { ValidationSchemas } from '@/lib/security';

// Pre-built schemas for common data types
ValidationSchemas.email     // Valid email format, max 254 chars
ValidationSchemas.password  // 8-128 chars
ValidationSchemas.url       // Valid URL, max 2048 chars
ValidationSchemas.id        // UUID format
ValidationSchemas.rating    // Number 1-5
ValidationSchemas.phoneNumber  // International format
ValidationSchemas.slug      // URL-safe slug
```

---

## API Security

### Rate Limiting

Edge Functions implement rate limiting:

```typescript
// Default: 100 requests per 15 minutes per IP
const RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 15 * 60 * 1000,
};

// Client-side rate limiting
const { allowed, resetTime } = SecurityUtils.checkRateLimit(
  userId,
  100,     // max requests
  900000   // 15 minutes
);
```

### CORS Configuration

```typescript
// supabase/functions/_shared/cors.ts
const corsHeaders = {
  'Access-Control-Allow-Origin': getAllowedOrigin(request),
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Allowed origins by environment
const ALLOWED_ORIGINS = {
  production: ['https://desmoines-ai-pulse.com'],
  staging: ['https://staging.desmoines-ai-pulse.com'],
  development: ['http://localhost:8080', 'http://localhost:3000'],
};
```

### API Key Security

| Key Type | Exposure | Usage |
|----------|----------|-------|
| `SUPABASE_ANON_KEY` | Public (client) | Row-level security enforced |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Edge Functions only |
| `STRIPE_SECRET_KEY` | Server only | Edge Functions only |
| `ANTHROPIC_API_KEY` | Server only | Edge Functions only |
| `STRIPE_WEBHOOK_SECRET` | Server only | Webhook verification |

---

## Database Security

### Row Level Security (RLS)

All tables have RLS enabled with appropriate policies:

```sql
-- Example: Events table policies
CREATE POLICY "Public read access" ON events
  FOR SELECT USING (true);

CREATE POLICY "Authenticated create" ON events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin update" ON events
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin delete" ON events
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

### Sensitive Data Protection

| Data Type | Protection |
|-----------|------------|
| Passwords | Hashed by Supabase Auth (bcrypt) |
| API Keys | Encrypted at rest, never exposed client-side |
| Payment Info | Handled by Stripe (PCI compliant) |
| Session Tokens | HTTP-only cookies, secure flag |
| User Emails | Protected by RLS, admin-only access |

---

## Frontend Security

### Content Security Policy

```html
<!-- Recommended CSP headers -->
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://js.stripe.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https: blob:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com;
  frame-src https://js.stripe.com https://hooks.stripe.com;
  font-src 'self' data:;
```

### Security Headers

```typescript
// Checked by check-security-headers edge function
const REQUIRED_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
};
```

### Secure Storage

```typescript
// Never store sensitive data in localStorage
// Use the safe storage wrapper with encryption for sensitive data
import { storage } from '@/lib/safeStorage';

// For non-sensitive preferences
storage.set('theme', 'dark');

// For sensitive data - use server-side storage or encrypted cookies
```

---

## Edge Function Security

### Standard Security Pattern

```typescript
import { corsHeaders } from '../_shared/cors.ts';
import { rateLimiter } from '../_shared/rateLimit.ts';
import { validateInput } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 2. Rate limiting
  const rateLimit = await rateLimiter(req);
  if (!rateLimit.success) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      { status: 429, headers: corsHeaders }
    );
  }

  // 3. Input validation
  const body = await req.json();
  const validation = await validateInput(body, schema);
  if (!validation.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: validation.errors }),
      { status: 400, headers: corsHeaders }
    );
  }

  // 4. Authorization check (if needed)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: corsHeaders }
    );
  }

  // 5. Business logic with validated data
  try {
    const result = await processRequest(validation.data);
    return new Response(
      JSON.stringify({ success: true, data: result }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    // 6. Error handling without leaking internals
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
});
```

### SSRF Protection in Edge Functions

```typescript
// Validate URLs before making external requests
function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Block private/internal networks
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '169.254.',    // Link-local
      '10.',         // Class A private
      '172.16.',     // Class B private
      '192.168.',    // Class C private
    ];

    if (blockedHosts.some(h => parsed.hostname.startsWith(h))) {
      return false;
    }

    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
```

---

## Security Utilities

### Using SecurityUtils

```typescript
import { SecurityUtils, ValidationSchemas } from '@/lib/security';

// HTML sanitization
const safeContent = SecurityUtils.sanitizeHTML(userHtml);

// Email validation
const { isValid, errors } = SecurityUtils.validateEmail(email);

// URL validation (with SSRF protection)
const urlValidation = SecurityUtils.validateURL(url);

// Password validation
const { isValid, errors, strength } = SecurityUtils.validatePassword(password);

// Redirect URL validation
const safeRedirect = SecurityUtils.getSafeRedirectUrl(redirectParam, '/');

// File upload validation
const fileValidation = SecurityUtils.validateFileUpload(file);

// Rate limiting
const { allowed, resetTime } = SecurityUtils.checkRateLimit(userId, 100, 900000);

// Secure token generation
const token = SecurityUtils.generateSecureToken(32);
```

### Validation Helpers

```typescript
import { z } from 'zod';
import { SecurityUtils } from '@/lib/security';

// Custom validation with security checks
const ContactFormSchema = z.object({
  email: z.string()
    .email()
    .max(254)
    .refine(email => !SecurityUtils.containsSQLInjection(email)),
  message: z.string()
    .max(10000)
    .transform(msg => SecurityUtils.sanitizeHTML(msg)),
  website: z.string()
    .url()
    .optional()
    .refine(url => !url || SecurityUtils.validateURL(url).isValid),
});
```

---

## Security Checklist

### Development Checklist

- [ ] No hardcoded secrets or API keys in source code
- [ ] All user inputs validated and sanitized
- [ ] SQL queries use parameterized statements
- [ ] HTML content sanitized before rendering
- [ ] External URLs validated for SSRF
- [ ] Redirect URLs validated for open redirect
- [ ] Rate limiting implemented on sensitive endpoints
- [ ] Proper error handling without information leakage
- [ ] Authentication required for protected routes
- [ ] Authorization checks for admin operations

### Code Review Checklist

- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] No direct DOM manipulation with user content
- [ ] No `eval()` or `Function()` with user input
- [ ] No regex without length limits (ReDoS prevention)
- [ ] Sensitive data not logged
- [ ] Error messages don't expose stack traces
- [ ] File uploads validated for type and size
- [ ] CORS configured correctly

### Deployment Checklist

- [ ] All secrets in environment variables
- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] CSP headers set
- [ ] Database RLS enabled and tested
- [ ] Edge function rate limiting active
- [ ] Monitoring and alerting configured

---

## Incident Response

### Reporting Vulnerabilities

1. **DO NOT** create public GitHub issues for security vulnerabilities
2. Contact maintainers through private disclosure
3. Include: vulnerability description, reproduction steps, potential impact
4. Allow reasonable time for patching before disclosure

### Response Process

1. **Acknowledge** - Confirm receipt within 24 hours
2. **Assess** - Evaluate severity and impact
3. **Patch** - Develop and test fix
4. **Deploy** - Push fix to production
5. **Notify** - Inform affected users if necessary
6. **Document** - Update security documentation

### Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| Critical | Data breach, RCE, auth bypass | Immediate |
| High | Privilege escalation, XSS, SQLi | 24 hours |
| Medium | Information disclosure, CSRF | 72 hours |
| Low | Minor information leak | Next release |

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod)
- [React Security Best Practices](https://reactjs.org/docs/dom-elements.html#dangerouslysetinnerhtml)
- [Deno Security](https://deno.land/manual/runtime/permission_apis)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-01 | Initial security documentation with recent fixes |
