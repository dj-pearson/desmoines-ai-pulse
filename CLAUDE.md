# CLAUDE.md - AI Assistant Development Guide

**Project**: Des Moines AI Pulse — modern web platform for Des Moines events, restaurants, and attractions, powered by AI.

## Tech Stack

- **Frontend**: React 18 + TypeScript, Vite 5, React Router v6, TanStack Query v5, React Hook Form + Zod
- **UI**: shadcn/ui (Radix), Tailwind CSS 3, Lucide icons; Three.js, Leaflet, FullCalendar, Recharts
- **Backend**: Supabase (Postgres, Auth, Storage, Realtime, Edge Functions on Deno)
- **Hosting/CI**: Cloudflare Pages, GitHub Actions
- **Testing**: Playwright (E2E, a11y, performance)
- **Tooling**: ESLint 9, TypeScript 5.5, npm
- **Integrations**: Stripe (subscriptions/campaigns), OpenAI/Anthropic, Resend/SendGrid, Puppeteer

## Project Structure

```
src/
├── components/        # React components (ui/ for shadcn primitives)
├── hooks/             # 101 custom hooks
├── contexts/          # AuthContext, etc.
├── integrations/supabase/  # Client + generated types
├── lib/               # Utilities (errorHandler, safeStorage, utils)
├── pages/             # Route pages
└── App.tsx            # Routing entry
supabase/
├── functions/         # 73 Edge Functions (_shared/ for CORS, rate limiting, validation)
└── migrations/        # 142 SQL migrations
tests/                 # Playwright suites
scripts/               # Utility scripts
```

## Architecture Patterns

### Data Flow
- **Server state**: TanStack Query with custom hooks (`useEvents`, `useRestaurants`, etc.)
- **Client state**: React hooks + Context
- **Real-time**: Supabase subscriptions

```typescript
const { data, isLoading } = useQuery({
  queryKey: ['events', filters],
  queryFn: () => fetchEvents(filters),
  staleTime: 5 * 60 * 1000,
});
```

### Authentication
Centralized via `AuthProvider` (`src/contexts/AuthContext.tsx`). Use `useAuth()` for `{ user, isAuthenticated, isAdmin, login, logout }`. Wrap admin pages in `<ProtectedRoute>`. Google OAuth supported.

### Subscription Tiers
Free / Insider / VIP. Gate premium content with `<PremiumGate feature="..." requiredTier="insider">`. Check status with `useSubscription()` → `{ tier, isPremium, hasFeature }`.

### Edge Functions
Use shared middleware from `supabase/functions/_shared/`:
- `corsHeaders` — environment-aware CORS
- `rateLimiter` — 100 req / 15 min per IP
- `validateInput` — schema validation

Always handle `OPTIONS` preflight, rate-limit, then validate before logic.

### Routing
- Public: `/`, `/events`, `/restaurants`, `/attractions`
- SEO landings: `/events/today`, `/restaurants/open-now`, etc.
- AI: `/trip-planner`
- Auth: `/auth`, `/profile`, `/dashboard`
- Protected: `/admin/*` (admin role)
- Dynamic: `/events/:id`, `/restaurants/:id`

Use lazy loading for heavy pages:
```typescript
const Page = lazy(() => import("./pages/Page"));
<Suspense fallback={<PageLoader />}><Page /></Suspense>
```

## Database

Core tables: `events`, `restaurants`, `attractions`, `profiles`, `favorites`, `ratings`, `reviews`, `campaigns`, `advertisements`.

Common columns across content tables: `id` (UUID PK), `name`/`title`, `description`, `category`, `image_url`, SEO fields (`seo_title`, `seo_description`, `seo_keywords`), GEO fields (`geo_summary`, `geo_key_facts`, `geo_faq`), `latitude`, `longitude`, `created_at`, `updated_at`.

**RLS is enabled on all tables.** Pattern: public read, authenticated write with role checks, admin-only for sensitive ops. Auto-update `updated_at` via triggers; geocoding triggers maintain lat/lng.

Generated types live in `src/integrations/supabase/types.ts`:
```typescript
type Event = Database['public']['Tables']['events']['Row'];
```

## Conventions

### TypeScript
- Avoid `any`; use generated Supabase types
- Current config is relaxed (`strictNullChecks: false`); add compliant files to `tsconfig.strict.json` and verify with `npm run type-check:strict`

### React
- Function components only; type all props with interfaces
- Named exports preferred (default exports for pages only)
- Encapsulate logic in custom hooks (`use-*` naming)
- Break down large components

### Vite Environment
```typescript
// ❌ process.env.NODE_ENV
// ✅ import.meta.env.DEV / .PROD / .MODE
const url = import.meta.env.VITE_SUPABASE_URL;
```

### Storage
```typescript
// ❌ localStorage.setItem(...) — crashes in private mode
// ✅
import { storage } from '@/lib/safeStorage';
storage.set('key', value);
storage.get('key', defaultValue);
```

### Error Handling
```typescript
import { handleError, withErrorHandling } from '@/lib/errorHandler';

try { await op(); }
catch (error) { handleError(error, { component: 'X', action: 'Y' }); }

const data = await withErrorHandling(
  async () => await fetch(),
  { component: 'X', action: 'fetch' },
  fallbackValue
);
```

