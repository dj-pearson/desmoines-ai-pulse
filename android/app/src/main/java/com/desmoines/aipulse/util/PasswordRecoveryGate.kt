package com.desmoines.aipulse.util

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Holds the app on the set-new-password screen after a reset link signs the
 * user in (AND-OVH-006, mirroring iOS AuthService.needsPasswordReset).
 *
 * A recovery session is a full session, so without this the link signed the
 * user in and nothing else: the forgotten password stayed forgotten. While
 * [required] is true MainScreen sends every navigation back to
 * Route.SetNewPassword. It clears when the password is saved or the user signs
 * out.
 *
 * In memory only. If the process dies the user is still signed in with the
 * recovery session and can request another link; persisting the flag would
 * need its own expiry rules, and iOS does not persist it either.
 */
@Singleton
class PasswordRecoveryGate @Inject constructor() {

    private val _required = MutableStateFlow(false)
    val required: StateFlow<Boolean> = _required.asStateFlow()

    fun require() {
        _required.value = true
    }

    fun clear() {
        _required.value = false
    }
}
