import SwiftUI

/// Premium design tokens shared across iOS and Android.
/// Keep values in sync with
/// android/app/src/main/java/com/desmoines/aipulse/ui/theme/Dimens.kt (PremiumTokens).
///
/// Provides a single source of truth for elevation, corner radii, gradients,
/// and motion durations so both platforms render identically.
enum PremiumTokens {
    // MARK: - Elevation (shadow radius in pt)

    static let elevation0: CGFloat = 0
    static let elevation1: CGFloat = 1
    static let elevation2: CGFloat = 2
    static let elevation4: CGFloat = 4
    static let elevation8: CGFloat = 8
    static let elevation16: CGFloat = 16

    // MARK: - Corner Radii

    static let cornerSm: CGFloat = 8
    static let cornerMd: CGFloat = 12
    static let cornerLg: CGFloat = 20
    static let cornerXl: CGFloat = 28

    // MARK: - Motion (seconds)

    static let motionFast: Double = 0.15
    static let motionBase: Double = 0.28
    static let motionSlow: Double = 0.45
    static let motionHero: Double = 0.6

    // MARK: - Signature springs
    //
    // Use across interactive elements so the app feels consistently "alive".

    /// Snappy spring for small UI state changes (toggles, chips, icons).
    static let springSnappy: Animation = .interactiveSpring(response: 0.32, dampingFraction: 0.78, blendDuration: 0.18)

    /// Balanced spring for cards, sheets, and tab indicators.
    static let springSmooth: Animation = .spring(response: 0.42, dampingFraction: 0.82, blendDuration: 0.2)

    /// Bouncy spring for celebratory moments (favorite added, subscription upgrade).
    static let springBouncy: Animation = .spring(response: 0.45, dampingFraction: 0.62, blendDuration: 0.25)

    // MARK: - Spacing scale (pt)
    //
    // Keep in sync with Android Dimens.Spacing.

    static let space2: CGFloat = 2
    static let space4: CGFloat = 4
    static let space8: CGFloat = 8
    static let space12: CGFloat = 12
    static let space16: CGFloat = 16
    static let space20: CGFloat = 20
    static let space24: CGFloat = 24
    static let space32: CGFloat = 32
    static let space40: CGFloat = 40
    static let space48: CGFloat = 48

    // MARK: - Gradients

    /// Premium gold gradient for VIP / paid-tier accents.
    /// Must match Android PremiumTokens.PremiumGoldGradient.
    static let premiumGoldColors: [Color] = [
        Color(red: 0xF6 / 255.0, green: 0xD3 / 255.0, blue: 0x65 / 255.0),
        Color(red: 0xE9 / 255.0, green: 0xB9 / 255.0, blue: 0x49 / 255.0),
        Color(red: 0xB8 / 255.0, green: 0x86 / 255.0, blue: 0x0B / 255.0)
    ]

    static let premiumGoldGradient = LinearGradient(
        colors: premiumGoldColors,
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Signature brand gradient for hero / CTA surfaces.
    static let brandGradient = LinearGradient(
        colors: [
            Color(red: 0x7C / 255.0, green: 0x3A / 255.0, blue: 0xED / 255.0),
            Color(red: 0x25 / 255.0, green: 0x63 / 255.0, blue: 0xEB / 255.0)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    // MARK: - Shadow

    static let shadowKey = Color.black.opacity(0.15)
    static let shadowAmbient = Color.black.opacity(0.06)

    // MARK: - Glassmorphism
    //
    // Border + highlight colors used by the Glass modifier family.
    // Values tuned so glass surfaces read as light panels in light mode
    // and frosted dark panels in dark/OLED mode.

    static let glassBorderLight = Color.white.opacity(0.45)
    static let glassBorderDark = Color.white.opacity(0.10)
    static let glassHighlightLight = Color.white.opacity(0.55)
    static let glassHighlightDark = Color.white.opacity(0.08)
    static let glassInnerShadow = Color.black.opacity(0.04)
    static let glassTintLight = Color.white.opacity(0.35)
    static let glassTintDark = Color.black.opacity(0.28)

    // MARK: - Accent gradients (surface-safe)

    /// Warm sunrise used on hero headers when a category is not supplied.
    static let heroWarmGradient = LinearGradient(
        colors: [
            Color(red: 0xFF / 255.0, green: 0x7E / 255.0, blue: 0x5F / 255.0),
            Color(red: 0xFE / 255.0, green: 0xB4 / 255.0, blue: 0x7A / 255.0)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Cool night gradient for premium / nightlife surfaces.
    static let heroCoolGradient = LinearGradient(
        colors: [
            Color(red: 0x1E / 255.0, green: 0x1B / 255.0, blue: 0x4B / 255.0),
            Color(red: 0x3B / 255.0, green: 0x2F / 255.0, blue: 0x82 / 255.0),
            Color(red: 0x25 / 255.0, green: 0x63 / 255.0, blue: 0xEB / 255.0)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Subtle scrim used on top of images to improve text legibility.
    static let imageScrim = LinearGradient(
        colors: [
            Color.black.opacity(0.0),
            Color.black.opacity(0.35),
            Color.black.opacity(0.7)
        ],
        startPoint: .top,
        endPoint: .bottom
    )

    // MARK: - OLED palette (mirrors Android OledColorScheme)

    /// True-black background used when user selects the OLED theme.
    static let oledBackground = Color(red: 0, green: 0, blue: 0)
    static let oledSurface1 = Color(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0A / 255)
    static let oledSurface2 = Color(red: 0x14 / 255, green: 0x14 / 255, blue: 0x14 / 255)
    static let oledSurface3 = Color(red: 0x1C / 255, green: 0x1C / 255, blue: 0x1C / 255)
    static let oledOutline = Color(red: 0x2A / 255, green: 0x2A / 255, blue: 0x2A / 255)
    static let oledOnSurface = Color(red: 0xED / 255, green: 0xED / 255, blue: 0xED / 255)
    static let oledOnSurfaceVariant = Color(red: 0xBD / 255, green: 0xBD / 255, blue: 0xBD / 255)
}

/// User-selectable theme mode. Persisted in secure storage and read on launch.
/// Mirrors Android `ThemeMode` in ui/theme/Theme.kt.
enum ThemeMode: String, CaseIterable, Identifiable {
    case system
    case light
    case dark
    case oled

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        case .oled: return "OLED (true black)"
        }
    }

    /// Maps to a SwiftUI ColorScheme for `.preferredColorScheme`.
    /// Returns nil when .system so SwiftUI follows the system setting.
    var preferredColorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark, .oled: return .dark
        }
    }
}

// MARK: - OLED background modifier

extension View {
    /// Replaces the default background with a true-black OLED background
    /// when the given theme mode is `.oled`. Use on root screens.
    @ViewBuilder
    func oledBackgroundIfNeeded(_ mode: ThemeMode) -> some View {
        if mode == .oled {
            self.background(PremiumTokens.oledBackground.ignoresSafeArea())
        } else {
            self
        }
    }
}

// MARK: - Convenience Modifiers

extension View {
    /// Applies a layered premium shadow matching the Android PremiumShadow modifier.
    func premiumShadow(elevation: CGFloat = PremiumTokens.elevation4) -> some View {
        self
            .shadow(
                color: PremiumTokens.shadowAmbient,
                radius: elevation,
                x: 0,
                y: elevation / 2
            )
            .shadow(
                color: PremiumTokens.shadowKey,
                radius: elevation / 2,
                x: 0,
                y: 1
            )
    }
}
