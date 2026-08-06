# Code Review — 2026-08-06

Reviewed against `prd.json` (435 stories: 331 `passes:true`, 104 open) at
`5a8acb8`. Every claim below was checked against this working tree — builds run,
tests run, migrations and generated types read. Nothing is inferred from the PRD
notes alone.

Two purposes:

1. **New findings** — defects with no story in `prd.json`. Proposed story IDs
   below; none have been appended to `prd.json` yet.
2. **Verification** — which open stories are still true, and which PRD claims the
   evidence now contradicts.

---

## 0. Gate status (measured, not assumed)

| Gate | Result | Note |
|---|---|---|
| `npm run type-check` | **exit 0, zero files compiled** | root `tsconfig.json` is `"files": []` + project references; `--noEmit` without `-b` checks nothing. Confirms **WEB-CI-023**. |
| `npx tsc -p tsconfig.app.json` | **fails: 403 errors** | across 54 files (see §1.7 for the breakdown). Never runs in CI. |
| `npm run lint` | passes | 0 errors, **3249 warnings**. The `VideoPlayer.tsx` parser false-positive noted in WEB-SEC-001 is gone. |
| `npm run check-imports` | passes | but skips `__tests__` — see §1.6 |
| `npm run check-schema` | passes | baseline holds at **179** findings (84 in `src/`, 93 in edge functions) |
| `npm run check-seo-routes` | passes | 35 prerendered, 4 sitemap-only, 39 sitemapped |
| `npm run check-schema-dupes` | passes | 549 components, 25 emit FAQPage, 0 duplicates |
| `npm run test:unit` | **4 failed / 158** | `OptimizedImage.test.ts`. Confirms **WEB-CI-020**. |
| `npx vite build` | passes | critical path **484 KB gz** vs 200 KB budget; all JS **2010 KB gz** vs 500 KB budget |

`npm run validate` is green. It is green because its only type gate compiles
nothing and its only import gate ignores the directory where the broken import
lives.

---

## 1. New findings (no story in `prd.json`)

### 1.1 — `/stay` throws a ReferenceError on render — P1

`src/pages/Hotels.tsx:262` and `:269` call `getCanonicalUrl('/stay')`. The symbol
is never imported and is not a global. Every other caller imports it from
`@/lib/brandConfig` (`SEOHead.tsx:2`, `LocalSEO.tsx:2`, `PseoPage.tsx:12`).

The calls are unconditional inside the component's returned `<Helmet>`, so `/stay`
— a live public route (`src/App.tsx:470`) — cannot render.

Introduced by `b89291a` *"fix(seo): give the last four routes their own head"*,
part of the in-flight **WEB-SEO-002** work. It survived because:

- `npm run type-check` compiles zero files (WEB-CI-023), so `TS2304: Cannot find
  name 'getCanonicalUrl'` never surfaced;
- `/stay` is not in `scripts/prerender.mjs` ROUTES, so the prerender quality gate
  never loaded it;
- `tests/route-smoke.spec.ts` covers 5 routes and `/stay` is not among them.

Fix is one import line. The interesting part is the three-layer miss.

**Proposed: WEB-QA-023 (P1)** — fix the import, add `/stay` to route smoke, and
require that any route referenced in `App.tsx` be covered by smoke or prerender.

### 1.2 — Seven admin edge functions hand-roll an admin gate that the repo's own schema checker flags as unresolvable — P1

`_shared/apiKeyAuth.ts` is the sanctioned admin check: `user_roles.role` keyed by
`user_id`, falling back to `profiles.user_role` keyed by `user_id`. Seven
functions bypass it and hand-roll `.from("profiles").select("role").eq("id", user.id)`:

| Function | Line |
|---|---|
| `admin-home-stats` | 140 |
| `send-newsletter-campaign` | 134 |
| `send-campaign-notification` | 78 |
| `send-feedback-reply` | 81 |
| `manage-social-account` | 197 |
| `google-indexing-api` | 232 |
| `process-stripe-refund` | 75 |

Plus `stripe-webhook:281-283`, which selects admins with `.eq("role", "admin")` to
send new-paid-campaign notifications.

