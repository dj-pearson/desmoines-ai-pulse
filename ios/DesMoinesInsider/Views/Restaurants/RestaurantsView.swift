import SwiftUI

/// Restaurants listing with filters and sorting.
struct RestaurantsView: View {
    @State private var viewModel = RestaurantsViewModel()
    @State private var showFilters = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    // Sort picker
                    sortPicker

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
                                    RestaurantCardView(restaurant: restaurant)
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
        }
    }

    private var sortPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(RestaurantSortOption.allCases) { option in
                    Button {
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

// MARK: - Skeleton

private struct RestaurantCardSkeleton: View {
    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(.systemGray5))
                .frame(width: 100, height: 100)

            VStack(alignment: .leading, spacing: 8) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))
                    .frame(height: 16)
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray6))
                    .frame(height: 12)
                    .frame(maxWidth: 120)
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray6))
                    .frame(height: 12)
                    .frame(maxWidth: 80)
            }
        }
        .redacted(reason: .placeholder)
        .shimmer()
    }
}

#Preview {
    RestaurantsView()
}
