# Des Moines AI Pulse - Mobile App

Native iOS and Android apps built with **Capacitor 6** wrapping the existing React web application. This is an **isolated build** that does not affect the web production deployment.

## Architecture

```
mobile-app/
├── src/                        # Mobile-specific TypeScript source
│   ├── config/                 # Platform detection & configuration
│   │   └── platform.ts        # Runtime platform detection (iOS/Android/web)
│   ├── services/               # Native bridge service layer
│   │   ├── native-bridge.ts    # Core Capacitor plugin initialization
│   │   ├── push-notifications.ts # APNs (iOS) / FCM (Android) push
│   │   ├── deep-links.ts      # Universal Links & App Links routing
│   │   ├── biometrics.ts      # Face ID / Touch ID / Fingerprint
│   │   ├── native-geolocation.ts # Native GPS location
│   │   ├── app-tracking.ts    # iOS App Tracking Transparency
│   │   └── offline-storage.ts # Capacitor Preferences (persisted storage)
│   ├── hooks/                  # React hooks wrapping native services
│   │   ├── useNativePlatform.ts
│   │   ├── usePushNotifications.ts
│   │   ├── useNativeLocation.ts
│   │   ├── useBiometricAuth.ts
│   │   └── useNetworkStatus.ts
│   ├── components/             # Mobile-specific React components
│   │   ├── MobileAppProvider.tsx  # Top-level context provider
│   │   ├── OfflineBanner.tsx      # Network status banner
│   │   └── MobileStatusBar.tsx    # Safe area spacer
│   └── styles/
│       └── mobile.css          # Mobile-only CSS (safe areas, touch, etc.)
├── ios/                        # Xcode project (iOS 16+ minimum)
├── android/                    # Android Studio project (API 35 target)
├── www/                        # Built web assets (generated, gitignored)
├── resources/                  # App icons and splash screens
├── docs/                       # Compliance documentation
├── capacitor.config.ts         # Capacitor plugin configuration
├── vite.config.mobile.ts       # Isolated Vite build config
└── package.json                # Mobile-specific dependencies
```

## Build Pipeline (Isolated from Web)

The mobile app uses its **own Vite config** (`vite.config.mobile.ts`) that:
- Outputs to `mobile-app/www/` (not `dist/`)
- Uses relative paths for Capacitor's `file://` protocol
- Has mobile-optimized chunk splitting (fewer chunks = fewer disk reads)
- Resolves `@/` imports from the parent `src/` directory
- Adds `@mobile/` alias for mobile-specific code
- Runs on port 8081 (vs 8080 for web)

This means `npm run build` in the web root **does not** affect the mobile app, and vice versa.

## Prerequisites

- **Node.js** >= 20
- **Xcode** >= 15 (for iOS builds)
- **Android Studio** Hedgehog or later (for Android builds)
- **CocoaPods** (for iOS dependencies): `sudo gem install cocoapods`
- **JDK 17** (for Android builds)

## Getting Started

