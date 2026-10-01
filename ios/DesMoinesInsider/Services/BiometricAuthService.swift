import Foundation
import LocalAuthentication
import os

/// Manages Face ID / Touch ID authentication for quick app unlock.
///
/// When enabled, the app prompts for biometric auth on launch if a valid
/// Supabase session exists. Falls back to email/password if biometric fails
/// or is unavailable.
@MainActor
@Observable
final class BiometricAuthService {
    static let shared = BiometricAuthService()

    /// Whether biometric auth is enabled by the user.
    private(set) var isEnabled: Bool

    /// Whether biometric auth is available on this device.
    private(set) var isAvailable = false

    /// The type of biometric available (Face ID, Touch ID, or none).
    private(set) var biometricType: LABiometryType = .none

    /// Human-readable name for the current biometric type.
    var biometricName: String {
        switch biometricType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        case .none: return "Biometrics"
        @unknown default: return "Biometrics"
        }
    }

    /// SF Symbol name for the current biometric type.
    var biometricIcon: String {
        switch biometricType {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .opticID: return "opticid"
        case .none: return "lock.shield"
        @unknown default: return "lock.shield"
        }
    }

    private static let keychainKey = "biometric_auth_enabled"

    private init() {
        // Read preference from Keychain (not UserDefaults, for security)
        isEnabled = KeychainService.shared.loadString(key: Self.keychainKey) == "true"
        checkAvailability()
    }

    // MARK: - Availability

    /// Checks whether biometric authentication is available on this device.
    func checkAvailability() {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)

        isAvailable = available
        biometricType = context.biometryType

        if !available {
            AppLogger.auth.debug("Biometric auth not available: \(error?.localizedDescription ?? "unknown")")
        }
    }

    // MARK: - Enable / Disable

    /// Enables biometric auth. Prompts the user for biometric verification first
    /// to confirm they can authenticate before enabling.
    func enable() async -> Bool {
        guard isAvailable else { return false }

        // Biometrics only here: enabling Face ID should prove Face ID works,
        // not that the passcode does.
        let success = await evaluate(
            reason: "Verify your identity to enable \(biometricName)",
            policy: .deviceOwnerAuthenticationWithBiometrics
        ) == .success
        if success {
            isEnabled = true
            KeychainService.shared.saveString(key: Self.keychainKey, value: "true")
            AppLogger.auth.info("Biometric auth enabled")
        }
        return success
    }

    /// Disables biometric auth.
    func disable() {
        isEnabled = false
        KeychainService.shared.delete(key: Self.keychainKey)
        AppLogger.auth.info("Biometric auth disabled")
    }

    // MARK: - Authenticate

    /// How an evaluation ended (IOS-DD-ACCOUNT-05). The lock screen used to
    /// count every `false` as a failed attempt, so dismissing the prompt twice
    /// and then failing once disabled the retry button.
    enum Outcome: Equatable {
        case success
        /// The user (or the system) dismissed the prompt.
        case cancelled
        /// A real failed match, or a lockout.
        case failed
        /// No biometrics and no passcode to fall back on.
        case unavailable
    }

    /// Only a real failed match counts toward the lock screen's retry limit.
    nonisolated static func countsAsFailure(_ outcome: Outcome) -> Bool {
        outcome == .failed
    }

    /// Evaluates `policy`. The default, `.deviceOwnerAuthentication`, falls
    /// back to the device passcode when Face ID fails or is locked out, so a
    /// user is never stranded behind a sensor that stopped recognising them.
    /// The old "Use Password" cancel button led nowhere: the app has no
    /// password prompt on the lock screen.
    func evaluate(reason: String? = nil, policy: LAPolicy = .deviceOwnerAuthentication) async -> Outcome {
        let context = LAContext()
        var probeError: NSError?
        guard context.canEvaluatePolicy(policy, error: &probeError) else {
            AppLogger.auth.debug("Device owner auth not available: \(probeError?.code ?? 0)")
            return .unavailable
        }

        let authReason = reason ?? "Unlock Des Moines Insider"

        do {
            let success = try await context.evaluatePolicy(policy, localizedReason: authReason)
            if success {
                AppLogger.auth.info("Device owner authentication succeeded")
            }
            return success ? .success : .failed
        } catch let error as LAError {
            switch error.code {
            case .userCancel, .appCancel, .systemCancel:
                AppLogger.auth.debug("Biometric auth cancelled by user/system")
                return .cancelled
            case .biometryNotAvailable, .biometryNotEnrolled, .passcodeNotSet:
                AppLogger.auth.warning("Device owner auth unavailable: \(error.code.rawValue)")
                checkAvailability()
                return .unavailable
            case .biometryLockout:
                AppLogger.auth.warning("Biometric auth locked out due to too many failed attempts")
                return .failed
            case .authenticationFailed:
                AppLogger.auth.warning("Biometric authentication failed")
                return .failed
            default:
                AppLogger.auth.error("Biometric auth error: \(error.code.rawValue)")
                return .failed
            }
        } catch {
            AppLogger.auth.error("Unexpected biometric auth error")
            return .failed
        }
    }

    /// Prompts the user. `true` only on success.
    func authenticate(reason: String? = nil) async -> Bool {
        await evaluate(reason: reason) == .success
    }

    // MARK: - Cleanup

    /// Disables biometric auth and clears stored preference. Call on sign out.
    func reset() {
        disable()
    }
}
