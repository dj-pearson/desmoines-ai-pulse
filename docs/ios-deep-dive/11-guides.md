# 11 Local guides: Hotels, Deals, Articles, Best Of, Reviews

Deep dive of 2026-09-28. Paths are relative to `ios/` unless they start with `supabase/` or `scripts/`.
Nothing here was compiled: the container has no Swift toolchain, and every API used was checked against
its definition in the repo (or the supabase-swift source for `PostgrestError`). The new XCTests have not
been run. `check-migrations-parse`, `check-mobile-schema`, `check-migration-safety` (no new findings),
`check-select-star` and `check-unknown-tables` pass.

## What the feature is

- **Stay** (`HotelsView`, `HotelDetailView`, `HotelsViewModel`, `HotelsService`, `AffiliateAdBanner`): the
  `/stay` list and detail with the affiliate Book button.
- **Deals** (`DealsView`, `DealsViewModel`, `DealsService`): active deals, recurring happy hours, the
  `increment_deal_redemption` claim.
- **Articles** (`ArticlesView`, `ArticleDetailView`, `ArticleMarkdownView`): the guides hub and reader.
- **Best Of** (`BestOfView`, `BestOfCategoryView`, `VotingService`, `BestOfWinners`): categories, the
  booth, the leaderboard and the app-wide award badge.
- **Reviews** (`ReviewsSection`, `ReviewsViewModel`, `RatingsService`): the section at the foot of every
  detail screen.

