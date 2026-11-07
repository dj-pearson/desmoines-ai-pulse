# Lane: marketing-growth

**Mission.** Turn visitors into subscribers, subscribers into Insiders, and businesses into advertisers.

**Owns.** src/pages/Advertise*, BusinessHub, ClaimListing, newsletter/digest functions, referral, lifecycle email (_shared/email.ts)

**Backlog.** Open stories in `prd.json` with prefix WEB-ADS, AOS-PROSPECT, AOS-MANAGE. See `../README.md` for the loop.

## Handoff

None. (When a loop splits work, write here: story id, what's done, what's next, files, traps.)

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-ADS-012 | this commit | AC2 done: /advertise shows consented site visits and page views from `get_site_audience_metrics` (migration 20261107000071), GSC block kept as fallback. Owner: apply the migration, regenerate types, drop the PENDING_MIGRATIONS entry. |
| 2026-11-07 | WEB-ADS-016 | this commit | Done: newsletter signups now carry the utm_* campaign the visitor landed on, not only the submit page's query string (footer signups after an SPA navigation stored none). In memory always, in safeStorage for 30 days only with analytics consent; withdrawal removes it. vitest 26/26 across 4 files, two negative controls, eslint, type-check ratchet 61/61. |
| 2026-11-07 | WEB-ADS-017 | this commit | Done: NewsletterSignup's post-submit state says "Check your inbox" and asks for the confirmation click, in the same conditional wording as newsletter-subscribe's one answer, instead of "You're In! Welcome". New vitest 8/8 across all five variants (red 6/8 on the old code and on a heading-only revert), eslint, type-check ratchet 61/61. |
| 2026-11-07 | WEB-ADS-018 | this commit | Done in code: referrals move from signed_up to subscribed when the referred member starts an active paid plan on any platform (trigger on user_subscriptions, migration 20261107000105, with backfill); the invite card shows the paid count. Exercised on a local Postgres 16 stub (backfill, iOS insert, trial conversion, free plan skipped, rewarded untouched, a failing referrals write leaves the subscription write intact; negative control without the exception block loses the subscription row). vitest 8/8 new (4 negative controls), eslint, type-check ratchet 61/61, check-migrations-parse, check-migration-order, check-migration-safety, check-schema. Owner: apply 20261107000105. |
| 2026-11-07 | WEB-ADS-019 | this commit | Done in code: migration 20261107000113 drops the "Users can create referrals" INSERT policy, so a member can no longer insert referrals rows that fake paid conversions or squat on another user's attribution. Exercised on a local Postgres 16 stub: the exploit insert succeeds before, fails 42501 after; a SECURITY DEFINER writer still inserts; the referrer still reads their row; re-apply is a no-op. New vitest 4/4 (3 negative controls, each failing its own case), eslint, type-check ratchet 61/61, check-migrations-parse, check-migration-order, check-migration-safety, check-schema. Owner: apply 20261107000113. |
