import Foundation
@testable import DesMoinesInsider

/// A controllable EventFeedProviding for the Home feed view-model tests
/// (IOS-DD-EVENTS-03).
///
/// In gated mode each fetchEvents call waits until the test resumes it by
/// index, so calls can be completed in any order - which is the only way to
/// hold a load-more open across a reset. In immediate mode every call returns
/// `immediate` at once.
@MainActor
final class FakeEventFeed: EventFeedProviding {
    private(set) var queries: [EventsService.EventsQuery] = []
    private var pending: [Int: CheckedContinuation<EventsService.EventsResponse, Error>] = [:]

    /// When set, calls return this instead of waiting.
    var immediate: Result<EventsService.EventsResponse, Error>?
    var fuzzyResult: [Event] = []
    private(set) var fuzzyQueries: [String] = []

    init(immediate: Result<EventsService.EventsResponse, Error>? = nil) {
        self.immediate = immediate
    }

    func fetchEvents(query: EventsService.EventsQuery) async throws -> EventsService.EventsResponse {
        let index = queries.count
        queries.append(query)
        if let immediate { return try immediate.get() }
        return try await withCheckedThrowingContinuation { pending[index] = $0 }
    }

    /// Completes call `index` (0-based, in call order).
    func resume(_ index: Int, with result: Result<EventsService.EventsResponse, Error>) {
        pending.removeValue(forKey: index)?.resume(with: result)
    }

    func fuzzySearchEvents(query: String, limit: Int) async throws -> [Event] {
        fuzzyQueries.append(query)
        return fuzzyResult
    }

    func fetchFeaturedEvents(limit: Int) async throws -> [Event] { [] }

    // MARK: - Builders

    static func event(_ id: String, date: String = "2026-10-01T00:00:00Z") -> Event {
        Event(id: id, title: "Event \(id)", date: date)
    }

    /// Rows "e<n>" for each n in `ids`.
    static func page(_ ids: Range<Int>, total: Int, hasMore: Bool = true) -> EventsService.EventsResponse {
        page(ids.map { "e\($0)" }, total: total, hasMore: hasMore)
    }

    static func page(_ ids: [String], total: Int, hasMore: Bool = true) -> EventsService.EventsResponse {
        .init(events: ids.map { event($0) }, totalCount: total, hasMore: hasMore)
    }
}

/// Polls on the main actor until `condition` holds, letting other main-actor
/// tasks run in between. Fails the test after about two seconds.
@MainActor
func waitUntil(_ condition: @MainActor () -> Bool) async -> Bool {
    for _ in 0..<400 {
        if condition() { return true }
        try? await Task.sleep(nanoseconds: 5_000_000)
    }
    return condition()
}

/// Lets queued main-actor tasks run (a stale fetch finishing, say).
@MainActor
func settle() async {
    try? await Task.sleep(nanoseconds: 50_000_000)
}
