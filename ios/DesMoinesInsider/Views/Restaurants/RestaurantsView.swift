import SwiftUI

/// Restaurants listing with filters and sorting.
struct RestaurantsView: View {
    @State private var viewModel = RestaurantsViewModel()
    @State private var showFilters = false
    @State private var selectedRestaurant: Restaurant?

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
                                Button {
                                    selectedRestaurant = restaurant
                                } label: {
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
                }
            }
            .sheet(isPresented: $showFilters) {
                RestaurantFilterSheet(viewModel: viewModel)
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
            }
            .sheet(item: $selectedRestaurant) { restaurant in
                RestaurantDetailSheet(restaurant: restaurant)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
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
            Button("Clear All") { viewModel.clearFilters() }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.accent)
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

// MARK: - Restaurant Detail Sheet

private struct RestaurantDetailSheet: View {
    let restaurant: Restaurant
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Hero
                    CachedAsyncImage(url: restaurant.imageUrl) {
                        ZStack {
                            Rectangle().fill(Color.orange.opacity(0.15).gradient)
                            Image(systemName: "fork.knife")
                                .font(.system(size: 48))
                                .foregroundStyle(.orange.opacity(0.3))
                        }
                    }
                    .frame(height: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal)

                    VStack(alignment: .leading, spacing: 12) {
                        // Name & rating
                        HStack {
                            Text(restaurant.name)
                                .font(.title2.bold())
                            Spacer()
                            if let rating = restaurant.rating {
                                HStack(spacing: 4) {
                                    Image(systemName: "star.fill")
                                        .foregroundStyle(.yellow)
                                    Text(String(format: "%.1f", rating))
                                        .fontWeight(.semibold)
                                }
                            }
                        }

                        // Cuisine & Price
                        HStack(spacing: 12) {
                            if let cuisine = restaurant.cuisine {
                                Label(cuisine, systemImage: "fork.knife")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            if let price = restaurant.priceRange {
                                Text(price)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(.green)
                            }
                        }

                        Divider()

                        // Location
                        if !restaurant.displayLocation.isEmpty {
                            Label(restaurant.displayLocation, systemImage: "mappin.circle.fill")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        // Phone
                        if let phone = restaurant.phone, !phone.isEmpty {
                            if let url = restaurant.callURL {
                                Link(destination: url) {
                                    Label(phone, systemImage: "phone.fill")
                                        .font(.subheadline)
                                }
                            }
                        }

                        // Website
                        if let url = restaurant.websiteURL {
                            Link(destination: url) {
                                Label("Visit Website", systemImage: "safari")
                                    .font(.subheadline)
                            }
                        }

                        // Status
                        if let status = restaurant.status, !status.isEmpty {
                            Label(status.capitalized, systemImage: "info.circle")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        Divider()

                        // Description
                        if !restaurant.displayDescription.isEmpty {
                            Text("About")
                                .font(.headline)
                            Text(restaurant.displayDescription)
                                .font(.body)
                                .foregroundStyle(.secondary)
                                .lineSpacing(4)
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .navigationTitle(restaurant.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
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
