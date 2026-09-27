import Foundation
import Supabase

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
        /// The function refused with a reason of its own (IOS-DD-ACCOUNT-08).
        /// `message` is the server's `error` text, which for the billing
        /// refusals is written for the user ("We could not read your
        /// subscription, so the account was not deleted...").
        case server(status: Int, code: String?, message: String)

        var errorDescription: String? {
            switch self {
            case .notConfigured:
                return "Supabase is not configured."
            case .noConfirmationToken:
                return "The server did not return a confirmation token. Please try again or contact privacy@desmoinesinsider.com."
            case .notConfirmed:
                return "Your account was not deleted. Please try again or contact privacy@desmoinesinsider.com."
            case .server(_, _, let message):
                return message
            }
        }

        /// BILLING_TEARDOWN_FAILED (409): the web subscription could not be
        /// cancelled and is still live, so a retry cannot help until it is
        /// dealt with. The alert offers Manage Subscription instead of Try
        /// Again. SUBSCRIPTION_LOOKUP_FAILED (503) is a transient read
        /// failure whose own message says "Please try again", so it keeps
        /// Try Again.
        var offersManageSubscription: Bool {
            guard case .server(_, let code, _) = self else { return false }
            return code == "BILLING_TEARDOWN_FAILED"
        }
    }

    /// A store subscription the server could not cancel for the user
    /// (App Store / Play): it keeps billing after the account is gone.
    struct StoreSubscription: Decodable, Equatable {
        let platform: String
        let manageUrl: String?
    }

    /// Said in both confirmation alerts and after a deletion that left a
    /// store subscription running (IOS-DD-ACCOUNT-08).
    static let storeSubscriptionNotice =
        "Your Insider subscription is billed by Apple and is not cancelled when you delete your account."

    /// Body of both "Delete Account?" alerts.
    static func confirmationMessage(hasAppStoreSubscription: Bool) -> String {
        let base = "This will permanently delete your account, favorites, and all associated data. This action cannot be undone."
        return hasAppStoreSubscription ? base + " " + storeSubscriptionNotice : base
    }

    /// The post-deletion notice for what the server reported still billing.
    static func notice(for subscriptions: [StoreSubscription]) -> String? {
        guard !subscriptions.isEmpty else { return nil }
        if subscriptions.contains(where: { $0.platform.lowercased() == "ios" }) {
            return storeSubscriptionNotice
        }
        return "Your subscription is billed by the store you bought it from and is not cancelled when you delete your account."
    }

    struct DeletionResult {
        let storeSubscriptionsStillActive: [StoreSubscription]
    }

    private struct FailureBody: Decodable {
        let error: String?
        let code: String?
    }

    /// Reads `{error, code}` from a non-2xx body. A body that will not decode,
    /// or has no message, falls back to the generic "not deleted" copy.
    static func decodeFailure(status: Int, data: Data) -> DeletionError {
        guard let body = try? JSONDecoder().decode(FailureBody.self, from: data),
              let message = body.error?.trimmingCharacters(in: .whitespacesAndNewlines),
              !message.isEmpty else {
            return .notConfirmed
        }
        return .server(status: status, code: body.code, message: message)
    }

    /// Runs one invoke, turning a FunctionsError.httpError into a
    /// DeletionError that carries the server's own reason. Both call sites
    /// used to show "Edge Function returned a non-2xx status code: 409".
    private func invoke<Response: Decodable, Body: Encodable>(
        _ client: SupabaseClient,
        body: Body
    ) async throws -> Response {
        do {
            return try await client.functions.invoke(
                "delete-user-account",
                options: .init(method: .post, body: body)
            )
        } catch FunctionsError.httpError(let code, let data) {
            throw Self.decodeFailure(status: code, data: data)
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

    struct ConfirmResponse: Decodable {
        let success: Bool?
        let complete: Bool?
        let storeSubscriptionsStillActive: [StoreSubscription]?

        enum CodingKeys: String, CodingKey {
            case success, complete
            case storeSubscriptionsStillActive = "store_subscriptions_still_active"
        }
    }

    /// Permanently deletes the signed-in account. Throws on any failure; the
    /// caller is responsible for signing out only after this returns.
    @discardableResult
    func deleteAccount() async throws -> DeletionResult {
        guard let client = SupabaseService.shared.client else {
            throw DeletionError.notConfigured
        }

        let requested: RequestResponse = try await invoke(client, body: RequestPayload(action: "request"))

        guard let token = requested.confirmationToken, !token.isEmpty else {
            throw DeletionError.noConfirmationToken
        }

        let confirmed: ConfirmResponse = try await invoke(
            client,
            body: ConfirmPayload(action: "confirm", confirmationToken: token)
        )

        // The function only reports success after auth.users is gone. Treat
        // anything else as a failure rather than signing the user out of an
        // account that still exists.
        guard confirmed.success == true else {
            throw DeletionError.notConfirmed
        }
        return DeletionResult(
            storeSubscriptionsStillActive: confirmed.storeSubscriptionsStillActive ?? []
        )
    }

    /// Deletes the account and tears the local session down.
    ///
    /// The sign-out is BEST EFFORT on purpose (IOS-AUDIT-BUG-018 AC2). Once the
    /// server reports the account gone it is gone, so a failing sign-out must not
    /// be reported as a failed deletion - which is exactly what both call sites
    /// used to do: `try await deleteAccount(); try await auth.signOut()` inside
    /// one do/catch, so a network blip on the second line told the user their
    /// deletion had failed, and in SettingsView also skipped the dismiss, leaving
    /// them on a settings screen for an account that no longer exists.
    ///
    /// Discarding the sign-out error is safe because AuthService.signOut purges
    /// local user state in a `defer` regardless of whether the network call
    /// throws, so the session, keychain, favorites and caches are cleared either
    /// way. What is discarded is the REPORT, not the teardown.
    @discardableResult
    func deleteAccountAndSignOut() async throws -> DeletionResult {
        let result = try await deleteAccount()
        try? await AuthService.shared.signOut()
        return result
    }

    /// Re-authentication before an irreversible delete (IOS-DD-ACCOUNT-08).
    /// Face ID / Touch ID with passcode fallback. Returns false only when the
    /// user cancelled or failed; a device with no passcode at all has nothing
    /// to check against, so it proceeds (the in-app confirmation still ran).
    static func confirmIdentity() async -> Bool {
        // evaluate's default policy is .deviceOwnerAuthentication.
        let outcome = await BiometricAuthService.shared.evaluate(
            reason: "Confirm it's you to delete your account"
        )
        switch outcome {
        case .success, .unavailable: return true
        case .cancelled, .failed: return false
        }
    }
}
