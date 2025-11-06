# App Icons and Splash Screens

## Required Assets

To complete your mobile app setup, you need to add the following assets to this directory:

### App Icon
- **File:** `icon.png`
- **Size:** 1024x1024px
- **Format:** PNG with transparency
- **Description:** This will be used to generate all required icon sizes for iOS and Android

### Splash Screen
- **File:** `splash.png`
- **Size:** 2732x2732px
- **Format:** PNG
- **Description:** This will be used to generate splash screens for all devices

## How to Generate Icons

Once you've added your `icon.png` and `splash.png` files:

1. Install the Capacitor assets generator:
   ```bash
   npm install -g @capacitor/assets
   ```

2. Run the generator:
   ```bash
   npx @capacitor/assets generate
   ```

This will automatically create all required icon and splash screen sizes for both iOS and Android.

## Manual Icon Setup (Alternative)

If you prefer to manually configure icons:

### iOS Icons
Place icons in: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

Required sizes:
- 20x20, 29x29, 40x40, 58x58, 60x60, 76x76, 80x80, 87x87, 120x120, 152x152, 167x167, 180x180, 1024x1024

### Android Icons
Place icons in: `android/app/src/main/res/`

Required folders:
- mipmap-mdpi (48x48)
- mipmap-hdpi (72x72)
- mipmap-xhdpi (96x96)
- mipmap-xxhdpi (144x144)
- mipmap-xxxhdpi (192x192)

## Splash Screen Configuration

The splash screen is configured in `capacitor.config.json` under the `SplashScreen` plugin.

Current settings:
- Launch duration: 2000ms
- Background color: #000000 (black)
- No spinner

You can customize these in the main `capacitor.config.json` file.
