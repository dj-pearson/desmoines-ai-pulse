# Android production-readiness audit

**Module**: `android/` — `com.desmoines.aipulse`, versionCode 6 / versionName 1.0.0
**Scope**: 46,186 lines of Kotlin across 200 main sources, 59 unit-test files (5,337 lines), 1 instrumentation test, the Gradle build, ProGuard rules, the manifest, and both CI workflows.
**Date**: 2026-08-28
**Method**: static review. No Android SDK was available in this environment, so nothing here was verified by compiling or running the app. Every claim below is traceable to a file and line; where a claim depends on runtime behaviour I say so.

Android CI has been green on `main` for 355 runs. That is not evidence the app works: CI builds `assembleDebug` only, `lint` cannot fail the build (`abortOnError = false`), and the unit-test task silently discovered none of one file's tests. The most expensive findings below all sit inside that blind spot.

---

## What is fixed on this branch

### 1. Insider and VIP subscribers were served the free tier on three screens

`EventsViewModel:112`, `RestaurantsViewModel:82` and `FavoritesViewModel:47` each declared:

```kotlin
private val _currentTier = MutableStateFlow(SubscriptionTier.FREE)
```

and nothing ever wrote to them. `EventsViewModel.setCurrentTier()` existed with zero callers; the other two had no setter at all. `BillingService` — which does resolve the real tier, including cross-platform entitlements from Stripe and StoreKit — was not injected into any of the three.

Four benefits the paywall sells (`AppEnums.kt:215-224`) were therefore not delivered:

| Advertised | Actual | Where |
|---|---|---|
| Unlimited favorites | capped at 3 | `FavoritesRepositoryImpl:85,115` |
| Advanced filters (distance, price, rating) | shown locked | `FilterSheet.kt:197` |
| Ad-free experience | ads shown | `AdBannerView.kt:50`, 4 call sites |
| — | "3/3 saves used. You've reached the free plan limit. Go Unlimited" upsell shown to paying users | `SubscriptionBanner.kt:285-307` |

Compounding it, `FavoritesRepositoryImpl` read the limit as `SubscriptionTier.FREE.maxFavorites` unconditionally rather than from the caller's tier, so even a correct tier upstream would not have lifted the cap.

**Fixed**: `BillingService.currentTier` is now collected into each ViewModel; `tier` is a required parameter on `FavoritesRepository.toggleEventFavorite`/`toggleRestaurantFavorite` (required, not defaulted, so a future caller cannot re-introduce the bug silently). Two regression tests added: free stops at three, `INSIDER`/`VIP` save past ten.

### 2. The favorite button on event and restaurant detail screens did nothing

```kotlin
// MARK: - Favorites (placeholder — implemented in AND-024)
fun toggleFavorite() {
    // Placeholder — will connect to FavoritesRepository in AND-024
    _isFavorited.value = !_isFavorited.value
}
```

`EventDetailViewModel:79-88` and `RestaurantDetailViewModel:36,54`. The heart filled on tap and reset the moment the screen was reopened. `FavoritesRepository` had been fully implemented and wired into five other ViewModels; these two were never connected.

**Fixed**: both now read persisted state on load and write through the repository, with a toast when a save is rejected (signed out, or free-tier limit) instead of the button silently refusing.

### 3. Push notifications could never arrive, and reminders could never display

Three independent breakages stacked:

- `PushNotificationService` extends `FirebaseMessagingService` but was **not declared in the manifest**. FCM only dispatches to a service registered with the `com.google.firebase.MESSAGING_EVENT` filter, so `onNewToken` and `onMessageReceived` never fired.
- **`POST_NOTIFICATIONS` was never declared.** `PushNotificationService:133` and `NotificationReceiver:67` both check it before posting. `checkSelfPermission` on an undeclared permission always returns `PERMISSION_DENIED`, so on API 33+ every notification path took the early return. minSdk is 26 and targetSdk 35 — this is nearly the whole install base.
- **Nothing ever requested the permission.** `hasNotificationPermission()` existed; no launcher called it. A `PermissionPrimingCard` composable was built for exactly this and is unreferenced (`OnboardingPage.kt:170`).

