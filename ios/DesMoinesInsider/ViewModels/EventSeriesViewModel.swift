import Foundation

/// ViewModel for one annual event series (IOS-AUDIT-FEAT-046): reads the
/// series' rows the way the web's useEventSeriesPage does and groups them
/// with `EventSeriesSchedule`, so the screen lists the editions the web page
/// /events/series/<slug> lists.
@MainActor
@Observable
final class EventSeriesViewModel {
    typealias Fetch = (EventSeriesDef) async throws -> [SeriesEventRow]

    let def: EventSeriesDef

    private(set) var schedule: SeriesSchedule?
    private(set) var isLoading = true
    /// A failed read. Kept apart from an empty schedule, so an outage offers
    /// a retry instead of "date not announced yet" (the BestOfCategory rule,
    /// IOS-DD-GUIDES-09).
    private(set) var loadError: String?

    private let fetch: Fetch
    private let now: () -> Date

    /// `fetch` and `now` exist so a test can arrange the rows and the clock.
    init(
        def: EventSeriesDef,
        fetch: @escaping Fetch = { try await EventsService.shared.fetchSeriesRows($0) },
        now: @escaping () -> Date = { Date() }
    ) {
        self.def = def
        self.fetch = fetch
        self.now = now
    }

    func load() async {
        isLoading = true
        loadError = nil
        do {
            let rows = try await fetch(def)
            schedule = EventSeriesSchedule.build(def, rows: rows, now: now())
        } catch {
            if !Self.isCancellation(error) {
                loadError = error.localizedDescription
            }
        }
        isLoading = false
    }

    /// The heading over the current section: "2026 dates" for the current
    /// edition, else the year whose date is not out yet, as on the web.
    var currentHeading: String? {
        guard let schedule else { return nil }
        if let current = schedule.current { return "\(current.year) dates" }
        return schedule.unannouncedYear.map { "\($0) dates" }
    }

    /// The web page for this series, shared from the toolbar.
    var shareURL: URL {
        Config.siteURL.appendingPathComponent("events/series").appendingPathComponent(def.slug)
    }

    private static func isCancellation(_ error: Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }
}
