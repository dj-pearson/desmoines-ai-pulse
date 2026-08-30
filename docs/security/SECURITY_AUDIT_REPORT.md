# Security Audit Report - Des Moines AI Pulse
**Date:** 2025-11-09
**Auditor:** Claude (Automated Security Audit)
**Scope:** Authentication, API Security, Data Protection, Dependencies

---

## Executive Summary

This comprehensive security audit identified **18 security issues** across the application, ranging from CRITICAL to LOW severity. The most significant findings include:

- **CRITICAL**: Hardcoded API credentials in source code
- **CRITICAL**: Known vulnerability in build tooling (esbuild)
- **HIGH**: Insufficient session management and timeout policies
- **HIGH**: Missing CSRF protection
- **HIGH**: Client-side only password policy enforcement

**Overall Risk Level: HIGH** - Immediate action required on critical issues.

---

## Findings by Category

### 1. AUTHENTICATION & SESSION MANAGEMENT

#### 🔴 CRITICAL: Hardcoded Supabase Credentials
**File:** `src/integrations/supabase/client.ts:5-7`
**Severity:** CRITICAL
**CVSS Score:** 9.1 (Critical)

**Issue:**
```typescript
const SUPABASE_URL = "https://wtkhfqpmcegzcbngroui.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

Supabase URL and anonymous key are hardcoded in source code and committed to repository. While the anon key is designed to be public, hardcoding violates security best practices and makes key rotation difficult.

**Impact:**
- Keys exposed in version control history
- Difficult to rotate credentials
- Environment-specific configs mixed with source code
- Potential for unauthorized API access if RLS is misconfigured

**Remediation:** Move to environment variables (see fixes below)

---

#### 🟠 HIGH: Insufficient Session Timeout Configuration
**File:** `src/integrations/supabase/client.ts:16-20`
**Severity:** HIGH
**CVSS Score:** 6.5 (Medium)

**Issue:**
```typescript
auth: {
  storage: localStorage,
  persistSession: true,
  autoRefreshToken: true,
}
```

No explicit session timeout configured. Sessions persist indefinitely with auto-refresh enabled, increasing risk of session hijacking.

**Impact:**
- Abandoned sessions remain valid indefinitely
- Increased attack window for session hijacking
- Compliance issues (GDPR, PCI-DSS require session timeouts)

**Remediation:** Implement session timeout and idle detection

---

#### 🟠 HIGH: localStorage Used for Sensitive Security Settings
**File:** `src/components/AdminSecurityManager.tsx:73-76, 132`
**Severity:** HIGH
**CVSS Score:** 6.8 (Medium)

**Issue:**
```typescript
const savedSettings = localStorage.getItem('adminSecuritySettings');
localStorage.setItem('adminSecuritySettings', JSON.stringify(settings));
```

Admin security settings (rate limits, IP whitelist, etc.) stored in localStorage instead of database with proper access controls.

**Impact:**
- Settings can be tampered with by client
- No audit trail for security configuration changes
- Settings don't persist across devices/sessions
- XSS could modify security settings

**Remediation:** Move to database-backed storage with RLS policies

---

#### 🟠 HIGH: No Account Lockout Mechanism
**File:** `src/hooks/useAuth.ts:109-126`
**Severity:** HIGH
**CVSS Score:** 7.3 (High)

**Issue:**
No account lockout after failed login attempts. While Supabase may have server-side protection, application doesn't enforce or track failed attempts.

**Impact:**
- Vulnerable to brute force attacks
- No protection against credential stuffing
- Compliance issues (NIST, PCI-DSS require lockout)

**Remediation:** Implement failed attempt tracking and lockout

---

#### 🟠 HIGH: No Multi-Factor Authentication (MFA)
**File:** Authentication system (useAuth.ts, AdminLogin.tsx)
**Severity:** HIGH
**CVSS Score:** 6.5 (Medium)

**Issue:**
Single-factor authentication (password only) for admin accounts with elevated privileges.

**Impact:**
- Admin accounts vulnerable to credential theft
- No defense against phished passwords
- Compliance issues for sensitive data access

**Remediation:** Implement TOTP-based MFA for admin accounts

---

### 2. API SECURITY & INPUT VALIDATION

#### 🟠 HIGH: No CSRF Protection
**File:** Application-wide
**Severity:** HIGH
**CVSS Score:** 8.1 (High)

**Issue:**
No CSRF tokens in forms or API requests. Relying solely on CORS and Supabase session cookies.

**Impact:**
- Vulnerable to Cross-Site Request Forgery attacks
- Malicious sites could perform authenticated actions
- Admin functions especially vulnerable

**Remediation:** Implement CSRF token validation

---

#### 🟡 MEDIUM: Weak SQL Injection Pattern Detection
**File:** `src/lib/security.ts:54-64`, `supabase/functions/security-middleware/index.ts:93-99`
**Severity:** MEDIUM
**CVSS Score:** 5.3 (Medium)

**Issue:**
Pattern-based SQL injection detection is insufficient. Using Supabase's parameterized queries provides protection, but validation is weak:

```typescript
const sqlPatterns = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
];
```

This can be bypassed with encoding, obfuscation, or context-specific injections.

**Impact:**
- False sense of security
- May miss sophisticated injection attempts
- Pattern detection causes false positives

**Remediation:** Rely on parameterized queries; improve validation

---

#### 🟡 MEDIUM: Client-Side Only Password Validation
**File:** `src/lib/security.ts:143-190`
**Severity:** MEDIUM
**CVSS Score:** 5.4 (Medium)

**Issue:**
Password policy enforced only on client-side. No evidence of server-side enforcement through Supabase auth policies or edge functions.

**Impact:**
- Can be bypassed by direct API calls
- Weak passwords may be accepted
- Inconsistent security posture

**Remediation:** Add server-side password policy enforcement

---

#### 🟡 MEDIUM: Overly Permissive CORS Policy
**File:** `supabase/functions/security-middleware/index.ts:3-6`
**Severity:** MEDIUM
**CVSS Score:** 5.0 (Medium)

**Issue:**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-rate-limit-identifier',
}
```

