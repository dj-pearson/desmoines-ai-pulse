# Lane: ui-ux

**Mission.** Every screen looks finished, behaves predictably, and passes WCAG 2.1 AA on mobile first.

**Owns.** src/components/**, src/pages/** (presentation only), tailwind.config.ts, tests/accessibility*

**Backlog.** Open stories in `prd.json` with prefix WEB-UX. See `../README.md` for the loop.

## Handoff

None. (When a loop splits work, write here: story id, what's done, what's next, files, traps.)

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-UX-052 | this commit | /social forum, thread and group rows were div onClick with no tab stop; now stretched buttons in the row heading, focus moves to the opened view heading and back to the row. vitest 2713/2713 (new spec red on old code), type ratchet 61/61, check-ui-craft 3 <= 7. WEB-UX-037 left open: still gated on the owner's SiteDirectory SEO call. |
