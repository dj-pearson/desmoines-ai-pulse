package com.desmoines.aipulse.ui.screens.auth

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.UserProfile
import com.desmoines.aipulse.data.model.UserRole
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.util.AuthErrorMapper
import com.desmoines.aipulse.util.BiometricAuthService
import com.desmoines.aipulse.util.Config
import com.desmoines.aipulse.util.SessionTimeoutService
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val TAG = "AuthViewModel"

/**
 * ViewModel for authentication flows (sign in, sign up, profile management).
 * Mirrors iOS AuthViewModel.swift with identical validation, rate limiting, and state management.
 */
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val biometricAuthService: BiometricAuthService,
    private val billingService: BillingService,
    private val sessionTimeoutService: SessionTimeoutService,
) : ViewModel() {

    // MARK: - Auth State

    private val _currentUser = MutableStateFlow<io.github.jan.supabase.auth.user.UserInfo?>(null)

    private val _currentProfile = MutableStateFlow<UserProfile?>(null)
    val currentProfile: StateFlow<UserProfile?> = _currentProfile.asStateFlow()

    private val _isAuthenticated = MutableStateFlow(false)
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    private val _isAdmin = MutableStateFlow(false)
    val isAdmin: StateFlow<Boolean> = _isAdmin.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    // MARK: - Form State

    private val _isSigningIn = MutableStateFlow(false)
    val isSigningIn: StateFlow<Boolean> = _isSigningIn.asStateFlow()

    private val _isSigningUp = MutableStateFlow(false)
    val isSigningUp: StateFlow<Boolean> = _isSigningUp.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _showVerificationAlert = MutableStateFlow(false)
    val showVerificationAlert: StateFlow<Boolean> = _showVerificationAlert.asStateFlow()

    private val _recoveryAction = MutableStateFlow<AuthErrorMapper.RecoveryAction?>(null)
    val recoveryAction: StateFlow<AuthErrorMapper.RecoveryAction?> = _recoveryAction.asStateFlow()

    // MARK: - Rate Limiting

    private val _lockoutSecondsRemaining = MutableStateFlow(0)
    val lockoutSecondsRemaining: StateFlow<Int> = _lockoutSecondsRemaining.asStateFlow()

    private val failedAttemptTimestamps = mutableListOf<Long>()
    private var lockoutJob: Job? = null

    val isLockedOut: Boolean get() = _lockoutSecondsRemaining.value > 0

    // MARK: - Password Strength

    enum class PasswordStrength {
        NONE, WEAK, MEDIUM, STRONG
    }

    init {
        startAuthListener()
    }

    // MARK: - Auth State Listener

    private fun startAuthListener() {
        val sessionFlow = authRepository.sessionStatus ?: run {
            _isLoading.value = false
            return
        }

        viewModelScope.launch {
            sessionFlow.collect { status ->
                when (status) {
                    is SessionStatus.Authenticated -> {
                        val userId = status.session.user?.id
                        _isAuthenticated.value = true
                        if (userId != null) {
                            fetchProfileAndCheckAdmin(userId)
                        }
                        // Re-resolve the backend tier so a fresh sign-in (or
                        // a sign-in to a different account in the same
                        // session) immediately reflects the new account's
                        // entitlements.
                        billingService.refreshBackendTier()
                        _isLoading.value = false
                    }
                    is SessionStatus.NotAuthenticated -> {
                        _currentUser.value = null
                        _currentProfile.value = null
                        _isAuthenticated.value = false
                        _isAdmin.value = false
                        // Idempotent; SignOutCleaner also calls it, but not
                        // every way a session ends goes through sign-out.
                        sessionTimeoutService.stopTracking()
                        // Drop the cached backend tier so the next account
                        // never briefly inherits the previous account's
                        // entitlement.
                        billingService.clearBackendTier()
                        _isLoading.value = false
                    }
                    is SessionStatus.Initializing -> {
                        // Still loading
                    }
                    else -> {
                        _isLoading.value = false
                    }
                }
            }
        }
    }

    private suspend fun fetchProfileAndCheckAdmin(userId: String) {
        authRepository.fetchProfile(userId).onSuccess { profile ->
            _currentProfile.value = profile
        }
        authRepository.checkAdminRole(userId).onSuccess { isAdmin ->
            _isAdmin.value = isAdmin
            if (isAdmin) startOrExpireAdminSession()
        }
    }

    /**
     * Begins admin session-timeout tracking, or ends the session outright if it
     * had already expired while the app was closed.
     *
     * Order matters: startTracking() resets the idle timer, so the persisted
     * timestamps have to be judged first or a session that timed out overnight
     * would be silently renewed on next launch.
     *
     * Only admins are tracked; see SessionTimeoutService for why.
     */
    private suspend fun startOrExpireAdminSession() {
        if (!sessionTimeoutService.isSessionValid()) {
            Log.i(TAG, "Admin session already expired while the app was closed; signing out")
            authRepository.signOut()
            return
        }
        sessionTimeoutService.startTracking()
    }

    // MARK: - Validation

    fun isEmailValid(email: String): Boolean {
        if (email.isEmpty()) return true // don't show error on empty
        val pattern = "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"
        return email.matches(Regex(pattern))
    }

    fun passwordStrength(password: String): PasswordStrength {
        if (password.isEmpty()) return PasswordStrength.NONE
        var score = 0
        if (password.length >= 8) score++
        if (password.length >= 12) score++
        if (password.contains(Regex("[A-Z]"))) score++
        if (password.contains(Regex("[a-z]"))) score++
        if (password.contains(Regex("[0-9]"))) score++
        if (password.contains(Regex("[^A-Za-z0-9]"))) score++

        return when {
            score <= 2 -> PasswordStrength.WEAK
            score <= 4 -> PasswordStrength.MEDIUM
            else -> PasswordStrength.STRONG
        }
    }

    fun passwordsMatch(password: String, confirmPassword: String): Boolean {
        return confirmPassword.isEmpty() || password == confirmPassword
    }

    // MARK: - Sign In

    fun signIn(email: String, password: String) {
        if (email.isEmpty() || password.isEmpty()) {
            setError("Please enter your email and password.")
            return
        }
        if (!isEmailValid(email)) {
            setError("Please enter a valid email address.")
            return
        }
        if (isLockedOut) {
            setError("Too many attempts. Try again in ${_lockoutSecondsRemaining.value} seconds.")
            return
        }

        _isSigningIn.value = true
        _errorMessage.value = null

        viewModelScope.launch {
            authRepository.signIn(email, password)
                .onSuccess {
                    failedAttemptTimestamps.clear()
                    _recoveryAction.value = null
                }
                .onFailure { error ->
                    recordFailedAttempt()
                    val mapped = AuthErrorMapper.map(error)
                    _recoveryAction.value = mapped.recoveryAction
                    setError(mapped.message)
                }
            _isSigningIn.value = false
        }
    }

    // MARK: - Sign Up

    fun signUp(
        email: String,
        password: String,
        confirmPassword: String,
        firstName: String,
        lastName: String,
        selectedInterests: Set<String>,
    ) {
        if (email.isEmpty() || password.isEmpty()) {
            setError("Please enter your email and password.")
            return
        }
        if (!isEmailValid(email)) {
            setError("Please enter a valid email address.")
            return
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters.")
            return
        }
        if (passwordStrength(password) == PasswordStrength.WEAK) {
            setError("Password is too weak. Include uppercase, lowercase, and numbers.")
            return
        }
        if (!passwordsMatch(password, confirmPassword)) {
            setError("Passwords do not match.")
            return
        }

        _isSigningUp.value = true
        _errorMessage.value = null

        viewModelScope.launch {
            authRepository.signUp(
                email = email,
                password = password,
                firstName = firstName.ifEmpty { null },
                lastName = lastName.ifEmpty { null },
                interests = if (selectedInterests.isEmpty()) null else selectedInterests.toList(),
            )
                .onSuccess {
                    _showVerificationAlert.value = true
                    _recoveryAction.value = null
                }
                .onFailure { error ->
                    val mapped = AuthErrorMapper.map(error)
                    _recoveryAction.value = mapped.recoveryAction
                    setError(mapped.message)
                }
            _isSigningUp.value = false
        }
    }

    // MARK: - Google Sign-In

    fun signInWithGoogle(idToken: String) {
        viewModelScope.launch {
            _isSigningIn.value = true
            authRepository.signInWithGoogle(idToken)
                .onFailure { error ->
                    setError(error.message ?: "Google sign in failed.")
                }
            _isSigningIn.value = false
        }
    }

    // MARK: - Sign Out

    fun signOut() {
        viewModelScope.launch {
            authRepository.signOut()
                .onFailure { error ->
                    setError(error.message ?: "Sign out failed.")
                }
        }
    }

    // MARK: - Biometric Auth

    /**
     * Whether biometric auth is available and can be enabled.
     */
    val isBiometricAvailable: Boolean
        get() = biometricAuthService.isAvailable

    /**
     * Whether biometric auth is currently enabled by the user.
     */
    val isBiometricEnabled: Boolean
        get() = biometricAuthService.isEnabled

    /**
     * Enable biometric auth. Should be called after a successful biometric prompt.
     */
    fun enableBiometric() {
        biometricAuthService.enable()
    }

    /**
     * Disable biometric auth.
     */
    fun disableBiometric() {
        biometricAuthService.disable()
    }

    // MARK: - Reset Password

    fun resetPassword(email: String) {
        if (email.isEmpty()) {
            setError("Please enter your email address.")
            return
        }

        viewModelScope.launch {
            authRepository.resetPassword(email)
                .onSuccess {
                    setError("Password reset email sent. Check your inbox.")
                }
                .onFailure { error ->
                    setError(error.message ?: "Failed to send reset email.")
                }
        }
    }

    // MARK: - Resend Verification

    fun resendVerification(email: String) {
        if (email.isEmpty()) {
            setError("Please enter your email address.")
            return
        }
        viewModelScope.launch {
            // Supabase resend = calling signUp again with existing email triggers resend
            authRepository.resetPassword(email)
                .onSuccess {
                    setError("Verification email resent. Check your inbox.")
                    _recoveryAction.value = null
                }
                .onFailure { error ->
                    val mapped = AuthErrorMapper.map(error)
                    setError(mapped.message)
                }
        }
    }

    // MARK: - Profile Update

    fun updateProfile(
        firstName: String?,
        lastName: String?,
        phone: String?,
        location: String?,
        interests: List<String>?,
    ) {
        val userId = authRepository.currentUserId ?: return

        viewModelScope.launch {
            // Ensure profile exists before updating
            if (_currentProfile.value == null) {
                authRepository.createProfile(
                    userId = userId,
                    email = "",
                    firstName = firstName,
                    lastName = lastName,
                    interests = interests,
                )
            }

            authRepository.updateProfile(userId, firstName, lastName, phone, location, interests)
                .onSuccess {
                    // Refresh profile
                    authRepository.fetchProfile(userId).onSuccess { profile ->
                        _currentProfile.value = profile
                    }
                }
                .onFailure { error ->
                    setError(error.message ?: "Failed to update profile.")
                }
        }
    }

    // MARK: - Helpers

    fun clearError() {
        _errorMessage.value = null
    }

    fun dismissVerificationAlert() {
        _showVerificationAlert.value = false
    }

    private fun setError(message: String) {
        _errorMessage.value = message
    }

    // MARK: - Rate Limiting

    private fun recordFailedAttempt() {
        val now = System.currentTimeMillis()
        failedAttemptTimestamps.add(now)

        // Remove attempts outside the window
        val windowMs = Config.AUTH_WINDOW_MINUTES * 60 * 1000L
        failedAttemptTimestamps.removeAll { now - it >= windowMs }

        if (failedAttemptTimestamps.size >= Config.MAX_AUTH_ATTEMPTS) {
            startLockout()
        }
    }

    private fun startLockout() {
        _lockoutSecondsRemaining.value = Config.AUTH_LOCKOUT_SECONDS
        lockoutJob?.cancel()
        lockoutJob = viewModelScope.launch {
            while (_lockoutSecondsRemaining.value > 0) {
                delay(1000)
                _lockoutSecondsRemaining.value -= 1
            }
            failedAttemptTimestamps.clear()
        }
    }

    companion object {
        val availableInterests = listOf(
            "Food", "Music", "Sports", "Arts",
            "Nightlife", "Outdoor", "Family", "Business",
        )
    }
}
