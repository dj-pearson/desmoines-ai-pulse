# Android App - Environment & Google Play Store Setup Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Environment](#local-development-environment)
3. [Supabase Configuration](#supabase-configuration)
4. [Google Cloud Console Setup](#google-cloud-console-setup)
5. [Firebase Setup](#firebase-setup)
6. [Google Maps API Key](#google-maps-api-key)
7. [Google Play Console Setup](#google-play-console-setup)
8. [Release Signing](#release-signing)
9. [Google Play Billing Products](#google-play-billing-products)
10. [Supabase Edge Function Secrets](#supabase-edge-function-secrets)
11. [Building & Testing](#building--testing)
12. [Play Store Submission Checklist](#play-store-submission-checklist)
13. [Post-Launch](#post-launch)

---

## 1. Prerequisites

Install the following before starting:

| Tool | Version | Download |
|------|---------|----------|
| Android Studio | Ladybug (2024.2+) | https://developer.android.com/studio |
| JDK | 17 | Bundled with Android Studio |
| Android SDK | API 35 (Android 15) | Via Android Studio SDK Manager |
| Android Build Tools | 35.0.0 | Via Android Studio SDK Manager |
| Git | Latest | https://git-scm.com |
| Node.js | 20+ | For Supabase CLI |
| Supabase CLI | Latest | `npm install -g supabase` |

### Android Studio SDK Manager Checklist

Open Android Studio > Settings > SDK Manager and install:
- [x] Android SDK Platform 35
- [x] Android SDK Build-Tools 35.0.0
- [x] Google Play services
- [x] Google APIs Intel x86_64 Atom System Image (for emulator)
- [x] Android Emulator
- [x] Android SDK Platform-Tools

---

## 2. Local Development Environment

### Step 1: Create `local.properties`

This file is gitignored and must be created manually on each development machine.

```bash
cd android/
cp local.properties.example local.properties  # if example exists
# OR create from scratch:
```

Add the following to `android/local.properties`:

```properties
# Android SDK (auto-set by Android Studio)
sdk.dir=/Users/YOU/Library/Android/sdk        # macOS
# sdk.dir=C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk  # Windows

# ============================================
# Supabase Credentials (REQUIRED)
# ============================================
# Get these from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your_anon_key

# ============================================
# Google Sign-In (REQUIRED for auth)
# ============================================
# Get from Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Web Client ID
GOOGLE_WEB_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com

# ============================================
# Google Maps (REQUIRED for map tab)
# ============================================
# Get from Google Cloud Console > APIs & Services > Credentials > API Key
GOOGLE_MAPS_API_KEY=AIzaSy...your_maps_key

# ============================================
# Release Signing (REQUIRED for release builds only)
# ============================================
RELEASE_KEYSTORE_FILE=../keystore/release.jks
RELEASE_KEYSTORE_PASSWORD=your_keystore_password
RELEASE_KEY_ALIAS=desmoines-insider
RELEASE_KEY_PASSWORD=your_key_password
```

### Step 2: Create `google-services.json`

```bash
cd android/app/
cp google-services.json.example google-services.json
```

Then replace with the real file from Firebase Console (see [Firebase Setup](#firebase-setup)).

### Step 3: Open in Android Studio

```bash
# Open the android/ directory (NOT the project root) in Android Studio
# Android Studio > File > Open > select android/ folder
```

Android Studio will sync Gradle automatically. If it doesn't, click "Sync Now" in the notification bar.

### Step 4: Verify Build

```bash
cd android/
./gradlew assembleDebug
```

If this succeeds, your environment is ready.

---

## 3. Supabase Configuration

The Android app uses the **same Supabase project** as the web app and iOS app.

### Where to Find Credentials

1. Go to https://supabase.com/dashboard
2. Select the Des Moines Insider project
3. Go to **Settings > API**
4. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon/public key** → `SUPABASE_ANON_KEY`

### Auth Redirect Configuration

Add the Android redirect URI to Supabase Auth settings:

1. Go to **Authentication > URL Configuration**
2. Under **Redirect URLs**, add:
   ```
   com.desmoines.aipulse://auth-callback
   ```
3. Save

This allows Supabase Auth to redirect back to the Android app after OAuth flows (Google Sign-In).

---

## 4. Google Cloud Console Setup

URL: https://console.cloud.google.com

### Step 1: Create or Select Project

If you already have a Google Cloud project for the iOS app or web app, use the same one. Otherwise:

1. Click **New Project**
2. Name: `Des Moines Insider`
3. Click **Create**

### Step 2: Enable Required APIs

Go to **APIs & Services > Library** and enable:

| API | Purpose |
|-----|---------|
| Maps SDK for Android | Map tab |
| Google Play Android Developer API | Subscription validation |
| Identity Toolkit API | Google Sign-In |

### Step 3: Create OAuth 2.0 Credentials

Go to **APIs & Services > Credentials**:

#### A) Web Client ID (for Supabase Google Auth)

1. Click **+ Create Credentials > OAuth client ID**
2. Application type: **Web application**
3. Name: `Des Moines Insider Web Client`
4. Authorized redirect URIs: Add your Supabase auth callback URL:
   ```
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```
5. Click **Create**
6. Copy the **Client ID** → this is your `GOOGLE_WEB_CLIENT_ID`

#### B) Android Client ID (for app signing verification)

1. Click **+ Create Credentials > OAuth client ID**
2. Application type: **Android**
3. Name: `Des Moines Insider Android`
4. Package name: `com.desmoines.aipulse`
5. SHA-1 certificate fingerprint:
   ```bash
   # For debug keystore:
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1

   # For release keystore:
   keytool -list -v -keystore path/to/release.jks -alias desmoines-insider | grep SHA1
   ```
6. Click **Create**

**Important**: You need BOTH a debug SHA-1 (for development) and release SHA-1 (for production). Add both as separate Android OAuth clients.

### Step 4: Configure OAuth Consent Screen

Go to **APIs & Services > OAuth consent screen**:

1. User Type: **External**
2. App name: `Des Moines Insider`
3. User support email: `support@desmoinesinsider.com`
4. App logo: Upload your app icon
5. App domain: `https://desmoinesinsider.com`
6. Privacy policy: `https://desmoinesinsider.com/privacy-policy`
7. Terms of service: `https://desmoinesinsider.com/terms`
8. Scopes: Add `email`, `profile`, `openid`
9. Click **Save and Continue**
10. Publish the app (move from Testing to Production) once ready

### Step 5: Link Google Cloud to Supabase

1. Go to Supabase Dashboard > **Authentication > Providers > Google**
2. Enable Google provider
3. Paste the **Web Client ID** and **Web Client Secret** from Step 3A
4. Save

---

## 5. Firebase Setup

URL: https://console.firebase.google.com

### Step 1: Create Firebase Project

1. Click **Add project**
2. Name: `Des Moines Insider` (or link existing Google Cloud project)
3. Enable Google Analytics (optional)
4. Click **Create Project**

### Step 2: Add Android App

1. Click the Android icon to register app
2. Package name: `com.desmoines.aipulse`
3. App nickname: `Des Moines Insider Android`
4. Debug signing certificate SHA-1:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
   ```
5. Click **Register App**
6. **Download `google-services.json`** and place it at `android/app/google-services.json`
7. Skip the SDK setup steps (already configured in build.gradle.kts)

### Step 3: Enable Cloud Messaging

1. Go to **Project Settings > Cloud Messaging**
2. Note the **Server Key** (may need it for backend)
3. Cloud Messaging API (V1) should be enabled by default

### Step 4: Add Release SHA-1

Once you have your release keystore:
1. Go to **Project Settings > General > Your Apps > Android app**
2. Click **Add fingerprint**
3. Add the release SHA-1 fingerprint
4. **Re-download `google-services.json`** (it now includes both SHA-1s)

---

## 6. Google Maps API Key

### Step 1: Create API Key

1. Go to Google Cloud Console > **APIs & Services > Credentials**
2. Click **+ Create Credentials > API key**
3. Copy the key → `GOOGLE_MAPS_API_KEY`

### Step 2: Restrict the API Key (CRITICAL for production)

1. Click on the API key to edit it
2. Under **Application restrictions**:
   - Select **Android apps**
   - Add: Package name `com.desmoines.aipulse` + your SHA-1 fingerprint (both debug AND release)
3. Under **API restrictions**:
   - Select **Restrict key**
   - Select only: **Maps SDK for Android**
4. Save

### Step 3: Add to local.properties

```properties
GOOGLE_MAPS_API_KEY=AIzaSy...your_key
```

The key is read by `build.gradle.kts` and injected into `AndroidManifest.xml` via a manifest placeholder.

---

## 7. Google Play Console Setup

URL: https://play.google.com/console

### Step 1: Create Developer Account

If you don't have one:
1. Go to https://play.google.com/console/signup
2. Pay the one-time $25 registration fee
3. Complete identity verification (can take 1-3 days)
4. Complete organization or individual profile

### Step 2: Create App

1. Click **Create app**
2. App name: `Des Moines Insider`
3. Default language: English (United States)
4. App or game: **App**
5. Free or paid: **Free** (revenue from subscriptions)
6. Declarations: Accept all
7. Click **Create app**

### Step 3: Store Listing

Go to **Grow > Store presence > Main store listing**:

| Field | Value |
|-------|-------|
| App name | Des Moines Insider |
| Short description | Discover Des Moines events, restaurants & attractions powered by AI |
| Full description | See below |
| App icon | 512x512 PNG (no transparency) |
| Feature graphic | 1024x500 PNG |
| Phone screenshots | Minimum 2, recommended 8 (16:9 or 9:16) |
| 7-inch tablet screenshots | Minimum 1, recommended 4 |
| App category | Travel & Local |
| Tags | Events, Restaurants, Travel, Local Guide, Des Moines |
| Contact email | support@desmoinesinsider.com |
| Privacy policy URL | https://desmoinesinsider.com/privacy-policy |

**Full description template:**
```
Discover the best of Des Moines with your AI-powered local insider guide!

Des Moines Insider helps you find events, restaurants, and attractions in the Des Moines metro area. Whether you're a local looking for something new or a visitor planning your trip, we've got you covered.

FEATURES:
- Browse hundreds of upcoming events with smart filtering
- Discover restaurants with ratings, cuisine filters, and real-time open/closed status
- Explore attractions on an interactive map
- Save your favorites and get event reminders
- Search across all content types instantly
- Get AI-powered insider tips (Premium)
- Advanced filters for distance, ratings, and more (Premium)
- Ad-free experience (Premium)

PREMIUM TIERS:
- Insider ($4.99/mo): Advanced filters, unlimited favorites, AI trip planner, insider tips, ad-free
- VIP ($12.99/mo): Everything in Insider plus VIP events, concierge support, and local perks

Download now and never miss what's happening in Des Moines!
```

### Step 4: Content Rating

Go to **Policy > App content > Content rating**:

1. Start questionnaire
2. Category: **Reference, News, or Educational**
3. Answer all questions (no violence, no sexual content, etc.)
4. Submit and apply the rating

### Step 5: Target Audience & Content

Go to **Policy > App content > Target audience**:

1. Target age group: **18 and over** (simplest option, avoids COPPA)
2. App doesn't appeal to children: Confirm

### Step 6: Data Safety

Go to **Policy > App content > Data safety**:

| Data type | Collected | Shared | Purpose |
|-----------|-----------|--------|---------|
| Email address | Yes | No | Account management |
| Name | Yes | No | App functionality |
| Phone number | Optional | No | App functionality |
| Approximate location | Yes | No | App functionality (nearby content) |
| Precise location | Yes | No | App functionality (map, distance) |
| App interactions | Yes | No | Analytics |
| Purchase history | Yes | No | Subscription management |

Security practices:
- [x] Data is encrypted in transit
- [x] Users can request data deletion
- Privacy policy URL: `https://desmoinesinsider.com/privacy-policy`

### Step 7: App Access

If the app has features requiring login:
1. Go to **Policy > App content > App access**
2. Select **All or some functionality is restricted**
3. Add instructions: "Tap Profile tab > Sign In. Use test account: test@desmoinesinsider.com / TestPass123!"
4. Create this test account in your Supabase Auth dashboard

---

## 8. Release Signing

### Step 1: Generate Release Keystore

```bash
mkdir -p android/keystore

keytool -genkeypair \
  -v \
  -storetype JKS \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass YOUR_KEYSTORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -alias desmoines-insider \
  -keystore android/keystore/release.jks \
  -dname "CN=Des Moines Insider, OU=Mobile, O=Des Moines AI Pulse, L=Des Moines, ST=Iowa, C=US"
```

**CRITICAL**:
- Back up `release.jks` securely (e.g., password manager, encrypted cloud storage)
- If you lose this keystore, you can NEVER update the app on Play Store
- NEVER commit the keystore to git
- Add to `.gitignore`: `android/keystore/`

### Step 2: Add to local.properties

```properties
RELEASE_KEYSTORE_FILE=../keystore/release.jks
RELEASE_KEYSTORE_PASSWORD=YOUR_KEYSTORE_PASSWORD
RELEASE_KEY_ALIAS=desmoines-insider
RELEASE_KEY_PASSWORD=YOUR_KEY_PASSWORD
```

### Step 3: Enable Play App Signing (Recommended)

1. In Play Console, go to **Setup > App signing**
2. Choose **Let Google manage and protect your app signing key**
3. Upload your signing key OR let Google generate one
4. Google will re-sign your AAB with their key for distribution

Benefits: If you lose your upload key, Google can reset it. Your signing key is protected by Google's infrastructure.

### Step 4: Build Release AAB

```bash
cd android/
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

---

## 9. Google Play Billing Products

### Step 1: Set Up Merchant Account

1. In Play Console, go to **Monetize > Monetization setup**
2. Link or create a Google payments merchant account
3. Complete business identity verification

### Step 2: Create Subscription Products

Go to **Monetize > Products > Subscriptions**:

#### Subscription: Des Moines Insider Premium

Click **Create subscription**:

| Field | Value |
|-------|-------|
| Product ID | `insider_monthly` |
| Name | Des Moines Insider - Insider |
| Description | Unlimited favorites, advanced filters, AI trip planner, insider tips, ad-free experience |

Add a base plan:
| Field | Value |
|-------|-------|
| Base plan ID | `insider-monthly-plan` |
| Renewal type | Auto-renewing |
| Billing period | 1 Month |
| Price | $4.99 USD |
| Grace period | 7 days |
| Account hold | 30 days |

#### Subscription: Des Moines Insider VIP

Click **Create subscription**:

| Field | Value |
|-------|-------|
| Product ID | `vip_monthly` |
| Name | Des Moines Insider - VIP |
| Description | Everything in Insider plus VIP events, concierge support, unlimited AI trips, and local perks |

Add a base plan:
| Field | Value |
|-------|-------|
| Base plan ID | `vip-monthly-plan` |
| Renewal type | Auto-renewing |
| Billing period | 1 Month |
| Price | $12.99 USD |
| Grace period | 7 days |
| Account hold | 30 days |

### Step 3: Update Product IDs in Code

Open `android/app/src/main/java/com/desmoines/aipulse/data/remote/BillingService.kt` and verify the product IDs match what you created:

```kotlin
companion object {
    const val INSIDER_MONTHLY_ID = "insider_monthly"
    const val VIP_MONTHLY_ID = "vip_monthly"
}
```

### Step 4: Testing Subscriptions

1. In Play Console, go to **Setup > License testing**
2. Add tester Gmail addresses
3. License testers can purchase subscriptions without real charges
4. Test all flows: purchase, restore, cancel, expire

---

## 10. Supabase Edge Function Secrets

The `validate-android-receipt` edge function needs a Google service account to verify purchases.

### Step 1: Create Service Account

1. Go to Google Cloud Console > **IAM & Admin > Service Accounts**
2. Click **+ Create Service Account**
3. Name: `play-billing-validator`
4. Role: None needed (API access via project)
5. Click **Done**
6. Click on the created service account
7. Go to **Keys > Add Key > Create new key > JSON**
8. Download the JSON key file

### Step 2: Link Service Account to Play Console

1. Go to Play Console > **Setup > API access**
2. Click **Link** next to Google Cloud Project
3. Under **Service accounts**, find `play-billing-validator`
4. Click **Manage Play Console permissions**
5. Grant: **View financial data, orders, and cancellation survey responses**
6. Grant: **Manage orders and subscriptions**
7. Apply to: **All apps** (or just Des Moines Insider)
8. Click **Invite user**

**Important**: It can take up to 24 hours for the service account to gain access.

### Step 3: Set Supabase Secret

```bash
# Encode the service account JSON as a single-line string
# Option 1: Base64 encode
cat path/to/service-account.json | base64 -w 0

# Set the secret in Supabase
supabase secrets set GOOGLE_PLAY_SERVICE_ACCOUNT_KEY='BASE64_ENCODED_KEY'

# OR set as raw JSON (escape properly)
supabase secrets set GOOGLE_PLAY_SERVICE_ACCOUNT_KEY="$(cat path/to/service-account.json)"
```

### Step 4: Deploy Edge Function

```bash
supabase functions deploy validate-android-receipt
```

### Step 5: Verify

Test with a license tester purchase. Check Supabase logs:
```bash
supabase functions logs validate-android-receipt
```

---

## 11. Building & Testing

### Debug Build

```bash
cd android/
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

### Release Build (AAB for Play Store)

```bash
cd android/
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

### Run Lint

```bash
./gradlew lint
# Report: app/build/reports/lint-results-debug.html
```

### Run Unit Tests

```bash
./gradlew test
# Report: app/build/reports/tests/testDebugUnitTest/index.html
```

### Run Instrumentation Tests (requires emulator or device)

```bash
./gradlew connectedAndroidTest
```

### Install on Device

```bash
./gradlew installDebug
# OR
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

## 12. Play Store Submission Checklist

### Before First Upload

- [ ] Developer account verified and active
- [ ] Merchant account set up (for subscriptions)
- [ ] Store listing complete (name, description, screenshots, icon, feature graphic)
- [ ] Content rating questionnaire completed
- [ ] Data safety form completed
- [ ] Target audience declared
- [ ] Privacy policy URL set
- [ ] App access instructions provided (test account)

### Before Each Release

- [ ] All tests passing: `./gradlew test lint assembleDebug`
- [ ] Release build succeeds: `./gradlew bundleRelease`
- [ ] Manually tested on physical device
- [ ] Tested on Android 8 (API 26) emulator (min SDK)
- [ ] Tested on latest Android (API 35) emulator
- [ ] Subscription flow tested with license tester
- [ ] Google Sign-In tested
- [ ] Map loads with pins
- [ ] Offline mode shows cached data
- [ ] Deep links work
- [ ] No crashes in Logcat
- [ ] ProGuard/R8 doesn't break release build

### Upload to Play Console

1. Go to **Release > Production** (or Testing tracks first)
2. Click **Create new release**
3. Upload `app-release.aab`
4. Add release notes
5. Review and roll out

### Recommended Release Strategy

1. **Internal testing** (up to 100 testers, instant approval)
2. **Closed testing** (invite-only, instant approval)
3. **Open testing** (public opt-in, review required)
4. **Production** (full public launch, review required)

Start with internal testing to verify everything works end-to-end, then progress through tracks.

---

## 13. Post-Launch

### Monitor

- **Play Console > Quality > Android Vitals**: Watch for ANRs and crash rates
- **Play Console > Quality > Ratings and reviews**: Respond to user feedback
- **Firebase Crashlytics** (if added): Real-time crash reporting
- **Supabase Dashboard > Logs**: Monitor edge function invocations

### Update Subscriptions

If you change pricing:
1. Update in Play Console > Monetize > Subscriptions
2. Existing subscribers keep their price until renewal
3. New subscribers get the new price

### Update the App

1. Increment `versionCode` and `versionName` in `app/build.gradle.kts`
2. Build release AAB
3. Upload to the appropriate testing track
4. Promote to production after testing

### Key Metrics to Track

- Install rate (store listing views → installs)
- Subscription conversion (installs → Insider/VIP)
- Retention (D1, D7, D30)
- Crash-free rate (target >99%)
- ANR rate (target <0.5%)
- Average rating (target >4.0)

---

## Environment Variables Quick Reference

| Variable | Where Used | How to Get |
|----------|-----------|------------|
| `SUPABASE_URL` | local.properties | Supabase Dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | local.properties | Supabase Dashboard > Settings > API |
| `GOOGLE_WEB_CLIENT_ID` | local.properties | Google Cloud Console > Credentials > OAuth Web Client |
| `GOOGLE_MAPS_API_KEY` | local.properties | Google Cloud Console > Credentials > API Key |
| `RELEASE_KEYSTORE_FILE` | local.properties | You generate this (keytool) |
| `RELEASE_KEYSTORE_PASSWORD` | local.properties | You set this during keytool |
| `RELEASE_KEY_ALIAS` | local.properties | You set this during keytool |
| `RELEASE_KEY_PASSWORD` | local.properties | You set this during keytool |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` | Supabase secret | Google Cloud Console > IAM > Service Accounts |
| `google-services.json` | android/app/ | Firebase Console > Project Settings > Android app |

---

## Troubleshooting

### "Supabase client not configured"
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in local.properties
- Run `./gradlew clean assembleDebug` to rebuild with new values

### Google Sign-In returns error
- Verify `GOOGLE_WEB_CLIENT_ID` matches the Web Client (not Android Client)
- Verify SHA-1 fingerprint matches your debug/release keystore
- Verify redirect URI in Supabase matches Google Cloud Console

### Map shows blank/gray
- Verify `GOOGLE_MAPS_API_KEY` in local.properties
- Verify Maps SDK for Android is enabled in Cloud Console
- Verify API key has Android app restriction with correct SHA-1

### Subscription purchase fails
- Verify app is uploaded to Play Console (even as internal test)
- Verify subscription products are active in Play Console
- Verify tester email is in License testing list
- Verify product IDs in BillingService.kt match Play Console

### Release build crashes but debug works
- Check ProGuard rules in `proguard-rules.pro`
- Run `./gradlew assembleRelease` and check for R8 warnings
- Test with `minifyEnabled = false` temporarily to isolate

### Edge function returns 401
- Verify user is authenticated (has valid Supabase session)
- Check Supabase function logs: `supabase functions logs validate-android-receipt`

### Edge function returns 500
- Verify `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` secret is set correctly
- Verify service account has Play Console permissions (can take 24h)
- Check function logs for detailed error message
