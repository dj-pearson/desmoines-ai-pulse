import SwiftUI

/// Swipe-to-discover screen. Entered either:
/// - From the Discover tab (generic, with mode toggle).
/// - From a list view with a pre-applied filter (e.g. "swipe these Italian
///   restaurants") — in that case the mode toggle is hidden because the
///   user already chose the lane.
struct DiscoverView: View {
    /// Pre-applied filter context. Empty by default.
    let initialFilter: DiscoverFilterContext
    /// Pre-selected mode. Defaults to mixed.
    let initialMode: DiscoverMode
    /// Hide the mode toggle when entered from a typed filter (events list,
    /// restaurants list) so the user can't accidentally widen the lane.
    let lockMode: Bool
    /// Optional dismiss callback. When provided, a close button appears
    /// in the leading toolbar slot — used when DiscoverView is presented
    /// modally via .fullScreenCover.
    var onClose: (() -> Void)? = nil

    @State private var viewModel: DiscoverViewModel
    @State private var auth = AuthService.shared
    @State private var navigationPath = NavigationPath()
    @State private var toast: ToastMessage?
    @State private var showGroupSession = false
    @State private var showSignIn = false
    @State private var showRecap = false
    /// The recap opens by itself once, when the deck runs out.
    @State private var hasAutoShownRecap = false
    @AppStorage("discover.hasSeenIntro.v1") private var hasSeenIntro = false
    @State private var stackId = UUID()
    /// Drives the action-bar buttons through the swipe-deck's animated commit
    /// path so taps fly the card off like a gesture (IOS-AUDIT-UX-018).
    @State private var swipeCommand: SwipeCardStack.Command?