**Fixed**: service declared, permission declared, and a `RequestPermission` launcher fires once the user is past onboarding. `Config.ENABLE_PUSH_NOTIFICATIONS` is still `false` — that is a product decision, not a defect, but it means push stays off until someone flips it.

### 4. Event reminders were lost on every reboot

`LocalNotificationService` scheduled alarms through `AlarmManager` and persisted only the event **ids**. Android clears all pending alarms on restart. On the next launch `pruneExpiredReminders()` found no `PendingIntent` and deleted the ids, so the reminder disappeared from the UI too, with no trace.

**Fixed**: the full reminder payload is persisted alongside the id set, and a `BootCompletedReceiver` (`BOOT_COMPLETED` + `MY_PACKAGE_REPLACED`) replays every still-future alarm off the main thread via `goAsync()`. Records already past their trigger time are dropped rather than replayed, so a device that was off through the event does not fire "starts in 1 hour" afterwards.

Separately, `toggleReminder()` returned `true` unconditionally after calling `scheduleReminder()`, which returns `false` for an event less than an hour out or a denied exact-alarm permission. The UI showed a filled bell for a reminder that was never set. Now it reports the real outcome.

### 5. Google Play would auto-refund subscriptions bought while the app was closed

`handlePurchase()` acknowledged, and it was only called from `onPurchasesUpdated`. A purchase completed while the process was dead — or whose callback was not delivered — was picked up on the next launch by `updatePurchasedProducts()`, which granted the entitlement and **did not acknowledge**. Play revokes and refunds any purchase left unacknowledged for three days.

