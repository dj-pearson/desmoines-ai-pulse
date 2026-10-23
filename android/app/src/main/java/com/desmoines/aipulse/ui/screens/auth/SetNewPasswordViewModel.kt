package com.desmoines.aipulse.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.ui.screens.auth.AuthViewModel.PasswordStrength
import com.desmoines.aipulse.util.AuthCallbackNotices
import com.desmoines.aipulse.util.AuthErrorMapper
import com.desmoines.aipulse.util.PasswordRecoveryGate
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Finishes a password reset on the device (AND-OVH-006), mirroring iOS
 * SetNewPasswordView.
 *
 * The reset link used to have nowhere to land: the mail carried no redirect, so
 * it went to the website, and nothing in the app called updateUser. A reset
 * link now opens the app, its code is exchanged for a recovery session, and
 * [PasswordRecoveryGate] keeps the user here until the password is saved or
 * they sign out.
 */
@HiltViewModel
class SetNewPasswordViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val passwordRecoveryGate: PasswordRecoveryGate,
    private val authCallbackNotices: AuthCallbackNotices,
) : ViewModel() {

    /** How the screen is left. Both replace it with Home. */
    enum class Exit { PASSWORD_SET, SIGNED_OUT }

    data class UiState(
        val isSaving: Boolean = false,
        val errorMessage: String? = null,
        val exit: Exit? = null,
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init {
        // A session can end without this screen's button (the biometric lock's
        // sign-out, an expired refresh token). Without a session there is no
        // password to set, so the gate has to open or the user is stuck here.
        authRepository.sessionStatus?.let { status ->
            viewModelScope.launch {
                status.collect {
                    if (it is SessionStatus.NotAuthenticated) leave(Exit.SIGNED_OUT)
                }
            }
        }
    }

    fun save(password: String, confirmation: String) {
        if (_uiState.value.isSaving) return
        validationMessage(password, confirmation)?.let { message ->
            _uiState.update { it.copy(errorMessage = message) }
            return
        }

        _uiState.update { it.copy(isSaving = true, errorMessage = null) }
        viewModelScope.launch {
            authRepository.updatePassword(password)
                .onSuccess {
                    authCallbackNotices.post(
                        AuthCallbackNotices.Notice.PasswordUpdated(AuthCallbackNotices.PASSWORD_UPDATED_MESSAGE),
                    )
                    leave(Exit.PASSWORD_SET)
                }
                .onFailure { error ->
                    _uiState.update { it.copy(errorMessage = AuthErrorMapper.map(error).message) }
                }
            _uiState.update { it.copy(isSaving = false) }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            // AuthRepository.signOut tears down local state even when the
            // remote call fails, so the user is signed out either way.
            authRepository.signOut()
            leave(Exit.SIGNED_OUT)
        }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    private fun leave(exit: Exit) {
        passwordRecoveryGate.clear()
        _uiState.update { if (it.exit == null) it.copy(exit = exit) else it }
    }

    companion object {
        const val MIN_LENGTH = 8

        /**
         * The sign-up rules (AuthViewModel.signUp), so a reset can't set a
         * password sign-up would refuse. Null when the pair can be saved.
         */
        fun validationMessage(password: String, confirmation: String): String? = when {
            password.length < MIN_LENGTH -> "Use at least $MIN_LENGTH characters."
            AuthViewModel.strengthOf(password) == PasswordStrength.WEAK ->
                "Too weak. Mix uppercase, lowercase and numbers."
            password != confirmation -> "Passwords do not match."
            else -> null
        }
    }
}
