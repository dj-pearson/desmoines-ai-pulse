# Lane: features

**Mission.** Platform features an enterprise-grade product is expected to have: accounts, notifications, personalization, admin tooling.

**Owns.** src/pages/Profile*, Dashboard, Admin*, src/contexts/, notification + personalization hooks and functions

**Backlog.** Open stories in `prd.json` with prefix WEB-FEAT (platform stories), WEB-BE. See `../README.md` for the loop.

## Handoff

None. (When a loop splits work, write here: story id, what's done, what's next, files, traps.)

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | WEB-FEAT-020 | this commit | Done. Decision (b): no web push. Deleted the unreachable Capacitor push hook (direct device_tokens write with columns the table lacks) and the dead local-notification branch in EventReminderSettings; guard test keeps device_tokens writes out of src. |
