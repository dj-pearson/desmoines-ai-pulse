# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

None. WEB-PERF-058 closed in loop 4: /guides had no real photos to show, so
the eight cards now draw an icon panel in the same aspect-video box instead of
fetching /api/placeholder/400/250 (which the SPA fallback answered with the
homepage HTML). /guides left check-lcp-priority's LISTING_PAGES because its
grid has no image; put it back if the guides get photos. check-raw-img now
fails on any `/api/placeholder` literal in src/. The 10 raw `<img>` left in
`.github/raw-img-baseline.json` are deliberate (see the WEB-PERF-041 notes):
AffiliateAdBanner, MFAEnrollmentDialog, EventPhotoUpload, EventSubmissionForm,
Footer, OptimizedLogo, and dead code (EventPhotoGallery x2, ImageViewer,
SocialProofBadge's AttendeeAvatars) left to a cleanup story.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-PERF-041 | f5ae9fd0 | Six DB-image cards on OptimizedImage (transform srcset); /stay first row eager and added to check-lcp-priority; raw-img 24 -> 17; story stays open for the tail |
| 2026-11-07 | WEB-PERF-041 | this commit | RatingSystem review photos (80px preview, 96px thumbs, lightbox) on OptimizedImage with box-sized transform widths; raw-img 17 -> 14; EventPhotoGallery found dead; story stays open |
| 2026-11-07 | WEB-PERF-041 | this commit | Map popup, event-review dialog and article-editor previews on OptimizedImage with box-sized widths; DB-image hard gate widened from src/pages to every scanned file (negative control fires); raw-img 14 -> 11, all deliberate; story closed |
| 2026-11-07 | WEB-PERF-058 | this commit | /guides cards stop fetching /api/placeholder (8 Function hits per visit, 3 at fetchpriority=high) and draw an icon panel; new hard rule in check-raw-img (negative control fires); raw-img 11 -> 10; story closed |
