import Foundation
import Supabase

/// The signed-in user's "Account and activity emails" switch (WEB-LEGAL-012),
/// stored in `profiles.communication_preferences.email_notifications`.
///
/// lifecycle-classifier.ts derives `messagingAllowed` from that key, and the
/// onboarding drip, milestone, re-engagement and win-back agents all gate on
/// messagingAllowed. Settings' only email switch on iOS was "Weekly picks
/// email" (user_email_preferences.weekly_digest_enabled), which those agents
/// never read, so an iOS user had no way in the app to stop them. This is the
/// same key, and the same consent_records type, as the web's EmailStreams
/// "Account and activity emails" switch and Android's email toggle.
///
/// The opposite of `PersonalizationPreferenceService` on absence: every sender
/// tests `!== false`, so a missing key is consent and only the JSON boolean
/// `false` opts out. Reading it any other way would show "off" for an account
/// the senders still mail.
///
/// The bag is shared, so a write reads it first and sets this one key, and a
/// failed read refuses the write. Erasing a stored `false` would silently opt
/// the user back in.
@MainActor
@Observable
final class AccountEmailPreferenceService {
    static let shared = AccountEmailPreferenceService()

    /// The communication_preferences key the lifecycle classifier reads.
    nonisolated static let key = "email_notifications"
    /// The consent_records.consent_type the web logs this key under.
    nonisolated static let consentType = "marketing_email"

    /// nil until loaded (the Settings switch is disabled meanwhile).
    private(set) var enabled: Bool?

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    private init() {}

    // MARK: - Pure helpers (unit tested)

    /// Whether these emails may be sent. Only an explicit JSON boolean `false`
    /// opts out, matching the classifier's `email_notifications !== false`.
    /// A missing key, null, 0 and the string "false" all read as opted in,
    /// because that is what the senders do with them.
    nonisolated static func isOptedIn(_ bag: [String: Any]) -> Bool {
        guard let number = bag[key] as? NSNumber,
              CFGetTypeID(number) == CFBooleanGetTypeID() else { return true }
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
        guard let bag = PersonalizationPreferenceService.bag(from: response.data) else {
            throw PersonalizationPreferenceService.PreferenceError.unreadable
        }
        return bag
    }

    /// A failed read leaves `enabled` nil, so the switch stays disabled rather
    /// than showing a value the server may not hold.
    func load() async {
        guard let supabase,
              let userId = try? await supabase.auth.session.user.id.uuidString else {
            return
        }
        do {
            enabled = Self.isOptedIn(try await readBag(userId: userId))
        } catch {
            AppLogger.network.warning("Account email preference load failed: \(error.localizedDescription)")
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
    /// saved, so a failed insert is logged and not reported.
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