```bash
# 1. Install root project dependencies
cd desmoines-ai-pulse
npm install

# 2. Install mobile dependencies
cd mobile-app
npm install

# 3. Build web assets for mobile
npm run build

# 4. Sync with native projects
npm run sync

# 5. Open in IDE
npm run open:ios      # Opens Xcode
npm run open:android  # Opens Android Studio
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server for mobile (port 8081) |
| `npm run build` | Build web assets to `www/` |
| `npm run build:ios` | Build web + sync to iOS |
| `npm run build:android` | Build web + sync to Android |
| `npm run build:all` | Build web + sync to both platforms |
| `npm run sync` | Sync web assets + plugins to native projects |
| `npm run open:ios` | Open iOS project in Xcode |
| `npm run open:android` | Open Android project in Android Studio |
| `npm run run:ios` | Build and run on iOS simulator |
| `npm run run:android` | Build and run on Android emulator |

## App Store Compliance

### iOS (App Store)

| Requirement | Status |
|-------------|--------|
| Minimum iOS 16 | Configured in Podfile and Info.plist |
| Privacy Manifest (xcprivacy) | `ios/App/App/PrivacyInfo.xcprivacy` |
| App Tracking Transparency | ATT prompt + `NSUserTrackingUsageDescription` |
| Push Notifications | APNs configured in AppDelegate + entitlements |
| Universal Links | `App.entitlements` + AASA file |
| Face ID / Touch ID | `NSFaceIDUsageDescription` in Info.plist |
| Location permissions | Usage descriptions for when-in-use and always |
| Camera permissions | Usage description in Info.plist |
| Photo Library permissions | Usage descriptions for read and save |
| arm64 requirement | `UIRequiredDeviceCapabilities` set to arm64 |
| Background modes | remote-notification, fetch |
| Dark mode support | `UIUserInterfaceStyle: Automatic` |
| Network security | ATS enabled, localhost exception only |

### Android (Google Play)

| Requirement | Status |
|-------------|--------|
| Target API 35 (Android 15) | `variables.gradle` |
| Min SDK 24 (Android 7) | `variables.gradle` |
| Edge-to-edge display | `StatusBar.overlaysWebView: true` + CSS safe areas |
| Predictive back gesture | `enableOnBackInvokedCallback="true"` |
| Per-app language | `locales_config.xml` |
| Network security config | `network_security_config.xml` |
| App Links (verified) | `autoVerify="true"` intent filters + `assetlinks.json` |
| Push Notifications | FCM + `POST_NOTIFICATIONS` permission |
| Data safety declaration | Template in `docs/DATA_SAFETY_DECLARATION.md` |
| ProGuard / R8 | Enabled for release builds |
| Java 17 | `compileOptions` in build.gradle |
| Notification channels | Created programmatically (events, deals, general) |

## Native Features

| Feature | iOS | Android | Hook |
|---------|-----|---------|------|
| Push Notifications | APNs | FCM | `usePushNotifications()` |
| Biometric Auth | Face ID / Touch ID | Fingerprint / Face | `useBiometricAuth()` |
| Geolocation | CoreLocation | GPS/Fused | `useNativeLocation()` |
| Deep Links | Universal Links | App Links | Handled by `MobileAppProvider` |
| Offline Detection | Reachability | ConnectivityManager | `useNetworkStatus()` |
| Haptic Feedback | UIFeedbackGenerator | Vibrator | Capacitor Haptics |
| Native Share | UIActivityController | Intent.ACTION_SEND | Capacitor Share |
| Camera | AVFoundation | CameraX | Capacitor Camera |
| Secure Storage | Keychain | KeyStore | Capacitor Preferences |
| App Tracking | ATT Framework | N/A | `requestTrackingAuthorization()` |

## CI/CD: Automated iOS Build & TestFlight Upload

The project includes a GitHub Actions workflow (`.github/workflows/ios-release.yml`) that
builds the iOS app and uploads it directly to TestFlight. This is completely isolated from
the web production build.

### Required GitHub Secrets (6 iOS Secrets)

| # | Secret Name | What It Is | Where to Get It |
|---|-------------|------------|-----------------|
| 1 | `APPSTORE_ISSUER_ID` | App Store Connect API Issuer ID | App Store Connect > Users and Access > Integrations > App Store Connect API |
| 2 | `APPSTORE_API_KEY_ID` | App Store Connect API Key ID | Same page as above (the Key ID column) |
| 3 | `APPSTORE_API_PRIVATE_KEY` | Contents of the `.p8` private key file | Downloaded once when you create the API key |
| 4 | `IOS_DISTRIBUTION_CERT_P12` | Base64-encoded `.p12` distribution certificate | Exported from Keychain Access (see guide below) |
| 5 | `IOS_DISTRIBUTION_CERT_PASSWORD` | Password for the `.p12` file | The password you set when exporting |
| 6 | `IOS_PROVISIONING_PROFILE` | Base64-encoded `.mobileprovision` file | Apple Developer > Certificates, IDs & Profiles > Profiles |

**Also required** (should already exist from web builds):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SITE_URL`

### Step-by-Step: Gathering Apple Credentials

