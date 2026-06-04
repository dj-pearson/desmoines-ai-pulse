import SwiftUI

/// Deals hub (IOS-PARITY-010). Lists active local deals — including recurring
/// happy-hour-style schedules — with category + active-now filters. Featured
/// deals are the sponsored surface; deals that point at a listing deep-link to
/// its native detail.
struct DealsView: View {
    var ownsNavigationStack: Bool = true

    @State private var viewModel = DealsViewModel()
    @State private var entityTarget: DealEntityTarget?
    @State private var resolving = false

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollView {
            VStack(spacing: 14) {
                if let error = viewModel.errorMessage, viewModel.allDeals.isEmpty {
                    errorBanner(error)
                } else if viewModel.isLoading && viewModel.allDeals.isEmpty {
                    ForEach(0..<4, id: \.self) { _ in dealSkeleton }
                } else if viewModel.filteredDeals.isEmpty {
                    EmptyStateView(
                        icon: "tag",
                        title: "No Deals Found",
                        message: viewModel.activeFilterCount > 0 || !viewModel.searchText.isEmpty
                            ? "Try clearing your filters to see more deals."
                            : "Check back soon for local deals and happy hours.",
                        actionTitle: viewModel.activeFilterCount > 0 ? "Clear Filters" : nil,
                        action: viewModel.activeFilterCount > 0 ? { viewModel.clearFilters() } : nil
                    )
                    .padding(.top, 36)
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(Array(viewModel.filteredDeals.enumerated()), id: \.element.id) { index, deal in
                            DealCardView(deal: deal) { open(deal) }
                            if index == AdConfig.inFeedFirstSlot - 1 {
                                AdSlot(.feed)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            StickyFilterBar {
                if !viewModel.categories.isEmpty {
                    categoryChips.padding(.horizontal, 14)
                }
            }
        }
        .navigationTitle("Deals")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $viewModel.searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search deals…")
        .refreshable { await viewModel.refresh() }
        .navigationDestination(item: $entityTarget) { target in
            switch target {
            case .restaurant(let r): RestaurantDetailView(restaurant: r)
            case .attraction(let a): AttractionDetailView(attraction: a)
            case .event(let e): EventDetailView(event: e)
            case .hotel(let h): HotelDetailView(hotel: h)
            }
        }
        .task { await viewModel.loadInitialData() }
    }

    // MARK: - Category chips

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(title: "All", selected: viewModel.selectedCategory == nil) {
                    viewModel.selectedCategory = nil
                }
                chip(title: "Active now", selected: viewModel.activeNowOnly, tint: .green) {
                    viewModel.activeNowOnly.toggle()
                }
                ForEach(viewModel.categories, id: \.self) { category in
                    chip(title: category.capitalized, selected: viewModel.selectedCategory == category) {
                        viewModel.selectedCategory = viewModel.selectedCategory == category ? nil : category
                    }
                }
            }
        }
    }

    private func chip(title: String, selected: Bool, tint: Color = .accentColor, action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            Text(title)
                .font(.caption.weight(.medium))
                .padding(.horizontal, 12).padding(.vertical, 7)
                .foregroundStyle(selected ? .white : .primary)
                .background(selected ? tint : Color(.systemGray6), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title) \(selected ? "selected" : "")")
    }

    private var dealSkeleton: some View {
        ContentCardSkeleton(.listRow)
    }

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

    // MARK: - Deep-link to the related listing

    private func open(_ deal: Deal) {
        guard let entityId = deal.entityId, !resolving else { return }
        resolving = true
        Task {
            defer { resolving = false }
            do {
                switch deal.entityType {
                case "restaurant":
                    entityTarget = .restaurant(try await RestaurantsService.shared.fetchRestaurant(id: entityId))
                case "attraction":
                    entityTarget = .attraction(try await AttractionsService.shared.fetchAttraction(id: entityId))
                case "event":
                    entityTarget = .event(try await EventsService.shared.fetchEvent(id: entityId))
                case "hotel":
                    entityTarget = .hotel(try await HotelsService.shared.fetchHotel(id: entityId))
                default:
                    break
                }
            } catch {
                #if DEBUG
                AppLogger.network.warning("Deal open failed: \(error.localizedDescription)")
                #endif
            }
        }
    }
}

/// Resolved deep-link target for a deal's related listing.
enum DealEntityTarget: Identifiable, Hashable {
    case restaurant(Restaurant)
    case attraction(Attraction)
    case event(Event)
    case hotel(Hotel)

    var id: String {
        switch self {
        case .restaurant(let r): return "restaurant-\(r.id)"
        case .attraction(let a): return "attraction-\(a.id)"
        case .event(let e): return "event-\(e.id)"
        case .hotel(let h): return "hotel-\(h.id)"
        }
    }
}

// MARK: - Deal card

private struct DealCardView: View {
    let deal: Deal
    let onTap: () -> Void

    private var isTappable: Bool { deal.entityId != nil }

    var body: some View {
        Button {
            if isTappable {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                onTap()
            }
        } label: {
            HStack(spacing: 14) {
                valueBadge
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 6) {
                        Text(deal.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        if deal.isSponsored { SponsoredBadge() }
                    }
                    Text(deal.businessName)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 8) {
                        if let schedule = deal.scheduleText {
                            Label(schedule, systemImage: "clock")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        if deal.isActiveNow() {
                            Label("Active now", systemImage: "checkmark.circle.fill")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.green)
                        }
                    }
                    if let code = deal.code, !code.isEmpty {
                        Text("Code: \(code)")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.accentColor)
                    }
                }
                Spacer(minLength: 0)
                if isTappable {
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                if deal.isSponsored {
                    RoundedRectangle(cornerRadius: 16).strokeBorder(Color.orange.opacity(0.6), lineWidth: 2)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(!isTappable)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(isTappable ? "Opens \(deal.businessName)" : "")
    }

    private var valueBadge: some View {
        VStack(spacing: 2) {
            Text(deal.valueLabel)
                .font(.caption.weight(.bold))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
        .frame(width: 64, height: 64)
        .background(
            LinearGradient(colors: [Color(red: 0.95, green: 0.27, blue: 0.45), Color(red: 0.86, green: 0.14, blue: 0.47)],
                           startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 12))
        .foregroundStyle(.white)
        .accessibilityHidden(true)
    }

    private var accessibilityLabel: String {
        var parts = ["\(deal.valueLabel) at \(deal.businessName)", deal.title]
        if let schedule = deal.scheduleText { parts.append(schedule) }
        if deal.isActiveNow() { parts.append("Active now") }
        if deal.isSponsored { parts.insert("Sponsored", at: 0) }
        return parts.joined(separator: ". ")
    }
}

#Preview {
    DealsView()
}
