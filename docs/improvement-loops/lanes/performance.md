# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

None. WEB-PERF-067 closed in loop 12: the forced vendor-editor manual chunk is
gone. Cause, found with a module-graph BFS over the build: fast-equals is a
dependency of both @tiptap/react and recharts (react-smooth), and Rollup moves
an unassigned dependency of a forced chunk's modules into that chunk, so the
four recharts admin pages imported the editor for it. AdminArticleEditor was
the second case: includes("tiptap") matched src/components/cms/tiptap-styles.css.
RichTextEditor is already lazy, so tiptap now lives in its chunk.
sumWasteKb 614.8 -> 0, routes 9,743 -> 9,121 KB gz, only those five routes
moved (each 123-125 KB lighter), critical path unchanged at 176.0.

The lesson that generalises: any forced manual chunk silently absorbs shared
dependencies. The three left (vendor-react, vendor-react-ecosystem,
vendor-supabase) are on the critical path anyway, so it costs nothing there,
but do not add a fourth for a lazy library.

Measuring is one command: `node scripts/measure-route-preload.mjs [--min-chunk N]
[--out f.json]` (needs placeholder VITE_SUPABASE_URL/ANON_KEY/SITE_URL). With
waste now 0, its useful output is kb and files per route; diff two --out files.

Next candidates, none started:
- WEB-PERF-066 (preload dependency arrays in the entry, about a quarter of it).
- The remove-lazy-preloads plugin warns on every build that vendor-supabase
  (216 KB raw) is preloaded from index.html. It is on the critical path by
  design, so the warning is noise that teaches people to ignore it; either
  allowlist the critical vendors or measure only non-critical chunks.

Earlier notes still hold: eagerGraph.ts is the static-graph walker for
entry-chunk tests (write `import type`, not `import { type X }`); headless
app-root lazy components use src/lib/lazyOrNothing.ts. /usr/bin/google-chrome
exists in the container, so `chromium.launch({ channel: "chrome" })` against
`vite preview --host 127.0.0.1` can load routes and `import()` chunks even
though Playwright's own browsers are not installed. The open WEB-PERF stories
(023, 031, 034, 035) are still waiting on a migration or live data.

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
