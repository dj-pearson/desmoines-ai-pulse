# Des Moines AI Pulse - Mobile App

This is the **native mobile build** for the Des Moines AI Pulse application, using **Capacitor** to wrap the web app into native iOS and Android apps.

## 🎯 Why This Folder Exists

This separate mobile build was created to:
- ✅ Avoid TypeScript compilation issues that caused crashes in Expo builds
- ✅ Use pure JavaScript configuration (avoiding TS build errors)
- ✅ Generate native iOS (.ipa) and Android (.apk/.aab) builds
- ✅ Keep the mobile build completely separate from the main web app
- ✅ Allow direct submission to Apple App Store and Google Play Store

## 📁 Project Structure

```
mobile-app/
├── android/          # Native Android project (Gradle/Kotlin)
├── ios/             # Native iOS project (Xcode/Swift)
├── www/             # Built web assets (copied from ../dist)
├── resources/       # App icons and splash screens
├── node_modules/    # Capacitor dependencies
├── capacitor.config.json  # Capacitor configuration
└── package.json     # Mobile app build scripts
```

## 🚀 Quick Start

### Prerequisites

**For iOS builds:**
- macOS computer (required for Xcode)
- Xcode 14+ installed
- CocoaPods installed (`sudo gem install cocoapods`)
- Apple Developer Account ($99/year)

**For Android builds:**
- Android Studio installed
- Java JDK 17+ installed
- Android SDK installed

### Initial Setup

1. **Install dependencies:**
   ```bash
   cd mobile-app
   npm install
   ```

2. **Build the web app and sync:**
   ```bash
   npm run build
   ```
   This will:
   - Build the main web app from the parent directory
   - Copy the built files to `www/`
   - Sync changes to iOS and Android projects

## 📱 Building for iOS

### Open in Xcode

```bash
npm run open:ios
```

This opens the iOS project in Xcode.

### Build Steps in Xcode

1. **Select your Team:**
   - In Xcode, go to: Signing & Capabilities
   - Select your Apple Developer Team

2. **Update Bundle Identifier:**
   - Change from `com.desmoines.aipulse` to your unique ID
   - Example: `com.yourcompany.desmoinesaipulse`

3. **Configure Signing:**
   - Ensure "Automatically manage signing" is checked
   - Select your provisioning profile

4. **Connect Device or Simulator:**
   - Select iPhone device or simulator from the top toolbar

5. **Build and Run:**
   - Click the Play button (▶️) to build and run
   - Or: Product → Archive (for App Store submission)

### Testing on Physical Device

1. Connect your iPhone via USB
2. Trust the computer on your iPhone
3. In Xcode, select your device from the device menu
4. Click Run

### Submitting to App Store

1. **Archive the app:**
   - Product → Archive in Xcode
   - Wait for build to complete

2. **Validate the archive:**
   - Click "Validate App"
   - Fix any issues reported

3. **Upload to App Store Connect:**
   - Click "Distribute App"
   - Select "App Store Connect"
   - Follow the prompts

