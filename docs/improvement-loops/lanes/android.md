# Lane: android

**Mission.** The Android app matches the web on core journeys and is ready for Play production.

**Owns.** android/app/**

**Backlog.** Open stories in `prd.json` with prefix AND-AUDIT, XPLAT (Android half). See `../README.md` for the loop.

## Handoff

XPLAT-012 (Android Apple Sign-In) is code-complete; two things close it, and neither is code:

1. Owner step: the hosted Supabase project's redirect allowlist (Auth > URL Configuration) must accept
   `com.desmoines.aipulse://auth-callback?flow=oauth`. The recovery redirect
   (`...?flow=recovery`) already works, so a wildcard entry may already cover it; if it does not, GoTrue
   falls back to the Site URL and the Apple sign-in finishes on the website instead of in the app. That
   is the failure to look for.
2. Device check: tap Continue with Apple on an Android build, finish in the browser, confirm the app
   comes back signed in with "You're signed in." and that an Apple-only account lands on its existing
   profiles row.

AND-AUDIT-027 (Add to Calendar rules) is code-complete and JVM-tested; one device check closes it.
On an Android build with Google Calendar, tap Add to Calendar on (a) a timed event with no end_date,
expecting a 3-hour block in Central time, and (b) a time_tbd or 19:31:58 row, expecting an all-day
entry on the right date. The trap to look for is (b) landing a day early: all-day intents carry UTC
midnights by CalendarContract's rule, and a calendar app that ignores EXTRA_EVENT_ALL_DAY would show
a 6pm/7pm block the evening before. Saved-row parity with iOS (IOS-AUDIT-FEAT-039) is the next story,
proposed as AND-AUDIT-028; EventCalendarEntry is already shared so it only needs a row action.

Still open under AND-AUDIT-026: a device tap on a real push needs a server-side FCM sender (XPLAT-015).

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | XPLAT-007 | this commit | Android data export wired to export-user-data; 8 classification tests pass on a JVM harness (Kotlin 2.2.10); app module not compiled (no Android SDK) |
| 2026-11-07 | AND-AUDIT-025 | this commit | /neighborhoods and /neighborhoods/<slug> App Links open the native hub and guide; 44 DeepLink JVM tests pass on a stub harness (kotlinc 2.2.10), mutation run fails the 2 new route tests; app module not compiled (no Android SDK) |
| 2026-11-07 | AND-AUDIT-026 | this commit | Push taps now read the iOS payload keys (url, type + id) and reach hotels and articles; 55 DeepLink JVM tests pass on a stub harness (11 new), a mutation dropping the type key and hotel_detail fails 4; app module not compiled (no Android SDK) |
| 2026-11-07 | XPLAT-012 | this commit | Android offers Continue with Apple via the Supabase browser OAuth flow web uses; return lands as AuthCallback.OAuth and is exchanged on the guarded path. 20 AuthCallbackRouter JVM tests pass on a stub harness (4 new; kotlinc 2.2.10), a mutation disabling flow=oauth fails exactly the 4; AuthViewModelTest additions and app module not compiled (no Android SDK, no mockk in cache) |
| 2026-11-07 | AND-AUDIT-027 | this commit | Add to Calendar now uses iOS's rules via a shared EventCalendarEntry: end_date or 3h (was a fixed 2h), all-day on the Des Moines day for time_tbd / 19:31:58 / SeatGeek 03:30 / bare dates, Central time zone. Event decodes end_date, time_tbd, source. 12 JVM tests pass on a stub harness (kotlinc 2.2.10); a mutation making every row timed fails 7. App module not compiled (no Android SDK); no device check |
