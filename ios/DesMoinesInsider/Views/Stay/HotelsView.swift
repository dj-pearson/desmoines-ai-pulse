import SwiftUI

/// "Where to Stay" hub (IOS-PARITY-003). Lists active hotels (same data source
/// as web /stay) with search, area/price/rating filters, and navigation into a
/// native detail screen with an affiliate "Book" CTA.
///
/// Like the other parity hubs, renders its own NavigationStack when standalone
/// (`ownsNavigationStack`) and inherits the ambient stack when pushed from the
/// Discover hub or a Trip Planner cross-link.
struct HotelsView: View {
    var ownsNavigationStack: Bool = true

    @State private var viewModel = HotelsViewModel()

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollView {
            listBody
                .padding(.horizontal)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            StickyFilterBar {
                if !viewModel.areas.isEmpty {
                    areaChips.padding(.horizontal, 14)
                }
                priceAndRatingRow.padding(.horizontal, 14)
                if viewModel.activeFilterCount > 0 || viewModel.hasActiveSearch {
                    activeChips.padding(.horizontal, 14)
                }
            }
        }
        .refreshable {
            let ok = await viewModel.refresh()
            // Reflect the real outcome instead of always firing success (UX-015).
            UINotificationFeedbackGenerator().notificationOccurred(ok ? .success : .error)
        }
        .reloadOnReconnect(if: viewModel.hotels.isEmpty) { _ = await viewModel.refresh() }
        .navigationTitle("Where to Stay")
        .searchable(
            text: $viewModel.searchText,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search hotels…"
        )
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { sortMenu }
        }
        .navigationDestination(for: Hotel.self) { HotelDetailView(hotel: $0) }
        .task { await viewModel.loadInitialData() }
    }

    // MARK: - List

    /// One state at a time: an error with nothing loaded is only an error
    /// with Retry, never also "No Hotels Found / check back soon"
    /// (IOS-DD-GUIDES-17).
    @ViewBuilder
    private var listBody: some View {
        VStack(spacing: 14) {
            if let error = viewModel.errorMessage, viewModel.hotels.isEmpty, !viewModel.isLoading {
                errorState(error)
            } else if viewModel.isLoading && viewModel.hotels.isEmpty {
                ForEach(0..<5, id: \.self) { _ in ContentCardSkeleton(.listRow) }
            } else if viewModel.hotels.isEmpty {
                emptyState
            } else {
                if let error = viewModel.errorMessage {
                    errorBanner(error)
                }
                hotelList
            }
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if viewModel.hasActiveSearch {
            EmptyStateView(
                icon: "magnifyingglass",
                title: "No stays match \"\(viewModel.searchText.trimmingCharacters(in: .whitespaces))\"",
                message: "Try a different name or neighborhood.",
                actionTitle: "Clear search",
                action: { viewModel.searchText = "" }
            )
            .padding(.top, 40)
        } else {
            EmptyStateView(
                icon: "bed.double",
                title: "No Hotels Found",
                message: viewModel.activeFilterCount > 0
                    ? "Try adjusting your filters to see more places to stay."
                    : "Check back soon for places to stay in Des Moines.",
                actionTitle: viewModel.activeFilterCount > 0 ? "Clear Filters" : nil,
                action: viewModel.activeFilterCount > 0 ? { viewModel.clearFilters() } : nil
            )
            .padding(.top, 40)
        }
    }

    private var hotelList: some View {
        LazyVStack(spacing: 12) {
            ForEach(Array(viewModel.hotels.enumerated()), id: \.element.id) { index, hotel in
                NavigationLink(value: hotel) {
                    ContentCard(hotel.cardData, variant: .listRow)
                }
                .buttonStyle(.plain)
                .task { await viewModel.loadMoreIfNeeded(currentItem: hotel) }

                if index == AdConfig.inFeedFirstSlot - 1 {
                    AdSlot(.feed)
                }
            }

            if viewModel.isLoadingMore {
                ProgressView().frame(maxWidth: .infinity).padding()
            }
        }
    }

    private func errorState(_ error: String) -> some View {
        ContentUnavailableView {
            Label("Couldn't load places to stay", systemImage: "wifi.exclamationmark")
        } description: {
            Text(error)
        } actions: {
            Button("Retry") { Task { await viewModel.refresh() } }
                .buttonStyle(.borderedProminent)
        }
        .padding(.top, 40)
    }

    // MARK: - Area chips

    private var areaChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(viewModel.areas, id: \.self) { area in
                    let selected = viewModel.selectedAreas.contains(area)
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        if selected { viewModel.selectedAreas.remove(area) }
                        else { viewModel.selectedAreas.insert(area) }
                    } label: {
                        Text(area)
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .foregroundStyle(selected ? .white : .primary)
                            .background(selected ? Color.accentColor : Color(.systemGray6), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(area) area \(selected ? "selected" : "")")
                }
            }
        }
    }

    // MARK: - Price + rating

    private var priceAndRatingRow: some View {
        HStack(spacing: 8) {
            ForEach(viewModel.priceRangeOptions, id: \.self) { price in
                let selected = viewModel.selectedPriceRanges.contains(price)
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    if selected { viewModel.selectedPriceRanges.remove(price) }
                    else { viewModel.selectedPriceRanges.insert(price) }
                } label: {
                    Text(price)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .foregroundStyle(selected ? .white : .primary)
                        .background(selected ? Color.green : Color(.systemGray6), in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Price \(price) \(selected ? "selected" : "")")
            }

            Menu {
                ForEach([0.0, 3.0, 3.5, 4.0, 4.5], id: \.self) { r in
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        viewModel.minStars = r
                    } label: {
                        if viewModel.minStars == r {
                            Label(starLabel(r), systemImage: "checkmark")
                        } else {
                            Text(starLabel(r))
                        }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "star.fill").font(.caption).foregroundStyle(.yellow)
                    Text(viewModel.minStars > 0 ? starLabel(viewModel.minStars) : "Any")
                        .font(.caption.weight(.medium))
                }
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(Color(.systemGray6), in: Capsule())
            }
            .accessibilityLabel("Minimum star rating filter")

            Spacer()
        }
    }

    // MARK: - Active chips

    private var activeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Text(HotelsViewModel.resultsCopy(viewModel.totalCount))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)

                if viewModel.featuredOnly {
                    FilterChipView(text: "Featured", icon: "sparkles", tint: .orange) {
                        viewModel.featuredOnly = false
                    }
                }
                if viewModel.minStars > 0 {
                    FilterChipView(text: starLabel(viewModel.minStars), icon: "star.fill", tint: .yellow) {
                        viewModel.minStars = 0
                    }
                }
                ForEach(Array(viewModel.selectedPriceRanges).sorted(), id: \.self) { price in
                    FilterChipView(text: price, icon: "dollarsign.circle", tint: .green) {
                        viewModel.selectedPriceRanges.remove(price)
                    }
                }
                ForEach(Array(viewModel.selectedAreas).sorted(), id: \.self) { area in
                    FilterChipView(text: area, icon: "mappin") {
                        viewModel.selectedAreas.remove(area)
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

    // MARK: - Sort menu

    private var sortMenu: some View {
        Menu {
            ForEach(HotelsService.Sort.allCases) { option in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    viewModel.sort = option
                } label: {
                    if viewModel.sort == option {
                        Label(option.rawValue, systemImage: "checkmark")
                    } else {
                        Text(option.rawValue)
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.arrow.down").font(.system(size: 14, weight: .semibold))
                Text(viewModel.sort.rawValue).font(.subheadline.weight(.medium))
            }
        }
        .accessibilityLabel("Sort: \(viewModel.sort.rawValue)")
    }

    // MARK: - Error banner

    private func errorBanner(_ error: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
            Text(error).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            Spacer()
            Button { Task { await viewModel.refresh() } } label: {
                Text("Retry").font(.caption.bold()).foregroundStyle(Color.accentColor)
            }
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
    }

    private func starLabel(_ r: Double) -> String {
        r.truncatingRemainder(dividingBy: 1) == 0 ? "\(Int(r))★+" : String(format: "%.1f★+", r)
    }
}

#Preview {
    HotelsView()
}
