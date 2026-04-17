import SwiftUI

/// Restaurants listing with smart presets, inline filter pills, and sorting.
struct RestaurantsView: View {
    @State private var viewModel = RestaurantsViewModel()
    @State private var toast: ToastMessage?
    @State private var showScrollToTop = false

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 14) {
                        Color.clear.frame(height: 0).id("top")

                        // Smart Presets — one-tap filter combos
                        RestaurantSmartPresets(viewModel: viewModel)

                        // Inline Filter Pills — always visible
                        RestaurantInlineFilters(viewModel: viewModel)

                        // Active filter chips (tap × to remove individually)
                        if viewModel.activeFilterCount > 0 {
                            activeChips
                        }

                        // Ad banner for free users (hidden for subscribers)
                        AdSlot(.detail)

                        // Error banner
                        if let error = viewModel.errorMessage {
                            errorBanner(error)
                        }

                        // Content
                        if viewModel.isLoading {
                            ForEach(0..<4, id: \.self) { _ in
                                RestaurantCardSkeleton()
                            }
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
                                ForEach(Array(viewModel.restaurants.enumerated()), id: \.element.id) { index, restaurant in
                                    NavigationLink(value: restaurant) {
                                        RestaurantCardView(restaurant: restaurant, toast: $toast)
                                    }
                                    .buttonStyle(.plain)
                                    .entranceAnimation(index: index)
                                    .task {
                                        await viewModel.loadMoreIfNeeded(currentItem: restaurant)
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
                .coordinateSpace(name: "scroll")
                .overlay(alignment: .bottomTrailing) {
                    ScrollToTopButton(isVisible: showScrollToTop) {
                        withAnimation { proxy.scrollTo("top") }
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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    sortMenu
                }
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
}

// MARK: - Skeleton (matches RestaurantCardView layout)

private struct RestaurantCardSkeleton: View {
    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray5))
                .frame(width: 100, height: 100)

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray5))
                        .frame(height: 16)
                    Spacer()
                    Circle()
                        .fill(Color(.systemGray6))
                        .frame(width: 16, height: 16)
                }

                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 70, height: 12)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 30, height: 12)
                }

                HStack(spacing: 3) {
                    ForEach(0..<5, id: \.self) { _ in
                        Circle()
                            .fill(Color(.systemGray6))
                            .frame(width: 10, height: 10)
                    }
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 24, height: 10)
                }

                HStack(spacing: 4) {
                    Circle()
                        .fill(Color(.systemGray6))
                        .frame(width: 9, height: 9)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 100, height: 10)
                }
            }
        }
        .padding(10)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.06), radius: 6, x: 0, y: 2)
        .redacted(reason: .placeholder)
        .shimmer()
    }
}

#Preview {
    RestaurantsView()
}
