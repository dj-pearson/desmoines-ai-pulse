import SwiftUI

// MARK: - Theme crossfade container
//
// SwiftUI does not animate `ColorScheme` changes out of the box — flipping
// `.preferredColorScheme` causes an instant swap. This container snapshots
// the outgoing scheme and crossfades to the incoming one using a short
// spring so theme switching in Settings feels deliberate rather than jarring.
//
// Usage:
//
//   @AppStorage("themeMode") private var themeMode = ThemeMode.system
//
//   ThemeCrossfadeContainer(mode: themeMode) {
//       MainTabView()
//   }
//
// Respects reduce-motion by skipping the crossfade entirely.

struct ThemeCrossfadeContainer<Content: View>: View {
    let mode: ThemeMode
    @ViewBuilder var content: () -> Content

    @State private var displayedMode: ThemeMode
    @State private var opacity: Double = 1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(mode: ThemeMode, @ViewBuilder content: @escaping () -> Content) {
        self.mode = mode
        self._displayedMode = State(initialValue: mode)
        self.content = content
    }

    var body: some View {
        content()
            .preferredColorScheme(displayedMode.preferredColorScheme)
            .oledBackgroundIfNeeded(displayedMode)
            .opacity(opacity)
            .onChange(of: mode) { _, newValue in
                guard newValue != displayedMode else { return }
                guard !reduceMotion else {
                    displayedMode = newValue
                    return
                }
                // Fade out, swap scheme, fade back in.
                withAnimation(.easeOut(duration: PremiumTokens.motionBase / 2)) {
                    opacity = 0
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + PremiumTokens.motionBase / 2) {
                    displayedMode = newValue
                    withAnimation(.easeIn(duration: PremiumTokens.motionBase / 2)) {
                        opacity = 1
                    }
                }
            }
    }
}
