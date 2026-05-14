package com.desmoines.aipulse.data.remote

import android.util.Log
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import com.desmoines.aipulse.data.model.UserProfile
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "AuthRemoteDataSource"

/**
 * Remote data source for authentication operations.
 * Mirrors iOS AuthService.swift — uses Supabase Auth for email/password and Google Sign-In.
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
    ) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.signUpWith(Email) {
            this.email = email
            this.password = password
            this.data = buildJsonObject {
                firstName?.let { put("first_name", it) }
                lastName?.let { put("last_name", it) }
            }
        }

        // Create profile after sign-up
        val userId = client.auth.currentUserOrNull()?.id
            ?: throw AuthException.NoUser
        createProfile(
            userId = userId,
            email = email,
            firstName = firstName,
            lastName = lastName,
            interests = interests,
        )
    }

    suspend fun signOut() {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.signOut()
    }

    suspend fun resetPassword(email: String) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.resetPasswordForEmail(email)
    }

    // MARK: - Google Sign-In

    suspend fun signInWithGoogle(idToken: String) {
        val client = supabaseClient ?: throw AuthException.NotConfigured
        client.auth.signInWith(IDToken) {
            provider = Google
            this.idToken = idToken
        }
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
            Log.d(TAG, "Profile not found for user $userId: ${e.message}")
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
}

/**
 * Auth-specific exceptions matching iOS AuthService.AuthError.
 */
sealed class AuthException(message: String) : Exception(message) {
    data object NotConfigured : AuthException("Supabase is not configured. Please contact support.")
    data object InvalidToken : AuthException("Invalid authentication token.")
    data object NoUser : AuthException("No user session found.")
}
