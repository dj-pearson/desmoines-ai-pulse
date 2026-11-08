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
a 6pm/7pm block the evening before.

AND-AUDIT-028 (Saved-row Add to Calendar) is code-complete; one device check closes it. Upcoming Saved
event rows have an overflow button (MoreVert under the heart) with Add to Calendar and a TalkBack custom
action of the same name; past rows and rows with no parseable date get neither. The intent and the
"No calendar app available." toast now live in util/EventCalendarIntent, which event detail also uses.
On a build: tap the overflow on an upcoming saved row and confirm the calendar insert matches what event
detail's Add to Calendar produces for the same event; with TalkBack on, confirm the row's actions menu
lists Add to Calendar and Remove from saved. The trap: the overflow sits inside the card's clickable, so
if a tap on it opens event detail instead of the menu, the IconButton is not consuming the click.
Share and Remind Me on Saved rows (also in iOS's context menu) are not built; proposed as a new story.

Still open under AND-AUDIT-026: a device tap on a real push needs a server-side FCM sender (XPLAT-015).

AND-AUDIT-029 (TBA reminders) is code-complete; one device check closes it. On a build, open a
time_tbd or 19:31:58 row before 9am on its day, tap Remind Me, and confirm the notification arrives at
9:00 Central reading "<title> is today", then reboot and confirm BootCompletedReceiver replays it at
9:00 (the record now carries triggerAtMillis; records from older installs fall back to an hour before).

AND-AUDIT-030 (Des Moines days everywhere) is code-complete and JVM-tested. The day badge, featured
card, related chips, featured-card label, urgencyLabel, map pin colour, Saved past/upcoming split and
Weekend grouping now read the Des Moines day via EventTimeText, and the Weekend fetch is bounded at
Central midnights with an offset. One device check closes it: open Weekend on a Saturday with a 7pm+
show and confirm it sits under Saturday (it used to sit under Sunday, and a 7pm+ Sunday show was not
fetched at all).

AND-AUDIT-031 (preset bounds) is code-complete and JVM-tested. Events tab and Discover presets now go
through EventTimeText.presetBounds (Central midnights with offset, today from America/Chicago), and the
"upcoming" floor in EventsRemoteDataSource.todayIso is Central midnight instead of the device day at
UTC midnight. One device check closes it: after 7pm Central, pick Today on the Events tab and confirm a
tonight 7pm+ show is listed and last night's 7pm+ show is not. The trap: the floor change also drops
last night's late shows from Featured, Related and Nearby until midnight, which is intended; if a list
goes empty in the evening, check the date column on those rows before suspecting the bound.

## Loop log

| Date | Story | Commit | Result |
|---|---|---|---|
| 2026-11-07 | XPLAT-007 | this commit | Android data export wired to export-user-data; 8 classification tests pass on a JVM harness (Kotlin 2.2.10); app module not compiled (no Android SDK) |
| 2026-11-07 | AND-AUDIT-025 | this commit | /neighborhoods and /neighborhoods/<slug> App Links open the native hub and guide; 44 DeepLink JVM tests pass on a stub harness (kotlinc 2.2.10), mutation run fails the 2 new route tests; app module not compiled (no Android SDK) |
| 2026-11-07 | AND-AUDIT-026 | this commit | Push taps now read the iOS payload keys (url, type + id) and reach hotels and articles; 55 DeepLink JVM tests pass on a stub harness (11 new), a mutation dropping the type key and hotel_detail fails 4; app module not compiled (no Android SDK) |
| 2026-11-07 | XPLAT-012 | this commit | Android offers Continue with Apple via the Supabase browser OAuth flow web uses; return lands as AuthCallback.OAuth and is exchanged on the guarded path. 20 AuthCallbackRouter JVM tests pass on a stub harness (4 new; kotlinc 2.2.10), a mutation disabling flow=oauth fails exactly the 4; AuthViewModelTest additions and app module not compiled (no Android SDK, no mockk in cache) |
| 2026-11-07 | AND-AUDIT-027 | this commit | Add to Calendar now uses iOS's rules via a shared EventCalendarEntry: end_date or 3h (was a fixed 2h), all-day on the Des Moines day for time_tbd / 19:31:58 / SeatGeek 03:30 / bare dates, Central time zone. Event decodes end_date, time_tbd, source. 12 JVM tests pass on a stub harness (kotlinc 2.2.10); a mutation making every row timed fails 7. App module not compiled (no Android SDK); no device check |
| 2026-11-07 | AND-AUDIT-029 | this commit | TBA rows get a 9am Central day-of reminder ("is today") instead of one an hour before the 19:31:58 / 03:30 placeholder; detail, cards, map popup and Saved rows show "Time TBA" in Des Moines time via a shared EventTimeText. 13 new JVM tests pass on a stub harness (kotlinc 2.2.10), 12 EventCalendarEntry tests still pass; a mutation using the timed rule for every row fails 5, one formatting in the arrival offset fails 1. EventDetailReminderTest additions and app module not compiled (no Android SDK, no mockk in cache); no device check |
| 2026-11-07 | AND-AUDIT-030 | this commit | Day badge, featured card, related chips, urgency label, map pin, Saved past/upcoming and Weekend grouping read the Des Moines day through EventTimeText; Weekend fetch bounded at Central midnight. 12 new JVM tests pass on a stub harness (kotlinc 2.2.10), 25 existing EventCalendarEntry/EventReminderTiming tests still pass; a mutation reading the UTC day fails 6 of the new 12. WeekendViewModelTest addition and app module not compiled (no Android SDK); no device check |
| 2026-11-08 | AND-AUDIT-031 | this commit | Events tab and Discover date presets are bounded at Des Moines midnights with an offset via EventTimeText.presetBounds (was bare local timestamps PostgREST read as UTC), today comes from America/Chicago, and the upcoming floor is Central midnight. 6 new DatePresetBoundsTest JVM tests pass on a stub harness (kotlinc 2.2.10) with the 37 existing EventCalendarEntry/EventReminderTiming/EventDesMoinesDay tests; a mutation restoring bare local bounds fails 3 of the 6. ViewModels, EventsRemoteDataSource and app module not compiled (no Android SDK); no device check |
| 2026-11-08 | AND-AUDIT-028 | this commit | Upcoming Saved event rows offer Add to Calendar from an overflow menu and a TalkBack custom action, built from the same EventCalendarEntry as event detail via a new shared EventCalendarIntent (intent + no-calendar toast); past and undated rows offer neither. 3 new EventCalendarEntryTest JVM tests pass on a stub harness (kotlinc 2.2.10), 46/46 across the four event-time suites; a mutation ignoring isPast fails exactly the past-row test. Compose UI and app module not compiled (no Android SDK); no device check |
