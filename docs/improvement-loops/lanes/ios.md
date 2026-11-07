# Lane: ios

**Mission.** The iOS app matches the web on core journeys and never gives App Review a reason to reject it.

**Owns.** ios/DesMoinesInsider/**, ios/DesMoinesInsiderTests/**, ios/project.yml

**Backlog.** Open stories in `prd.json` with prefix IOS-AUDIT-*, XPLAT (iOS half). See `../README.md` for the loop.

## Handoff

None. (When a loop splits work, write here: story id, what's done, what's next, files, traps.)

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | IOS-AUDIT-FEAT-038 | this commit | `/neighborhoods/<slug>` links open that guide natively (were the hub); 5 new unit tests; not compiled (no Xcode here) |
| 2026-11-07 | XPLAT-007 (iOS half) | this commit | Settings > Your Data > Export My Data calls export-user-data and saves the JSON through the system file exporter; 404 (not deployed) points to privacy@; 9 new unit tests; not compiled (no Xcode here) |
| 2026-11-07 | IOS-AUDIT-PERF-032 | this commit | QueryCache filenames are SHA-256 of the key (Events search text was reaching them via `q-<searchText>`); old names renamed on first launch, entry and TTL kept; 4 new unit tests; not compiled (no Xcode here) |
| 2026-11-07 | IOS-AUDIT-FEAT-039 | this commit | Upcoming Saved event rows offer Add to Calendar (context menu + VoiceOver action); EKEvent rules extracted to `EventCalendarEntry`/`EventCalendarWriter`, used by event detail too; a denial on either screen now offers Open Settings; 10 new unit tests; not compiled (no Xcode here) |
| 2026-11-07 | IOS-AUDIT-FEAT-040 | this commit | `/best-of/<slug>` links (shared by every category screen, claimed in the AASA) open that category natively, were the hub; inactive/unknown slug still shows the hub, a failed read offers a retry; 6 new unit tests; not compiled (no Xcode here) |
