package com.desmoines.aipulse.ui.screens.profile

import com.desmoines.aipulse.util.AppLogger
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.UserProfile
import com.desmoines.aipulse.data.remote.SupabaseClientProvider
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.ui.screens.auth.AuthViewModel
import com.desmoines.aipulse.util.AnalyticsService
import com.desmoines.aipulse.util.ConsentService
import com.desmoines.aipulse.util.OnboardingPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import javax.inject.Inject
/**
 * ViewModel for Profile screen. Mirrors iOS ProfileViewModel.swift.
 * Manages profile editing, saving, deletion, and sign out.
 */
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val onboardingPreferences: OnboardingPreferences,
    private val consentService: ConsentService,
    private val analyticsService: AnalyticsService,
) : ViewModel() {

    // MARK: - Privacy / Consent (ANDP-067)
    // Exposes the live consent state and the opt-out handlers the Settings screen drives.

    val locationConsent: StateFlow<Boolean> = consentService.locationConsent
    val analyticsConsent: StateFlow<Boolean> = consentService.analyticsConsent

    /**
     * The email opt-in, held here rather than read straight off ConsentService
     * (WEB-LEGAL-012 AC4).
     *
     * The toggle used to be backed only by SecureStorage, which stopped nothing:
     * every sender gates on profiles.communication_preferences, and no Android
     * build has ever written it. It also DEFAULTED TO OFF, because
     * loadBoolean returns false for a key that was never set, while the server
     * treats a missing key as consent. So the screen told a signed-in user they
     * had opted out while the mail kept arriving - the worst state a consent
     * control can be in, and not a state the user can escape by toggling.
     *
     * Starts true for the same reason absence means opted in on the server. The
     * real value replaces it as soon as the profile loads.
     */
    private val _emailConsent = MutableStateFlow(true)
    val emailConsent: StateFlow<Boolean> = _emailConsent.asStateFlow()

    /** Set when the opt-out could not be persisted, so the UI can say so. */
    private val _emailConsentError = MutableStateFlow<String?>(null)
    val emailConsentError: StateFlow<String?> = _emailConsentError.asStateFlow()

    fun setLocationConsent(enabled: Boolean) = consentService.setLocationConsent(enabled)

    /**
     * Write the email preference through to the server, and roll the toggle back
     * if that fails.
     *
     * Rolling back matters more here than it would for a UI preference. A
     * consent control that shows the state the user asked for while the server
     * still holds the old one is indistinguishable from one that worked, and the
     * only evidence is mail the user has already told us to stop.
     *
     * Signed out, this stays local: there is no profile row to write, and no
     * sender has an address to reach.
     */
    fun setEmailConsent(enabled: Boolean) {
        val previous = _emailConsent.value
        _emailConsent.value = enabled
        consentService.setEmailConsent(enabled)
        _emailConsentError.value = null

        val userId = authRepository.currentUserId ?: return
        viewModelScope.launch {
            authRepository.setEmailMarketingAllowed(userId, enabled).onFailure {
                _emailConsent.value = previous
                consentService.setEmailConsent(previous)
                _emailConsentError.value = "Could not save your email preference. Check your connection and try again."
            }
        }
    }

    /**
     * Seed the toggle from the server. Called on profile load, because the
     * stored value is the only one that governs whether mail is sent.
     */
    private fun refreshEmailConsent(userId: String) {
        viewModelScope.launch {
            authRepository.isEmailMarketingAllowed(userId).onSuccess { allowed ->
                _emailConsent.value = allowed
                consentService.setEmailConsent(allowed)
            }
        }
    }

    fun clearEmailConsentError() { _emailConsentError.value = null }

    /**
     * Toggle analytics/telemetry consent. Revoking immediately disables Firebase
     * collection; AdTrackingService drops its queued events via its consent
     * observer, so no non-essential telemetry survives the opt-out.
     */
    fun setAnalyticsConsent(enabled: Boolean) {
        consentService.setAnalyticsConsent(enabled)
        analyticsService.applyConsent()
    }

    // MARK: - Profile Fields

    private val _firstName = MutableStateFlow("")
    val firstName: StateFlow<String> = _firstName.asStateFlow()

    private val _lastName = MutableStateFlow("")
    val lastName: StateFlow<String> = _lastName.asStateFlow()

    private val _email = MutableStateFlow("")
    val email: StateFlow<String> = _email.asStateFlow()

    private val _phone = MutableStateFlow("")
    val phone: StateFlow<String> = _phone.asStateFlow()

    private val _location = MutableStateFlow("")
    val location: StateFlow<String> = _location.asStateFlow()

    private val _selectedInterests = MutableStateFlow<Set<String>>(emptySet())
    val selectedInterests: StateFlow<Set<String>> = _selectedInterests.asStateFlow()

    // MARK: - State

    private val _profile = MutableStateFlow<UserProfile?>(null)
    val profile: StateFlow<UserProfile?> = _profile.asStateFlow()

    private val _isAuthenticated = MutableStateFlow(false)
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    private val _isSaving = MutableStateFlow(false)
    val isSaving: StateFlow<Boolean> = _isSaving.asStateFlow()

    private val _isDeleting = MutableStateFlow(false)
    val isDeleting: StateFlow<Boolean> = _isDeleting.asStateFlow()

    private val _showSaveSuccess = MutableStateFlow(false)
    val showSaveSuccess: StateFlow<Boolean> = _showSaveSuccess.asStateFlow()

    private val _showDeleteConfirmation = MutableStateFlow(false)
    val showDeleteConfirmation: StateFlow<Boolean> = _showDeleteConfirmation.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    val displayName: String get() = _profile.value?.displayName ?: "Guest"
    val initials: String get() = _profile.value?.initials ?: "?"

    init {
        startAuthListener()
    }

    private fun startAuthListener() {
        val sessionFlow = authRepository.sessionStatus ?: run {
            _isAuthenticated.value = false
            return
        }

        viewModelScope.launch {
            sessionFlow.collect { status ->
                when (status) {
                    is SessionStatus.Authenticated -> {
                        _isAuthenticated.value = true
                        loadProfile()
                    }
                    is SessionStatus.NotAuthenticated -> {
                        _isAuthenticated.value = false
                        _profile.value = null
                    }
                    else -> {}
                }
            }
        }
    }

    // MARK: - Load Profile

    fun loadProfile() {
        val userId = authRepository.currentUserId ?: return

        refreshEmailConsent(userId)

        viewModelScope.launch {
            authRepository.fetchProfile(userId).onSuccess { profile ->
                _profile.value = profile
                if (profile != null) {
                    _firstName.value = profile.firstName ?: ""
                    _lastName.value = profile.lastName ?: ""
                    _email.value = profile.email ?: ""
                    _phone.value = profile.phone ?: ""
                    _location.value = profile.location ?: ""
                    _selectedInterests.value = (profile.interests ?: emptyList()).toSet()
                }
            }
        }
    }

    // MARK: - Field Setters

    fun setFirstName(value: String) { _firstName.value = value }
    fun setLastName(value: String) { _lastName.value = value }
    fun setPhone(value: String) { _phone.value = value }
    fun setLocation(value: String) { _location.value = value }

    fun toggleInterest(interest: String) {
        val current = _selectedInterests.value.toMutableSet()
        if (current.contains(interest)) {
            current.remove(interest)
        } else {
            current.add(interest)
        }
        _selectedInterests.value = current
    }

    // MARK: - Save Profile

    fun saveProfile() {
        val userId = authRepository.currentUserId ?: return

        _isSaving.value = true
        _errorMessage.value = null

        viewModelScope.launch {
            authRepository.updateProfile(
                userId = userId,
                firstName = _firstName.value.ifEmpty { null },
                lastName = _lastName.value.ifEmpty { null },
                phone = _phone.value.ifEmpty { null },
                location = _location.value.ifEmpty { null },
                interests = if (_selectedInterests.value.isEmpty()) null else _selectedInterests.value.toList(),
            ).onSuccess {
                _showSaveSuccess.value = true
                // Refresh profile
                authRepository.fetchProfile(userId).onSuccess { profile ->
                    _profile.value = profile
                }
            }.onFailure { error ->
                _errorMessage.value = error.message ?: "Failed to save profile."
            }

            _isSaving.value = false
        }
    }

    // MARK: - Delete Account

    fun requestDeleteConfirmation() {
        _showDeleteConfirmation.value = true
    }

    fun dismissDeleteConfirmation() {
        _showDeleteConfirmation.value = false
    }

    fun deleteAccount() {
        _isDeleting.value = true
        _errorMessage.value = null
        _showDeleteConfirmation.value = false

        viewModelScope.launch {
            try {
                val client = SupabaseClientProvider.client
                    ?: throw Exception("Supabase is not configured.")

                // XPLAT-001: this used to POST an empty body, which the
                // delete-user-account function has rejected with a 400 since the
                // two-step confirmation flow (SEC-025) landed. Nothing was ever
                // deleted and Apple/Google both require in-app deletion to work.
                val requested = client.functions(
                    "delete-user-account",
                    body = buildJsonObject { put("action", "request") },
                ).bodyAsText()
                val token = Json.parseToJsonElement(requested)
                    .jsonObject["confirmation_token"]?.jsonPrimitive?.contentOrNull

                if (token.isNullOrEmpty()) {
                    throw Exception(
                        "The server did not return a confirmation token. " +
                            "Please try again or contact privacy@desmoinesinsider.com."
                    )
                }

                val confirmed = client.functions(
                    "delete-user-account",
                    body = buildJsonObject {
                        put("action", "confirm")
                        put("confirmation_token", token)
                    },
                ).bodyAsText()

                // The function only reports success once auth.users is gone.
                // Anything else must not sign the user out of a live account.
                val succeeded = Json.parseToJsonElement(confirmed)
                    .jsonObject["success"]?.jsonPrimitive?.booleanOrNull == true
                if (!succeeded) {
                    throw Exception(
                        "Your account was not deleted. " +
                            "Please try again or contact privacy@desmoinesinsider.com."
                    )
                }

                authRepository.signOut()
            } catch (e: Exception) {
                AppLogger.ui.error("Failed to delete account", e)
                _errorMessage.value = e.message ?: "Failed to delete account."
            }

            _isDeleting.value = false
        }
    }

    // MARK: - Sign Out

    fun signOut() {
        viewModelScope.launch {
            authRepository.signOut().onFailure { error ->
                _errorMessage.value = error.message ?: "Sign out failed."
            }
        }
    }

    // MARK: - Dialogs

    fun dismissSaveSuccess() {
        _showSaveSuccess.value = false
    }

    fun clearError() {
        _errorMessage.value = null
    }

    // MARK: - Debug

    fun resetOnboarding() {
        viewModelScope.launch {
            onboardingPreferences.resetOnboarding()
        }
    }

    companion object {
        val availableInterests = AuthViewModel.availableInterests
    }
}
