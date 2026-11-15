import Foundation
import Supabase

/// The signed-in user's "Personalized suggestions" switch (XPLAT-016), stored
/// in `profiles.communication_preferences.event_recommendations`.
///
/// get_personalized_recommendations_v2 returns no rows unless that key is the
/// JSON boolean `true` (20261108000105), and ForYouService then shows
/// trending. Before this, an iOS user who never opened the website had no way
/// to turn it on. It is the same key the web's PreferencesManager and the
/// Android Settings switch write.
///
/// `communication_preferences` is a bag of several keys (email_notifications,
/// event_recommendations, ...) and PostgREST replaces a jsonb column whole, so
/// a write reads the bag first and sets this one key. If that read fails the
/// write is refused: writing a bag we could not read would erase the other
/// keys. ProfileUpdate leaves the column out on purpose for the same reason.
@MainActor
@Observable
final class PersonalizationPreferenceService {
    static let shared = PersonalizationPreferenceService()

    /// The communication_preferences key.
    nonisolated static let key = "event_recommendations"
    /// The consent_records.consent_type the web logs this key under.
    nonisolated static let consentType = "personalization_ai"

    /// nil until loaded (the Settings switch is disabled meanwhile).
    private(set) var enabled: Bool?

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    private init() {}

    enum PreferenceError: LocalizedError {
        case unreadable

        var errorDescription: String? {
            "Couldn't read your current preferences, so nothing was changed."
        }
    }

    // MARK: - Pure helpers (unit tested)

    /// The communication_preferences bag from a `select=communication_preferences`
    /// response. A null or missing column is an empty bag. nil means the
    /// response could not be read or held no profile row, and a write must
    /// not go ahead on it.
    nonisolated static func bag(from data: Data) -> [String: Any]? {
        guard let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]],
              let row = rows.first else { return nil }
        guard let value = row["communication_preferences"], !(value is NSNull) else { return [:] }
        return value as? [String: Any]
    }

    /// Whether the key is on. Only the JSON boolean `true` counts, matching
    /// the server's `(communication_preferences -> 'event_recommendations') =
    /// 'true'::jsonb`, the web's readOptIn and Android's isExplicitlyOn. A
    /// missing key, null, 1 and the string "true" all read as off, so the
    /// switch never shows on for an account the server will not personalize.
    nonisolated static func isOn(_ bag: [String: Any]?) -> Bool {
        guard let number = bag?[key] as? NSNumber,
              CFGetTypeID(number) == CFBooleanGetTypeID() else { return false }
        return number.boolValue
    }

    /// The PATCH body: the bag with only this key changed.
    nonisolated static func patchBody(merging on: Bool, into bag: [String: Any]) throws -> Data {
        var merged = bag
        merged[key] = on
        return try JSONSerialization.data(
            withJSONObject: ["communication_preferences": merged],
            options: [.sortedKeys]
        )
    }

    // MARK: - Remote

    private func readBag(userId: String) async throws -> [String: Any] {
        guard let supabase else { throw AuthService.AuthError.notConfigured }
        let response = try await supabase
            .from("profiles")
            .select("communication_preferences")
            .eq("user_id", value: userId)
            .limit(1)
            .execute()
        guard let bag = Self.bag(from: response.data) else { throw PreferenceError.unreadable }
        return bag
    }

    func load() async {
        guard let supabase,
              let userId = try? await supabase.auth.session.user.id.uuidString else {
            return
        }
        do {
            enabled = Self.isOn(try await readBag(userId: userId))
        } catch {
            AppLogger.network.warning("Personalization preference load failed: \(error.localizedDescription)")
        }
    }

    /// Optimistic: the switch moves at once and rolls back if the write fails.
    func setEnabled(_ on: Bool) async throws {
        guard let supabase else { throw AuthService.AuthError.notConfigured }
        guard let userId = try? await supabase.auth.session.user.id.uuidString else {
            throw AuthService.AuthError.noUser
        }
        let previous = enabled
        enabled = on
        do {
            let bag = try await readBag(userId: userId)
            let body = try JSONDecoder().decode(
                [String: AnyJSON].self,
                from: try Self.patchBody(merging: on, into: bag)
            )
            try await supabase
                .from("profiles")
                .update(body, returning: .minimal)
                .eq("user_id", value: userId)
                .execute()
        } catch {
            enabled = previous
            throw error
        }
        await recordConsent(userId: userId, granted: on)
        // Re-rank the Home rail now rather than on the next pull to refresh,
        // so turning this off takes the personalized rail away at once.
        Task { await ForYouService.shared.refresh() }
    }

    private struct ConsentRow: Encodable {
        let user_id: String
        let consent_type: String
        let granted: Bool
        let source: String
        let metadata: [String: String]
    }

    /// Appends the consent_records row the web's logConsent writes, so the
    /// history on /profile shows a change made here. The setting is already
    /// saved, so a failed insert is logged and not reported: rolling the
    /// switch back would show the old state while the server holds the new.
    private func recordConsent(userId: String, granted: Bool) async {
        guard let supabase else { return }
        do {
            try await supabase
                .from("consent_records")
                .insert(
                    ConsentRow(
                        user_id: userId,
                        consent_type: Self.consentType,
                        granted: granted,
                        source: "profile_settings",
                        metadata: ["key": Self.key, "platform": "ios"]
                    ),
                    returning: .minimal
                )
                .execute()
        } catch {
            AppLogger.network.warning("Consent record failed: \(error.localizedDescription)")
        }
    }

    /// Forget the previous account's value on sign-out.
    func reset() {
        enabled = nil
    }
}
