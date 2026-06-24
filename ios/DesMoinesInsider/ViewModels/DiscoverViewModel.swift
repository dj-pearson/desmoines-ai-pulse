import Foundation

// MARK: - Mode

enum DiscoverMode: String, CaseIterable, Identifiable {
    case mixed
    case events
    case restaurants

    var id: String { rawValue }

    var title: String {
        switch self {
        case .mixed: return "Tonight"
        case .events: return "Events"
        case .restaurants: return "Dining"
        }
    }

    var icon: String {
        switch self {
        case .mixed: return "sparkles"
        case .events: return "calendar"
        case .restaurants: return "fork.knife"
        }
    }
}

// MARK: - Item wrapper

/// Type-erased deck item. Lets a single `SwipeCard` view render either an
/// Event or a Restaurant without the card itself knowing about either model.
enum SwipeItem: Identifiable, Hashable {
    case event(Event)
    case restaurant(Restaurant)

    var id: String {
        switch self {
        case .event(let e): return "event-\(e.id)"
        case .restaurant(let r): return "restaurant-\(r.id)"
        }
    }

    var imageUrl: String? {
        switch self {
        case .event(let e): return e.imageUrl
        case .restaurant(let r): return r.imageUrl
        }
    }

    var title: String {
        switch self {
        case .event(let e): return e.title
        case .restaurant(let r): return r.name
        }
    }

    var subtitle: String {
        switch self {
        case .event(let e):
            if let d = e.parsedDate {
                return d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
            }
            return e.eventCategory.displayName
        case .restaurant(let r):
            return [r.cuisine, r.priceRange].compactMap { $0 }.joined(separator: " · ")
        }
    }

    /// Short location label for the swipe card (city / venue only — not the
    /// full geocoded address string which can be 80+ characters long and
    /// causes the HStack subtitle row to show mid-string content).
    var locationText: String {
        switch self {
        case .event(let e):
            // Events already store a clean [venue, city] display location.
            return e.displayLocation
        case .restaurant(let r):
            // Use only the city; the raw `location` column contains the full
            // geocoded string ("1234 Main St, Des Moines, IA 50309, USA") which
            // is far too long for a one-line card label.
            return r.city ?? ""
        }
    }

    var typeIcon: String {
        switch self {
        case .event: return "calendar"
        case .restaurant: return "fork.knife"
        }
    }

    var typeLabel: String {
        switch self {
        case .event(let e): return e.eventCategory.displayName
        case .restaurant(let r): return r.cuisine ?? "Restaurant"
        }
    }

    var supabaseItemType: SwipeInteractionService.ItemType {
        switch self {
        case .event: return .event
        case .restaurant: return .restaurant
        }
    }

    var rawId: String {
        switch self {
        case .event(let e): return e.id
        case .restaurant(let r): return r.id
        }
    }
}

// MARK: - Filter context

/// Optional filter context that callers can hand to DiscoverView so the deck
/// is pre-narrowed (e.g. "Italian restaurants in East Village"). When all
/// fields are empty the deck pulls from the full catalog.
struct DiscoverFilterContext: Equatable {
    var cuisines: [String] = []
    var locations: [String] = []
    var priceRanges: [String] = []
    var minRating: Double = 0
    var openNow: Bool = false

    var eventCategory: EventCategory? = nil
    var datePreset: DateFilterPreset? = nil
    var freeOnly: Bool = false

    var isEmpty: Bool {
        cuisines.isEmpty && locations.isEmpty && priceRanges.isEmpty &&
        minRating == 0 && !openNow &&
        eventCategory == nil && datePreset == nil && !freeOnly
    }

    /// JSON snapshot stored alongside each swipe to preserve the user's
    /// filter context at the time of the gesture.
    func toSourceContext() -> [String: [String]]? {
        var ctx: [String: [String]] = [:]
        if !cuisines.isEmpty { ctx["cuisines"] = cuisines }
        if !locations.isEmpty { ctx["locations"] = locations }
        if !priceRanges.isEmpty { ctx["priceRanges"] = priceRanges }
        if let cat = eventCategory { ctx["category"] = [cat.rawValue] }
        if let preset = datePreset { ctx["datePreset"] = [preset.rawValue] }
        if openNow { ctx["openNow"] = ["true"] }
        if freeOnly { ctx["freeOnly"] = ["true"] }
        if minRating > 0 { ctx["minRating"] = [String(minRating)] }
        return ctx.isEmpty ? nil : ctx
    }
}

