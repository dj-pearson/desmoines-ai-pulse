# 12 Platform: app shell, deep links, networking, crash reporting, push, Spotlight, version check, App Clip

Deep dive of 2026-09-28. Paths are relative to `ios/` unless they start with `supabase/`, `public/` or `scripts/`.
Nothing here was compiled: the container has no Swift toolchain or Deno, and every API used was checked
against its definition in the repo. The new XCTests and the new Deno test have not been run; the pure
TypeScript in `supabase/functions/_shared/errorPolicy.ts` was exercised with Node. `check-aasa`,
`check-privacy-manifest`, `check-migrations-parse`, `check-migration-safety` (no new findings),
`check-mobile-schema-usage`, `check-unknown-tables` and `check-select-star` pass, and `check-edge-types`
reports no new error in a file this change touched.

## What the feature is

The app entry (`App/DesMoinesInsiderApp.swift`: consent, onboarding, verify email, force update, session
timeout, biometric lock) and `Views/MainTabView.swift` (tabs, iPad sidebar, global sheets, deep-link
routing), `DeepLinkHandler` and universal links, the networking and security services, crash reporting
into `log-error`, push registration, Spotlight, the version check, the in-app browsers, `CachedAsyncImage`,
the offline banner, and the App Clip (`DesMoinesInsiderClip/`).

The worst of it: every event link the website emits (`/events/<title>-<yyyy-mm-dd>`) opened Home, and
several claimed paths (`/search?q=`, `/attractions`) opened the app to nothing. The biometric lock tore
down the whole tab UI on every app switch. The App Clip ignored its invocation URL, showed hidden and
merged rows, and printed dates in the phone's zone. `device_tokens` was never created.

## What changed, by plan item