**Fixed**: acknowledgement moved to `acknowledgeIfNeeded()` and called from both paths. Also added `setObfuscatedAccountId` (SHA-256 of the Supabase user id, per Play's no-PII rule) so purchases are attributable for fraud detection and RTDN reconciliation.

### 6. Every deep link except four was undeliverable

`DeepLinkHandler` parses ten custom-scheme hosts (`event`, `restaurant`, `attraction`, `hotel`, `home`, `dining`, `search`, `map`, `favorites`, `profile`) and four `https://desmoinesinsider.com` paths. The manifest declared four hosts (`auth-callback`, `ask-pulse`, `find-restaurants`, `find-events`) and no `https` filter at all. The parser was complete and unreachable.

The same URLs are what `AppSearchService` indexes for system search, so every indexed result also bounced to the browser.

**Fixed**: intent-filters added for all custom-scheme hosts and for `https` App Links with `autoVerify="true"`.

**Not fixed and still blocking verification**: `public/.well-known/assetlinks.json` is live on the production site with a literal `"SHA256_FINGERPRINT_HERE"` placeholder. Until that is replaced with the Play App Signing certificate SHA-256, `autoVerify` fails and links open through the disambiguation dialog rather than straight into the app. The fingerprint comes from Play Console → Setup → App signing; nobody outside that console can supply it.

### 7. Sign-out handed the next account the previous account's saves

`SignOutCleaner`'s doc says "Every step is best-effort and isolated so one failure can't abort the rest." Three things contradicted it:

- `restaurant_favorites_prefs` — the local fallback `FavoritesRepositoryImpl` writes to whenever the remote table is missing — was never cleared.
- The `@Singleton` in-memory `_favoriteEventIds` / `_favoriteRestaurantIds` survived sign-out, and `isEventFavorited()` reads them synchronously from the UI.
- `groupSessionManager.clear()` was the one call not wrapped, so a throw there skipped the twelve wipes below it, including the credential wipe.

Every step also swallowed its exception with no logging, so a half-completed sign-out left no trace.

**Fixed**: `clearLocalState()` added to the repository and called; the FCM device token is cleared too (it is what the backend addresses pushes at); every step goes through a `step(name) { }` helper that isolates *and* logs. Regression test: a throwing step no longer aborts the teardown.

### 8. Unguarded implicit intents could crash the app

`onCall`, `onOpenWebsite` and `onAddToCalendar` called `context.startActivity` bare. A tablet with no dialer, or an Android Go device with no calendar, throws `ActivityNotFoundException` rather than doing nothing. Worse, the directions handlers caught the exception and then called `startActivity(fallback)` **inside the catch**, unguarded — a device with neither Google Maps nor a `geo:` handler crashed from inside the handler.

A crash-safe launcher already existed (`SafeLinkLauncher`, written for exactly this) and these sites did not use it.

**Fixed**: `SafeLinkLauncher.start()` added and all remaining bare launches routed through it. A `<queries>` element was also added — under targetSdk 30+ package visibility, `resolveActivity` and package-pinned intents for `com.google.android.apps.maps` fail even when Maps is installed.

### 9. Seven unit tests never ran

`EventsRemoteDataSourceTest.kt` was the only JUnit 4 file left. `tasks.withType<Test> { useJUnitPlatform() }` is set and `junit-vintage-engine` is not on the classpath, so the platform discovered none of its seven tests. `./gradlew test` reported green. The dependency comment — "JUnit 4 kept for backward compatibility with existing tests" — is what made it invisible.

**Fixed**: converted to Jupiter (including the `assertTrue(message, condition)` → `assertTrue(condition, message)` argument swap, which would otherwise have compiled and inverted the assertion), and `testImplementation(libs.junit)` removed so this cannot recur.

### 10. Smaller fixes

| Finding | File |
|---|---|
| Notification small icon was `@mipmap/ic_launcher_foreground`, a full-colour asset. Android renders small icons from the alpha channel, so it showed as a grey blob. Added a monochrome `ic_notification` vector. | `PushNotificationService:118`, `NotificationReceiver:52` |
| `MainActivity` overrode `onNewIntent` under the default `launchMode="standard"`, where it is never called. Set `singleTask`. | `AndroidManifest.xml` |
| `RootDetector.isRooted` runs ~30 `File.exists()`/`canWrite()` probes and was called from a `LaunchedEffect`, which dispatches on Main — disk I/O in the cold-start path. Moved to `Dispatchers.IO`. | `MainActivity:124` |
| `pruneExpiredReminders()` read SharedPreferences and rebuilt a `PendingIntent` per reminder on the main thread in `Application.onCreate`. Moved to `appScope`. | `DesMoinesInsiderApp:52` |
| Coil memory cache was a hard 50 MB "to match iOS". Android heaps are per-device; on a 96 MB heap that is over half the budget. Switched to 20% of available heap. | `DesMoinesInsiderApp:62` |
| The `WebView` was never destroyed (`AndroidView` has no `onRelease`), leaking its renderer process; JavaScript was enabled with no navigation restriction, so any link or script navigation could take a JS-enabled WebView anywhere. Added `onRelease` teardown, a host allowlist that hands off-host links to the system browser, `textZoom` from the system font scale, and `allowFileAccess = false`. | `WebViewScreen.kt` |
| 15 `String.format("%.1f", …)` calls with no `Locale` render "4,5" in de/fr/es. Five nearby sites already passed `Locale.US`; lint's `DefaultLocale` check would have caught all of them if lint could fail. | 10 files |
| CI never built the release variant. Added `assembleRelease` so R8 full mode and the hand-written keep rules are exercised before the store, not by it. | `android-ci.yml` |

---

## Not fixed — needs a decision, a build, or a credential

### On a clock

**targetSdk 35 against Play's 31 August 2026 deadline.** Google requires new app updates to target API 36 (Android 16) after that date — three days from this audit. `compileSdk` is also 35. Bumping it is not a one-line change: activity-compose 1.9.3 and Compose BOM 2024.12.01 predate the Android 15/16 edge-to-edge and predictive-back behaviour changes, so the SDK bump has to come with a dependency upgrade and device testing. This is the single item most likely to block the next submission.

**Play Billing Library 7.1.1.** v8 is required for updates after the same deadline, and `billing-ktx` was folded into `billing` in v8. Needs a migration pass.

**Dependencies are roughly 20 months stale.** Compose BOM 2024.12.01, core-ktx 1.15.0, lifecycle 2.8.7, activity-compose 1.9.3, navigation-compose 2.8.5 — all from late 2024, running under Kotlin 2.2.10 and AGP 9.1. A Compose compiler that far ahead of its runtime is a supported-but-untested combination.

**`firebase-appindexing:20.0.0`.** Firebase App Indexing was deprecated and its backend turned down. `AppSearchService` (~200 lines plus a test file) calls `appIndex.update()` and `appIndex.removeAll()` into a service that no longer exists. Either migrate to `androidx.appsearch` or delete the feature and its opt-out toggle in Settings — right now the toggle claims to control indexing that is not happening.

### Security and privacy

**Alpha crypto libraries in production.** `androidx.security:security-crypto:1.1.0-alpha06` backs `SecureStorage`, which holds session-adjacent data. Google has stopped developing that library and recommends against new use. `androidx.biometric:1.2.0-alpha05` is likewise an alpha where 1.1.0 is stable.

**`SecureStorage` falls back to plaintext silently.** If the Keystore is unavailable — not rare after certain OEM OS updates — `createPreferences()` catches and returns an unencrypted `SharedPreferences` with only a `Log.w`. Nothing tells the user, and nothing reaches crash reporting. At minimum this should report to `CrashReportingService`.

**Certificate pinning is permanently inert.** `CertificatePinningService.isReportOnly = true` on all build types, documented as deliberate until the pins are re-verified. Fine as a decision; worth knowing that the class currently only logs. It also pins `*.supabase.co`, which will not match a self-hosted or custom-domain Supabase endpoint.

**`SessionTimeoutService` never runs.** It implements idle and absolute session timeouts with separate admin limits (`SessionTimeoutService.kt`, ~200 lines). `startTracking()` and `recordActivity()` have zero callers; `sessionState` and `minutesRemaining` are observed by nothing. Only `stopTracking()` is called, from sign-out. The control does not exist at runtime.

**The biometric lock only locks once per process.** `MainActivity` gates on it inside `LaunchedEffect(Unit)`, so backgrounding and returning leaves the app unlocked. A failed unlock leaves the user on a blank screen with a single "Tap to unlock with biometrics" button — no device-credential fallback and no way past it.

**`google-services.json` is tracked in git** despite `android/app/google-services.json` appearing in `.gitignore` (gitignore does not untrack an already-tracked file). Firebase config is not a secret by design, but the intent was clearly otherwise. More consequential: its `oauth_client` array is empty, which means no SHA-1 is registered on the Firebase Android app — Google Sign-In through Credential Manager will not work against that config.

**Release builds fall back to debug signing.** `build.gradle.kts:88-91` applies the release signing config only when `RELEASE_KEYSTORE_FILE` is set. The fail-fast guard above it checks `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `GOOGLE_MAPS_API_KEY` — not the keystore. A release build with no keystore produces a debug-signed artifact rather than failing. `android-release.yml` always sets it, so this only bites local builds; adding the keystore to that guard closes it.

### Build and test integrity

**Lint runs and cannot fail.** `checkReleaseBuilds = false` and `abortOnError = false`, and `android-ci.yml` runs `./gradlew lint` and uploads a report as an artifact. The step always passes. Every locale bug in section 10 was a lint finding sitting in an unread HTML file. Turning `abortOnError` back on needs a baseline generated from a real lint run first.

**`unitTests.isReturnDefaultValues = true`** makes unmocked Android framework calls return `null`/`0` instead of throwing. It is what lets the suite run without Robolectric, and it also means a test touching `Uri.parse` or `TextUtils` can pass while asserting on a default.

**One instrumentation test in the whole module** (`ArticleMarkdownTest.kt`), and neither CI workflow runs `connectedAndroidTest`. Nothing exercises Compose UI, navigation, Room, or the minified build on a device.

**`android-release.yml` does not run tests** before building the artifact it tells you to upload to Play.

### ProGuard

The keep rules are far broader than they need to be:

```
-keep class io.ktor.** { *; }
-keep class io.github.jan.supabase.** { *; }
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
```

Whole-package `{ *; }` keeps on Play Services and Firebase defeat most of R8's shrinking on the largest dependencies in the app. `-keepclassmembers class com.desmoines.aipulse.** { *** Companion; }` similarly keeps companions on every class in the app rather than the serializable ones. Now that CI builds the release variant, these can be narrowed one at a time with the build to catch regressions.

### Code health

**Localization is declared but not wired.** `strings.xml` holds 111 entries; the Kotlin sources make 11 `stringResource()` calls and carry 341 hardcoded UI literals. There is no `values-<lang>` directory. `android:supportsRtl="true"` is set with no RTL locale to exercise it. The resource file is close to dead weight.

**`AppLogger` exists and is bypassed.** It documents that debug and info are stripped in release; 101 direct `android.util.Log` calls do not go through it. The ProGuard `-assumenosideeffects` rule does strip `Log.d/i/v` regardless, so this is consistency rather than a leak — but it means the category tags the logger was built for are absent from most of the app.

**About 22 public composables are unreferenced**, including `SubscriptionTierCard`, `BillingCycleToggle`, `PaywallSheet`, `MapPreviewSheet`, `ParallaxHeroHeader`, `ToastOverlay`, `AnimatedTabItem`, `GlassTextField`, `AffiliateAdBanner`, `RecentSearchesList`, `TrendingChipsRow`, `OnboardingPageIndicator` and `PermissionPrimingCard`. `AffiliateAdBanner` and `SubscriptionTierCard` are complete monetization surfaces that were built and never mounted; `PermissionPrimingCard` is the permission-priming UI that would have surfaced the notification permission this audit had to add by hand.

**`MainNavHost.kt` is 1,208 lines** holding 34 routes, 36 `hiltViewModel()` calls and 65 `collectAsState()` calls in one function. Across the module, `collectAsState()` (81 uses) dominates `collectAsStateWithLifecycle` (13) even though `lifecycle-runtime-compose` is a dependency — the plain form keeps collecting while the app is backgrounded.

**`BillingService` details**: its scope is `Dispatchers.Main` for a singleton that does Supabase network calls; `billingClient` is never `endConnection()`ed; `isTransientError` classifies retries by substring-matching exception messages for `"500"`, `"timeout"`, `"network"`, which silently stops retrying when a message is null or localized.

**Room `exportSchema = false`** with `fallbackToDestructiveMigration(dropAllTables = true)`. Defensible for a pure content cache, but it means no schema is checked into CI and a migration mistake has no guardrail.

**`SignOutCleaner` wipes `SecureStorage` wholesale**, which also clears `biometric_enabled` and the on-device indexing preference. Signing out silently turns the biometric lock off — those are device settings, not credentials.

---

## Suggested order

1. `assetlinks.json` fingerprint — one string, unblocks App Links verification, needs Play Console access.
2. targetSdk 36 + dependency upgrade + Billing v8. This is the long pole and it has a deadline.
3. Turn `lint.abortOnError` back on behind a generated baseline, so the next locale or manifest bug fails in CI.
4. Decide `AppSearchService` and `SessionTimeoutService`: wire them up or delete them. Both are currently code that claims a capability the app does not have.
5. Replace `androidx.security:security-crypto` before it goes further out of support, and make its plaintext fallback report.
6. Narrow the ProGuard keeps, one dependency per PR, against the new release build in CI.