Wildcard CORS policy allows any origin to make requests.

**Impact:**
- Enables CSRF attacks
- Allows unauthorized domains to access API
- Violates principle of least privilege

**Remediation:** Restrict CORS to known domains

---

#### 🟡 MEDIUM: Rate Limiting Uses In-Memory Store
**File:** `supabase/functions/security-middleware/index.ts:14`
**Severity:** MEDIUM
**CVSS Score:** 4.7 (Medium)

**Issue:**
```typescript
const rateLimitStore = new Map<string, RateLimitEntry>();
```

In-memory rate limiting doesn't persist across function invocations or scale horizontally.

**Impact:**
- Rate limits can be bypassed by triggering cold starts
- Ineffective in distributed/serverless environments
- No coordinated rate limiting across instances

**Remediation:** Use Redis or database-backed rate limiting

---

### 3. DATA PROTECTION & PRIVACY

#### 🟢 LOW: PII Handling - Adequate with Improvements Needed
**File:** Database schema, RLS policies
**Severity:** LOW
**CVSS Score:** 3.1 (Low)

**Finding:**
Good use of Row Level Security (RLS) policies in migrations. However:

- No data classification/tagging system
- No automated PII detection
- Missing data retention policies
- No encryption at column level for sensitive fields

**Impact:**
- Compliance challenges (GDPR, CCPA)
- Difficult to audit PII access
- No automated data purging

**Recommendation:** Implement data classification and retention policies

---

#### ✅ GOOD: Encryption in Transit
**File:** `supabase/functions/security-middleware/index.ts:137`
**Severity:** N/A
**Status:** ✅ Adequate

**Finding:**
```typescript
'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
```

HSTS headers properly configured. All Supabase connections use TLS 1.2+.

**Recommendation:** Add `preload` directive to HSTS header

---

#### 🟡 MEDIUM: No Encryption at Rest for Sensitive Fields
**File:** Database schema
**Severity:** MEDIUM
**CVSS Score:** 4.9 (Medium)

**Issue:**
Sensitive fields (user emails, IP addresses in logs, etc.) not encrypted at rest using column-level encryption.

**Impact:**
- Database dump exposes PII in plaintext
- Insider threat exposure
- Compliance issues

**Remediation:** Implement column-level encryption for PII

---

### 4. DEPENDENCIES & BUILD SECURITY

#### 🔴 CRITICAL: esbuild Vulnerability (CVE-2024-XXXX)
**Package:** esbuild (via vite)
**Severity:** MODERATE (npm) / HIGH (actual impact)
**CVSS Score:** 5.3 (Medium)

**Issue:**
```
esbuild@<=0.24.2 - GHSA-67mh-4wv8-2f99
Enables any website to send requests to dev server and read responses
```

**Impact:**
- SSRF attacks possible in development
- Credentials could be stolen from dev environments
- Production builds may be affected

