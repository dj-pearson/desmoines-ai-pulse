# Lane: reliability

**Mission.** A broken journey fails CI before it reaches users; bad data is caught before it is shown.

**Owns.** tests/, playwright.*.config.ts, .github/workflows/, scripts/check-*, data-quality functions, docs/PRODUCTION_RUNBOOK.md

**Backlog.** Open stories in `prd.json` with prefix WEB-QA, WEB-CI, WEB-OPS, WEB-QUAL. See `../README.md` for the loop.

## Handoff

None. (When a loop splits work, write here: story id, what's done, what's next, files, traps.)

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-QA-041 | this commit | Done. home-dashboard and home-rails-cls (required smoke lane) were red since 2026-11-02 on a passed opening_date literal; now dated with centralDay(). New check-fixture-dates ratchet (5 literals baselined) in validate and pr-checks. |
| 2026-11-07 | WEB-QA-043 | this commit | Done. business-hub 'a verified claim is listed' was the only red spec in the required smoke lane (full lane on a vite build: 745 passed, 1 failed, 2 skipped); the card-heading locator now uses exact: true so the new "How ... is doing" h4 no longer trips strict mode. |
