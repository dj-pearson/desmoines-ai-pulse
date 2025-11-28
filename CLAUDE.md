# CLAUDE.md - AI Assistant Development Guide

**Last Updated**: 2025-11-28
**Project**: Des Moines AI Pulse
**Purpose**: Comprehensive guide for AI assistants working on this codebase

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture & Project Structure](#architecture--project-structure)
4. [Database Schema](#database-schema)
5. [Development Workflows](#development-workflows)
6. [Key Conventions & Patterns](#key-conventions--patterns)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Process](#deployment-process)
9. [Common Tasks & Scripts](#common-tasks--scripts)
10. [Important Files & Locations](#important-files--locations)
11. [Code Quality Standards](#code-quality-standards)
12. [AI Assistant Guidelines](#ai-assistant-guidelines)

---

## Project Overview

**Des Moines AI Pulse** is a modern web platform showcasing Des Moines events, restaurants, attractions, and local insights powered by AI. The platform emphasizes mobile-first design, SEO optimization, and real-time data from multiple sources.

### Core Features
- Event discovery and calendar integration
- Restaurant listings with SEO optimization
- Attraction discovery with geolocation
- AI-powered content generation and enhancement
- **AI Trip Planner** with natural language itinerary building
- **Subscription system** (Free/Insider/VIP tiers) with premium gates
- Social features (favorites, ratings, reviews)
- Business partnership and advertising platform
- Admin dashboard with analytics
- Advanced search and filtering

### Target Users
- Local residents discovering events/restaurants
- Tourists planning visits to Des Moines
- Business owners advertising their venues
- Content administrators managing listings

---

## Technology Stack

### Frontend
- **Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite 5.4.1
- **Routing**: React Router DOM v6
- **UI Components**:
  - shadcn/ui (Radix UI primitives)
  - Tailwind CSS 3.4.11
  - Lucide React (icons)
- **State Management**:
  - TanStack Query v5 (server state)
  - React Context (UI state)
- **Forms**: React Hook Form + Zod validation
- **3D Graphics**: Three.js + React Three Fiber
- **Maps**: Leaflet + React Leaflet
- **Calendar**: FullCalendar
- **Charts**: Recharts

### Backend
- **Database**: PostgreSQL (via Supabase)
- **Authentication**: Supabase Auth
- **API**: Supabase Edge Functions (Deno)
- **File Storage**: Supabase Storage
- **Real-time**: Supabase Realtime subscriptions

### DevOps & Tools
- **Hosting**: Cloudflare Pages
- **CI/CD**: GitHub Actions
- **Testing**: Playwright (E2E, accessibility, performance)
- **Linting**: ESLint 9 (TypeScript ESLint)
- **Type Checking**: TypeScript 5.5.3
- **Package Manager**: npm

### Third-Party Integrations
- Google PageSpeed Insights API
- OpenAI / Anthropic (AI content generation)
- Web scraping (Puppeteer, custom crawlers)
- Email (Resend, SendGrid)
- Analytics tracking

---

## Architecture & Project Structure

### Directory Structure

```
desmoines-ai-pulse/
├── .github/
│   └── workflows/          # CI/CD workflows (ci.yml, playwright.yml, pr-checks.yml)
├── public/                 # Static assets
│   └── .well-known/        # OpenID, security.txt, etc.
├── scripts/                # Utility scripts (migrations, scrapers, timezone conversion)
├── src/
│   ├── components/         # React components
│   │   ├── ui/            # shadcn/ui base components
│   │   ├── admin/         # Admin-specific components
│   │   ├── advertising/   # Advertising components
│   │   ├── schema/        # Schema.org structured data
│   │   └── [feature]/     # Feature-specific components
│   ├── hooks/             # Custom React hooks (85+ hooks)
│   ├── contexts/          # React contexts (AuthContext, etc.)
│   ├── integrations/
│   │   └── supabase/      # Supabase client & types
│   ├── lib/               # Utility libraries
│   ├── pages/             # Route pages
│   ├── types/             # TypeScript type definitions
│   ├── App.tsx            # Main app with routing
│   ├── main.tsx           # Entry point
│   └── index.css          # Global styles + Tailwind
├── supabase/
│   ├── functions/         # Edge Functions (68 functions)
│   │   ├── _shared/       # Shared utilities (CORS, rate limiting, validation)
│   │   └── [function]/    # Individual edge functions
│   ├── migrations/        # SQL migration files (128 migrations)
│   └── config.toml        # Supabase configuration
├── tests/                 # Playwright tests (7 test suites)
├── docs/                  # Additional documentation
└── [config files]         # vite.config.ts, tailwind.config.ts, etc.
```

### Architecture Patterns

#### 1. **Component Architecture**
- **Atomic Design**: Components organized by feature/domain
- **shadcn/ui Pattern**: Composable, accessible UI primitives
- **Lazy Loading**: Heavy components loaded on-demand (3D, maps, etc.)

```typescript
// Example: Lazy loading pattern
const EventPromotionPlanner = lazy(() => import("./pages/EventPromotionPlanner"));

<Suspense fallback={<PageLoader />}>
  <EventPromotionPlanner />
</Suspense>
```

#### 2. **Data Flow**
- **Server State**: TanStack Query for API calls, caching, mutations
- **Client State**: React hooks + Context for UI state
- **Real-time**: Supabase subscriptions for live updates

```typescript
// Example: TanStack Query pattern
const { data, isLoading, error } = useQuery({
  queryKey: ['events', filters],
  queryFn: () => fetchEvents(filters),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

#### 3. **Authentication Architecture**
- **AuthContext**: Centralized auth state management via `AuthProvider`
- **Session Handling**: Automatic session refresh and admin role caching
- **Protected Routes**: `ProtectedRoute` component wraps admin pages
- **OAuth Support**: Google Sign-In with proper callback handling

```typescript
// AuthProvider wraps the entire app
import { AuthProvider } from "@/contexts/AuthContext";

<AuthProvider>
  <App />
</AuthProvider>

// Access auth state anywhere
const { user, isAuthenticated, isAdmin, login, logout } = useAuth();
```

#### 4. **Subscription & Premium Features**
- **Tiers**: Free, Insider, VIP with different feature limits
- **Premium Gate**: `PremiumGate` component controls access to premium features
- **Feature Limits**: Favorites, alerts, saved searches per tier

```typescript
// Gate premium content
import { PremiumGate } from "@/components/PremiumGate";

<PremiumGate feature="advanced_search" requiredTier="insider">
  <AdvancedSearchPanel />
</PremiumGate>

// Check subscription status
const { tier, isPremium, hasFeature } = useSubscription();
```

#### 5. **Routing Structure**
- **Public Routes**: /, /events, /restaurants, /attractions
- **Auth Routes**: /auth, /profile, /dashboard
- **Protected Routes**: /admin/* (requires admin role)
- **SEO Routes**: /events/today, /events/this-weekend, /restaurants/open-now
- **AI Features**: /trip-planner (AI-powered itinerary builder)
- **Legal Routes**: /privacy-policy, /terms
- **Dynamic Routes**: /events/:id, /restaurants/:id

#### 6. **Edge Functions Pattern**
- **Shared Middleware**: CORS, rate limiting, validation in `_shared/`
- **Environment-aware CORS**: Different origins for dev/staging/production
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Schema-based validation with detailed error messages

```typescript
// Example: Edge Function with middleware
import { corsHeaders } from '../_shared/cors.ts';
import { rateLimiter } from '../_shared/rateLimit.ts';
import { validateInput } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const rateLimit = await rateLimiter(req);
  if (!rateLimit.success) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Input validation
  const validation = await validateInput(req, schema);
  if (!validation.success) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Your logic here...
});
```

---

## Database Schema

### Core Tables

#### 1. **events** (Primary content table)
```sql
Key Columns:
- id: UUID (PK)
- title, description: TEXT
- date: TIMESTAMPTZ (with timezone support)
- location, venue, city: TEXT
- category: TEXT (General, Music, Food, etc.)
- price: TEXT
- image_url, source_url: TEXT
- is_featured, is_enhanced: BOOLEAN
- seo_title, seo_description, seo_keywords: TEXT/TEXT[]
- geo_summary, geo_key_facts, geo_faq: TEXT/TEXT[]/JSONB
- latitude, longitude: NUMERIC
- created_at, updated_at: TIMESTAMPTZ
```

#### 2. **restaurants** (Restaurant listings)
```sql
Key Columns:
- id: UUID (PK)
- name, cuisine, location, city: TEXT
- rating: DECIMAL(2,1)
- price_range: TEXT
- description: TEXT
- phone, website, image_url: TEXT
- hours: JSONB (opening hours by day)
- dietary_options: TEXT[] (vegan, gluten-free, etc.)
- seo_*, geo_*: (Same as events)
- latitude, longitude: NUMERIC
```

#### 3. **attractions** (Tourist attractions)
```sql
Key Columns:
- id: UUID (PK)
- name, description, location: TEXT
- category: TEXT (Museum, Park, etc.)
- hours, admission: TEXT
- website, image_url: TEXT
- seo_*, geo_*: (Same as events)
- latitude, longitude: NUMERIC
```

#### 4. **profiles** (User profiles)
```sql
Key Columns:
- id: UUID (FK to auth.users)
- username, full_name, avatar_url: TEXT
- role: TEXT (user, admin, business_owner)
- preferences: JSONB (theme, notifications, etc.)
- created_at, updated_at: TIMESTAMPTZ
```

#### 5. **favorites, ratings, reviews** (Social features)
- User interactions with events/restaurants/attractions
- Many-to-many relationships with junction tables

#### 6. **campaigns, advertisements** (Business features)
- Advertising campaigns and creatives
- Stripe integration for payments
- Analytics tracking

### Database Patterns

#### Row Level Security (RLS)
- All tables have RLS enabled
- Public read access for content tables
- Authenticated write access with role checks
- Admin-only access for sensitive operations

```sql
-- Example RLS policy
CREATE POLICY "Public read access" ON events
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create" ON events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can update" ON events
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'admin');
```

#### Triggers
- Auto-update `updated_at` timestamps
- Geocoding triggers for lat/lng calculation
- Full-text search index updates

#### Indexes
- `idx_events_date` - Event date queries
- `idx_events_category` - Category filtering
- `idx_restaurants_cuisine` - Cuisine filtering
- Full-text search indexes on descriptions

---

## Development Workflows

### 1. **Local Development Setup**

```bash
# Clone repository
git clone <repo-url>
cd desmoines-ai-pulse

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
npm run dev
# Visit http://localhost:8080

# In another terminal, run Supabase locally (optional)
supabase start
```

### 2. **Branch Strategy**
- `main` - Production branch (protected)
- `develop` - Development branch (protected)
- `feature/*` - Feature branches
- `fix/*` - Bug fix branches
- `docs/*` - Documentation branches
- `claude/*` - AI-generated branches (for PRs)

### 3. **Development Cycle**

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes and test locally
npm run dev

# 3. Run validation checks
npm run validate     # Lint + type check
npm test            # All tests

# 4. Commit changes
git add .
git commit -m "feat: add new feature"

# 5. Push to remote
git push -u origin feature/my-feature

# 6. Create PR via GitHub UI
```

### 4. **Working with Supabase**

```bash
# Link to Supabase project
supabase link --project-ref <project-ref>

# Pull remote schema
supabase db pull

# Create new migration
supabase migration new <migration-name>

# Apply migrations locally
supabase db reset

# Push migrations to remote
supabase db push

# Deploy edge functions
supabase functions deploy <function-name>

# Set secrets for edge functions
supabase secrets set KEY=value
```

---

## Key Conventions & Patterns

### 1. **TypeScript Patterns**

#### Type Safety
```typescript
// ✅ GOOD: Use proper types from Supabase
import { Database } from '@/integrations/supabase/types';
type Event = Database['public']['Tables']['events']['Row'];

// ❌ BAD: Using `any`
const event: any = data;
```

#### Strict Mode (Gradual Migration)
- Current: Relaxed mode (`strictNullChecks: false`)
- Goal: Migrate to strict mode file-by-file
- Add strict-compliant files to `tsconfig.strict.json`

```bash
# Check strict compliance
npm run type-check:strict
```

### 2. **React Patterns**

#### Component Structure
```typescript
// ✅ GOOD: Type props, use proper hooks
interface EventCardProps {
  event: Event;
  onFavorite?: (id: string) => void;
}

export function EventCard({ event, onFavorite }: EventCardProps) {
  const { data, isLoading } = useQuery({ /* ... */ });

  if (isLoading) return <Skeleton />;

  return (
    <Card>
      {/* Component content */}
    </Card>
  );
}
```

#### Custom Hooks Pattern
```typescript
// ✅ GOOD: Encapsulate logic in custom hooks
export function useEvents(filters?: EventFilters) {
  return useQuery({
    queryKey: ['events', filters],
    queryFn: () => fetchEvents(filters),
    staleTime: 5 * 60 * 1000,
  });
}

// Usage
const { data: events, isLoading } = useEvents({ category: 'Music' });
```

### 3. **Environment Variables**

```typescript
// ❌ WRONG - Breaks in Vite
if (process.env.NODE_ENV === 'development') { }

// ✅ CORRECT - Vite way
if (import.meta.env.DEV) { }
if (import.meta.env.PROD) { }
if (import.meta.env.MODE === 'development') { }

// Access custom variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
```

### 4. **localStorage Usage**

```typescript
// ❌ WRONG - Can crash in private mode
localStorage.setItem('key', 'value');

// ✅ CORRECT - Use safe storage wrapper
import { storage } from '@/lib/safeStorage';

storage.set('user-prefs', { theme: 'dark' });
const prefs = storage.get('user-prefs', { theme: 'light' });
```

### 5. **Error Handling**

```typescript
// ✅ GOOD: Use centralized error handler
import { handleError, withErrorHandling } from '@/lib/errorHandler';

try {
  await riskyOperation();
} catch (error) {
  handleError(error, {
    component: 'EventList',
    action: 'loadEvents',
    metadata: { filters }
  });
}

// For async operations with fallback
const events = await withErrorHandling(
  async () => await fetchEvents(),
  { component: 'EventList', action: 'fetch' },
  [] // fallback value
);
```

### 6. **Console Logging**

```typescript
// ❌ WRONG - Logs in production (stripped by build)
console.log('Debug info');

// ✅ CORRECT - Only log in development
if (import.meta.env.DEV) {
  console.log('Debug info');
}

// Note: console.* is automatically stripped in production builds
// See vite.config.ts: esbuild.drop: ['console', 'debugger']
```

### 7. **Naming Conventions**

```typescript
// Components: PascalCase
export function EventCard() { }

// Hooks: camelCase with 'use' prefix
export function useEvents() { }

// Utilities: camelCase
export function formatDate() { }

// Constants: UPPER_SNAKE_CASE
const API_BASE_URL = 'https://api.example.com';

// Types/Interfaces: PascalCase
interface EventCardProps { }
type EventFilter = { };
```

### 8. **File Organization**

```
src/components/
├── ui/                 # Base UI components (Button, Card, etc.)
├── [feature]/          # Feature-specific components
│   ├── FeatureMain.tsx
│   ├── FeatureList.tsx
│   └── FeatureCard.tsx
└── FeatureStandalone.tsx  # Top-level feature components

src/hooks/
├── use-[feature].ts    # Feature-specific hooks
└── use-[generic].ts    # Generic utility hooks

src/lib/
├── [utility].ts        # Utility functions
└── [service].ts        # Service integrations
```

---

## Testing Strategy

### Test Suites

1. **Accessibility Tests** (`tests/accessibility.spec.ts`)
   - WCAG 2.1 Level AA compliance
   - Keyboard navigation
   - Screen reader compatibility
   - Color contrast

2. **Mobile Responsive Tests** (`tests/mobile-responsive.spec.ts`)
   - Mobile viewports (iPhone, Pixel)
   - Touch interactions
   - Mobile navigation
   - Responsive layouts

3. **Performance Tests** (`tests/performance.spec.ts`)
   - Lighthouse scoring (target >90)
   - Core Web Vitals (LCP, FID, CLS)
   - Bundle size checks
   - Page load times

4. **Forms Tests** (`tests/forms.spec.ts`)
   - Form validation
   - Input handling
   - Error messages
   - Submission flows

5. **Search & Filters Tests** (`tests/search-filters.spec.ts`)
   - Search functionality
   - Filter combinations
   - Results accuracy
   - URL state sync

6. **Links & Buttons Tests** (`tests/links-and-buttons.spec.ts`)
   - Link validity
   - Button interactions
   - Navigation flows

7. **Visual Regression Tests** (`tests/visual-regression.spec.ts`)
   - Screenshot comparisons
   - Layout consistency
   - Theme switching

### Running Tests

```bash
# All tests
npm test

# Specific test suite
npm run test:a11y
npm run test:mobile
npm run test:performance

# Interactive UI mode
npm run test:ui

# Generate reports
npm run test:report

# Export test results
npm run test:export       # All formats
npm run test:export:md    # Markdown
npm run test:export:csv   # CSV
npm run test:export:json  # JSON
```

### Test Configuration

**File**: `playwright.config.ts`

```typescript
- Base URL: http://localhost:8082 (configurable via PLAYWRIGHT_TEST_BASE_URL)
- Browsers: Chromium, Firefox, WebKit (desktop + mobile)
- Timeout: 60s per test
- Retries: 2 on CI, 0 locally
- Workers: 1 on CI, 2 locally
- Screenshots: On failure
- Video: On failure
- Trace: On first retry
```

---

## Deployment Process

### 1. **Pre-Deployment Checklist**

```bash
# Run all validation checks
npm run validate      # Lint + type check
npm test              # All tests
npm run build         # Production build

# Check bundle size
npm run build:analyze

# Verify no critical issues
git status            # No uncommitted changes
```

### 2. **Deployment Targets**

#### Via Lovable (Recommended)
1. Open project: https://lovable.dev/projects/c6f56135-984a-4df0-b477-f9d3a03c55e7
2. Click Share → Publish
3. Changes auto-deployed to Cloudflare Pages

#### Via Cloudflare Pages (Manual)
1. Connect GitHub repository
2. Build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node version: 20
3. Environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SITE_URL`
   - (See `.env.example` for full list)
4. Deploy

### 3. **Database Migrations**

```bash
# Apply migrations to production
supabase db push

# Deploy edge functions
supabase functions deploy

# Set production secrets
supabase secrets set PAGESPEED_INSIGHTS_API_KEY=<key>
supabase secrets set OPENAI_API_KEY=<key>
# ... other secrets
```

### 4. **Post-Deployment Verification**

- [ ] Homepage loads correctly
- [ ] Navigation works
- [ ] Events/Restaurants/Attractions pages load
- [ ] Search functionality works
- [ ] Authentication flow works
- [ ] Admin panel accessible (for admins)
- [ ] No console errors
- [ ] Lighthouse score >90

### 5. **Rollback Procedure**

```bash
# Via Cloudflare Pages
# 1. Go to Deployments
# 2. Find previous working deployment
# 3. Click "Rollback to this deployment"

# Via Git (if needed)
git revert <commit-hash>
git push origin main
```

---

## Common Tasks & Scripts

### Development Scripts

```bash
# Development
npm run dev                 # Start dev server (http://localhost:8080)
npm run preview             # Preview production build

# Building
npm run build               # Production build
npm run build:dev           # Development build
npm run build:analyze       # Build with bundle analysis

# Code Quality
npm run lint                # Run ESLint
npm run lint:fix            # Auto-fix ESLint issues
npm run type-check          # Type check (relaxed mode)
npm run type-check:strict   # Type check (strict mode)
npm run validate            # Lint + type check (full validation)
npm run validate:strict     # Strict lint + type check

# Testing
npm test                    # Run all tests
npm run test:ui             # Interactive test UI
npm run test:headed         # Run tests in headed mode
npm run test:a11y           # Accessibility tests
npm run test:mobile         # Mobile responsive tests
npm run test:performance    # Performance tests
npm run test:forms          # Form tests
npm run test:search         # Search & filter tests
npm run test:links          # Link & button tests
npm run test:visual         # Visual regression tests
npm run test:report         # Show test report
npm run test:codegen        # Generate test code

# Database & Scripts
npm run migrate             # Run database migration
npm run crawl-events        # Crawl events (dry run)
npm run crawl-events:apply  # Crawl and apply events
npm run convert-timezones   # Convert timezones (dry run)
npm run convert-timezones:apply  # Convert and apply
```

### Utility Scripts (in `scripts/`)

```bash
# Event Management
tsx scripts/event-datetime-crawler.ts       # Crawl event datetimes
tsx scripts/convert-timezones.ts --apply    # Convert event timezones
tsx scripts/analyze-event-dates.ts          # Analyze event date quality
tsx scripts/find-platform-events.ts         # Find events by platform

# Database
tsx scripts/run-migration.ts                # Run custom migration
tsx scripts/backfill-coordinates.ts         # Backfill lat/lng coordinates

# SEO
node scripts/generate-sitemap.js            # Generate sitemap.xml

# Image Optimization
node scripts/optimize-images.mjs            # Optimize images
```

### Supabase Edge Functions (Common)

```
analyze-competitor          # Analyze competitor websites
calculate-trending          # Calculate trending content
check-restaurant-status     # Verify restaurant status
crawl-site                  # Crawl external sites
generate-article            # AI article generation
generate-seo-content        # SEO content generation
generate-sitemap            # Dynamic sitemap generation
geocode-location            # Geocode addresses
scrape-events               # Scrape events from sources
send-event-reminders        # Send event reminders
seo-audit                   # Run SEO audits
```

---

## Important Files & Locations

### Configuration Files

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite build configuration |
| `tsconfig.json` | TypeScript configuration (relaxed) |
| `tsconfig.strict.json` | TypeScript strict mode configuration |
| `tailwind.config.ts` | Tailwind CSS configuration |
| `eslint.config.js` | ESLint configuration |
| `playwright.config.ts` | Playwright test configuration |
| `postcss.config.js` | PostCSS configuration |
| `.env.example` | Environment variable template |
| `supabase/config.toml` | Supabase project configuration |

### Key Source Files

| File/Directory | Purpose |
|----------------|---------|
| `src/main.tsx` | Application entry point |
| `src/App.tsx` | Main app component with routing |
| `src/index.css` | Global styles + Tailwind directives |
| `src/contexts/AuthContext.tsx` | Centralized auth state management |
| `src/integrations/supabase/client.ts` | Supabase client setup |
| `src/integrations/supabase/types.ts` | Generated database types |
| `src/lib/errorHandler.ts` | Centralized error handling |
| `src/lib/safeStorage.ts` | Safe localStorage wrapper |
| `src/lib/utils.ts` | General utility functions |
| `src/components/ui/` | shadcn/ui base components |
| `src/components/PremiumGate.tsx` | Premium feature gating |
| `src/hooks/` | Custom React hooks (85+ hooks) |
| `src/hooks/useSubscription.ts` | Subscription tier management |
| `src/hooks/useTripPlanner.ts` | AI trip planning logic |

### Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Project overview and quick start |
| `CLAUDE.md` | This file - AI assistant guide |
| `DEVELOPER_GUIDE.md` | Detailed developer guide |
| `CONTRIBUTING.md` | Contribution guidelines |
| `DEPLOYMENT.md` | Deployment guide |
| `ENVIRONMENT_SETUP.md` | Environment configuration |
| `TESTING.md` | Testing documentation |
| `SUPABASE_DATABASE_STRUCTURE.md` | Database schema overview |
| `SEO_IMPLEMENTATION_GUIDE.md` | SEO features guide |

### CI/CD & Deployment

This project uses **Cloudflare Pages** for automated deployment:
- Automatic builds on push to main branch
- Preview deployments for pull requests
- Build command: `npm run build`
- Output directory: `dist`

For local CI-like validation, run:
```bash
npm run validate  # Lint + type check
npm test          # All Playwright tests
npm run build     # Production build
```

---

## Code Quality Standards

### ESLint Rules

```javascript
// Key rules (from eslint.config.js)
{
  "@typescript-eslint/no-unused-vars": "warn" (with _ ignore pattern),
  "react-refresh/only-export-components": "warn",
  "react-hooks": recommended rules
}
```

### TypeScript Strictness

**Current State**: Relaxed mode
- `noImplicitAny: false`
- `strictNullChecks: false`
- `noUnusedLocals: false`
- `noUnusedParameters: false`

**Goal**: Gradual migration to strict mode
- Add files to `tsconfig.strict.json` as they become compliant
- Run `npm run type-check:strict` to verify

### Code Style

#### Formatting
- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Single quotes for strings (enforced by ESLint)
- **Semicolons**: Yes (enforced by ESLint)
- **Line Length**: ~100 characters (soft limit)

#### React Patterns
- **Function Components**: Prefer function components over class components
- **Hooks**: Use hooks for state and side effects
- **Props**: Type all props with TypeScript interfaces
- **Exports**: Named exports preferred over default exports (except for pages)

```typescript
// ✅ GOOD
export function EventCard({ event }: EventCardProps) { }

// ❌ BAD
export default ({ event }: any) => { }
```

#### Import Order
```typescript
// 1. External dependencies
import React from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Internal components
import { Button } from '@/components/ui/button';
import { EventCard } from '@/components/EventCard';

// 3. Hooks
import { useEvents } from '@/hooks/useEvents';

// 4. Utilities
import { formatDate } from '@/lib/utils';

// 5. Types
import type { Event } from '@/integrations/supabase/types';

// 6. Styles (if any)
import './styles.css';
```

### Performance Standards

#### Bundle Size
- **Target**: <500KB gzipped
- **Critical Path**: <200KB initial load
- **Check**: `npm run build:analyze`

#### Core Web Vitals
- **LCP** (Largest Contentful Paint): <2.5s
- **FID** (First Input Delay): <100ms
- **CLS** (Cumulative Layout Shift): <0.1

#### Lighthouse Score
- **Target**: >90 for all categories
- **Run**: `npm run test:performance`

### Accessibility Standards

- **WCAG 2.1 Level AA** compliance
- **Keyboard navigation**: All interactive elements accessible
- **Screen readers**: Proper ARIA labels and roles
- **Color contrast**: Minimum 4.5:1 for normal text
- **Focus indicators**: Visible focus states

---

## AI Assistant Guidelines

### When Working on This Codebase

#### 1. **Always Start With**
- Read this file (`CLAUDE.md`) for context
- Check `README.md` for latest project state
- Review `DEVELOPER_GUIDE.md` for specific patterns
- Look at existing similar components before creating new ones

#### 2. **Before Making Changes**
- Understand the feature's purpose and user impact
- Check for existing implementations of similar features
- Review related tests to understand expected behavior
- Identify dependencies and potential breaking changes

#### 3. **When Creating New Features**
- Follow existing patterns (see similar components/hooks)
- Use TypeScript with proper types (avoid `any`)
- Create reusable hooks for shared logic
- Add error handling with `@/lib/errorHandler`
- Consider mobile-first design
- Add Playwright tests for critical paths
- Update relevant documentation

#### 4. **When Fixing Bugs**
- Reproduce the bug first
- Identify root cause (not just symptoms)
- Check if the fix breaks other features
- Add tests to prevent regression
- Update comments/docs if behavior changed

#### 5. **Code Review Checklist**
- [ ] TypeScript: No `any` types, proper interfaces
- [ ] React: Hooks used correctly, no memory leaks
- [ ] Performance: Lazy loading, memoization where needed
- [ ] Accessibility: Keyboard nav, ARIA labels, semantic HTML
- [ ] Mobile: Responsive design, touch-friendly
- [ ] Error Handling: Try-catch blocks, user-friendly messages
- [ ] Testing: Unit/integration tests added
- [ ] Documentation: Comments for complex logic, updated docs
- [ ] Security: No XSS, no secrets in code, proper validation
- [ ] SEO: Meta tags, structured data, semantic HTML

#### 6. **Common Pitfalls to Avoid**

```typescript
// ❌ DON'T: Use process.env in Vite
if (process.env.NODE_ENV === 'development') { }

// ✅ DO: Use import.meta.env
if (import.meta.env.DEV) { }

// ❌ DON'T: Use localStorage directly
localStorage.setItem('key', 'value');

// ✅ DO: Use safe storage wrapper
import { storage } from '@/lib/safeStorage';
storage.set('key', value);

// ❌ DON'T: Ignore errors
try { await fetch() } catch (e) { }

// ✅ DO: Handle errors properly
try {
  await fetch()
} catch (error) {
  handleError(error, { component: 'X', action: 'Y' });
}

// ❌ DON'T: Create huge components
function MassiveComponent() { /* 1000 lines */ }

// ✅ DO: Break down into smaller components
function FeatureMain() {
  return (
    <>
      <FeatureHeader />
      <FeatureList />
      <FeatureFooter />
    </>
  );
}
```

#### 7. **When to Use What**

| Need | Use |
|------|-----|
| UI Component | shadcn/ui components from `@/components/ui` |
| Data Fetching | TanStack Query with custom hooks |
| Form Handling | React Hook Form + Zod |
| State Management | React hooks + Context (avoid Redux) |
| Authentication | `useAuth()` from `@/contexts/AuthContext` |
| Premium Features | `PremiumGate` + `useSubscription()` |
| Styling | Tailwind CSS (utility classes) |
| Icons | Lucide React |
| Date/Time | date-fns or date-fns-tz |
| API Calls | Supabase client or Edge Functions |
| Error Handling | `@/lib/errorHandler` |
| Storage | `@/lib/safeStorage` |
| Sharing | `ShareDialog` component |
| Navigation UX | `BackToTop` component |
| Routing | React Router DOM |
| Testing | Playwright (E2E, a11y, performance) |

#### 8. **Git Commit Messages**

Follow conventional commits:

```
feat: add event favoriting feature
fix: resolve mobile menu not closing
docs: update API documentation
style: format code with prettier
refactor: simplify event filtering logic
test: add tests for search functionality
chore: update dependencies
perf: optimize image loading
```

#### 9. **Pull Request Guidelines**

**PR Title**: Clear, descriptive, follows conventional commits
**PR Description**: Include:
- What changed and why
- How to test
- Screenshots (for UI changes)
- Breaking changes (if any)
- Related issues

**Before Submitting**:
```bash
npm run validate  # Lint + type check
npm test          # All tests pass
npm run build     # Build succeeds
```

#### 10. **Getting Help**

When stuck:
1. Search existing issues on GitHub
2. Check documentation files (this file, README, DEVELOPER_GUIDE)
3. Look for similar implementations in the codebase
4. Review Supabase/shadcn docs for component usage
5. Check Playwright docs for test patterns

---

## Quick Reference

### Most Common Commands

```bash
# Development
npm run dev              # Start dev server
npm run validate         # Lint + type check
npm test                 # Run all tests

# Building
npm run build            # Production build
npm run build:analyze    # Analyze bundle

# Database
supabase db push         # Apply migrations
supabase functions deploy <name>  # Deploy edge function

# Testing
npm run test:a11y        # Accessibility tests
npm run test:mobile      # Mobile tests
```

### Most Important Files

```
src/App.tsx              # Main routing
src/integrations/supabase/types.ts  # Database types
src/lib/errorHandler.ts  # Error handling
src/lib/safeStorage.ts   # Safe localStorage
vite.config.ts           # Build config
```

### Most Used Hooks

```typescript
useEvents()              # Fetch events
useRestaurants()         # Fetch restaurants
useAuth()                # Authentication (from AuthContext)
useSubscription()        # Subscription tier & premium checks
useTripPlanner()         # AI-powered trip planning
useFavorites()           # User favorites
useQuery()               # TanStack Query
```

### Environment Variables (Most Critical)

```
VITE_SUPABASE_URL        # Supabase project URL
VITE_SUPABASE_ANON_KEY   # Supabase anonymous key
VITE_SITE_URL            # Site URL (for SEO, redirects)
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | 2025-11-28 | Added AuthContext, subscription system, AI Trip Planner docs; updated counts (85+ hooks, 68 edge functions, 128 migrations) |
| 1.0 | 2025-11-16 | Initial comprehensive documentation |

---

## Feedback & Improvements

This document is a living guide. If you (AI assistant or human developer) find:
- Missing information
- Outdated patterns
- Unclear explanations
- Better approaches

Please update this file or create an issue with suggestions.

---

**Remember**: The goal is to ship high-quality, accessible, performant features that delight users. When in doubt, prioritize user experience, accessibility, and maintainability over clever code.

Happy coding! 🚀
