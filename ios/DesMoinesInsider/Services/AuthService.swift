import Foundation
import Supabase
import AuthenticationServices

/// Handles authentication flows matching the web app's AuthContext.
/// Supports email/password, Apple Sign-In, and session management.
@MainActor
@Observable
final class AuthService {
    static let shared = AuthService()

    private(set) var currentUser: User?
    private(set) var currentProfile: UserProfile?
    private(set) var isAuthenticated = false
    private(set) var isAdmin = false
    private(set) var isLoading = true

    private var authListener: Task<Void, Never>?
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
                    }
                case .signedOut:
                    self.currentUser = nil
                    self.currentProfile = nil
                    self.isAuthenticated = false
                    self.isAdmin = false
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
        try await supabase.auth.signOut()
        currentUser = nil
        currentProfile = nil
        isAuthenticated = false
        isAdmin = false
    }

    func resetPassword(email: String) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        try await supabase.auth.resetPasswordForEmail(email)
    }

    // MARK: - Apple Sign-In

    func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws {
        guard let supabase else { throw AuthError.notConfigured }
        guard let identityToken = credential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            throw AuthError.invalidToken
        }

        let session = try await supabase.auth.signInWithIdToken(
            credentials: .init(provider: .apple, idToken: tokenString)
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
        case noUser
        case notConfigured

        var errorDescription: String? {
            switch self {
            case .invalidToken: return "Invalid authentication token."
            case .noUser: return "No user session found."
            case .notConfigured: return "Supabase is not configured. Please contact support."
            }
        }
    }
}