Two divergences from the sanctioned helper, and the codebase contradicts itself on
both:

- **Column.** `src/integrations/supabase/types.ts` has `profiles.user_role`, no
  `profiles.role` — which is why `check-schema-usage` lists all eight of these as
  `42703 (column does not exist)`. But
  `20260711000000_pin_search_path_and_close_role_escalation.sql:47-56` has
  `is_admin()` reading `profiles.role` unguarded, and its trigger body references
  `NEW.role` — neither would apply against a table lacking the column. So either
  the generated types are stale, or `is_admin()` throws on every call and all
  admin RLS is broken. **This needs a prod probe to settle, and that ambiguity on
  the authorization path is itself the defect.**
- **Key.** `.eq("id", user.id)` keys `profiles` by its row PK; `apiKeyAuth.ts`
  keys by `user_id`. `src/` is split 2-and-2 between the two spellings.

If the column is absent, all seven fail closed (403 to real admins) and
`stripe-webhook` silently notifies nobody on every paid campaign. If it is
present, they work but on a legacy column that `types.ts` no longer knows about.
Neither state is one to ship on.

**Proposed: WEB-SEC-023 (P1)** — probe prod for `profiles.role`, then migrate all
eight call sites onto `requireAdminOrApiKey()` and record the `id` vs `user_id`
answer somewhere enforceable.

### 1.3 — The hotel "Book Now" affiliate CTA is dead on every hotel page — P2

`src/pages/HotelDetails.tsx:352, 436, 439` read `hotel.source_url`. The `hotels`
table has no such column (`types.ts`: `affiliate_url`, `affiliate_provider`,
`website`, …). So:

- `StickyMobileCTA`'s `primaryAction` is gated on `hotel.source_url ? {...}` →
  always falsy → the **primary booking CTA never renders**;
- `OpenStatusChip` gets `website={undefined}`.

This is the monetized affiliate path — `affiliate_url` is almost certainly the
intended column, with `website` as fallback. Caught by `tsc -p tsconfig.app.json`
as three `TS2339`s; invisible to CI.

**Proposed: WEB-FEAT-012 (P2).**

### 1.4 — One barrel import puts 133 KB gz of unused icons in the critical path — P2

`src/components/BadgeCollection.tsx:5`:

```ts
import * as LucideIcons from "lucide-react";
const IconComponent = badge.icon ? (LucideIcons as any)[badge.icon] : LucideIcons.Award;
```

The namespace import plus dynamic indexing defeats tree-shaking, so
`vite.config.ts:274`'s `vendor-icons` chunk ships **all** of `lucide-react`:
780 KB raw / **133 KB gzipped**, and it is preloaded from `index.html`. The app
uses 170 distinct icons — roughly 30 KB gz if tree-shaken.

Measured critical path today:

| Chunk | gz |
|---|---|
| `index` | 154.2 KB |
| `vendor-react` | 87.9 KB |
| **`vendor-icons`** | **133.4 KB** |
| `vendor-ui` | 45.2 KB |
| `vendor-supabase` | 44.5 KB |
| `vendor-react-ecosystem` | 18.8 KB |
| **total** | **484 KB** (budget 200 KB) |

Fixing this one file is worth ~100 KB gz — about a fifth of the critical path —
and it is the single largest cheap win against **WEB-PERF-020**. Replace the
namespace import with an explicit map of the badge icons actually used.

**Proposed: WEB-PERF-026 (P2).** Note WEB-PERF-020 currently records 610 KB; the
measured figure is now 484 KB, so that story's number wants refreshing (§3).

### 1.5 — The homepage counter counts events the events page hides, and cannot report failure — P2

`src/hooks/useHomepageStats.ts` backs the "N Events Today / N Restaurants / N New
This Week" trust strip. Three problems:

- **Counts hidden and merged rows.** It filters only on date. `useEvents.ts:60-61`
  filters `.neq("is_merged", true).neq("is_hidden", true)` (WEB-AUTO-005/006). So
  the homepage counter and `/events` disagree by construction.
