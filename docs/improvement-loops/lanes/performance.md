# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

None. WEB-PERF-041 closed in loop 3. The 11 raw `<img>` left in
`.github/raw-img-baseline.json` are deliberate, and none reads a database
image column (check-raw-img now fails on that in any scanned file, not only
src/pages): AffiliateAdBanner (external creative, box sized from the placement
key), MFAEnrollmentDialog (QR data URL), EventPhotoUpload and
EventSubmissionForm (object-URL previews), Footer (Apple badge), OptimizedLogo
(local asset), GuidesPage (WEB-PERF-058), and four in code nothing imports:
EventPhotoGallery (2), ImageViewer, SocialProofBadge's AttendeeAvatars.
Deleting that dead code is hygiene, not performance (it is tree-shaken), and
EventSocialHub is still read by a Deno test, so it is left to a cleanup story.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-PERF-041 | f5ae9fd0 | Six DB-image cards on OptimizedImage (transform srcset); /stay first row eager and added to check-lcp-priority; raw-img 24 -> 17; story stays open for the tail |
| 2026-11-07 | WEB-PERF-041 | this commit | RatingSystem review photos (80px preview, 96px thumbs, lightbox) on OptimizedImage with box-sized transform widths; raw-img 17 -> 14; EventPhotoGallery found dead; story stays open |
| 2026-11-07 | WEB-PERF-041 | this commit | Map popup, event-review dialog and article-editor previews on OptimizedImage with box-sized widths; DB-image hard gate widened from src/pages to every scanned file (negative control fires); raw-img 14 -> 11, all deliberate; story closed |
