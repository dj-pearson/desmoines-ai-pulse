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
                    Image(systemName: "arrow.up")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Color.accentColor, in: Circle())
                        .shadow(color: .black.opacity(0.2), radius: 6, x: 0, y: 3)
                }
                .accessibilityLabel("Scroll to top")
                .padding(16)
                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(reduceMotion ? nil : .spring(duration: 0.3), value: isVisible)
    }
}

/// A view modifier that tracks vertical scroll offset via a coordinate space.
/// Sets the binding to true when the user scrolls past the threshold.
struct ScrollOffsetTracker: ViewModifier {
    @Binding var showScrollToTop: Bool
    var threshold: CGFloat = 500

    func body(content: Content) -> some View {
        content
            .background(
                GeometryReader { geo in
                    Color.clear
                        .preference(
                            key: ScrollOffsetKey.self,
                            value: -geo.frame(in: .named("scroll")).origin.y
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
    /// Tracks scroll offset and sets binding when past threshold.
    func trackScrollOffset(showScrollToTop: Binding<Bool>, threshold: CGFloat = 500) -> some View {
        modifier(ScrollOffsetTracker(showScrollToTop: showScrollToTop, threshold: threshold))
    }
}
