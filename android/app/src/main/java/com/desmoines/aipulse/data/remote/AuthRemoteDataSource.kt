package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.util.AppLogger
import com.desmoines.aipulse.util.AuthCallbackRouter
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.OtpType
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Apple
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.json.JsonObject
import com.desmoines.aipulse.data.model.UserProfile
import javax.inject.Inject
import javax.inject.Singleton
/**
 * Remote data source for authentication operations.
 *
 * DOES NOT MIRROR iOS (XPLAT-003 AC4). The provider sets are:
 *
 *   web      email + apple + google
 *   Android  email + apple + google   (apple since XPLAT-012)
 *   iOS      email + apple            (no Google; XPLAT-003)
 *
 * Measured against auth.identities on 2026-08-23: 5 email-only, 3 apple-only,
 * 2 apple+google, 1 google-only. The three apple-only accounts could not reach
 * their account here before XPLAT-012; the one google-only account still
 * cannot on iOS. Counting raw_app_meta_data->>'provider' instead overstates
 * both gaps, because a linked apple+google user signs in fine everywhere.
 */
@Singleton
class AuthRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {

    /**
     * Observe session status changes from Supabase Auth.
     * Returns null flow if client is not configured.
     */
    val sessionStatus: Flow<SessionStatus>?
        get() = supabaseClient?.auth?.sessionStatus

    /**
     * The current user ID from the active session, or null.
     */
    val currentUserId: String?
        get() = try {
            supabaseClient?.auth?.currentUserOrNull()?.id
        } catch (e: Exception) {
            null
        }

    // MARK: - Email/Password Auth

    suspend fun signIn(email: String, password: String) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    suspend fun signUp(
        email: String,
        password: String,
        firstName: String?,
        lastName: String?,
        interests: List<String>?,
    ): SignUpOutcome {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.signUpWith(Email) {
            this.email = email
            this.password = password
            // handle_new_user builds the profile from this metadata when no
            // session comes back, so it carries everything the form collected.
            this.data = buildJsonObject {
                firstName?.let { put("first_name", it) }
                lastName?.let { put("last_name", it) }
                interests?.let { list -> put("interests", JsonArray(list.map(::JsonPrimitive))) }
            }
        }

        // No session is what email confirmation looks like, not a failure.
        return SignUpOutcome.resolve(
            email = email,
            sessionUserId = client.auth.currentUserOrNull()?.id,
        ) { userId ->
            createProfile(
                userId = userId,
                email = email,
                firstName = firstName,
                lastName = lastName,
                interests = interests,
            )
        }
    }