### Logging
`console.*` is stripped in production (`vite.config.ts` → `esbuild.drop`). Wrap dev logs in `if (import.meta.env.DEV)`.

### Naming
- Components: `PascalCase`
- Hooks/utils: `camelCase` (hooks prefixed `use`)
- Constants: `UPPER_SNAKE_CASE`
- Types/interfaces: `PascalCase`

### Imports (order)
External → internal components → hooks → utilities → types → styles.

## Testing

Playwright suites in `tests/`:
- `accessibility.spec.ts` — WCAG 2.1 AA
- `mobile-responsive.spec.ts` — iPhone, Pixel viewports
- `performance.spec.ts` — Lighthouse >90, Core Web Vitals
- `forms.spec.ts`, `search-filters.spec.ts`, `links-and-buttons.spec.ts`, `visual-regression.spec.ts`

Config (`playwright.config.ts`): base URL `http://localhost:8082`, Chromium/Firefox/WebKit (desktop + mobile), 60s timeout, 2 retries on CI.

```bash
npm test                  # All tests
npm run test:a11y         # Accessibility
npm run test:mobile       # Mobile responsive
npm run test:performance  # Performance
npm run test:ui           # Interactive UI
```

## Common Commands

```bash
# Development
npm run dev                 # http://localhost:8080
npm run validate            # lint + type-check
npm run validate:strict     # strict variant
npm test                    # all Playwright tests

# Build
npm run build               # production
npm run build:analyze       # bundle analysis

# Database
supabase db push                      # apply migrations
supabase migration new <name>         # new migration
supabase functions deploy <name>      # deploy edge function
supabase secrets set KEY=value        # set secret

# Scripts (in scripts/)
npm run crawl-events:apply            # crawl + apply events
npm run convert-timezones:apply       # convert event timezones
tsx scripts/backfill-coordinates.ts   # backfill lat/lng
node scripts/generate-sitemap.js
```

## Branch & Commit Strategy

- `main` — production (protected)
- `develop` — development (protected)
- `feature/*`, `fix/*`, `docs/*` — work branches
- `claude/*` — AI-generated branches

Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`.

## Deployment

**Cloudflare Pages** auto-deploys on push to `main`. Build command `npm run build`, output `dist`, Node 20.

Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL` (see `.env.example`).

Pre-deploy: `npm run validate && npm test && npm run build`. Rollback via Cloudflare Pages "Rollback to this deployment".

## Quality Standards

- **Bundle**: <500KB gzipped target, <200KB critical path
- **Core Web Vitals**: LCP <2.5s, FID <100ms, CLS <0.1
- **Lighthouse**: >90 all categories
- **A11y**: WCAG 2.1 AA, keyboard nav, ARIA labels, 4.5:1 contrast
- **Mobile-first**: design for touch targets first

## When to Use What

| Need | Use |
|------|-----|
| UI primitive | `@/components/ui` (shadcn) |
| Data fetching | TanStack Query in custom hook |
| Forms | React Hook Form + Zod |
| Auth | `useAuth()` from `AuthContext` |
| Premium gates | `PremiumGate` + `useSubscription()` |
| Styling | Tailwind utility classes |
| Icons | Lucide React |
| Dates | date-fns / date-fns-tz |
| Errors | `@/lib/errorHandler` |
| Storage | `@/lib/safeStorage` |
| API | Supabase client or Edge Functions |

## Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Routing |
| `src/contexts/AuthContext.tsx` | Auth state |
| `src/integrations/supabase/client.ts` | Supabase client |
| `src/integrations/supabase/types.ts` | Generated DB types |
| `src/lib/errorHandler.ts` | Centralized errors |
| `src/lib/safeStorage.ts` | Safe localStorage |
| `src/components/PremiumGate.tsx` | Premium gating |
| `src/hooks/useSubscription.ts` | Tier checks |
| `src/hooks/useTripPlanner.ts` | AI itinerary |
| `vite.config.ts` | Build config |
| `playwright.config.ts` | Test config |
| `supabase/config.toml` | Supabase config |

## AI Assistant Guidelines

**Before changes**: read this file, check for existing similar implementations, review related tests.

**When adding features**: follow existing patterns, type strictly, extract reusable hooks, add error handling, design mobile-first, add Playwright tests for critical paths.

**When fixing bugs**: reproduce first, fix root cause not symptoms, add regression tests.

**Common pitfalls**:
- Don't use `process.env.NODE_ENV` (use `import.meta.env.DEV`)
- Don't call `localStorage` directly (use `storage` wrapper)
- Don't swallow errors (use `handleError`)
- Don't write 1000-line components (decompose)
- Don't introduce `any` types

**Review checklist**: types, hooks correctness, lazy loading where heavy, a11y, mobile, error handling, tests, security (no XSS/secrets), SEO (meta + structured data).

## Related Docs

`README.md`, `DEVELOPER_GUIDE.md`, `CONTRIBUTING.md`, `DEPLOYMENT.md`, `ENVIRONMENT_SETUP.md`, `TESTING.md`, `SUPABASE_DATABASE_STRUCTURE.md`, `SEO_IMPLEMENTATION_GUIDE.md`.

---

**Last Updated**: 2026-04-28 — refined for conciseness. Update this file when patterns shift.
