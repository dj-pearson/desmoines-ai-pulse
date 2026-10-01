import Foundation
import Supabase

/// The signed-in user's weekly-digest preference, in
/// `user_email_preferences.weekly_digest_enabled` (IOS-DD-ACCOUNT-10).
///
/// Settings' "Email Communications" switch used to write a UserDefaults key
/// that nothing on the server read, so turning it off on iOS never stopped the
/// Sunday email and turning it on never started it. This is the same row the
/// web's Settings switch and handle_new_user write (UNIQUE(user_id), owner
/// select/insert/update RLS in 20251110000005).
@MainActor
@Observable
final class EmailPreferencesService {
    static let shared = EmailPreferencesService()

    /// nil until loaded (the Settings switch is disabled meanwhile).
    private(set) var weeklyDigestEnabled: Bool?

    private let supabase: SupabaseClient? = SupabaseService.shared.client

    private init() {}

    private struct Row: Decodable {
        let weekly_digest_enabled: Bool?
    }

    private struct UpsertRow: Encodable {
        let user_id: String
        let weekly_digest_enabled: Bool
    }

    /// No row means no digest: get_weekly_digest_recipients selects only users
    /// WITH a row whose flag is true, so a missing row reads as false even
    /// though the column default is true.
    nonisolated static func decode(_ data: Data) -> Bool {
        guard let rows = try? JSONDecoder().decode([Row].self, from: data) else { return false }
        return rows.first?.weekly_digest_enabled ?? false
    }

    func load() async {
        guard let supabase,
              let userId = try? await supabase.auth.session.user.id.uuidString else {
            return
        }
        do {
            let response = try await supabase
                .from("user_email_preferences")
                .select("weekly_digest_enabled")
                .eq("user_id", value: userId)
                .limit(1)
                .execute()
            weeklyDigestEnabled = Self.decode(response.data)
        } catch {
            AppLogger.network.warning("Email preferences load failed: \(error.localizedDescription)")
        }
    }

    /// Optimistic: the switch moves at once and rolls back if the write fails.
    func setWeeklyDigest(_ on: Bool) async throws {
        guard let supabase else { throw AuthService.AuthError.notConfigured }
        guard let userId = try? await supabase.auth.session.user.id.uuidString else {
            throw AuthService.AuthError.noUser
        }
        let previous = weeklyDigestEnabled
        weeklyDigestEnabled = on
        do {
            try await supabase
                .from("user_email_preferences")
                .upsert(UpsertRow(user_id: userId, weekly_digest_enabled: on), onConflict: "user_id", returning: .minimal)
                .execute()
            ConsentService.shared.emailConsent = on
        } catch {
            weeklyDigestEnabled = previous
            throw error
        }
    }

    /// Forget the previous account's value on sign-out.
    func reset() {
        weeklyDigestEnabled = nil
    }
}