- **Discards every error.** `eventsRes.count ?? 0` — a rejected query renders a
  confident "0 Events Today". This is the WEB-BE-032 pattern sitting on the
  highest-traffic trust signal on the site, and it is the mechanism by which
  WEB-QA-003's symptom ("2 Events Today" against a "500+ events weekly" claim)
  reaches a visitor as a plausible-looking number rather than an error state.
- **Bypasses TanStack Query.** Raw `useState` + `useEffect` against CLAUDE.md's
  data-flow convention: no retry, no cache, no dedup, no `isError`.

**Proposed: WEB-QA-024 (P2)** — port to TanStack Query, apply the
`is_hidden`/`is_merged` predicate, surface failure instead of rendering `0`.

### 1.6 — The import checker skips the one directory where the broken import lives — P3

`scripts/check-import-exports.mjs:43` — `if (entry === 'node_modules' || entry === '__tests__') continue;`

`src/components/__tests__/OptimizedImage.test.ts:2` imports `canTransform` and
`getTransformedUrl` from `@/components/OptimizedImage`. `canTransform` has **never
existed** in that file (`git log -S` finds no commit adding it) and
`getTransformedUrl` is declared at line 76 but not exported. Both were introduced
by the merge of PR #310.

So `npm run validate` reports "✅ No unresolved named imports found" while the
blocking unit lane has been red since the tests landed. This is the root cause of
**WEB-CI-020**, which the story records as a symptom.

**Proposed: WEB-CI-024 (P3)** — stop skipping `__tests__`.

### 1.7 — Turning the type gate on means absorbing 403 errors, not a cleanup — P2, and it re-scopes WEB-CI-023

`npx tsc -p tsconfig.app.json --noEmit` exits 2 with **403 errors across 54
files**. WEB-CI-023 currently reads as a config fix; it is not. Breakdown:

| Bucket | Errors |
|---|---|
| In files already flagged by `schema-baseline.json` (the WEB-QA-018/019 dead-table cluster) | **285** |
| In files *not* in the baseline — genuinely unexamined | **118** |

By code: 118× `TS2769` (no matching overload), 100× `TS2339` (property does not
exist), 52× `TS2345`, 51× `TS2589` (*type instantiation excessively deep*), 45×
`TS2322`.

Three things follow:

- **285 of the 403 are the dead-table cluster wearing a different hat.** The CRM
  hooks lead the count (`useCrmDeals` 40, `useCrmDashboard` 33, `useCrmContacts`
  31, `useCrmTasks` 25, `useCrmSegments` 24). Resolving WEB-QA-018 collapses most
  of this backlog for free — which is an argument for sequencing WEB-QA-018 before
  WEB-CI-023, not after.
