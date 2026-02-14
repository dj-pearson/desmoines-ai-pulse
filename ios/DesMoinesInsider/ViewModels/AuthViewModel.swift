import Foundation
import AuthenticationServices

/// ViewModel for authentication views (sign in, sign up).
@MainActor
@Observable
final class AuthViewModel {
    var email = ""
    var password = ""
    var firstName = ""
    var lastName = ""
    var selectedInterests: Set<String> = []

    var isSigningIn = false
    var isSigningUp = false
    var errorMessage: String?
    var showError = false
    var showVerificationAlert = false

    private let auth = AuthService.shared

    var isAuthenticated: Bool { auth.isAuthenticated }
    var currentUser: UserProfile? { auth.currentProfile }

    // MARK: - Available Interests

    static let availableInterests = [
        "Food", "Music", "Sports", "Arts",
        "Nightlife", "Outdoor", "Family", "Business"
    ]

    // MARK: - Sign In

    func signIn() async {
        guard !email.isEmpty, !password.isEmpty else {
            setError("Please enter your email and password.")
            return
        }

        isSigningIn = true
        errorMessage = nil

        do {
            try await auth.signIn(email: email, password: password)
            clearForm()
        } catch {
            setError(error.localizedDescription)
        }

        isSigningIn = false
    }

    // MARK: - Sign Up

    func signUp() async {
        guard !email.isEmpty, !password.isEmpty else {
            setError("Please enter your email and password.")
            return
        }
        guard password.count >= 8 else {
            setError("Password must be at least 8 characters.")
            return
        }

        isSigningUp = true
        errorMessage = nil

        do {
            try await auth.signUp(
                email: email,
                password: password,
                firstName: firstName.isEmpty ? nil : firstName,
                lastName: lastName.isEmpty ? nil : lastName,
                interests: selectedInterests.isEmpty ? nil : Array(selectedInterests)
            )
            showVerificationAlert = true
            clearForm()
        } catch {
            setError(error.localizedDescription)
        }

        isSigningUp = false
    }

    // MARK: - Apple Sign-In

    func handleAppleSignIn(result: Result<ASAuthorization, Error>) async {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
                setError("Invalid Apple credentials.")
                return
            }
            do {
                try await auth.signInWithApple(credential: credential)
            } catch {
                setError(error.localizedDescription)
            }
        case .failure(let error):
            if (error as NSError).code != ASAuthorizationError.canceled.rawValue {
                setError(error.localizedDescription)
            }
        }
    }

    // MARK: - Sign Out

    func signOut() async {
        do {
            try await auth.signOut()
        } catch {
            setError(error.localizedDescription)
        }
    }

    // MARK: - Reset Password

    func resetPassword() async {
        guard !email.isEmpty else {
            setError("Please enter your email address.")
            return
        }
        do {
            try await auth.resetPassword(email: email)
            setError("Password reset email sent. Check your inbox.")
        } catch {
            setError(error.localizedDescription)
        }
    }

    // MARK: - Helpers

    private func clearForm() {
        email = ""
        password = ""
        firstName = ""
        lastName = ""
        selectedInterests = []
    }

    private func setError(_ message: String) {
        errorMessage = message
        showError = true
    }
}
