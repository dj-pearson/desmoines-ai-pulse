# Continuous improvement loops

Several agents improve Des Moines Insider (web, iOS, Android) at the same time.
Each agent owns one **lane** and ships **one improvement per loop**. Work that
doesn't fit one loop is split, and the next loop in that lane picks it up from
the handoff note.

Run one loop by hand with `/improve-loop <lane>`. Run a round across lanes with
a Workflow (one agent per lane, each in its own worktree), or on a schedule.

## Lanes

| Lane | Owns | prd.json prefixes |
|---|---|---|
| `events` | Event discovery, detail, calendar feeds, ingestion quality, submissions | `WEB-FEAT` (events), `XPLAT` (events) |
| `restaurants` | Restaurant discovery, detail, open-now, menus, dietary, deals | `WEB-FEAT` (restaurants) |
| `ui-ux` | Visual polish, interaction, empty/error states, accessibility (WCAG 2.1 AA) | `WEB-UX` |
| `performance` | Bundle size, LCP/CLS/INP, query count, caching, egress | `WEB-PERF` |
| `security` | RLS, edge-function auth, secrets, CSP, abuse limits, privacy | `WEB-SEC`, `WEB-AUTH`, `WEB-LEGAL` |
| `seo-geo` | Meta, structured data, sitemaps, internal links, AI-answer (GEO) content | `WEB-SEO` |
| `marketing-growth` | Acquisition, retention, email, referral, advertiser funnel, business claims | `WEB-ADS`, `AOS-PROSPECT`, `AOS-MANAGE` |
| `features` | Accounts, notifications, personalization, enterprise/admin features | `WEB-FEAT`, `WEB-BE` |
| `reliability` | Tests, CI lanes, data quality, observability, ops runbooks | `WEB-QA`, `WEB-CI`, `WEB-OPS`, `WEB-QUAL` |
| `ios` | `ios/` SwiftUI app: parity, crashes, UX, App Store compliance | `IOS-AUDIT-*`, `XPLAT` (iOS half) |
| `android` | `android/` Kotlin app: parity, crashes, UX, Play compliance | `AND-AUDIT`, `XPLAT` (Android half) |

Each lane has a file in `lanes/` with its mission, the paths it owns, and its
**handoff** section: the in-flight multi-loop item, if any.

## The backlog

`prd.json` at the repo root is the one backlog. Don't start a second one. A
story is open while `"passes": false`. New findings become new stories using the
lane's prefix and the next free number.

## One loop

1. **Resume or pick.** If the lane file has a handoff, continue it. Otherwise
   pick the highest-priority open story in the lane's prefixes. If none fits,
   audit the lane's paths for the single most valuable gap and add it as a story.
2. **Size it.** One loop is one reviewable commit (rough ceiling: ~400 changed
   lines, one concern). Bigger than that, split it: do slice 1 now, write the
   rest as a handoff in the lane file (what's done, what's next, the files,
   the trap you found).
3. **Reproduce, then change.** Bugs get reproduced first. Follow `CLAUDE.md`:
   server decides money, backward-compatible migrations and edge functions,
   `safeStorage`, `handleError`, no `any`.
4. **Verify.** Run the checks that cover what you touched (below). Never skip,
   disable or loosen a test or baseline to get green.
5. **Record.** Mark the story `"passes": true` with a `notes` line saying how
   it was verified, or add the new stories you found. Update the lane file's
   loop log (one line) and handoff.
6. **Commit.** Conventional commit with the story id, e.g.
   `fix(events): ... (WEB-FEAT-035)`. One loop, one commit.

## Checks by area

| Touched | Run |
|---|---|
| `src/**` | `npx eslint <files>`, `npm run type-check`, the `check-*` scripts named in `validate` that relate to the change |
| `supabase/functions/**` | `npm run type-check:functions`, `npm run check-edge-auth`, Deno tests for that function if present |
| `supabase/migrations/**` | `npm run check-migrations-parse`, `npm run check-migration-order` |
| A user journey | the relevant spec in `tests/`; if it should guard the journey, add it to a CI lane (`npm run check-e2e-lanes`) |
| `ios/**`, `android/**` | No Xcode/Gradle in cloud sessions. Keep changes small, mirror existing patterns, and say plainly in the notes that it was not compiled |

`npm run validate` is the full gate (~3.5 min cold). Run it before a round is
pushed, not in every loop.

## Running a round in parallel

Agents in the same round work in separate git worktrees and must not edit
`prd.json` or each other's lane files; they return their story updates and the
orchestrator applies them once, which avoids nine-way merge conflicts in one
JSON file. Each agent commits in its worktree; the orchestrator cherry-picks
the commits onto the round branch, runs `npm run validate`, and pushes.

