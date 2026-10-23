package com.desmoines.aipulse.util

import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException

/**
 * Whether GOOGLE_WEB_CLIENT_ID can actually drive Credential Manager.
 *
 * The value comes from local.properties through BuildConfig and defaults to "".
 * A blank id, the CI placeholder, or anything that is not an OAuth web client
 * id makes getCredential fail on every tap, so the button is hidden instead of
 * rendered as a control that cannot work.
 */
fun isGoogleSignInConfigured(clientId: String?): Boolean {
    val trimmed = clientId?.trim().orEmpty()
    if (trimmed.isEmpty()) return false
    if (trimmed.contains("placeholder", ignoreCase = true)) return false
    if (!trimmed.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) return false
    // The suffix alone is not an id.
    return trimmed.length > GOOGLE_CLIENT_ID_SUFFIX.length
}

private const val GOOGLE_CLIENT_ID_SUFFIX = ".apps.googleusercontent.com"

const val GOOGLE_NO_CREDENTIAL_MESSAGE = "No Google account available on this device"
const val GOOGLE_SIGN_IN_FAILED_MESSAGE = "Google sign in failed. Please try again."

/**
 * The message to show for a failed Google Sign-In, or null when the user
 * dismissed the sheet themselves and nothing should be shown.
 */
fun googleSignInErrorMessage(error: Throwable): String? = when (error) {
    is GetCredentialCancellationException -> null
    is NoCredentialException -> GOOGLE_NO_CREDENTIAL_MESSAGE
    else -> GOOGLE_SIGN_IN_FAILED_MESSAGE
}
