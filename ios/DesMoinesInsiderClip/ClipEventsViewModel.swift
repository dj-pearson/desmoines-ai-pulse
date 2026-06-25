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

    // MARK: - Data Model

    struct ClipEvent: Identifiable, Decodable {
        let id: String
        let title: String
        let date: String
        let location: String?
        let venue: String?
        let category: String?
        let price: String?
        let imageUrl: String?

        enum CodingKeys: String, CodingKey {
            case id, title, date, location, venue, category, price
            case imageUrl = "image_url"
        }

        var formattedDate: String {
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withFullDate, .withTime, .withDashSeparatorInDate, .withColonSeparatorInTime]
            guard let parsed = iso.date(from: date) else { return date }
            let fmt = DateFormatter()
            fmt.dateStyle = .medium
            fmt.timeStyle = .short
            return fmt.string(from: parsed)
        }

        var appURL: URL {
            URL(string: "https://desmoinesinsider.com/events/\(id)")!
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

    /// Loads today's upcoming featured events (max 5). If the clip was invoked
    /// from a specific event URL (e.g. https://desmoinesinsider.com/events/<id>),
    /// that event is surfaced first (IOS-AUDIT-FEAT-033).
    func loadEvents(invocationURL: URL?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        guard let client else {
            errorMessage = "App not configured."
            return
        }

        do {
            // Surface the specifically-invoked event first, when present.
            var surfaced: [ClipEvent] = []
            if let eventId = Self.eventId(from: invocationURL) {
                surfaced = try await client
                    .from("events")
                    .select("id, title, date, location, venue, category, price, image_url")
                    .eq("id", value: eventId)
                    .limit(1)
                    .execute()
                    .value
            }

            let today = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: Date()))
            let highlights: [ClipEvent] = try await client
                .from("events")
                .select("id, title, date, location, venue, category, price, image_url")
                .gte("date", value: today)
                .eq("is_featured", value: true)
                .order("date", ascending: true)
                .limit(5)
                .execute()
                .value

            let surfacedIds = Set(surfaced.map(\.id))
            events = surfaced + highlights.filter { !surfacedIds.contains($0.id) }
        } catch {
            errorMessage = "Couldn't load events."
        }
    }

    /// Extracts a UUID event id from an `.../events/<id>` invocation URL, or nil
    /// for a generic/malformed invocation (falls back to highlights).
    static func eventId(from url: URL?) -> String? {
        guard let url else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        guard let idx = parts.firstIndex(of: "events"), idx + 1 < parts.count else { return nil }
        let candidate = parts[idx + 1]
        return UUID(uuidString: candidate) != nil ? candidate : nil
    }
}
