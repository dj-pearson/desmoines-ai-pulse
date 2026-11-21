import Foundation

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

    /// The server no longer returns this event: merged into a duplicate,
    /// hidden, archived or deleted (IOS-DD-EVENTS-02). The screen keeps the
    /// prefetched content but says so, rather than presenting a dead listing
    /// as live.
    private(set) var isUnavailable = false

    /// The archive sweep retired this row: the event happened, so the screen
    /// shows it as a past event rather than as gone, the way the web's
    /// EventDetails renders `archived` (IOS-AUDIT-001). A series screen opens
    /// archived past editions directly, and the visible re-read refuses them,
    /// which is what put "no longer available" over a real past event.
    private(set) var isArchived = false

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
            if Self.isNotFound(error), let archived = await archivedRow(id: id) {
                event = archived
                isArchived = true
                await loadRelated(id: id, category: archived.category)
            } else {
                errorMessage = error.localizedDescription
                if Self.isNotFound(error) { isUnavailable = true }
            }
        }

        isLoading = false
    }

    /// The web's second look (classifyUnlisted): is the id an archived row?
    /// A failed look counts as "no", which is what the screen said before
    /// there was a second look at all.
    private func archivedRow(id: String) async -> Event? {
        try? await service.fetchArchivedEvent(id: id)
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

    /// Re-read the full row and swap it in only if the CONTENT differs.
    ///
    /// NOT `fresh != event`. Event implements `==` as `lhs.id == rhs.id` for
    /// SwiftUI navigation identity, so comparing with it is asking "is this the
    /// same event", which is always true here - the whole refresh silently threw
    /// its result away. Caught by EventDetailRefreshTests the first time this
    /// could be tested at all (IOS-AUDIT-TEST-006).
    ///
    /// Comparing the encoded bytes asks the question that was meant: did any
    /// field change. It runs once per detail open, against a struct that is
    /// already Codable, and it cannot be quietly broken by a change to `==`.
    ///
    /// A failure is silent on purpose. The user is looking at a complete event
    /// already; an error banner over working content would be worse than the
    /// stale field it is warning about.
    private func refreshFromServer(id: String) async {
        isRefreshing = true
        defer { isRefreshing = false }

        let fresh: Event
        do {
            fresh = try await service.fetchEvent(id: id)
        } catch {
            // Only "no such row" is news. Anything else (offline, a timeout)
            // stays silent, for the reason above. "No such row" is then either
            // a past event the archive sweep retired or genuinely gone.
            guard Self.isNotFound(error) else { return }
            if let archived = await archivedRow(id: id) {
                isArchived = true
                isUnavailable = false
                if Self.contentDiffers(archived, from: event) { event = archived }
            } else {
                isArchived = false
                isUnavailable = true
            }
            return
        }
        isUnavailable = false
        isArchived = false
        guard Self.contentDiffers(fresh, from: event) else { return }
        event = fresh
    }

    /// PostgREST's PGRST116 ("0 rows" for a `.single()`), found structurally
    /// the way NetworkRetry finds a status code, so no SDK error type is bound
    /// here and a test can throw its own error with a `code` of "PGRST116".
    static func isNotFound(_ error: Error) -> Bool {
        for child in Mirror(reflecting: error).children where child.label == "code" {
            if let code = child.value as? String, code == "PGRST116" { return true }
        }
        return false
    }

    /// Whether two events differ in any field, rather than in identity.
    ///
    /// An encode failure reports "differs", so the refresh is applied. Skipping
    /// it would mean a comparison problem silently became a staleness problem.
    static func contentDiffers(_ lhs: Event, from rhs: Event?) -> Bool {
        guard let rhs else { return true }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let a = try? encoder.encode(lhs), let b = try? encoder.encode(rhs) else { return true }
        return a != b
    }

    // MARK: - Favorites

    var isFavorited: Bool {
        guard let event else { return false }
        return favorites.isFavorited(event.id)
    }

    /// Toggles the saved state. Returns `.success(true)` when the event is now
    /// saved, so the view can confirm or explain; the error used to go into
    /// `errorMessage`, which this screen never renders, so a guest tapping the
    /// heart got a haptic and nothing else (IOS-DD-EVENTS-14).
    @discardableResult
    func toggleFavorite() async -> Result<Bool, Error> {
        guard let event else { return .failure(FavoritesService.FavoritesError.notConfigured) }
        do {
            let nowSaved = try await favorites.toggleFavorite(eventId: event.id)
            return .success(nowSaved)
        } catch {
            return .failure(error)
        }
    }

    // MARK: - Calendar Integration

    // Cached share formatters, in Des Moines time (IOS-DD-EVENTS-05). The
    // unused Google Calendar URL builder that lived here is gone; it wrote the
    // device zone's wall clock with no zone and a fake time for TBA rows.
    private static let shareFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        f.timeZone = DesMoinesTime.timeZone
        return f
    }()
    private static let shareDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        f.timeZone = DesMoinesTime.timeZone
        return f
    }()

    private(set) var calendarAdded = false
    private(set) var calendarError: String?
    /// The last failure was a permission denial, which only Settings fixes.
    private(set) var calendarOffersSettings = false

    /// Add the event to the user's native iOS Calendar using EventKit. The
    /// entry is built by EventCalendarEntry, shared with the Saved tab
    /// (IOS-AUDIT-FEAT-039).
    func addToCalendar() async {
        guard let event else {
            calendarError = CalendarAddResult.noDate.errorMessage
            return
        }
        let result = await EventCalendarWriter.add(event)
        calendarAdded = result == .added
        calendarError = result.errorMessage
        calendarOffersSettings = result.offersSettings
    }

    func resetCalendarState() {
        calendarAdded = false
        calendarError = nil
        calendarOffersSettings = false
    }

    // MARK: - Share

    /// An invite rather than a listing (IOS-DD-EVENTS-15), with the time in
    /// Des Moines time and no fake time for a TBA row. The link goes as its
    /// own share item so Messages renders a rich preview.
    var shareText: String {
        guard let event else { return "" }
        var text = "Want to go? \(event.title)"
        if let date = event.parsedDate {
            let formatter = event.hasSpecificTime ? Self.shareFormatter : Self.shareDayFormatter
            text += " - \(formatter.string(from: date))"
        }
        text += " at \(event.displayLocation)"
        return text
    }

    /// The event's page on the site. DeepLinkHandler routes
    /// desmoinesinsider.com/events/:id back into the app, so a friend with the
    /// app lands on the same screen.
    var shareURL: URL? {
        event.map { Config.siteURL.appendingPathComponent("events").appendingPathComponent($0.id) }
    }
}
