import Foundation
@testable import DesMoinesInsider

/// A controllable EventPageProviding for the Discover deck tests
/// (IOS-DD-DISCOVER-03/04/06/07), shared by DiscoverDeckTests and
/// DiscoverUndoTests.
///
/// With `respond` set, every call is answered at once from the query, so
/// paging can be simulated by offset. Without it each call waits until the
/// test resumes it by index, which is how a fetch is held open across a reset.
@MainActor
final class FakeDiscoverEvents: EventPageProviding {
    typealias Query = EventsService.EventsQuery
    typealias Response = EventsService.EventsResponse

    private(set) var queries: [Query] = []
    private var pending: [Int: CheckedContinuation<Response, Error>] = [:]
    var respond: ((Query) -> Response)?

    var callCount: Int { queries.count }

    init(respond: ((Query) -> Response)? = nil) {
        self.respond = respond
    }

    /// Always the same rows, no more pages.
    convenience init(events: [Event]) {
        self.init(respond: { _ in .init(events: events, totalCount: events.count, hasMore: false) })
    }

    func fetchEvents(query: Query) async throws -> Response {
        let index = queries.count
        queries.append(query)
        if let respond { return respond(query) }
        return try await withCheckedThrowingContinuation { pending[index] = $0 }
    }

    /// Completes call `index` (0-based, in call order).
    func resume(_ index: Int, with result: Result<Response, Error>) {
        pending.removeValue(forKey: index)?.resume(with: result)
    }

    // MARK: - Builders

    nonisolated static func event(_ id: String, category: String? = "Music") -> Event {
        var e = Event(id: id, title: "Event \(id)", date: "2026-10-01T00:00:00Z")
        e.category = category
        return e
    }

    nonisolated static func page(_ ids: [String], hasMore: Bool = false) -> Response {
        .init(events: ids.map { event($0) }, totalCount: ids.count, hasMore: hasMore)
    }
}

/// Serves restaurants from a closure, or none.
@MainActor
final class FakeDiscoverRestaurants: RestaurantPageProviding {
    typealias Query = RestaurantsService.RestaurantsQuery
    typealias Response = RestaurantsService.RestaurantsResponse

    private(set) var queries: [Query] = []
    var respond: (Query) -> Response

    init(respond: @escaping (Query) -> Response = { _ in .init(restaurants: [], totalCount: 0, hasMore: false) }) {
        self.respond = respond
    }

    func fetchRestaurants(query: Query) async throws -> Response {
        queries.append(query)
        return respond(query)
    }
}

extension DiscoverViewModel {
    /// A view model on fakes: nothing counts as already swiped unless
    /// `swiped` says so, and saving a favorite succeeds and reports that it
    /// turned one on.
    @MainActor
    static func testing(
        mode: DiscoverMode = .events,
        filter: DiscoverFilterContext = .init(),
        lockMode: Bool = false,
        // Optional rather than `= FakeDiscoverEvents()`: a default argument is
        // evaluated outside this function's main-actor isolation, and the
        // fakes' initializers are main-actor isolated (Xcode 26 error).
        events: FakeDiscoverEvents? = nil,
        restaurants: FakeDiscoverRestaurants? = nil,
        swiped: @escaping @MainActor (SwipeInteractionService.ItemType, String) -> Bool = { _, _ in false },
        saveFavorite: @escaping @MainActor (SwipeItem) async throws -> Bool = { _ in true },
        removeFavorite: @escaping @MainActor (SwipeItem) async -> Void = { _ in }
    ) -> DiscoverViewModel {
        DiscoverViewModel(
            mode: mode,
            filter: filter,
            lockMode: lockMode,
            eventsService: events ?? FakeDiscoverEvents(),
            restaurantsService: restaurants ?? FakeDiscoverRestaurants(),
            hasSwiped: swiped,
            saveFavorite: saveFavorite,
            removeFavorite: removeFavorite
        )
    }
}
