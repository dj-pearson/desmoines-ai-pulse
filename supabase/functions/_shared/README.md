# Shared Edge Function Utilities

This directory contains shared utilities for Supabase Edge Functions providing security, validation, and standardization.

## Contents

- [CORS Management](#cors-management)
- [Rate Limiting](#rate-limiting)
- [Input Validation](#input-validation)
- [Complete Example](#complete-example)

---

## CORS Management

**File:** `cors.ts`

Provides environment-aware CORS configuration that automatically adjusts based on your deployment.

### Features

- ✅ Development: Allows all origins
- ✅ Production: Restricts to configured domain
- ✅ Automatic Lovable.dev preview support
- ✅ localhost support for local development

### Usage

```typescript
import { handleCors, addCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // ... your logic ...

  // Add CORS headers to response
  return addCorsHeaders(response);
});
```

### Configuration

Set environment variables:

```bash
# In .env or Supabase secrets
VITE_SITE_URL=https://desmoinesinsider.com
ENVIRONMENT=production

# Set in Supabase
supabase secrets set VITE_SITE_URL=https://desmoinesinsider.com
supabase secrets set ENVIRONMENT=production
```

### API Reference

#### `getCorsOrigin(): string`

Returns the appropriate CORS origin based on environment.

#### `getCorsHeaders(origin?: string): Record<string, string>`

Returns CORS headers object. Optionally override origin.

#### `handleCors(req: Request): Response | null`

Handles CORS preflight (OPTIONS) requests. Returns Response for OPTIONS, null otherwise.

#### `addCorsHeaders(response: Response, origin?: string): Response`

Adds CORS headers to an existing response.

#### `isOriginAllowed(origin: string): boolean`

Checks if an origin is allowed.

---

## Rate Limiting

**File:** `rateLimit.ts`

Provides in-memory rate limiting to prevent API abuse.

### Features

- ✅ IP-based rate limiting
- ✅ Token-based limiting for authenticated requests
- ✅ Automatic cleanup of expired entries
- ✅ Standard 429 responses with Retry-After
- ✅ Rate limit headers in all responses

### Usage

```typescript
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";

serve(async (req) => {
  // Check rate limit
  const rateLimitResult = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,                   // 100 requests
  });

  if (!rateLimitResult.success) {
    return addCorsHeaders(rateLimitResult.response!);
  }

  // ... your logic ...

  // Add rate limit headers
  return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);
});
```

### Configuration Options

```typescript
interface RateLimitOptions {
  windowMs?: number;              // Time window in ms (default: 15 min)
  max?: number;                   // Max requests per window (default: 100)
  message?: string;               // Custom error message
  skipSuccessfulRequests?: boolean;  // Don't count successful requests
  skipFailedRequests?: boolean;      // Don't count failed requests
}
```

### API Reference

#### `checkRateLimit(req: Request, options?: RateLimitOptions): RateLimitResult`

Check if request is rate limited.

Returns:
```typescript
{
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  response?: Response;  // 429 response if rate limited
}
```

#### `getRateLimitStatus(req: Request, options?: RateLimitOptions)`

Get current rate limit status without incrementing counter.

#### `decrementRateLimit(req: Request, windowMs?: number)`

Decrement rate limit counter (for failed requests that shouldn't count).

#### `addRateLimitHeaders(response: Response, result: RateLimitResult): Response`

Add rate limit headers to response:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)

### Response Headers

**Success Response (200):**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1704567890000
```

**Rate Limited Response (429):**
```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704567890000
Retry-After: 245

{
  "error": "Too many requests, please try again later.",
  "retryAfter": 245
}
```

### Notes

**⚠️ Important Limitations:**

- Uses in-memory storage (resets on function cold start)
- For production, consider using Upstash Redis or Supabase tables
- Current implementation is per-function, not global

**🔒 Security:**

- Combines IP address with auth token for authenticated users
- Uses first 20 chars of auth token for privacy
- Falls back to 'unknown' if IP cannot be determined

---

## Input Validation

**File:** `validation.ts`

Provides schema-based input validation for query parameters and request bodies.

### Features

- ✅ Type coercion and validation
- ✅ String length limits
- ✅ Number range validation
- ✅ Email validation
- ✅ URL validation
- ✅ Pattern matching (regex)
- ✅ Default values
- ✅ Required field enforcement

### Usage

```typescript
import { validateQueryParams } from "../_shared/validation.ts";

serve(async (req) => {
  const url = new URL(req.url);

  // Validate query parameters
  const validation = validateQueryParams(url, {
    limit: { type: 'number', min: 1, max: 100, default: 20 },
    offset: { type: 'number', min: 0, default: 0 },
    search: { type: 'string', max: 200 },
    email: { type: 'email', required: true },
    website: { type: 'url' },
    active: { type: 'boolean', default: true },
  });

  if (!validation.success) {
    return new Response(
      JSON.stringify({
        error: 'Invalid parameters',
        details: validation.errors
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const params = validation.data!;
  // params.limit is a number
  // params.search is a string or undefined
  // params.email is validated email string
});
```

### Validation Types

#### String

```typescript
{
  fieldName: {
    type: 'string',
    required: true,       // Must be provided
    min: 3,               // Minimum length
    max: 100,             // Maximum length
    pattern: /^[a-z]+$/i, // Regex pattern
    default: 'value'      // Default if not provided
  }
}
```

#### Number

```typescript
{
  age: {
    type: 'number',
    required: false,
    min: 0,              // Minimum value
    max: 120,            // Maximum value
    default: 18          // Default if not provided
  }
}
```

**Note:** Strings are automatically parsed to numbers.

#### Boolean

```typescript
{
  isActive: {
    type: 'boolean',
    default: false
  }
}
```

**Parsing:**
- `"true"` or `"1"` → `true`
- `"false"` or `"0"` → `false`
- Anything else → `Boolean(value)`

#### Email

```typescript
{
  email: {
    type: 'email',
    required: true
  }
}
```

**Validation:**
- RFC 5322 compliant regex
- Max length: 254 characters
- SQL injection pattern detection

#### URL

```typescript
{
  website: {
    type: 'url',
    max: 2048
  }
}
```

**Validation:**
- Must be valid URL
- Only HTTP and HTTPS protocols allowed
- Blocks local and private IPs (127.0.0.1, 192.168.*, 10.*, 172.*)

### API Reference

#### `validateInput(input: Record<string, any>, schema: ValidationSchema): ValidationResult`

Validate input object against schema.

#### `validateQueryParams(url: URL, schema: ValidationSchema): ValidationResult`

Validate URL query parameters against schema.

#### `sanitizeString(input: string): string`

Sanitize string to prevent SQL injection. Removes quotes, backslashes, and trims.

### Validation Result

```typescript
{
  success: boolean;
  data?: Record<string, any>;    // Validated and coerced data
  errors?: Record<string, string>; // Field-specific error messages
}
```

### Error Messages

```typescript
// Example error response
{
  "success": false,
  "errors": {
    "email": "email must be a valid email",
    "limit": "limit must be at most 100",
    "search": "search must be at least 3 characters"
  }
}
```

---

## Complete Example

Here's a complete edge function using all utilities:

```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, addCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { validateQueryParams } from "../_shared/validation.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  // 1. Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) {
    return corsResponse;
  }

  // 2. Check rate limit (100 requests per 15 minutes)
  const rateLimitResult = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests from this IP, please try again later.",
  });

  if (!rateLimitResult.success) {
    return addCorsHeaders(rateLimitResult.response!);
  }

  try {
    const url = new URL(req.url);
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Validate query parameters
    const validation = validateQueryParams(url, {
      limit: { type: 'number', min: 1, max: 100, default: 20 },
      offset: { type: 'number', min: 0, default: 0 },
      search: { type: 'string', max: 200 },
      category: { type: 'string', max: 50 },
      status: { type: 'string', max: 20, default: 'active' },
    });

    if (!validation.success) {
      const errorResponse = new Response(
        JSON.stringify({
          error: 'Invalid parameters',
          details: validation.errors,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      return addRateLimitHeaders(addCorsHeaders(errorResponse), rateLimitResult);
    }

    const params = validation.data!;

    // 4. Build and execute query
    let query = supabase
      .from('items')
      .select('*', { count: 'exact' })
      .eq('status', params.status)
      .order('created_at', { ascending: false });

    if (params.search) {
      query = query.ilike('title', `%${params.search}%`);
    }

    if (params.category) {
      query = query.eq('category', params.category);
    }

    query = query.range(params.offset, params.offset + params.limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    // 5. Build response
    const response = new Response(
      JSON.stringify({
        data,
        pagination: {
          total: count || 0,
          limit: params.limit,
          offset: params.offset,
          hasMore: (params.offset + params.limit) < (count || 0),
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    // 6. Add headers and return
    return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);

  } catch (error) {
    console.error("Error in function:", error);

    const response = new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);
  }
});
```

---

## Migrating Existing Functions

### Step 1: Update imports

```typescript
// Add to top of file
import { serve } from "https://deno.land/std@0.200.0/http/server.ts"; // Updated version
import { handleCors, addCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { validateQueryParams } from "../_shared/validation.ts";
```

### Step 2: Replace CORS handling

**Before:**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "...",
};

if (req.method === "OPTIONS") {
  return new Response(null, { headers: corsHeaders });
}
```

**After:**
```typescript
const corsResponse = handleCors(req);
if (corsResponse) return corsResponse;
```

### Step 3: Add rate limiting

**After CORS check, add:**
```typescript
const rateLimitResult = checkRateLimit(req, {
  windowMs: 15 * 60 * 1000,
  max: 100,
});

if (!rateLimitResult.success) {
  return addCorsHeaders(rateLimitResult.response!);
}
```

### Step 4: Replace parameter parsing

**Before:**
```typescript
const limit = parseInt(searchParams.get("limit") || "20");
const offset = parseInt(searchParams.get("offset") || "0");
```

**After:**
```typescript
const validation = validateQueryParams(url, {
  limit: { type: 'number', min: 1, max: 100, default: 20 },
  offset: { type: 'number', min: 0, default: 0 },
});

if (!validation.success) {
  return errorResponse(validation.errors);
}

const params = validation.data!;
```

### Step 5: Update response headers

**Before:**
```typescript
return new Response(json, {
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
```

**After:**
```typescript
const response = new Response(json, {
  headers: { "Content-Type": "application/json" },
});

return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);
```

---

## Testing

### Test CORS

```bash
# Test preflight
curl -X OPTIONS http://localhost:54321/functions/v1/your-function \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST"

# Should return 204 with CORS headers
```

### Test Rate Limiting

```bash
# Make 101 requests quickly
for i in {1..101}; do
  curl http://localhost:54321/functions/v1/your-function
done

# 101st request should return 429
```

### Test Validation

```bash
# Invalid parameter (limit too high)
curl "http://localhost:54321/functions/v1/your-function?limit=1000"
# Should return 400 with error details

# Valid parameters
curl "http://localhost:54321/functions/v1/your-function?limit=50&offset=0"
# Should return 200
```

---

## Production Considerations

### Rate Limiting

For production, consider implementing persistent rate limiting:

1. **Upstash Redis:**
   ```typescript
   import { Redis } from "https://esm.sh/@upstash/redis";

   const redis = new Redis({
     url: Deno.env.get("UPSTASH_REDIS_URL")!,
     token: Deno.env.get("UPSTASH_REDIS_TOKEN")!,
   });
   ```

2. **Supabase Tables:**
   ```sql
   CREATE TABLE rate_limits (
     identifier TEXT PRIMARY KEY,
     count INTEGER DEFAULT 1,
     reset_time TIMESTAMP
   );
   ```

### CORS

Set environment variables in production:

```bash
supabase secrets set VITE_SITE_URL=https://your-domain.com
supabase secrets set ENVIRONMENT=production
```

### Monitoring

Add logging for:
- Rate limit violations
- Validation failures
- CORS violations
- Error rates

---

## FAQ

**Q: Do rate limits persist across function instances?**

A: No, the current implementation uses in-memory storage. For persistent rate limiting, use Redis or a database.

**Q: Can I customize rate limits per endpoint?**

A: Yes, pass different options to `checkRateLimit()` in each function.

**Q: How do I allow multiple domains in production?**

A: Modify `cors.ts` to check against a list of allowed domains instead of a single `VITE_SITE_URL`.

**Q: Can I exempt certain IPs from rate limiting?**

A: Yes, modify `rateLimit.ts` to check against an allow-list before counting requests.

---

**Last Updated:** 2025-01-06
