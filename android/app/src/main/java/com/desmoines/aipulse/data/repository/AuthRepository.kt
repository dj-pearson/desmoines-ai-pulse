package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.UserProfile
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for authentication operations.
 * Mirrors iOS AuthService interface pattern.
 */
interface AuthRepository {

    /** Observe Supabase session status changes. */
    val sessionStatus: Flow<SessionStatus>?

    /** Current user ID from the active session, or null. */
    val currentUserId: String?

    /** Sign in with email and password. */
    suspend fun signIn(email: String, password: String): Result<Unit>

    /** Sign up with email, password, and optional profile info. */
    suspend fun signUp(
        email: String,
        password: String,
        firstName: String?,
        lastName: String?,
        interests: List<String>?,
    ): Result<Unit>

    /** Sign out the current user. */
    suspend fun signOut(): Result<Unit>

    /** Send password reset email. */
    suspend fun resetPassword(email: String): Result<Unit>

    /** Sign in with Google ID token. */
    suspend fun signInWithGoogle(idToken: String): Result<Unit>

    /** Fetch user profile by user ID. */
    suspend fun fetchProfile(userId: String): Result<UserProfile?>

    /** Create a new user profile. */
    suspend fun createProfile(
        userId: String,
        email: String,
        firstName: String?,
        lastName: String?,
        interests: List<String>?,
    ): Result<Unit>

    /** Update an existing user profile. */
    suspend fun updateProfile(
        userId: String,
        firstName: String?,
        lastName: String?,
        phone: String?,
        location: String?,
        interests: List<String>?,
    ): Result<Unit>

    /** Check if user has admin role. */
    suspend fun checkAdminRole(userId: String): Result<Boolean>
}
