import SwiftUI

/// Deals hub (IOS-PARITY-010). Lists active local deals — including recurring
/// happy-hour-style schedules — with category + active-now filters. Every card
/// opens DealDetailSheet (IOS-DD-GUIDES-12); deals that point at a listing
/// deep-link to its native detail from there. Featured deals are labelled
/// "Featured", not "Sponsored" (IOS-DD-GUIDES-13).
struct DealsView: View {
    var ownsNavigationStack: Bool = true

    @State private var viewModel = DealsViewModel()
    @State private var entityTarget: DealEntityTarget?
    /// The deal whose deep-link is being resolved, not just THAT one is.
    /// A bare Bool cannot say which card was tapped, so the spinner had
    /// nowhere to go and the list looked frozen (IOS-AUDIT-UX-053).
    @State private var resolvingDealId: String?
    /// The deal whose detail sheet is open.
    @State private var detailDeal: Deal?
    /// A listing resolved from the sheet, pushed once the sheet is gone so the
    /// push and the dismissal don't fight.
    @State private var pendingTarget: DealEntityTarget?

    var body: some View {
        if ownsNavigationStack {
            NavigationStack { content }
        } else {
            content
        }
    }

    private var content: some View {
        ScrollView {
            // Re-evaluates "Active now" (the filter and the badges) every
            // minute while the list is open (IOS-DD-GUIDES-11).
            // The tick's date is passed down: DealCardView's own inputs don't
            // change, so without it SwiftUI would keep the stale badge.
            TimelineView(.periodic(from: .now, by: 60)) { context in
                listBody(now: context.date)
            }
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
        .refreshable {
            let ok = await viewModel.refresh()
            // Give pull-to-refresh success/error feedback like the other
            // hubs (IOS-AUDIT-UX-015). Driven by the refresh result, so a
            // failed update over older rows is an error (IOS-DD-GUIDES-15).
            UINotificationFeedbackGenerator().notificationOccurred(ok ? .success : .error)
        }
        .reloadOnReconnect(if: viewModel.allDeals.isEmpty) { _ = await viewModel.refresh() }
        .sheet(item: $detailDeal, onDismiss: pushPendingTarget) { deal in
            DealDetailSheet(deal: deal, onOpenBusiness: openAction(for: deal))
        }
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

    @ViewBuilder
    private func listBody(now: Date) -> some View {
        VStack(spacing: 14) {
            if let error = viewModel.errorMessage, viewModel.allDeals.isEmpty {
                errorBanner(error)
            } else if viewModel.isLoading && viewModel.allDeals.isEmpty {
                ForEach(0..<4, id: \.self) { _ in dealSkeleton }
            } else if viewModel.filteredDeals.isEmpty {
                if let error = viewModel.errorMessage {
                    // A refresh failed while the filtered list is empty —
                    // show the real error+retry, not a misleading
                    // "No Deals Found" empty state (IOS-AUDIT-UX-016).
                    errorBanner(error)
                } else {
                    emptyState
                }
            } else {
                if viewModel.showingStaleResults {
                    staleBanner
                }
                dealList(now: now)
            }
        }
        .padding(.horizontal)
        .padding(.bottom, 24)
    }

    private var emptyState: some View {
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
    }

    private func dealList(now: Date) -> some View {
        LazyVStack(spacing: 12) {
            ForEach(Array(viewModel.filteredDeals.enumerated()), id: \.element.id) { index, deal in
                DealCardView(deal: deal, now: now, isResolving: resolvingDealId == deal.id) {
                    detailDeal = deal
                }
                if index == AdConfig.inFeedFirstSlot - 1 {
                    AdSlot(.feed)
                }
            }
        }
    }

    /// Older rows are on screen but the last refresh failed (IOS-DD-GUIDES-15).
    private var staleBanner: some View {
        HStack(spacing: 10) {
            Image(systemName: "wifi.exclamationmark").foregroundStyle(.orange)
            Text("Couldn't update. Showing saved deals.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Button { Task { await viewModel.refresh() } } label: {
                Text("Retry").font(.caption.bold()).foregroundStyle(Color.accentColor)
            }
        }
        .padding(12)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 10))
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

    private static let openableTypes: Set<String> = ["restaurant", "attraction", "event", "hotel"]

    /// The sheet's "Go to" action, or nil when there's no listing to open.
    private func openAction(for deal: Deal) -> (() async -> Bool)? {
        guard deal.entityId != nil, Self.openableTypes.contains(deal.entityType) else { return nil }
        return { await open(deal) }
    }

    /// Resolves the deal's listing. Returns false on a failed fetch or an
    /// unknown type, so the sheet can say so instead of doing nothing
    /// (IOS-DD-GUIDES-12). On success the sheet is dismissed and the listing
    /// is pushed from onDismiss.
    private func open(_ deal: Deal) async -> Bool {
        guard let entityId = deal.entityId, resolvingDealId == nil else { return false }
        resolvingDealId = deal.id
        defer { resolvingDealId = nil }
        do {
            let target: DealEntityTarget
            switch deal.entityType {
            case "restaurant":
                target = .restaurant(try await RestaurantsService.shared.fetchRestaurant(id: entityId))
            case "attraction":
                target = .attraction(try await AttractionsService.shared.fetchAttraction(id: entityId))
            case "event":
                target = .event(try await EventsService.shared.fetchEvent(id: entityId))
            case "hotel":
                target = .hotel(try await HotelsService.shared.fetchHotel(id: entityId))
            default:
                return false
            }
            pendingTarget = target
            detailDeal = nil
            return true
        } catch {
            #if DEBUG
            AppLogger.network.warning("Deal open failed: \(error.localizedDescription)")
            #endif
            return false
        }
    }

    private func pushPendingTarget() {
        guard let target = pendingTarget else { return }
        pendingTarget = nil
        entityTarget = target
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
    /// The TimelineView tick, so "Active now" and "Ends in" re-evaluate.
    let now: Date
    /// This card's deep-link is being fetched. Drives the spinner and blocks
    /// a second tap at the source rather than only in the handler.
    var isResolving: Bool = false
    let onTap: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize
    /// The value badge grows with Dynamic Type instead of shrinking its text
    /// into a fixed 64pt square (IOS-DD-GUIDES-25).
    @ScaledMetric(relativeTo: .caption) private var badgeSide: CGFloat = 64

    var body: some View {
        Button {
            // Every card opens the detail sheet; there are no dead cards
            // any more (IOS-DD-GUIDES-12).
            guard !isResolving else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onTap()
        } label: {
            cardLayout
                .padding(12)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                .overlay {
                    if deal.isFeaturedDeal {
                        RoundedRectangle(cornerRadius: 16).strokeBorder(Color.orange.opacity(0.6), lineWidth: 2)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("Shows the deal details")
    }

    @ViewBuilder
    private var cardLayout: some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 10) {
                valueBadge
                    .frame(maxWidth: 160)
                    .frame(height: badgeSide)
                HStack(alignment: .top) {
                    textColumn
                    Spacer(minLength: 0)
                    trailingIndicator
                }
            }
        } else {
            HStack(spacing: 14) {
                valueBadge.frame(width: badgeSide, height: badgeSide)
                textColumn
                Spacer(minLength: 0)
                trailingIndicator
            }
        }
    }

    private var textColumn: some View {
        VStack(alignment: .leading, spacing: 5) {
            if deal.isFeaturedDeal { FeaturedDealBadge() }
            Text(deal.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
            Text(deal.businessName)
                .font(.caption)
                .foregroundStyle(.secondary)
            statusLine
            if let ends = deal.endsText(now: now) {
                Text(ends)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if let code = deal.code, !code.isEmpty {
                Text("Code: \(code)")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.accentColor)
            }
        }
    }

    private var statusLine: some View {
        HStack(spacing: 8) {
            if let schedule = deal.scheduleText {
                Label(schedule, systemImage: "clock")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
            }
            if deal.isActiveNow(now) {
                Label("Active now", systemImage: "checkmark.circle.fill")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.green)
            }
        }
    }

    @ViewBuilder
    private var trailingIndicator: some View {
        if isResolving {
            // Replaces the chevron rather than sitting beside it, so
            // the row does not reflow while the fetch is in flight.
            ProgressView()
                .controlSize(.small)
                .accessibilityLabel("Opening")
        } else {
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
        }
    }

    private var valueBadge: some View {
        Text(deal.valueLabel)
            .font(.caption.weight(.bold))
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.7)
            .padding(4)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
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
        if deal.isActiveNow(now) { parts.append("Active now") }
        if let ends = deal.endsText(now: now) { parts.append(ends) }
        if deal.isFeaturedDeal { parts.insert("Featured", at: 0) }
        return parts.joined(separator: ". ")
    }
}

#Preview {
    DealsView()
}
