# Des Moines Insider - Native iOS App

A native Swift/SwiftUI iOS app for discovering events, restaurants, and attractions in the Des Moines area. Connects to the same Supabase backend as the web app.

## Requirements

- **Xcode 15+**
- **iOS 17.0+** deployment target
- **Swift 5.9+**
- **macOS Sonoma** or later (for Xcode 15)

## Quick Start

### Option A: Using XcodeGen (Recommended)

1. **Install XcodeGen** (if not installed):
   ```bash
   brew install xcodegen
   ```

2. **Configure secrets**:
   ```bash
   cd ios/
   cp Secrets.xcconfig.example Secrets.xcconfig
   # Edit Secrets.xcconfig with your Supabase URL and anon key
   ```

3. **Generate the Xcode project**:
   ```bash
   cd ios/
   xcodegen generate
   ```

4. **Open in Xcode**:
   ```bash
   open DesMoinesInsider.xcodeproj
   ```

5. **Set your Team**: In Xcode, go to the project settings > Signing & Capabilities > select your development team.

6. **Build and run** (Cmd+R).

### Option B: Manual Xcode Project

1. Open Xcode > **File > New > Project**
2. Choose **iOS > App**
3. Configure:
   - **Product Name**: DesMoinesInsider
   - **Bundle Identifier**: com.desmoinespulse.app
   - **Interface**: SwiftUI
   - **Language**: Swift
   - **Minimum Deployment**: iOS 17.0

4. **Delete** the auto-generated ContentView.swift

5. **Add source files**: Drag the entire `DesMoinesInsider/` folder into your project navigator

6. **Add SPM dependency**:
   - File > Add Package Dependencies
   - URL: `https://github.com/supabase-community/supabase-swift`
   - Version: `2.0.0` or later

7. **Configure Info.plist** - Add these keys:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_ANON_KEY` = your Supabase anon key
   - `NSLocationWhenInUseUsageDescription` = location usage description

8. **Add entitlements** for Sign in with Apple

9. **Build and run** (Cmd+R)

## Architecture

```
ios/DesMoinesInsider/
├── App/                    # App entry point
│   ├── DesMoinesInsiderApp.swift
│   └── DesMoinesInsider.entitlements
├── Configuration/
│   └── Config.swift        # Supabase URL, keys, defaults
├── Models/                 # Data models matching Supabase schema
│   ├── Event.swift
│   ├── Restaurant.swift
│   ├── Attraction.swift
│   ├── UserProfile.swift
│   └── AppEnums.swift
├── Services/               # Supabase data access layer
│   ├── SupabaseService.swift     # Singleton client
│   ├── AuthService.swift         # Auth (email, Apple Sign-In)
│   ├── EventsService.swift       # Events queries
│   ├── RestaurantsService.swift  # Restaurant queries
│   ├── AttractionsService.swift  # Attraction queries
│   ├── FavoritesService.swift    # Favorites management
│   └── LocationService.swift     # CoreLocation wrapper
├── ViewModels/             # Business logic for views
│   ├── AuthViewModel.swift
│   ├── EventsViewModel.swift
│   ├── EventDetailViewModel.swift
│   ├── RestaurantsViewModel.swift
│   ├── SearchViewModel.swift
│   ├── MapViewModel.swift
│   ├── FavoritesViewModel.swift
│   └── ProfileViewModel.swift
├── Views/                  # SwiftUI views
│   ├── MainTabView.swift         # Tab navigation
│   ├── Home/                     # Events feed
│   ├── EventDetail/              # Event detail
│   ├── Restaurants/              # Restaurant list & detail
│   ├── Search/                   # Unified search + filters
│   ├── Map/                      # MapKit map view
│   ├── Favorites/                # Saved events
│   ├── Profile/                  # Profile & settings
│   ├── Auth/                     # Sign in / sign up
│   ├── Onboarding/               # First-launch onboarding
│   └── Components/               # Reusable UI components
├── Extensions/             # Swift extensions
│   ├── Color+Theme.swift
│   ├── Date+Formatting.swift
│   └── View+Extensions.swift
└── Resources/
    ├── Assets.xcassets/
    └── Info.plist
```

### Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **UI Framework** | SwiftUI | Modern, declarative, less code |
| **Minimum iOS** | 17.0 | `@Observable` macro, better MapKit |
| **Backend SDK** | supabase-swift 2.x | Official Supabase SDK |
| **Maps** | MapKit | Native, no third-party dependency |
| **Auth** | Supabase Auth + Apple Sign-In | Matches web app, App Store requirement |
| **State** | `@Observable` + async/await | Clean, modern Swift concurrency |
| **Images** | Custom `CachedAsyncImage` | In-memory NSCache, no third-party |
| **Navigation** | `NavigationStack` | Type-safe, programmatic |

## Screens

| Screen | Description |
|--------|-------------|
| **Home** | Events feed with featured carousel, date presets, category chips, infinite scroll |
| **Event Detail** | Hero image, full details, calendar integration, share, related events |
| **Restaurants** | Filterable list with cuisine/price filters, sort options, detail sheet |
| **Search** | Unified search across events, restaurants, attractions with tabs |
| **Map** | MapKit with color-coded event pins and restaurant markers |
| **Favorites** | Saved events list with remove/navigate actions |
| **Profile** | Edit profile, interests, settings, sign out |
| **Auth** | Sign in/up with email or Apple, interest selection |
| **Onboarding** | 3-step walkthrough on first launch |
| **Settings** | App version, notifications, privacy, support links |

## Supabase Integration

The iOS app connects to the **exact same Supabase backend** as the web app. All queries match the web app's patterns:

- **Events**: Full-text search via `search_vector`, category/date filtering, pagination with `.range()`
- **Restaurants**: Full-text search, cuisine/price/rating filters, multi-sort
- **Attractions**: ILIKE multi-field search, type filtering
- **Favorites**: `user_event_interactions` table with `interaction_type = "favorite"`
- **Auth**: PKCE flow, email/password, Apple Sign-In, session auto-refresh
- **Nearby**: PostGIS RPC functions (`search_events_near_location`, `restaurants_within_radius`)
- **Fuzzy search**: Falls back to `fuzzy_search_events`/`fuzzy_search_restaurants` RPC when full-text returns empty

## Environment Variables

Create `Secrets.xcconfig` from the example:

```bash
cp Secrets.xcconfig.example Secrets.xcconfig
```

Required values:
```
SUPABASE_URL = https://your-project.supabase.co
SUPABASE_ANON_KEY = eyJhbG...your-anon-key
```

These are injected into Info.plist at build time and read by `Config.swift`.

## Building for Release

1. Set your **Development Team** in Xcode signing settings
2. Configure the **Bundle Identifier**: `com.desmoinespulse.app`
3. Add your **App Icon** (1024x1024) to `Assets.xcassets/AppIcon.appiconset/`
4. Set version/build numbers in project settings
5. Archive: **Product > Archive**
6. Upload to App Store Connect via Xcode Organizer

## App Store Checklist

- [ ] App icon (1024x1024)
- [ ] Screenshots for iPhone (6.7", 6.5", 5.5") and iPad
- [ ] Privacy policy URL (https://desmoinesinsider.com/privacy-policy)
- [ ] Sign in with Apple configured
- [ ] Location usage descriptions in Info.plist
- [ ] `ITSAppUsesNonExemptEncryption` set to NO
- [ ] App Store description and keywords