The worst of it: any signed-in account could publish a featured article to every reader; iOS reviews
never loaded (a PostgREST embed with no FK behind it) and signed nameless reviewers as "Des Moines
Insider"; Report wrote to a table nobody reads; the server accepted Best Of votes in closed rounds, for
nonexistent places and as unbounded write-ins, and the award badge crowned a one-vote leader of an open
round; deal times used the phone's zone; and several lists either wiped themselves on a cancelled fetch
or reported a failed refresh as success.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| G11-01 | done | `supabase/migrations/20261015000001_articles_author_publish_guard.sql`: BEFORE INSERT/UPDATE trigger. For a non-admin, non-service caller, an insert is forced to draft with no `published_at`, `view_count` 0, not featured, priority 0; editing a published row raises `published_article_admin_only` (42501); moving a row to published/scheduled is reverted. Reports existing non-admin published rows with a NOTICE, unpublishes nothing. Manual verification SQL is in the header. **Deviation:** the function is SECURITY INVOKER and skips any write where `current_user` is not `anon`/`authenticated`. A DEFINER trigger cannot tell a direct client UPDATE from `increment_article_view()` (itself DEFINER), and would have made every article view on a published row raise. `is_featured`/`priority` are set through `jsonb_populate_record` only when `pg_attribute` has them; the 2026-08-24 snapshot says production does not. |
| G11-02 | done | `supabase/migrations/20261015000003_review_reports_and_author_names.sql` adds `review_author_names(uuid[])` ("Dana M.", only for users with an approved review or the caller). `Services/RatingsService.swift`: explicit column list (`ratingColumns`), no embed, best-effort name lookup. `Models/UserRating.swift`: `moderationStatus`, `authorDisplayName`, `authorName` falls back to "Local reviewer", `shortName(first:last:)`. `is_verified` and the never-shown "Verified" label are gone. |
| G11-03 | done | `reportRating(ratingId:)` calls `report_review(p_rating_id)` via `reportRPCName`/`reportRPCParam`. The same migration bridges old binaries: `rating_abuse_reports` exists in production (snapshot) though no migration creates it, so an AFTER INSERT trigger forwards each report into `content_moderation`. |
| G11-04 | done | `ReviewsViewModel`: `loadError` / `actionError`, `approved(_:)`, `summary(reviews:aggregate:)` (count and average from one source; the fallback ignores pending/rejected), `report` returns `ReportOutcome`, "This review is no longer available." for `review_not_found`. `Views/Reviews/ReviewsSection.swift`: retry only on a load error, composer shows its own error and an error haptic, Report asks signed-out users to sign in, the author sees "Pending review - only you can see this" / "Not published", header is one accessibility element, Insider-only empty copy. |
| G11-05 | done | Composer stars are one adjustable element ("Your rating", "N of 5 stars"); per-star buttons stay for touch. |
| G11-06 | done | `supabase/migrations/20261015000002_votes_guard_and_results.sql`: `vote_entry_key`, `votes_guard` trigger (`voting_closed`, `invalid_write_in`, `unknown_entity`; write-ins trimmed, collapsed, 80 chars, no URLs), `voting_results` merges write-ins by key and withholds those under 3 votes (same return shape). iOS caps the write-in at 80, says "Write-ins appear on the board once 3 people pick them.", and maps the three errors in `BestOfCategoryViewModel.failureMessage`. |
| G11-07 | done | `Models/Voting.swift`: `isVotingOpen(at:)` honours `voting_start`, `closesAt`. `VotingService.voteChangeAvailable = false` mirrors `src/lib/votingStatus.ts`. Re-tapping the current pick is a no-op; 42501 says the earlier vote still counts. After a vote the booth shows only "You voted for X. Votes are final for this round." |
| G11-08 | done | `voting_award_winners(p_min_votes default 5)` in the same migration: ended rounds only, outright winner, ties award nothing. `fetchWinners` calls it; `voting_winners` is untouched for the web and old binaries. |
| G11-09 | done | `fetchResults` throws; `loadError` drives "Couldn't load the rankings." + Retry. Real zero says "No votes yet - be the first to pick the best pizza." Top 10 plus "Show all N" (`VoteResult.visible`). Restaurant/attraction rows open `DeepLinkResolverView`. Closed rounds show a Final results card with the winner and a share link; open rounds show "Voting closes Oct 3"; a successful vote gets a success haptic and "Share my pick". |
| G11-10 | done | `VotingService.fetchVotedCategoryIds`, `BestOfViewModel.votedCategoryIds`, `refreshVoted()` on appear, `progress(categories:voted:now:)`. Hub shows "Your ballot: N of M", a check seal per voted category, "Closed", and "1 vote". |
| G11-11 | done | `Deal.isActiveNow` defaults to `DesMoinesTime.calendar`. `DealsView` wraps the list in a one-minute `TimelineView` and passes the tick's date into each card, since a card whose inputs didn't change would otherwise keep a stale badge. |
| G11-12 | done | New `Views/Deals/DealDetailSheet.swift` (description, When, Terms, copyable code or "Use this deal", "Go to <business>" with an inline failure). Every card opens it. `DealsView.open(_:)` returns Bool; the listing is pushed from the sheet's `onDismiss`, so dismissal and push don't overlap. `Deal.endsDate`, `endsText(now:calendar:)`, `validityText`; cards show "Ends ...". |
| G11-13 | done | `Deal.isSponsored` is false; featured deals get `FeaturedDealBadge` and "Featured" in VoiceOver. |
| G11-14 | done | `supabase/migrations/20261015000004_deal_redemption_signed_in_only.sql`: same signature; outside the date window returns NULL; anonymous calls record nothing. The sheet claims only when signed in, once per sheet. |
| G11-15 | done | `DealsViewModel.refresh()` and `ArticlesViewModel.refresh()` return Bool and set `showingStaleResults`; both views drive the haptic from it and show "Couldn't update. Showing saved ...". Articles tracks `loadedQueryKey` (`queryKey(category:search:)`) and clears rows that belong to another filter on failure; cancellation is not an error. |
| G11-16 | done | New `Services/PostgrestSearch.swift` (`searchOrFilter(columns:query:)`, built on `EventsService.ilikeContains`), used by `HotelsService` and `ArticlesService`. |
| G11-17 | done | `HotelsViewModel`: `totalCount`, `hasActiveSearch`, `resultsCopy`, Bool `refresh`, cancellation ignored, errors keep loaded rows, `resetAndFetch` bumps the generation up front, `loadMoreIfNeeded` guards `isLoading` and a captured offset (also in Articles). `HotelsView`: error-only state with Retry, banner over content, "No stays match ..." with Clear search, "N places to stay", `reloadOnReconnect`. `Sort.rating` is "Hotel class". **Deviation:** a cancelled refresh does clear `isLoading` when the generation is still current (the screen went away); a replacement always bumps the generation first, so it still owns the spinner. |
| G11-18 | done | `Hotel.affiliateBookURL` (via `safeWebURL`, host required), `hasAffiliate` from it, `bookURL` falls back to `websiteURL`; `normalizedURL` deleted. `book(url:)` re-checks scheme and host. |
| G11-19 | done | `Hotel.dialURL`, `Hotel.directionsURL` (shared Restaurant helpers). Detail has Call and Directions rows that work without coordinates; the map lost its own button and `openInMaps` is gone. |
| G11-20 | done | `ArticlesService.recordView(slug:)` calls `increment_article_view` (`viewRPCName`); the client UPDATE is gone. |
| G11-21 | done | New `Views/Articles/ArticleLinkRoute.swift` (port of `classifyArticleHref`). `DeepLinkHandler.destination(for:)` (non-mutating; `handle` uses it). The reader opens site links natively through `DeepLinkResolverView`, falls back to the in-app browser, and drops everything else. "Read on the web" goes straight to the browser so it can't reopen itself. |
| G11-22 | done | `Destination.hotel/.article`, Spotlight and typed routing for both, `/stay/<slug>` and `/articles/<slug>` (`slugOrUUID`, falling back to the hub). `DeepLinkPresentation.hotel/.article`, resolver phases, `HotelsService.fetchHotel(slug:)`, `ItineraryDetailView.presentation(for:)`. Every switch over both enums was found by grep and made exhaustive. |
| G11-23 | done | Reader column capped at 680pt; hero is 16:9 up to 420pt. |
| G11-24 | done | "Ad" label is `.caption2.weight(.semibold)`; link reads "Advertisement: <partner> hotels", hint "Opens in Safari". |
| G11-25 | done | Deal card uses `@ScaledMetric` for the badge and stacks vertically at accessibility sizes; title 3 lines. Leaderboard name 2 lines, percent `.fixedSize()`. |

