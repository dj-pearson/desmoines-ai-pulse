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
(Past rows now also get the overflow, holding Share only; see AND-AUDIT-033.)

AND-AUDIT-033 (Saved-row Share and Remind Me) is code-complete; both slices landed 2026-11-08. Every
Saved event row has Share (util/EventShareText, shared with detail); upcoming rows also have Remind me /
Remove reminder in the overflow and as a TalkBack action, gated by EventReminderTiming.offersReminder,
which event detail's button now uses too. Saved asks POST_NOTIFICATIONS in TabDestinations and shows the
refusal messages (EventReminderTiming.refusedMessage / PERMISSION_DENIED_MESSAGE) in a new snackbar.
Two device checks close it:
  1. Share from a Saved row and from event detail for the same event; the text should match, and the
     link should open event detail on a phone with the app.
  2. On API 33+ with notifications not yet granted, tap Remind me on an upcoming Saved row, allow the
     prompt, and confirm the item now reads Remove reminder; open the event and confirm detail shows the
     bell as set, cancel it there, go Back, and confirm the row reads Remind me again. The trap: the
     Saved ViewModel outlives the trip to detail, so if the row still says Remove reminder, the
     LaunchedEffect(Unit) refreshReminderIds call in TabDestinations is not re-running on return.

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

AND-AUDIT-034 (place share links) is code-complete and JVM-tested. Restaurant, attraction and hotel share
text now ends "Found on Des Moines Insider: <url>" via util/PlaceShareLinks: /restaurants/<slug or id>,
/attractions/<slug> (falling back to the name slug while the slug column may be absent), /stay/<slug>
(no link without a slug). Attraction and Hotel decode `slug` now. One device check closes it: share each
of the three from detail and tap the link on a phone with the app; it should reopen the same screen. The
trap: an attraction whose name collides with another gets a -2 slug from migration 20260919000008, so
if the shared link opens the wrong attraction, the slug column is not in production yet and the name
fallback is in play.

AND-AUDIT-035 (attraction Open on web) is code-complete and JVM-tested. The not-found screen's Open on web
now goes to the loaded row's /attractions/<slug or name slug>, else the opened value if it is a slug, else
the /attractions listing, through PlaceShareLinks.attractionWebUrl; a UUID never reaches the path. One
device check closes it: open an attraction from a favorite or notification whose row has been deleted
(so the screen opens by UUID and shows not-found), tap Open on web, and confirm the in-app web view shows
the attractions listing rather than the web's not-found page.