// MARK: - ViewModel

@MainActor
@Observable
final class DiscoverViewModel {
    var mode: DiscoverMode {
        didSet { if oldValue != mode { Task { await reload() } } }
    }
    private(set) var filter: DiscoverFilterContext
    private(set) var deck: [SwipeItem] = []
    private(set) var isLoading = false
    private(set) var totalSwipes = 0
    private(set) var likedItems: [SwipeItem] = []

    /// Number of cards remaining when we trigger a background prefetch.
    private let prefetchThreshold = 4
    private let pageSize = 20

    private var eventOffset = 0
    private var restaurantOffset = 0
    private var hasMoreEvents = true
    private var hasMoreRestaurants = true
    private var isPrefetching = false

    private let eventsService = EventsService.shared
    private let restaurantsService = RestaurantsService.shared
    private let swipeService = SwipeInteractionService.shared

    init(mode: DiscoverMode = .mixed, filter: DiscoverFilterContext = .init()) {
        self.mode = mode
        self.filter = filter
    }

    // MARK: - Load

    func loadInitial() async {
        guard deck.isEmpty else { return }
        await reload()
    }

    func reload() async {
        isLoading = true
        deck = []
        eventOffset = 0
        restaurantOffset = 0
        hasMoreEvents = true
        hasMoreRestaurants = true
        await fetchMore()
        isLoading = false
    }

    func updateFilter(_ newFilter: DiscoverFilterContext) async {
        guard newFilter != filter else { return }
        filter = newFilter
        await reload()
    }

    // MARK: - Swipe handling
    //
    // Deck mutation runs synchronously so SwiftUI sees the model update in
    // the same render frame the swipe gesture commits — otherwise the
    // newly-promoted top card briefly inherits the off-screen drag offset
    // and flickers. Persistence + signal recording are dispatched as
    // fire-and-forget Tasks.

    /// Right swipe → like. Records the signal and adds to favorites.
    func like(_ item: SwipeItem) {
        likedItems.append(item)
        advance()
        Task { await self.record(.like, item: item) }
        Task { await self.persistFavorite(item) }
    }

    /// Left swipe → skip. Pure negative signal.
    func skip(_ item: SwipeItem) {
        advance()
        Task { await self.record(.skip, item: item) }
    }

    /// Up swipe → boost. Strong positive signal *and* re-shapes the deck so
    /// the next batch leans toward the same category / cuisine. This is the
    /// "show me more like this" lever — the reason the up-swipe exists.
    func boost(_ item: SwipeItem) {
        applyBoostFilter(from: item)
        // Drop everything currently in the deck — the user just told us
        // they want a different slice — and refetch with the narrowed
        // filter on a background task.
        deck = []
        eventOffset = 0
        restaurantOffset = 0
        hasMoreEvents = true
        hasMoreRestaurants = true
        totalSwipes += 1
        // Show the loading state while the narrowed batch loads instead of
        // flashing the "you've seen everything" empty state, which the deck-
        // empty branch would otherwise render mid-boost (IOS-AUDIT-UX-019).
        isLoading = true
        Task { await self.record(.boost, item: item) }
        Task {
            await self.fetchMore()
            self.isLoading = false
        }
    }

    /// Tap → opened detail view. Logged as a positive but weaker signal.
    func recordDetailTap(_ item: SwipeItem) {
        Task { await self.record(.detail, item: item) }
    }

    // MARK: - Internals

    private func advance() {
        totalSwipes += 1
        // Drop the top card. SwipeCardStack also removes it visually; this
        // call is the single source of truth for the data model.
        if !deck.isEmpty { deck.removeFirst() }
        if deck.count <= prefetchThreshold { Task { await self.fetchMore() } }
    }

    private func record(_ action: SwipeInteractionService.Action, item: SwipeItem) async {
        await swipeService.record(
            action: action,
            itemType: item.supabaseItemType,
            itemId: item.rawId,
            sourceContext: filter.toSourceContext()
        )
    }

