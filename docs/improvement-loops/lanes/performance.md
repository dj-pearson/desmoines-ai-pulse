# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

None. WEB-PERF-065 closed in loop 11: experimentalMinChunkSize 1000 -> 1
(Rollup's default, no merging). Summed per-route JS beyond the critical path
over the 137 lazy imports in App.tsx: 10,853 -> 9,734 KB gz; the part that was
modules the route never reaches statically, 1,892 -> 615. 131 routes lighter,
none heavier by more than 0.2 KB. Cost: 441 more route files summed (/ 47 ->
62) and critical path 174.9 -> 176.0 KB gz (inside the 5 KB tolerance; the
entry's __vite__mapDeps arrays name 79 more chunks). Baseline NOT ratcheted up.
Pinned by src/__tests__/manualChunks.test.ts (negative control: 1000 fails).

Measuring is now one command, and replaces the hand method below:
`node scripts/measure-route-preload.mjs [--min-chunk N] [--out f.json]` builds
into a temp dir with a post generateBundle hook and reads Rollup's module
graph, so it reports per route the gz bytes (kb), the chunk files (files) and
the bytes of modules the route never reaches statically (wasteKb, estimated by
rendered length). Its criticalKb matches check-bundle-budget. It needs the
placeholder VITE_* env vars. Diff two --out files by route; single routes
reshuffle on any config change.

What that turned up and was not done:
- The 615 KB of remaining waste is the forced vendor-editor manual chunk
  (tiptap + prosemirror, ~122 KB gz each) on five admin routes: AdminAgents,
  AdminAnalyticsPage, AdminRefunds, CampaignAnalytics and AdminArticleEditor.
  Something they import statically pulls one tiptap module, and the forced
  chunk brings the rest (even AdminArticleEditor reaches only part of it).
  Find the importer with the tool's `wasted` list; either make that import
  lazy or stop forcing vendor-editor (the remove-lazy-preloads plugin and
  check its pattern list if the name goes away).
- WEB-PERF-066 (preload arrays in the entry) is now slightly larger: 79 more
  file names.

Earlier notes still hold: eagerGraph.ts is the static-graph walker for
entry-chunk tests (write `import type`, not `import { type X }`); headless
app-root lazy components use src/lib/lazyOrNothing.ts. A local build needs
placeholder VITE_SUPABASE_URL/ANON_KEY/SITE_URL exported. /usr/bin/google-chrome
exists in the container, so `chromium.launch({ channel: "chrome" })` against
`vite preview --host 127.0.0.1` can load routes even though Playwright's own
browsers are not installed. The open WEB-PERF stories (023, 031, 034, 035) are
still waiting on a migration or live data.

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
