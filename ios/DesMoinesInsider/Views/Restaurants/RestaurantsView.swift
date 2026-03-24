import SwiftUI

/// Restaurants listing with filters and sorting.
struct RestaurantsView: View {
    @State private var viewModel = RestaurantsViewModel()
    @State private var showFilters = false
    @State private var toast: ToastMessage?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    // Sort picker
                    sortPicker

                    // Ad banner for free users (hidden for subscribers)
                    AdBannerView()

                    // Active filters
                    if viewModel.activeFilterCount > 0 {
                        activeFiltersBar
                    }

                    // Error banner
                    if let error = viewModel.errorMessage {
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
                            ForEach(viewModel.restaurants) { restaurant in
                                NavigationLink(value: restaurant) {
                                    RestaurantCardView(restaurant: restaurant, toast: $toast)
                                }
                                .buttonStyle(.plain)
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
            }
            .refreshable {
                await viewModel.refresh()
                if viewModel.errorMessage == nil {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } else {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
            }
            .navigationTitle("Restaurants")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        showFilters = true
                    } label: {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: "line.3.horizontal.decrease.circle")
                            if viewModel.activeFilterCount > 0 {
                                Text("\(viewModel.activeFilterCount)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 16, height: 16)
                                    .background(Color.red, in: Circle())
                                    .offset(x: 4, y: -4)
                            }
                        }
                    }
                    .accessibilityLabel("Filters")
                }
            }
            .sheet(isPresented: $showFilters) {
                RestaurantFilterSheet(viewModel: viewModel)
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
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

    private var sortPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Open Now toggle
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    viewModel.showOpenNowOnly.toggle()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "clock.fill")
                            .font(.caption2)
                        Text("Open Now")
                            .font(.subheadline.weight(.medium))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(viewModel.showOpenNowOnly ? Color.green : Color(.systemGray6))
                    .foregroundStyle(viewModel.showOpenNowOnly ? .white : .primary)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open Now filter")
                .accessibilitySelected(viewModel.showOpenNowOnly)
                .accessibilityHint(viewModel.showOpenNowOnly ? "Tap to show all restaurants" : "Tap to show only open restaurants")

                ForEach(RestaurantSortOption.allCases) { option in
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        viewModel.sortBy = option
                    } label: {
                        Text(option.rawValue)
                            .font(.subheadline.weight(.medium))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                viewModel.sortBy == option
                                    ? Color.accentColor
                                    : Color(.systemGray6)
                            )
                            .foregroundStyle(
                                viewModel.sortBy == option ? .white : .primary
                            )
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var activeFiltersBar: some View {
        HStack {
            Text("\(viewModel.activeFilterCount) filter\(viewModel.activeFilterCount > 1 ? "s" : "") active")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            Spacer()
            Button("Clear All") {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                viewModel.clearFilters()
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.accentColor)
        }
    }
}

// MARK: - Restaurant Filter Sheet

private struct RestaurantFilterSheet: View {
    @Bindable var viewModel: RestaurantsViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // Cuisine
                Section("Cuisine") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(viewModel.availableCuisines, id: \.self) { cuisine in
                                Button {
                                    if viewModel.selectedCuisines.contains(cuisine) {
                                        viewModel.selectedCuisines.remove(cuisine)
                                    } else {
                                        viewModel.selectedCuisines.insert(cuisine)
                                    }
                                } label: {
                                    Text(cuisine)
                                        .font(.caption.weight(.medium))
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(
                                            viewModel.selectedCuisines.contains(cuisine)
                                                ? Color.accentColor
                                                : Color(.systemGray6)
                                        )
                                        .foregroundStyle(
                                            viewModel.selectedCuisines.contains(cuisine) ? .white : .primary
                                        )
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                // Price Range
                Section("Price Range") {
                    HStack(spacing: 8) {
                        ForEach(PriceRange.allCases) { range in
                            Button {
                                if viewModel.selectedPriceRanges.contains(range.rawValue) {
                                    viewModel.selectedPriceRanges.remove(range.rawValue)
                                } else {
                                    viewModel.selectedPriceRanges.insert(range.rawValue)
                                }
                            } label: {
                                Text(range.rawValue)
                                    .font(.subheadline.weight(.medium))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                                    .background(
                                        viewModel.selectedPriceRanges.contains(range.rawValue)
                                            ? Color.accentColor
                                            : Color(.systemGray6)
                                    )
                                    .foregroundStyle(
                                        viewModel.selectedPriceRanges.contains(range.rawValue) ? .white : .primary
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Clear") { viewModel.clearFilters() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
    }
}

// MARK: - Skeleton (matches RestaurantCardView layout)

private struct RestaurantCardSkeleton: View {
    var body: some View {
        HStack(spacing: 14) {
            // Image placeholder
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray5))
                .frame(width: 100, height: 100)

            VStack(alignment: .leading, spacing: 6) {
                // Name + heart row
                HStack {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray5))
                        .frame(height: 16)
                    Spacer()
                    Circle()
                        .fill(Color(.systemGray6))
                        .frame(width: 16, height: 16)
                }

                // Cuisine + price row
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 70, height: 12)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray6))
                        .frame(width: 30, height: 12)
                }

                // Star rating row
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

                // Location row
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
