import SwiftUI

/// Card-stack swipe deck. Renders the top 3 cards from `items` and exposes
/// callbacks for each commit direction. The parent ViewModel is the source
/// of truth for which item is on top — this view only owns the transient
/// drag offset for the in-flight gesture.
struct SwipeCardStack: View {
    let items: [SwipeItem]
    var onLike: (SwipeItem) -> Void
    var onSkip: (SwipeItem) -> Void
    var onBoost: (SwipeItem) -> Void
    var onTap: (SwipeItem) -> Void

    @State private var dragOffset: CGSize = .zero
    @State private var isDismissing = false

    /// Up to 3 cards; deeper cards aren't rendered to keep the layer count low.
    private var visibleItems: ArraySlice<SwipeItem> {
        items.prefix(3)
    }

    /// Vertical room reserved below cards for the behind-card stack peek.
    private static let backCardPeekRoom: CGFloat = 32

    /// Card aspect ratio (width / height).
    private static let cardAspectRatio: CGFloat = 0.7

    /// Shrink the card so rotation overshoot stays inside the deck area.
    private static let rotationSafetyScale: CGFloat = 0.86

    /// Horizontal padding applied by deckArea (20pt each side = 40pt total).
    /// We subtract this from screen width so the card size is known before
    /// the first layout pass — the same approach every other card in the app
    /// uses (hardcoded dimensions rather than a GeometryReader inside a VStack).
    private static let deckHorizontalPadding: CGFloat = 40

    /// Card width derived from screen width, matching the pattern used by all
    /// other card components in the app.
    private var cardWidth: CGFloat {
        let screenWidth = UIScreen.main.bounds.width
        let availableW = screenWidth - Self.deckHorizontalPadding
        return availableW * Self.rotationSafetyScale
    }

    private var cardHeight: CGFloat {
        cardWidth / Self.cardAspectRatio
    }

    var body: some View {
        ZStack {
            ForEach(Array(visibleItems.enumerated()), id: \.element.id) { index, item in
                SwipeCard(
                    item: item,
                    dragOffset: index == 0 ? dragOffset : .zero,
                    isTopCard: index == 0
                )
                .frame(width: cardWidth, height: cardHeight)
                .scaleEffect(scale(for: index))
                .offset(y: stackYOffset(for: index))
                .offset(index == 0 ? dragOffset : .zero)
                .rotationEffect(index == 0 ? .degrees(rotationDegrees) : .zero)
                .zIndex(Double(visibleItems.count - index))
                .animation(.interactiveSpring(response: 0.32, dampingFraction: 0.78), value: dragOffset)
                .gesture(dragGesture(for: item), including: index == 0 ? .gesture : .none)
                .onTapGesture { if index == 0 { onTap(item) } }
                .allowsHitTesting(index == 0 && !isDismissing)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Stack geometry

    private func scale(for index: Int) -> CGFloat {
        // Top card unscaled; behind cards 4% smaller per layer.
        max(0.88, 1.0 - CGFloat(index) * 0.04)
    }

    private func stackYOffset(for index: Int) -> CGFloat {
        // Behind cards peek out below the front card.
        CGFloat(index) * 14
    }

    private var rotationDegrees: Double {
        // 1 degree per 18pt of horizontal drag, capped at ±18°.
        let raw = Double(dragOffset.width) / 18
        return max(-18, min(18, raw))
    }

    // MARK: - Gesture

    private func dragGesture(for item: SwipeItem) -> some Gesture {
        DragGesture()
            .onChanged { value in
                guard !isDismissing else { return }
                dragOffset = value.translation
            }
            .onEnded { value in
                guard !isDismissing else { return }
                let h = value.translation.width
                let v = value.translation.height
                let velocity = value.predictedEndTranslation

                // Up-swipe wins over horizontal when it's clearly upward
                // and the vertical magnitude beats the horizontal one.
                let isVertical = abs(v) > abs(h) && v < 0
                let upCommitted = isVertical &&
                    (-v > SwipeCard.commitThreshold || -velocity.height > 320)
                let rightCommitted = !isVertical &&
                    (h > SwipeCard.commitThreshold || velocity.width > 320)
                let leftCommitted = !isVertical &&
                    (-h > SwipeCard.commitThreshold || -velocity.width > 320)

                if upCommitted {
                    commit(item: item, direction: .up, action: onBoost)
                } else if rightCommitted {
                    commit(item: item, direction: .right, action: onLike)
                } else if leftCommitted {
                    commit(item: item, direction: .left, action: onSkip)
                } else {
                    // Spring back.
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                        dragOffset = .zero
                    }
                }
            }
    }

    private enum CommitDirection { case left, right, up }

    private func commit(item: SwipeItem, direction: CommitDirection, action: @escaping (SwipeItem) -> Void) {
        isDismissing = true
        let target: CGSize
        switch direction {
        case .left: target = CGSize(width: -700, height: dragOffset.height)
        case .right: target = CGSize(width: 700, height: dragOffset.height)
        case .up: target = CGSize(width: dragOffset.width, height: -900)
        }

        switch direction {
        case .left, .right: HapticFeedback.shared.medium()
        case .up: HapticFeedback.shared.premiumUnlock()
        }

        withAnimation(.easeOut(duration: 0.28)) {
            dragOffset = target
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) {
            action(item)
            dragOffset = .zero
            isDismissing = false
        }
    }

    // MARK: - Programmatic commits

    /// Triggers a left-swipe dismiss as if the user tapped the Skip button.
    func programmaticSkip() { triggerProgrammatic(.left) }
    func programmaticLike() { triggerProgrammatic(.right) }
    func programmaticBoost() { triggerProgrammatic(.up) }

    private func triggerProgrammatic(_ direction: CommitDirection) {
        guard let item = items.first else { return }
        let action: (SwipeItem) -> Void
        switch direction {
        case .left: action = onSkip
        case .right: action = onLike
        case .up: action = onBoost
        }
        commit(item: item, direction: direction, action: action)
    }
}
