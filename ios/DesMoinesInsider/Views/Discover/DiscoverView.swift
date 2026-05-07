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
    @State private var navigationPath = NavigationPath()
    @State private var toast: ToastMessage?
    @State private var showGroupSession = false
    @AppStorage("discover.hasSeenIntro.v1") private var hasSeenIntro = false
    @State private var stackId = UUID()

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
        self._viewModel = State(initialValue: DiscoverViewModel(mode: initialMode, filter: initialFilter))
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                if !lockMode {
                    modePicker
                        .padding(.horizontal, 16)
                        .padding(.top, 6)
                }

                if !viewModel.filter.isEmpty {
                    filterStrip
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                }

                deckArea

                actionBar
                    .padding(.horizontal, 24)
                    .padding(.bottom, 16)
            }
            .navigationTitle(viewModel.mode.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
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
                ToolbarItem(placement: .topBarTrailing) {
                    Text("Saved \(viewModel.likedItems.count)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .sheet(isPresented: $showGroupSession) {
                GroupSessionView()
            }
            .navigationDestination(for: Event.self) { EventDetailView(event: $0) }
            .navigationDestination(for: Restaurant.self) { RestaurantDetailView(restaurant: $0) }
            .task { await viewModel.loadInitial() }
            .toastOverlay(message: $toast)
            .sheet(isPresented: Binding(get: { !hasSeenIntro }, set: { hasSeenIntro = !$0 })) {
                introSheet
                    .presentationDetents([.medium])
            }
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

    private var filterStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(viewModel.filter.cuisines, id: \.self) { c in
                    Tag(text: c, icon: "fork.knife")
                }
                ForEach(viewModel.filter.locations, id: \.self) { l in
                    Tag(text: l, icon: "mappin.and.ellipse")
                }
                ForEach(viewModel.filter.priceRanges, id: \.self) { p in
                    Tag(text: p, icon: "dollarsign.circle")
                }
                if let cat = viewModel.filter.eventCategory {
                    Tag(text: cat.displayName, icon: cat.icon)
                }
                if let preset = viewModel.filter.datePreset {
                    Tag(text: preset.rawValue, icon: "calendar")
                }
                if viewModel.filter.openNow {
                    Tag(text: "Open Now", icon: "clock.fill")
                }
                if viewModel.filter.freeOnly {
                    Tag(text: "Free", icon: "ticket")
                }
            }
        }
    }

    // MARK: - Deck

    @ViewBuilder
    private var deckArea: some View {
        ZStack {
            if viewModel.isLoading && viewModel.deck.isEmpty {
                ProgressView().scaleEffect(1.4)
            } else if viewModel.deck.isEmpty {
                emptyState
            } else {
                SwipeCardStack(
                    items: viewModel.deck,
                    onLike: { viewModel.like($0) },
                    onSkip: { viewModel.skip($0) },
                    onBoost: { viewModel.boost($0) },
                    onTap: { item in
                        viewModel.recordDetailTap(item)
                        switch item {
                        case .event(let e): navigationPath.append(e)
                        case .restaurant(let r): navigationPath.append(r)
                        }
                    }
                )
                .id(stackId)
            }
        }
        // .frame fills the remaining VStack height so the GeometryReader inside
        // SwipeCardStack always receives a concrete non-zero proposed size.
        // Padding is the OUTERMOST modifier so it reduces what the ZStack
        // (and GeometryReader) are offered, guaranteeing visible side margins.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "sparkles")
                .font(.system(size: 44))
                .foregroundStyle(.purple.opacity(0.7))
            Text("You've seen everything")
                .font(.title3.weight(.semibold))
            Text("Come back later for fresh picks, or reset to swipe again.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button {
                stackId = UUID()
                Task { await viewModel.reload() }
            } label: {
                Label("Reset deck", systemImage: "arrow.counterclockwise")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Color.accentColor.opacity(0.15), in: Capsule())
            }
            .padding(.top, 6)
        }
    }

    // MARK: - Action bar

    private var actionBar: some View {
        HStack(spacing: 24) {
            actionButton(systemImage: "xmark", color: .red, label: "Skip", size: 56) {
                guard let top = viewModel.deck.first else { return }
                HapticFeedback.shared.medium()
                viewModel.skip(top)
            }
            actionButton(systemImage: "arrow.up", color: .blue, label: "More like this", size: 64) {
                guard let top = viewModel.deck.first else { return }
                HapticFeedback.shared.premiumUnlock()
                viewModel.boost(top)
            }
            actionButton(systemImage: "heart.fill", color: .green, label: "Save", size: 56) {
                guard let top = viewModel.deck.first else { return }
                HapticFeedback.shared.medium()
                viewModel.like(top)
            }
        }
        .disabled(viewModel.deck.isEmpty)
        .opacity(viewModel.deck.isEmpty ? 0.4 : 1)
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
                .shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    // MARK: - Intro sheet

    private var introSheet: some View {
        VStack(spacing: 16) {
            Image(systemName: "hand.draw.fill")
                .font(.system(size: 48))
                .foregroundStyle(PremiumTokens.brandGradient)
                .padding(.top, 20)
            Text("Swipe to discover")
                .font(.title2.bold())
            VStack(alignment: .leading, spacing: 12) {
                introRow(icon: "arrow.right.circle.fill", color: .green,
                         title: "Swipe right to save",
                         subtitle: "Adds to your favorites instantly.")
                introRow(icon: "arrow.left.circle.fill", color: .red,
                         title: "Swipe left to skip",
                         subtitle: "We won't show it again.")
                introRow(icon: "arrow.up.circle.fill", color: .blue,
                         title: "Swipe up for more like this",
                         subtitle: "We'll lean the deck toward what you love.")
            }
            .padding(.horizontal, 24)
            Spacer()
            Button {
                hasSeenIntro = true
            } label: {
                Text("Start swiping")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(PremiumTokens.brandGradient, in: RoundedRectangle(cornerRadius: 14))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 20)
        }
    }

    private func introRow(icon: String, color: Color, title: String, subtitle: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(color)
                .frame(width: 32)
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

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.caption2)
            Text(text).font(.caption.weight(.medium))
        }
        .foregroundStyle(.primary)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color(.systemGray6), in: Capsule())
    }
}

#Preview {
    DiscoverView()
}
