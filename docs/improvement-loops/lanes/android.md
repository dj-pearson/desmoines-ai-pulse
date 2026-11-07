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

Still open under AND-AUDIT-026: a device tap on a real push needs a server-side FCM sender (XPLAT-015).

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | XPLAT-007 | this commit | Android data export wired to export-user-data; 8 classification tests pass on a JVM harness (Kotlin 2.2.10); app module not compiled (no Android SDK) |
| 2026-11-07 | AND-AUDIT-025 | this commit | /neighborhoods and /neighborhoods/<slug> App Links open the native hub and guide; 44 DeepLink JVM tests pass on a stub harness (kotlinc 2.2.10), mutation run fails the 2 new route tests; app module not compiled (no Android SDK) |
| 2026-11-07 | AND-AUDIT-026 | this commit | Push taps now read the iOS payload keys (url, type + id) and reach hotels and articles; 55 DeepLink JVM tests pass on a stub harness (11 new), a mutation dropping the type key and hotel_detail fails 4; app module not compiled (no Android SDK) |
| 2026-11-07 | XPLAT-012 | this commit | Android offers Continue with Apple via the Supabase browser OAuth flow web uses; return lands as AuthCallback.OAuth and is exchanged on the guarded path. 20 AuthCallbackRouter JVM tests pass on a stub harness (4 new; kotlinc 2.2.10), a mutation disabling flow=oauth fails exactly the 4; AuthViewModelTest additions and app module not compiled (no Android SDK, no mockk in cache) |
