package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.util.AppLogger
import com.desmoines.aipulse.data.model.UserProfile
import com.desmoines.aipulse.data.remote.AuthRemoteDataSource
import com.desmoines.aipulse.data.remote.CommunicationPreferences
import com.desmoines.aipulse.util.SignOutCleaner
import dagger.Lazy
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton
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
            .onFailure { AppLogger.auth.warning("Sign in failed: ${it.message}") }

    override suspend fun signUp(
        email: String,
        password: String,
        firstName: String?,
        lastName: String?,
        interests: List<String>?,
    ): Result<Unit> =
        runCatching { remoteDataSource.signUp(email, password, firstName, lastName, interests) }
            .onFailure { AppLogger.auth.warning("Sign up failed: ${it.message}") }

    override suspend fun signOut(): Result<Unit> =
        runCatching { remoteDataSource.signOut() }
            .onFailure { AppLogger.auth.warning("Sign out failed: ${it.message}") }
            // Always tear down local state, even if the remote sign-out failed.
            .also { signOutCleaner.get().tearDown() }

    override suspend fun resetPassword(email: String): Result<Unit> =
        runCatching { remoteDataSource.resetPassword(email) }
            .onFailure { AppLogger.auth.warning("Reset password failed: ${it.message}") }

    override suspend fun signInWithGoogle(idToken: String): Result<Unit> =
        runCatching { remoteDataSource.signInWithGoogle(idToken) }
            .onFailure { AppLogger.auth.warning("Google sign in failed: ${it.message}") }

    override suspend fun fetchProfile(userId: String): Result<UserProfile?> =
        runCatching { remoteDataSource.fetchProfile(userId) }
            .onFailure { AppLogger.auth.warning("Fetch profile failed: ${it.message}") }

    override suspend fun createProfile(
        userId: String,
        email: String,
        firstName: String?,
        lastName: String?,
        interests: List<String>?,
    ): Result<Unit> =
        runCatching { remoteDataSource.createProfile(userId, email, firstName, lastName, interests) }
            .onFailure { AppLogger.auth.warning("Create profile failed: ${it.message}") }

    override suspend fun updateProfile(
        userId: String,
        firstName: String?,
        lastName: String?,
        phone: String?,
        location: String?,
        interests: List<String>?,
    ): Result<Unit> =
        runCatching { remoteDataSource.updateProfile(userId, firstName, lastName, phone, location, interests) }
            .onFailure { AppLogger.auth.warning("Update profile failed: ${it.message}") }

    override suspend fun isEmailMarketingAllowed(userId: String): Result<Boolean> =
        runCatching {
            CommunicationPreferences.isOptedIn(
                remoteDataSource.fetchCommunicationPreferences(userId),
                CommunicationPreferences.EMAIL_NOTIFICATIONS,
            )
        }.onFailure { AppLogger.auth.warning("Read email preference failed: ${it.message}") }

    override suspend fun setEmailMarketingAllowed(userId: String, allowed: Boolean): Result<Unit> =
        runCatching {
            remoteDataSource.setCommunicationPreference(
                userId,
                CommunicationPreferences.EMAIL_NOTIFICATIONS,
                allowed,
            )
        }.onFailure { AppLogger.auth.warning("Write email preference failed: ${it.message}") }

    override suspend fun checkAdminRole(userId: String): Result<Boolean> =
        runCatching { remoteDataSource.checkAdminRole(userId) }
            .onFailure { AppLogger.auth.warning("Admin role check failed: ${it.message}") }
}
