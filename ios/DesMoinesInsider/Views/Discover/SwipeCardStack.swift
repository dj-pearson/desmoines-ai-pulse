import SwiftUI

/// Card-stack swipe deck. Renders the top 3 cards from `items` and exposes
/// callbacks for each commit direction. The parent ViewModel is the source
/// of truth for which item is on top — this view only owns the transient
/// drag offset for the in-flight gesture.
///
/// `containerWidth` and `containerHeight` must be supplied by the parent via
/// a `GeometryReader` measured *after* any padding is applied. Passing the
/// already-constrained size avoids the race where a background GeometryReader
/// could read the full unpadded screen width before padding resolves, which
/// caused cards to render wider than the viewport.
struct SwipeCardStack: View {
    let items: [SwipeItem]
    /// Available width of the deck area, measured after padding by the parent.
    let containerWidth: CGFloat
    /// Available height of the deck area, measured after padding by the parent.
    let containerHeight: CGFloat
    var onLike: (SwipeItem) -> Void
    var onSkip: (SwipeItem) -> Void
    var onBoost: (SwipeItem) -> Void
    var onTap: (SwipeItem) -> Void
    /// Rewinds the last swipe (IOS-DD-DISCOVER-07). Exposed as a VoiceOver
    /// action on the top card; nil hides nothing, the action just does nothing.
    var onUndo: (() -> Void)? = nil
    /// Set by the parent's action-bar buttons to drive the same animated fly-off
    /// as a gesture swipe (IOS-AUDIT-UX-018). Reset to nil once consumed.
    @Binding var command: Command?

    /// A button-driven swipe, mapped to the matching commit direction.
    /// A one-shot instruction from the action bar, carrying an identity token.
    ///
    /// IOS-AUDIT-BUG-010 AC1. This was a bare enum, so two taps of the same
    /// button produced the SAME value and onChange had nothing to observe. It was
    /// papered over by writing `command = nil` after handling, which works only if
    /// the nil is observed before the next tap - and SwiftUI coalesces state
    /// changes within an update cycle, so a fast double tap could go .skip -> .skip
    /// with the nil never seen, and the second tap was swallowed.
    ///
    /// The token makes every issue distinct, so no two commands can ever compare
    /// equal and the clear-to-nil is belt-and-braces rather than load-bearing.
    struct Command: Equatable {
        enum Action: Equatable { case skip, like, boost }

        let action: Action
        private let token = UUID()

        static func skip() -> Command { Command(action: .skip) }
        static func like() -> Command { Command(action: .like) }
        static func boost() -> Command { Command(action: .boost) }
    }

    @State private var dragOffset: CGSize = .zero
    @State private var isDismissing = false
    /// The direction a release would commit to right now. Crossing into one
    /// fires a selection tick, so the user feels the threshold before letting
    /// go (IOS-DD-DISCOVER-11).
    @State private var armedDirection: CommitDirection?
    /// Moves VoiceOver to the new top card after a commit, instead of leaving
    /// focus on a card that has flown off.
    @AccessibilityFocusState private var focusedCardId: String?

    // Reduce Motion (IOS-COMPLY-003): drop the card rotation and the springy
    // overshoot for users who opt out of motion. The drag itself is direct
    // manipulation (not suppressed); only the decorative tilt/spring is.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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

    private var cardWidth: CGFloat {
        guard containerWidth > 0 else { return 0 }
        return containerWidth * Self.rotationSafetyScale
    }

    private var cardHeight: CGFloat {
        guard containerHeight > 0 else { return 0 }
        let availableH = max(0, containerHeight - Self.backCardPeekRoom)
        let fromHeight = availableH * Self.cardAspectRatio
        // Use whichever axis is the binding constraint.
        let computed = (min(cardWidth, fromHeight * Self.rotationSafetyScale)) / Self.cardAspectRatio
        // Never exceed the measured deck area: on wide/short layouts (landscape,
        // iPad, large Dynamic Type) cardWidth can win the min() and make the card
        // taller than its container, which the parent .clipped() would cut off
        // (IOS-AUDIT-UX-030).
        return min(computed, availableH)
    }