    /**
     * Resend the sign-up confirmation mail. This is GoTrue's /resend with
     * type=signup; it used to call resetPasswordForEmail, which mailed a
     * password reset to someone who had never confirmed the account.
     */
    suspend fun resendSignUpConfirmation(email: String) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.resendEmail(OtpType.Email.SIGNUP, email)
    }

    suspend fun signOut() {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.signOut()
    }

    /**
     * Mail a reset link that comes back to this app (AND-OVH-006). Without a
     * redirect GoTrue sent the link to the Site URL, so the reset finished on
     * the website and the app never saw it. The redirect lands on
     * AuthCallbackRouter as a Recovery callback; it must stay on the hosted
     * project's redirect allowlist, which iOS shares (same scheme).
     */
    suspend fun resetPassword(email: String) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.resetPasswordForEmail(email, redirectUrl = RECOVERY_REDIRECT_URL)
    }

    /** Set a new password for the signed-in user, normally a recovery session. */
    suspend fun updatePassword(newPassword: String) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.updateUser {
            password = newPassword
        }
    }

    // MARK: - Google Sign-In

    suspend fun signInWithGoogle(idToken: String) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.signInWith(IDToken) {
            provider = Google
            this.idToken = idToken
        }
    }

    // MARK: - Apple Sign-In (XPLAT-012)

    /**
     * Start Sign in with Apple in the browser. Returns once the browser is
     * open, not once the user is signed in: Apple has no native SDK on
     * Android, so this is the same OAuth provider web uses (AuthContext
     * signInWithOAuth 'apple'), through the same Supabase Apple config.
     *
     * The client is PKCE (SupabaseClientProvider), so supabase-kt stores the
     * code verifier here and the browser comes back to
     * [AuthCallbackRouter.OAUTH_REDIRECT_URL] with a code. MainActivity
     * classifies that as AuthCallback.OAuth and exchanges it through the same
     * guarded path an email confirmation takes, so a refused code becomes a
     * message instead of a crash.
     *
     * An Apple account resolves to the same auth.users row, and so the same
     * profiles row, on every client: GoTrue keys the identity on Apple's
     * stable `sub`, not on the client that asked. No auth or session shape
     * changes.
     */
    suspend fun signInWithApple() {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.signInWith(Apple, redirectUrl = AuthCallbackRouter.OAUTH_REDIRECT_URL)
    }

    // MARK: - Profile Management

    suspend fun fetchProfile(userId: String): UserProfile? {
        val client = supabaseClient ?: return null
        return try {
            client.from("profiles")
                .select {
                    filter {
                        eq("user_id", userId)
                    }
                }
                .decodeSingle<UserProfile>()
        } catch (e: Exception) {
            AppLogger.auth.debug("Profile not found for user $userId: ${e.message}")
            null
        }
    }

    suspend fun createProfile(
        userId: String,
        email: String,
        firstName: String?,
        lastName: String?,
        interests: List<String>?,
    ) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.from("profiles")
            .insert(NewProfile(
                userId = userId,
                email = email,
                firstName = firstName,
                lastName = lastName,
                interests = interests,
            ))
    }

    suspend fun updateProfile(
        userId: String,
        firstName: String?,
        lastName: String?,
        phone: String?,
        location: String?,
        interests: List<String>?,
    ) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.from("profiles")
            .update(ProfileUpdate(
                firstName = firstName,
                lastName = lastName,
                phone = phone,
                location = location,
                interests = interests,
            )) {
                filter {
                    eq("user_id", userId)
                }
            }
    }

    // MARK: - Communication Preferences (WEB-LEGAL-012)

    @Serializable
    private data class CommPrefRow(
        @SerialName("communication_preferences") val communicationPreferences: JsonObject? = null,
    )

    @Serializable
    private data class CommPrefUpdate(
        @SerialName("communication_preferences") val communicationPreferences: JsonObject,
    )

    /**
     * The stored bag, or an empty one when the profile has never had preferences.
     *
     * THROWS rather than returning empty on failure, and the difference decides
     * whether a stored opt-out survives. An empty bag and a bag that could not be
     * read are indistinguishable to a caller that merges into them, and merging
     * into an empty bag is exactly the write that deleted the marketing key on
     * web. See CommunicationPreferences.
     */
    suspend fun fetchCommunicationPreferences(userId: String): JsonObject {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        val row = client.from("profiles")
            .select(Columns.list("communication_preferences")) {
                filter { eq("user_id", userId) }
            }
            .decodeSingleOrNull<CommPrefRow>()
        return row?.communicationPreferences ?: JsonObject(emptyMap())
    }

    /**
     * Set one key in the bag, preserving every other key.
     *
     * The read is not an optimisation. Skipping it, or swallowing its failure,
     * turns one toggle into a destructive write across three unrelated features.
     */
    suspend fun setCommunicationPreference(userId: String, key: String, value: Boolean) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        val merged = CommunicationPreferences.merge(fetchCommunicationPreferences(userId), key, value)
        client.from("profiles")
            .update(CommPrefUpdate(communicationPreferences = merged)) {
                filter { eq("user_id", userId) }
            }
    }

    // MARK: - Admin Check

    suspend fun checkAdminRole(userId: String): Boolean {
        val client = supabaseClient ?: return false

        // Check user_roles table first (matches web AuthContext pattern)
        try {
            val row = client.from("user_roles")
                .select {
                    filter {
                        eq("user_id", userId)
                    }
                }
                .decodeSingle<RoleRow>()
            return row.role == "admin" || row.role == "root_admin"
        } catch (_: Exception) {
            // user_roles lookup failed — fall through to profile check
        }

        // Fallback: check profiles table
        val profile = fetchProfile(userId)
        if (profile != null) {
            val role = profile.userRole
            return role == "admin" || role == "root_admin"
        }

        return false
    }

    // MARK: - Helper Models

    @Serializable
    private data class NewProfile(
        @SerialName("user_id") val userId: String,
        val email: String,
        @SerialName("first_name") val firstName: String?,
        @SerialName("last_name") val lastName: String?,
        val interests: List<String>?,
    )

    @Serializable
    private data class ProfileUpdate(
        @SerialName("first_name") val firstName: String?,
        @SerialName("last_name") val lastName: String?,
        val phone: String?,
        val location: String?,
        val interests: List<String>?,
    )

    @Serializable
    private data class RoleRow(val role: String)

    companion object {
        /** Where a password-reset email sends the user back to. */
        const val RECOVERY_REDIRECT_URL = "com.desmoines.aipulse://auth-callback?flow=recovery"
    }
}

/**
 * Auth-specific exceptions matching iOS AuthService.AuthError.
 */
sealed class AuthException(message: String) : Exception(message) {
    data object NotConfigured : AuthException("Supabase is not configured. Please contact support.")
    data object InvalidToken : AuthException("Invalid authentication token.")
    data object NoUser : AuthException("No user session found.")
}
