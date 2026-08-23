import Foundation
import EventKit

/// ViewModel for the event detail screen.
@MainActor
@Observable
final class EventDetailViewModel {
    private(set) var event: Event?
    private(set) var relatedEvents: [Event] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    /// A background re-fetch is running behind content that is already on
    /// screen. Distinct from isLoading, which means "there is nothing to show
    /// yet" - conflating the two is what made the prefetched path raise a
    /// loading flag for work the user was not waiting on (IOS-AUDIT-UX-058).
    private(set) var isRefreshing = false

    private let service: EventDetailProviding
    private let favorites = FavoritesService.shared

    /// Defaults to the shared service, so no call site changes and no view is
    /// touched. The parameter exists so a test can arrange what the fetch
    /// returns, which is the only way the background-refresh behaviour in
    /// IOS-AUDIT-UX-058 can be asserted at all (IOS-AUDIT-TEST-006).
    init(service: EventDetailProviding = EventsService.shared) {
        self.service = service
    }

    // MARK: - Load Event

    func loadEvent(id: String) async {
        isLoading = true
        errorMessage = nil

        do {
            event = try await service.fetchEvent(id: id)
            if let category = event?.category {
                relatedEvents = try await service.fetchRelatedEvents(eventId: id, category: category)
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    /// Show a pre-fetched event immediately, then refresh it behind the scenes.
    ///
    /// The prefetched row is whatever the list had, which may have come from
    /// the on-disk query cache and be as old as its TTL. This used to be the
    /// end of it: the event was displayed and never re-read, so a listing whose
    /// time, venue or price had changed since the list was cached showed the
    /// old values indefinitely.
    ///
    /// isLoading is deliberately NOT raised here. There is already something on
    /// screen; a loading flag would describe work the user is not waiting for.
    func loadEvent(_ prefetched: Event) async {
        event = prefetched

        async let related: Void = loadRelated(id: prefetched.id, category: prefetched.category)
        async let refreshed: Void = refreshFromServer(id: prefetched.id)
        _ = await (related, refreshed)
    }

    private func loadRelated(id: String, category: String?) async {
        guard let category else { return }
        do {
            relatedEvents = try await service.fetchRelatedEvents(eventId: id, category: category)
        } catch {
            relatedEvents = []
        }
    }

    /// Re-read the full row and swap it in only if it actually differs.
    ///
    /// The equality check is what keeps AC3 honest: assigning an identical
    /// Event would invalidate every view reading it for no visible reason, and
    /// the common case is that nothing changed.
    ///
    /// A failure is silent on purpose. The user is looking at a complete event
    /// already; an error banner over working content would be worse than the
    /// stale field it is warning about.
    private func refreshFromServer(id: String) async {
        isRefreshing = true
        defer { isRefreshing = false }

        guard let fresh = try? await service.fetchEvent(id: id) else { return }
        guard fresh != event else { return }
        event = fresh
    }

    // MARK: - Favorites

    var isFavorited: Bool {
        guard let event else { return false }
        return favorites.isFavorited(event.id)
    }

    func toggleFavorite() async {
        guard let event else { return }
        do {
            try await favorites.toggleFavorite(eventId: event.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Calendar Integration

    // Cached formatters (reused across calendarURL / shareText access).
    private static let calendarFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyyMMdd'T'HHmmss"
        return f
    }()
    private static let shareFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    var calendarURL: URL? {
        guard let event, let date = event.parsedDate else { return nil }
        let dateStr = Self.calendarFormatter.string(from: date)
        let endDate = Self.calendarFormatter.string(from: date.addingTimeInterval(7200)) // 2h default

        var components = URLComponents(string: "https://calendar.google.com/calendar/render")!
        components.queryItems = [
            URLQueryItem(name: "action", value: "TEMPLATE"),
            URLQueryItem(name: "text", value: event.title),
            URLQueryItem(name: "dates", value: "\(dateStr)/\(endDate)"),
            URLQueryItem(name: "location", value: event.displayLocation),
            URLQueryItem(name: "details", value: event.displayDescription),
        ]
        return components.url
    }

    private(set) var calendarAdded = false
    private(set) var calendarError: String?

    /// Add the event to the user's native iOS Calendar using EventKit.
    func addToCalendar() async {
        guard let event, let date = event.parsedDate else {
            calendarError = "Event date is not available."
            return
        }

        let store = EKEventStore()

        do {
            let granted = try await store.requestWriteOnlyAccessToEvents()
            guard granted else {
                calendarError = "Calendar access was denied. You can enable it in Settings."
                return
            }

            let calEvent = EKEvent(eventStore: store)
            calEvent.title = event.title
            calEvent.startDate = date
            calEvent.endDate = date.addingTimeInterval(7200) // 2h default
            calEvent.location = event.displayLocation
            calEvent.notes = event.displayDescription
            calEvent.calendar = store.defaultCalendarForNewEvents

            try store.save(calEvent, span: .thisEvent)
            calendarAdded = true
        } catch {
            calendarError = error.localizedDescription
        }
    }

    func resetCalendarState() {
        calendarAdded = false
        calendarError = nil
    }

    // MARK: - Share

    var shareText: String {
        guard let event else { return "" }
        var text = "\(event.title)"
        if let date = event.parsedDate {
            text += " - \(Self.shareFormatter.string(from: date))"
        }
        text += " at \(event.displayLocation)"
        text += "\n\nFound on Des Moines Insider"
        return text
    }
}
