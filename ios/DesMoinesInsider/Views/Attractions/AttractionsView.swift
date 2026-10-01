import SwiftUI

/// Browse screen for attractions. Mirrors RestaurantsView: search bar,
/// horizontal type chips, featured / free / kids / rainy-day toggles, rating
/// floor, sort menu, paginated LazyVStack with skeleton + empty states.
///
/// Standalone it owns a NavigationStack; pushed from Home it borrows Home's
/// (IOS-DD-BROWSE-08). It used to nest a second stack inside Home's path
/// stack, which is unsupported and doubled the navigation bar.
struct AttractionsView: View {
    var ownsNavigationStack: Bool = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewModel = AttractionsViewModel()
    @State private var showScrollToTop = false
    @State private var favoritesService = FavoritesService.shared
    @State private var toast: ToastMessage?

    var body: some View {
        if ownsNavigationStack {
            NavigationStack {
                content
                    // Only when this view owns the stack: Home already
                    // registers Attraction, and a second registration on the
                    // same path is a runtime warning.
                    .navigationDestination(for: Attraction.self) { attraction in
                        AttractionDetailView(attraction: attraction)
                    }
            }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 14) {
                    Color.clear.frame(height: 0).id("top")
                    listContent
                }
                .padding(.horizontal)
                .trackScrollOffset(showScrollToTop: $showScrollToTop)
            }
            .scrollOffsetCoordinateSpace()
            .overlay(alignment: .bottomTrailing) {
                ScrollToTopButton(isVisible: showScrollToTop) {
                    withAnimation(reduceMotion ? nil : .default) { proxy.scrollTo("top") }
                }
            }
            // Sticky type chips + toggles + active chips pinned under the nav
            // title (IOS-IA-004).
            .safeAreaInset(edge: .top, spacing: 0) {
                StickyFilterBar {
                    typeChips.padding(.horizontal, 14)
                    togglesRow.padding(.horizontal, 14)
                    if viewModel.activeFilterCount > 0 {
                        activeChips.padding(.horizontal, 14)
                    }
                }
            }
        }
        .refreshable {
            await viewModel.refresh()
            // Reflect the real outcome instead of always firing success (UX-005).
            UINotificationFeedbackGenerator()
                .notificationOccurred(viewModel.errorMessage == nil ? .success : .error)
        }
        .navigationTitle("Attractions")
        .searchable(
            text: $viewModel.searchText,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search museums, parks, places…"
        )
        .toolbar {
            if viewModel.activeFilterCount > 0 {
                ToolbarItem(placement: .topBarTrailing) { filterMenu }
            }
            ToolbarItem(placement: .topBarTrailing) { sortMenu }
        }
        .task {
            await viewModel.loadInitialData()
        }
        .toastOverlay(message: $toast)
    }

    // MARK: - List

    @ViewBuilder
    private var listContent: some View {
        // Stale-data error note (we have data but a refresh failed).
        if let error = viewModel.errorMessage, !viewModel.attractions.isEmpty {
            errorBanner(error)
        }

        if (viewModel.isLoading || !viewModel.hasLoadedOnce) && viewModel.attractions.isEmpty {
            ForEach(0..<4, id: \.self) { _ in AttractionCardSkeleton() }
        } else if let error = viewModel.errorMessage, viewModel.attractions.isEmpty {
            ErrorStateView(message: error) {
                Task { await viewModel.refresh() }
            }
            .padding(.top, 40)
        } else if viewModel.attractions.isEmpty {
            EmptyStateView(
                icon: "star.circle",
                title: "No Attractions Found",
                message: "Try adjusting your filters to see more places.",
                actionTitle: viewModel.activeFilterCount > 0 ? "Clear Filters" : nil,
                action: { viewModel.clearFilters() }
            )
            .padding(.top, 40)
        } else {
            rows
        }
    }

    private var rows: some View {
        LazyVStack(spacing: 12) {
            ForEach(Array(viewModel.attractions.enumerated()), id: \.element.id) { index, attraction in
                NavigationLink(value: attraction) {
                    BrowseAttractionCardView(
                        attraction: attraction,
                        isFavorite: favoritesService.isAttractionFavorited(attraction.id),
                        onToggleFavorite: { toggleFavorite(attraction) }
                    )
                }
                .buttonStyle(.pressableCard)
                .entranceAnimation(index: index)
                // onAppear, not .task: a row scrolling away cancelled its
                // .task and with it the page request, which then ended
                // pagination for good (IOS-DD-BROWSE-14).
                .onAppear {
                    Task { await viewModel.loadMoreIfNeeded(currentItem: attraction) }
                }
            }

            if viewModel.isLoadingMore {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding()
            } else if viewModel.loadMoreFailed {
                loadMoreRetryRow
            }
        }
    }

    private var loadMoreRetryRow: some View {
        Button {
            Task { await viewModel.retryLoadMore() }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.clockwise")
                Text("Couldn't load more - Retry")
            }
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity)
        }
        .minHitTarget()
        .padding(.vertical, 8)
    }

    // MARK: - Type Chips

    private var typeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(AttractionType.allCases) { type in
                    let selected = viewModel.selectedTypes.contains(type)
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        if selected {
                            viewModel.selectedTypes.remove(type)
                        } else {
                            viewModel.selectedTypes.insert(type)
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: type.icon)
                                .font(.caption)
                            Text(type.displayName)
                                .font(.caption.weight(.medium))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .foregroundStyle(selected ? .white : .primary)
                        .background(selected ? Color.accentColor : Color(.systemGray6), in: Capsule())
                        // 44pt target around the visual capsule (IOS-DD-BROWSE-15).
                        .frame(minHeight: 44)
                        .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    // Use the .isSelected trait instead of an embedded English
                    // word (which also left a trailing space when unselected) so
                    // VoiceOver announces the toggle state correctly and it stays
                    // localizable (IOS-AUDIT-UX-041).
                    .accessibilityLabel(type.displayName)
                    .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
                }
            }
        }
    }

    // MARK: - Toggles & Rating

    private var togglesRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                toggleChip("Featured", icon: "sparkles", isOn: $viewModel.featuredOnly)
                // IOS-DD-BROWSE-16: the columns the web filters on.
                toggleChip("Free", icon: "gift", isOn: $viewModel.freeOnly)
                toggleChip("Kids", icon: "figure.and.child.holdinghands", isOn: $viewModel.kidFriendlyOnly)
                toggleChip("Rainy day", icon: "umbrella", isOn: $viewModel.indoorOnly)
                ratingMenu
            }
        }
    }

    private func toggleChip(_ title: String, icon: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.medium))
        }
        .toggleStyle(.button)
        .tint(.orange)
        .minHitTarget()
    }

    private var ratingMenu: some View {
        Menu {
            ForEach([0.0, 3.0, 3.5, 4.0, 4.5], id: \.self) { r in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    viewModel.minRating = r
                } label: {
                    if viewModel.minRating == r {
                        Label(ratingLabel(r), systemImage: "checkmark")
                    } else {
                        Text(ratingLabel(r))
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "star.fill")
                    .font(.caption)
                    .foregroundStyle(.yellow)
                Text(viewModel.minRating > 0 ? ratingLabel(viewModel.minRating) : "Any rating")
                    .font(.caption.weight(.medium))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Color(.systemGray6), in: Capsule())
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .accessibilityLabel("Minimum rating filter")
    }

    // MARK: - Active Filters

    /// One active filter: its chip, and its entry in the toolbar menu.
    private struct ActiveFilter: Identifiable {
        let id: String
        let title: String
        let icon: String
        let tint: Color
        let remove: () -> Void
    }

    private var activeFilters: [ActiveFilter] {
        var out: [ActiveFilter] = []
        if viewModel.featuredOnly {
            out.append(ActiveFilter(id: "featured", title: "Featured", icon: "sparkles", tint: .orange) { viewModel.featuredOnly = false })
        }
        if viewModel.freeOnly {
            out.append(ActiveFilter(id: "free", title: "Free", icon: "gift", tint: .orange) { viewModel.freeOnly = false })
        }
        if viewModel.kidFriendlyOnly {
            out.append(ActiveFilter(id: "kids", title: "Kids", icon: "figure.and.child.holdinghands", tint: .orange) { viewModel.kidFriendlyOnly = false })
        }
        if viewModel.indoorOnly {
            out.append(ActiveFilter(id: "indoor", title: "Rainy day", icon: "umbrella", tint: .orange) { viewModel.indoorOnly = false })
        }
        if viewModel.minRating > 0 {
            out.append(ActiveFilter(id: "rating", title: ratingLabel(viewModel.minRating), icon: "star.fill", tint: .yellow) { viewModel.minRating = 0 })
        }
        for type in viewModel.selectedTypes.sorted(by: { $0.displayName < $1.displayName }) {
            out.append(ActiveFilter(id: "type-\(type.rawValue)", title: type.displayName, icon: type.icon, tint: .accentColor) {
                viewModel.selectedTypes.remove(type)
            })
        }
        return out
    }

    private var activeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                // The server's count, not the rows loaded so far (IOS-DD-BROWSE-14).
                Text("\(viewModel.totalCount) \(viewModel.totalCount == 1 ? "result" : "results")")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)

                ForEach(activeFilters) { filter in
                    FilterChipView(text: filter.title, icon: filter.icon, tint: filter.tint, onRemove: filter.remove)
                }

                Button("Clear all") {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    viewModel.clearFilters()
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.red)
                .padding(.horizontal, 4)
            }
            .padding(.vertical, 2)
        }
    }

    // MARK: - Filter Entry Point (IOS-AUDIT-UX-007, IOS-DD-BROWSE-15)

    /// Filter glyph in the toolbar with a count badge. It opens a menu of the
    /// active filters, each removable, with a destructive "Clear all" at the
    /// end. It used to clear everything, the search text included, on one
    /// tap of what looked like a "show filters" button.
    private var filterMenu: some View {
        Menu {
            ForEach(activeFilters) { filter in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    filter.remove()
                } label: {
                    Label("Remove \(filter.title)", systemImage: "xmark")
                }
            }
            Divider()
            Button("Clear all filters", role: .destructive) {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                viewModel.clearFilters()
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .overlay(alignment: .topTrailing) {
                    FilterCountBadge(count: viewModel.activeFilterCount)
                }
        }
        .accessibilityLabel("Filters, \(viewModel.activeFilterCount) active")
        .accessibilityHint("Shows active filters")
    }

    // MARK: - Sort Menu

    private var sortMenu: some View {
        Menu {
            ForEach(AttractionsViewModel.SortOption.allCases) { option in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    viewModel.sortBy = option
                } label: {
                    if viewModel.sortBy == option {
                        Label(option.rawValue, systemImage: "checkmark")
                    } else {
                        Text(option.rawValue)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.system(size: 14, weight: .semibold))
                Text(viewModel.sortBy.rawValue)
                    .font(.subheadline.weight(.medium))
            }
        }
        .accessibilityLabel("Sort: \(viewModel.sortBy.rawValue)")
    }

    // MARK: - Error Banner

    private func errorBanner(_ error: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text(error)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer()
            Button {
                Task { await viewModel.refresh() }
            } label: {
                Text("Retry")
                    .font(.caption.bold())
                    .foregroundStyle(Color.accentColor)
            }
            .minHitTarget()
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Favorites

    /// Toasts go through `.toastOverlay`, which announces to VoiceOver; the
    /// hand-rolled capsule it replaces was silent (IOS-DD-BROWSE-15).
    private func toggleFavorite(_ attraction: Attraction) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        Task {
            do {
                let nowFavorited = try await favoritesService.toggleFavoriteAttraction(attractionId: attraction.id)
                toast = nowFavorited ? .success("Saved \(attraction.name)") : .info("Removed from saved")
            } catch let error as FavoritesService.FavoritesError {
                // Favorites cap presents the upsell paywall app-wide
                // (IOS-SUB-011) — don't double up with a toast.
                if case .limitReached = error { return }
                toast = .error(error.localizedDescription)
            } catch {
                toast = .error("Couldn't update favorite")
            }
        }
    }

    private func ratingLabel(_ r: Double) -> String {
        r.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(r))★+" : String(format: "%.1f★+", r)
    }
}

// MARK: - Attraction Card

/// IOS-IA-003: thin wrapper over the unified `ContentCard` (`.listRow`). The
/// favorite affordance is `.external` because the Attractions screen owns the
/// favorite state + its own toast.
private struct BrowseAttractionCardView: View {
    let attraction: Attraction
    let isFavorite: Bool
    let onToggleFavorite: () -> Void

    var body: some View {
        var data = attraction.cardData
        data.favorite = .external(isFavorited: isFavorite, name: attraction.name, onToggle: onToggleFavorite)
        return ContentCard(data, variant: .listRow)
    }
}

// MARK: - Skeleton

private struct AttractionCardSkeleton: View {
    var body: some View {
        ContentCardSkeleton(.listRow)
    }
}

#Preview {
    AttractionsView()
}
