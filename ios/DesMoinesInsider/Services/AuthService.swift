import Foundation
import CryptoKit
import Supabase
import AuthenticationServices

/// Handles authentication flows matching the web app's AuthContext.
/// Supports email/password, Apple Sign-In, and session management.
@MainActor
@Observable
final class AuthService {
    static let shared = AuthService()

    /// The raw nonce generated for the current Apple Sign-In attempt.
    /// Must be set before presenting the ASAuthorizationController and sent
    /// alongside the id_token so Supabase can verify them together.
    private(set) var currentNonce: String?

    private(set) var currentUser: User?
    private(set) var currentProfile: UserProfile?
    private(set) var isAuthenticated = false
    private(set) var isAdmin = false
    private(set) var isLoading = true

    /// True when the signed-in user's email has not yet been confirmed.
    /// Apple Sign-In users are treated as verified (Apple pre-verifies the
    /// email before returning it to us).
    var needsEmailVerification: Bool {
        guard let user = currentUser else { return false }
        if user.emailConfirmedAt != nil { return false }
        return primaryProvider(for: user) != "apple"
    }

    private func primaryProvider(for user: User) -> String? {
        // Supabase sets app_metadata.provider to the primary sign-in provider.
        // Fallback: inspect identities[].provider if metadata is missing.
        if let meta = user.appMetadata["provider"], case .string(let provider) = meta {
            return provider
        }
        return user.identities?.first?.provider
    }

    /// Request a new verification email for the currently signed-in user.
    /// Matches Supabase `auth.resend` for the `signup` email type.
    func resendVerificationEmail() async throws {
        guard let supabase else { throw AuthError.notConfigured }
        guard let email = currentUser?.email else { throw AuthError.noUser }
        try await supabase.auth.resend(email: email, type: .signup)
    }

    /// Force-refresh the session from Supabase so a freshly-confirmed email is
    /// reflected (updated `emailConfirmedAt`) without waiting for a passive
    /// auth-state change — e.g. when the user verified on another device. Used
    /// by the verify-email screen's foreground/poll refresh (IOS-AUDIT-FEAT-020).
    /// Returns true when the refreshed user is verified.
    @discardableResult
    func refreshUser() async -> Bool {
        guard let supabase else { return false }
        do {
            let session = try await supabase.auth.refreshSession()
            currentUser = session.user
            isAuthenticated = true
        } catch {
            // Keep the existing session on failure (offline / transient).
            return false
        }
        return !needsEmailVerification
    }

    @ObservationIgnored private var authListener: Task<Void, Never>?
    private let supabase: SupabaseClient?

    private init() {
        supabase = SupabaseService.shared.client

        // In UI testing mode, skip the auth listener so the app loads instantly.
        // The Supabase client remains available for data fetching (events, restaurants).
        if Config.isUITesting {
            isLoading = false
        } else if supabase != nil {
            startAuthListener()
        } else {
            // No Supabase client — stop loading so the app can show the error UI
            isLoading = false
        }
    }

    deinit {
        authListener?.cancel()
    }

    // MARK: - Auth State Listener

    private func startAuthListener() {
        guard let supabase else { return }
        authListener = Task { [weak self] in
            guard let self else { return }
            for await (event, session) in supabase.auth.authStateChanges {
                switch event {
                case .initialSession, .signedIn, .tokenRefreshed:
                    self.currentUser = session?.user
                    self.isAuthenticated = session?.user != nil
                    if let userId = session?.user.id.uuidString {
                        await self.fetchProfile(userId: userId)
                        await self.checkAdminRole(userId: userId)
                        // Begin enforcing the documented idle/absolute timeouts.
                        // Restart on tokenRefreshed so admin-role changes apply.
                        SessionTimeoutService.shared.startTracking(isAdmin: self.isAdmin)
                        // Re-resolve the backend tier so a fresh sign-in (or a
                        // sign-in to a different account in the same session)
                        // immediately reflects the new account's entitlements.
                        await StoreKitService.shared.refreshBackendTier()
                    }
                case .signedOut:
                    self.currentUser = nil
                    self.currentProfile = nil
                    self.isAuthenticated = false
                    self.isAdmin = false
                    SessionTimeoutService.shared.stopTracking()
                    // Drop the cached backend tier so the next account never
                    // briefly inherits the previous account's entitlement.
                    StoreKitService.shared.clearBackendTier()
                default:
                    break
                }
                self.isLoading = false
            }
        }
    }

    // MARK: - Email/Password Auth