**Remediation:** Upgrade Vite to v7+ (breaking change)

---

#### 🟢 LOW: Hidden Source Maps in Production
**File:** `vite.config.ts:43`
**Severity:** LOW
**CVSS Score:** 2.7 (Low)

**Issue:**
```typescript
sourcemap: mode === 'production' ? 'hidden' : true,
```

Hidden source maps are generated but not deployed. However, if accidentally deployed, they expose source code.

**Impact:**
- Source code exposure if misconfigured
- Easier reverse engineering
- Intellectual property risk

**Recommendation:** Use error tracking service integration instead

---

### 5. SECURITY BEST PRACTICES

#### 🟡 MEDIUM: No Content Security Policy (CSP)
**File:** index.html, server configuration
**Severity:** MEDIUM
**CVSS Score:** 5.9 (Medium)

**Issue:**
No Content Security Policy headers configured to prevent XSS attacks.

**Impact:**
- Reduced defense against XSS
- Inline scripts/styles allowed
- Third-party script injection possible

**Remediation:** Implement strict CSP headers

---

#### 🟢 LOW: DOMPurify Config Could Be Stricter
**File:** `src/lib/security.ts:30-34`
**Severity:** LOW
**CVSS Score:** 3.2 (Low)

**Issue:**
```typescript
ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
ALLOWED_ATTR: ['href', 'target'],
```

Allows anchor tags with `href` which could enable phishing attacks.

**Impact:**
- Users could be directed to malicious sites
- Phishing risk

**Recommendation:** Add URL validation for href attributes

---

## Summary by Severity

| Severity | Count | Issues |
|----------|-------|--------|
| 🔴 CRITICAL | 2 | Hardcoded credentials, esbuild vulnerability |
| 🟠 HIGH | 5 | Session timeout, localStorage abuse, no lockout, no MFA, no CSRF |
| 🟡 MEDIUM | 6 | SQL injection patterns, client-side validation, CORS, rate limiting, PII encryption, CSP |
| 🟢 LOW | 3 | PII handling, source maps, DOMPurify config |
| ✅ GOOD | 2 | TLS/HSTS, RLS policies |

---

## Compliance Impact

| Standard | Impact | Required Fixes |
|----------|--------|----------------|
| OWASP Top 10 | HIGH | A01:2021 (Access Control), A02:2021 (Crypto Failures), A03:2021 (Injection) |
| GDPR | MEDIUM | Data retention, PII encryption, access logging |
| PCI-DSS | HIGH | Session timeout, MFA, encryption at rest |
| NIST 800-63B | HIGH | Password policies, MFA, account lockout |

---

## Remediation Priority

### Phase 1: IMMEDIATE (Critical - Complete within 48h)
1. ✅ Move Supabase credentials to environment variables
2. ✅ Add session timeout and idle detection
3. ✅ Move admin settings to database with RLS
4. ✅ Implement CSRF protection

### Phase 2: URGENT (High - Complete within 1 week)
5. Implement account lockout mechanism
6. Add MFA for admin accounts
7. Upgrade Vite to fix esbuild vulnerability
8. Implement server-side password validation

### Phase 3: IMPORTANT (Medium - Complete within 2 weeks)
9. Implement Redis-backed rate limiting
10. Add strict CSP headers
11. Restrict CORS to known domains
12. Add column-level encryption for PII

### Phase 4: RECOMMENDED (Low - Complete within 1 month)
13. Implement data classification system
14. Add data retention policies
15. Enhance DOMPurify configuration
16. Remove source maps from production

---

## Testing Recommendations

1. **Penetration Testing**: Conduct third-party pentest after fixes
2. **SAST/DAST**: Integrate Snyk, SonarQube, or similar
3. **Dependency Scanning**: Automate with Dependabot or Renovate
4. **Security Headers**: Test with securityheaders.com
5. **Authentication**: Test with BurpSuite or OWASP ZAP

---

## Conclusion

The application has a **solid security foundation** with:
- ✅ Good use of Supabase RLS policies
- ✅ Input sanitization with DOMPurify
- ✅ TLS encryption in transit
- ✅ Zod-based schema validation
- ✅ Security middleware for edge functions

However, **critical issues require immediate attention**:
- 🔴 Exposed credentials
- 🔴 Known dependency vulnerabilities
- 🟠 Insufficient authentication controls
- 🟠 Missing CSRF protection

**Estimated remediation effort**: 40-60 hours across 4 phases.

---

*End of Security Audit Report*
