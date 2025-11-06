# Developer Guide - Des Moines AI Pulse

This guide covers development best practices, new utilities, and patterns for contributing to this project.

## Table of Contents

- [Quick Start](#quick-start)
- [New Utilities](#new-utilities)
- [Best Practices](#best-practices)
- [Edge Functions](#edge-functions)
- [Type Safety](#type-safety)
- [Error Handling](#error-handling)
- [Performance](#performance)
- [Security](#security)
- [Testing](#testing)

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run type checking
npm run type-check

# Run linting
npm run lint

# Run all tests
npm test

# Build for production
npm run build

# Analyze bundle size
npm run build:analyze
```

---

## New Utilities

### Safe Storage

**File:** `src/lib/safeStorage.ts`

A localStorage wrapper that gracefully handles failures and falls back to in-memory storage.

```typescript
import { storage } from '@/lib/safeStorage';

// Store typed data
interface UserPrefs {
  theme: 'light' | 'dark';
  language: string;
}

storage.set<UserPrefs>('user-prefs', { theme: 'dark', language: 'en' });

// Retrieve with defaults
const prefs = storage.get<UserPrefs>('user-prefs', {
  theme: 'light',
  language: 'en'
});

// Store strings
storage.setString('last-visit', new Date().toISOString());

// Retrieve strings
const lastVisit = storage.getString('last-visit', '');

// Check if available
if (storage.isAvailable()) {
  console.log('localStorage is working');
}
```

**When to use:**
- ✅ Storing user preferences
- ✅ Caching API responses
- ✅ Session data
- ❌ Sensitive data (use secure cookies instead)

---

### Error Handler

**File:** `src/lib/errorHandler.ts`

Centralized error handling with consistent user feedback and logging.

```typescript
import {
  handleError,
  withErrorHandling,
  createComponentErrorHandler,
  ErrorSeverity
} from '@/lib/errorHandler';

// Basic error handling
try {
  await riskyOperation();
} catch (error) {
  handleError(error, {
    component: 'UserProfile',
    action: 'updateProfile',
    metadata: { userId: user.id }
  });
}

// Async operation with automatic error handling
const result = await withErrorHandling(
  async () => await fetchUserData(),
  { component: 'UserProfile', action: 'fetchData' },
  [] // fallback value
);

// Component-specific error handler
const handleComponentError = createComponentErrorHandler('EventList');

try {
  await loadEvents();
} catch (error) {
  handleComponentError(error, 'loadEvents', { filters });
}

// Different severity levels
handleError(error, context, ErrorSeverity.WARNING);
handleError(error, context, ErrorSeverity.CRITICAL);
```

**User-facing messages are automatically generated** based on error type:
- Network errors → "Connection issue. Please check your internet..."
- Auth errors → "Please sign in to continue."
- Permission errors → "You don't have permission..."
- Rate limit errors → "Too many requests. Please wait..."

---

## Best Practices

### Environment Variables

**❌ WRONG (breaks in Vite):**
```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('Debug info');
}
```

**✅ CORRECT:**
```typescript
if (import.meta.env.DEV) {
  console.log('Debug info');
}

// Also available:
// import.meta.env.PROD - true in production
// import.meta.env.MODE - 'development' or 'production'
// import.meta.env.VITE_* - custom variables from .env
```

### Console Logging

Always wrap console statements in development checks:

```typescript
// ❌ WRONG - logs in production
console.log('User data:', userData);

// ✅ CORRECT
if (import.meta.env.DEV) {
  console.log('User data:', userData);
}

// Better: Use the error handler
import { logDebug } from '@/lib/errorHandler';
logDebug('User data loaded', userData);
```

### localStorage Usage

**❌ WRONG - can crash in private mode:**
```typescript
localStorage.setItem('key', 'value');
```

**✅ CORRECT:**
```typescript
import { storage } from '@/lib/safeStorage';
storage.setString('key', 'value');
```

---

## Edge Functions

### Security Middleware

All edge functions should use the security middleware:

```typescript
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, addCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { validateQueryParams } from "../_shared/validation.ts";

serve(async (req) => {
  // 1. Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // 2. Check rate limit
  const rateLimitResult = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests
  });

  if (!rateLimitResult.success) {
    return addCorsHeaders(rateLimitResult.response!);
  }

  try {
    const url = new URL(req.url);

    // 3. Validate input
    const validation = validateQueryParams(url, {
      limit: { type: 'number', min: 1, max: 100, default: 20 },
      offset: { type: 'number', min: 0, default: 0 },
      search: { type: 'string', max: 200 },
      email: { type: 'email', required: true },
    });

    if (!validation.success) {
      const errorResponse = new Response(
        JSON.stringify({
          error: 'Invalid parameters',
          details: validation.errors
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
      return addRateLimitHeaders(addCorsHeaders(errorResponse), rateLimitResult);
    }

    // 4. Process request
    const params = validation.data!;
    // ... your logic here ...

    const response = new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

    // 5. Add headers and return
    return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);

  } catch (error) {
    console.error("Error:", error);
    const response = new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error"
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
    return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);
  }
});
```

### Validation Schemas

Available validation types:

```typescript
{
  // String validation
  fieldName: {
    type: 'string',
    required: true,
    min: 3,          // minimum length
    max: 100,        // maximum length
    pattern: /^[a-z]+$/i,  // regex pattern
    default: 'value'
  },

  // Number validation
  age: {
    type: 'number',
    min: 0,
    max: 120,
    default: 18
  },

  // Boolean validation
  isActive: {
    type: 'boolean',
    default: false
  },

  // Email validation
  email: {
    type: 'email',
    required: true
  },

  // URL validation
  website: {
    type: 'url',
    max: 2048
  }
}
```

### CORS Configuration

CORS is automatically configured based on environment:

**Development:**
- Allows all origins (`*`)
- Allows localhost and Lovable.dev

**Production:**
- Restricts to configured domain (`VITE_SITE_URL`)
- Automatically allows Lovable preview domains

**To set production domain:**
```bash
# In your .env file
VITE_SITE_URL=https://desmoinesinsider.com

# In Supabase secrets
supabase secrets set VITE_SITE_URL=https://desmoinesinsider.com
supabase secrets set ENVIRONMENT=production
```

---

## Type Safety

### Gradual Strict Mode Adoption

We provide a strict TypeScript configuration for gradually improving type safety:

```bash
# Check current code (relaxed mode)
npm run type-check

# Check with strict mode
npm run type-check:strict
```

**To enable strict mode for a file:**

1. Fix all type errors in the file
2. Add the file to `tsconfig.strict.json`:

```json
{
  "include": [
    "src/lib/safeStorage.ts",
    "src/lib/errorHandler.ts",
    "src/components/NewComponent.tsx"
  ]
}
```

3. Run `npm run type-check:strict` to verify

**Strict mode benefits:**
- ✅ Catches null/undefined errors
- ✅ Prevents implicit any types
- ✅ Better IDE autocomplete
- ✅ Safer refactoring

---

## Error Handling

### Component Error Boundaries

Use the built-in error boundary:

```typescript
import { ErrorBoundary } from '@/components/ui/error-boundary';

function App() {
  return (
    <ErrorBoundary>
      <MyComponent />
    </ErrorBoundary>
  );
}
```

### Async Error Handling

```typescript
import { withErrorHandling } from '@/lib/errorHandler';

// Wrap async operations
const data = await withErrorHandling(
  () => fetchData(),
  { component: 'DataView', action: 'fetch' },
  [] // fallback
);

// Wrap functions
const safeHandler = withErrorBoundary(
  async (id: string) => await deleteItem(id),
  { component: 'ItemList', action: 'delete' }
);
```

---

## Performance

### Bundle Analysis

Analyze bundle size to identify large dependencies:

```bash
npm run build:analyze
```

This generates `dist/stats.html` showing:
- File sizes (original and gzipped)
- Dependency tree
- Largest modules

**Optimization tips:**
- Lazy load heavy libraries (Three.js, charts)
- Use dynamic imports for conditional code
- Check for duplicate dependencies

### Lazy Loading

Components:

```typescript
import { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <HeavyComponent />
    </Suspense>
  );
}
```

Libraries:

```typescript
// Lazy load Three.js only when needed
const loadThreeJS = async () => {
  const THREE = await import('three');
  return THREE;
};
```

### Sourcemaps

Sourcemaps are configured for optimal debugging:

- **Development:** Full sourcemaps included
- **Production:** Hidden sourcemaps generated (for error tracking)

**To use production sourcemaps:**
1. Upload `dist/**/*.map` files to your error tracking service (Sentry, etc.)
2. Don't deploy .map files publicly

---

## Security

### Input Validation

Always validate user input:

```typescript
import { ValidationSchemas } from '@/lib/security';
import { z } from 'zod';

// Use built-in schemas
const emailSchema = ValidationSchemas.email;
const result = emailSchema.safeParse(userInput);

if (!result.success) {
  console.error('Invalid email:', result.error);
}

// Custom validation
const userSchema = z.object({
  email: ValidationSchemas.email,
  age: ValidationSchemas.positiveNumber,
  website: ValidationSchemas.url.optional(),
});
```

### XSS Prevention

Use DOMPurify for user-generated HTML:

```typescript
import { SecurityUtils } from '@/lib/security';

const dirtyHTML = '<script>alert("XSS")</script><p>Safe content</p>';
const cleanHTML = SecurityUtils.sanitizeHTML(dirtyHTML);
// Result: '<p>Safe content</p>'
```

### Rate Limiting

Client-side rate limiting (for UX):

```typescript
import { SecurityUtils } from '@/lib/security';

const result = SecurityUtils.checkRateLimit(
  'api-calls',
  10,  // max requests
  60000 // per minute
);

if (!result.allowed) {
  console.log(`Rate limited. Try again in ${result.resetTime}ms`);
}
```

---

## Testing

### Running Tests

```bash
# All tests
npm test

# Specific test suites
npm run test:a11y          # Accessibility
npm run test:mobile        # Mobile responsive
npm run test:performance   # Core Web Vitals
npm run test:forms         # Form validation

# Interactive mode
npm run test:ui

# With visual output
npm run test:headed
```

### Writing Tests

Playwright tests should follow this pattern:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/');

    // Arrange
    const button = page.getByRole('button', { name: 'Submit' });

    // Act
    await button.click();

    // Assert
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

---

## Scripts Reference

```bash
# Development
npm run dev                 # Start dev server
npm run preview             # Preview production build

# Building
npm run build               # Production build
npm run build:dev           # Development build
npm run build:analyze       # Build with bundle analysis

# Code Quality
npm run lint                # Run ESLint
npm run lint:fix            # Auto-fix ESLint issues
npm run type-check          # Type check
npm run type-check:strict   # Strict type check
npm run validate            # Lint + type check

# Testing
npm test                    # Run all tests
npm run test:ui             # Interactive test UI
npm run test:a11y           # Accessibility tests
npm run test:mobile         # Mobile tests
npm run test:performance    # Performance tests

# Database
npm run migrate             # Run migrations
npm run crawl-events        # Crawl events (dry run)
npm run crawl-events:apply  # Apply event changes
```

---

## Git Workflow

1. Create feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make changes and commit:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. Run validation before pushing:
   ```bash
   npm run validate
   npm test
   ```

4. Push and create pull request:
   ```bash
   git push -u origin feature/my-feature
   ```

---

## Need Help?

- Check the [README.md](./README.md) for project overview
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines
- Review examples in `supabase/functions/api-*/index.improved.ts`
- Check existing components for patterns

---

**Last Updated:** 2025-01-06
