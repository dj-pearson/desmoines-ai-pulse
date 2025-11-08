# Quick Start Guide - Mobile App

## 🚀 Get Your App Running in Minutes

### For iOS (macOS only)

```bash
# 1. Install dependencies
npm install

# 2. Build and sync
npm run build

# 3. Open in Xcode
npm run open:ios

# 4. In Xcode:
#    - Select your Team in Signing & Capabilities
#    - Change Bundle Identifier if needed
#    - Click Run (▶️)
```

### For Android

```bash
# 1. Install dependencies
npm install

# 2. Build and sync
npm run build

# 3. Open in Android Studio
npm run open:android

# 4. In Android Studio:
#    - Click Run (▶️) or build APK
```

## 📝 Before App Store Submission

1. **Add your app icon:**
   - Place `icon.png` (1024x1024) in `resources/`
   - Run: `npx @capacitor/assets generate`

2. **Update app ID:**
   - Edit `capacitor.config.json`
   - Change `appId` from `com.desmoines.aipulse` to your own

3. **Configure signing:**
   - iOS: Set Team in Xcode
   - Android: Generate keystore and configure in `android/app/build.gradle`

## 🆘 Troubleshooting

**White screen on launch?**
```bash
npm run build
```

**Need to update the app?**
```bash
# 1. Edit code in parent directory (../src, etc.)
# 2. Rebuild
npm run build
```

## 📚 Full Documentation

For complete build instructions, troubleshooting, and app store submission:
- Read: `README.md`
- See: `resources/README.md` for icons/splash screens

---

**Need help? Check README.md for comprehensive guides!**
