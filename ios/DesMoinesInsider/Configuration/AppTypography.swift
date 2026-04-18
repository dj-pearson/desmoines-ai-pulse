import SwiftUI

// MARK: - App typography system
//
// Named text styles tuned for the app's hierarchy. Every style:
//
// - Scales with Dynamic Type (relativeTo:) so "Larger Accessibility Sizes" work
// - Applies a consistent weight + leading
// - Clamps at .accessibility5 to avoid catastrophic layout breakage
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

extension View {
    func appText(_ style: AppTextStyle) -> some View {
        modifier(AppTextStyleModifier(style: style))
    }
}

private struct AppTextStyleModifier: ViewModifier {
    let style: AppTextStyle

    func body(content: Content) -> some View {
        switch style {
        case .displayLg:
            content
                .font(.system(size: 44, weight: .heavy, design: .default))
                .tracking(-0.5)
                .dynamicTypeSize(...DynamicTypeSize.accessibility3)
        case .displayMd:
            content
                .font(.system(size: 34, weight: .heavy, design: .default))
                .tracking(-0.3)
                .dynamicTypeSize(...DynamicTypeSize.accessibility3)
        case .headline:
            content
                .font(.system(size: 26, weight: .bold, design: .default))
                .dynamicTypeSize(...DynamicTypeSize.accessibility4)
        case .title:
            content
                .font(.system(size: 20, weight: .semibold, design: .default))
                .dynamicTypeSize(...DynamicTypeSize.accessibility5)
        case .subtitle:
            content
                .font(.system(size: 17, weight: .semibold, design: .default))
                .dynamicTypeSize(...DynamicTypeSize.accessibility5)
        case .body:
            content
                .font(.system(size: 16, weight: .regular, design: .default))
                .dynamicTypeSize(...DynamicTypeSize.accessibility5)
        case .bodyEmphasized:
            content
                .font(.system(size: 16, weight: .semibold, design: .default))
                .dynamicTypeSize(...DynamicTypeSize.accessibility5)
        case .bodySmall:
            content
                .font(.system(size: 14, weight: .regular, design: .default))
                .dynamicTypeSize(...DynamicTypeSize.accessibility5)
        case .caption:
            content
                .font(.system(size: 12, weight: .medium, design: .default))
                .dynamicTypeSize(...DynamicTypeSize.accessibility5)
        case .label:
            content
                .font(.system(size: 11, weight: .bold, design: .default))
                .tracking(0.8)
                .textCase(.uppercase)
                .dynamicTypeSize(...DynamicTypeSize.accessibility5)
        }
    }
}
