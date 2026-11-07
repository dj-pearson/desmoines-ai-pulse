# Lane: android

**Mission.** The Android app matches the web on core journeys and is ready for Play production.

**Owns.** android/app/**

**Backlog.** Open stories in `prd.json` with prefix AND-AUDIT, XPLAT (Android half). See `../README.md` for the loop.

## Handoff

None in flight. AND-AUDIT-026 is code-complete; what it cannot close from here is a device tap on a real
push, and that needs a server-side FCM sender, which does not exist yet (no function in supabase/functions
calls FCM; that is XPLAT-004/XPLAT-006 territory, not this lane). Whoever builds the sender: send `url`, or
`type` + `id`, and both apps route it.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | XPLAT-007 | this commit | Android data export wired to export-user-data; 8 classification tests pass on a JVM harness (Kotlin 2.2.10); app module not compiled (no Android SDK) |
| 2026-11-07 | AND-AUDIT-025 | this commit | /neighborhoods and /neighborhoods/<slug> App Links open the native hub and guide; 44 DeepLink JVM tests pass on a stub harness (kotlinc 2.2.10), mutation run fails the 2 new route tests; app module not compiled (no Android SDK) |
| 2026-11-07 | AND-AUDIT-026 | this commit | Push taps now read the iOS payload keys (url, type + id) and reach hotels and articles; 55 DeepLink JVM tests pass on a stub harness (11 new), a mutation dropping the type key and hotel_detail fails 4; app module not compiled (no Android SDK) |
