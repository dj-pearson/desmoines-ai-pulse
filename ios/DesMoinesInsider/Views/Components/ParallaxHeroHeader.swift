import SwiftUI

/// Hero header with parallax scrolling and bottom scrim, matching Android
/// `ParallaxHeroHeader.kt`.
///
/// Place at the top of a scroll view. The header translates at 0.5x the
/// scroll offset to create a parallax effect. When the user scrolls up (pulls
/// down), the header stretches to fill the extra space.
///
/// Usage:
/// ```swift
/// ScrollView {
///     ParallaxHeroHeader(height: 300) {
///         AsyncImage(url: event.imageURL) { $0.resizable().scaledToFill() }
///     }
///     // ...rest of content
/// }
/// ```
struct ParallaxHeroHeader<Content: View>: View {
    var height: CGFloat = 300
    var parallaxFactor: CGFloat = 0.5
    @ViewBuilder var content: () -> Content

    var body: some View {
        GeometryReader { proxy in
            let minY = proxy.frame(in: .global).minY
            // When pulled down (minY > 0) the hero stretches.
            // When scrolled up (minY < 0) the hero translates at parallax rate.
            let offset = minY > 0 ? -minY : -minY * (1 - parallaxFactor)
            let stretchedHeight = minY > 0 ? height + minY : height

            ZStack(alignment: .bottom) {
                content()
                    .frame(width: proxy.size.width, height: stretchedHeight)
                    .clipped()

                // Bottom scrim for title legibility
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color.clear,
                        Color.black.opacity(0.55)
                    ]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: stretchedHeight)
                .allowsHitTesting(false)
            }
            .offset(y: offset)
        }
        .frame(height: height)
    }
}

/// Returns a 0..1 progress value indicating how far the hero has scrolled out
/// of view based on the given scroll offset. Use to fade in a nav bar title.
func heroScrollProgress(scrollOffset: CGFloat, heroHeight: CGFloat) -> CGFloat {
    guard heroHeight > 0 else { return 0 }
    let raw = -scrollOffset / (heroHeight * 0.6)
    return min(max(raw, 0), 1)
}

#Preview {
    ScrollView {
        VStack(spacing: 0) {
            ParallaxHeroHeader(height: 300) {
                Rectangle()
                    .fill(LinearGradient(
                        colors: [.purple, .blue],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
            }
            ForEach(0..<20) { i in
                Text("Detail row \(i)")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
        }
    }
    .ignoresSafeArea(edges: .top)
}
