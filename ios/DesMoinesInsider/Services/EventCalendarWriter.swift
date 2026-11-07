import Foundation
import EventKit

/// What a calendar entry for an event should hold, decided without EventKit
/// so it can be unit tested (IOS-AUDIT-FEAT-039). Event detail and the Saved
/// tab both write through `EventCalendarWriter`, so the two cannot drift into
/// different rules for a TBA row or a missing end time.
struct EventCalendarEntry: Equatable {
    let title: String
    let startDate: Date
    let endDate: Date
    let isAllDay: Bool
    let location: String
    let notes: String
    let timeZone: TimeZone

    /// Nil when the event has no parseable date: there is nothing to put on a
    /// calendar.
    ///
    /// Pinned to Des Moines time, and an all-day entry when there is no real
    /// start time: a TBA row used to become a 7:31pm two-hour block
    /// (IOS-DD-EVENTS-05). Three hours when no usable end is known, as the
    /// web assumes.
    init?(event: Event, calendar: Calendar = DesMoinesTime.calendar) {
        guard let date = event.parsedDate else { return nil }
        title = event.title
        location = event.displayLocation
        notes = event.displayDescription
        timeZone = DesMoinesTime.timeZone
        if event.hasSpecificTime {
            isAllDay = false
            startDate = date
            endDate = event.parsedEndDate.flatMap { $0 > date ? $0 : nil }
                ?? date.addingTimeInterval(3 * 3600)
        } else {
            let dayStart = calendar.startOfDay(for: date)
            isAllDay = true
            startDate = dayStart
            endDate = event.parsedEndDate.flatMap { $0 > dayStart ? $0 : nil } ?? dayStart
        }
    }
}

/// The outcome of one Add to Calendar tap, worded once for every screen.
enum CalendarAddResult: Equatable {
    case added
    case noDate
    case denied
    case failed(String)

    /// Nil on success. The denied wording is the event detail screen's, so the
    /// Saved tab sends the user down the same recovery path.
    var errorMessage: String? {
        switch self {
        case .added: return nil
        case .noDate: return "Event date is not available."
        case .denied: return "Calendar access was denied. You can enable it in Settings."
        case .failed(let message): return message
        }
    }

    /// Only a denial is fixed in Settings; offering the button for a save
    /// error would send the user somewhere that cannot help.
    var offersSettings: Bool { self == .denied }
}

/// Writes an event to the user's default calendar with write-only access.
@MainActor
enum EventCalendarWriter {
    static func add(_ event: Event) async -> CalendarAddResult {
        guard let entry = EventCalendarEntry(event: event) else { return .noDate }

        let store = EKEventStore()
        do {
            guard try await store.requestWriteOnlyAccessToEvents() else { return .denied }

            let calEvent = EKEvent(eventStore: store)
            calEvent.title = entry.title
            calEvent.timeZone = entry.timeZone
            calEvent.isAllDay = entry.isAllDay
            calEvent.startDate = entry.startDate
            calEvent.endDate = entry.endDate
            calEvent.location = entry.location
            calEvent.notes = entry.notes
            calEvent.calendar = store.defaultCalendarForNewEvents

            try store.save(calEvent, span: .thisEvent)
            return .added
        } catch {
            return .failed(error.localizedDescription)
        }
    }
}
