package com.desmoines.aipulse.util

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/**
 * Manages biometric authentication (fingerprint / face recognition) for quick app unlock.
 * Mirrors iOS BiometricAuthService.swift — prompts biometric on launch if enabled and session exists.
 *
 * Requires Class 3 (strong) biometrics for cryptographic security.
 */
@Singleton
class BiometricAuthService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val secureStorage: SecureStorage,
) {

    companion object {
        private const val KEY_BIOMETRIC_ENABLED = "biometric_auth_enabled"
    }

    /**
     * Whether biometric auth is enabled by the user.
     */
    val isEnabled: Boolean
        get() = secureStorage.load(KEY_BIOMETRIC_ENABLED) == "true"

    /**
     * Whether strong biometric hardware is available and enrolled on this device.
     */
    val isAvailable: Boolean
        get() {
            val manager = BiometricManager.from(context)
            return manager.canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS
        }

    /**
     * Human-readable status for the biometric hardware.
     */
    val statusMessage: String
        get() {
            val manager = BiometricManager.from(context)
            return when (manager.canAuthenticate(BIOMETRIC_STRONG)) {
                BiometricManager.BIOMETRIC_SUCCESS -> "Biometric authentication available"
                BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "No biometric hardware"
                BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "Biometric hardware unavailable"
                BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "No biometrics enrolled"
                BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED -> "Security update required"
                BiometricManager.BIOMETRIC_STATUS_UNKNOWN -> "Biometric status unknown"
                else -> "Biometric unavailable"
            }
        }

    // MARK: - Enable / Disable

    /**
     * Enables biometric auth. Must be called after a successful biometric prompt
     * so the user confirms they can authenticate before enabling.
     */
    fun enable() {
        secureStorage.save(KEY_BIOMETRIC_ENABLED, "true")
        AppLogger.auth.info("Biometric auth enabled")
    }

    /**
     * Disables biometric auth and clears stored preference.
     */
    fun disable() {
        secureStorage.delete(KEY_BIOMETRIC_ENABLED)
        AppLogger.auth.info("Biometric auth disabled")
    }

    // MARK: - Authenticate

    /**
     * Shows the system biometric prompt and suspends until the user authenticates or cancels.
     * Returns `true` if authentication succeeded, `false` otherwise.
     *
     * Must be called from a FragmentActivity (Compose activities extend ComponentActivity
     * which extends FragmentActivity).
     *
     * @param activity The current FragmentActivity for showing the prompt
     * @param title Title shown in the biometric dialog
     * @param subtitle Optional subtitle
     * @param negativeButtonText Text for the cancel/fallback button
     */
    suspend fun authenticate(
        activity: FragmentActivity,
        title: String = "Sign in to Des Moines Insider",
        subtitle: String? = "Use your fingerprint or face to unlock",
        negativeButtonText: String = "Use Password",
    ): Boolean {
        if (!isAvailable) {
            AppLogger.auth.warning("Biometric auth not available: ${statusMessage}")
            return false
        }

        return suspendCoroutine { continuation ->
            val executor = ContextCompat.getMainExecutor(context)

            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    AppLogger.auth.info("Biometric authentication succeeded")
                    continuation.resume(true)
                }

                override fun onAuthenticationFailed() {
                    // Called on each failed attempt (e.g., wrong finger) but prompt stays open
                    AppLogger.auth.debug("Biometric authentication attempt failed")
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    when (errorCode) {
                        BiometricPrompt.ERROR_USER_CANCELED,
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                        BiometricPrompt.ERROR_CANCELED -> {
                            AppLogger.auth.debug("Biometric auth cancelled: $errString")
                        }
                        BiometricPrompt.ERROR_HW_UNAVAILABLE,
                        BiometricPrompt.ERROR_HW_NOT_PRESENT -> {
                            AppLogger.auth.warning("Biometric hardware not available: $errString")
                        }
                        BiometricPrompt.ERROR_NO_BIOMETRICS -> {
                            AppLogger.auth.warning("No biometrics enrolled on device: $errString")
                        }
                        BiometricPrompt.ERROR_LOCKOUT,
                        BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> {
                            AppLogger.auth.warning("Biometric auth locked out: $errString")
                        }
                        BiometricPrompt.ERROR_TIMEOUT -> {
                            AppLogger.auth.debug("Biometric auth timed out")
                        }
                        BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL -> {
                            AppLogger.auth.warning("No device credential set: $errString")
                        }
                        BiometricPrompt.ERROR_VENDOR -> {
                            AppLogger.auth.error("Vendor-specific biometric error: $errString")
                        }
                        BiometricPrompt.ERROR_SECURITY_UPDATE_REQUIRED -> {
                            AppLogger.auth.warning("Security update required for biometrics: $errString")
                        }
                        BiometricPrompt.ERROR_NO_SPACE,
                        BiometricPrompt.ERROR_UNABLE_TO_PROCESS -> {
                            AppLogger.auth.error("Biometric processing error ($errorCode): $errString")
                        }
                        else -> {
                            AppLogger.auth.error("Unknown biometric error ($errorCode): $errString")
                        }
                    }
                    continuation.resume(false)
                }
            }

            val biometricPrompt = BiometricPrompt(activity, executor, callback)

            val promptInfoBuilder = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setNegativeButtonText(negativeButtonText)
                .setAllowedAuthenticators(BIOMETRIC_STRONG)
                .setConfirmationRequired(false)

            if (subtitle != null) {
                promptInfoBuilder.setSubtitle(subtitle)
            }

            biometricPrompt.authenticate(promptInfoBuilder.build())
        }
    }

    // MARK: - Cleanup

    /**
     * Disables biometric auth and clears preference. Call on sign out.
     */
    fun reset() {
        disable()
    }
}
