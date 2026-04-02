package com.desmoines.aipulse.util

/**
 * Maps Supabase auth error messages to user-friendly, actionable messages.
 * Used by AuthViewModel to provide clear feedback on auth failures.
 *
 * Supabase auth errors come as exception messages with varying formats.
 * This mapper normalizes them into consistent, helpful messages.
 */
object AuthErrorMapper {

    /**
     * Error result with optional recovery action hint.
     */
    data class AuthError(
        val message: String,
        val recoveryAction: RecoveryAction? = null,
    )

    enum class RecoveryAction {
        RESEND_VERIFICATION,
        FORGOT_PASSWORD,
        WAIT_AND_RETRY,
        CHECK_NETWORK,
        CONTACT_SUPPORT,
    }

    /**
     * Map a Supabase auth error to a user-friendly message with optional recovery action.
     */
    fun map(error: Throwable): AuthError {
        val msg = error.message?.lowercase() ?: ""

        return when {
            // Invalid credentials
            msg.contains("invalid login credentials") ||
            msg.contains("invalid_credentials") ||
            msg.contains("wrong password") ->
                AuthError(
                    "Incorrect email or password. Please try again.",
                    RecoveryAction.FORGOT_PASSWORD,
                )

            // Email not confirmed
            msg.contains("email not confirmed") ||
            msg.contains("email_not_confirmed") ||
            msg.contains("not verified") ->
                AuthError(
                    "Your email hasn't been verified yet. Check your inbox for the verification link.",
                    RecoveryAction.RESEND_VERIFICATION,
                )

            // User not found
            msg.contains("user not found") ||
            msg.contains("no user found") ->
                AuthError(
                    "No account found with this email. Would you like to create one?",
                )

            // User already exists
            msg.contains("user already registered") ||
            msg.contains("already registered") ||
            msg.contains("already exists") ->
                AuthError(
                    "An account with this email already exists. Try signing in instead.",
                )

            // Rate limited
            msg.contains("rate limit") ||
            msg.contains("too many requests") ||
            msg.contains("429") ->
                AuthError(
                    "Too many attempts. Please wait a moment and try again.",
                    RecoveryAction.WAIT_AND_RETRY,
                )

            // Password too weak
            msg.contains("password") && (msg.contains("weak") || msg.contains("short") || msg.contains("policy")) ->
                AuthError(
                    "Password doesn't meet requirements. Use at least 8 characters with uppercase, lowercase, and numbers.",
                )

            // Network errors
            msg.contains("network") ||
            msg.contains("timeout") ||
            msg.contains("unable to resolve host") ||
            msg.contains("no internet") ||
            msg.contains("connection") ->
                AuthError(
                    "Network error. Please check your internet connection and try again.",
                    RecoveryAction.CHECK_NETWORK,
                )

            // OAuth errors
            msg.contains("oauth") ||
            msg.contains("provider") ->
                AuthError(
                    "Sign-in with this provider failed. Please try again or use a different method.",
                )

            // Session expired
            msg.contains("session") && (msg.contains("expired") || msg.contains("invalid")) ->
                AuthError(
                    "Your session has expired. Please sign in again.",
                )

            // Account disabled/banned
            msg.contains("banned") ||
            msg.contains("disabled") ||
            msg.contains("blocked") ->
                AuthError(
                    "This account has been disabled. Please contact support for assistance.",
                    RecoveryAction.CONTACT_SUPPORT,
                )

            // Supabase not configured
            msg.contains("not configured") ||
            msg.contains("supabase") && msg.contains("missing") ->
                AuthError(
                    "Service is temporarily unavailable. Please try again later.",
                    RecoveryAction.CONTACT_SUPPORT,
                )

            // Generic fallback
            else -> AuthError(
                error.message?.take(200) ?: "Something went wrong. Please try again.",
            )
        }
    }

    /**
     * Get inline password requirements text for sign-up forms.
     */
    val passwordRequirements = listOf(
        "At least 8 characters",
        "One uppercase letter (A-Z)",
        "One lowercase letter (a-z)",
        "One number (0-9)",
        "One special character recommended",
    )
}
