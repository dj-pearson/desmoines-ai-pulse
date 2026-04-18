import SwiftUI

// MARK: - Brand button styles
//
// Opinionated SwiftUI ButtonStyle variants that wrap the shared Glass
// vocabulary so every CTA in the app feels consistent. All styles:
//
// - Respect Dynamic Type (padding/font scale with the user's text size)
// - Provide a gentle pressed-state scale (via .pressable) with reduceMotion fallback
// - Support a loading overlay via the `.loading(_:)` modifier on any button
// - Match iOS human-interface guidelines for 44pt minimum hit target
//
// Usage:
//   Button("Upgrade", action: upgrade)
//     .buttonStyle(.brandPrimary)
//
//   Button(role: .destructive, action: deleteAccount) { Text("Delete account") }
//     .buttonStyle(.brandDestructive)

public enum BrandButtonSize {
    case compact, regular, large

    var font: Font {
        switch self {
        case .compact: return .subheadline.weight(.semibold)
        case .regular: return .body.weight(.semibold)
        case .large: return .title3.weight(.semibold)
        }
    }

    var verticalPadding: CGFloat {
        switch self {
        case .compact: return 8
        case .regular: return 12
        case .large: return 16
        }
    }

    var horizontalPadding: CGFloat {
        switch self {
        case .compact: return 16
        case .regular: return 22
        case .large: return 28
        }
    }

    var minHeight: CGFloat {
        switch self {
        case .compact: return 36
        case .regular: return 44
        case .large: return 52
        }
    }
}

// MARK: - Primary (brand gradient + glass bar)

struct BrandPrimaryButtonStyle: ButtonStyle {
    var size: BrandButtonSize = .regular

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(size.font)
            .foregroundStyle(.white)
            .padding(.horizontal, size.horizontalPadding)
            .padding(.vertical, size.verticalPadding)
            .frame(minHeight: size.minHeight)
            .frame(maxWidth: .infinity)
            .background {
                PremiumTokens.brandGradient
            }
            .glassBar(cornerRadius: PremiumTokens.cornerLg, material: .ultraThinMaterial, elevation: PremiumTokens.elevation8)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(PremiumTokens.springSnappy, value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

// MARK: - Secondary (glass chip with accent border)

struct BrandSecondaryButtonStyle: ButtonStyle {
    var size: BrandButtonSize = .regular

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(size.font)
            .foregroundStyle(Color.accentColor)
            .padding(.horizontal, size.horizontalPadding)
            .padding(.vertical, size.verticalPadding)
            .frame(minHeight: size.minHeight)
            .frame(maxWidth: .infinity)
            .background(Color.accentColor.opacity(0.08))
            .glassChip(cornerRadius: PremiumTokens.cornerLg, material: .thinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: PremiumTokens.cornerLg, style: .continuous)
                    .strokeBorder(Color.accentColor.opacity(0.45), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(PremiumTokens.springSnappy, value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

// MARK: - Ghost (text only with accent tint)

struct BrandGhostButtonStyle: ButtonStyle {
    var size: BrandButtonSize = .regular

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(size.font)
            .foregroundStyle(Color.accentColor)
            .padding(.horizontal, size.horizontalPadding)
            .padding(.vertical, size.verticalPadding)
            .frame(minHeight: size.minHeight)
            .opacity(configuration.isPressed ? 0.7 : 1)
            .animation(PremiumTokens.springSnappy, value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

// MARK: - Destructive (red glass bar)

struct BrandDestructiveButtonStyle: ButtonStyle {
    var size: BrandButtonSize = .regular

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(size.font)
            .foregroundStyle(.white)
            .padding(.horizontal, size.horizontalPadding)
            .padding(.vertical, size.verticalPadding)
            .frame(minHeight: size.minHeight)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(
                    colors: [Color(red: 0.95, green: 0.27, blue: 0.27), Color(red: 0.80, green: 0.18, blue: 0.18)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .glassBar(cornerRadius: PremiumTokens.cornerLg, material: .ultraThinMaterial, elevation: PremiumTokens.elevation4)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(PremiumTokens.springSnappy, value: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

// MARK: - Convenience extension so callers write `.brandPrimary`

extension ButtonStyle where Self == BrandPrimaryButtonStyle {
    static var brandPrimary: BrandPrimaryButtonStyle { BrandPrimaryButtonStyle() }
    static func brandPrimary(size: BrandButtonSize) -> BrandPrimaryButtonStyle { BrandPrimaryButtonStyle(size: size) }
}

extension ButtonStyle where Self == BrandSecondaryButtonStyle {
    static var brandSecondary: BrandSecondaryButtonStyle { BrandSecondaryButtonStyle() }
    static func brandSecondary(size: BrandButtonSize) -> BrandSecondaryButtonStyle { BrandSecondaryButtonStyle(size: size) }
}

extension ButtonStyle where Self == BrandGhostButtonStyle {
    static var brandGhost: BrandGhostButtonStyle { BrandGhostButtonStyle() }
    static func brandGhost(size: BrandButtonSize) -> BrandGhostButtonStyle { BrandGhostButtonStyle(size: size) }
}

extension ButtonStyle where Self == BrandDestructiveButtonStyle {
    static var brandDestructive: BrandDestructiveButtonStyle { BrandDestructiveButtonStyle() }
    static func brandDestructive(size: BrandButtonSize) -> BrandDestructiveButtonStyle { BrandDestructiveButtonStyle(size: size) }
}

// MARK: - Loading state

extension View {
    /// Overlays a spinner inside a button (or any view) and dims its label
    /// while a long-running action is in flight. Disables the underlying button.
    @ViewBuilder
    func brandLoading(_ isLoading: Bool) -> some View {
        if isLoading {
            self
                .opacity(0.4)
                .overlay {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                }
                .disabled(true)
                .accessibilityLabel("Loading")
        } else {
            self
        }
    }
}

// MARK: - Glass TextField style

struct GlassTextFieldStyle: TextFieldStyle {
    @FocusState private var isFocused: Bool
    @Environment(\.colorScheme) private var scheme

    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(.body)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background {
                RoundedRectangle(cornerRadius: PremiumTokens.cornerMd, style: .continuous)
                    .fill(.thinMaterial)
                RoundedRectangle(cornerRadius: PremiumTokens.cornerMd, style: .continuous)
                    .fill(scheme == .dark ? Color.white.opacity(0.04) : Color.white.opacity(0.3))
            }
            .overlay(
                RoundedRectangle(cornerRadius: PremiumTokens.cornerMd, style: .continuous)
                    .strokeBorder(
                        isFocused
                            ? Color.accentColor.opacity(0.85)
                            : Color.primary.opacity(0.1),
                        lineWidth: isFocused ? 1.5 : 0.75
                    )
            )
            .clipShape(RoundedRectangle(cornerRadius: PremiumTokens.cornerMd, style: .continuous))
            .shadow(
                color: isFocused ? Color.accentColor.opacity(0.18) : .clear,
                radius: isFocused ? 8 : 0,
                x: 0,
                y: 2
            )
            .animation(PremiumTokens.springSnappy, value: isFocused)
            .focused($isFocused)
    }
}

extension TextFieldStyle where Self == GlassTextFieldStyle {
    static var glassInput: GlassTextFieldStyle { GlassTextFieldStyle() }
}