#### Step 1: App Store Connect API Key
1. Go to [App Store Connect](https://appstoreconnect.apple.com/) > Users and Access > Integrations > App Store Connect API
2. Click the **+** button to create a new key
3. Name it (e.g., "GitHub Actions CI") and set role to **App Manager**
4. Download the `.p8` file (you can only download it ONCE)
5. Note the **Key ID** and the **Issuer ID** shown at the top of the page
6. For the GitHub secret, paste the entire contents of the `.p8` file (including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines)

#### Step 2: Distribution Certificate
1. Open **Keychain Access** on your Mac
2. If you don't have a distribution certificate yet:
   - Go to Apple Developer > Certificates, Identifiers & Profiles > Certificates
   - Click **+** > **Apple Distribution** > follow the CSR process
3. Find your "Apple Distribution" certificate in Keychain Access
4. Right-click > Export as `.p12` and set a password
5. Base64-encode it: `base64 -i certificate.p12 | pbcopy` (copies to clipboard)
6. Paste as the `IOS_DISTRIBUTION_CERT_P12` secret

#### Step 3: Provisioning Profile
1. Go to Apple Developer > Certificates, Identifiers & Profiles
2. Register the App ID `com.desmoines.aipulse` under Identifiers (if not already done)
   - Enable capabilities: Push Notifications, Associated Domains
3. Go to Profiles > click **+**
4. Select **App Store Connect** distribution type
5. Select the App ID `com.desmoines.aipulse`
6. Select your distribution certificate
7. Name it (e.g., "DSM AI Pulse App Store")
8. Download the `.mobileprovision` file
9. Base64-encode it: `base64 -i profile.mobileprovision | pbcopy`
10. Paste as the `IOS_PROVISIONING_PROFILE` secret

#### Step 4: Create App in App Store Connect
1. Go to [App Store Connect](https://appstoreconnect.apple.com/) > My Apps > **+** New App
2. Platform: iOS
3. Name: DSM AI Pulse
4. Bundle ID: `com.desmoines.aipulse`
5. SKU: `com.desmoines.aipulse`
6. Fill in required metadata (description, screenshots, etc.)

#### Step 5: Set GitHub Secrets
1. Go to your GitHub repository > Settings > Secrets and variables > Actions
2. Click "New repository secret" for each of the 6 secrets above
3. Verify they are all set before running the workflow

### Running the iOS Release Workflow

```bash
# Option 1: Manual trigger from GitHub Actions tab
# Go to Actions > "iOS Release - TestFlight" > Run workflow
# Enter version (e.g., 1.0.0) and optional build number

# Option 2: Push a tag
git tag ios-v1.0.0
git push origin ios-v1.0.0
```

The workflow will:
1. Build web assets using the isolated mobile Vite config
2. Sync to the iOS Capacitor project
3. Install CocoaPods dependencies
4. Import your code signing certificate and provisioning profile
5. Build an Xcode archive
6. Export a signed IPA
7. Upload to TestFlight
8. Clean up all signing artifacts

### Before First Submission

#### iOS
1. Replace `TEAM_ID_HERE` in `public/.well-known/apple-app-site-association` with your Apple Team ID
2. Configure APNs key in Apple Developer Portal
3. Generate app icons: `npx @capacitor/assets generate`
4. Create the app listing in App Store Connect (Step 4 above)
5. Set up the 6 GitHub secrets (Steps 1-5 above)
6. Run the workflow and verify the build appears in TestFlight
7. Submit for App Store review from App Store Connect

#### Android
1. Replace `SHA256_FINGERPRINT_HERE` in `public/.well-known/assetlinks.json`
2. Add `google-services.json` from Firebase Console to `android/app/`
3. Generate app icons: `npx @capacitor/assets generate`
4. Create a release keystore and configure signing
5. Fill out the Data Safety form (see `docs/DATA_SAFETY_DECLARATION.md`)
6. Complete the content rating questionnaire
7. Submit for review

## Development Workflow

### Making Changes

1. Edit code in the parent `src/` directory (shared with web)
2. Mobile-specific code goes in `mobile-app/src/`
3. Rebuild: `cd mobile-app && npm run build`
4. Test: `npm run open:ios` or `npm run open:android`

### Live Reload

For development with live reload, update `capacitor.config.ts` to add a server URL pointing to your dev machine's IP, then `npm run sync` and open in the native IDE. Remove the server config before production builds.

## Common Issues

| Problem | Solution |
|---------|----------|
| White screen on launch | Run `npm run build` to ensure `www/` has content |
| CocoaPods not found | Install: `sudo gem install cocoapods` |
| Android SDK not found | Create `android/local.properties` with `sdk.dir=<path>` |
| App crashes on start | Check native logs in Xcode/Android Studio console |
| Push notifications not working | Ensure `google-services.json` (Android) or APNs key (iOS) is configured |
