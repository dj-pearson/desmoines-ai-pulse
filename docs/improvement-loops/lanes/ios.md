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
| 2026-11-07 | IOS-AUDIT-FEAT-041 | this commit | Filtered `/events?q=&category=&location=&price=&preset=` links (saved-search alert email, web hub tiles, `?search=` alias) open Search on Events with those filters, were Home with the filters dropped; mapping shared with `SavedSearch.structuredFilters`; AASA now claims bare `/events`; 8 new unit tests; not compiled (no Xcode here) |
| 2026-11-07 | IOS-AUDIT-FEAT-042 | this commit | `this-week`, `next-week`, `next-7-days` (and `next_7_days`) in saved searches and /events links now set a date on iOS, were no filter; This Week is today to Sunday and Next Week is Monday to Sunday as on the web, the old rolling 7 days is the new Next 7 Days (Discover's fallback keeps it); iOS saves write those slugs too; 8 new unit tests; not compiled (no Xcode here) |
| 2026-11-08 | IOS-AUDIT-FEAT-043 | this commit | `/restaurants/open-now`, `/new` and `/dietary/<diet>` (plus open-now's `?diet=` and the legacy `?diet=` index) open Dining with Open Now, New & coming soon or that diet applied, were the unfiltered tab; the link replaces earlier filters and never toggles off; kosher (no Dining key) still opens the plain tab; 7 new unit tests; not compiled (no Xcode here) |
| 2026-11-08 | IOS-AUDIT-FEAT-044 | this commit | Dining diet keywords now copy the web's DIETS (the `/restaurants/dietary` table) instead of DIETARY_KEYWORDS: Kosher added to the table and the Dietary pill, keto also matches "ketogenic"; `/restaurants/dietary/kosher` opens Dining with kosher applied, was the plain tab; vitest `iosDietaryParity.test.ts` reads the Swift and fails on drift (negative-controlled); 3 new XCTest cases; not compiled (no Xcode here) |
| 2026-11-08 | IOS-AUDIT-FEAT-045 | this commit | `/events/series/<slug>` (the 20 annual-event pages, in the sitemap and linked from every edition) opens that page on the web, was an event detail for the slug "series" that found nothing; bare or malformed series links open Home; "series" added to `EventSlug.landingSegments`, which the App Clip shares; vitest `iosEventLinkParity.test.ts` fails when a literal `/events/<segment>` route is missing from or stale in that set (negative-controlled); 5 new XCTest cases; not compiled (no Xcode here) |
