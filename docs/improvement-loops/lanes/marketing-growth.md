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
