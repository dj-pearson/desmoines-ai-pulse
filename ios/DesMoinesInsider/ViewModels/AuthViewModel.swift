import Foundation
import UIKit
import AuthenticationServices

/// ViewModel for authentication views (sign in, sign up).
@MainActor
@Observable
final class AuthViewModel {
    var email = ""
    var password = ""
    var confirmPassword = ""
    var firstName = ""
    var lastName = ""
    var selectedInterests: Set<String> = []

    var isSigningIn = false
    var isSigningUp = false
    var errorMessage: String?
    var showError = false
    var showVerificationAlert = false
    /// Neutral, non-error informational feedback (e.g. "reset email sent") so
    /// success messages aren't shown under the red "Sign In Error" alert
    /// (IOS-AUDIT-UX-017).
    var infoMessage: String?
    var showInfo = false

    // MARK: - Rate Limiting

    /// Seconds remaining until login is re-enabled (0 = not locked out).
    private(set) var lockoutSecondsRemaining = 0
    private var failedAttemptTimestamps: [Date] = []
    private var lockoutTimer: Task<Void, Never>?
    private static let maxAttempts = 5
    private static let attemptWindow: TimeInterval = 300 // 5 minutes
    private static let lockoutDuration = 60 // seconds

    var isLockedOut: Bool { lockoutSecondsRemaining > 0 }

    private let auth = AuthService.shared

    var isAuthenticated: Bool { auth.isAuthenticated }
    var currentUser: UserProfile? { auth.currentProfile }

    // MARK: - Validation

    /// Returns true if the email has a valid format.
    var isEmailValid: Bool {
        guard !email.isEmpty else { return true } // don't show error on empty
        let pattern = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return email.range(of: pattern, options: .regularExpression) != nil
    }

    /// Password strength: .none (empty), .weak, .medium, .strong
    var passwordStrength: PasswordStrength {
        guard !password.isEmpty else { return .none }
        var score = 0
        if password.count >= 8 { score += 1 }
        if password.count >= 12 { score += 1 }
        if password.range(of: "[A-Z]", options: .regularExpression) != nil { score += 1 }
        if password.range(of: "[a-z]", options: .regularExpression) != nil { score += 1 }
        if password.range(of: "[0-9]", options: .regularExpression) != nil { score += 1 }
        if password.range(of: "[^A-Za-z0-9]", options: .regularExpression) != nil { score += 1 }

        switch score {
        case 0...2: return .weak
        case 3...4: return .medium
        default: return .strong
        }
    }

    var passwordsMatch: Bool {
        confirmPassword.isEmpty || password == confirmPassword
    }

    enum PasswordStrength: String {
        case none, weak, medium, strong

        var color: String {
            switch self {
            case .none: return "gray"
            case .weak: return "red"
            case .medium: return "orange"
            case .strong: return "green"
            }
        }
    }

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
        guard isEmailValid else {
            setError("Please enter a valid email address.")
            return
        }
        guard !isLockedOut else {
            setError("Too many attempts. Try again in \(lockoutSecondsRemaining) seconds.")
            return
        }

        isSigningIn = true
        errorMessage = nil

        do {
            try await auth.signIn(email: email, password: password)
            failedAttemptTimestamps = []
            clearForm()
        } catch {
            recordFailedAttempt()
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
        guard isEmailValid else {
            setError("Please enter a valid email address.")
            return
        }
        guard password.count >= 8 else {
            setError("Password must be at least 8 characters.")
            return
        }
        guard passwordStrength != .weak else {
            setError("Password is too weak. Include uppercase, lowercase, and numbers.")
            return
        }
        guard passwordsMatch else {
            setError("Passwords do not match.")
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
            setInfo("Password reset email sent. Check your inbox.")
        } catch {
            setError(error.localizedDescription)
        }
    }

    // MARK: - Helpers

    private func clearForm() {
        email = ""
        password = ""
        confirmPassword = ""
        firstName = ""
        lastName = ""
        selectedInterests = []
    }

    private func setError(_ message: String) {
        errorMessage = message
        showError = true
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }

    /// Neutral success/info feedback — distinct from setError so it isn't shown
    /// as a "Sign In Error" with an error haptic (IOS-AUDIT-UX-017).
    private func setInfo(_ message: String) {
        infoMessage = message
        showInfo = true
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    // MARK: - Rate Limiting

    private func recordFailedAttempt() {
        let now = Date()
        failedAttemptTimestamps.append(now)

        // Remove attempts outside the window
        failedAttemptTimestamps = failedAttemptTimestamps.filter {
            now.timeIntervalSince($0) < Self.attemptWindow
        }

        if failedAttemptTimestamps.count >= Self.maxAttempts {
            startLockout()
        }
    }

    private func startLockout() {
        lockoutSecondsRemaining = Self.lockoutDuration
        lockoutTimer?.cancel()
        lockoutTimer = Task {
            while lockoutSecondsRemaining > 0 {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                lockoutSecondsRemaining -= 1
            }
            failedAttemptTimestamps = []
        }
    }
}
