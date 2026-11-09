package com.desmoines.aipulse.util

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.net.URI
import java.net.URLDecoder
import javax.inject.Inject
import javax.inject.Singleton

/**
 * What a `com.desmoines.aipulse://auth-callback` link is asking for.
 *
 * AND-OVH-005: MainActivity used to match these links and do nothing, so a PKCE
 * email-confirmation link opened the app and stopped there.
 */
sealed interface AuthCallback {
    /** Sign-up confirmation (or magic link). [code] is the PKCE auth code, if any. */
    data class Confirmation(val code: String?) : AuthCallback

    /** Password-reset link (`flow=recovery`). [code] is the PKCE auth code, if any. */
    data class Recovery(val code: String?) : AuthCallback

    /**
     * Return from a browser OAuth sign-in (`flow=oauth`), today only Apple
     * (XPLAT-012). Kept apart from [Confirmation] so the user is not told their
     * email was confirmed when they never typed one.
     */
    data class OAuth(val code: String?) : AuthCallback

    /** GoTrue redirected with an error, most often an expired or reused link. */
    data class Error(val message: String) : AuthCallback

    /** Not an auth callback at all; leave it to the other handlers. */
    data object NotAuth : AuthCallback
}

/**
 * Classifies auth-callback URIs from their string form, so the rules are JVM
 * testable without android.net.Uri.
 *
 * GoTrue puts parameters in the query for PKCE and in the fragment for the
 * implicit flow, and its error redirects have used both, so both are read. An
 * error wins over everything else: an expired link carries no usable code.
 */
object AuthCallbackRouter {

    const val SCHEME = Config.APP_BUNDLE_ID
    const val HOST = "auth-callback"

    /** The `flow` value [OAUTH_REDIRECT_URL] carries. */
    const val OAUTH_FLOW = "oauth"

    /**
     * Where a browser OAuth sign-in returns. GoTrue appends `code` to this
     * query, as it does for `flow=recovery`. It must be on the hosted project's
     * redirect allowlist, or GoTrue falls back to the Site URL and the sign-in
     * finishes on the website instead of here.
     */
    const val OAUTH_REDIRECT_URL = "$SCHEME://$HOST?flow=$OAUTH_FLOW"

    private const val MAX_DESCRIPTION_LENGTH = 200

    fun classify(uri: String?): AuthCallback {
        if (uri.isNullOrBlank()) return AuthCallback.NotAuth
        val parsed = runCatching { URI(uri.trim()) }.getOrNull() ?: return AuthCallback.NotAuth
        if (!SCHEME.equals(parsed.scheme, ignoreCase = true)) return AuthCallback.NotAuth
        if (!HOST.equals(parsed.host, ignoreCase = true)) return AuthCallback.NotAuth

        val params = parseParams(parsed.rawQuery) + parseParams(parsed.rawFragment)

        val isOAuth = params["flow"].equals(OAUTH_FLOW, ignoreCase = true)

        val description = params["error_description"]?.takeIf { it.isNotBlank() }
        if (description != null) {
            val message = if (isOAuth) {
                oauthErrorMessage(description)
            } else {
                errorMessage(params["error_code"], description)
            }
            return AuthCallback.Error(message)
        }

        val code = params["code"]?.takeIf { it.isNotBlank() }
        val isRecovery = params["flow"].equals("recovery", ignoreCase = true) ||
            params["type"].equals("recovery", ignoreCase = true)
        return when {
            isRecovery -> AuthCallback.Recovery(code)
            isOAuth -> AuthCallback.OAuth(code)
            else -> AuthCallback.Confirmation(code)
        }
    }

    /**
     * An OAuth return has no email link to have expired, so the expiry wording
     * would send the user looking for a mail that does not exist.
     */
    private fun oauthErrorMessage(description: String): String =
        "Sign-in didn't finish: ${description.take(MAX_DESCRIPTION_LENGTH)}. " +
            "Try again, or sign in with your email and password."