AND-AUDIT-036 (restaurant open-now in Des Moines time) is code-complete and JVM-tested. Restaurant.isOpenNow
now reads Instant.now() converted to America/Chicago through isOpenAt, so the Restaurants list badge, the
Restaurants Open now filter and the Discover Open now filter all evaluate business_hours on the Central
clock (they all call isOpenNow, which used LocalDateTime.now() in the phone's zone). One device check
closes it: set the phone to Pacific time, open Restaurants when a place opened within the last two
hours Central, and confirm the badge reads Open (it read Closed before). Deals now read the same clock
(AND-AUDIT-037).

AND-AUDIT-037 (deal Active now in Des Moines time) is code-complete and JVM-tested. Deal.isActiveNow reads
the instant in America/Chicago before taking the weekday and minute, so the Deals tab's Active badge and
its Active now filter (both call it with no argument) follow the Des Moines clock, and a window whose end
is before its start (21:00-02:00) runs past midnight on the day it starts, as iOS does. One device check
closes it: set the phone to UTC, open Deals after 7pm Central on a weekday with a weekday happy hour that
ended at 6pm, and confirm it is not marked Active (it used to read the next day's schedule). The trap: a
deal row with start_time but no end_time is treated as all day on its scheduled days, as before and as
iOS does; if one looks active at the wrong hour, check for a missing end_time before suspecting the zone.

AND-AUDIT-038 (article and review dates) is code-complete and JVM-tested. Article.formattedDate and
Review.formattedDate now take the Des Moines day through EventSlug.centralDate (they formatted the +00:00
offset Postgres sends, so anything posted after 6pm/7pm Central was dated tomorrow), an article with no
published_at falls back to created_at as iOS does, and Guides list cards now show "<date> · <n> min read"
under the title as iOS cards do. One device check closes it: open Guides and a guide published in the
evening Central and confirm card and detail show the same, Central, date. Reading time now rounds up as
iOS and web do (AND-AUDIT-039), so a 399-word guide reads 2 min on all three; if a card and the web
disagree by one minute, check the word split (web and Android split on any whitespace, iOS on space,
newline and tab only) before suspecting the rounding.

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
| 2026-11-08 | AND-AUDIT-033 | this commit | Slice 1 of 2: every Saved event row offers Share (overflow item and TalkBack action), and event detail and Saved share one EventShareText whose text now ends with the event page SITE_URL/events/<id>, as iOS shares (it had no link). 5 new EventShareTextTest JVM tests pass on a stub harness (kotlinc 2.2.10), 51/51 across five event-time suites; a mutation dropping the link fails 2. Reminder toggle is the handoff. Compose UI and app module not compiled (no Android SDK); no device check |
| 2026-11-08 | AND-AUDIT-033 | this commit | Slice 2 of 2: upcoming Saved rows offer Remind me / Remove reminder (overflow item and TalkBack action) with detail's timing, so TBA rows get the 9am Central day-of reminder; POST_NOTIFICATIONS asked in the Saved destination, refusals shown in a new Saved snackbar. Detail and Saved share EventReminderTiming.offersReminder / refusedMessage. 6 new EventReminderTimingTest JVM tests pass on a stub harness (kotlinc 2.2.10), 57/57 across five event-time suites; a mutation dropping the past-row guard fails exactly the past-row test. EventDetailReminderTest, Compose UI and app module not compiled (no Android SDK, no mockk in cache); no device check |
| 2026-11-08 | AND-AUDIT-034 | this commit | Restaurant, attraction and hotel shares now end with their site page (/restaurants/<slug or id>, /attractions/<slug or name slug>, /stay/<slug>) through a shared PlaceShareLinks, matching the event share shape; Attraction and Hotel decode slug. 8 new PlaceShareLinksTest JVM tests pass on a stub harness (kotlinc 2.2.10); a mutation linking restaurants by id and dropping the attraction name fallback fails 2. ViewModels, models and app module not compiled (no Android SDK); no device check |
| 2026-11-08 | AND-AUDIT-035 | this commit | Attraction Open on web no longer builds /attractions/<uuid> (the web resolves by slug only, so a UUID-opened not-found screen sent users to a web 404): it uses the loaded row's slug or name slug, else a non-UUID opened value, else the /attractions listing, via a new PlaceShareLinks.attractionWebUrl. 3 new PlaceShareLinksTest JVM tests pass on a stub harness (kotlinc 2.2.10), 11/11 in the suite; a mutation dropping the UUID guard fails exactly the no-UUID test. ViewModel, DetailDestinations and app module not compiled (no Android SDK); no device check |
| 2026-11-08 | AND-AUDIT-032 | this commit | Trip planner start and end dates count from the Des Moines day via a new TripDates.range (EventTimeText.desMoinesToday of the phone's instant), not LocalDate.now(), so a phone on UTC after 7pm Central no longer sends generate-itinerary tomorrow as "today". 4 new TripDatesTest JVM tests pass on a stub harness (kotlinc 2.2.10) with the 52 existing event-time tests; a mutation restoring the device day fails exactly the 2 cross-zone tests. TripPlannerViewModel and app module not compiled (no Android SDK); no device check |
| 2026-11-08 | AND-AUDIT-036 | this commit | Restaurant open/closed now reads the Des Moines wall clock: isOpenNow converts Instant.now() to America/Chicago via a new isOpenAt (was LocalDateTime.now() in the phone's zone), so the list badge and the Restaurants and Discover Open now filters agree with business_hours on any phone. 5 new RestaurantOpenNowTest JVM tests pass on a stub harness (kotlinc 2.2.10); a mutation reading the instant in UTC fails exactly the 4 cross-zone tests. App module not compiled (no Android SDK); no device check |
| 2026-11-08 | AND-AUDIT-037 | this commit | Deal Active now reads the Des Moines clock: isActiveNow converts the instant to America/Chicago before taking weekday and minute (was the phone offset via OffsetDateTime.now()), and a 21:00-02:00 window now runs past midnight as on iOS (it could never match). 2 new DealTest JVM tests pass on a stub harness (kotlinc 2.2.10), 7/7 in the suite; the pre-fix Deal.kt fails exactly the 2 new tests. Existing recurring test inputs moved from Z to -05:00 so they still mean 4pm Central. DealsScreen, DealsViewModel and app module not compiled (no Android SDK); no device check |
| 2026-11-08 | AND-AUDIT-038 | this commit | Article and review dates read the Des Moines day via EventSlug.centralDate (were formatted in the +00:00 offset, so evening posts showed tomorrow); articles fall back to created_at like iOS, and Guides cards now show date and reading time. 8 new ArticleTest and 1 new ReviewTest JVM tests pass on a stub harness (kotlinc 2.2.10), 14/14 across both suites; a mutation restoring offset-day formatting fails 5 of the article tests and the new review test. Compose screens and app module not compiled (no Android SDK); no device check |
| 2026-11-08 | AND-AUDIT-039 | this commit | Guide reading time rounds up (ceil of words / 200, min 1) to match web readTimeLabel and iOS readingMinutes; it truncated, so 201-399 word guides read one minute short on cards and detail. 3 new MarkdownParserTest JVM tests pass on a stub harness (kotlinc 2.2.10), 17/17 across MarkdownParserTest and ArticleTest; restoring truncation fails exactly 2 (rounding boundaries, newline/tab split). App module not compiled (no Android SDK); no device check needed beyond reading a card |
