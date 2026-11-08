# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

None. WEB-PERF-063 closed in loop 9: AuthProvider's user-initiated actions
(login with its throttle, server lockout and MFA gate; signup; Google/Apple
OAuth; reset, password and email change; resend) are now
src/lib/authActions.ts, reached by `withAuthActions` in AuthContext through a
dynamic import. A chunk-load failure returns `{ success: false, error }`, so
callers need no new branch; the MFA state is set by the provider from the
returned `requiresMFA`/`factorId`. Index 55.3 -> 54.2 KB gz, critical path
175.8 -> 174.9 KB, baseline ratcheted; authActions is its own 6.3 KB chunk.
Pinned by src/__tests__/entryChunkAuthActions.test.ts. Three Deno source
tests (login-throttle-contract, account-credentials-panel, mfa-assurance)
read AuthContext for this logic; the first two now read authActions.ts with
the same regexes plus a delegation check. No deno binary in the container, so
those were replayed in Node, not run.

The static-graph walker is src/__tests__/support/eagerGraph.ts; write a
sibling test on it to pin a module out of the entry. It treats
`import { type X }` as a value import, so write `import type`. A headless
app-root lazy component should use src/lib/lazyOrNothing.ts; a gate should use
plain lazy() so a purged chunk fails closed. Next entry residents (minified
bytes from the source map): App.tsx 43 KB (the route table), tailwind-merge
20 KB (held by button/card via error-boundary, SiteLayout, BottomNav,
AccessibilityWidget; the home route chunk imports button anyway, so moving it
only shifts bytes unless those shell files drop cn), react-helmet-async 12 KB,
AuthContext now 9.7 KB, down from 14.8 (logout and handleAuthChange, which every visitor
runs). A local build needs placeholder VITE_SUPABASE_URL/ANON_KEY/SITE_URL
exported or the html-env plugin aborts. The open WEB-PERF stories (023, 031,
034, 035) are all waiting on a migration being applied or on live data.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-PERF-041 | f5ae9fd0 | Six DB-image cards on OptimizedImage (transform srcset); /stay first row eager and added to check-lcp-priority; raw-img 24 -> 17; story stays open for the tail |
| 2026-11-07 | WEB-PERF-041 | this commit | RatingSystem review photos (80px preview, 96px thumbs, lightbox) on OptimizedImage with box-sized transform widths; raw-img 17 -> 14; EventPhotoGallery found dead; story stays open |
| 2026-11-07 | WEB-PERF-041 | this commit | Map popup, event-review dialog and article-editor previews on OptimizedImage with box-sized widths; DB-image hard gate widened from src/pages to every scanned file (negative control fires); raw-img 14 -> 11, all deliberate; story closed |
| 2026-11-07 | WEB-PERF-058 | this commit | /guides cards stop fetching /api/placeholder (8 Function hits per visit, 3 at fetchpriority=high) and draw an icon panel; new hard rule in check-raw-img (negative control fires); raw-img 11 -> 10; story closed |
| 2026-11-07 | WEB-PERF-059 | this commit | Cookie banner lazy-loaded behind CookieConsentGate, fetched only with no stored choice or on reopen; Radix Checkbox/Label/Presence out of the entry chunk; critical path 187.2 -> 181.9 KB gz; story closed |
| 2026-11-07 | WEB-PERF-060 | this commit | Spinner split into ui/spinner.tsx; eager ProtectedRoute no longer drags loading-skeleton.tsx into the entry chunk; critical path 181.9 -> 180.8 KB gz, baseline ratcheted; static-graph test with negative control; story closed |
| 2026-11-07 | WEB-PERF-061 | this commit | Admin idle timeout and guest-favorite migration lazy-loaded behind useAuthFlags gates; six modules out of the entry chunk; critical path 180.8 -> 178 KB gz, baseline ratcheted; static-graph test with negative control; story closed |
| 2026-11-08 | WEB-PERF-062 | this commit | ProtectedRoute permission half split into lazy RoutePermissionGate; usePermission, useSecurityContext and lib/security out of the entry chunk; critical path 178 -> 175.8 KB gz, baseline ratcheted; static-graph test with negative control (8 fail on a static import); story closed |
| 2026-11-08 | WEB-PERF-063 | this commit | AuthProvider's sign-in/sign-up/OAuth/reset/password/email/resend bodies moved to lazily imported lib/authActions; signUpResult out of the entry chunk; critical path 175.8 -> 174.9 KB gz, baseline ratcheted; static-graph test with negative control (2 fail on a static import); story closed |
