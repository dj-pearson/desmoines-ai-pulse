import SwiftUI

/// Restaurants listing with smart presets, inline filter pills, and sorting.
struct RestaurantsView: View {
    @State private var viewModel = RestaurantsViewModel()
    @State private var toast: ToastMessage?
    @State private var showScrollToTop = false
    @State private var showDiscover = false

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 14) {
                        Color.clear.frame(height: 0).id("top")

                        // Smart Presets — one-tap filter combos
                        RestaurantSmartPresets(viewModel: viewModel)

                        // Ad banner for free users (hidden for subscribers)
                        AdSlot(.detail)

                        // Stale-data error note (we have data but a refresh failed).
                        if let error = viewModel.errorMessage, !viewModel.restaurants.isEmpty {
                            errorBanner(error)
                        }

                        // Content
                        if viewModel.isLoading {
                            ForEach(0..<4, id: \.self) { _ in
                                RestaurantCardSkeleton()
                            }
                        } else if let error = viewModel.errorMessage, viewModel.restaurants.isEmpty {
                            ErrorStateView(message: error) {
                                Task { await viewModel.refresh() }
                            }
                            .padding(.top, 40)
                        } else if viewModel.restaurants.isEmpty {
                            EmptyStateView(
                                icon: "fork.knife",
                                title: "No Restaurants Found",
                                message: "Try adjusting your filters.",
                                actionTitle: viewModel.activeFilterCount > 0 ? "Clear Filters" : nil,
                                action: { viewModel.clearFilters() }
                            )
                            .padding(.top, 40)
                        } else {
                            LazyVStack(spacing: 12) {
                                ForEach(Array(arrangedRestaurants.enumerated()), id: \.element.id) { index, restaurant in
                                    NavigationLink(value: restaurant) {
                                        RestaurantCardView(restaurant: restaurant, toast: $toast)
                                    }
                                    .buttonStyle(.pressableCard)
                                    .entranceAnimation(index: index)
                                    .onAppear {
                                        if restaurant.isActivelySponsored {
                                            AdTrackingService.shared.logSponsoredImpression(listingType: "restaurant", listingId: restaurant.id)
                                        }
                                    }
                                    .simultaneousGesture(TapGesture().onEnded {
                                        if restaurant.isActivelySponsored {
                                            AdTrackingService.shared.logSponsoredClick(listingType: "restaurant", listingId: restaurant.id)
                                        }
                                    })
                                    .task {
                                        await viewModel.loadMoreIfNeeded(currentItem: restaurant)
                                    }

                                    // Native in-feed ad card at deterministic
                                    // indices (IOS-ADS-012); hidden for subscribers.
                                    if shouldInsertInFeedAd(after: index) {
                                        AdSlot(.feed)
                                    }
                                }

                                if viewModel.isLoadingMore {
                                    ProgressView()
                                        .frame(maxWidth: .infinity)
                                        .padding()
                                }
                            }
                        }
                    }
                    .padding(.horizontal)
                    .trackScrollOffset(showScrollToTop: $showScrollToTop)
                }
                .scrollOffsetCoordinateSpace()
                .overlay(alignment: .bottomTrailing) {
                    ScrollToTopButton(isVisible: showScrollToTop) {
                        withAnimation { proxy.scrollTo("top") }
                    }
                }
                // Sticky filter pills + active chips pinned under the nav title
                // (IOS-IA-004) so the user can edit/clear filters without
                // scrolling back to the top.
                .safeAreaInset(edge: .top, spacing: 0) {
                    StickyFilterBar {
                        RestaurantInlineFilters(viewModel: viewModel)
                            .padding(.horizontal, 14)
                        if viewModel.activeFilterCount > 0 {
                            activeChips.padding(.horizontal, 14)
                        }
                    }
                }
            } // ScrollViewReader
            .refreshable {
                await viewModel.refresh()
                if viewModel.errorMessage == nil {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } else {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
            }
            .navigationTitle("Dining")
            .searchable(
                text: $viewModel.searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search restaurants"
            )
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        showDiscover = true
                    } label: {
                        Label(swipeButtonLabel, systemImage: "rectangle.stack.fill")
                            .font(.subheadline.weight(.semibold))
                    }
                    .accessibilityLabel("Swipe through these restaurants")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    sortMenu
                }
            }
            .fullScreenCover(isPresented: $showDiscover) {
                DiscoverView(
                    initialFilter: discoverFilterFromRestaurants(),
                    initialMode: .restaurants,
                    lockMode: viewModel.activeFilterCount > 0,
                    onClose: { showDiscover = false }
                )
            }
            .navigationDestination(for: Restaurant.self) { restaurant in
                RestaurantDetailView(restaurant: restaurant)
            }
            .task {
                await viewModel.loadInitialData()
            }
            .toastOverlay(message: $toast)
        }
    }

    // MARK: - Swipe entry

    /// Toolbar button label adapts so users see exactly what swipe deck
    /// they're about to enter — "Swipe Italian" reads better than "Swipe".
    private var swipeButtonLabel: String {
        if viewModel.selectedCuisines.count == 1, let only = viewModel.selectedCuisines.first {
            return "Swipe \(only)"
        }
        if viewModel.activeFilterCount > 0 {
            return "Swipe these"
        }
        return "Swipe"
    }

    private func discoverFilterFromRestaurants() -> DiscoverFilterContext {
        var f = DiscoverFilterContext()
        f.cuisines = Array(viewModel.selectedCuisines)
        f.locations = Array(viewModel.selectedLocations)
        f.priceRanges = Array(viewModel.selectedPriceRanges)
        f.minRating = viewModel.minRating
        f.openNow = viewModel.showOpenNowOnly
        return f
    }

    // MARK: - Sort Menu (in toolbar)

    private var sortMenu: some View {
        Menu {
            ForEach(RestaurantSortOption.allCases) { option in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    viewModel.sortBy = option
                    viewModel.activePreset = nil
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

    // MARK: - Active Filter Chips

    private var activeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Text("\(viewModel.restaurants.count) results")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)

                if viewModel.showOpenNowOnly {
                    FilterChipView(text: "Open Now", icon: "clock.fill", tint: .green) {
                        viewModel.showOpenNowOnly = false
                    }
                }
                if viewModel.featuredOnly {
                    FilterChipView(text: "Featured", icon: "sparkles", tint: .orange) {
                        viewModel.featuredOnly = false
                    }
                }
                if viewModel.minRating > 0 {
                    FilterChipView(text: ratingLabel(viewModel.minRating), icon: "star.fill", tint: .yellow) {
                        viewModel.minRating = 0
                    }
                }
                ForEach(Array(viewModel.selectedCuisines).sorted(), id: \.self) { cuisine in
                    FilterChipView(text: cuisine, icon: "fork.knife") {
                        viewModel.selectedCuisines.remove(cuisine)
                    }
                }
                ForEach(Array(viewModel.selectedPriceRanges).sorted(), id: \.self) { price in
                    FilterChipView(text: price, icon: "dollarsign.circle") {
                        viewModel.selectedPriceRanges.remove(price)
                    }
                }
                ForEach(Array(viewModel.selectedLocations).sorted(), id: \.self) { loc in
                    FilterChipView(text: loc, icon: "mappin.and.ellipse") {
                        viewModel.selectedLocations.remove(loc)
                    }
                }
                ForEach(Array(viewModel.selectedDietary).sorted(), id: \.self) { diet in
                    FilterChipView(text: diet.capitalized, icon: "leaf.fill") {
                        viewModel.selectedDietary.remove(diet)
                    }
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

    private func ratingLabel(_ r: Double) -> String {
        r.truncatingRemainder(dividingBy: 1) == 0
            ? "\(Int(r))★+"
            : String(format: "%.1f★+", r)
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
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
    }

    /// Sponsored listings (IOS-ADS-011) pulled to the front of the Dining feed;
    /// organic order is otherwise preserved.
    private var arrangedRestaurants: [Restaurant] {
        SponsoredArranger.arrange(viewModel.restaurants, isSponsored: { $0.isActivelySponsored })
    }

    /// Native in-feed ad cadence (IOS-ADS-012), driven by the central AdConfig.
    private func shouldInsertInFeedAd(after index: Int) -> Bool {
        let position = index + 1
        guard position >= AdConfig.inFeedFirstSlot else { return false }
        return (position - AdConfig.inFeedFirstSlot) % AdConfig.inFeedInterval == 0
    }
}

// MARK: - Skeleton

/// IOS-IA-003: delegates to the unified `ContentCardSkeleton` (`.listRow`) so
/// the loading shape matches the restaurant `.listRow` card exactly.
private struct RestaurantCardSkeleton: View {
    var body: some View {
        ContentCardSkeleton(.listRow)
    }
}

#Preview {
    RestaurantsView()
}
