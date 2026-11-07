# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

WEB-PERF-041 AC3 (route reader-facing `<img>` through OptimizedImage). Done
so far: six DB-image card grids (loop 1), then RatingSystem's three
review-photo images (loop 2: 80px upload preview, 96px thumbnails, lightbox).
`.github/raw-img-baseline.json` is 24 -> 17 -> 14.

Checked and not worth converting: EventPhotoGallery (2) is dead code - its
only importer, EventSocialHub, is imported by nothing in `src/`; delete both
rather than optimise them. The 14 left are local assets, object-URL previews,
logos and avatars (OptimizedImage adds a wrapper and no bytes). Candidates
still worth a look: SocialProofBadge (32px attendee avatars on every
EventCard - only if the URLs are storage or /media/, not Google profile
URLs), ImageViewer, EventReviewSystem (admin-only via AdminTools). GuidesPage's
one is WEB-PERF-058 (`/api/placeholder`), which needs real images. Once those
are triaged the story can close with the rest recorded as deliberate.
Trap: each conversion adds 2-3 elements, so check `check-dom-budget` on routes
over 1,500 (WEB-PERF-023).

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-PERF-041 | f5ae9fd0 | Six DB-image cards on OptimizedImage (transform srcset); /stay first row eager and added to check-lcp-priority; raw-img 24 -> 17; story stays open for the tail |
| 2026-11-07 | WEB-PERF-041 | this commit | RatingSystem review photos (80px preview, 96px thumbs, lightbox) on OptimizedImage with box-sized transform widths; raw-img 17 -> 14; EventPhotoGallery found dead; story stays open |