    var body: some View {
        ZStack {
            ForEach(Array(visibleItems.enumerated()), id: \.element.id) { index, item in
                accessibleCard(positionedCard(item, index: index), item: item, index: index)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // Drive button taps through the same animated commit path as a swipe.
        .onChange(of: command) { _, newValue in
            guard let newValue else { return }
            switch newValue.action {
            case .skip: programmaticSkip()
            case .like: programmaticLike()
            case .boost: programmaticBoost()
            }
            command = nil
        }
    }

    // MARK: - Card

    /// The card, sized, stacked and draggable. Split from the accessibility
    /// modifiers below to keep each expression small for the type checker.
    private func positionedCard(_ item: SwipeItem, index: Int) -> some View {
        SwipeCard(
            item: item,
            dragOffset: index == 0 ? dragOffset : .zero,
            isTopCard: index == 0
        )
        .frame(width: cardWidth, height: cardHeight)
        .scaleEffect(scale(for: index))
        .offset(y: stackYOffset(for: index))
        .offset(index == 0 ? dragOffset : .zero)
        .rotationEffect(index == 0 && !reduceMotion ? .degrees(rotationDegrees) : .zero)
        .zIndex(Double(visibleItems.count - index))
        .animation(
            reduceMotion
                ? .linear(duration: 0)
                : .interactiveSpring(response: 0.32, dampingFraction: 0.78),
            value: dragOffset
        )
        .gesture(dragGesture(for: item), including: index == 0 ? .gesture : .none)
        .onTapGesture { if index == 0 { onTap(item) } }
        .allowsHitTesting(index == 0 && !isDismissing)
    }

    /// VoiceOver can't perform the raw drag gesture or the bare onTapGesture,
    /// so the top card is an activatable button (double-tap opens detail) with
    /// named actions mirroring the swipe commits. Back cards are hidden
    /// (IOS-AUDIT-UX-037).
    private func accessibleCard(_ card: some View, item: SwipeItem, index: Int) -> some View {
        card
            .accessibilityHidden(index != 0)
            .accessibilityAddTraits(index == 0 ? .isButton : [])
            // The only hint on the card. SwipeCard carried a second one
            // telling VoiceOver users to swipe, which they cannot do
            // (IOS-DD-DISCOVER-11).
            .accessibilityHint(index == 0
                ? "Double tap to open details. Actions: Save, Skip, More like this, Undo."
                : "")
            .accessibilityAction { if index == 0 { onTap(item) } }
            .accessibilityAction(named: Text("Save")) { if index == 0 { programmaticLike() } }
            .accessibilityAction(named: Text("Skip")) { if index == 0 { programmaticSkip() } }
            .accessibilityAction(named: Text("More like this")) { if index == 0 { programmaticBoost() } }
            .accessibilityAction(named: Text("Undo")) { if index == 0 { onUndo?() } }
            .accessibilityFocused($focusedCardId, equals: item.id)
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
                // Armed on distance alone, not predicted velocity, so the tick
                // means "letting go here commits".
                let armed = Self.commitDirection(
                    translation: value.translation,
                    predicted: value.translation,
                    threshold: SwipeCard.commitThreshold
                )
                if armed != armedDirection {
                    armedDirection = armed
                    if armed != nil { HapticFeedback.shared.selection() }
                }
            }
            .onEnded { value in
                armedDirection = nil
                guard !isDismissing else { return }
                let direction = Self.commitDirection(
                    translation: value.translation,
                    predicted: value.predictedEndTranslation,
                    threshold: SwipeCard.commitThreshold
                )
                switch direction {
                case .up:
                    commit(item: item, direction: .up, action: onBoost)
                case .right:
                    commit(item: item, direction: .right, action: onLike)
                case .left:
                    commit(item: item, direction: .left, action: onSkip)
                case nil:
                    // Spring back (linear snap under Reduce Motion).
                    withAnimation(reduceMotion ? .linear(duration: 0.1) : .spring(response: 0.4, dampingFraction: 0.7)) {
                        dragOffset = .zero
                    }
                }
            }
    }

    enum CommitDirection: Equatable { case left, right, up }

    /// Which way a drag commits, or nil to spring back. Pure so the thresholds
    /// can be tested (IOS-DD-DISCOVER-11).
    ///
    /// Up wins over horizontal when the drag is clearly upward and its vertical
    /// magnitude beats the horizontal one. A fling commits on predicted travel
    /// past 320pt even when the finger moved less than the threshold.
    nonisolated static func commitDirection(
        translation: CGSize,
        predicted: CGSize,
        threshold: CGFloat
    ) -> CommitDirection? {
        let h = translation.width
        let v = translation.height
        let isVertical = abs(v) > abs(h) && v < 0
        if isVertical {
            return (-v > threshold || -predicted.height > 320) ? .up : nil
        }
        if h > threshold || predicted.width > 320 { return .right }
        if -h > threshold || -predicted.width > 320 { return .left }
        return nil
    }

    private func commit(item: SwipeItem, direction: CommitDirection, action: @escaping (SwipeItem) -> Void) {
        isDismissing = true
        let target: CGSize
        switch direction {
        case .left: target = CGSize(width: -700, height: dragOffset.height)
        case .right: target = CGSize(width: 700, height: dragOffset.height)
        case .up: target = CGSize(width: dragOffset.width, height: -900)
        }

        // Save and skip used to feel identical (medium for both). A save is
        // the good outcome and gets the success pattern; a skip is a light tap.
        switch direction {
        case .right: HapticFeedback.shared.success()
        case .left: HapticFeedback.shared.light()
        case .up: HapticFeedback.shared.premiumUnlock()
        }

        // The card after this one, as it stands now. A boost resets the deck,
        // so there is no "next" to name for it.
        let next = direction == .up ? nil : items.dropFirst().first

        // Reduce Motion: minimize the fly-off travel time (the card must still
        // leave, but we don't draw out the long kinetic sweep).
        withAnimation(.easeOut(duration: reduceMotion ? 0.12 : 0.28)) {
            dragOffset = target
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + (reduceMotion ? 0.12 : 0.28)) {
            action(item)
            dragOffset = .zero
            isDismissing = false
            announceCommit(of: item, direction: direction, next: next)
        }
    }

    /// Tells VoiceOver what happened and what is on top now. A commit used to
    /// be silent, with focus left on a card that had flown away.
    private func announceCommit(of item: SwipeItem, direction: CommitDirection, next: SwipeItem?) {
        guard UIAccessibility.isVoiceOverRunning else { return }
        let verb: String
        switch direction {
        case .right: verb = "Saved"
        case .left: verb = "Skipped"
        case .up: verb = "Showing more like"
        }
        let tail: String
        if direction == .up {
            tail = ""
        } else {
            tail = next.map { " Next: \($0.title)" } ?? " No more cards"
        }
        UIAccessibility.post(notification: .announcement, argument: "\(verb) \(item.title).\(tail)")
        if let next {
            focusedCardId = next.id
        }
    }

    // MARK: - Programmatic commits

    /// Triggers a left-swipe dismiss as if the user tapped the Skip button.
    func programmaticSkip() { triggerProgrammatic(.left) }
    func programmaticLike() { triggerProgrammatic(.right) }
    func programmaticBoost() { triggerProgrammatic(.up) }

    private func triggerProgrammatic(_ direction: CommitDirection) {
        guard !isDismissing, let item = items.first else { return }
        let action: (SwipeItem) -> Void
        switch direction {
        case .left: action = onSkip
        case .right: action = onLike
        case .up: action = onBoost
        }
        commit(item: item, direction: direction, action: action)
    }
}