    private func persistFavorite(_ item: SwipeItem) async {
        do {
            switch item {
            case .event(let e):
                if !FavoritesService.shared.isEventFavorited(e.id) {
                    _ = try await FavoritesService.shared.toggleFavorite(eventId: e.id)
                }
            case .restaurant(let r):
                if !FavoritesService.shared.isRestaurantFavorited(r.id) {
                    _ = try await FavoritesService.shared.toggleRestaurantFavorite(restaurantId: r.id)
                }
            }
        } catch {
            // Hitting the free-tier favorites cap is the realistic failure
            // here. Swallow silently — DiscoverView surfaces it via toast.
        }
    }

    private func applyBoostFilter(from item: SwipeItem) {
        switch item {
        case .event(let e):
            filter.eventCategory = e.eventCategory
        case .restaurant(let r):
            if let cuisine = r.cuisine, !cuisine.isEmpty {
                filter.cuisines = [cuisine]
            }
        }
    }

    // MARK: - Fetch

    private func fetchMore() async {
        guard !isPrefetching else { return }
        isPrefetching = true
        defer { isPrefetching = false }

        switch mode {
        case .events:
            await fetchEventBatch()
        case .restaurants:
            await fetchRestaurantBatch()
        case .mixed:
            async let events: () = fetchEventBatch()
            async let restaurants: () = fetchRestaurantBatch()
            _ = await (events, restaurants)
        }
    }

    private func fetchEventBatch() async {
        guard hasMoreEvents else { return }
        var query = EventsService.EventsQuery()
        query.category = filter.eventCategory?.rawValue
        query.cities = filter.locations.isEmpty ? nil : filter.locations
        query.freeOnly = filter.freeOnly
        query.limit = pageSize
        query.offset = eventOffset
        if let preset = filter.datePreset {
            let range = preset.dateRange
            query.dateStart = range.start
            query.dateEnd = range.end
        } else if mode == .mixed {
            // "Tonight" tab: show events within the next 7 days so the deck
            // isn't empty on nights with few events, but doesn't pull events
            // from weeks/months away.
            let range = DateFilterPreset.thisWeek.dateRange
            query.dateStart = range.start
            query.dateEnd = range.end
        }

        do {
            let response = try await eventsService.fetchEvents(query: query)
            let fresh = response.events
                .filter { !swipeService.hasSwiped(itemType: .event, itemId: $0.id) }
                .map { SwipeItem.event($0) }
            appendUnique(fresh)
            eventOffset += response.events.count
            hasMoreEvents = response.hasMore
        } catch {
            hasMoreEvents = false
        }
    }

    private func fetchRestaurantBatch() async {
        guard hasMoreRestaurants else { return }
        var query = RestaurantsService.RestaurantsQuery()
        query.cuisines = filter.cuisines.isEmpty ? nil : filter.cuisines
        query.locations = filter.locations.isEmpty ? nil : filter.locations
        query.priceRanges = filter.priceRanges.isEmpty ? nil : filter.priceRanges
        query.minRating = filter.minRating > 0 ? filter.minRating : nil
        query.sortBy = .popularity
        query.limit = pageSize
        query.offset = restaurantOffset

        do {
            let response = try await restaurantsService.fetchRestaurants(query: query)
            var fresh = response.restaurants
            if filter.openNow {
                fresh = fresh.filter { $0.isOpenNow() == true }
            }
            let mapped = fresh
                .filter { !swipeService.hasSwiped(itemType: .restaurant, itemId: $0.id) }
                .map { SwipeItem.restaurant($0) }
            appendUnique(mapped)
            restaurantOffset += response.restaurants.count
            hasMoreRestaurants = response.hasMore
        } catch {
            hasMoreRestaurants = false
        }
    }

    private func appendUnique(_ items: [SwipeItem]) {
        let existing = Set(deck.map(\.id))
        let unique = items.filter { !existing.contains($0.id) }
        // For mixed mode, shuffle the new batch so events and restaurants
        // interleave instead of arriving in two solid blocks.
        deck.append(contentsOf: mode == .mixed ? unique.shuffled() : unique)
    }
}
