# Lane: performance

**Mission.** Hold LCP < 2.5s, CLS < 0.1, critical path < 200KB gzipped, and the fewest requests per page.

**Owns.** vite.config.ts, src/App.tsx (lazy routes), hooks with queries, bundle-budget-baseline.json, dom-budget-baseline.json

**Backlog.** Open stories in `prd.json` with prefix WEB-PERF. See `../README.md` for the loop.

## Handoff

WEB-PERF-041 AC3 (route reader-facing `<img>` through OptimizedImage). Done
2026-11-07: the six card-grid images that read a database URL - HotelCard
(/stay, now with first-row `priority`), DealCard, EventHotelCallout (80px
thumb, widths 80/160/240), PseoLiveListings, and AdvancedSearchPage grid and
list views. `.github/raw-img-baseline.json` is 24 -> 17.

Next: most of the 17 left are not worth converting (local assets, object-URL
previews, logos, avatars: OptimizedImage adds a wrapper and no bytes). Check
each before converting: EventPhotoGallery (2, user-uploaded `media_url`, the
best remaining candidate), ImageViewer, EventReviewSystem, RatingSystem (3),
SocialProofBadge. GuidesPage's one is the `/api/placeholder` broken-image bug,
which needs real images, not OptimizedImage. Trap: each conversion adds 2-3
elements per card (wrapper div, picture, placeholder), so check
`check-dom-budget` on routes already over 1,500 (WEB-PERF-023).

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-PERF-041 | this commit | Six DB-image cards on OptimizedImage (transform srcset); /stay first row eager and added to check-lcp-priority; raw-img 24 -> 17; story stays open for the tail |
