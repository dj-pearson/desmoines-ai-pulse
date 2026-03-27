# Des Moines Insider — Android

Native Android app for Des Moines Insider, built with Kotlin, Jetpack Compose, and Material 3.

## Setup

### Prerequisites

- Android Studio Ladybug (2024.2+) or newer
- JDK 17
- Android SDK 35
- Google Play Services (for Maps)

### Local Configuration

Create `android/local.properties` with your credentials:

```properties
# Supabase (required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Google Sign-In (required for auth)
GOOGLE_WEB_CLIENT_ID=your-google-client-id

# Google Maps (required for map tab)
GOOGLE_MAPS_API_KEY=your-maps-api-key

# Release signing (required for release builds)
RELEASE_KEYSTORE_FILE=path/to/release-keystore.jks
RELEASE_KEYSTORE_PASSWORD=your-keystore-password
RELEASE_KEY_ALIAS=your-key-alias
RELEASE_KEY_PASSWORD=your-key-password
```

### Firebase

Copy `google-services.json` from Firebase Console into `android/app/`. See `google-services.json.example` for the expected structure.

## Building

```bash
# Debug build
cd android && ./gradlew assembleDebug

# Release AAB (requires signing config)
cd android && ./gradlew bundleRelease

# Run lint
cd android && ./gradlew lint

# Run unit tests
cd android && ./gradlew test

# Run instrumentation tests (requires emulator/device)
cd android && ./gradlew connectedAndroidTest
```

## Release Signing

### Generate a Release Keystore

```bash
keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keystore release-keystore.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias desmoines-insider \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -dname "CN=Des Moines Insider, OU=Mobile, O=Des Moines AI Pulse, L=Des Moines, ST=Iowa, C=US"
```

Then add the keystore path and passwords to `local.properties`:

```properties
RELEASE_KEYSTORE_FILE=/absolute/path/to/release-keystore.jks
RELEASE_KEYSTORE_PASSWORD=YOUR_STORE_PASSWORD
RELEASE_KEY_ALIAS=desmoines-insider
RELEASE_KEY_PASSWORD=YOUR_KEY_PASSWORD
```

**IMPORTANT**: Never commit the keystore file or passwords to git. Back up the keystore securely — losing it means you cannot update the app on Google Play.

### Build Signed Release AAB

```bash
cd android && ./gradlew bundleRelease
```

The signed AAB will be at `android/app/build/outputs/bundle/release/app-release.aab`.

## Play Store Listing

- **App Name**: Des Moines Insider
- **Category**: Travel & Local
- **Content Rating**: Everyone
- **Privacy Policy**: https://desmoinesinsider.com/privacy-policy
- **Short Description**: Discover events, restaurants, and attractions in Des Moines — powered by AI.
- **Contact Email**: support@desmoinesinsider.com

### Screenshots

Place screenshots in `android/playstore/screenshots/`:
- `phone/` — Phone screenshots (1080x1920 or 16:9)
- `tablet/` — 7-inch tablet screenshots (1200x1920)

### Feature Graphic

Place feature graphic (1024x500) at `android/playstore/feature-graphic.png`.

## Architecture

See [CLAUDE.md](../CLAUDE.md) for full architecture documentation. Key patterns:

- **MVVM**: ViewModel + Repository + RemoteDataSource
- **DI**: Hilt
- **Navigation**: Compose Navigation with type-safe routes
- **State**: StateFlow + combine() for UI state
- **Cache**: Room database with 5-minute TTL
- **Images**: Coil 3 with 50MB memory / 200MB disk cache
