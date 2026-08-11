import Foundation

// MARK: - XPLAT-001 / IOS-AUDIT-BUG-018 · Account deletion
//
// Single client for the `delete-user-account` edge function. Both entry points
// in the app (ProfileViewModel and SettingsView) route through here so the two
// can never drift on which contract they speak — they did, and the drift is
// what broke deletion on every shipped binary.
//
// The function takes two steps (SEC-025):
//   1. POST { action: "request" }  -> { confirmation_token, expires_at }
//   2. POST { action: "confirm", confirmation_token } -> { success: true }
//
// The token exists so the server has proof of intent rather than trusting a
// bare authenticated POST. It is short-lived (15 minutes) and this app confirms
// immediately, since the user already passed an in-app confirmation dialog.
//
// Apple requires in-app account deletion (App Store Review 5.1.1(v)), so a
// failure here is a review blocker, not a cosmetic bug.
@MainActor
final class AccountDeletionService {
    static let shared = AccountDeletionService()
    private init() {}

    enum DeletionError: LocalizedError {
        case notConfigured
        case noConfirmationToken
        case notConfirmed

        var errorDescription: String? {
            switch self {
            case .notConfigured:
                return "Supabase is not configured."
            case .noConfirmationToken:
                return "The server did not return a confirmation token. Please try again or contact privacy@desmoinesinsider.com."
            case .notConfirmed:
                return "Your account was not deleted. Please try again or contact privacy@desmoinesinsider.com."
            }
        }
    }

    private struct RequestPayload: Encodable {
        let action: String
    }

    private struct ConfirmPayload: Encodable {
        let action: String
        let confirmationToken: String

        enum CodingKeys: String, CodingKey {
            case action
            case confirmationToken = "confirmation_token"
        }
    }

    private struct RequestResponse: Decodable {
        let confirmationToken: String?

        enum CodingKeys: String, CodingKey {
            case confirmationToken = "confirmation_token"
        }
    }

    private struct ConfirmResponse: Decodable {
        let success: Bool?
    }

    /// Permanently deletes the signed-in account. Throws on any failure; the
    /// caller is responsible for signing out only after this returns.
    func deleteAccount() async throws {
        guard let client = SupabaseService.shared.client else {
            throw DeletionError.notConfigured
        }

        let requested: RequestResponse = try await client.functions.invoke(
            "delete-user-account",
            options: .init(method: .post, body: RequestPayload(action: "request"))
        )

        guard let token = requested.confirmationToken, !token.isEmpty else {
            throw DeletionError.noConfirmationToken
        }

        let confirmed: ConfirmResponse = try await client.functions.invoke(
            "delete-user-account",
            options: .init(
                method: .post,
                body: ConfirmPayload(action: "confirm", confirmationToken: token)
            )
        )

        // The function only reports success after auth.users is gone. Treat
        // anything else as a failure rather than signing the user out of an
        // account that still exists.
        guard confirmed.success == true else {
            throw DeletionError.notConfirmed
        }
    }
}
