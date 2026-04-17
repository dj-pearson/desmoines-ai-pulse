import SwiftUI

/// Browse screen for attractions. Mirrors RestaurantsView: search bar,
/// horizontal type chips, featured toggle, rating floor, sort menu,
/// paginated LazyVStack with skeleton + empty states.
struct AttractionsView: View {
    @State private var viewModel = AttractionsViewModel()
    @State private var showScrollToTop = false
    @State private var favoritesService = FavoritesService.shared
    @State private var favoriteToast: String?

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 14) {
                        Color.clear.frame(height: 0).id("top")

                        searchField

                        typeChips

                        featuredAndRatingRow

                        if viewModel.activeFilterCount > 0 {
                            activeChips
                        }

                        if let error = viewModel.errorMessage {
                            errorBanner(error)
                        }

                        if viewModel.isLoading && viewModel.attractions.isEmpty {
                            ForEach(0..<4, id: \.self) { _ in AttractionCardSkeleton() }
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
                            LazyVStack(spacing: 12) {
                                ForEach(Array(viewModel.attractions.enumerated()), id: \.element.id) { index, attraction in
                                    NavigationLink(value: attraction) {
                                        AttractionCardView(
                                            attraction: attraction,
                                            isFavorite: favoritesService.isAttractionFavorited(attraction.id),
                                            onToggleFavorite: { toggleFavorite(attraction) }
                                        )
                                    }
                                    .buttonStyle(.plain)
                                    .entranceAnimation(index: index)
                                    .task {
                                        await viewModel.loadMoreIfNeeded(currentItem: attraction)
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
            }
            .refreshable {
                await viewModel.refresh()
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
            .navigationTitle("Explore")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { sortMenu }
            }
            .navigationDestination(for: Attraction.self) { attraction in
                AttractionDetailView(attraction: attraction)
            }
            .task {
                await viewModel.loadInitialData()
            }
            .overlay(alignment: .bottom) {
                if let msg = favoriteToast {
                    Text(msg)
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.bottom, 24)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
        }
    }

    // MARK: - Search

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
                .font(.subheadline)

            TextField("Search museums, parks, places…", text: $viewModel.searchText)
                .textFieldStyle(.plain)
                .font(.subheadline)
                .submitLabel(.search)

            if !viewModel.searchText.isEmpty {
                Button {
                    viewModel.searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                }
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
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
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(type.displayName) \(selected ? "selected" : "")")
                }
            }
        }
    }

    // MARK: - Featured & Rating

    private var featuredAndRatingRow: some View {
        HStack(spacing: 10) {
            Toggle(isOn: $viewModel.featuredOnly) {
                Label("Featured", systemImage: "sparkles")
                    .font(.caption.weight(.medium))
            }
            .toggleStyle(.button)
            .tint(.orange)

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
            }
            .accessibilityLabel("Minimum rating filter")

            Spacer()
        }
    }

    // MARK: - Active Chips

    private var activeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Text("\(viewModel.attractions.count) results")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)

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
                ForEach(Array(viewModel.selectedTypes).sorted(by: { $0.displayName < $1.displayName })) { type in
                    FilterChipView(text: type.displayName, icon: type.icon) {
                        viewModel.selectedTypes.remove(type)
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
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Favorites

    private func toggleFavorite(_ attraction: Attraction) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        Task {
            do {
                let nowFavorited = try await favoritesService.toggleFavoriteAttraction(attractionId: attraction.id)
                showToast(nowFavorited ? "Saved \(attraction.name)" : "Removed from saved")
            } catch let error as FavoritesService.FavoritesError {
                showToast(error.localizedDescription)
            } catch {
                showToast("Couldn't update favorite")
            }
        }
    }

    private func showToast(_ message: String) {
        withAnimation { favoriteToast = message }
        Task {
            try? await Task.sleep(for: .seconds(2))
            withAnimation { favoriteToast = nil }
        }
    }

    private func ratingLabel(_ r: Double) -> String {
        r.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(r))★+" : String(format: "%.1f★+", r)
    }
}

// MARK: - Attraction Card

private struct AttractionCardView: View {
    let attraction: Attraction
    let isFavorite: Bool
    let onToggleFavorite: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            CachedAsyncImage(url: attraction.imageUrl) {
                ZStack {
                    Rectangle().fill(Color.purple.opacity(0.1))
                    Image(systemName: attraction.attractionType.icon)
                        .font(.title2)
                        .foregroundStyle(.purple.opacity(0.45))
                }
            }
            .frame(width: 100, height: 100)
            .clipShape(RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top) {
                    Text(attraction.name)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    Spacer()

                    Button {
                        onToggleFavorite()
                    } label: {
                        Image(systemName: isFavorite ? "heart.fill" : "heart")
                            .font(.body)
                            .foregroundStyle(isFavorite ? .red : .secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(isFavorite ? "Remove from saved" : "Save to favorites")
                }

                HStack(spacing: 6) {
                    Image(systemName: attraction.attractionType.icon)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(attraction.attractionType.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if attraction.isFeatured == true {
                        Text("Featured")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.18), in: Capsule())
                            .foregroundStyle(.orange)
                    }
                }

                if let rating = attraction.rating {
                    HStack(spacing: 3) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }

                if let location = attraction.location, !location.isEmpty {
                    Label(location, systemImage: "mappin")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }
        }
        .padding(10)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.06), radius: 6, x: 0, y: 2)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Skeleton

private struct AttractionCardSkeleton: View {
    var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray5))
                .frame(width: 100, height: 100)

            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4).fill(Color(.systemGray5)).frame(height: 16)
                RoundedRectangle(cornerRadius: 4).fill(Color(.systemGray6)).frame(width: 90, height: 12)
                RoundedRectangle(cornerRadius: 4).fill(Color(.systemGray6)).frame(width: 50, height: 10)
                RoundedRectangle(cornerRadius: 4).fill(Color(.systemGray6)).frame(width: 120, height: 10)
            }
            Spacer()
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
    AttractionsView()
}
