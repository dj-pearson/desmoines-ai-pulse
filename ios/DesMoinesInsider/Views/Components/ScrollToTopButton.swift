import SwiftUI

/// Floating scroll-to-top button that appears after scrolling down.
///
/// Usage: Place as an overlay on a ScrollView wrapped in a ScrollViewReader.
///
///     ScrollViewReader { proxy in
///         ScrollView {
///             Color.clear.frame(height: 0).id("top")
///             // ... content
///         }
///         .overlay(alignment: .bottomTrailing) {
///             ScrollToTopButton(isVisible: showButton) {
///                 withAnimation { proxy.scrollTo("top") }
///             }
///         }
///     }
struct ScrollToTopButton: View {
    let isVisible: Bool
    let action: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if isVisible {
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    action()
                } label: {
                    ZStack {
                        Circle().fill(Color.accentColor.opacity(0.85))
                        Image(systemName: "arrow.up")
                            .font(.body.weight(.bold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 48, height: 48)
                    .glassBar(cornerRadius: 24, material: .ultraThinMaterial, elevation: PremiumTokens.elevation8)
                }
                .buttonStyle(PressableCardStyle(scale: 0.9))
                .accessibilityLabel("Scroll to top")
                .padding(20)
                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(reduceMotion ? nil : .spring(duration: 0.3), value: isVisible)
    }
}

/// A view modifier that tracks vertical scroll offset via a coordinate space.
/// Sets the binding to true when the user scrolls past the threshold.
///
/// IMPORTANT: the enclosing `ScrollView` MUST declare the matching coordinate
/// space, or the offset never crosses the threshold and the button never
/// appears. Use `.scrollOffsetCoordinateSpace()` on the ScrollView so the name
/// can't drift from a hand-typed string (IOS-AUDIT-UX-034).
struct ScrollOffsetTracker: ViewModifier {
    @Binding var showScrollToTop: Bool
    var threshold: CGFloat = 500

    /// Single source of truth for the coordinate-space name shared by the
    /// tracker and `scrollOffsetCoordinateSpace()`.
    static let coordinateSpaceName = "scroll"

    func body(content: Content) -> some View {
        content
            .background(
                GeometryReader { geo in
                    Color.clear
                        .preference(
                            key: ScrollOffsetKey.self,
                            value: -geo.frame(in: .named(ScrollOffsetTracker.coordinateSpaceName)).origin.y
                        )
                }
            )
            .onPreferenceChange(ScrollOffsetKey.self) { offset in
                let shouldShow = offset > threshold
                if shouldShow != showScrollToTop {
                    showScrollToTop = shouldShow
                }
            }
    }
}

private struct ScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

extension View {
    /// Tracks scroll offset and sets binding when past threshold. Requires the
    /// enclosing ScrollView to apply `.scrollOffsetCoordinateSpace()`.
    func trackScrollOffset(showScrollToTop: Binding<Bool>, threshold: CGFloat = 500) -> some View {
        modifier(ScrollOffsetTracker(showScrollToTop: showScrollToTop, threshold: threshold))
    }

    /// Establishes the coordinate space `trackScrollOffset` measures against.
    /// Apply this to the ScrollView itself (not its content). Using this helper
    /// instead of a hand-typed `.coordinateSpace(name: "scroll")` keeps the name
    /// in sync with the tracker (IOS-AUDIT-UX-034).
    func scrollOffsetCoordinateSpace() -> some View {
        coordinateSpace(name: ScrollOffsetTracker.coordinateSpaceName)
    }
}
