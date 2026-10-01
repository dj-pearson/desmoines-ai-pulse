import Foundation

/// What went wrong with an auth call, as far as the UI cares (IOS-DD-ACCOUNT-06).
enum AuthFailure: Equatable {
    case emailNotConfirmed
    case invalidCredentials
    case rateLimited
    case network
    case other(String)
}

/// Turns Supabase auth errors into fixed copy.
///
/// Sign-in used to show `error.localizedDescription` as is, so an unconfirmed
/// account saw "Email not confirmed" with no way to resend, and that failure
/// also counted toward the local lockout. Pure so the table can be tested
/// without the SDK: it matches on the error's text, which carries the GoTrue
/// `error_code` (`email_not_confirmed`) in `String(describing:)` and the
/// human message in `localizedDescription`.
enum AuthErrorMapper {
    enum Mode { case signIn, signUp, reset }

    static func classify(_ error: Error) -> AuthFailure {
        if error is URLError || (error as NSError).domain == NSURLErrorDomain {
            return .network
        }
        let text = (String(describing: error) + " " + error.localizedDescription).lowercased()
        if text.contains("email_not_confirmed") || text.contains("email not confirmed") {
            return .emailNotConfirmed
        }
        if text.contains("invalid_credentials") || text.contains("invalid login credentials") {
            return .invalidCredentials
        }
        if text.contains("over_request_rate_limit")
            || text.contains("over_email_send_rate_limit")
            || text.contains("rate limit") {
            return .rateLimited
        }
        return .other(error.localizedDescription)
    }

    /// Fixed copy for every case except `.other`, which is the only path raw
    /// server text still reaches the user by.
    static func message(for failure: AuthFailure, mode: Mode) -> String {
        switch failure {
        case .emailNotConfirmed:
            return mode == .signUp
                ? "Check your inbox for the confirmation link."
                : "Confirm your email first. We can send the link again."
        case .invalidCredentials:
            return "Email or password is incorrect."
        case .rateLimited:
            return "Too many attempts. Wait a minute and try again."
        case .network:
            return "Couldn't reach Des Moines Insider. Check your connection and try again."
        case .other(let text):
            return text
        }
    }
}