- **Do not ship this as a hard gate.** The repo already has the right mechanism:
  `scripts/strict-ratchet.mjs` + `npm run type-check:strict:ratchet`, whose own
  header explains why ("a gate that always fails teaches everyone to ignore it,
  and one that is simply absent lets the count drift up"). Point a second
  per-file ratchet at `tsconfig.app.json` and WEB-CI-023 lands in one PR without
  a 403-error burndown blocking it.
- **Budget for the compile time.** The run did not finish within 30 minutes on
  this container across repeated attempts. The 51 `TS2589`s are a likely
  contributor and cluster in the same CRM hooks, so WEB-QA-018 may cut this too.
  Pair the story with `incremental` + a cached `.tsbuildinfo` regardless.

Of the 118 non-baseline errors, most are typing debt rather than live defects —
but they are where §1.1 and §1.3 were hiding, and spot-checks found more of the
same class: `MostSearched.tsx` renders `unknown` as a `ReactNode` 19 times;
`PrivacyControls.tsx:102` carries a now-unused `@ts-expect-error` masking two
live errors beside it; `EventsNearMe.tsx:66` reads `event.description` off a type
that lacks it (degrades to `undefined`, so nearby cards can lose their blurb).
Two that look alarming but are not: `EventDetails.tsx:290` narrows to `never` in
an unreachable defensive branch, and the two `TS2304`s are §1.1.

---

## 2. Open stories — re-verified against the tree

| Story | Verdict | Evidence found this pass |
|---|---|---|
| **WEB-CI-023** | still true | root `tsconfig.json` `"files": []`; `tsc --noEmit` exits 0 having compiled nothing; `pr-checks.yml:50` runs it |
| **WEB-CI-020** | still true | 4 failures / 158; root cause now identified (§1.6) |
| **WEB-CI-021** | still true | `e2e.yml:112` `continue-on-error: true` on the a11y lane |
| **WEB-OPS-020** | still true | `scripts/prerender.mjs:501-502` — `.catch(warn).finally(() => process.exit(0))` unconditionally |
| **WEB-SEC-021** | still true | `20260128000001_security_layers.sql:434,452,469` — `USING (true)` on `role_definitions`, `permission_definitions`, `role_permissions` |
| **WEB-PERF-025** / **WEB-QA-020** | still true | `types.ts:13466` still carries **both** `get_active_ads` overloads → PostgREST 300. The fix migration `20260718000001_resolve_get_active_ads_overload.sql` exists locally; types regenerated from prod still show the ambiguity, corroborating that it is unapplied |
| **WEB-QA-017** | accurate | baseline `src/` count is exactly **84**, as the story states |
| **WEB-QA-018 / 019** | still true | 84 table-level + 36 rpc + 59 column findings. Includes `trip_plans` / `trip_plan_items` — the Trip Planner, a headline feature in CLAUDE.md, persists nothing |
| **WEB-SEO-006** | correctly open | entity prerendering is implemented (`prerender.mjs:63-120, 458-486`) but **off by default**; `PRERENDER_ENTITIES` must be set for any of the 884 URLs to render |
| **WEB-SEO-007** | correctly partial | `public/_redirects:13` has the 301 and `/weekend` is out of ROUTES, matching the story's own "IMPLEMENTED, PARTIAL" note |
| **WEB-PERF-020** | still true, number stale | measured 484 KB gz critical path, not 610 KB. Still 2.4× the budget |

Clean on the conventions CLAUDE.md calls out: no `process.env` in `src/`; the only
direct `localStorage` uses (`client.ts:37-39`, `AuthContext.tsx:561-568`) are
guarded and legitimate; all four `dangerouslySetInnerHTML` sinks route through
`SecurityUtils.sanitizeRichHTML`, which is DOMPurify, not a regex.

Also checked and **not** a problem: the four newer `verify_jwt=false` functions
added since WEB-SEC-001 closed (`support-chat`, `log-error`, `og-image`,
`support-csat-submit`) are all rate-limited and public by design. No new instance
of the WEB-SEC-001 hole.

---

## 3. Suggested `prd.json` edits

- Append **WEB-QA-023**, **WEB-SEC-023**, **WEB-FEAT-012**, **WEB-PERF-026**,
  **WEB-QA-024**, **WEB-CI-024** (§1.1-1.6), all `passes:false`.
- **WEB-CI-020** — add the §1.6 root cause; the fix is two exports plus one line
  in the checker, not a test rewrite.
- **WEB-PERF-020** — refresh 610 KB → 484 KB, and note §1.4 as the largest single
  remaining win.
- **WEB-CI-023** — re-scope per §1.7: 403 errors, ship as a per-file ratchet
  reusing `strict-ratchet.mjs`, and sequence it *after* WEB-QA-018 (which clears
  285 of them). Raise from P2 accordingly — it is no longer a config one-liner.
- **CLAUDE.md** — "73 Edge Functions" and "142 SQL migrations" are now 159 and 323.

## 4. Suggested order

1. §1.1 `/stay` — one import, a public route is down right now.
2. §1.6 — one line in `check-import-exports.mjs`, plus the two exports it then
   catches. Turns the unit lane green and closes WEB-CI-020.
3. §1.2 — probe prod for `profiles.role`, then consolidate onto
   `requireAdminOrApiKey()`.
4. **WEB-QA-020** — the 8 unapplied migrations; needs the human go-ahead the story
   already flags.
5. §1.4 — ~100 KB gz off the critical path from one file.
6. §1.3, §1.5.
7. **WEB-QA-018**, then **WEB-CI-023** as a ratchet (§1.7). Deliberately last:
   WEB-QA-018 is a decision, not a defect, and it erases 285 of the 403 type
   errors before the gate has to absorb them.
