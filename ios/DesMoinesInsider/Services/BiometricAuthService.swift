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
        @unknown default: return "Biometrics"
        }
    }

    /// SF Symbol name for the current biometric type.
    var biometricIcon: String {
        switch biometricType {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .opticID: return "opticid"
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

        let success = await authenticate(reason: "Verify your identity to enable \(biometricName)")
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

    /// Prompts the user for biometric authentication.
    /// Returns `true` if authentication succeeded, `false` otherwise.
    func authenticate(reason: String? = nil) async -> Bool {
        guard isAvailable else { return false }

        let context = LAContext()
        context.localizedCancelTitle = "Use Password"

        let authReason = reason ?? "Sign in to Des Moines Insider"

        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: authReason
            )
            if success {
                AppLogger.auth.info("Biometric authentication succeeded")
            }
            return success
        } catch let error as LAError {
            switch error.code {
            case .userCancel, .appCancel, .systemCancel:
                AppLogger.auth.debug("Biometric auth cancelled by user/system")
            case .biometryNotAvailable:
                AppLogger.auth.warning("Biometric hardware not available")
                isAvailable = false
            case .biometryNotEnrolled:
                AppLogger.auth.warning("No biometric data enrolled on device")
                isAvailable = false
            case .biometryLockout:
                AppLogger.auth.warning("Biometric auth locked out due to too many failed attempts")
            case .authenticationFailed:
                AppLogger.auth.warning("Biometric authentication failed")
            default:
                AppLogger.auth.error("Biometric auth error: \(error.localizedDescription)")
            }
            return false
        } catch {
            AppLogger.auth.error("Unexpected biometric auth error: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - Cleanup

    /// Disables biometric auth and clears stored preference. Call on sign out.
    func reset() {
        disable()
    }
}