| ID | Status | Change |
|---|---|---|
| P12-01 | done | New `Services/EventSlug.swift` (`titleSlug`, `slug(title:start:)`, `parseDate`, `titlePart`, `Candidate`, `pick` (port of `pickSlugCandidate`), `landingSegments`, `isMonthPage`, `linkId`, `dayWindow`). `DeepLinkHandler.eventDestination`: `/events/this-weekend` to Weekend, today/free/kids/suburbs to Search, other landing and month pages to Home, ids and slugs to `.event`. `EventsService.fetchEvent(slug:)` reads the visible rows in the slug's [day-1, day+2) Central window and picks; `SlugNotFound` carries `code = "PGRST116"` so `isNotFound` matches. The resolver takes the slug path for a non-UUID. Custom scheme and notifications stay UUID-only. |
| P12-02 | done | `Destination.search(query:)` and `.web(URL)`. `/search?q=` searches (trimmed, 120 chars), `/search` and `/search/advanced` open the tab, bare `/attractions` and any unknown first-party page open in `SafariView`, the root path opens Home. `PulseIntentDispatcher.Pending.searchText` (route: no filters, the text, Events tab); `routeIntent` also moves the iPad sidebar. `DeepLinkPresentation.web`, presented as `SafariView`; `ArticleDetailView.nativePresentation` and `ItineraryDetailView.presentation` return nil for both. `public/.well-known/apple-app-site-association` adds `/stay`, `/stay/*`, `/attractions`, `/weekend`, `/deals`, `/best-of`, `/best-of/*`, `/music`, `/sports`, `/outdoors`. **Addition:** a `.search` link also dismisses whatever sheet is up first. |
| P12-03 | done | `DeepLinkResolverView`: `.unavailable` ("This listing is no longer available", See what's on, Open on website) and `.offline` (Try Again plus `reloadOnReconnect`). `static phase(for:)`. On unavailable the Spotlight item is removed (`SpotlightService.removeItem(identifier:)`). A UUID event that is not found follows `merged_into` (`EventsService.fetchMergedSurvivorId`) up to three hops. |
| P12-04 | done | `project.yml`: the Clip compiles `DesMoinesTime.swift`, `EventSlug.swift` and a new shared `Services/ClipDateFormat.swift`. `ClipRootView` loads with `.task(id: invocationURL)`; the view model skips a repeat of the last loaded URL. Both queries filter merged/hidden/archived; highlights use "not over" (`date >= now-3h or end_date >= now`) and top up from non-featured rows when fewer than three are featured. `invocationId(from:)` accepts slugs and resolves them with `EventSlug.pick`. `appURL` is the web slug. Dates render in Central time with "Time TBA" for the no-time marker, the SeatGeek placeholder or `time_tbd`, "Date TBA" when unparseable. Error state has Try again, empty state "Nothing listed right now" plus a website link, subtitle "Coming up in Des Moines - no sign-in required", CTA "Get the full app - Free" opens the App Clip `SKOverlay` (also offered once after the first load). **Deviation:** `time_tbd` is decoded if present but not selected; the web notes the column is missing from the production snapshot and a missing column fails the whole query. |
| P12-05 | done | The lock is an overlay on the signed-in branches (`locked(_:)`, `shouldShowLock`), so MainTabView survives an app switch. **Addition:** when the lock engages on `.background`, `TopPresenter.dismissPresented()` closes sheets, because a sheet is presented above any overlay and would stay readable behind the lock. Tabs, stacks and view models are kept. |
| P12-06 | done | iPad keeps visited sidebar panes mounted in a `ZStack` (opacity, hit testing and accessibility follow the current pane), ordered by `sidebarIndex`. Trip Planner uses `point.topleft.down.to.point.bottomright.curvepath`. |
| P12-07 | done | New `Views/Components/TopPresenter.swift`. `MainTabView.present(_:)` clears the root presenters, dismisses what UIKit has presented (or waits out a dismissal already running), then presents. Not unit-tested; verify by hand (below). |
| P12-08 | done | `Event.effectiveEnd(calendar:)` (shared with `isOver`). Spotlight `partition` uses `isOver`, `expiration(for: Event)` is that end plus the grace, `endDate` uses `end_date`. New `indexAttractions` (active rows only), called after the first attractions page and from `AttractionDetailView`. `SpotlightExpiryTests`: the old start+2h tests were rewritten for the new rule. |
| P12-09 | done | `VersionCheckService`: `storeURL` defaults to `Config.siteURL`, `acceptedStoreURL` (https, Apple or our host, and not the `id0000000000` sentinel), `checkIfStale` on every `.active` (six hours). `ForceUpdateView`: dark scheme, scrolls, Check again, Contact support as a mailto link. |
| P12-10 | done | `DeepLinkHandler.isFirstPartyWebURL` (https, exact host); the auth-callback skip matches scheme and host. |
| P12-11 | done | `WebView`: subframes allowed, only a tap leaves the app (tel/mailto/sms/facetime/maps or another site), script redirects cancelled, `sameSite` exact-or-first-party. `WebLoadState` binding; `WebViewPage` shows a spinner and a failure state with Try Again and Open in Safari. `ArticleDetailView` opens third-party body links in `SafariView`. |
| P12-12 | done | Launch task: crash handlers, Keychain migration, crash upload/cache prune/ad flush queued in a utility `Task` (they are main-actor services, so not detached), jailbreak check, then the version check awaited directly, so its request goes out before the housekeeping runs (review pass: an `async let` here read the main-actor `versionCheck` from a nonisolated child task). The review prompt now sleeps before counting favorites, since those load from the auth listener. Signed-in work (crash user id, push prompt, review prompt) runs once from `.task(id: authService.isLoading)`. `AuthService` loads favorites on `.initialSession` as well as `.signedIn`. No injectable seam in `AuthRoutingTests`; verify by hand. |
| P12-13 | done | `CachedAsyncImage` resets on a URL change, keys memory by `cacheKey(_:maxPixels:)`, retries a failed image on reconnect, and loads only `isSafeWebLink` URLs. **Deviation:** http is still allowed; no production data was available to show image URLs are all https. |
| P12-14 | done | Offline banner amber/black and dark green/white; the insert/remove animation moved to MainTabView's inset; `NetworkMonitor.announcement(wasConnected:isConnected:)` posted on edges. |
| P12-15 | done | Jailbreak alert once per app version (`jailbreakWarningAckVersion`, `shouldWarnJailbreak`). |
| P12-16 | done | `Config.isUITesting` is false outside DEBUG; `uiTestScreen` requires it. Fastlane Snapshot uses the Debug test config and must stay on it. |
| P12-17 | done | `CrashStore.exceptionRecorded` stops the post-exception SIGABRT writing a second record. `MetricKitSubscriber` forwards up to five crash diagnostics per payload to `log-error` with `summary(exceptionType:signal:terminationReason:callStackJSON:)` (exc, sig, reason, first `DesMoinesInsider+0x<offset>` frame). The signal-flag path is not unit-testable. |
| P12-18 | done | `log-error`: component/action/route scrubbed; `source = "edge"` only for a machine caller (`resolveSource`). `error-triage`: two passes, most frequent first, at most 25 new tasks per run (`pickClustersToCreate`), updates uncapped, skipped count logged. Pure helpers in `supabase/functions/_shared/errorPolicy.ts`, tests in `supabase/functions/_tests/error-policy.test.ts`. |
| P12-19 | done | `supabase/migrations/20261015000005_device_tokens.sql` (unique `device_token`, own-row select/delete RLS, no anon). `register-device-token`: upsert on `device_token`, optional `action: "unregister"`. `client-contract.test.ts` gains `optionalActions` so an action only iOS sends is still checked for documentation and implementation. `PushNotificationService.TokenPayload`, `unregisterFromBackend`, `resyncIfRegistered`; `AuthService.signOut` unregisters before the session ends and `.signedIn` resyncs, both behind `Config.enablePushNotifications`. |
| P12-20 | done | `PrivacyInfo.xcprivacy` declares CrashData, OtherDiagnosticData (not linked), SearchHistory and PurchaseHistory (linked), all App Functionality. |
| P12-21 | done | This file; `Config.appStoreId` with a TODO(REL), and `Config.appStoreURL` (the App Store page once the id is real, else the website), which `VersionCheckService.storeURL` starts from. |

## Tests added or extended

New: `EventSlugTests` (also covers `ClipDateFormat`), `DeepLinkResolverTests`, `AppShellPolicyTests`,
`MainTabViewLayoutTests`, `WebViewPolicyTests`, `CachedAsyncImageKeyTests`, `NetworkMonitorTests`,
`PushTokenPayloadTests`; Deno `error-policy.test.ts`. Extended: `DeepLinkHandlerTests` (slugs, landing
pages, every claimed path routes, `/search?q=`, `.web`, exact host, auth-callback),
`PulseIntentRoutingTests`, `SpotlightExpiryTests`, `VersionCheckTests`, `CrashReportingTests`.
`testInvalidIDUniversalLinkFallsBackToTab` now uses `Bad%20Slug`, since `not-a-uuid` is a valid slug.

## Deferred

- P12-D1: the `aps-environment` entitlement, an APNs sender and a contextual push pre-prompt. Push stays
  behind `Config.enablePushNotifications = false`; this change only makes the backend ready.
- P12-D5: `/neighborhoods/<slug>` opens the Neighborhoods hub, not the named neighborhood.
- P12-D8: a body-size cap and a corner retry button for `CachedAsyncImage`.
- P12-D9: `log-error` still trusts `userId`. The web sends it with only the anon key, and a forged id
  only inflates `affectedUsers`.

## Rejected findings

The implementer's plan listed only the items above; rejected findings were not passed to this step.

## Verify by hand

- Open an event detail sheet, fire a local reminder for another event, tap it: the new event opens (P12-07).
- Cold launch signed in with favorites: hearts are filled without opening Saved (P12-12).
- Lock on, open a sheet, switch apps and back: the lock shows, the sheet is gone, the tab and its scroll
  position are not (P12-05).

## What a human must do

- Apply `supabase/migrations/20261015000005_device_tokens.sql`, then deploy `register-device-token`,
  `log-error` and `agent-runner` (error-triage). If a `device_tokens` table already exists in production
  without a unique `device_token`, the migration collapses duplicate tokens and adds the unique index
  the new upsert needs.
- Set the real Team ID in `public/.well-known/apple-app-site-association` and `ios/project.yml`
  `DEVELOPMENT_TEAM` (IOS-AUDIT-REL-006), then make `scripts/check-aasa.mjs` fail on `TEAM_ID_HERE`.
  Universal links, including every route above, do nothing until then.
- When App Store Connect assigns the id, set `IOS_APP_STORE_ID` in
  `supabase/functions/version-check/index.ts`, `Config.appStoreId`, and the comment in `ClipRootView`.
- Make the App Store privacy questionnaire match the manifest: crash data and other diagnostics (not
  linked), search history and purchase history (linked).
- Do not wire the "update available" banner (`VersionCheckService.latestVersion`) until
  `LATEST_APP_VERSION` is set when a build is released on the App Store rather than when develop bumps
  the version; until then it would tell users to install a build they cannot get.
- Keep Fastlane Snapshot on the Debug test configuration: `--uitesting` is ignored in Release.
