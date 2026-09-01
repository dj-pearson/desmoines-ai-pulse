# Branch cleanup, 2026-09-01

Snapshot of the repository's remote branches taken before running
`scripts/branch-cleanup.sh`. 296 branches existed; 294 of them are neither
`main` nor `develop`.

`main` is fully contained in `develop` (`develop` is 5 commits ahead), so
"merged into develop" is the single test the cleanup uses.

- **267 branches** hold no commit that `develop` does not already have. Deleting
  them loses nothing.
- **27 branches** listed below still carry unique commits. The script pushes an
  `archive/<branch>` tag at each tip before deleting, so the work stays
  reachable. Restore any of them with:

  ```
  git branch <name> archive/<name> && git push origin <name>
  ```

There were **no open pull requests** at the time of the snapshot, so nothing
needed closing.

## The 27 branches with unmerged commits

| Last commit | Ahead | Files | Branch | Lead commit |
|---|---:|---:|---|---|
| 2026-08-28 | 1 | 1 | `chore/ralph-progress-notes` | chore(ralph): land the progress notes held back from the audit PRs |
| 2026-03-09 | 1 | 7 | `claude/add-jsonld-event-schema-R6ceP` | feat: add JSON-LD schema for restaurant, attraction, and playground list |
| 2026-08-28 | 1 | 3 | `claude/android-audit-deps` | fix(android): keep the API 36 bump, revert the dependency upgrade |
| 2026-06-30 | 1 | 2 | `claude/android-extract-strings-cgakjx` | refactor(android): extract Settings screen strings to resources (ANDP-07 |
| 2026-03-09 | 1 | 1 | `claude/des-moines-march-content-lvLLp` | feat: add March 2026 Best Events and Best Restaurants articles |
| 2026-08-30 | 1 | 2 | `claude/desmoines-ai-pulse-audit-4mjwrx` | fix(db): re-apply the trip planner schema a ledger row swallowed |
| 2026-07-14 | 8 | 166 | `claude/edge-functions-optimization-7twnr8` | refactor(functions): consolidate 18 AI-content functions behind content  |
| 2026-08-18 | 2 | 8 | `claude/event-offers-and-prerender-order` | fix(prerender): order entity sitemaps by measured search demand |
| 2026-04-01 | 1 | 1 | `claude/fix-build-failure-JhNFc` | ci: restrict Android CI to pushes to main only |
| 2026-03-06 | 1 | 1 | `claude/fix-ses-vendor-errors-wozZt` | fix: show error details in production error boundary for debugging |
| 2025-12-26 | 1 | 1 | `claude/fix-website-errors-CVolY` | fix: use lowercase fetchpriority attribute to fix React warning |
| 2026-07-30 | 2 | 13 | `claude/hotels-affiliate-links-bmf6b6` | feat(ads): deep link the affiliate display banners |
| 2026-06-14 | 5 | 35 | `claude/ios-audit-fixes` | feat(ios): priority-2 features + perf (spotlight, ask pulse, trip planne |
| 2026-06-12 | 1 | 10 | `claude/ios-layout-monetization-plan-5IQFu` | feat: WEB-AUTO-010 - Campaign creative auto-review (spec + quality + bra |
| 2026-06-14 | 3 | 17 | `claude/ios-priority1-wiring` | feat(ios): wire cert pinning into Supabase client; purge image cache on  |
| 2026-08-19 | 11 | 67 | `claude/open-prd-items-review-a9i4p6` | test(xplat): contract tests for the four multi-client edge functions (XP |
| 2026-08-27 | 2 | 2 | `claude/prd-stories-loop-k5jmnk` | Merge main after #373 |
| 2026-06-03 | 1 | 4 | `claude/production-readiness-review-z7G2H` | fix(security): shared error responder to stop error.message leaks (PROD- |
| 2026-05-12 | 1 | 29 | `claude/sync-android-ios-features-V22sx` | feat(android): port iOS Discover 2026 features to Android |
| 2026-06-13 | 34 | 164 | `claude/web-platform-autonomy` | feat: WEB-FEAT-011 - Trip Planner web polish: quota meter, contextual pa |
| 2026-07-13 | 3 | 12 | `claude/web-platform-uplift` | fix: WEB-QA-002 - Fix event listing→detail mismatch (listed events 404 |
| 2025-12-03 | 1 | 14 | `cursor/implement-location-based-features-for-des-moines-insider-claude-4.5-sonnet-thinking-180c` | Refactor: Use InteractiveMap component for playgrounds and restaurants |
| 2026-03-31 | 1 | 1 | `fix/ios-list-selection-unavailable` | chore: update App Store metadata and release notes for version 1.1.6 |
| 2026-06-12 | 1 | 6 | `hotfix/ios-build-fix` | update |
| 2026-02-26 | 26 | 810 | `ralph/enterprise-readiness` | feat: Enhance event processing and add map component |
| 2026-07-27 | 1 | 5 | `refactor/edge-fn-consolidation` | chore: ignore entire supabase/.temp/ directory |
| 2026-05-13 | 4 | 25 | `release/android-v1.0.1` | chore(android): bump versionCode to 2 for Play resubmission |

## What is worth a look before it becomes tag-only history

Four of these are substantial and never landed:

- `claude/edge-functions-optimization-7twnr8` - 166 files, consolidates 42 edge
  functions behind routers. Deleting 6,002 lines. No PR was ever opened.
- `claude/web-platform-autonomy` - 164 files, +18,833. PR #220 merged an earlier
  tip; PR #224 was closed without merging, leaving 34 commits stranded.
- `claude/open-prd-items-review-a9i4p6` - 67 files, cross-client edge function
  contract tests plus model-id fixes. No PR.
- `claude/hotels-affiliate-links-bmf6b6` - 13 files, hotel affiliate program
  config and deep-linked ad banners. No PR.

The rest are one- or two-commit remainders left after a PR merged, or
abandoned experiments. `ralph/enterprise-readiness` reports 549,805 insertions
across 810 files, which is a committed build or vendor tree rather than
reviewable work.