    init(
        initialFilter: DiscoverFilterContext = .init(),
        initialMode: DiscoverMode = .mixed,
        lockMode: Bool = false,
        onClose: (() -> Void)? = nil
    ) {
        self.initialFilter = initialFilter
        self.initialMode = initialMode
        self.lockMode = lockMode
        self.onClose = onClose
        self._viewModel = State(initialValue: DiscoverViewModel(
            mode: initialMode,
            filter: initialFilter,
            lockMode: lockMode
        ))
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            presentations(changeHandlers(screen))
        }
    }

    private var screen: some View {
        VStack(spacing: 0) {
            if !lockMode {
                modePicker
                    .padding(.horizontal, 16)
                    .padding(.top, 6)
            }

            if !viewModel.activeConstraints.isEmpty {
                filterStrip
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
            }

            deckArea

            // Saved count lives here rather than the toolbar so it doesn't
            // collide with the inline title on narrow widths (IOS-AUDIT-UX-030).
            savedRow

            actionBar
                .padding(.horizontal, 20)
                .padding(.bottom, 16)
        }
        .navigationTitle(viewModel.mode.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
        .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
        .task { await viewModel.loadInitial() }
        .toastOverlay(message: $toast)
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        if let onClose {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark")
                        .font(.subheadline.weight(.semibold))
                }
                .accessibilityLabel("Close discover")
            }
        }
        // Hidden until swiping inside a session is wired up
        // (IOS-DD-DISCOVER-01): hosting and joining worked, and then nothing
        // tied the deck to the session, so no match could ever appear.
        if GroupSessionFeature.isEnabled {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showGroupSession = true
                } label: {
                    Image(systemName: "person.3.sequence.fill")
                        .font(.subheadline.weight(.semibold))
                }
                .accessibilityLabel("Start or join a group session")
            }
        }
    }

    private func changeHandlers<V: View>(_ content: V) -> some View {
        content
            // The toast state existed and nothing ever assigned it
            // (IOS-AUDIT-UX-057). A liked card that failed to save animated away
            // exactly like one that saved.
            .onChange(of: viewModel.favoriteSaveFailed) { _, failed in
                guard failed else { return }
                toast = .error("Couldn't save that one. Check your connection.")
                viewModel.acknowledgeFavoriteFailure()
            }
            // A guest's like is kept, not failed (IOS-DD-DISCOVER-08).
            .onChange(of: viewModel.needsSignInForLikes) { _, needs in
                guard needs else { return }
                toast = .info("Sign in to keep your likes")
            }
            .onChange(of: viewModel.boostFellBack) { _, fellBack in
                guard fellBack else { return }
                toast = .info("Nothing more like that right now - showing everything")
                viewModel.acknowledgeBoostFallback()
            }
            .onChange(of: auth.isAuthenticated) { _, signedIn in
                guard signedIn, !viewModel.guestLikes.isEmpty else { return }
                Task { await viewModel.replayGuestLikes() }
            }
            .onChange(of: shouldOfferRecap) { _, offer in
                guard offer, !hasAutoShownRecap else { return }
                hasAutoShownRecap = true
                showRecap = true
            }
    }

    private func presentations<V: View>(_ content: V) -> some View {
        content
            .sheet(isPresented: $showGroupSession) {
                GroupSessionView()
            }
            .sheet(isPresented: $showSignIn) {
                NavigationStack { AuthView(isModal: true) }
            }
            .sheet(isPresented: $showRecap) {
                SwipeRecapView(items: recapItems) { item in
                    showRecap = false
                    open(item)
                }
                .presentationDetents([.medium, .large])
            }
            .sheet(isPresented: Binding(get: { !hasSeenIntro }, set: { hasSeenIntro = !$0 })) {
                introSheet
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
    }

    /// This session's likes, saved or waiting on sign-in (IOS-DD-DISCOVER-20).
    private var recapItems: [SwipeItem] {
        viewModel.likedItems + viewModel.guestLikes
    }

    private var shouldOfferRecap: Bool {
        viewModel.deck.isEmpty && viewModel.isExhausted && !viewModel.isLoading
            && !viewModel.lastLoadFailed && !recapItems.isEmpty
    }

    private func open(_ item: SwipeItem) {
        switch item {
        case .event(let e): navigationPath.append(e)
        case .restaurant(let r): navigationPath.append(r)
        }
    }

    // MARK: - Mode picker

    private var modePicker: some View {
        Picker("Mode", selection: $viewModel.mode) {
            ForEach(DiscoverMode.allCases) { mode in
                Label(mode.title, systemImage: mode.icon).tag(mode)
            }
        }
        .pickerStyle(.segmented)
        .accessibilityLabel("Discover mode")
    }

    // MARK: - Filter strip

    /// Chips for the filter. Removable ones carry an x, "More like this" ones
    /// say "More:", and Clear appears once there is more than one to clear.
    /// They were static labels, so a boost narrowed the deck for good
    /// (IOS-DD-DISCOVER-06).
    private var filterStrip: some View {
        let constraints = viewModel.activeConstraints
        let removable = constraints.filter(\.isRemovable)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(constraints) { c in
                    Tag(text: c.text, icon: c.icon, onRemove: removeAction(for: c))
                }
                if removable.count > 1 {
                    Button("Clear") {
                        Task { await viewModel.clearAllConstraints() }
                    }
                    .font(.caption.weight(.semibold))
                    .minHitTarget()
                    .accessibilityLabel("Clear filters")
                }
            }
        }
    }

    private func removeAction(for chip: ActiveConstraint) -> (() -> Void)? {
        guard chip.isRemovable else { return nil }
        return {
            HapticFeedback.shared.selection()
            Task { await viewModel.removeConstraint(chip.constraint) }
        }
    }

    // MARK: - Deck

    @ViewBuilder
    private var deckArea: some View {
        // GeometryReader is placed INSIDE the padding so it measures the
        // already-constrained space. The resulting size is passed directly to
        // SwipeCardStack, guaranteeing cards are always bounded to the viewport
        // regardless of layout timing or orientation changes.
        GeometryReader { proxy in
            ZStack {
                if viewModel.isLoading && viewModel.deck.isEmpty {
                    ProgressView().scaleEffect(1.4)
                } else if viewModel.deck.isEmpty {
                    emptyState
                } else {
                    SwipeCardStack(
                        items: viewModel.deck,
                        containerWidth: proxy.size.width,
                        containerHeight: proxy.size.height,
                        onLike: { viewModel.like($0) },
                        onSkip: { viewModel.skip($0) },
                        onBoost: { viewModel.boost($0) },
                        onTap: { item in
                            viewModel.recordDetailTap(item)
                            open(item)
                        },
                        onUndo: { performUndo() },
                        command: $swipeCommand
                    )
                    .id(stackId)
                }
            }
            // Clip any card overflow (e.g. rotation corners, dismiss animations)
            // to the padded deck area so nothing bleeds into the side margins.
            .clipped()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private var emptyState: some View {
        // IOS-AUDIT-UX-051 AC3. The deck being empty because the fetch FAILED
        // is not the same as having seen everything. Neither is a deck that is
        // empty only because the pages fetched so far were all cards the user
        // had already swiped, which said "You've seen everything" with more
        // pages waiting (IOS-DD-DISCOVER-03).
        if viewModel.lastLoadFailed {
            emptyMessage(
                icon: "wifi.exclamationmark",
                title: "Couldn't load more",
                message: "Check your connection and try again.",
                button: "Try again",
                buttonIcon: "arrow.clockwise",
                caption: nil
            ) {
                stackId = UUID()
                Task { await viewModel.reload() }
            }
        } else if !viewModel.isExhausted {
            loadingMoreState
        } else {
            emptyMessage(
                icon: "sparkles",
                title: "You've seen everything",
                message: "Come back later for fresh picks.",
                button: "Start over",
                buttonIcon: "arrow.counterclockwise",
                caption: "Shows cards you've already swiped."
            ) {
                stackId = UUID()
                Task { await viewModel.startOver() }
            }
        }
    }

    private var loadingMoreState: some View {
        VStack(spacing: 14) {
            if viewModel.isPrefetching {
                ProgressView()
                Text("Loading more...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                Text("Nothing new on the last few pages")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button("Keep looking") { viewModel.loadMoreIfNeeded() }
                    .buttonStyle(.bordered)
            }
        }
        .task { viewModel.loadMoreIfNeeded() }
    }

    // swiftlint:disable:next function_parameter_count
    private func emptyMessage(
        icon: String,
        title: String,
        message: String,
        button: String,
        buttonIcon: String,
        caption: String?,
        action: @escaping () -> Void
    ) -> some View {
        VStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 44))
                .foregroundStyle(Color.accentColor)
                .accessibilityHidden(true)
            Text(title)
                .font(.title3.weight(.semibold))
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button(action: action) {
                // The progress state is the other half of AC3: reload() already
                // published isLoading and nothing consumed it, so pressing Reset
                // looked like it had done nothing until the deck repopulated.
                Label(
                    viewModel.isLoading ? "Loading..." : button,
                    systemImage: viewModel.isLoading ? "arrow.triangle.2.circlepath" : buttonIcon
                )
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(Color.accentColor.opacity(0.15), in: Capsule())
            }
            .disabled(viewModel.isLoading)
            .padding(.top, 6)
            if let caption {
                Text(caption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Saved row

    /// "Saved N - see them" opens this session's recap (IOS-DD-DISCOVER-20).
    /// A guest's likes are held for sign-in and say so (IOS-DD-DISCOVER-08).
    @ViewBuilder
    private var savedRow: some View {
        let saved = viewModel.likedItems.count
        let waiting = viewModel.guestLikes.count
        if saved + waiting > 0 {
            HStack(spacing: 12) {
                Spacer(minLength: 0)
                Button {
                    showRecap = true
                } label: {
                    Text(waiting > 0 ? "Liked \(saved + waiting) - sign in to save" : "Saved \(saved) - see them")
                }
                .minHitTarget()
                if waiting > 0 {
                    Button("Sign in") { showSignIn = true }
                        .minHitTarget()
                }
            }
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 28)
        }
    }

    // MARK: - Action bar

    private var actionBar: some View {
        let deckEmpty = viewModel.deck.isEmpty
        return HStack(spacing: 20) {
            // Rewind the last like or skip (IOS-DD-DISCOVER-07). Works on an
            // empty deck too, to bring the last card back.
            actionButton(systemImage: "arrow.uturn.backward", color: .orange, label: "Undo", size: 44) {
                performUndo()
            }
            .disabled(!viewModel.canUndo)
            .opacity(viewModel.canUndo ? 1 : 0.4)

            // Buttons drive the deck's animated commit (which fires the matching
            // haptic and calls viewModel.skip/like/boost after the fly-off), so
            // a tap looks identical to a swipe (IOS-AUDIT-UX-018).
            Group {
                actionButton(systemImage: "xmark", color: .red, label: "Skip", size: 56) {
                    guard !viewModel.deck.isEmpty else { return }
                    swipeCommand = .skip()
                }
                actionButton(systemImage: "arrow.up", color: .blue, label: "More like this", size: 64) {
                    guard !viewModel.deck.isEmpty else { return }
                    swipeCommand = .boost()
                }
                actionButton(systemImage: "heart.fill", color: .green, label: "Save", size: 56) {
                    guard !viewModel.deck.isEmpty else { return }
                    swipeCommand = .like()
                }
            }
            .disabled(deckEmpty)
            .opacity(deckEmpty ? 0.4 : 1)
        }
    }

    private func performUndo() {
        guard let last = viewModel.undoStack.last else { return }
        HapticFeedback.shared.light()
        viewModel.undo()
        if UIAccessibility.isVoiceOverRunning {
            UIAccessibility.post(notification: .announcement, argument: "Undid \(last.item.title)")
        }
    }

    private func actionButton(
        systemImage: String,
        color: Color,
        label: String,
        size: CGFloat,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: size, height: size)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(
                    Circle().strokeBorder(color.opacity(0.35), lineWidth: 2)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    // MARK: - Intro sheet

    /// Scrolls, so "Start swiping" stays reachable at accessibility text sizes;
    /// the fixed stack pushed it off the medium detent (IOS-DD-DISCOVER-12).
    private var introSheet: some View {
        ScrollView {
            VStack(spacing: 16) {
                Image(systemName: "hand.draw.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.accentColor)
                    .padding(.top, 20)
                    .accessibilityHidden(true)
                Text("Swipe to discover")
                    .font(.title2.bold())
                introRows
                    .padding(.horizontal, 24)
                Spacer(minLength: 12)
                Button {
                    hasSeenIntro = true
                } label: {
                    Text("Start swiping")
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 20)
            }
        }
    }

    private var introRows: some View {
        VStack(alignment: .leading, spacing: 12) {
            introRow(icon: "arrow.right.circle.fill", color: .green,
                     title: "Swipe right to save",
                     subtitle: auth.isAuthenticated
                        ? "Adds to your favorites instantly."
                        : "Sign in to keep what you like.")
            introRow(icon: "arrow.left.circle.fill", color: .red,
                     title: "Swipe left to skip",
                     subtitle: "We won't show it again.")
            introRow(icon: "arrow.up.circle.fill", color: .blue,
                     title: "Swipe up for more like this",
                     subtitle: "We'll lean the deck toward what you love.")
            introRow(icon: "arrow.uturn.backward.circle.fill", color: .orange,
                     title: "Changed your mind?",
                     subtitle: "Undo brings the last card back.")
        }
    }

    private func introRow(icon: String, color: Color, title: String, subtitle: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)
                .frame(width: 32)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Tag

private struct Tag: View {
    let text: String
    let icon: String
    /// When set, the chip is a button that removes its constraint.
    var onRemove: (() -> Void)? = nil

    var body: some View {
        if let onRemove {
            Button(action: onRemove) {
                HStack(spacing: 4) {
                    label
                    Image(systemName: "xmark.circle.fill")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .chipStyle()
            }
            .buttonStyle(.plain)
            .minHitTarget()
            .accessibilityLabel("Remove filter \(text)")
        } else {
            HStack(spacing: 4) { label }
                .chipStyle()
        }
    }

    private var label: some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.caption2)
            Text(text).font(.caption.weight(.medium))
        }
    }
}

private extension View {
    func chipStyle() -> some View {
        self
            .foregroundStyle(.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color(.systemGray6), in: Capsule())
    }
}

#Preview {
    DiscoverView()
}
