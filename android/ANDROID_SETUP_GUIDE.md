# Android Setup Guide (A to Z)

Complete setup guide for building and running the Des Moines Insider Android app. Covers Google Cloud Console, Firebase (FCM), Android Studio Panda 2, and Infisical secrets.

**Last Updated**: 2026-03-31

> **PowerShell Note**: All commands in this guide are written for **Windows PowerShell**. `keytool` and `gradlew` require the paths below. If you haven't added them to your PATH, use the full paths shown in each command. The Android Studio JBR (bundled JDK) is used for `keytool`:
> ```powershell
> # One-time: add Android Studio's keytool to your current session
> $env:Path += ";C:\Program Files\Android\Android Studio\jbr\bin"
> ```
> After running this once per session, you can use `keytool` directly. To make it permanent, add `C:\Program Files\Android\Android Studio\jbr\bin` to your system **Environment Variables > PATH**.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Google Cloud Console Setup](#2-google-cloud-console-setup)
3. [Firebase Setup (Push Notifications)](#3-firebase-setup-push-notifications)
4. [Android Studio Panda 2 Setup](#4-android-studio-panda-2-setup)
5. [Project Configuration](#5-project-configuration)
6. [Infisical Secrets (local.properties)](#6-infisical-secrets-localproperties)
7. [Build & Run](#7-build--run)
8. [Google Play Console Setup](#8-google-play-console-setup)
9. [Release Signing (Keystore)](#9-release-signing-keystore)
10. [CI/CD (GitHub Actions)](#10-cicd-github-actions)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

Before starting, ensure you have:

| Requirement | Details |
|---|---|
| **Google Account** | For Cloud Console, Firebase, and Play Store |
| **Google Play Developer Account** | $25 one-time fee ([register here](https://play.google.com/console/signup)) |
| **Infisical Account** | For pulling secrets ([infisical.com](https://infisical.com)) |
| **JDK 17** | Required by this project's Gradle config |
| **Git** | For cloning the repository |
| **Windows/macOS/Linux** | Android Studio Panda 2 runs on all three |

### Project Tech Stack (for reference)

- **Kotlin 2.1.0** with **Jetpack Compose** (Material 3)
- **Hilt 2.53.1** (Dependency Injection)
- **Supabase Kotlin SDK 3.1.1** (Backend)
- **Gradle 8.11.1** / **AGP 8.7.3**
- **Min SDK 26** (Android 8.0) / **Target SDK 35** (Android 15)
- **Package**: `com.desmoines.aipulse`

---

## 2. Google Cloud Console Setup

The Android app uses Google Cloud for OAuth (Google Sign-In) and push notifications. Complete these steps in order.

### 2.1 Create or Select a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown (top-left, next to "Google Cloud")
3. Click **New Project** (or select the existing `Des Moines Insider` project if it already exists)
   - **Project name**: `Des Moines Insider`
   - **Organization**: your org or "No organization"
4. Click **Create**
5. Wait for creation, then select the project from the dropdown

### 2.2 Enable Required APIs

Navigate to **APIs & Services > Library** and enable each of the following:

| API | Purpose |
|---|---|
| **Identity Toolkit API** | Google Sign-In / Credential Manager authentication |
| **People API** | Fetch Google profile info (name, avatar) after sign-in |
| **PageSpeed Insights API** | Performance monitoring (web dashboard) |
| **Firebase Cloud Messaging API** | Push notifications |
| **Google Play Android Developer API** | Automated Play Store uploads (CI/CD) |

> **Note**: Search for the exact names above. "Identity Toolkit API" may also appear as "Google Identity Toolkit API". Do **not** search for "Google Identity Services" - that is a client-side web library, not a Cloud Console API.

To enable each:
1. Search for the API name
2. Click on it
3. Click **Enable**

### 2.3 Create OAuth 2.0 Credentials (Google Sign-In)

**A. Configure the OAuth Consent Screen** (one-time)

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** user type > **Create**
3. Fill in:
   - **App name**: `Des Moines Insider`
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue**
5. **Scopes**: Add `email`, `profile`, `openid` > **Save and Continue**
6. **Test users**: Add your Google account > **Save and Continue**
7. Review and click **Back to Dashboard**

**B. Create a Web Client ID** (used by Supabase Auth + Android Credential Manager)

1. Go to **APIs & Services > Credentials**
2. Click **+ Create Credentials > OAuth client ID**
3. **Application type**: `Web application`
4. **Name**: `Des Moines Insider Web Client`
5. **Authorized redirect URIs**: Add your Supabase Auth callback URL:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
6. Click **Create**
7. **Copy the Client ID** - this is your `GOOGLE_WEB_CLIENT_ID`
   - Format: `XXXXXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.apps.googleusercontent.com`
   - This is used in both the web app and the Android app (Credential Manager uses the web client ID, not the Android client ID)

**C. Create an Android Client ID** (links SHA-1 to your app)

1. Still in **Credentials**, click **+ Create Credentials > OAuth client ID**
2. **Application type**: `Android`
3. **Name**: `Des Moines Insider Android`
4. **Package name**: `com.desmoines.aipulse`
5. **SHA-1 certificate fingerprint**: Get this from your debug keystore:

   ```powershell
   # Windows PowerShell
   keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android 2>$null | Select-String "SHA1:"
   ```

   Copy the SHA-1 hash (format: `XX:XX:XX:...`)

6. Click **Create**
7. You do NOT need to copy this client ID into your code - it's only used by Google to verify your app's signing certificate

**D. (Production) Add Release SHA-1**

When you create a release keystore (see [Section 9](#9-release-signing-keystore)), add its SHA-1 to the same Android OAuth client:

1. Go to **Credentials > Des Moines Insider Android** (edit)
2. Under **Additional SHA-1 fingerprints**, add the release keystore SHA-1
3. Save

### 2.4 Create an API Key (PageSpeed Insights)

1. Go to **APIs & Services > Credentials**
2. Click **+ Create Credentials > API key**
3. Click **Restrict Key**:
   - **Name**: `PageSpeed Insights Key`
   - **API restrictions**: Restrict to `PageSpeed Insights API` only
4. Copy the key - this is your `PAGESPEED_INSIGHTS_API_KEY`

---

## 3. Firebase Setup (Push Notifications)

Firebase is used **only for Firebase Cloud Messaging (FCM)** push notifications. The backend is Supabase (not Firebase).

### 3.1 Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Create a project** (or **Add project**)
3. **Project name**: `Des Moines Insider`
4. When prompted to link to a Google Cloud project, **select the existing `Des Moines Insider` Cloud project** you created in Step 2
   - This ensures shared billing and API access
5. Disable Google Analytics for now (or enable if you want Firebase Analytics)
6. Click **Create project**

### 3.2 Add an Android App to Firebase

1. In the Firebase project dashboard, click **Add app > Android**
2. **Android package name**: `com.desmoines.aipulse`
3. **App nickname**: `Des Moines Insider Android`
4. **Debug signing certificate SHA-1**: Paste the same SHA-1 from Step 2.3.C
5. Click **Register app**

### 3.3 Download google-services.json

1. After registering, click **Download google-services.json**
2. Place it in:
   ```
   android/app/google-services.json
   ```
3. **This file is gitignored** - never commit it. Each developer pulls it from Firebase Console or Infisical.

### 3.4 Add Firebase SDK to the Project

> **Note**: If you haven't added Firebase dependencies yet, add the following:

**A. Root `android/build.gradle.kts`** - Add the Google Services plugin:

```kotlin
plugins {
    // ... existing plugins ...
    id("com.google.gms.google-services") version "4.4.2" apply false
}
```

**B. App `android/app/build.gradle.kts`** - Apply the plugin:

```kotlin
plugins {
    // ... existing plugins ...
    id("com.google.gms.google-services")
}
```

**C. Add FCM dependency** in `android/gradle/libs.versions.toml`:

```toml
[versions]
firebase-bom = "33.7.0"

[libraries]
firebase-bom = { group = "com.google.firebase", name = "firebase-bom", version.ref = "firebase-bom" }
firebase-messaging = { group = "com.google.firebase", name = "firebase-messaging-ktx" }
```

**D. Add to `android/app/build.gradle.kts` dependencies**:

```kotlin
// Firebase (push notifications only)
implementation(platform(libs.firebase.bom))
implementation(libs.firebase.messaging)
```

### 3.5 Generate FCM Service Account Key (for backend)

This key lets Supabase Edge Functions send push notifications:

1. In Firebase Console, go to **Project Settings > Service accounts**
2. Click **Generate new private key**
3. Download the JSON file
4. Store this as the `FCM_SERVICE_ACCOUNT_KEY` Supabase secret:
   ```powershell
   # Minify the JSON and set as a Supabase secret
   $fcmKey = (Get-Content firebase-service-account.json -Raw) -replace "`r`n","" -replace "`n",""
   supabase secrets set FCM_SERVICE_ACCOUNT_KEY="$fcmKey"
   ```
5. Delete the local JSON file after setting the secret

### 3.6 Enable Cloud Messaging in Firebase

1. Go to **Project Settings > Cloud Messaging**
2. Verify that **Firebase Cloud Messaging API (V1)** is enabled
3. If not, click **Enable** (may redirect to Cloud Console)

---

## 4. Android Studio Panda 2 Setup

### 4.1 Download & Install

1. Download **Android Studio Panda 2** (2024.3.x) from [developer.android.com/studio](https://developer.android.com/studio)
2. Run the installer:
   - **Windows**: Run `.exe`, follow wizard
   - **macOS**: Drag to Applications
   - **Linux**: Extract and run `studio.sh`
3. On first launch, complete the **Setup Wizard**:
   - **Install Type**: Choose **Standard**
   - **SDK Components**: Accept defaults (Android SDK, SDK Platform-Tools, Emulator)
   - Accept all license agreements
   - Wait for downloads to complete

### 4.2 Configure SDK & JDK

1. Open Android Studio
2. Go to **Settings/Preferences > Languages & Frameworks > Android SDK** (or **More Actions > SDK Manager** from Welcome screen)
3. **SDK Platforms** tab:
   - Check **Android 15.0 (VanillaIceCream)** - API 35 (our targetSdk)
   - Check **Android 8.0 (Oreo)** - API 26 (our minSdk, for emulator testing)
4. **SDK Tools** tab:
   - Check **Android SDK Build-Tools 35**
   - Check **Android SDK Command-line Tools (latest)**
   - Check **Android SDK Platform-Tools**
   - Check **Android Emulator**
   - Check **Google Play services** (for Credential Manager testing)
5. Click **Apply** and accept licenses

6. **JDK**: Verify JDK 17 is configured:
   - **Settings > Build, Execution, Deployment > Build Tools > Gradle**
   - **Gradle JDK**: Should be **JDK 17** (Android Studio bundles one, or use your own)
   - If it shows a different version, select `jbr-17` (JetBrains Runtime 17) from the dropdown

### 4.3 Note Your SDK Path

You'll need this for `local.properties`:

| OS | Default SDK Path |
|---|---|
| **Windows** | `C:\Users\<username>\AppData\Local\Android\Sdk` |
| **macOS** | `/Users/<username>/Library/Android/sdk` |
| **Linux** | `/home/<username>/Android/Sdk` |

Or find it: **Settings > Languages & Frameworks > Android SDK > Android SDK Location**

### 4.4 Create an Emulator (AVD)

1. Go to **Tools > Device Manager** (or the phone icon on the toolbar)
2. Click **Create Virtual Device**
3. **Select Hardware**: Choose **Pixel 7** (or similar)
4. **System Image**:
   - Click the **x86 Images** tab
   - Download & select **API 35** (VanillaIceCream) with **Google Play**
   - Click **Next**
5. **AVD Name**: `Pixel 7 API 35`
6. Click **Finish**
7. Click the Play button to test-launch the emulator

### 4.5 Open the Project

1. **File > Open** (or **Open** from Welcome screen)
2. Navigate to:
   ```
   C:\Users\dpearson\Documents\Des-Moines-Insider\Des-Moines-Insider\desmoines-ai-pulse\android
   ```
   > **Important**: Open the `android/` directory specifically, NOT the project root
3. Wait for Gradle sync to complete (first sync downloads all dependencies - may take 5-10 minutes)
4. If prompted about Gradle wrapper, click **OK** to use the project's wrapper

### 4.6 Android Studio Panda 2 Recommended Plugins

Go to **Settings > Plugins** and install:

| Plugin | Purpose |
|---|---|
| **Compose Multiplatform IDE Support** | Better Compose preview & tooling |
| **Infisical** | (if available) Secrets integration |
| **.env files support** | Syntax highlighting for env files |

---

## 5. Project Configuration

### 5.1 Project Structure Overview

```
android/
├── app/
│   ├── src/main/
│   │   ├── java/com/desmoines/aipulse/
│   │   │   ├── data/              # Data models, repositories, remote/local
│   │   │   ├── di/                # Hilt dependency injection modules
│   │   │   ├── ui/                # Compose screens, components, theme, navigation
│   │   │   ├── util/              # Utility classes
│   │   │   ├── DesMoinesInsiderApp.kt  # @HiltAndroidApp Application class
│   │   │   └── MainActivity.kt        # Single-activity Compose entry point
│   │   ├── res/                   # Resources (strings, themes, icons)
│   │   └── AndroidManifest.xml    # Permissions & deep links
│   ├── build.gradle.kts           # App-level Gradle config
│   └── proguard-rules.pro         # ProGuard/R8 rules
├── gradle/
│   ├── libs.versions.toml         # Version catalog (all dependencies)
│   └── wrapper/
│       └── gradle-wrapper.properties  # Gradle 8.11.1
├── build.gradle.kts               # Root Gradle config
├── settings.gradle.kts            # Project settings
├── gradle.properties              # JVM & Android build flags
└── local.properties               # SDK path + secrets (gitignored)
```

### 5.2 Key Configuration Files

| File | Purpose |
|---|---|
| `gradle/libs.versions.toml` | Single source of truth for all dependency versions |
| `app/build.gradle.kts` | App config: SDK versions, build types, dependencies |
| `local.properties` | SDK path + Supabase/Google credentials (gitignored) |
| `AndroidManifest.xml` | Permissions, deep links, app class declarations |
| `gradle.properties` | JVM memory (`-Xmx2048m`), AndroidX flags |

### 5.3 Build Variants

| Build Type | Minify | Shrink Resources | Use Case |
|---|---|---|---|
| **debug** | No | No | Local development, emulator testing |
| **release** | Yes (R8) | Yes | Production builds, Play Store |

---

## 6. Infisical Secrets (local.properties)

The `local.properties` file contains your SDK path and API credentials. It is **gitignored** and must be created locally by each developer. Use Infisical to pull credentials consistently.

### 6.1 Install Infisical CLI

```powershell
# Windows - Option A: via Scoop (recommended)
scoop bucket add nicehash https://github.com/nicehash/scoop-bucket
scoop install infisical

# Windows - Option B: via Chocolatey
choco install infisical

# Verify installation
infisical --version
```

> **macOS**: `brew install infisical/get-cli/infisical`
> **Linux**: `curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash && sudo apt-get install infisical`

### 6.2 Authenticate with Infisical

```powershell
# Login (opens browser for auth)
infisical login

# Verify you're logged in
infisical user
```

### 6.3 Initialize Infisical in the Project

If not already initialized:

```powershell
# From the project root (desmoines-ai-pulse/)
infisical init
```

Select your Infisical project and environment (e.g., `dev`).

### 6.4 Pull Secrets and Generate local.properties

**Option A: Automated (recommended)**

Create/use the following script to pull secrets from Infisical and write `local.properties`:

```powershell
# From the project root (desmoines-ai-pulse/)

# Pull secrets from Infisical and parse into a hashtable
$secretsRaw = infisical export --env=dev --format=dotenv
$envVars = @{}
foreach ($line in ($secretsRaw | Select-String "^(SUPABASE_URL|SUPABASE_ANON_KEY|GOOGLE_WEB_CLIENT_ID)=" | ForEach-Object { $_.Line })) {
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
        $envVars[$parts[0]] = $parts[1].Trim('"')
    }
}

# Determine SDK path (escape backslashes for .properties format)
$sdkPath = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "$env:LOCALAPPDATA\Android\Sdk" }
$sdkPathEscaped = $sdkPath -replace '\\', '\\'

# Write local.properties
@"
# Auto-generated from Infisical ($(Get-Date -Format 'yyyy-MM-dd'))
# DO NOT commit this file - it is gitignored

# Android SDK path
sdk.dir=$sdkPathEscaped

# Supabase
SUPABASE_URL=$($envVars['SUPABASE_URL'])
SUPABASE_ANON_KEY=$($envVars['SUPABASE_ANON_KEY'])

# Google OAuth (Web Client ID - used by Credential Manager)
GOOGLE_WEB_CLIENT_ID=$($envVars['GOOGLE_WEB_CLIENT_ID'])
"@ | Set-Content -Path "android\local.properties" -Encoding utf8

Write-Host "local.properties written successfully"
```

**Option B: Using `infisical run`**

If you have the secrets stored with the exact key names:

```powershell
# Preview what will be injected
infisical export --env=dev --format=dotenv

# Use infisical run to inject env vars into any command
infisical run --env=dev -- .\gradlew assembleDebug
```

**Option C: Manual**

Pull individual values and write `local.properties` by hand:

```powershell
# View available secrets
infisical export --env=dev --format=dotenv

# Then manually create android\local.properties (see template below):
```

```properties
# android/local.properties
# DO NOT commit this file

# Android SDK path (update to match your system)
sdk.dir=C\:\\Users\\dpearson\\AppData\\Local\\Android\\Sdk

# Supabase credentials
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Google OAuth Web Client ID (from Cloud Console)
GOOGLE_WEB_CLIENT_ID=XXXXXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.apps.googleusercontent.com
```

### 6.5 Expected Infisical Secret Keys

Make sure these keys exist in your Infisical project (create them if they don't):

| Infisical Key | Description | Example |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase public anon key | `eyJhbGci...` |
| `GOOGLE_WEB_CLIENT_ID` | OAuth Web Client ID | `12345...apps.googleusercontent.com` |
| `ANDROID_KEYSTORE_PASSWORD` | Release keystore password | (production only) |
| `ANDROID_KEY_ALIAS` | Release key alias | `des-moines-insider` |
| `ANDROID_KEY_PASSWORD` | Release key password | (production only) |

### 6.6 How local.properties Flows into the Build

The `app/build.gradle.kts` reads `local.properties` and injects values as `BuildConfig` fields:

```
local.properties
  └─> build.gradle.kts loads Properties()
       └─> buildConfigField("String", "SUPABASE_URL", ...)
            └─> BuildConfig.SUPABASE_URL available in Kotlin code
```

Access in Kotlin:
```kotlin
val supabaseUrl = BuildConfig.SUPABASE_URL
val supabaseKey = BuildConfig.SUPABASE_ANON_KEY
val googleClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID
```

---

## 7. Build & Run

### 7.1 First Build (Gradle Sync)

1. Open the `android/` project in Android Studio
2. Wait for Gradle sync (status bar at bottom shows progress)
3. If sync fails:
   - **File > Invalidate Caches and Restart**
   - Ensure JDK 17 is selected in Gradle settings
   - Ensure `local.properties` has the correct `sdk.dir`

### 7.2 Run on Emulator

1. Select your AVD from the device dropdown (top toolbar)
2. Click the green **Run** button (or `Shift+F10`)
3. Wait for build + install + launch
4. The app should open to the main screen

### 7.3 Run on Physical Device

1. **Enable Developer Options** on your Android phone:
   - Settings > About Phone > Tap **Build Number** 7 times
2. **Enable USB Debugging**:
   - Settings > Developer Options > USB Debugging > On
3. Connect via USB
4. Accept the debugging prompt on the phone
5. Select the device from the dropdown and click **Run**

### 7.4 Build Debug APK (command line)

```powershell
Set-Location android

# Debug build
.\gradlew assembleDebug

# Output: android\app\build\outputs\apk\debug\app-debug.apk
```

### 7.5 Build Release AAB (for Play Store)

```powershell
Set-Location android

# Release bundle (requires signing config - see Section 9)
.\gradlew bundleRelease

# Output: android\app\build\outputs\bundle\release\app-release.aab
```

### 7.6 Run with Infisical (inject secrets at build time)

```powershell
Set-Location android

# Build with Infisical-injected environment variables
infisical run --env=dev -- .\gradlew assembleDebug
```

---

## 8. Google Play Console Setup

### 8.1 Create the App Listing

1. Go to [Google Play Console](https://play.google.com/console/)
2. Click **Create app**
3. Fill in:
   - **App name**: `Des Moines Insider`
   - **Default language**: English (United States)
   - **App or game**: App
   - **Free or paid**: Free
4. Accept declarations and click **Create app**

### 8.2 Complete the Store Listing

Navigate through the left sidebar and complete:

| Section | Required Fields |
|---|---|
| **Main store listing** | App name, short description (80 chars), full description (4000 chars) |
| **Graphics** | App icon (512x512), feature graphic (1024x500), screenshots (min 2 per device type) |
| **App category** | Category: Travel & Local |
| **Contact details** | Email, phone (optional), website |

### 8.3 Content Rating

1. Go to **Policy > App content > Content rating**
2. Click **Start questionnaire**
3. Select **Utility, Productivity, Communication, or other**
4. Answer honestly (no violence, no user-generated content that's unmoderated, etc.)
5. Submit

### 8.4 Target Audience & Content

1. **Target audience**: 18+ (or appropriate)
2. **Ads**: If your app shows ads, declare it here

### 8.5 Set Up Internal Testing Track

Before a production release, test via Internal Testing:

1. Go to **Testing > Internal testing**
2. Click **Create new release**
3. Upload your signed `.aab` file
4. Add release notes
5. Click **Review release > Start rollout**
6. Add testers by email under **Testers** tab

### 8.6 Create a Service Account (for CI/CD uploads)

1. Go to **Settings > API access**
2. Click **Create new service account**
3. Follow the link to Google Cloud Console
4. **Create Service Account**:
   - Name: `play-console-publisher`
   - Role: **Service Account User**
5. **Create Key**: JSON format, download it
6. Back in Play Console, click **Done** then **Grant access**
7. Set permissions: **Release manager** (or Admin)
8. Store the JSON as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` in Infisical and/or GitHub Secrets

---

## 9. Release Signing (Keystore)

### 9.1 Generate a Release Keystore

**Only do this once** - losing the keystore means you can never update your app.

```powershell
# Run from the android/ folder
keytool -genkeypair `
  -v `
  -storetype PKCS12 `
  -keystore des-moines-insider.keystore `
  -alias des-moines-insider `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -dname "CN=Des Moines Insider, O=Des Moines Insider LLC, L=Des Moines, ST=Iowa, C=US"
```

You'll be prompted for a keystore password and key password. **Save these securely in Infisical.**

### 9.2 Store Keystore Securely

```powershell
# Base64 encode the keystore for storage in CI secrets
[Convert]::ToBase64String([IO.File]::ReadAllBytes("des-moines-insider.keystore")) |
  Out-File -FilePath "keystore-base64.txt" -NoNewline -Encoding ascii

# Store in Infisical (or GitHub Secrets):
# Key: ANDROID_KEYSTORE_BASE64  Value: (contents of keystore-base64.txt)
# Key: ANDROID_KEYSTORE_PASSWORD  Value: (your keystore password)
# Key: ANDROID_KEY_ALIAS  Value: des-moines-insider
# Key: ANDROID_KEY_PASSWORD  Value: (your key password - same as keystore password for PKCS12)
```

### 9.3 Add Signing Config to build.gradle.kts

Add this to `android/app/build.gradle.kts` inside the `android {}` block (before `buildTypes`):

```kotlin
signingConfigs {
    create("release") {
        val keystoreFile = rootProject.file("keystore/des-moines-insider.keystore")
        if (keystoreFile.exists()) {
            storeFile = keystoreFile
            storePassword = localProperties.getProperty("KEYSTORE_PASSWORD", "")
            keyAlias = localProperties.getProperty("KEY_ALIAS", "des-moines-insider")
            keyPassword = localProperties.getProperty("KEY_PASSWORD", "")
        }
    }
}

buildTypes {
    release {
        isMinifyEnabled = true
        isShrinkResources = true
        signingConfig = signingConfigs.getByName("release")
        proguardFiles(
            getDefaultProguardFile("proguard-android-optimize.txt"),
            "proguard-rules.pro"
        )
    }
}
```

### 9.4 Get Release SHA-1 (for Google Cloud Console)

```powershell
keytool -list -v -keystore des-moines-insider.keystore -alias des-moines-insider | Select-String "SHA1:"
```

Add this SHA-1 to your Android OAuth client in Google Cloud Console (Step 2.3.D).

---

## 10. CI/CD (GitHub Actions)

### 10.1 Required GitHub Secrets

Add these in **GitHub Repo > Settings > Secrets and variables > Actions**:

| Secret Name | Source |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | `des-moines-insider` |
| `ANDROID_KEY_PASSWORD` | Key password |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Play Console service account JSON |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `GOOGLE_WEB_CLIENT_ID` | OAuth Web Client ID |

### 10.2 Workflow File

Create `.github/workflows/android-release.yml`:

```yaml
name: Android Release

on:
  push:
    branches: [main]
    paths: ['android/**']
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: android

    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Write local.properties
        run: |
          cat > local.properties << EOF
          sdk.dir=$ANDROID_SDK_ROOT
          SUPABASE_URL=${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}
          GOOGLE_WEB_CLIENT_ID=${{ secrets.GOOGLE_WEB_CLIENT_ID }}
          EOF

      - name: Decode keystore
        run: |
          mkdir -p keystore
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > keystore/des-moines-insider.keystore

      - name: Build Release AAB
        run: ./gradlew bundleRelease
        env:
          KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}

      - name: Upload AAB artifact
        uses: actions/upload-artifact@v4
        with:
          name: app-release
          path: android/app/build/outputs/bundle/release/app-release.aab

      - name: Upload to Google Play (Internal Testing)
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}
          packageName: com.desmoines.aipulse
          releaseFiles: android/app/build/outputs/bundle/release/app-release.aab
          track: internal
          status: completed
```

---

## 11. Troubleshooting

### Gradle Sync Fails

| Error | Fix |
|---|---|
| `SDK location not found` | Verify `sdk.dir` in `local.properties` matches your SDK path |
| `Could not resolve com.android.tools.build:gradle` | Check internet, run **File > Invalidate Caches** |
| `Unsupported class file major version 65` | Switch Gradle JDK to 17 in Settings |
| `Plugin not found: com.google.gms.google-services` | Add google-services plugin to root `build.gradle.kts` |

### Build Errors

| Error | Fix |
|---|---|
| `SUPABASE_URL is empty` | Verify `local.properties` has `SUPABASE_URL=...` (no quotes) |
| `google-services.json not found` | Download from Firebase Console, place in `android/app/` |
| `Duplicate class` | Run `.\gradlew clean` then rebuild |
| `Minification failed` | Check ProGuard rules, add `-keep` for Supabase/Ktor classes |

### Runtime Errors

| Error | Fix |
|---|---|
| Google Sign-In returns `CANCELED` | Verify SHA-1 fingerprint in Cloud Console matches your keystore |
| `NetworkError` on API calls | Check `INTERNET` permission in AndroidManifest, verify Supabase URL |
| Deep link not handled | Verify intent filter in AndroidManifest matches callback scheme |
| Push notifications not received | Verify `google-services.json` is correct, FCM API is enabled |

### Infisical Issues

| Error | Fix |
|---|---|
| `infisical: command not found` | Reinstall CLI (see Section 6.1) |
| `Failed to fetch secrets` | Run `infisical login` to re-authenticate |
| `Project not found` | Run `infisical init` in project root |
| Wrong environment | Use `--env=dev` or `--env=prod` flag explicitly |

### Emulator Issues

| Error | Fix |
|---|---|
| Emulator won't start | Enable VT-x/AMD-V in BIOS, check Hyper-V settings on Windows |
| `INSTALL_FAILED_INSUFFICIENT_STORAGE` | Wipe emulator data in Device Manager |
| Google Play Services outdated | Use a system image with Google Play, update via emulator Play Store |

---

## Quick Reference Cheat Sheet

```powershell
# Pull secrets from Infisical
infisical export --env=dev --format=dotenv

# Build debug APK
Set-Location android; .\gradlew assembleDebug

# Build release AAB
Set-Location android; .\gradlew bundleRelease

# Run tests
Set-Location android; .\gradlew test

# Clean build
Set-Location android; .\gradlew clean

# Get debug SHA-1
keytool -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android | Select-String "SHA1:"

# Check installed SDK versions
& "$env:LOCALAPPDATA\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" --list

# Lint check
Set-Location android; .\gradlew lint
```

---

## Related Documentation

- [MOBILE_BUILD_BEST_PRACTICES.md](../docs/mobile/MOBILE_BUILD_BEST_PRACTICES.md) - CI/CD signing and deployment checklist
- [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Web app environment variables
- [CLAUDE.md](./CLAUDE.md) - Overall project guide
- [scripts/ralph/CLAUDE-android.md](./scripts/ralph/CLAUDE-android.md) - Ralph agent Android instructions

---

**Last Updated**: 2026-03-31
