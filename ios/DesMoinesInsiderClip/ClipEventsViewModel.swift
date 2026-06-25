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

    /// Loads today's upcoming featured events (max 5).
    func loadEvents(invocationURL: URL?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        // If the clip was opened from a specific event URL, optionally surface that first.
        // For now we always show today's highlights.
        guard let client else {
            errorMessage = "App not configured."
            return
        }

        do {
            let today = ISO8601DateFormatter().string(from: Calendar.current.startOfDay(for: Date()))
            let result: [ClipEvent] = try await client
                .from("events")
                .select("id, title, date, location, venue, category, price, image_url")
                .gte("date", value: today)
                .eq("is_featured", value: true)
                .order("date", ascending: true)
                .limit(5)
                .execute()
                .value

            events = result
        } catch {
            errorMessage = "Couldn't load events."
        }
    }
}
