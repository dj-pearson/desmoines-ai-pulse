package com.desmoines.aipulse.ui.screens.auth

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.desmoines.aipulse.ui.components.BrandPrimaryButton
import com.desmoines.aipulse.ui.theme.Dimens

/**
 * Choose a new password after opening a reset link (AND-OVH-006). Mirrors iOS
 * SetNewPasswordView, except that there is no "Not now": the story asks for the
 * user to stay here until the password is set or they sign out, so the screen
 * has no back arrow and swallows Back, as ForceUpdateScreen does.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetNewPasswordScreen(
    onPasswordSet: () -> Unit,
    onSignedOut: () -> Unit,
    viewModel: SetNewPasswordViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current

    var password by rememberSaveable { mutableStateOf("") }
    var confirmation by rememberSaveable { mutableStateOf("") }
    var passwordVisible by rememberSaveable { mutableStateOf(false) }

    BackHandler(enabled = true) { /* intentionally no-op: set a password or sign out */ }

    LaunchedEffect(state.exit) {
        when (state.exit) {
            SetNewPasswordViewModel.Exit.PASSWORD_SET -> onPasswordSet()
            SetNewPasswordViewModel.Exit.SIGNED_OUT -> onSignedOut()
            null -> Unit
        }
    }

    // Inline hint once both fields have something in them; the server's answer
    // (and a tap on Save with a bad pair) arrives through state.errorMessage.
    val hint = if (password.isNotEmpty() && confirmation.isNotEmpty()) {
        SetNewPasswordViewModel.validationMessage(password, confirmation)
    } else {
        null
    }
    val message = state.errorMessage ?: hint

    val save = {
        focusManager.clearFocus()
        viewModel.save(password, confirmation)
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Reset password") }) },
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Dimens.SpacingLg),
            verticalArrangement = Arrangement.spacedBy(Dimens.SpacingMd),
        ) {
            Text(
                text = "Choose a new password",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "You're signed in from your reset link. Set a new password to " +
                    "finish, or sign out.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            OutlinedTextField(
                value = password,
                onValueChange = {
                    password = it
                    viewModel.clearError()
                },
                label = { Text("New password") },
                singleLine = true,
                visualTransformation = if (passwordVisible) VisualTransformation.None
                else PasswordVisualTransformation(),
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            if (passwordVisible) Icons.Filled.VisibilityOff
                            else Icons.Filled.Visibility,
                            contentDescription = if (passwordVisible) "Hide password" else "Show password",
                        )
                    }
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Next,
                ),
                keyboardActions = KeyboardActions(
                    onNext = { focusManager.moveFocus(FocusDirection.Next) },
                ),
                shape = RoundedCornerShape(Dimens.CardCornerRadius),
                modifier = Modifier.fillMaxWidth(),
            )

            OutlinedTextField(
                value = confirmation,
                onValueChange = {
                    confirmation = it
                    viewModel.clearError()
                },
                label = { Text("Confirm new password") },
                singleLine = true,
                visualTransformation = if (passwordVisible) VisualTransformation.None
                else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { save() }),
                shape = RoundedCornerShape(Dimens.CardCornerRadius),
                modifier = Modifier.fillMaxWidth(),
            )

            if (message != null) {
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }

            Spacer(modifier = Modifier.height(Dimens.SpacingSm))

            BrandPrimaryButton(
                onClick = save,
                isLoading = state.isSaving,
                enabled = !state.isSaving,
                text = "Save password",
            )

            TextButton(
                onClick = { viewModel.signOut() },
                enabled = !state.isSaving,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            ) {
                Text("Sign out")
            }
        }
    }
}
