# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

None. WEB-PERF-064 closed in loop 10: the forced `vendor-dates` manual chunk
is gone from vite.config.ts, so date-fns travels with its importers. Summed
per-route JS beyond the critical path, every lazy route in App.tsx: 11,779 ->
10,840 KB gz (78 better, 36 worse by 0.5-5.5 KB, the 89 public routes 6,033 ->
5,727). Critical path unchanged. Pinned by src/__tests__/manualChunks.test.ts,
which calls the real manualChunks and asserts date-fns, radix, three, recharts
and lucide are left to Rollup (negative control: re-adding the date-fns line
fails 3 of 8).

How it was measured, so the next loop can reuse it: build twice with
`npx vite build --sourcemap` into separate dirs, then for each
`import("./<Page>-hash.js"),__vite__mapDeps([...])` in the entry chunk, sum
the gzipped size of the route chunk plus every chunk in its mapDeps list,
skipping the three critical-path vendors. A single route diff is noise:
module-to-chunk assignment reshuffles on any config change.

What that turned up and was not done (filed as additional stories):
- experimentalMinChunkSize 1000 merges small shared modules into chunks that
  routes import without needing them. /hotels now preloads eventsHubQuery,
  useEventLanding and useProximitySearch; before this change admin pages
  preloaded restaurantHours, tonightPairings and useCampaigns the same way.
- The preload dependency arrays (`__vite__mapDeps`) are 16.6 KB of file names
  plus 28.5 KB of index arrays in the entry chunk, about 13.7 KB of its 54.2 KB
  gz. build.modulePreload.resolveDependencies could drop the three vendors
  every page already has (468 of 7,652 refs, small) without adding a
  waterfall; trimming more trades route-navigation latency for entry bytes.

Earlier notes still hold: eagerGraph.ts is the static-graph walker for
entry-chunk tests (write `import type`, not `import { type X }`); headless
app-root lazy components use src/lib/lazyOrNothing.ts. Entry residents left:
App.tsx 44 KB minified (mostly the preload arrays above), tailwind-merge 20 KB,
react-helmet-async 12 KB, AuthContext 9.9 KB. A local build needs placeholder
VITE_SUPABASE_URL/ANON_KEY/SITE_URL exported. /usr/bin/google-chrome exists in
the container, so `chromium.launch({ channel: "chrome" })` against
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
