# Android App - Complete Setup & Play Store Submission Guide

**Last Updated**: 2026-03-29
**Platform**: Windows 11 + Android Studio Panda 2 + PowerShell

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Development Environment](#2-local-development-environment)
3. [Supabase Configuration](#3-supabase-configuration)
4. [Google Cloud Console Setup](#4-google-cloud-console-setup)
5. [Firebase Setup](#5-firebase-setup)
6. [Google Maps API Key](#6-google-maps-api-key)
7. [Release Signing (Keystore)](#7-release-signing-keystore)
8. [SHA Fingerprint Reference](#8-sha-fingerprint-reference)
9. [Google Play Console Setup](#9-google-play-console-setup)
10. [Store Listing Content](#10-store-listing-content)
11. [Screenshots & Graphics](#11-screenshots--graphics)
12. [Google Play Billing (Subscriptions)](#12-google-play-billing-subscriptions)
13. [Supabase Edge Function Secrets](#13-supabase-edge-function-secrets)
14. [Building & Testing](#14-building--testing)
15. [Play Store Submission Checklist](#15-play-store-submission-checklist)
16. [Post-Launch](#16-post-launch)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Prerequisites

### Software Requirements

| Tool                | Version             | Download / Install                                |
| ------------------- | ------------------- | ------------------------------------------------- |
| Android Studio      | Panda 2 (2025.1+)  | https://developer.android.com/studio              |
| JDK                 | 17                  | Bundled with Android Studio at `jbr/`             |
| Android SDK         | API 35 (Android 15) | Via Android Studio SDK Manager                    |
| Android Build Tools | 35.0.0              | Via Android Studio SDK Manager                    |
| Git                 | Latest              | https://git-scm.com                               |
| Node.js             | 20+                 | For Supabase CLI                                  |
| Supabase CLI        | Latest              | `npm install -g supabase`                         |

### Android Studio SDK Manager Checklist

Open **Android Studio > Settings > Languages & Frameworks > Android SDK**:

**SDK Platforms tab:**
- [x] Android 15.0 (API 35)

**SDK Tools tab:**
- [x] Android SDK Build-Tools 35.0.0
- [x] Android SDK Platform-Tools
- [x] Android Emulator
- [x] Google Play services

### Important: `keytool` Path on Windows

Android Studio bundles its own JDK. `keytool` is NOT on your system PATH by default. Throughout this guide, use the full path:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
```

If Android Studio is installed elsewhere, find it:

```powershell
Get-ChildItem "C:\Program Files\Android" -Recurse -Filter "keytool.exe" | Select-Object FullName
```

---

## 2. Local Development Environment

### Step 1: Create `local.properties`

This file is **gitignored** and must be created on each dev machine.

```powershell
cd android\
Copy-Item local.properties.example local.properties
```

Edit `android/local.properties` with your values:

```properties
# Android SDK (auto-set by Android Studio when you open the project)
sdk.dir=C:\\Users\\YOUR_USERNAME\\AppData\\Local\\Android\\Sdk

# ============================================
# Supabase Credentials (REQUIRED)
# ============================================
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# ============================================
# Google Sign-In (REQUIRED for auth)
# ============================================
GOOGLE_WEB_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com

# ============================================
# Google Maps (REQUIRED for map tab)
# ============================================
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# ============================================
# Release Signing (REQUIRED for release builds only)
# ============================================
RELEASE_KEYSTORE_FILE=../keystore/release.jks
RELEASE_KEYSTORE_PASSWORD=your_keystore_password
RELEASE_KEY_ALIAS=your_key_alias
RELEASE_KEY_PASSWORD=your_key_password
```

**Where to get each value** (detailed in sections below):

| Variable               | Source                                                    |
| ---------------------- | --------------------------------------------------------- |
| `SUPABASE_URL`         | Supabase Dashboard > Settings > API (same as `VITE_SUPABASE_URL`) |
| `SUPABASE_ANON_KEY`    | Supabase Dashboard > Settings > API (same as `VITE_SUPABASE_ANON_KEY`) |
| `GOOGLE_WEB_CLIENT_ID` | Google Cloud Console > Credentials > OAuth Web Client     |
| `GOOGLE_MAPS_API_KEY`  | Google Cloud Console > Credentials > API Key              |
| `RELEASE_*`            | You generate with `keytool` (Section 7)                   |

### Step 2: Place `google-services.json`

Download from Firebase Console (Section 5) and place at:

```
android/app/google-services.json
```

### Step 3: Open in Android Studio

1. Open Android Studio Panda 2
2. **File > Open** > select the `android/` folder (NOT the project root)
3. Wait for Gradle sync to complete
4. If prompted, accept any SDK license agreements

### Step 4: Verify Build

In Android Studio's terminal (bottom panel) or PowerShell:

```powershell
cd android
.\gradlew assembleDebug
```

If it says `BUILD SUCCESSFUL`, your environment is ready.

---

## 3. Supabase Configuration

The Android app uses the **same Supabase project** as the web and iOS apps.

### Get Credentials

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings > API**
4. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon/public key** → `SUPABASE_ANON_KEY`

> **Tip**: If you use Infisical, the values are the same as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — just drop the `VITE_` prefix.

### Configure Auth Redirect

1. In Supabase Dashboard, go to **Authentication > URL Configuration**
2. Under **Redirect URLs**, add:
   ```
   com.desmoines.aipulse://auth-callback
   ```
3. Save

---

## 4. Google Cloud Console Setup

URL: https://console.cloud.google.com

### Step 1: Select Your Project

Use the same Google Cloud project linked to your Firebase project. If you don't have one, Firebase will create it in Section 5.

### Step 2: Enable Required APIs

Go to **APIs & Services > Library** and enable these (search by name):

| API                               | Purpose                 |
| --------------------------------- | ----------------------- |
| **Maps SDK for Android**          | Map tab in the app      |
| **Identity Toolkit API**          | Google Sign-In          |
| **Google Play Android Developer API** | Subscription validation |

> **Note**: You do NOT need Maps JavaScript API, Maps SDK for iOS, URL signing, or any other Maps product. Only **Maps SDK for Android**.

### Step 3: Configure OAuth Consent Screen

Go to **APIs & Services > OAuth consent screen**:

1. User Type: **External**
2. Fill in:
   | Field               | Value                                         |
   | ------------------- | --------------------------------------------- |
   | App name            | Des Moines Insider                             |
   | User support email  | support@desmoinesinsider.com                   |
   | App logo            | Upload your 512x512 app icon                   |
   | App domain          | https://desmoinesinsider.com                   |
   | Privacy policy URL  | https://desmoinesinsider.com/privacy-policy    |
   | Terms of service    | https://desmoinesinsider.com/terms             |
3. Scopes: Add `email`, `profile`, `openid`
4. Save and Continue
5. **Publish the app** (move from Testing to Production) when ready for public use

### Step 4: Create OAuth 2.0 Credentials

Go to **APIs & Services > Credentials**:

#### A) Web Client ID (used by Supabase for Google Auth)

1. Click **+ Create Credentials > OAuth client ID**
2. Application type: **Web application**
3. Name: `Des Moines Insider Web Client`
4. Authorized redirect URIs — add:
   ```
   https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback
   ```
5. Click **Create**
6. Copy the **Client ID** → this is your `GOOGLE_WEB_CLIENT_ID`

#### B) Android Client ID (for app verification)

1. Click **+ Create Credentials > OAuth client ID**
2. Application type: **Android**
3. Name: `Des Moines Insider Android (Debug)`
4. Package name: `com.desmoines.aipulse`
5. SHA-1 certificate fingerprint: Get your **debug** SHA-1 (see Section 8)
6. Click **Create**

Repeat for release:

1. Click **+ Create Credentials > OAuth client ID**
2. Application type: **Android**
3. Name: `Des Moines Insider Android (Release)`
4. Package name: `com.desmoines.aipulse`
5. SHA-1 certificate fingerprint: Get your **release** SHA-1 (see Section 8)
6. Click **Create**

> **Important**: You need TWO Android OAuth clients — one for debug SHA-1 and one for release SHA-1. Only the `GOOGLE_WEB_CLIENT_ID` (from Step 4A) goes in `local.properties`.

### Step 5: Link Google Cloud to Supabase

1. Go to Supabase Dashboard > **Authentication > Providers > Google**
2. Enable Google provider
3. Paste the **Web Client ID** from Step 4A
4. Paste the **Web Client Secret** from Step 4A
5. Save

---

## 5. Firebase Setup

URL: https://console.firebase.google.com

### Step 1: Create Firebase Project

1. Click **Add project**
2. Name: `Des Moines Insider`
3. If you already have a Google Cloud project, select **Link to existing Google Cloud project**
4. Enable Google Analytics (optional)
5. Click **Create Project**

### Step 2: Add Android App

1. In project overview, click the **Android** icon
2. Package name: `com.desmoines.aipulse`
3. App nickname: `Des Moines Insider Android`
4. Debug signing certificate SHA-1: Get from Section 8
5. Click **Register App**
6. **Download `google-services.json`**
7. Place it at `android/app/google-services.json`
8. Click **Continue to console** (skip SDK steps — already configured)

### Step 3: Enable Cloud Messaging

1. Go to **Project Settings > Cloud Messaging**
2. Confirm **Firebase Cloud Messaging API (V1)** is **Enabled**
3. Note the **Sender ID** (auto-configured via `google-services.json`)

> **Note**: You do NOT need to set up a service account here for push notifications. Firebase manages this automatically. A service account is only needed later for Play Store billing validation (Section 13).

### Step 4: Add Release SHA-1

After generating your release keystore (Section 7):

1. Go to **Project Settings > General > Your Apps > Android app**
2. Click **Add fingerprint**
3. Paste your **release SHA-1** (see Section 8)
4. **Re-download `google-services.json`** (it now contains both fingerprints)
5. Replace the file at `android/app/google-services.json`

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
   - Click **Add**
   - Package name: `com.desmoines.aipulse`
   - SHA-1: Add your **debug** SHA-1
   - Click **Add** again
   - Package name: `com.desmoines.aipulse`
   - SHA-1: Add your **release** SHA-1
3. Under **API restrictions**:
   - Select **Restrict key**
   - Check only: **Maps SDK for Android**
4. Click **Save**

> **Note**: You do NOT need URL signing for the Maps SDK. URL signing is only for server-side web APIs.

### Step 3: Add to local.properties

```properties
GOOGLE_MAPS_API_KEY=AIzaSy...your_key
```

---

## 7. Release Signing (Keystore)

### Step 1: Create the Keystore Directory

```powershell
New-Item -ItemType Directory -Path "android\keystore" -Force
```

### Step 2: Generate Release Keystore

Run this as a **single line** in PowerShell:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -storepass YOUR_SECURE_PASSWORD -keypass YOUR_KEY_PASSWORD -alias desmoines-insider -keystore "android\keystore\release.jks" -dname "CN=Your Name, OU=Mobile, O=Your Company, L=Your City, ST=Your State, C=US"
```

If PowerShell breaks the command (common with long lines), use backticks for line continuation:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" `
  -genkeypair -v -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass YOUR_SECURE_PASSWORD `
  -keypass YOUR_KEY_PASSWORD `
  -alias desmoines-insider `
  -keystore "android\keystore\release.jks" `
  -dname "CN=Your Name, OU=Mobile, O=Your Company, L=Your City, ST=Your State, C=US"
```

> **Important**: Make sure there is a space before each backtick and NOTHING after it on the same line.

If `keytool` prompts you interactively (ignoring `-dname`), it will use the `-storepass` and `-keypass` you provided but may default the alias to `mykey`. Verify your alias with the list command in Section 8.

### Step 3: Add to local.properties

```properties
RELEASE_KEYSTORE_FILE=../keystore/release.jks
RELEASE_KEYSTORE_PASSWORD=YOUR_SECURE_PASSWORD
RELEASE_KEY_ALIAS=desmoines-insider
RELEASE_KEY_PASSWORD=YOUR_KEY_PASSWORD
```

> **If keytool defaulted to `mykey`**: Use `RELEASE_KEY_ALIAS=mykey` instead.

### CRITICAL: Back Up Your Keystore

- **If you lose `release.jks`, you can NEVER update the app on the Play Store**
- Store a copy in your password manager, encrypted cloud storage, or secure backup
- NEVER commit the keystore to git (it's already in `.gitignore`)
- Write down your passwords and store them separately from the keystore

---

## 8. SHA Fingerprint Reference

You'll need SHA-1 and SHA-256 fingerprints for Google Cloud Console, Firebase, and Play Store. Here are all the commands for Windows PowerShell.

### Debug Keystore

The debug keystore is auto-generated the first time you build in Android Studio. Located at `C:\Users\YOUR_USERNAME\.android\debug.keystore`. Default password: `android`. Default alias: `androiddebugkey`.

**If it doesn't exist yet**, generate it:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"
```

**Get debug SHA-1 and SHA-256:**

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
```

Look for the `SHA1:` and `SHA256:` lines.

### Release Keystore

**Get release SHA-1 and SHA-256:**

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore "android\keystore\release.jks" -storepass YOUR_KEYSTORE_PASSWORD
```

This will show the alias name and all fingerprints. Look for:
- `Alias name:` — verify this matches your `RELEASE_KEY_ALIAS` in `local.properties`
- `SHA1:` — needed for Google Cloud Console Android OAuth clients and Firebase
- `SHA256:` — needed for Play App Signing and deep link verification

### Alternate Method: Android Studio Gradle

In Android Studio's terminal, run:

```powershell
.\gradlew signingReport
```

This prints SHA-1 and SHA-256 for both debug and release in one shot.

### Where Each Fingerprint Is Used

| Fingerprint    | Where to Add                                                       |
| -------------- | ------------------------------------------------------------------ |
| Debug SHA-1    | Google Cloud Console (Android OAuth client), Firebase Android app  |
| Release SHA-1  | Google Cloud Console (Android OAuth client), Firebase Android app, Google Maps API key restriction |
| Release SHA-256| Play Console (App signing), Digital Asset Links (deep links)       |

---

## 9. Google Play Console Setup

URL: https://play.google.com/console

### Step 1: Create Developer Account

1. Go to https://play.google.com/console/signup
2. Pay the one-time **$25 registration fee**
3. Complete **identity verification** (can take 1-3 business days)
4. Choose **Organization** or **Individual** profile
5. Complete all required declarations

### Step 2: Create App

1. Click **Create app**
2. Fill in:
   | Field             | Value                    |
   | ----------------- | ------------------------ |
   | App name          | Des Moines Insider       |
   | Default language  | English (United States)  |
   | App or game       | App                      |
   | Free or paid      | Free                     |
3. Accept all declarations
4. Click **Create app**

### Step 3: App Content (Policy Requirements)

Google requires several policy forms before you can publish. Complete each one under **Policy > App content**:

#### A) Privacy Policy

1. Go to **App content > Privacy policy**
2. Enter URL: `https://desmoinesinsider.com/privacy-policy`
3. Save

#### B) App Access

1. Go to **App content > App access**
2. Select **All or some functionality is restricted**
3. Click **+ Add new instructions**
4. Add a test account:
   | Field    | Value                           |
   | -------- | ------------------------------- |
   | Username | test@desmoinesinsider.com       |
   | Password | TestPass123!                    |
   | Notes    | Tap Profile tab > Sign In       |
5. **Create this test account** in your Supabase Auth dashboard beforehand
6. Save

#### C) Ads Declaration

1. Go to **App content > Ads**
2. Select **Yes, my app contains ads** (if applicable) or **No**
3. Save

#### D) Content Rating

1. Go to **App content > Content rating**
2. Click **Start questionnaire**
3. Email: your developer contact email
4. Category: **Reference, News, or Educational**
5. Answer all questions honestly:
   - Violence: No
   - Sexual content: No
   - Language: No
   - Controlled substances: No (restaurants may serve alcohol — check guidance)
   - User interaction: Yes (reviews, favorites)
   - Shares location: Yes
   - Shares personal information: Yes (email for auth)
6. Click **Save > Next > Submit**

#### E) Target Audience

1. Go to **App content > Target audience**
2. Target age group: **18 and over** (simplest, avoids COPPA/child safety requirements)
3. Confirm app does not appeal to children
4. Save

#### F) Data Safety

1. Go to **App content > Data safety**
2. Click **Start**
3. Fill in:

   **Data collection:**
   | Data Type            | Collected? | Shared? | Purpose               | Optional? |
   | -------------------- | ---------- | ------- | --------------------- | --------- |
   | Email address        | Yes        | No      | Account management    | No        |
   | Name                 | Yes        | No      | App functionality     | Yes       |
   | Approximate location | Yes        | No      | Nearby content        | No        |
   | Precise location     | Yes        | No      | Map, distance calc    | Yes       |
   | App interactions     | Yes        | No      | Analytics             | No        |
   | Purchase history     | Yes        | No      | Subscription mgmt    | No        |

   **Security practices:**
   - [x] Data is encrypted in transit
   - [x] Users can request data deletion
   - [x] Committed to follow the Families Policy (if targeting under 13 — not applicable here)

4. Review and submit

#### G) Government Apps (if asked)

Select **No, this is not a government app**

### Step 4: Enable Play App Signing

1. Go to **Setup > App signing**
2. Choose **Let Google manage and protect your app signing key**
3. Upload your app signing key (from `release.jks`) OR let Google generate one
4. This allows Google to re-sign your AAB for distribution

> **Benefit**: If you ever lose your upload key, Google can reset it. Without this, a lost key = dead app.

---

## 10. Store Listing Content

Go to **Grow > Store presence > Main store listing** and fill in:

### Required Text

| Field             | Content |
| ----------------- | ------- |
| **App name**      | Des Moines Insider |
| **Short description** (80 char max) | Discover Des Moines events, restaurants & attractions powered by AI |
| **Full description** (4000 char max) | See below |

**Full description:**

```
Discover the best of Des Moines with your AI-powered local insider guide!

Des Moines Insider helps you find events, restaurants, and attractions in the Des Moines metro area. Whether you're a local looking for something new or a visitor planning your trip, we've got you covered.

FEATURES:
★ Browse hundreds of upcoming events with smart filtering
★ Discover restaurants with ratings, cuisine filters, and real-time open/closed status
★ Explore attractions on an interactive map
★ Save your favorites and get event reminders
★ Search across all content types instantly
★ Get AI-powered insider tips (Premium)
★ Advanced filters for distance, ratings, and more (Premium)
★ Ad-free experience (Premium)

PREMIUM TIERS:
◆ Insider ($4.99/mo): Advanced filters, unlimited favorites, AI trip planner, insider tips, ad-free
◆ VIP ($12.99/mo): Everything in Insider plus VIP events, concierge support, and local perks

EXPLORE DES MOINES:
• Events — Concerts, food festivals, sports, family activities, and more
• Restaurants — Filter by cuisine, price, dietary options, and distance
• Attractions — Museums, parks, landmarks with directions and hours
• Map View — See everything near you on an interactive map

Download now and never miss what's happening in Des Moines!
```

### Required Graphics

| Asset              | Dimensions   | Format           | Notes                                     |
| ------------------ | ------------ | ---------------- | ----------------------------------------- |
| **App icon**       | 512 x 512    | PNG, no alpha    | Must match your in-app icon               |
| **Feature graphic**| 1024 x 500   | PNG or JPEG      | Banner shown at top of store listing      |

### Categorization

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| App category       | Travel & Local                               |
| Tags               | Events, Restaurants, Travel, Local Guide     |
| Contact email      | support@desmoinesinsider.com                 |
| Contact website    | https://desmoinesinsider.com                 |
| Privacy policy URL | https://desmoinesinsider.com/privacy-policy  |

---

## 11. Screenshots & Graphics

### Requirements Summary

| Type                     | Count    | Aspect Ratio  | Min Size     | Recommended Size  |
| ------------------------ | -------- | ------------- | ------------ | ----------------- |
| **Phone screenshots**    | 2-8 req  | 9:16 or 16:9  | 320px side   | 1080x1920 (9:16)  |
| **7" tablet screenshots**| 1-8 req  | 9:16 or 16:9  | 320px side   | 1200x1920 (9:16)  |
| **10" tablet screenshots** | 0-8    | 9:16 or 16:9  | 1080px side  | 1600x2560 (9:16)  |

> To be eligible for promotion, include **at least 4 phone screenshots** at a minimum of **1080px on each side**.

### How to Capture Screenshots in Android Studio

#### Step 1: Create Emulators in Device Manager

Open **Android Studio > Tools > Device Manager** (or the device icon in the toolbar):

**Phone emulator:**
1. Click **Create Virtual Device**
2. Select **Pixel 7** (or Pixel 8)
3. System image: **API 35** (with Google Play)
4. Finish — this gives you 1080x2400 (9:16)

**7-inch tablet emulator:**
1. Click **Create Virtual Device**
2. Select **Nexus 7 (2013)** or similar 7" device
3. System image: **API 35**
4. Finish

**10-inch tablet emulator:**
1. Click **Create Virtual Device**
2. Select **Pixel Tablet** or **Nexus 10**
3. System image: **API 35**
4. Finish

#### Step 2: Run the App

1. Select your emulator from the device dropdown in the toolbar
2. Click the **Run** button (green play icon) or press `Shift+F10`
3. Wait for the app to install and launch

#### Step 3: Capture Screenshots

For each screen you want to capture:

1. Navigate to the screen in the emulator
2. In the emulator toolbar, click the **camera icon** (or press `Ctrl+S` in the emulator window)
3. Screenshots save to your desktop by default

#### Step 4: Recommended Screens to Capture (Phone)

Capture these 8 screens for a complete listing:

1. **Home screen** — Shows featured events and quick access
2. **Events list** — Browse events with filters applied
3. **Event detail** — A specific event with full info
4. **Restaurants list** — Restaurant cards with ratings
5. **Map view** — Interactive map with pins
6. **Search** — Search results across categories
7. **Favorites** — Saved items (signed in)
8. **Subscription/Pricing** — Show premium tiers

Repeat for tablet emulators with the same screens.

#### Tips for Great Screenshots

- Use the app with **sample data** loaded (connect to your Supabase instance)
- Use **light mode** for primary screenshots
- Enable the emulator's **system navigation** for realistic look
- Ensure the **status bar** shows a reasonable time (like 9:41)
- No debug banners — use a **release build** on emulator: `.\gradlew installRelease`

---

## 12. Google Play Billing (Subscriptions)

### Step 1: Set Up Merchant Account

1. In Play Console, go to **Monetize > Monetization setup**
2. Link or create a Google payments merchant account
3. Complete business identity verification

### Step 2: Create Subscription Products

Go to **Monetize > Products > Subscriptions**:

#### Insider Tier

| Field       | Value                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| Product ID  | `insider_monthly`                                                                        |
| Name        | Des Moines Insider - Insider                                                             |
| Description | Unlimited favorites, advanced filters, AI trip planner, insider tips, ad-free experience |

Base plan:

| Field          | Value              |
| -------------- | ------------------ |
| Base plan ID   | `insider-monthly-plan` |
| Renewal type   | Auto-renewing      |
| Billing period | 1 Month            |
| Price          | $4.99 USD          |
| Grace period   | 7 days             |
| Account hold   | 30 days            |

#### VIP Tier

| Field       | Value                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------- |
| Product ID  | `vip_monthly`                                                                                 |
| Name        | Des Moines Insider - VIP                                                                      |
| Description | Everything in Insider plus VIP events, concierge support, unlimited AI trips, and local perks |

Base plan:

| Field          | Value              |
| -------------- | ------------------ |
| Base plan ID   | `vip-monthly-plan` |
| Renewal type   | Auto-renewing      |
| Billing period | 1 Month            |
| Price          | $12.99 USD         |
| Grace period   | 7 days             |
| Account hold   | 30 days            |

### Step 3: Verify Product IDs in Code

These must match `BillingService.kt`:
```kotlin
companion object {
    const val INSIDER_MONTHLY_ID = "insider_monthly"
    const val VIP_MONTHLY_ID = "vip_monthly"
}
```

### Step 4: Set Up License Testing

1. In Play Console, go to **Setup > License testing**
2. Add tester Gmail addresses
3. License testers can purchase subscriptions without real charges
4. Test all flows: purchase, restore, cancel, expire

---

## 13. Supabase Edge Function Secrets

The `validate-android-receipt` edge function needs a Google service account to verify Play Store purchases.

### Step 1: Create Service Account

1. Go to Google Cloud Console > **IAM & Admin > Service Accounts**
2. Click **+ Create Service Account**
3. Name: `play-billing-validator`
4. Skip role assignment (not needed at project level)
5. Click **Done**
6. Click on the created service account
7. Go to **Keys > Add Key > Create new key > JSON**
8. Download the JSON key file — save it securely

### Step 2: Link Service Account to Play Console

1. Go to Play Console > **Setup > API access**
2. Click **Link** next to your Google Cloud Project
3. Under **Service accounts**, find `play-billing-validator`
4. Click **Manage Play Console permissions**
5. Grant:
   - View financial data, orders, and cancellation survey responses
   - Manage orders and subscriptions
6. Apply to: **All apps** (or just Des Moines Insider)
7. Click **Invite user**

> **Note**: It can take up to **24 hours** for the service account to gain access.

### Step 3: Set Supabase Secret

```bash
# Base64 encode the service account JSON
cat path/to/service-account.json | base64 -w 0

# Set in Supabase
supabase secrets set GOOGLE_PLAY_SERVICE_ACCOUNT_KEY='BASE64_ENCODED_KEY'
```

### Step 4: Deploy Edge Function

```bash
supabase functions deploy validate-android-receipt
```

---

## 14. Building & Testing

### Build Commands

All commands run from the `android/` directory. Set `JAVA_HOME` if running outside Android Studio's terminal:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

| Command                       | Purpose                           | Output Location                                        |
| ----------------------------- | --------------------------------- | ------------------------------------------------------ |
| `.\gradlew assembleDebug`     | Debug APK                         | `app/build/outputs/apk/debug/app-debug.apk`           |
| `.\gradlew assembleRelease`   | Release APK (signed)              | `app/build/outputs/apk/release/app-release.apk`       |
| `.\gradlew bundleRelease`     | Release AAB (for Play Store)      | `app/build/outputs/bundle/release/app-release.aab`    |
| `.\gradlew lint`              | Lint analysis                     | `app/build/reports/lint-results-debug.html`            |
| `.\gradlew test`              | Unit tests                        | `app/build/reports/tests/testDebugUnitTest/index.html` |
| `.\gradlew connectedAndroidTest` | Instrumentation tests (needs emulator) | `app/build/reports/androidTests/connected/`     |
| `.\gradlew signingReport`     | Show SHA-1/SHA-256 for all variants | Console output                                       |

### Pre-Submission Test Checklist

Run all of these before uploading to Play Store:

```powershell
# 1. Clean build
.\gradlew clean

# 2. Lint check
.\gradlew lint

# 3. Unit tests
.\gradlew test

# 4. Debug build (verifies compilation)
.\gradlew assembleDebug

# 5. Release bundle (for Play Store upload)
.\gradlew bundleRelease

# Or run them all at once:
.\gradlew clean lint test bundleRelease
```

### Manual Testing Checklist

Test on an emulator AND a physical device if possible:

- [ ] App launches without crash
- [ ] Home screen loads events and restaurants
- [ ] Events list with filtering (date, category)
- [ ] Event detail screen (tap an event)
- [ ] Restaurants list with filtering (cuisine, rating)
- [ ] Restaurant detail screen
- [ ] Map tab loads with pins
- [ ] Map pins are tappable
- [ ] Search works across events, restaurants, attractions
- [ ] Google Sign-In flow completes
- [ ] Profile screen shows user info after sign-in
- [ ] Favorites: save and unsave items
- [ ] Subscription screen shows tiers and pricing
- [ ] Subscription purchase flow (use license tester account)
- [ ] Push notification permission prompt appears (Android 13+)
- [ ] App works in airplane mode (shows cached data or offline message)
- [ ] Back navigation works correctly on every screen
- [ ] No crashes in Logcat (`adb logcat | Select-String "FATAL"`)

### Device Coverage

Test on at minimum:

| Device          | API Level | Why                       |
| --------------- | --------- | ------------------------- |
| Pixel 7 (emu)   | API 35    | Latest Android            |
| Pixel 4a (emu)  | API 26    | Min SDK (Android 8)       |
| Physical device | Any       | Real-world performance    |

---

## 15. Play Store Submission Checklist

### Before First Upload

- [ ] Developer account verified and active ($25 paid)
- [ ] Merchant account set up (for subscriptions)
- [ ] Store listing complete:
  - [ ] App name
  - [ ] Short description
  - [ ] Full description
  - [ ] App icon (512x512 PNG)
  - [ ] Feature graphic (1024x500)
  - [ ] Phone screenshots (min 2, recommended 8)
  - [ ] 7-inch tablet screenshots (min 1)
  - [ ] 10-inch tablet screenshots (optional but recommended)
- [ ] Content rating questionnaire completed
- [ ] Data safety form completed
- [ ] Target audience declared (18+)
- [ ] Privacy policy URL set
- [ ] App access instructions provided (test account)
- [ ] Ads declaration completed
- [ ] Play App Signing enabled

### Upload & Release

#### Recommended: Start with Internal Testing

1. Go to **Release > Testing > Internal testing**
2. Click **Create new release**
3. Upload `app-release.aab` (from `app/build/outputs/bundle/release/`)
4. Add release notes:
   ```
   Initial release of Des Moines Insider for Android.
   - Browse events, restaurants, and attractions
   - Interactive map with location-based discovery
   - Google Sign-In and favorites
   - Insider and VIP subscription tiers
   ```
5. Review and click **Start rollout to Internal testing**
6. Add tester emails under **Testers** tab

Internal testing is **approved instantly** (no Google review). Use it to verify:
- App installs from Play Store
- Subscriptions work end-to-end
- Google Sign-In works with production configuration

#### Progress Through Tracks

1. **Internal testing** → up to 100 testers, instant approval
2. **Closed testing** → invite-only, instant approval
3. **Open testing** → public opt-in, requires Google review (~3-7 days)
4. **Production** → full public launch, requires Google review (~3-7 days)

### First Review Expectations

Google's first review typically takes **3-7 days** and commonly flags:
- Missing privacy policy
- Incomplete data safety form
- Test account not working
- App crashes during review
- Subscription issues

---

## 16. Post-Launch

### Monitor

| What                | Where                                              |
| ------------------- | -------------------------------------------------- |
| Crashes & ANRs      | Play Console > Quality > Android Vitals            |
| Ratings & reviews   | Play Console > Quality > Ratings and reviews       |
| Install metrics     | Play Console > Statistics                          |
| Edge function logs  | `supabase functions logs validate-android-receipt`  |
| Auth issues         | Supabase Dashboard > Authentication > Users        |

### Key Metrics to Track

| Metric             | Target  |
| ------------------ | ------- |
| Crash-free rate    | >99%    |
| ANR rate           | <0.5%   |
| Average rating     | >4.0    |
| D1 retention       | >40%    |
| D7 retention       | >20%    |
| Sub conversion     | >3%     |

### Updating the App

1. Increment in `app/build.gradle.kts`:
   ```kotlin
   versionCode = 2       // must increase every release
   versionName = "1.1.0" // human-readable version
   ```
2. Build: `.\gradlew bundleRelease`
3. Upload to appropriate testing track
4. Add release notes
5. Promote to production after testing

---

## 17. Troubleshooting

### "keytool is not recognized"

Use the full path: `& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"`

### "Keystore file does not exist"

The debug keystore at `C:\Users\YOU\.android\debug.keystore` is created on first build. Either build the project in Android Studio or generate it manually (Section 8).

### PowerShell breaks long commands

PowerShell treats line breaks as command separators. Either:
- Paste as a single line
- Use backtick (`` ` ``) for line continuation (space before, nothing after)
- Use Android Studio's built-in terminal instead

### "Supabase client not configured"

- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `local.properties`
- Run `.\gradlew clean assembleDebug` to rebuild with new values

### Google Sign-In returns error

- Verify `GOOGLE_WEB_CLIENT_ID` is the **Web** client (not Android client)
- Verify SHA-1 fingerprints match your debug/release keystores
- Verify redirect URI in Supabase matches Google Cloud Console
- Verify OAuth consent screen is published (not in Testing mode)

### Map shows blank/gray

- Verify `GOOGLE_MAPS_API_KEY` in `local.properties`
- Verify **Maps SDK for Android** is enabled in Cloud Console
- Verify API key has Android app restriction with correct SHA-1 and package name

### Subscription purchase fails

- App must be uploaded to Play Console (even as internal test) before purchases work
- Verify subscription products are **Active** in Play Console
- Verify tester email is in **Setup > License testing**
- Verify product IDs in `BillingService.kt` match Play Console exactly

### Release build crashes but debug works

- Check ProGuard rules in `proguard-rules.pro`
- Test with `isMinifyEnabled = false` temporarily to isolate
- Look at `app/build/outputs/mapping/release/mapping.txt` to deobfuscate stack traces

### Edge function returns 401/500

- Verify user has valid Supabase session
- Check: `supabase functions logs validate-android-receipt`
- Verify `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` secret is set
- Service account permissions can take up to 24 hours to propagate

---

## Environment Variables Quick Reference

| Variable                          | File             | Source                                                    |
| --------------------------------- | ---------------- | --------------------------------------------------------- |
| `SUPABASE_URL`                    | local.properties | Supabase Dashboard > Settings > API                       |
| `SUPABASE_ANON_KEY`              | local.properties | Supabase Dashboard > Settings > API                       |
| `GOOGLE_WEB_CLIENT_ID`           | local.properties | Google Cloud Console > Credentials > OAuth Web Client     |
| `GOOGLE_MAPS_API_KEY`            | local.properties | Google Cloud Console > Credentials > API Key              |
| `RELEASE_KEYSTORE_FILE`          | local.properties | Path to your `release.jks`                                |
| `RELEASE_KEYSTORE_PASSWORD`      | local.properties | Set during `keytool -genkeypair`                          |
| `RELEASE_KEY_ALIAS`              | local.properties | Set during `keytool -genkeypair` (verify with `-list`)    |
| `RELEASE_KEY_PASSWORD`           | local.properties | Set during `keytool -genkeypair`                          |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY`| Supabase secret  | Google Cloud Console > IAM > Service Accounts > JSON key  |
| `google-services.json`           | android/app/     | Firebase Console > Project Settings > Android app         |

---

## App Build Info

| Property       | Value              |
| -------------- | ------------------ |
| Package name   | `com.desmoines.aipulse` |
| Version code   | `1`                |
| Version name   | `1.0.0`            |
| Min SDK        | 26 (Android 8.0)   |
| Target SDK     | 35 (Android 15)    |
| Compile SDK    | 35                 |
| Gradle         | 8.13               |
| JDK            | 17                 |