### Round runbook (what the scheduled task does)

The rolling branch is `claude/continuous-improvement-loops-76i72u`. Rounds stack
on it so each round sees the last one's `prd.json` and handoffs; a PR into
`develop` takes whatever has accumulated. If that branch's PR has merged,
restart it from `develop` (or `main` if there is no `develop`).

1. `git fetch origin`, check out the rolling branch, `npm ci`.
2. Run the saved workflow `improvement-loop-round` with
   `{ repo, lanes: [all eleven], date, trailers, base }`, where `base` is
   `git rev-parse HEAD` of the rolling branch.
3. Save its result array to a scratch file and run
   `node scripts/merge-loop-round.mjs <results.json> <landed.json>`. It assigns
   real ids to new stories (lanes name them `<PREFIX>-NEW-<lane>` so parallel
   lanes cannot collide), cherry-picks each lane's commit with the placeholder
   rewritten, takes the lane's version on a lane-file conflict, and skips a
   lane on any other conflict.
4. Remove the agent worktrees, then `npm run validate`, `npx vitest run`,
   `npm run check-edge-types` and `npm run check-edge-auth` (the last two are
   not in `validate`, and each has caught a lane regression that it missed).
   When a ratchet reports files now under their baseline, shrink it
   (`--update`) so the gain can't quietly come back.
   If either fails, find the lane commit that broke it, `git revert` it, drop
   that lane from `<landed.json>`, and re-run until both pass. Then
   `node scripts/apply-loop-results.mjs <landed.json>`.
5. Add a row to the round log, commit `docs(prd): record improvement-loop round N`,
   push, and remove the agent worktrees (`git worktree remove --force`).

### Continuous mode

The scheduler's minimum interval is one hour, and a round takes about 30
minutes, so the scheduled session runs rounds back to back instead of one per
fire. Only one session may run rounds at a time; `scripts/loop-lock.sh` holds
that lock as the remote branch `loops-lock`.

- On start: `scripts/loop-lock.sh acquire <session-id>`. Exit 1 means another
  session is running rounds; stop immediately and report "lock held".
- Before every round: `scripts/loop-lock.sh refresh <session-id>`. If it exits 1,
  another session took over; stop.
- Before each round, `git fetch` and fast-forward the rolling branch.
- Stop starting new rounds 4 hours after the session began, then
  `scripts/loop-lock.sh release <session-id>`. The next hourly fire takes over.
- A lock with no heartbeat for 75 minutes counts as abandoned.

## Round log

| Date | Branch | Lanes | Result |
|---|---|---|---|
| 2026-11-07 | claude/continuous-improvement-loops-76i72u | events, restaurants, ui-ux, performance, security, seo-geo, marketing-growth, ios, android | 9 commits; 5 stories closed, 4 split with handoffs, 12 new stories. validate exit 0, vitest 2737/2737 |
| 2026-11-07 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits; 8 stories closed, 3 split, 7 new stories. validate exit 0, vitest 2794/2794 |
| 2026-11-07 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits; 8 stories closed, 3 split. validate exit 0, vitest 2808/2808 |
| 2026-11-07 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits; 8 stories closed, 3 split. validate exit 0, vitest 2833/2833 |
| 2026-11-07 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits, no merge conflicts; 9 stories closed, 2 split. validate exit 0, vitest 2857/2857 |
| 2026-11-07 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits; 8 stories closed, 3 split, 10 new. Three lanes picked WEB-FEAT-041; renumbered to 042/043. validate exit 0, vitest 2909/2909 |
| 2026-11-08 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits (features hand-merged over a ui-ux conflict); 10 stories closed, 1 split. validate exit 0, vitest 2958/2958 |
| 2026-11-08 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits (reliability hand-merged over a schema-baseline conflict); 10 closed, 1 split; check-edge-types fixed. validate exit 0, vitest 2993/2993 |
| 2026-11-08 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits, all merged by script; 9 closed, 2 split. validate exit 0, vitest 3036/3036, check-edge-types clean |
| 2026-11-08 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits, all merged by script; 9 closed, 2 split. validate exit 0, vitest 3072/3072, check-edge-types clean |
| 2026-11-08 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits; 9 closed, 2 split; log-error discarded-error fix and baseline 106 -> 94. validate exit 0, vitest 3113/3113 |
| 2026-11-08 | claude/continuous-improvement-loops-76i72u | all eleven | 11 commits, 1 reverted (features duplicated events on WEB-FEAT-058); 9 closed, 1 split. validate exit 0, vitest 3147/3147, edge checks clean |
