---
name: improve-loop
description: Run one continuous-improvement loop in a named lane (events, restaurants, ui-ux, performance, security, seo-geo, marketing-growth, features, reliability, ios, android). Ships exactly one improvement, records it in prd.json and the lane file, and commits. Use when the user says "/improve-loop <lane>", "run a loop on <lane>", or asks to continue improvement loops.
---

# improve-loop

Argument: a lane name. If missing, pick the lane whose last loop-log entry in
`docs/improvement-loops/lanes/` is oldest.

1. Read `docs/improvement-loops/README.md` (the protocol) and
   `docs/improvement-loops/lanes/<lane>.md`.
2. If the lane file has a **Handoff**, continue it. Otherwise pick the
   highest-priority open story (`"passes": false`) in the lane's prefixes in
   `prd.json`; if none is worth doing, audit the lane's paths and add the single
   most valuable gap as a new story.
3. Size to one commit (~400 lines, one concern). If larger, do slice 1 and write
   the rest into the Handoff.
4. Implement. Reproduce bugs first. Follow `CLAUDE.md`.
5. Verify with the checks in the README's "Checks by area" table. Never weaken a
   test or baseline.
6. Record: update the story in `prd.json` (`passes`, `notes` with how it was
   verified) unless you were told an orchestrator owns `prd.json`; add any new
   stories found; add one line to the lane's loop log; update or clear Handoff.
7. Commit: `<type>(<scope>): <what> (<STORY-ID>)`. One loop, one commit.

Report: story id, commit sha, what was verified and how, what's handed off.
