# Ralph Agent Instructions — Android App

You are an autonomous coding agent building the **Des Moines Insider** native Android app.

## Your Task

1. Read the PRD at `prd-android.json` (project root)
2. Read the progress log at `scripts/ralph/progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks: `cd android && ./gradlew lint assembleDebug` (or just build check for early stories)
7. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
8. Update `prd-android.json` to set `passes: true` for the completed story
9. Append your progress to `scripts/ralph/progress.txt`

## Project Context

### Android Stack
- **Language**: Kotlin 2.0+
- **UI**: Jetpack Compose with Material 3
- **Architecture**: MVVM (ViewModel + Repository + DataSource)
- **DI**: Hilt
- **Navigation**: Compose Navigation (type-safe)
- **Networking**: Supabase Kotlin SDK (supabase-kt 3.0+) with Ktor OkHttp engine
- **Database**: Room (offline cache)
- **Serialization**: kotlinx.serialization
- **Images**: Coil 3.0+
- **Maps**: Google Maps Compose
- **Billing**: Google Play Billing Library 7.0+
- **Push**: Firebase Cloud Messaging
- **Location**: Google Play Services (FusedLocationProviderClient)
- **Secure Storage**: EncryptedSharedPreferences (AndroidX Security)
- **Testing**: JUnit5 + MockK + Turbine + Compose UI Testing

### Existing iOS App (Reference Implementation)
The iOS app at `ios/DesMoinesInsider/` is the reference. The Android app must match it feature-for-feature:
- **Models**: `ios/DesMoinesInsider/Models/` → `android/app/src/main/java/.../data/model/`
- **Services**: `ios/DesMoinesInsider/Services/` → `android/app/src/main/java/.../data/remote/` + `data/repository/`
- **ViewModels**: `ios/DesMoinesInsider/ViewModels/` → `android/app/src/main/java/.../ui/screens/*/ViewModel`
- **Views**: `ios/DesMoinesInsider/Views/` → `android/app/src/main/java/.../ui/screens/`

### Shared Backend
Both iOS and Android use the **same Supabase backend**:
- Same database tables (events, restaurants, attractions, profiles, etc.)
- Same RPC functions (fuzzy_search_events, search_events_near_location, etc.)
- Same edge functions (register-device-token, etc.)
- Same auth system (Supabase Auth)

### Key Constants (must match iOS)
- App ID: `com.desmoines.aipulse`
- Default location: Des Moines (41.5868, -93.625)
- Search radius: 30 miles
- Page size: 30
- Cache TTL: 5 minutes
- Free tier max favorites: 3
- Search debounce: 300ms
- Rate limit: 5 attempts / 5 min, 60 second lockout

### Subscription Tiers (must match iOS)
- **Free**: 3 favorites, basic search, ads shown
- **Insider** ($4.99/mo): Unlimited favorites, advanced filters, AI trip planner (5/mo), ad-free, calendar integration, insider tips
- **VIP** ($12.99/mo): Everything Insider + unlimited trips, VIP events, concierge

## Android Project Structure

```
android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/desmoines/aipulse/
│   │   │   │   ├── DesMoinesInsiderApp.kt       (Application + Hilt)
│   │   │   │   ├── MainActivity.kt               (Entry point)
│   │   │   │   ├── data/
│   │   │   │   │   ├── model/                     (Data classes)
│   │   │   │   │   ├── remote/                    (Supabase data sources)
│   │   │   │   │   ├── local/                     (Room database + DAOs)
│   │   │   │   │   └── repository/                (Repository implementations)
│   │   │   │   ├── di/                            (Hilt modules)
│   │   │   │   ├── ui/
│   │   │   │   │   ├── theme/                     (Colors, Type, Theme)
│   │   │   │   │   ├── components/                (Reusable composables)
│   │   │   │   │   ├── navigation/                (NavGraph, routes)
│   │   │   │   │   └── screens/                   (Feature screens)
│   │   │   │   │       ├── home/
│   │   │   │   │       ├── restaurants/
│   │   │   │   │       ├── search/
│   │   │   │   │       ├── map/
│   │   │   │   │       ├── favorites/
│   │   │   │   │       ├── profile/
│   │   │   │   │       ├── auth/
│   │   │   │   │       ├── onboarding/
│   │   │   │   │       ├── subscription/
│   │   │   │   │       ├── eventdetail/
│   │   │   │   │       ├── restaurantdetail/
│   │   │   │   │       └── attractiondetail/
│   │   │   │   └── util/                          (Helpers, services)
│   │   │   ├── res/                               (Resources)
│   │   │   └── AndroidManifest.xml
│   │   ├── test/                                  (Unit tests)
│   │   └── androidTest/                           (Instrumentation tests)
│   ├── build.gradle.kts
│   └── proguard-rules.pro
├── build.gradle.kts                               (Project-level)
├── settings.gradle.kts
├── gradle.properties
├── gradle/
│   └── libs.versions.toml                         (Version catalog)
└── local.properties                               (Secrets, gitignored)
```

## Quality Requirements

Run these checks before committing:
```bash
cd android && ./gradlew lint assembleDebug
```

For stories that include tests:
```bash
cd android && ./gradlew test
```

- ALL commits must compile successfully
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing patterns from iOS codebase and translate to Kotlin/Compose idioms

## Platform Translation Guide

| iOS (Swift/SwiftUI) | Android (Kotlin/Compose) |
|---|---|
| `@Observable class` | `@HiltViewModel class + StateFlow` |
| `@State var` | `mutableStateOf()` or `MutableStateFlow` |
| `NavigationStack` | `NavHost + NavController` |
| `TabView` | `NavigationBar` (Material 3) |
| `.sheet()` | `ModalBottomSheet` |
| `AsyncImage` | `SubcomposeAsyncImage` (Coil) |
| `StoreKit 2` | `Google Play Billing Library` |
| `MapKit` | `Google Maps Compose` |
| `UNUserNotificationCenter` | `NotificationManager + AlarmManager` |
| `CoreLocation` | `FusedLocationProviderClient` |
| `NWPathMonitor` | `ConnectivityManager.NetworkCallback` |
| `Keychain` | `EncryptedSharedPreferences` |
| `UserDefaults` | `DataStore` or `SharedPreferences` |
| `OSLog` | `android.util.Log` |
| `actor` | `@Singleton` with coroutine scope |
| `Task { }` | `viewModelScope.launch { }` |
| `CheckedContinuation` | `suspendCancellableCoroutine` |

## Progress Report Format

APPEND to `scripts/ralph/progress.txt` (never replace, always append):
```
## [Date/Time] - [Story ID] (Android)
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
```

## Stop Condition

After completing a user story, check if ALL stories in `prd-android.json` have `passes: true`.

If ALL stories are complete: reply with `COMPLETE`

If there are still stories with `passes: false`, end your response normally.

## Important

- Work on **ONE story per iteration**
- Commit frequently
- Reference iOS code when implementing — read the equivalent iOS file first, then translate to Kotlin/Compose
- All Supabase queries must match iOS exactly (same tables, same filters, same RPCs)
- Keep CI green
