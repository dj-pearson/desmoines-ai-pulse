import SwiftUI

// MARK: - Glass surface modifier family
//
// Shared primitives for the app's glassmorphism language. Every glass surface
// is a three-layer sandwich:
//   1. A `Material` providing the frosted backdrop blur
//   2. A tint overlay that adapts to color scheme (subtle in light, deeper in dark)
//   3. A hairline stroke + top highlight that gives the panel a lit glass edge
//
// Paired with `premiumShadow` the result reads as a floating, cutting-edge
// surface without the performance cost of full-screen blur layers.

extension View {
    /// Frosted card surface intended for content cards (events, restaurants, attractions).
    func glassCard(
        cornerRadius: CGFloat = PremiumTokens.cornerLg,
        material: Material = .regularMaterial,
        elevation: CGFloat = PremiumTokens.elevation4
    ) -> some View {
        modifier(GlassSurfaceModifier(
            cornerRadius: cornerRadius,
            material: material,
            elevation: elevation,
            intensity: .card
        ))
    }

    /// Lighter pill/chip surface for filters, toggles, badges.
    func glassChip(
        cornerRadius: CGFloat = 999,
        material: Material = .ultraThinMaterial
    ) -> some View {
        modifier(GlassSurfaceModifier(
            cornerRadius: cornerRadius,
            material: material,
            elevation: PremiumTokens.elevation1,
            intensity: .chip
        ))
    }

    /// Prominent translucent surface for floating bars (tab bar, scroll-to-top, map controls).
    func glassBar(
        cornerRadius: CGFloat = PremiumTokens.cornerXl,
        material: Material = .ultraThinMaterial,
        elevation: CGFloat = PremiumTokens.elevation8
    ) -> some View {
        modifier(GlassSurfaceModifier(
            cornerRadius: cornerRadius,
            material: material,
            elevation: elevation,
            intensity: .bar
        ))
    }

    /// Overlay used on top of imagery (hero headers, card image tiles) so text stays legible.
    func glassOverlay(
        cornerRadius: CGFloat = PremiumTokens.cornerMd,
        material: Material = .ultraThinMaterial
    ) -> some View {
        modifier(GlassSurfaceModifier(
            cornerRadius: cornerRadius,
            material: material,
            elevation: PremiumTokens.elevation0,
            intensity: .overlay
        ))
    }

    /// Paints a subtle animated gradient sheen across the receiver (used on VIP / premium surfaces).
    func glassSheen(active: Bool = true) -> some View {
        modifier(GlassSheenModifier(active: active))
    }
}

// MARK: - Implementation

private enum GlassIntensity {
    case card
    case chip
    case bar
    case overlay

    func tint(for scheme: ColorScheme) -> Color {
        switch (self, scheme) {
        case (.card, .light): return PremiumTokens.glassTintLight.opacity(0.85)
        case (.card, .dark): return PremiumTokens.glassTintDark.opacity(0.85)
        case (.chip, .light): return Color.white.opacity(0.45)
        case (.chip, .dark): return Color.white.opacity(0.06)
        case (.bar, .light): return Color.white.opacity(0.55)
        case (.bar, .dark): return Color.black.opacity(0.35)
        case (.overlay, _): return Color.clear
        @unknown default: return Color.clear
        }
    }

    func borderGradient(for scheme: ColorScheme) -> LinearGradient {
        let top = scheme == .dark ? PremiumTokens.glassBorderDark : PremiumTokens.glassBorderLight
        let bottom = scheme == .dark
            ? Color.white.opacity(0.02)
            : Color.white.opacity(0.18)
        return LinearGradient(
            colors: [top, bottom],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    var borderWidth: CGFloat {
        switch self {
        case .card, .bar: return 1
        case .chip, .overlay: return 0.75
        }
    }
}

private struct GlassSurfaceModifier: ViewModifier {
    let cornerRadius: CGFloat
    let material: Material
    let elevation: CGFloat
    let intensity: GlassIntensity

    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)

        return content
            .background {
                ZStack {
                    shape.fill(material)
                    shape.fill(intensity.tint(for: scheme))
                }
            }
            .overlay {
                shape.strokeBorder(
                    intensity.borderGradient(for: scheme),
                    lineWidth: intensity.borderWidth
                )
            }
            .clipShape(shape)
            .if(elevation > 0) { view in
                view
                    .shadow(
                        color: PremiumTokens.shadowKey.opacity(scheme == .dark ? 0.5 : 0.35),
                        radius: elevation,
                        x: 0,
                        y: elevation / 2
                    )
                    .shadow(
                        color: PremiumTokens.shadowAmbient,
                        radius: elevation / 2,
                        x: 0,
                        y: 1
                    )
            }
    }
}

// MARK: - Sheen (animated highlight)

private struct GlassSheenModifier: ViewModifier {
    let active: Bool

    @State private var phase: CGFloat = -1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.overlay {
            GeometryReader { proxy in
                let width = proxy.size.width
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.0),
                        Color.white.opacity(0.25),
                        Color.white.opacity(0.0)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: width * 0.4)
                .offset(x: phase * width * 1.4)
                .blendMode(.plusLighter)
                .allowsHitTesting(false)
            }
            .mask(Rectangle())
        }
        .onAppear {
            guard active, !reduceMotion else { return }
            withAnimation(.linear(duration: 2.8).repeatForever(autoreverses: false)) {
                phase = 1
            }
        }
    }
}

// MARK: - Pressable interactive scale
//
// Gives any tappable surface a consistent physical response — scales down
// subtly on press, lifts back with a spring. Works on top of Buttons,
// cards, chips, and navigation links.

extension View {
    func pressable(scale: CGFloat = 0.97) -> some View {
        modifier(PressableScaleModifier(minScale: scale))
    }
}

private struct PressableScaleModifier: ViewModifier {
    let minScale: CGFloat

    @State private var isPressed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPressed && !reduceMotion ? minScale : 1.0)
            .animation(PremiumTokens.springSnappy, value: isPressed)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        if !isPressed { isPressed = true }
                    }
                    .onEnded { _ in
                        isPressed = false
                    }
            )
    }
}
