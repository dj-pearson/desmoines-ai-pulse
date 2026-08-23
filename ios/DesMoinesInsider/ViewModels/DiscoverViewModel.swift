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

    /// A liked card could not be saved for a reason that is not the free-tier
    /// cap. The cap has its own app-level paywall, so surfacing it here too
    /// would double up (IOS-AUDIT-UX-057).
    private(set) var favoriteSaveFailed = false

    func acknowledgeFavoriteFailure() {
        favoriteSaveFailed = false
    }
    private(set) var isLoading = false

    /// True when the last batch fetch threw (IOS-AUDIT-UX-051 AC3).
    ///
    /// Both batch fetchers used to swallow their error and set hasMore... = false,
    /// so a network failure produced an empty deck and the "You've seen
    /// everything" screen. That tells the user they have exhausted the content
    /// when in fact nothing loaded - and the only affordance offered was a Reset
    /// that would fail the same way, silently.
    private(set) var lastLoadFailed = false
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

    /// Bumped whenever the deck is reset (reload / boost). A fetch captures the
    /// generation when it runs and discards its results if the generation has
    /// since changed — so an in-flight pre-reset fetch can't append stale,
    /// wrong-filter cards into the freshly-reset deck.
    private var fetchGeneration = 0
    /// The most recently enqueued fetch. New fetches chain after it so a reset's
    /// refetch is never skipped by the `isPrefetching` guard while an older
    /// fetch is still draining.
    private var fetchTask: Task<Void, Never>?

    private let eventsService: EventPageProviding
    private let restaurantsService: RestaurantPageProviding
    private let swipeService = SwipeInteractionService.shared

    /// Providers default to the shared services, so no call site changes. They
    /// exist so a test can hold a fetch open and bump the deck generation while
    /// it is in flight - the only way the discard behaviour this view model
    /// depends on can be observed (IOS-AUDIT-TEST-006).
    init(
        mode: DiscoverMode = .mixed,
        filter: DiscoverFilterContext = .init(),
        eventsService: EventPageProviding = EventsService.shared,
        restaurantsService: RestaurantPageProviding = RestaurantsService.shared
    ) {
        self.mode = mode
        self.filter = filter
        self.eventsService = eventsService
        self.restaurantsService = restaurantsService
    }

    // MARK: - Load

    func loadInitial() async {
        guard deck.isEmpty else { return }
        await reload()
    }

    func reload() async {
        isLoading = true
        lastLoadFailed = false
        deck = []
        eventOffset = 0
        restaurantOffset = 0
        hasMoreEvents = true
        hasMoreRestaurants = true
        // Invalidate in-flight fetches and run the fresh fetch after they drain
        // (so the isPrefetching guard can't skip it).
        fetchGeneration += 1
        await enqueueFetch().value
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
        // Invalidate any in-flight (pre-boost) fetch so its results are dropped
        // instead of mixed into the narrowed deck.
        fetchGeneration += 1
        // Show the loading state while the narrowed batch loads instead of
        // flashing the "you've seen everything" empty state, which the deck-
        // empty branch would otherwise render mid-boost (IOS-AUDIT-UX-019).
        isLoading = true
        Task { await self.record(.boost, item: item) }
        let task = enqueueFetch()
        Task {
            await task.value
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
        // Throttle background prefetch: only enqueue when nothing is already
        // fetching, so rapid swipes don't queue N sequential page fetches.
        // (reload/boost call enqueueFetch unconditionally — they must always run.)
        if deck.count <= prefetchThreshold && !isPrefetching { enqueueFetch() }
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
            // THE CAP IS ALREADY HANDLED, and not by this view. enforceFavoritesCap
            // posts .favoritesLimitReached, which MainTabView turns into the
            // app-level upsell paywall - so a toast here would be a second,
            // redundant message on top of it. That is what
            // FavoritesService.isLimitReached exists for.
            //
            // EVERYTHING ELSE was swallowed with it: a dropped connection or an
            // expired session meant the card animated away as a save and nothing
            // was saved, with no output of any kind. The previous comment claimed
            // DiscoverView surfaced this via toast; DiscoverView declares a toast
            // and assigns it nowhere (IOS-AUDIT-UX-057).
            if !FavoritesService.isLimitReached(error) {
                favoriteSaveFailed = true
            }
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

    /// Enqueue a fetch that runs after any in-flight fetch drains, so a reset
    /// (reload/boost) isn't skipped by the `isPrefetching` guard. Returns the
    /// task so callers can await completion.
    @discardableResult
    private func enqueueFetch() -> Task<Void, Never> {
        let previous = fetchTask
        let task = Task {
            await previous?.value
            await self.fetchMore()
        }
        fetchTask = task
        return task
    }

    private func fetchMore() async {
        guard !isPrefetching else { return }
        isPrefetching = true
        defer { isPrefetching = false }

        // Capture the deck generation for this run; the batch fetchers drop their
        // results if a reset bumped it while we were awaiting the network.
        let generation = fetchGeneration

        switch mode {
        case .events:
            await fetchEventBatch(generation)
        case .restaurants:
            await fetchRestaurantBatch(generation)
        case .mixed:
            async let events: () = fetchEventBatch(generation)
            async let restaurants: () = fetchRestaurantBatch(generation)
            _ = await (events, restaurants)
        }
    }

    private func fetchEventBatch(_ generation: Int) async {
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
            // A reload/boost reset the deck while we were awaiting — these results
            // belong to the old filter/offset; drop them rather than mixing in.
            guard generation == fetchGeneration else { return }
            let fresh = response.events
                .filter { !swipeService.hasSwiped(itemType: .event, itemId: $0.id) }
                .map { SwipeItem.event($0) }
            appendUnique(fresh)
            eventOffset += response.events.count
            hasMoreEvents = response.hasMore
        } catch {
            guard generation == fetchGeneration else { return }
            hasMoreEvents = false
            lastLoadFailed = true
        }
    }

    private func fetchRestaurantBatch(_ generation: Int) async {
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
            // Drop results if a reload/boost reset the deck mid-flight.
            guard generation == fetchGeneration else { return }
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
            guard generation == fetchGeneration else { return }
            hasMoreRestaurants = false
            lastLoadFailed = true
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