    func signIn(email: String, password: String) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        let session = try await supabase.auth.signIn(
            email: email,
            password: password
        )
        currentUser = session.user
        isAuthenticated = true
    }

    func signUp(email: String, password: String, firstName: String?, lastName: String?, interests: [String]?) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        let response = try await supabase.auth.signUp(
            email: email,
            password: password,
            data: [
                "first_name": firstName.map { .string($0) } ?? .null,
                "last_name": lastName.map { .string($0) } ?? .null,
            ]
        )

        // Create profile (response.user is non-optional in Supabase Swift SDK 2.x)
        let user = response.user
        try await createProfile(
            userId: user.id.uuidString,
            email: email,
            firstName: firstName,
            lastName: lastName,
            interests: interests
        )
    }

    func signOut() async throws {
        guard let supabase else { throw AuthError.notConfigured }

        // Always purge local user state, even if the network sign-out call fails.
        // Otherwise a user who hits "Sign out" on a flaky connection could be left
        // with stale favorites/cache visible to the next person on the device.
        defer {
            currentUser = nil
            currentProfile = nil
            isAuthenticated = false
            isAdmin = false

            // BiometricAuthService.reset() reads its Keychain entry to disable —
            // run it BEFORE KeychainService.deleteAll() so the log line is accurate.
            BiometricAuthService.shared.reset()

            SessionTimeoutService.shared.stopTracking()
            SearchHistoryService.shared.clearAll()
            FavoritesService.shared.reset()

            // Spotlight + QueryCache are actor-isolated; fire-and-forget detached tasks.
            Task.detached {
                await SpotlightService.shared.removeAllItems()
                await QueryCache.shared.clearAll()
            }

            // Keychain wipe is last so any service that needs to read its own
            // tokens during cleanup (e.g. session tracking timestamps) has a chance.
            KeychainService.shared.deleteAll()
        }

        try await supabase.auth.signOut()
    }

    func resetPassword(email: String) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        try await supabase.auth.resetPasswordForEmail(email)
    }

    // MARK: - Apple Sign-In Nonce

    /// Generates a cryptographically-random nonce for Apple Sign-In.
    /// Call this before presenting the ASAuthorizationController and set
    /// the SHA-256 hash on the request via `request.nonce`.
    func generateNonce() -> String {
        let nonce = randomNonceString()
        currentNonce = nonce
        return nonce
    }

    /// Returns the SHA-256 hash of the given string, hex-encoded.
    /// Used to set `request.nonce` on the Apple Sign-In request.
    static func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }

    /// Generates a random 32-byte nonce string (URL-safe base64).
    private func randomNonceString(length: Int = 32) -> String {
        var randomBytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        precondition(status == errSecSuccess, "Failed to generate random bytes")
        // Full A-Z (the previous literal skipped 'W' between V and X) — IOS-AUDIT-SEC-015.
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(randomBytes.map { charset[Int($0) % charset.count] })
    }

    // MARK: - Apple Sign-In

    func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        guard let identityToken = credential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            throw AuthError.invalidToken
        }
        guard let nonce = currentNonce else {
            throw AuthError.missingNonce
        }

        // Clear nonce immediately so it cannot be reused
        currentNonce = nil

        let session = try await supabase.auth.signInWithIdToken(
            credentials: .init(provider: .apple, idToken: tokenString, nonce: nonce)
        )
        currentUser = session.user
        isAuthenticated = true
    }

    // MARK: - Profile Management

    private func fetchProfile(userId: String) async {
        guard let supabase else { return }
        do {
            let profile: UserProfile = try await supabase
                .from("profiles")
                .select()
                .eq("user_id", value: userId)
                .single()
                .execute()
                .value
            currentProfile = profile
        } catch {
            // Profile may not exist yet — that's OK
            currentProfile = nil
        }
    }

    private func createProfile(userId: String, email: String, firstName: String?, lastName: String?, interests: [String]?) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        struct NewProfile: Encodable {
            let user_id: String
            let email: String
            let first_name: String?
            let last_name: String?
            let interests: [String]?
        }

        try await supabase
            .from("profiles")
            .insert(NewProfile(
                user_id: userId,
                email: email,
                first_name: firstName,
                last_name: lastName,
                interests: interests
            ))
            .execute()
    }

    func updateProfile(firstName: String?, lastName: String?, phone: String?, location: String?, interests: [String]?) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        guard let userId = currentUser?.id.uuidString else { return }

        // Ensure the profile row exists before updating
        if currentProfile == nil {
            try await createProfile(
                userId: userId,
                email: currentUser?.email ?? "",
                firstName: firstName,
                lastName: lastName,
                interests: interests
            )
        }

        struct ProfileUpdate: Encodable {
            let first_name: String?
            let last_name: String?
            let phone: String?
            let location: String?
            let interests: [String]?
        }

        try await supabase
            .from("profiles")
            .update(ProfileUpdate(
                first_name: firstName,
                last_name: lastName,
                phone: phone,
                location: location,
                interests: interests
            ))
            .eq("user_id", value: userId)
            .execute()

        await fetchProfile(userId: userId)
    }

    // MARK: - Admin Check

    private func checkAdminRole(userId: String) async {
        guard let supabase else { return }
        // Check user_roles table first (matches web AuthContext pattern)
        do {
            struct RoleRow: Decodable {
                let role: String
            }
            let row: RoleRow = try await supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", value: userId)
                .single()
                .execute()
                .value
            isAdmin = row.role == "admin" || row.role == "root_admin"
            return
        } catch {}

        // Fallback: check profiles table
        if let profile = currentProfile {
            isAdmin = profile.role == .admin || profile.role == .rootAdmin
        }
    }

    // MARK: - Error Types

    enum AuthError: LocalizedError {
        case invalidToken
        case missingNonce
        case noUser
        case notConfigured

        var errorDescription: String? {
            switch self {
            case .invalidToken: return "Invalid authentication token."
            case .missingNonce: return "Apple Sign-In failed. Please try again."
            case .noUser: return "No user session found."
            case .notConfigured: return "Supabase is not configured. Please contact support."
            }
        }
    }
}
