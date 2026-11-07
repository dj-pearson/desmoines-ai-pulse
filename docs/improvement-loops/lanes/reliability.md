# Lane: reliability

**Mission.** A broken journey fails CI before it reaches users; bad data is caught before it is shown.

**Owns.** tests/, playwright.*.config.ts, .github/workflows/, scripts/check-*, data-quality functions, docs/PRODUCTION_RUNBOOK.md

**Backlog.** Open stories in `prd.json` with prefix WEB-QA, WEB-CI, WEB-OPS, WEB-QUAL. See `../README.md` for the loop.

## Handoff

WEB-CI-028 (AC2 remainder). Baseline is still layout-integrity and performance.

layout-integrity: the spec now measures what a visitor sees (fixtureBackend, consent seeded, clock pinned; overlap ignores unpainted text, fixed layers and clipped scroll content; obstruction is the union of pinned full-width bands). On a vite build it is 23/24, and the 24th is real: /events at 375x667 pins header 69 + filter bar 87 + day header 40 on top and the 81px bottom nav below, 41% of the screen against the test's 30%. Filed as WEB-UX-058 for the events/ui-ux owner. Promote the spec to the smoke testMatch (and drop it from `.github/e2e-lane-baseline.json`) once that passes; do not exclude the test or raise 30% to get it in.

performance: not started this loop. Its one failure on a vite build without fixtureBackend was 'should not load excessive resources on homepage' (114 scripts, bar < 100); rerun it with the same beforeEach layout-integrity now has before judging it. AC4 (forms/accessibility to required) needs five green CI runs, not a local run.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-QA-041 | this commit | Done. home-dashboard and home-rails-cls (required smoke lane) were red since 2026-11-02 on a passed opening_date literal; now dated with centralDay(). New check-fixture-dates ratchet (5 literals baselined) in validate and pr-checks. |
| 2026-11-07 | WEB-QA-043 | this commit | Done. business-hub 'a verified claim is listed' was the only red spec in the required smoke lane (full lane on a vite build: 745 passed, 1 failed, 2 skipped); the card-heading locator now uses exact: true so the new "How ... is doing" h4 no longer trips strict mode. |
| 2026-11-07 | WEB-QA-044 | this commit | Done. Reproduced with the original specs and the browser clock moved past their dates: playground-detail's nearby-event test fails after 2027-10-01 (1 failed, 15 passed), the subscription specs survive. playground-detail now dates its event with centralDay(30); subscription-portal pins the clock (setFixedTime) and subscription-success installs it (time keeps running for the poll bound). Fixture-dates baseline 5 -> 0. The three specs: 16/16 on a vite build. |
| 2026-11-07 | WEB-CI-028 | this commit | AC2 slice. Two orphans join the required smoke lane, baseline 4 -> 2 (layout-integrity, performance left). restaurant-dietary-filter already passed on a vite build (3/3). add-to-calendar-card failed 2/2: its one fixture is a Sep 8 show on /events/today, so it only ever passed on 2026-09-08; now pins the clock, and anchors on the card's calendar control because the title renders twice. 15/15 with --repeat-each=3; negative control (drop relative z-20 from the card's action row) fails it on the stretched link. AC4 (promote forms/accessibility) still open. |
| 2026-11-07 | WEB-CI-028 | this commit | AC2 slice. layout-integrity on a vite build went 7/24 -> 23/24. 15 of the 17 failures were the spec: collapsed <details> FAQ answers, the cookie banner and the fixed bottom nav counted as overlapping text, chips in overflow-x scroll rows counted as page overflow, and the sticky test summed elements that had not pinned. One real defect fixed (RestaurantInlineFilters' -mx-4 ran the chip row 4px under the sort select at 375px), one filed (WEB-UX-058, /events chrome covers 41% of a 667px screen). 69/72 with --repeat-each=3, only that test failing; negative controls (an injected overlapping paragraph, a 900px div) still fail the detectors. Not promoted yet. |
