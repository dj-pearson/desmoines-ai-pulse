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

    private let service = EventsService.shared
    private let favorites = FavoritesService.shared

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

    /// Load from a pre-fetched event (avoids re-fetch when navigating from list).
    func loadEvent(_ prefetched: Event) async {
        event = prefetched
        isLoading = true

        do {
            if let category = prefetched.category {
                relatedEvents = try await service.fetchRelatedEvents(eventId: prefetched.id, category: category)
            }
        } catch {
            relatedEvents = []
        }

        isLoading = false
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

    var calendarURL: URL? {
        guard let event, let date = event.parsedDate else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd'T'HHmmss"
        let dateStr = formatter.string(from: date)
        let endDate = formatter.string(from: date.addingTimeInterval(7200)) // 2h default

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
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .short
            text += " - \(formatter.string(from: date))"
        }
        text += " at \(event.displayLocation)"
        text += "\n\nFound on Des Moines Insider"
        return text
    }
}
