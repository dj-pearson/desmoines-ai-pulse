import Foundation
@testable import DesMoinesInsider

/// A controllable RestaurantFeedProviding for the Dining view-model tests
/// (IOS-DD-RESTAURANTS-02), a copy of FakeEventFeed.
///
/// In gated mode each fetchRestaurants call waits until the test resumes it
/// by index, so calls can be completed in any order. `respond` answers every
/// call at once, from the query (so paging can be simulated by offset).
@MainActor
final class FakeRestaurantFeed: RestaurantFeedProviding {
    typealias Query = RestaurantsService.RestaurantsQuery
    typealias Response = RestaurantsService.RestaurantsResponse

    private(set) var queries: [Query] = []
    private var pending: [Int: CheckedContinuation<Response, Error>] = [:]

    /// When set, calls return this instead of waiting.
    var respond: ((Query) -> Result<Response, Error>)?
    var fuzzyResult: [Restaurant] = []
    private(set) var fuzzyQueries: [String] = []
    var cuisines: [String] = []

    init(respond: ((Query) -> Result<Response, Error>)? = nil) {
        self.respond = respond
    }

    func fetchRestaurants(query: Query) async throws -> Response {
        let index = queries.count
        queries.append(query)
        if let respond { return try respond(query).get() }
        return try await withCheckedThrowingContinuation { pending[index] = $0 }
    }

    /// Completes call `index` (0-based, in call order).
    func resume(_ index: Int, with result: Result<Response, Error>) {
        pending.removeValue(forKey: index)?.resume(with: result)
    }

    func fuzzySearchRestaurants(query: String, limit: Int) async throws -> [Restaurant] {
        fuzzyQueries.append(query)
        return fuzzyResult
    }

    func fetchAvailableCuisines() async throws -> [String] { cuisines }

    // MARK: - Builders

    static func restaurant(_ id: String, sponsored: Bool = false) -> Restaurant {
        var r = Restaurant(id: id, name: "Restaurant \(id)")
        r.isSponsored = sponsored
        return r
    }

    /// Rows "r<n>" for each n in `ids`.
    static func page(_ ids: Range<Int>, total: Int, hasMore: Bool = true) -> Response {
        page(ids.map { restaurant("r\($0)") }, total: total, hasMore: hasMore)
    }

    static func page(_ rows: [Restaurant], total: Int, hasMore: Bool = true) -> Response {
        .init(restaurants: rows, totalCount: total, hasMore: hasMore)
    }
}
