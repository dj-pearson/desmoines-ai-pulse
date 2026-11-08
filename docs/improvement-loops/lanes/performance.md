# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

None. WEB-PERF-066 closed in loop 14.

What the next loop should know:
- The rest of the entry's __vite__mapDeps (about 13 KB gz) is the routes' own
  closures, and it cannot be cut without a waterfall. Rollup hoists transitive
  imports, so a lazy route chunk already imports its whole closure directly:
  a "direct deps only" build cut 36 of 8,018 refs and 0.2 KB gz. The only
  bigger cut is "target only", which costs one full RTT on every navigation
  by construction. Not worth re-measuring unless the chunking changes.
- Next candidate: WEB-PERF-068 (remove-lazy-preloads warns on every build that
  critical-path vendor-supabase is preloaded). The open WEB-PERF stories 023,
  031, 034 and 035 are still waiting on a migration or live data.
- Entry chunk, by module, after this loop: App.tsx 46 KB raw (route table),
  tailwind-merge 20 KB, react-helmet-async 11.8 KB (HelmetProvider and Helmet
  are one module), AuthContext 9.9 KB. Measure with a sourcemap walk
  (source-map-js eachMapping, sum generated columns per source) before
  guessing.

Measuring routes is one command: `node scripts/measure-route-preload.mjs
[--min-chunk N] [--out f.json]` (needs placeholder VITE_SUPABASE_URL/ANON_KEY/
SITE_URL, exported in the same shell as the build); diff two --out files. Any
forced manual chunk silently absorbs shared dependencies; do not add a fourth
for a lazy library (WEB-PERF-067).

Earlier notes still hold: eagerGraph.ts is the static-graph walker for
entry-chunk tests (write `import type`, not `import { type X }`); headless
app-root lazy components use src/lib/lazyOrNothing.ts. /usr/bin/google-chrome
exists in the container, so `chromium.launch({ channel: "chrome" })` against
`vite preview --host 127.0.0.1` can load routes and `import()` chunks even
though Playwright's own browsers are not installed. Playwright's
keyboard.press("?") sends shiftKey, which the shortcut hook rejects; dispatch
a keydown on document.body to test "?".

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
| 2026-11-08 | WEB-PERF-064 | this commit | Forced vendor-dates manual chunk removed; per-route JS beyond the critical path 11,779 -> 10,840 KB gz summed over 131 lazy routes (/pricing -20.9, /auth -23.5, /events/:id -4.4, /hotels +5.5); critical path unchanged; manualChunks test with negative control (3 fail on re-adding); 24 routes loaded clean in Chrome; story closed |
| 2026-11-08 | WEB-PERF-065 | this commit | experimentalMinChunkSize 1000 -> 1; per-route JS 10,853 -> 9,734 KB gz summed over 137 lazy routes, unused passengers 1,892 -> 615; 131 lighter, none heavier >0.2 KB; critical path 174.9 -> 176.0 (in tolerance); new scripts/measure-route-preload.mjs; test with negative control; 24 routes clean in Chrome; story closed |
| 2026-11-08 | WEB-PERF-067 | this commit | Forced vendor-editor chunk removed (it absorbed fast-equals, shared with recharts, and the app's tiptap-styles.css); unused passengers 614.8 -> 0, routes 9,743 -> 9,121 KB gz, five admin routes 123-125 KB lighter, none heavier; critical path 176.0 unchanged; manualChunks test with negative control (4 fail on re-adding); six chunks import clean in Chrome; story closed |
| 2026-11-08 | WEB-PERF-066 | this commit | Preload lists drop chunks the importing chunk already loaded (modulePreload.resolveDependencies + bundle capture); entry refs 8,381 -> 7,905, lazy hosts 1,660 -> 792, entry 55.4 -> 55.2 KB gz; check-bundle-budget guards it (pre-change dist fails); 20 routes clean in Chrome; story stays open for AC2/AC3 |
| 2026-11-08 | WEB-PERF-066 | this commit | AC3: AccessibilityWidget announces via new lib/announce (useAccessibility out of the entry, two duplicate announcers merged) and the shortcut listener is a lazy headless component; critical path 175.8 -> 174.7 KB gz, baseline ratcheted 174.9 -> 174.7; static-graph test with negative control (2 fail on revert). AC2 assessed, not shipped: direct-deps-only cuts 36/8,018 refs (0.2 KB gz) because rollup hoists transitive imports; target-only costs a full RTT per navigation. Story closed |
