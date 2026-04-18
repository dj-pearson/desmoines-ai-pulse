import SwiftUI

// MARK: - Heart burst micro-interaction
//
// A short, celebratory animation for "favorite" moments. When triggered:
//
//   1. The main heart scales 1 -> 1.35 -> 1.0 with a spring
//   2. Six small particle hearts radiate outward, fading as they go
//
// Designed to sit on top of an existing favorite button — pass the button
// view as content and toggle `burst` to animate. Respects reduce-motion:
// when enabled, the scale and particles are disabled and only the icon
// swaps colour.
//
// Usage:
//   @State private var burst = false
//   HeartBurstView(isFavorited: isFav, burst: $burst) {
//       Image(systemName: isFav ? "heart.fill" : "heart")
//   }
//   .onTapGesture {
//       isFav.toggle()
//       if isFav { burst.toggle() }
//   }

struct HeartBurstView<Content: View>: View {
    let isFavorited: Bool
    @Binding var burst: Bool

    @ViewBuilder var content: () -> Content

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var scale: CGFloat = 1
    @State private var particleProgress: CGFloat = 0

    var body: some View {
        ZStack {
            // Particles behind the main icon
            if !reduceMotion {
                ForEach(0..<6, id: \.self) { index in
                    particle(at: index)
                }
            }

            content()
                .scaleEffect(scale)
        }
        .onChange(of: burst) { _, _ in
            guard !reduceMotion else { return }
            animateBurst()
        }
        .accessibilityLabel(isFavorited ? "Saved to favorites" : "Not saved")
    }

    private func particle(at index: Int) -> some View {
        let angle = Double(index) * (360.0 / 6.0) * .pi / 180.0
        let distance: CGFloat = 28 * particleProgress
        let offsetX = CGFloat(cos(angle)) * distance
        let offsetY = CGFloat(sin(angle)) * distance

        return Image(systemName: "heart.fill")
            .font(.system(size: 8))
            .foregroundStyle(Color.red.opacity(Double(1 - particleProgress)))
            .scaleEffect(1 - particleProgress * 0.4)
            .offset(x: offsetX, y: offsetY)
            .allowsHitTesting(false)
    }

    private func animateBurst() {
        // Haptic pulse — keep in parity with iOS native expectations.
        HapticFeedback.shared.light()

        // Main icon scale pop
        withAnimation(.spring(response: 0.28, dampingFraction: 0.55)) {
            scale = 1.35
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                scale = 1.0
            }
        }

        // Particle radiate
        particleProgress = 0
        withAnimation(.easeOut(duration: 0.55)) {
            particleProgress = 1
        }
    }
}

// MARK: - Convenience modifier
//
// Attach to any heart/favorite icon and call `burst.toggle()` after a successful
// favorite. The burst state will animate the particles + scale exactly once.

extension View {
    func heartBurst(isFavorited: Bool, burst: Binding<Bool>) -> some View {
        HeartBurstView(isFavorited: isFavorited, burst: burst) { self }
    }
}