4. **Create App Store listing:**
   - Go to [App Store Connect](https://appstoreconnect.apple.com)
   - Create a new app
   - Upload screenshots, description, etc.
   - Submit for review

## 🤖 Building for Android

### Open in Android Studio

```bash
npm run open:android
```

This opens the Android project in Android Studio.

### Build Steps in Android Studio

1. **Update Package Name:**
   - In `android/app/build.gradle`, change:
     ```gradle
     applicationId "com.desmoines.aipulse"
     ```
   - To your unique package name

2. **Generate Signing Key:**
   ```bash
   keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```
   - Save the keystore file securely
   - Remember the passwords!

3. **Configure Signing in build.gradle:**
   ```gradle
   android {
       ...
       signingConfigs {
           release {
               storeFile file("my-release-key.keystore")
               storePassword "your-store-password"
               keyAlias "my-key-alias"
               keyPassword "your-key-password"
           }
       }
       buildTypes {
           release {
               signingConfig signingConfigs.release
               ...
           }
       }
   }
   ```

4. **Build Release APK:**
   - In Android Studio: Build → Build Bundle(s) / APK(s) → Build APK(s)
   - Or via command line:
     ```bash
     cd android
     ./gradlew assembleRelease
     ```

5. **Build App Bundle (for Play Store):**
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   - Find the .aab file in: `android/app/build/outputs/bundle/release/`

### Testing on Physical Device

1. Enable Developer Mode on Android device
2. Enable USB Debugging
3. Connect via USB
4. In Android Studio, select your device
5. Click Run

### Submitting to Google Play Store

1. **Create Play Store listing:**
   - Go to [Google Play Console](https://play.google.com/console)
   - Create a new app

2. **Upload AAB file:**
   - Navigate to Release → Production
   - Create new release
   - Upload the `.aab` file from `android/app/build/outputs/bundle/release/`

3. **Complete Store Listing:**
   - Add screenshots, description, icon
   - Set content rating
   - Set pricing & distribution

4. **Submit for Review:**
   - Review and submit
   - Wait for Google's review (usually 1-3 days)

## 🔧 Development Workflow

### Making Changes to the App

1. **Edit code in the parent directory:**
   ```bash
   cd ..
   # Edit your React components, styles, etc.
   ```

2. **Rebuild and sync:**
   ```bash
   cd mobile-app
   npm run build
   ```

3. **Open and test in iOS/Android:**
   ```bash
   npm run open:ios
   # or
   npm run open:android
   ```

### Live Reload (Development)

For faster development with live reload:

1. **Start the web dev server:**
   ```bash
   cd ..
   npm run dev
   ```

2. **Update capacitor.config.json:**
   ```json
   {
     "server": {
       "url": "http://192.168.1.XXX:5173",
       "cleartext": true
     }
   }
   ```
   Replace `192.168.1.XXX` with your computer's IP address

3. **Sync and run:**
   ```bash
   npm run sync
   npm run open:ios
   ```

4. **Don't forget to remove the server config before production build!**

## 📦 Available NPM Scripts

```bash
npm run dev              # Copy web assets and sync (development)
npm run build           # Full build: web app → copy → sync
npm run build:web       # Build only the parent web app
npm run copy:web        # Copy ../dist to www/
npm run sync            # Sync www/ to both iOS and Android
npm run sync:ios        # Sync only to iOS
npm run sync:android    # Sync only to Android
npm run open:ios        # Open iOS project in Xcode
npm run open:android    # Open Android project in Android Studio
npm run add:ios         # Add iOS platform (already done)
npm run add:android     # Add Android platform (already done)
npm run update          # Update Capacitor dependencies
```

## 🎨 Customizing App Icon & Splash Screen

See [resources/README.md](./resources/README.md) for detailed instructions on:
- Creating app icons
- Creating splash screens
- Using automated tools to generate all required sizes

## 🔐 App Configuration

Key settings in `capacitor.config.json`:

```json
{
  "appId": "com.desmoines.aipulse",        // Change this!
  "appName": "Des Moines AI Pulse",        // App display name
  "webDir": "www",                         // Built web assets
  "bundledWebRuntime": false,
  "server": {
    "androidScheme": "https",
    "iosScheme": "https"
  }
}
```

**Important:** Change `appId` to your own unique identifier before publishing!

## 🐛 Common Issues & Solutions

### iOS Build Issues

**Problem:** "No profiles for 'com.desmoines.aipulse' were found"
- **Solution:** Change the bundle identifier in Xcode to one that matches your Apple Developer account

**Problem:** "CocoaPods not installed"
- **Solution:** Install with `sudo gem install cocoapods`, then run `cd ios/App && pod install`

**Problem:** "Unable to boot simulator"
- **Solution:** Open Xcode → Preferences → Locations → Command Line Tools (select Xcode version)

### Android Build Issues

**Problem:** "SDK location not found"
- **Solution:** Create `android/local.properties`:
  ```
  sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
  ```

**Problem:** "Gradle build failed"
- **Solution:** Update Gradle wrapper:
  ```bash
  cd android
  ./gradlew wrapper --gradle-version 8.0
  ```

**Problem:** "Keystore was tampered with, or password was incorrect"
- **Solution:** Double-check keystore passwords in build.gradle

### General Issues

**Problem:** "White screen on launch"
- **Solution:**
  1. Check that `www/` folder has the built files
  2. Run `npm run build` again
  3. Check browser console in device inspector

**Problem:** "App crashes immediately"
- **Solution:**
  1. Check native logs in Xcode or Android Studio
  2. Ensure all Capacitor plugins are synced
  3. Try `npm run sync` again

## 📱 Testing Checklist

Before submitting to app stores:

- [ ] App opens without crashing
- [ ] All navigation works
- [ ] Forms submit correctly
- [ ] Images load properly
- [ ] Dark mode works (if applicable)
- [ ] Landscape and portrait orientations work
- [ ] Deep links work (if applicable)
- [ ] Push notifications work (if implemented)
- [ ] App works offline (if applicable)
- [ ] No console errors in device inspector
- [ ] Privacy policy linked
- [ ] Terms of service linked
- [ ] App icon displays correctly
- [ ] Splash screen displays correctly

## 🔄 Updating the App

When you need to release an update:

1. **Update version numbers:**
   - iOS: Update in Xcode (General → Identity → Version)
   - Android: Update in `android/app/build.gradle`:
     ```gradle
     versionCode 2
     versionName "1.1.0"
     ```

2. **Rebuild:**
   ```bash
   npm run build
   ```

3. **Test thoroughly**

4. **Submit update following the same process as initial submission**

## 📚 Additional Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [iOS App Store Submission Guide](https://developer.apple.com/app-store/submissions/)
- [Google Play Store Submission Guide](https://support.google.com/googleplay/android-developer/answer/9859152)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy](https://play.google.com/about/developer-content-policy/)

## 💡 Pro Tips

1. **Test on real devices:** Simulators/emulators don't catch all issues
2. **Keep keystores safe:** Losing your Android keystore means you can't update your app!
3. **Use TestFlight/Internal Testing:** Test with beta users before public release
4. **Monitor crash reports:** Use App Store Connect and Google Play Console
5. **Keep dependencies updated:** Run `npm run update` periodically
6. **Read rejection feedback carefully:** App store reviewers provide helpful feedback

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review [Capacitor Docs](https://capacitorjs.com/docs)
3. Check platform-specific documentation (iOS/Android)
4. Search for the error on Stack Overflow
5. Open an issue in the project repository

---

**Good luck with your app store submissions! 🚀**
