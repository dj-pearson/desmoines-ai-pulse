# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

None. WEB-PERF-061 closed in loop 7: SessionManager and
GuestFavoriteMigrator now gate on useAuthFlags and lazy-load the part that
works (AdminSessionTimeout, GuestFavoriteMigrationRunner), so
useSessionTimeout, use-toast, useGuestFavoriteMigration, guestFavorites,
authReturn and favoriteAnalytics left the entry chunk (index 60.2 -> 57.2 KB
gz, critical path 180.8 -> 178 KB, baseline ratcheted). The static-graph
walker is now src/__tests__/support/eagerGraph.ts; to pin a module out of
the entry, add it to SIGNED_IN_ONLY in entryChunkSignedInOnly.test.ts or
write a sibling test on the same helper. A headless app-root lazy component should
use src/lib/lazyOrNothing.ts so a purged chunk renders nothing instead of
throwing into the root boundary. Next entry residents (minified bytes from the
source map): App.tsx 44 KB (the route table), tailwind-merge 20 KB (held by
button/card via error-boundary, SiteLayout, BottomNav, AccessibilityWidget;
moving it means those stop importing cn/button), AuthContext 15 KB,
react-helmet-async 12 KB, ProtectedRoute + usePermission + lib/security
~8 KB (only protected routes need them). A local build needs placeholder
VITE_SUPABASE_URL/ANON_KEY/SITE_URL exported or the html-env plugin aborts.
The open WEB-PERF stories (023, 031, 034, 035) are all waiting on a migration
being applied or on live data for the prerender.

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