## Tests added or extended

New: `PostgrestSearchTests`, `ArticleLinkRouteTests`. Extended: `ReviewsTests` (decode, "Local reviewer",
short name, report RPC contract, stale-report copy, header summary), `VotingTests` (window, failure
messages, leaderboard cap, subject name, ballot progress), `DealsTests` (Central default, ends text,
featured not sponsored), `HotelsTests` (book URL safety, directions, dial, results copy, sort label),
`ArticlesTests` (query key, view RPC), `DeepLinkHandlerTests` (hotel/article Spotlight and universal
links, `destination(for:)` side-effect free). None has been run.

## Deferred

- Full-screen images inside the markdown body (plan: deferred).
- Changing a Best Of vote: waits on applying `20260930000003`; flip `VotingService.voteChangeAvailable`
  and the web's `VOTE_CHANGE_AVAILABLE` in that PR.
- A write-in the user just cast is added to the board optimistically and disappears on the next load
  until it has 3 backers. The caption explains it; hiding it locally would need the threshold on the
  client too.
- Existing anonymous `deal_redemptions` rows and the legacy `redemption_count` values stay as they are.

## Rejected findings

None. Every plan item was implemented, two with the deviations noted in G11-01 and G11-17.

## What a human has to do

1. Build and run the iOS unit tests (`xcodegen`, then the DesMoinesInsiderTests scheme).
2. Apply the four migrations. Order matters against the 2026-08-24 snapshot, which has neither
   `increment_article_view` nor `deal_redemptions`: apply `20260919000010` before relying on G11-20, and
   `20260902000013` before `20261015000004` (the new function reads `deal_redemptions`).
3. After `20261015000001`, run the verification block in its header, including the anon call to
   `increment_article_view`, and review the NOTICE count of articles published by non-admin authors.
4. After `20261015000002`, check that a signed-in vote in an open category still succeeds from the web
   booth, and that `select * from voting_award_winners()` is empty until a round with `voting_end` in the
   past has 5+ votes.