    private fun errorMessage(code: String?, description: String): String {
        if (code.equals("otp_expired", ignoreCase = true) ||
            description.contains("expired", ignoreCase = true)
        ) {
            return "That link has expired or was already used. Sign in, or request a new " +
                "confirmation email from the sign-in screen."
        }
        return "That sign-in link didn't work: ${description.take(MAX_DESCRIPTION_LENGTH)}"
    }

    /** Query/fragment parsing; later keys win, so the fragment overrides the query. */
    private fun parseParams(raw: String?): Map<String, String> {
        if (raw.isNullOrEmpty()) return emptyMap()
        return raw.split('&')
            .filter { it.isNotEmpty() }
            .associate { pair ->
                val key = pair.substringBefore('=')
                val value = if (pair.contains('=')) pair.substringAfter('=') else ""
                decode(key) to decode(value)
            }
    }

    private fun decode(value: String): String =
        runCatching { URLDecoder.decode(value, "UTF-8") }.getOrDefault(value)
}

/**
 * Runs the code exchange for an auth callback and hands the outcome from
 * MainActivity (where the intent arrives) to MainScreen (which owns navigation
 * and the snackbar). Same pending/consume shape as [DeepLinkHandler].
 *
 * The exchange runs on this singleton's own scope, not the activity's, so a
 * rotation mid-exchange does not cancel it after the code has been spent.
 */
@Singleton
class AuthCallbackNotices internal constructor(dispatcher: CoroutineDispatcher) {

    @Inject constructor() : this(Dispatchers.IO)

    sealed interface Notice {
        /** Exchange succeeded: go to Home and show [message] in a snackbar. */
        data class SignedIn(val message: String) : Notice

        /** The link was refused: show [message] where it can't be missed. */
        data class Failed(val message: String) : Notice

        /** A reset link signed the user in: hold them on SetNewPassword. */
        data object PasswordRecovery : Notice

        /** The new password was saved: show [message] in a snackbar. */
        data class PasswordUpdated(val message: String) : Notice
    }

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    private val _pending = MutableStateFlow<Notice?>(null)
    val pending: StateFlow<Notice?> = _pending.asStateFlow()

    fun post(notice: Notice) {
        _pending.value = notice
    }

    fun consume(): Notice? {
        val notice = _pending.value
        _pending.value = null
        return notice
    }

    /**
     * Exchange [code] for a session with [exchange] and post the outcome. A
     * refused code (expired, already used, or no stored PKCE verifier because
     * the link came from an older sign-up attempt) becomes a [Notice.Failed]
     * rather than an exception.
     */
    fun exchange(code: String, successMessage: String, exchange: suspend (String) -> Unit) =
        this.exchange(code, Notice.SignedIn(successMessage), exchange)

    /** As above, posting [onSuccess] when the exchange succeeds. */
    fun exchange(code: String, onSuccess: Notice, exchange: suspend (String) -> Unit) {
        scope.launch {
            try {
                exchange(code)
                post(onSuccess)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                AppLogger.auth.warning("Auth callback code exchange failed", e)
                post(Notice.Failed(EXCHANGE_FAILED_MESSAGE))
            }
        }
    }

    companion object {
        const val CONFIRMED_MESSAGE = "Email confirmed. You're signed in."
        const val OAUTH_SIGNED_IN_MESSAGE = "You're signed in."
        const val PASSWORD_UPDATED_MESSAGE = "Password updated. You're signed in."
        const val EXCHANGE_FAILED_MESSAGE =
            "We couldn't finish signing you in from that link. It may have expired or been " +
                "opened on a different device. Sign in with your email and password instead."
        const val MISSING_CODE_MESSAGE =
            "That link is missing its sign-in code. Open the newest email we sent, or sign in."
        const val NOT_CONFIGURED_MESSAGE =
            "Sign-in isn't available in this build, so the link can't be completed."
    }
}
