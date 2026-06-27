package com.desmoines.aipulse.data.repository

import android.util.Log
import com.desmoines.aipulse.data.model.UserProfile
import com.desmoines.aipulse.data.remote.AuthRemoteDataSource
import com.desmoines.aipulse.util.SignOutCleaner
import dagger.Lazy
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "AuthRepository"

/**
 * Repository implementation wrapping [AuthRemoteDataSource] with error handling.
 * Returns Result<T> for all operations following the same pattern as other repositories.
 */
@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val remoteDataSource: AuthRemoteDataSource,
    // Lazy breaks the DI cycle (cleaner → swipe/ad services → AuthRepository).
    private val signOutCleaner: Lazy<SignOutCleaner>,
) : AuthRepository {

    override val sessionStatus: Flow<SessionStatus>?
        get() = remoteDataSource.sessionStatus

    override val currentUserId: String?
        get() = remoteDataSource.currentUserId

    override suspend fun signIn(email: String, password: String): Result<Unit> =
        runCatching { remoteDataSource.signIn(email, password) }
            .onFailure { Log.w(TAG, "Sign in failed: ${it.message}") }

    override suspend fun signUp(
        email: String,
        password: String,
        firstName: String?,
        lastName: String?,
        interests: List<String>?,
    ): Result<Unit> =
        runCatching { remoteDataSource.signUp(email, password, firstName, lastName, interests) }
            .onFailure { Log.w(TAG, "Sign up failed: ${it.message}") }

    override suspend fun signOut(): Result<Unit> =
        runCatching { remoteDataSource.signOut() }
            .onFailure { Log.w(TAG, "Sign out failed: ${it.message}") }
            // Always tear down local state, even if the remote sign-out failed.
            .also { signOutCleaner.get().tearDown() }

    override suspend fun resetPassword(email: String): Result<Unit> =
        runCatching { remoteDataSource.resetPassword(email) }
            .onFailure { Log.w(TAG, "Reset password failed: ${it.message}") }

    override suspend fun signInWithGoogle(idToken: String): Result<Unit> =
        runCatching { remoteDataSource.signInWithGoogle(idToken) }
            .onFailure { Log.w(TAG, "Google sign in failed: ${it.message}") }

    override suspend fun fetchProfile(userId: String): Result<UserProfile?> =
        runCatching { remoteDataSource.fetchProfile(userId) }
            .onFailure { Log.w(TAG, "Fetch profile failed: ${it.message}") }

    override suspend fun createProfile(
        userId: String,
        email: String,
        firstName: String?,
        lastName: String?,
        interests: List<String>?,
    ): Result<Unit> =
        runCatching { remoteDataSource.createProfile(userId, email, firstName, lastName, interests) }
            .onFailure { Log.w(TAG, "Create profile failed: ${it.message}") }

    override suspend fun updateProfile(
        userId: String,
        firstName: String?,
        lastName: String?,
        phone: String?,
        location: String?,
        interests: List<String>?,
    ): Result<Unit> =
        runCatching { remoteDataSource.updateProfile(userId, firstName, lastName, phone, location, interests) }
            .onFailure { Log.w(TAG, "Update profile failed: ${it.message}") }

    override suspend fun checkAdminRole(userId: String): Result<Boolean> =
        runCatching { remoteDataSource.checkAdminRole(userId) }
            .onFailure { Log.w(TAG, "Admin role check failed: ${it.message}") }
}
