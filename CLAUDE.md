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

Core tables: `events`, `restaurants`, `attractions`, `profiles`, `campaigns`.

**Do not assume a table exists because it is named in this file or in `types.ts`.** Probed against production 2026-08-11: `favorites`, `ratings`, `reviews` and `advertisements` were listed here as core tables and all four return `42P01 (relation does not exist)`. They have been removed from the list above. This is not a documentation nit — code was written against them, it type-checks, and it fails only at runtime as an empty state (WEB-QA-017 tracks 179 such references, of which a production probe confirmed 45 missing tables and 32 missing columns, with zero false positives).

To check a table before you write against it, ask PostgREST rather than reading the generated types — the types can be stale, and absence there is not proof:

```bash
curl -s -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  "$VITE_SUPABASE_URL/rest/v1/<table>?select=*&limit=1"
# 42P01 = no such table, 42703 = no such column, [] = exists (RLS may hide rows)
```

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

## Critical Rules

These override anything else in this file. Read before doing work.

### Branch first, code second

Before writing or pushing code on any non-trivial task, **confirm the target branch with the user**. Map the request phrasing to a branch type:

| Phrase the user used | Target branch | Branched from |
|---|---|---|
| "production bug", "live site is broken", "users are seeing X right now", "hotfix" | `hotfix/<short-slug>` | `main` |
| "new feature", "add", "build", "let's prototype", "experimental" | `claude/<slug>` or `feat/<slug>` | `develop` |
| "release prep", "cut a release", "ship v1.4", "submit to App Store" | `release/x.y.z` | `develop` |
| "fix on develop", "fix the staging bug", "in-flight feature is broken" | `fix/<slug>` (off `develop`) | `develop` |
| "docs", "update README", "tweak CLAUDE.md" | `docs/<slug>` | `develop` (or `main` if it's a hotfix-style doc correction) |
| "chore", "bump deps", "rename folder" | `chore/<slug>` | `develop` |

If ambiguous (e.g. "fix the events page" — is it broken in prod, or only on develop?), **ask** before branching. Never assume.

### Never do these (rulesets will block, but don't try)

- Force-push to `main`, `develop`, `release/*`, or `hotfix/*`.
- Delete `main`, `develop`, `release/*`, or `hotfix/*`.
- Commit directly to `main` or `develop` — always via PR.
- Merge `develop` straight to `main` — releases go through `release/x.y.z` (or `hotfix/*` for emergencies).
- Skip pre-commit / CI hooks with `--no-verify` (see top of this file).
- Ship a destructive DB migration (DROP COLUMN, NOT NULL tightening, enum value removal, RPC arg removal) in the same release that introduces the new shape. See **Backward Compatibility** below.

## Branching & Release

This project has **three live client surfaces** (web, iOS app, Android app) and one shared backend (Supabase). The branching model has to keep older mobile clients working while web ships continuously.

### Branch → deploy surface map

| Branch / pattern | Deploys to | Purpose |
|---|---|---|
| `main` | **Web prod** (Cloudflare Pages auto-deploys on push). Tagged releases trigger mobile store submissions via `workflow_dispatch`. | Production. Merge-only, never commit directly. Every merge is a deployable state. |
| `develop` | Web preview / staging (Cloudflare Pages preview deploys per commit). Internal-only mobile builds (TestFlight internal / Play internal track) cut from here on demand. | Long-lived integration branch. All non-emergency work lands here first. |
| `release/x.y.z` | Web prod **candidate** (preview URL); mobile store submission candidate (TestFlight external / Play closed testing). | Release stabilization: only bug fixes, version bumps, store metadata. No new features. Tag `vX.Y.Z` on merge to `main`. |
| `hotfix/<slug>` | Direct fast-path to prod, skipping queued features on `develop`. Web deploys when merged to `main`; mobile may need an out-of-band store submission. | Emergency-only. Branch from `main`, PR into `main` AND `develop`. |
| `claude/<slug>`, `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>` | PR previews only. | Work branches. Branch from `develop`, PR back to `develop`. |

### Rules of thumb

- **Hotfixes branch from `main`, not `develop`.** `develop` may contain unreleased features you don't want to ship as part of a hotfix. After merging the hotfix to `main`, also merge `main` → `develop` (or cherry-pick the hotfix into `develop`) so the fix isn't lost on the next release.
- **Web ships independently of mobile.** A web-only change goes through the normal `feat/* → develop → release/x.y.z → main` flow and deploys to Cloudflare Pages on merge to `main`. Mobile workflows are `workflow_dispatch`-only and don't trigger.
- **Mobile review in flight ≠ frozen web.** While iOS/Android are in App Store/Play review, keep cutting `release/*` for web on the same cadence — just don't bump the mobile binary version until the previous one clears review.
- **Tag releases on `main`.** Pattern: `vX.Y.Z` (web), `ios-vX.Y.Z+build`, `android-vX.Y.Z+code`. Mobile release workflows take version inputs explicitly; tags are documentation, not triggers.
- **`develop` → `main` is only legal via a `release/x.y.z` branch.** Don't open a `develop` → `main` PR directly.
- **`release/x.y.z` accepts merges only from `develop`** (cut point) and small fix-up PRs branched from `release/x.y.z` itself. No `feat/*` PRs into `release/*`.
- **`MIN_SUPPORTED_APP_VERSION`** (defined in `supabase/functions/_shared/`, see Backward Compatibility) is load-bearing — older iOS/Android binaries still in the wild rely on the backend keeping shapes they read.

### Conventional commits

`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`. Scope is encouraged: `feat(events): …`, `fix(ios): …`.

## Backward Compatibility — Persistent State

Three surfaces carry persistent state that older clients depend on. All three follow the same multi-release deprecation flow.

### The deprecation flow (memorize this)

1. **Release N**: add the new shape alongside the old. Dual-write (server populates both). Old readers keep working.
2. **Release N+1**: migrate readers (web + new mobile binaries) to the new shape. Old shape is still populated but unused by new code.
3. **Release N+M** (where `M` is large enough that `MIN_SUPPORTED_APP_VERSION` ≥ the binary shipped in N+1): retire the old shape. Now safe to drop.

Never compress these steps into a single release while live clients exist.

### 1. Supabase Postgres (the database)

**Always safe in a single release:**
- `CREATE TABLE`
- `ADD COLUMN ... NULL` (no default that forces a table rewrite on big tables)
- `CREATE INDEX CONCURRENTLY`
- `CREATE OR REPLACE FUNCTION` that **adds** an optional parameter (with default) or **adds** a returned column
- New RLS policy that loosens access; new view; new enum **value** (additive only)

**Never do in a single release** (split across releases per the flow above):
- `DROP COLUMN` / `DROP TABLE` / `DROP TYPE`
- `RENAME COLUMN` / `RENAME TABLE` (drops the old name from the client's POV)
- Tightening: adding `NOT NULL` to an existing column, tightening a `CHECK`, narrowing a type (`text → varchar(50)`), changing default values that affect existing rows
- **Removing** an enum value (Postgres can't even do this directly; requires a type swap)
- Changing or removing a function/RPC parameter (old clients still send it)
- Reducing a function's return columns
- Tightening an RLS policy in a way that would deny reads/writes the old client expects to succeed

**Rule:** every migration in `supabase/migrations/` that does any of the "never" items must be paired with a prior migration (in an earlier release) that introduced the replacement and switched the writers.

### 2. Supabase Edge Functions (the API contract)

73 edge functions in `supabase/functions/`. Each one is a versioned API surface — older mobile binaries call them by name with the request shape that shipped with that binary.

**Always safe:**
- New endpoint (new function directory)
- New optional request field (must default cleanly when absent)
- New response field (older clients ignore unknown keys)

**Never in a single release:**
- Renaming or removing an endpoint
- Removing or renaming a request field
- Removing a response field that any shipped binary reads
- Tightening validation (e.g. `validateInput` rejecting a value previously accepted)
- Changing an HTTP status code an older client branches on
- Tightening rate limits below what an older client retries against

**Deprecation path:** add `v2` endpoint → switch web + new mobile binaries → wait until `MIN_SUPPORTED_APP_VERSION` ≥ the binary using `v2` → retire `v1`.

### 3. Mobile app store binaries (iOS / Android)

Define and maintain a `MIN_SUPPORTED_APP_VERSION` constant per platform (recommended location: `supabase/functions/_shared/minSupportedVersions.ts`, returned by a `version-check` edge function the apps call on launch). Any data shape, edge function, or RPC any binary `≥ MIN_SUPPORTED_APP_VERSION` still reads is load-bearing.

**Always safe:**
- Adding a new screen / feature behind a remote config flag
- Adding a new field to a response (clients ignore unknowns)

**Never in a single release:**
- Removing a feature an older binary tries to call without first updating `MIN_SUPPORTED_APP_VERSION` to exclude that binary
- Adding a required request field older binaries don't send
- Changing the auth/session shape (`profiles` table, `subscription_tier` enum, JWT claims) without a dual-shape transition

**Force-update flow:** when you genuinely need to retire a binary, bump `MIN_SUPPORTED_APP_VERSION` in a release ≥ 2 weeks before the destructive change. The `version-check` endpoint returns a force-upgrade payload that older binaries display as a blocking screen.

**This is implemented** — `supabase/functions/_shared/minSupportedVersions.ts` (`MIN_SUPPORTED_APP_VERSION`, `LATEST_APP_VERSION`, `compareVersions`/`isBelowMinimum`/`isUpdateAvailable`) and `supabase/functions/version-check/index.ts`. iOS gates in `App/DesMoinesInsiderApp.swift` via `VersionCheckService` → `ForceUpdateView`; Android in `MainActivity.kt` → `ForceUpdateScreen`. Both fail open on error, which is deliberate — a version-check outage must not brick the apps. Covered in CI by `subscription-sync-tests.yml` (Deno) and `VersionCheckTests.swift`.

Two known gaps: the iOS App Store URL in `version-check/index.ts` is still the `id0000000000` placeholder, so the escape button on a force-upgrade screen currently goes nowhere; and `LATEST_APP_VERSION` is hand-maintained with no release hook, so it drifts silently (drift only produces false "update available" banners, which is why nobody notices).

### 4. On-disk / client-stored state

- **`localStorage`** (via `@/lib/safeStorage`): treat saved keys as a schema. Don't rename keys; if the shape changes, write to a new key and migrate-on-read with a fallback to the old key for one release.
- **Cookies / session storage**: same rule.
- **URL params and route shapes**: external links and the sitemap reference these. Don't remove or rename a public route without a 301 redirect kept in place for ≥ 1 release cycle.

### Branch protection backs this up

`release/*` and `hotfix/*` are protected (see `.github/rulesets/`) so destructive migrations can't be slipped in via direct push — they have to go through a reviewed PR where the deprecation flow is checked.


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

<!-- SELVEDGE:START -->
## Pearson Media — shared context

*Managed from the vault. Edit `14 - Resources/Shared CLAUDE Block.md` in the vault; direct edits between these markers are overwritten once a sync exists. Everything outside them is yours and is never touched.*

**The memory vault.** Portfolio-wide memory lives in the **Hermes** vault at `<your-home>\Documents\Hermes` (`C:\Users\dpearson\Documents\Hermes` on this machine; remote: https://github.com/dj-pearson/Hermes). It holds the profile, the map of all ten projects, and cross-project knowledge. Read `VAULT-INDEX.md` there when a task needs context beyond this repo. This repo's own `CLAUDE.md`, `~/.claude` memory, and skills remain authoritative for work inside it — the vault supplements them, never replaces them.

**Name the project.** Pearson Media runs ten projects on a shared stack. Never say "the app," "the repo," or "production" without naming which one. A right answer about the wrong project is a wrong answer.

**The shared stack.** React + TypeScript + Vite, Tailwind, shadcn/ui, self-hosted Supabase, Cloudflare Pages, Coolify on Contabo, Stripe. A problem solved in one repo is usually already solved for this one — check the vault before solving it twice.

**Secrets are references, never values.** Never write a password, key, or token value into a note, summary, commit, or setup doc; name where it's stored instead. Loose credential files exist under your `Documents` folder (`C:\Users\dpearson\Documents` on this machine) — never read one into a document.

**Never delete what Claude Code relies on.** Repo `CLAUDE.md` files, `~/.claude/projects/*/memory/`, `.claude/skills/`, settings. Copy from them freely; removing or stubbing them is Dj's call alone.

**Evidence only.** Verify state from the actual file or command before claiming anything is done or in place. If unsure, say so and go find out.

**Write like a person.** Every model was trained on the same corpus, so the default register is recognisable within a sentence and it lands in commits, PR bodies, docs, UI copy and error strings alike. State the point first, then support it. Have an opinion; asked which of two, name one. Use real names and numbers, not categories. Never label your own significance ("important", "crucial", "worth noting", "notably"); if it matters the reader will see it. Banned outright: *delve, dive into, deep dive, unpack, shed light on, pave the way, usher in, tap into, supercharge, unlock, elevate, empower, streamline, curate, showcase, boast, groundbreaking, cutting-edge, transformative, game-changing, innovative, pivotal, invaluable, meticulous, bespoke, vibrant, multifaceted, holistic, testament, tapestry, synergy, cornerstone, treasure trove, plethora, myriad, moreover, furthermore, additionally.* Banned decoratively but fine literally: *navigate, harness, leverage, robust, comprehensive, landscape, realm, journey*; the test is whether a reader could check the claim. Banned phrases: *"In today's…", "It's important/worth noting", "When it comes to", "At its core", "At the end of the day", "This is where X comes in", "Let's break it down", "plays a crucial role", "cannot be overstated", "underscoring the importance of", "highlighting the need for"*, and the whole chat register (*"Great question!", "Absolutely!", "I'd be happy to", "Let me know if you need anything else", "I hope this helps"*). Banned structures, which imitate insight without carrying any: *"not just X, it's Y"*, *"not only X but Y"*, *"this isn't about X, it's about Y"*, *"No X. No Y. Just Z."*, the rule of three that goes abstract on the third item, the rhetorical question as a transition, and closing with a summary of what was just read. **At most one em dash** per piece of writing, never as the default connector; use commas, parentheses and semicolons. Vary sentence and paragraph length deliberately. Uniform 18-word sentences are the signature that survives every word-level edit. Use contractions. Don't restate the question, don't open with a sweeping scene-setter, don't over-format (no emoji as structure, no header on a three-paragraph answer, no table for two rows). The one allowed exception is a **bold lead-in used as a heading** in a reference document like this one; a *run* of "**Bold term:** one sentence" bullets standing in for prose is the tell.

**Plain characters only.** Generated text carries Unicode that renders as ordinary punctuation, as ordinary whitespace, or as nothing at all, and it survives review precisely because it looks correct. **Anything a machine parses is ASCII unless the content requires otherwise**: code, config, JSON, YAML, CSV, SQL, regex, env values, filenames, URLs, commit subjects. Straight quotes `'` `"`, hyphen-minus `-`, three dots for an ellipsis, one ordinary space between words. Never emit curly quotes (U+2018/2019/201C/201D), en/em dashes (U+2013/2014), U+2026 ellipsis, U+2212 minus or U+2032 primes into code; a look-alike character in a PowerShell string or a SQL literal is a runtime failure, which is how `backup-databases.ps1` and `ssl-check.ps1` sat unparseable for months. Never emit a no-break space (U+00A0, and U+202F/2007/2009/2002/2003/3000), which breaks shell word-splitting, `grep` and column parsing while looking exactly like a space, or U+2028/U+2029, which are valid JSON and a syntax error inside a JS string literal. **Never emit an invisible or bidi character anywhere:** U+200B-U+200F, U+2060-U+2064, U+FEFF, U+00AD, U+034F, U+180E, the bidi controls U+202A-U+202E and U+2066-U+2069, and above all the Unicode tag block **U+E0000-U+E007F**, which encodes arbitrary ASCII invisibly and is the usual carrier for text a reviewer cannot see. Avoid homoglyphs (Cyrillic a/e/o/p/c/x, Greek omicron, fullwidth Latin, mathematical alphanumerics for bold): an identifier holding one compares unequal to the identifier it appears to be. Prose may use real typography and real accented names; prose may not carry characters that don't render. The one exception is a deliberate, load-bearing use, which carries a comment saying why. Scan with `rg -n '[\x{00AD}\x{034F}\x{061C}\x{180E}\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{2066}-\x{2069}\x{FEFF}\x{E0000}-\x{E007F}]'`.

**Terminal output is scrollback, not a report.** Answer first — no "I'll start by", no restating the request, no narrating tool calls the transcript already shows. Don't summarise a diff the reader can see or paste back code you just wrote; one line naming what changed and where, with `file:line` because it's clickable. Length matches the question: a yes/no gets a yes/no plus the clause that makes it trustworthy, and under about six lines there are no headers, bullets or tables. Report actual output, not a paraphrase: quote the failing assertion, say what was skipped, say plainly what's verified and what isn't. No emoji and no status theatre; "246 tests, 246 passing" beats "✅ All tests passing!" and is falsifiable. Don't close with an offer of more help or unrequested next steps: ask a real question, or name the real remaining work. Commits are imperative, what and why, no launch copy. PR bodies say what changed, why, how it was verified, and what's still open.

**UI has a craft floor.** Every model trained on the same SaaS templates, so the *default* frontend output is a recognizable handful of tells — and Tailwind + shadcn/ui puts each of them one autocomplete away. Treat the following as the category's defaults rather than as bans: the brief's own words can earn any of them, but reaching for one on a free axis means you were not deciding. Refuse **purple/blue gradients and gradient text** (emphasis comes from weight and size); **Inter or a system default as the type *choice***; a colored **`border-left`/`border-right` above 1px** on cards, list items, callouts or alerts — the single most recognizable tell; grids of **same-size icon-tile + heading + text cards** as the page structure, and **cards nested in cards**; a **1px border under a wide soft shadow** (declare elevation once — border *or* shadow); **gray text on colored surfaces** (tint secondary text from the surface hue or the foreground); **bounce/elastic easing**; **monospace as a costume** for "technical" rather than for code, data or measurement; and a **tracked uppercase eyebrow over every section**. Keep body measure at 65–75ch, tracking no tighter than -0.04em, and card radii at 12–16px.

**Check UI, don't just intend it.** `npx impeccable detect <path>` runs 60 deterministic anti-pattern rules with no install, no API key and no LLM — it works from any repo, so there is no excuse for asserting a UI is clean. Use the `/impeccable` skill (`audit`, `critique`, `polish`, `colorize`, `typeset`) for the judgement calls it cannot make. Source: [Impeccable](https://github.com/pbakaus/impeccable), Apache 2.0.
<!-- SELVEDGE:END -->
