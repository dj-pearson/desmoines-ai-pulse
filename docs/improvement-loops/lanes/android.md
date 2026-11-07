# Lane: android

**Mission.** The Android app matches the web on core journeys and is ready for Play production.

**Owns.** android/app/**

**Backlog.** Open stories in `prd.json` with prefix AND-AUDIT, XPLAT (Android half). See `../README.md` for the loop.

## Handoff

None in flight. XPLAT-007's remaining steps (deploy export-user-data, the iOS entry point, web's table list,
a device check) are not Android work and are tracked on the story itself.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | XPLAT-007 | this commit | Android data export wired to export-user-data; 8 classification tests pass on a JVM harness (Kotlin 2.2.10); app module not compiled (no Android SDK) |
| 2026-11-07 | AND-AUDIT-025 | this commit | /neighborhoods and /neighborhoods/<slug> App Links open the native hub and guide; 44 DeepLink JVM tests pass on a stub harness (kotlinc 2.2.10), mutation run fails the 2 new route tests; app module not compiled (no Android SDK) |
