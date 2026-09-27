import Foundation
import CryptoKit
import Supabase
import AuthenticationServices

/// Handles authentication flows. Supports email/password, Apple Sign-In and
/// session management.
///
/// DOES NOT MATCH the web app's AuthContext, which the first line used to
/// claim (XPLAT-003 AC4). Web offers Google as well; this file has no Google
/// Sign-In at all. The three clients offer DIFFERENT provider sets:
///
///   web      email + apple + google
///   Android  email + google
///   iOS      email + apple
///
/// Measured against auth.identities on 2026-08-23: 5 email-only, 3 apple-only,
/// 2 apple+google, 1 google-only. One user cannot reach their account here, and
/// three cannot reach theirs on Android. Both gaps are XPLAT-003.
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

    /// Set when a cold launch found an admin session already past its
    /// timeout and signed it out (IOS-DD-ACCOUNT-02). The app shell shows it
    /// in the "Signed Out" alert and clears it.
    var launchSignOutMessage: String?

    /// True while the user arrived through a password-recovery link and has
    /// not chosen a new password yet (IOS-DD-ACCOUNT-07). Routes the app to
    /// SetNewPasswordView.
    private(set) var needsPasswordReset = false

    private static let pendingRecoveryKey = "pending_password_recovery_at"

    /// True when the signed-in user's email has not yet been confirmed.
    /// Apple Sign-In users are treated as verified (Apple pre-verifies the
    /// email before returning it to us).
    var needsEmailVerification: Bool {
        guard let user = currentUser else { return false }
        return Self.needsEmailVerification(
            emailConfirmedAt: user.emailConfirmedAt,
            primaryProvider: primaryProvider(for: user)
        )
    }

    /// The decision above with the Supabase `User` removed, so it can be
    /// tested (IOS-AUDIT-TEST-002). `User` is `private(set)` and not
    /// constructible here, which is why the Apple carve-out went unasserted --
    /// and getting it wrong strands every Apple user on the verify-email screen
    /// with no way off, since Apple never sends them a confirmation mail.
    static func needsEmailVerification(emailConfirmedAt: Date?, primaryProvider: String?) -> Bool {
        if emailConfirmedAt != nil { return false }
        return primaryProvider != "apple"
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
                case .initialSession, .signedIn, .tokenRefreshed, .passwordRecovery:
                    // An admin session that timed out while the app was closed
                    // is signed out BEFORE any authenticated UI renders. This
                    // used to run in the app's launch .task, which raced this
                    // listener and usually read timestamps it had just reset
                    // (IOS-DD-ACCOUNT-02).
                    if event == .initialSession, session?.user != nil,
                       SessionTimeoutService.shared.expireIfStaleOnLaunch() {
                        try? await self.signOut()
                        self.launchSignOutMessage = "Your session expired while the app was closed. Please sign in again."
                        self.isLoading = false
                        continue
                    }
                    self.currentUser = session?.user
                    self.isAuthenticated = session?.user != nil
                    if event == .passwordRecovery {
                        // Implicit-flow recovery links say so. PKCE links arrive
                        // as .signedIn and are caught by noteAuthCallback.
                        self.needsPasswordReset = true
                    }
                    if let userId = session?.user.id.uuidString {
                        await self.fetchProfile(userId: userId)
                        await self.checkAdminRole(userId: userId)
                        // Admin-only timeouts. Only a real sign-in starts a new
                        // absolute clock; a launch keeps the persisted one and a
                        // token refresh only re-applies the role
                        // (IOS-DD-ACCOUNT-02).
                        switch event {
                        case .signedIn, .passwordRecovery:
                            SessionTimeoutService.shared.startTracking(isAdmin: self.isAdmin, resetClock: true)
                        case .initialSession:
                            SessionTimeoutService.shared.startTracking(isAdmin: self.isAdmin, resetClock: false)
                        default:
                            SessionTimeoutService.shared.updateRole(isAdmin: self.isAdmin)
                        }
                        // Re-resolve the backend tier so a fresh sign-in (or a
                        // sign-in to a different account in the same session)
                        // immediately reflects the new account's entitlements.
                        await StoreKitService.shared.refreshBackendTier()
                        // A purchase made signed-out, or whose sync failed,
                        // reaches the account now (IOS-DD-MONETIZATION-04).
                        // Once per user per launch, never a transfer, and not
                        // awaited so launch does not wait on Apple.
                        if event == .signedIn || event == .initialSession {
                            Task { await StoreKitService.shared.syncEntitlementsAfterSignIn(userId: userId) }
                        }
                        // Hearts were empty after an in-app sign-in until the
                        // Saved tab or Dashboard opened, and a tap could insert
                        // a duplicate (IOS-DD-SAVED-21). Only on a real sign-in:
                        // launch (.initialSession) is loaded by the app file,
                        // and token refreshes change nothing. Not awaited, so
                        // `isLoading` below does not wait on four more queries.
                        if event == .signedIn {
                            Task { await FavoritesService.shared.loadFavorites() }
                            // Onboarding picks and a pre-sign-in email opt-in
                            // reach the account (IOS-DD-ACCOUNT-04 / -10).
                            await self.syncOnboardingInterestsIfNeeded()
                            Task { await self.syncEmailConsentIfNeeded(userId: userId) }
                        }
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
                    // A server-initiated sign-out (revoked session, expiry)
                    // never went through signOut(), so the next account
                    // inherited favorites, history and caches
                    // (IOS-DD-SAVED-20). Idempotent with signOut's own call.
                    self.purgeLocalUserState()
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
        // Signing in with a password proves the user knows it, so a recovery
        // flag left by a link that never completed must not route them to
        // "choose a new password" (IOS-DD-ACCOUNT-07).
        needsPasswordReset = false
        // And a marker left by that request must not turn the next auth
        // callback within the hour (Google, an email confirmation) into a
        // "choose a new password" screen.
        UserDefaults.standard.removeObject(forKey: Self.pendingRecoveryKey)
    }

    /// What the sign-up screen should say next (IOS-DD-ACCOUNT-01).
    enum SignUpOutcome: Equatable {
        /// A session came back (email confirmation is off): the user is in.
        case signedIn
        /// No session: a confirmation mail is on its way. A reused address
        /// also lands here (Supabase answers it with a user that has no
        /// identities and no session), so the screen reads the same for a new
        /// and an existing address and does not reveal which it was.
        case checkInbox
    }

    /// Creates the account. The profile row, interests and the email opt-in
    /// are written by the `handle_new_user` trigger from the metadata sent
    /// here (20261004000001), in the same transaction as the auth user.
    ///
    /// This used to insert the profile itself afterwards. The trigger had
    /// already made the row and `user_id` is UNIQUE, so that insert failed
    /// (23505 with a session, RLS as anon without one) and every email
    /// sign-up showed an error for an account that had just been created
    /// (IOS-DD-ACCOUNT-01).
    func signUp(
        email: String,
        password: String,
        firstName: String?,
        lastName: String?,
        interests: [String],
        emailOptIn: Bool
    ) async throws -> SignUpOutcome {
        guard let supabase else { throw AuthError.notConfigured }
        var data: [String: AnyJSON] = [
            "first_name": firstName.map { .string($0) } ?? .null,
            "last_name": lastName.map { .string($0) } ?? .null,
            // record_signup_consent and the digest seed both read this key.
            "consent": .object(["email_marketing_consent": .bool(emailOptIn)]),
        ]
        let ids = InterestCatalog.normalize(interests)
        if !ids.isEmpty {
            data["interests"] = .array(ids.map { AnyJSON.string($0) })
        }
        let response = try await supabase.auth.signUp(
            email: email,
            password: password,
            data: data
        )
        guard let session = response.session else { return .checkInbox }
        currentUser = session.user
        isAuthenticated = true
        return .signedIn
    }

    /// Resends the sign-up confirmation to an address typed on the sign-in
    /// screen (no session exists yet, so resendVerificationEmail cannot be
    /// used). GoTrue answers the same whether or not the address exists.
    func resend(email: String) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        try await supabase.auth.resend(email: email, type: .signup)
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
            needsPasswordReset = false
            UserDefaults.standard.removeObject(forKey: Self.pendingRecoveryKey)

            // BiometricAuthService.reset() reads its Keychain entry to disable —
            // run it BEFORE KeychainService.deleteAll() so the log line is accurate.
            BiometricAuthService.shared.reset()

            SessionTimeoutService.shared.stopTracking()
            purgeLocalUserState()

            // Keychain wipe is last so any service that needs to read its own
            // tokens during cleanup (e.g. session tracking timestamps) has a chance.
            KeychainService.shared.deleteAll()
        }

        try await supabase.auth.signOut()
    }

    /// Clears what the signed-in user left on the device: in-memory favorites
    /// and the guest favorites store, search history, the Dashboard "Jump back
    /// in" rail (so the next person on a shared device can't see what the
    /// previous user browsed), Spotlight and the query cache. Called from
    /// signOut() and from the `.signedOut` listener event (IOS-DD-SAVED-20).
    private func purgeLocalUserState() {
        FavoritesService.shared.reset()
        RecentlyViewedService.shared.clear()
        SearchHistoryService.shared.clearAll()
        // The next account on this device must not see the previous one's
        // saved search names and queries, or have its quota counted against
        // them (IOS-DD-SEARCH-12).
        SavedSearchesViewModel.shared.reset()
        EmailPreferencesService.shared.reset()
        // Swipe history and the unsent swipe queue. reset() was documented as
        // the sign-out hook and nothing called it, so the next account on the
        // device inherited the deck history and uploaded the previous user's
        // queued swipes under its own id (IOS-DD-DISCOVER-09).
        SwipeInteractionService.shared.reset()
        // Spotlight + QueryCache are actor-isolated; fire-and-forget detached tasks.
        Task.detached {
            await SpotlightService.shared.removeAllItems()
            await QueryCache.shared.clearAll()
        }
    }

    func resetPassword(email: String) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        try await supabase.auth.resetPasswordForEmail(email)
        // Under PKCE the recovery link comes back as an ordinary
        // `<bundle>://auth-callback?code=` URL and the SDK emits .signedIn, not
        // .passwordRecovery, so remember that a reset is pending and recognise
        // the callback in noteAuthCallback (IOS-DD-ACCOUNT-07).
        UserDefaults.standard.set(Date(), forKey: Self.pendingRecoveryKey)
    }

    /// Called from onOpenURL BEFORE the SDK handles the URL.
    func noteAuthCallback(_ url: URL) {
        let markedAt = UserDefaults.standard.object(forKey: Self.pendingRecoveryKey) as? Date
        guard Self.isRecoveryCallback(url: url, markedAt: markedAt, now: Date()) else { return }
        needsPasswordReset = true
        UserDefaults.standard.removeObject(forKey: Self.pendingRecoveryKey)
    }

    /// An auth callback within an hour of requesting a reset (the link's own
    /// lifetime) is treated as the recovery link.
    static func isRecoveryCallback(url: URL, markedAt: Date?, now: Date) -> Bool {
        guard url.absoluteString.contains("auth-callback"), let markedAt else { return false }
        let age = now.timeIntervalSince(markedAt)
        return age >= 0 && age < 60 * 60
    }

    /// Sets a new password for the signed-in (recovery) session.
    func updatePassword(_ newPassword: String) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        _ = try await supabase.auth.update(user: UserAttributes(password: newPassword))
        needsPasswordReset = false
    }

    /// "Not now" on the set-password screen. The recovery session is already
    /// a full session, so the user simply carries on signed in.
    func dismissPasswordReset() {
        needsPasswordReset = false
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

    /// Generates a random 32-character nonce drawn uniformly from a 65-character
    /// URL-safe alphabet.
    ///
    /// REJECTION SAMPLING, NOT `% charset.count`. The alphabet holds 65
    /// characters and 256 is not a multiple of 65, so folding a uniform byte
    /// with `%` gives the first 61 characters a 4/256 chance and the last four -
    /// 'z', '-', '.', '_' - only 3/256, a 1.33x skew. Apple's own sample avoids
    /// this by DISCARDING bytes above the largest usable multiple rather than
    /// folding them; the version that fixed the missing 'W' folded them instead.
    /// Same species of defect as the one this routine is named for
    /// (IOS-AUDIT-SEC-015): the security cost is negligible because the result
    /// is SHA-256 hashed and still carries ~190 bits, but a nonce generator that
    /// is not uniform is wrong in the way that invites downstream assumptions.
    ///
    /// The docstring here previously said "(URL-safe base64)". It is not base64:
    /// base64url is 64 characters and has no '.', while this alphabet has 65.
    private func randomNonceString(length: Int = 32) -> String {
        // Full A-Z (an earlier literal skipped 'W' between V and X) - IOS-AUDIT-SEC-015.
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        // Largest byte that keeps the mapping uniform: (256 / 65) * 65 - 1 = 194.
        let maxUnbiased = UInt8((256 / charset.count) * charset.count - 1)

        var result: [Character] = []
        result.reserveCapacity(length)
        while result.count < length {
            var randomBytes = [UInt8](repeating: 0, count: length)
            let status = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
            precondition(status == errSecSuccess, "Failed to generate random bytes")
            for byte in randomBytes where byte <= maxUnbiased {
                if result.count == length { break }
                result.append(charset[Int(byte) % charset.count])
            }
        }
        return String(result)
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

    /// Makes sure the profile row exists. handle_new_user creates it for
    /// every account made since the trigger landed; this covers older
    /// accounts, and does nothing when the row is there (ON CONFLICT DO
    /// NOTHING). Mirrors src/hooks/useProfile.ts.
    private func ensureProfileRow(userId: String) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        struct ProfileSeed: Encodable {
            let user_id: String
            let email: String?
        }
        try await supabase
            .from("profiles")
            .upsert(
                ProfileSeed(user_id: userId, email: currentUser?.email),
                onConflict: "user_id",
                returning: .minimal,
                ignoreDuplicates: true
            )
            .execute()
    }

    func updateProfile(firstName: String?, lastName: String?, phone: String?, location: String?, interests: [String]) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        guard let userId = currentUser?.id.uuidString else { return }

        if currentProfile == nil {
            try await ensureProfileRow(userId: userId)
        }

        try await supabase
            .from("profiles")
            .update(ProfileUpdate(
                first_name: firstName,
                last_name: lastName,
                phone: phone,
                location: location,
                interests: InterestCatalog.normalize(interests)
            ))
            .eq("user_id", value: userId)
            .execute()

        await fetchProfile(userId: userId)
    }

    /// PATCHes `interests` only (IOS-DD-ACCOUNT-04).
    func updateInterests(_ ids: [String]) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        guard let userId = currentUser?.id.uuidString else { return }
        struct InterestsPatch: Encodable { let interests: [String] }

        if currentProfile == nil {
            try await ensureProfileRow(userId: userId)
        }
        try await supabase
            .from("profiles")
            .update(InterestsPatch(interests: InterestCatalog.normalize(ids)))
            .eq("user_id", value: userId)
            .execute()
        await fetchProfile(userId: userId)
    }

    /// Copies the interests picked in onboarding to a profile that has none.
    /// Only when the profile was actually fetched: a failed fetch leaves
    /// `currentProfile` nil, and treating that as "no interests" would
    /// overwrite interests chosen on the web.
    private func syncOnboardingInterestsIfNeeded() async {
        guard let profile = currentProfile,
              InterestCatalog.normalize(profile.interests).isEmpty else { return }
        let local = InterestPreferences.shared.local
        guard !local.isEmpty else { return }
        do {
            try await updateInterests(local)
        } catch {
            AppLogger.auth.warning("Could not copy onboarding interests to the profile")
        }
    }

    /// An email opt-in given on the consent screen before signing in is
    /// written to the digest preference once per account (IOS-DD-ACCOUNT-10).
    /// Once, so turning the digest off on the web is not undone by the next
    /// sign-in here.
    private func syncEmailConsentIfNeeded(userId: String) async {
        let consent = ConsentService.shared
        guard consent.hasCompletedConsent, consent.emailConsent else { return }
        let marker = "email_consent_synced_v1.\(userId)"
        guard !UserDefaults.standard.bool(forKey: marker) else { return }
        do {
            try await EmailPreferencesService.shared.setWeeklyDigest(true)
            UserDefaults.standard.set(true, forKey: marker)
        } catch {
            AppLogger.auth.warning("Could not sync email consent to the digest preference")
        }
    }

    // MARK: - Admin Check

    private func checkAdminRole(userId: String) async {
        guard let supabase else { return }
        // Check user_roles table first (matches web AuthContext pattern). A
        // user can hold several rows (20261005000001), and `.single()` failed
        // on those with PGRST116, falling through to the profile column
        // (IOS-DD-ACCOUNT-13).
        do {
            struct RoleRow: Decodable {
                let role: String
            }
            let rows: [RoleRow] = try await supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", value: userId)
                .execute()
                .value
            if !rows.isEmpty {
                isAdmin = Self.isAdmin(roles: rows.map(\.role))
                return
            }
        } catch {}

        // Fallback: check profiles table
        if let profile = currentProfile {
            isAdmin = profile.role == .admin || profile.role == .rootAdmin
        } else {
            isAdmin = false
        }
    }

    static func isAdmin(roles: [String]) -> Bool {
        roles.contains { $0 == "admin" || $0 == "root_admin" }
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

// MARK: - Injection seam

/// The slice of AuthService that AuthViewModel drives.
///
/// Added for IOS-AUDIT-TEST-002. AuthViewModel held `AuthService.shared`
/// directly, so its error routing could only be exercised by reaching the real
/// Supabase backend: no test could assert that a failed sign-in surfaces as an
/// error while a successful password reset surfaces as neutral INFO, which is
/// the exact distinction IOS-AUDIT-UX-017 introduced and the exact thing a
/// refactor would silently undo.
///
/// Deliberately narrow. It lists only what the view model calls, so adding a
/// method to AuthService does not oblige every fake to grow.
@MainActor
protocol AuthProviding: AnyObject {
    var isAuthenticated: Bool { get }
    var currentProfile: UserProfile? { get }

    func signIn(email: String, password: String) async throws
    func signUp(email: String, password: String, firstName: String?, lastName: String?, interests: [String], emailOptIn: Bool) async throws -> AuthService.SignUpOutcome
    func resend(email: String) async throws
    func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws
    func signOut() async throws
    func resetPassword(email: String) async throws
}

extension AuthService: AuthProviding {}

// MARK: - Profile PATCH body

/// The profile fields the app edits (IOS-DD-ACCOUNT-09).
///
/// Encodes EVERY key, nil as JSON null. The synthesized Encodable skips nil
/// keys, so a field the user cleared was simply left out of the PATCH and
/// the old value stayed on the server while the app said "Profile Updated".
/// Only these columns: the web writes the same set (useProfile.ts
/// WRITABLE_COLUMNS minus communication_preferences), and the server guards
/// the rest (20261010000001).
struct ProfileUpdate: Encodable {
    let first_name: String?
    let last_name: String?
    let phone: String?
    let location: String?
    let interests: [String]

    enum CodingKeys: String, CodingKey {
        case first_name, last_name, phone, location, interests
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(first_name, forKey: .first_name)
        try container.encode(last_name, forKey: .last_name)
        try container.encode(phone, forKey: .phone)
        try container.encode(location, forKey: .location)
        try container.encode(interests, forKey: .interests)
    }
}
