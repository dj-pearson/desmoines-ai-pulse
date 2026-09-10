import SwiftUI
import UIKit

// MARK: - App typography system
//
// Named text styles tuned for the app's hierarchy. Every style:
//
// - Scales with Dynamic Type, off the UIKit text style whose curve matches its
//   role, so "Larger Accessibility Sizes" actually enlarges the app
// - Applies a consistent weight + leading
// - Clamps at its own ceiling so a hero number can't push the layout apart
//
// The scaling is computed rather than declared. `Font.system(size:weight:)` is a
// FIXED point size - it ignores the user's text-size setting entirely - and for
// as long as this file used it, every one of these styles rendered at the same
// points at every Dynamic Type setting while the comment above claimed
// otherwise. `.dynamicTypeSize(...)` did not save it either: that clamps the
// environment for descendants, and a fixed font has nothing to clamp.
//
// Kept in parity with Android ui/theme/AppTypography.kt.

enum AppTextStyle {
    case displayLg       // Hero numbers, splash titles
    case displayMd       // Section hero titles
    case headline        // Primary page heading
    case title           // Card titles / dialog titles
    case subtitle        // Supporting title, secondary heading
    case body            // Primary body copy
    case bodyEmphasized  // Body with a heavier weight
    case bodySmall       // Detail / secondary body copy
    case caption         // Meta captions, timestamps
    case label           // All-caps labels / badge text
}

extension AppTextStyle {
    struct Spec {
        /// Point size at the default Dynamic Type setting (.large).
        let size: CGFloat
        let weight: Font.Weight
        /// The UIKit text style supplying the scaling curve. Headings grow more
        /// slowly than body copy, which is why this isn't one style for all ten.
        let metric: UIFont.TextStyle
        /// Ceiling past which this style stops growing.
        let maxTypeSize: DynamicTypeSize
        var tracking: CGFloat = 0
        var uppercased: Bool = false
    }

    var spec: Spec {
        switch self {
        case .displayLg:
            return Spec(size: 44, weight: .heavy, metric: .largeTitle,
                        maxTypeSize: .accessibility3, tracking: -0.5)
        case .displayMd:
            return Spec(size: 34, weight: .heavy, metric: .largeTitle,
                        maxTypeSize: .accessibility3, tracking: -0.3)
        case .headline:
            return Spec(size: 26, weight: .bold, metric: .title1,
                        maxTypeSize: .accessibility4)
        case .title:
            return Spec(size: 20, weight: .semibold, metric: .title3,
                        maxTypeSize: .accessibility5)
        case .subtitle:
            return Spec(size: 17, weight: .semibold, metric: .headline,
                        maxTypeSize: .accessibility5)
        case .body:
            return Spec(size: 16, weight: .regular, metric: .body,
                        maxTypeSize: .accessibility5)
        case .bodyEmphasized:
            return Spec(size: 16, weight: .semibold, metric: .body,
                        maxTypeSize: .accessibility5)
        case .bodySmall:
            return Spec(size: 14, weight: .regular, metric: .subheadline,
                        maxTypeSize: .accessibility5)
        case .caption:
            return Spec(size: 12, weight: .medium, metric: .caption1,
                        maxTypeSize: .accessibility5)
        case .label:
            return Spec(size: 11, weight: .bold, metric: .caption2,
                        maxTypeSize: .accessibility5, tracking: 0.8, uppercased: true)
        }
    }

    /// The point size this style renders at for `typeSize`, clamped at the
    /// style's own ceiling.
    func pointSize(for typeSize: DynamicTypeSize) -> CGFloat {
        let spec = spec
        let capped = min(typeSize, spec.maxTypeSize)
        return UIFontMetrics(forTextStyle: spec.metric).scaledValue(
            for: spec.size,
            compatibleWith: UITraitCollection(preferredContentSizeCategory: capped.contentSizeCategory)
        )
    }
}

extension DynamicTypeSize {
    /// UIKit equivalent, needed because `UIFontMetrics` works in content size
    /// categories and SwiftUI hands us a `DynamicTypeSize`.
    var contentSizeCategory: UIContentSizeCategory {
        switch self {
        case .xSmall: return .extraSmall
        case .small: return .small
        case .medium: return .medium
        case .large: return .large
        case .xLarge: return .extraLarge
        case .xxLarge: return .extraExtraLarge
        case .xxxLarge: return .extraExtraExtraLarge
        case .accessibility1: return .accessibilityMedium
        case .accessibility2: return .accessibilityLarge
        case .accessibility3: return .accessibilityExtraLarge
        case .accessibility4: return .accessibilityExtraExtraLarge
        case .accessibility5: return .accessibilityExtraExtraExtraLarge
        @unknown default: return .large
        }
    }
}

extension View {
    func appText(_ style: AppTextStyle) -> some View {
        modifier(AppTextStyleModifier(style: style))
    }
}

private struct AppTextStyleModifier: ViewModifier {
    let style: AppTextStyle

    @Environment(\.dynamicTypeSize) private var typeSize

    func body(content: Content) -> some View {
        let spec = style.spec
        return content
            .font(.system(size: style.pointSize(for: typeSize), weight: spec.weight))
            .tracking(spec.tracking)
            .textCase(spec.uppercased ? Text.Case.uppercase : nil)
            // Descendants that set their own font stay inside this style's
            // ceiling too; the font above is already clamped by pointSize().
            .dynamicTypeSize(...spec.maxTypeSize)
    }
}
