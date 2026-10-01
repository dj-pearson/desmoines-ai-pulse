import Foundation
import Supabase

/// Lightweight view-model for the App Clip.
/// Fetches a small set of upcoming featured events without requiring auth.
@MainActor
@Observable
final class ClipEventsViewModel {

    // MARK: - State

    var events: [ClipEvent] = []
    var isLoading = false
    var errorMessage: String?
    /// True once a load has succeeded, for the one-time App Store overlay.
    private(set) var hasLoadedOnce = false

    /// The invocation URL of the last completed load, so the same URL
    /// arriving twice does not flash the list (IOS-DD-PLATFORM-04).
    private var lastLoadedURL: URL?

    // MARK: - Data Model

    struct ClipEvent: Identifiable, Decodable {
        let id: String
        let title: String
        let date: String
        let endDate: String?
        let eventStartUtc: String?
        /// Not selected (the column is not in every environment, and a
        /// missing column fails the whole query); decoded if a row has it.
        let timeTbd: Bool?
        let location: String?
        let venue: String?
        let category: String?
        let price: String?
        let imageUrl: String?

        enum CodingKeys: String, CodingKey {
            case id, title, date, location, venue, category, price
            case endDate = "end_date"
            case eventStartUtc = "event_start_utc"
            case timeTbd = "time_tbd"
            case imageUrl = "image_url"
        }

        /// Central time, "Time TBA" for an untimed row, never the raw value.
        var formattedDate: String {
            ClipDateFormat.displayDate(date, timeTbd: timeTbd)
        }

        /// The start the web's slug is built from.
        var start: Date? {
            ClipDateFormat.parse(eventStartUtc ?? date)
        }

        /// The web's own URL for this event, /events/<title>-<yyyy-mm-dd>,
        /// else /events/<id>.
        var appURL: URL {
            let segment = start.map { EventSlug.slug(title: title, start: $0) } ?? id
            // swiftlint:disable:next force_unwrapping
            return URL(string: "https://desmoinesinsider.com/events/\(segment)")
                ?? URL(string: "https://desmoinesinsider.com/events")!
        }
    }

    // MARK: - Supabase client

    private var client: SupabaseClient? {
        // Prefer build-time generated secrets (IOS-AUDIT-REL-003) — the Info.plist
        // $(SUPABASE_URL) substitution was never supplied for the Clip target, so
        // it resolved empty. Fall back to Info.plist for any build that does set it.
        let urlString = !GeneratedSecrets.supabaseURL.isEmpty
            ? GeneratedSecrets.supabaseURL
            : (Bundle.main.infoDictionary?["SUPABASE_URL"] as? String ?? "")
        let key = !GeneratedSecrets.supabaseAnonKey.isEmpty
            ? GeneratedSecrets.supabaseAnonKey
            : (Bundle.main.infoDictionary?["SUPABASE_ANON_KEY"] as? String ?? "")
        guard
            !urlString.isEmpty, !urlString.hasPrefix("$("),
            let url = URL(string: urlString),
            !key.isEmpty, !key.hasPrefix("$(")
        else { return nil }
        return SupabaseClient(supabaseURL: url, supabaseKey: key)
    }

    // MARK: - Fetch

    private static let columns = "id,title,date,end_date,event_start_utc,location,venue,category,price,image_url"
    private static let highlightTarget = 5

    /// Loads upcoming featured events (topped up with other upcoming events
    /// when fewer than three are featured). If the clip was invoked from an
    /// event URL, by id or by the web's slug, that event is surfaced first
    /// (IOS-AUDIT-FEAT-033, IOS-DD-PLATFORM-04). Hidden, merged and archived
    /// rows never show.
    func loadEvents(invocationURL: URL?, force: Bool = false) async {
        if !force && hasLoadedOnce && lastLoadedURL == invocationURL { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        guard let client else {
            errorMessage = "App not configured."
            return
        }

        do {
            var surfaced: [ClipEvent] = []
            if let linkId = Self.invocationId(from: invocationURL) {
                surfaced = try await invokedEvent(linkId, client: client)
            }
            let highlights = try await upcoming(client: client)
            let surfacedIds = Set(surfaced.map(\.id))
            events = surfaced + highlights.filter { !surfacedIds.contains($0.id) }
            lastLoadedURL = invocationURL
            hasLoadedOnce = true
        } catch {
            errorMessage = "Couldn't load events."
        }
    }

    /// The invoked event: an exact id, or the row a web slug names.
    private func invokedEvent(_ linkId: String, client: SupabaseClient) async throws -> [ClipEvent] {
        if UUID(uuidString: linkId) != nil {
            return try await client
                .from("events")
                .select(Self.columns)
                .eq("id", value: linkId)
                .neq("is_merged", value: true)
                .neq("is_hidden", value: true)
                .is("archived_at", value: nil)
                .limit(1)
                .execute()
                .value
        }
        guard let day = EventSlug.parseDate(linkId), let window = EventSlug.dayWindow(day) else { return [] }
        let rows: [ClipEvent] = try await client
            .from("events")
            .select(Self.columns)
            .neq("is_merged", value: true)
            .neq("is_hidden", value: true)
            .is("archived_at", value: nil)
            .gte("date", value: Self.iso(window.from))
            .lt("date", value: Self.iso(window.to))
            .limit(50)
            .execute()
            .value
        let candidates = rows.map { EventSlug.Candidate(id: $0.id, title: $0.title, start: $0.start) }
        guard let match = EventSlug.pick(linkId, from: candidates) else { return [] }
        return rows.filter { $0.id == match.id }
    }

    /// Featured events that are not over, soonest first, topped up to five.
    private func upcoming(client: SupabaseClient) async throws -> [ClipEvent] {
        let now = Date()
        // Started in the last three hours, or a multi-day run still going.
        let notOver = "date.gte.\(Self.iso(now.addingTimeInterval(-3 * 3600))),end_date.gte.\(Self.iso(now))"
        let featured: [ClipEvent] = try await client
            .from("events")
            .select(Self.columns)
            .neq("is_merged", value: true)
            .neq("is_hidden", value: true)
            .is("archived_at", value: nil)
            .or(notOver)
            .eq("is_featured", value: true)
            .order("date", ascending: true)
            .limit(Self.highlightTarget)
            .execute()
            .value
        guard featured.count < 3 else { return featured }

        let more: [ClipEvent] = try await client
            .from("events")
            .select(Self.columns)
            .neq("is_merged", value: true)
            .neq("is_hidden", value: true)
            .is("archived_at", value: nil)
            .or(notOver)
            .order("date", ascending: true)
            .limit(Self.highlightTarget)
            .execute()
            .value
        let featuredIds = Set(featured.map(\.id))
        let extra = more.filter { !featuredIds.contains($0.id) }
        return featured + extra.prefix(Self.highlightTarget - featured.count)
    }

    private static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.string(from: date)
    }

    /// The event id or web slug from an `.../events/<segment>` invocation
    /// URL, or nil for a landing page or anything else (falls back to
    /// highlights).
    static func invocationId(from url: URL?) -> String? {
        guard let url else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard let idx = parts.firstIndex(of: "events"), idx + 1 < parts.count else { return nil }
        return EventSlug.linkId(parts[idx + 1])
    }
}
