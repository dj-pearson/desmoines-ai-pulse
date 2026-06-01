package com.desmoines.aipulse.ui.screens.auth

import android.app.Activity
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.LiveRegionMode
import com.desmoines.aipulse.ui.components.BrandPrimaryButton
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.hilt.navigation.compose.hiltViewModel
import com.desmoines.aipulse.ui.theme.Dimens
import com.desmoines.aipulse.util.AuthErrorMapper
import com.desmoines.aipulse.util.Config
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

/**
 * Authentication screen with Sign In / Sign Up tabs and Google Sign-In.
 * Mirrors iOS AuthView.swift layout and behavior.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AuthScreen(
    onNavigateBack: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val isAuthenticated by viewModel.isAuthenticated.collectAsState()
    val isSigningIn by viewModel.isSigningIn.collectAsState()
    val isSigningUp by viewModel.isSigningUp.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    val showVerificationAlert by viewModel.showVerificationAlert.collectAsState()
    val lockoutSeconds by viewModel.lockoutSecondsRemaining.collectAsState()
    val recoveryAction by viewModel.recoveryAction.collectAsState()

    val snackbarHostState = remember { SnackbarHostState() }
    val focusManager = LocalFocusManager.current

    // Tab state: 0 = Sign In, 1 = Sign Up
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    val isSignUpMode = selectedTab == 1

    // Form fields
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirmPassword by rememberSaveable { mutableStateOf("") }
    var firstName by rememberSaveable { mutableStateOf("") }
    var lastName by rememberSaveable { mutableStateOf("") }
    var selectedInterests by remember { mutableStateOf(setOf<String>()) }
    var passwordVisible by rememberSaveable { mutableStateOf(false) }
    var confirmPasswordVisible by rememberSaveable { mutableStateOf(false) }

    // Navigate back on successful auth
    LaunchedEffect(isAuthenticated) {
        if (isAuthenticated) {
            onNavigateBack()
        }
    }

    // Show error in snackbar
    LaunchedEffect(errorMessage) {
        errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Go back",
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Header
            Text(
                text = if (isSignUpMode) "Create your account" else "Welcome back",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(Dimens.SpacingXs))
            Text(
                text = if (isSignUpMode) "Sign up to save favorites and more"
                else "Sign in to your Des Moines Insider account",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(Dimens.SpacingXl))

            // Tab Row (Sign In / Sign Up)
            TabRow(
                selectedTabIndex = selectedTab,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Dimens.SpacingLg),
            ) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Sign In") },
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Sign Up") },
                )
            }

            Spacer(modifier = Modifier.height(Dimens.SpacingXl))

            // Form
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Dimens.SpacingLg)
                    .animateContentSize(),
                verticalArrangement = Arrangement.spacedBy(Dimens.SpacingMd),
            ) {
                // Name fields (sign up only)
                if (isSignUpMode) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(Dimens.SpacingMd),
                    ) {
                        OutlinedTextField(
                            value = firstName,
                            onValueChange = { firstName = it },
                            label = { Text("First Name") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                imeAction = ImeAction.Next,
                            ),
                            keyboardActions = KeyboardActions(
                                onNext = { focusManager.moveFocus(FocusDirection.Next) },
                            ),
                            shape = RoundedCornerShape(Dimens.CardCornerRadius),
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = lastName,
                            onValueChange = { lastName = it },
                            label = { Text("Last Name") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                imeAction = ImeAction.Next,
                            ),
                            keyboardActions = KeyboardActions(
                                onNext = { focusManager.moveFocus(FocusDirection.Next) },
                            ),
                            shape = RoundedCornerShape(Dimens.CardCornerRadius),
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                // Email field
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    singleLine = true,
                    isError = email.isNotEmpty() && !viewModel.isEmailValid(email),
                    supportingText = if (email.isNotEmpty() && !viewModel.isEmailValid(email)) {
                        { Text("Please enter a valid email address") }
                    } else null,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next,
                    ),
                    keyboardActions = KeyboardActions(
                        onNext = { focusManager.moveFocus(FocusDirection.Next) },
                    ),
                    shape = RoundedCornerShape(Dimens.CardCornerRadius),
                    modifier = Modifier.fillMaxWidth(),
                )

                // Password field
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
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
                        imeAction = if (isSignUpMode) ImeAction.Next else ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onNext = { focusManager.moveFocus(FocusDirection.Next) },
                        onDone = {
                            focusManager.clearFocus()
                            if (!isSignUpMode) {
                                viewModel.signIn(email, password)
                            }
                        },
                    ),
                    shape = RoundedCornerShape(Dimens.CardCornerRadius),
                    modifier = Modifier.fillMaxWidth(),
                )

                // Password strength bar and requirements (sign up only)
                if (isSignUpMode && password.isNotEmpty()) {
                    PasswordStrengthBar(strength = viewModel.passwordStrength(password))
                }

                // Inline password requirements (sign up only, shown when password field focused)
                if (isSignUpMode && password.isEmpty()) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            text = "Password requirements:",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        AuthErrorMapper.passwordRequirements.forEach { req ->
                            Text(
                                text = "  \u2022 $req",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            )
                        }
                    }
                }

                // Confirm password (sign up only)
                if (isSignUpMode) {
                    OutlinedTextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it },
                        label = { Text("Confirm Password") },
                        singleLine = true,
                        isError = confirmPassword.isNotEmpty() && !viewModel.passwordsMatch(password, confirmPassword),
                        supportingText = if (confirmPassword.isNotEmpty() && !viewModel.passwordsMatch(password, confirmPassword)) {
                            { Text("Passwords do not match") }
                        } else null,
                        visualTransformation = if (confirmPasswordVisible) VisualTransformation.None
                        else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { confirmPasswordVisible = !confirmPasswordVisible }) {
                                Icon(
                                    if (confirmPasswordVisible) Icons.Filled.VisibilityOff
                                    else Icons.Filled.Visibility,
                                    contentDescription = if (confirmPasswordVisible) "Hide password" else "Show password",
                                )
                            }
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done,
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { focusManager.clearFocus() },
                        ),
                        shape = RoundedCornerShape(Dimens.CardCornerRadius),
                        modifier = Modifier.fillMaxWidth(),
                    )

                    // Interests section
                    InterestsSection(
                        selectedInterests = selectedInterests,
                        onToggleInterest = { interest ->
                            selectedInterests = if (interest in selectedInterests) {
                                selectedInterests - interest
                            } else {
                                selectedInterests + interest
                            }
                        },
                    )
                }

                // Lockout warning
                if (lockoutSeconds > 0) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics {
                                liveRegion = LiveRegionMode.Polite
                                contentDescription = "Too many attempts. Try again in $lockoutSeconds seconds."
                            },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(Dimens.SpacingSm),
                    ) {
                        Icon(
                            Icons.Filled.Lock,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(Dimens.IconSizeSmall),
                        )
                        Text(
                            text = "Too many attempts. Try again in ${lockoutSeconds}s",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }

                // Recovery action buttons based on error context
                if (recoveryAction != null && errorMessage != null) {
                    when (recoveryAction) {
                        AuthErrorMapper.RecoveryAction.RESEND_VERIFICATION -> {
                            TextButton(
                                onClick = { viewModel.resendVerification(email) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Resend Verification Email")
                            }
                        }
                        AuthErrorMapper.RecoveryAction.FORGOT_PASSWORD -> {
                            TextButton(
                                onClick = { viewModel.resetPassword(email) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Reset Password")
                            }
                        }
                        else -> {} // Other recovery actions don't need inline buttons
                    }
                }
            }

            Spacer(modifier = Modifier.height(Dimens.SpacingXl))

            // Primary action button (migrated to brand button system)
            BrandPrimaryButton(
                onClick = {
                    focusManager.clearFocus()
                    if (isSignUpMode) {
                        viewModel.signUp(email, password, confirmPassword, firstName, lastName, selectedInterests)
                    } else {
                        viewModel.signIn(email, password)
                    }
                },
                modifier = Modifier.padding(horizontal = Dimens.SpacingLg),
                enabled = lockoutSeconds <= 0,
                isLoading = isSigningIn || isSigningUp,
                text = if (isSignUpMode) "Create Account" else "Sign In",
            )

            // Forgot password (sign in only)
            if (!isSignUpMode) {
                TextButton(
                    onClick = { viewModel.resetPassword(email) },
                ) {
                    Text("Forgot Password?")
                }
            }

            Spacer(modifier = Modifier.height(Dimens.SpacingLg))

            // Divider with "or"
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Dimens.SpacingLg),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                HorizontalDivider(modifier = Modifier.weight(1f))
                Text(
                    text = "or",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = Dimens.SpacingMd),
                )
                HorizontalDivider(modifier = Modifier.weight(1f))
            }

            Spacer(modifier = Modifier.height(Dimens.SpacingLg))

            // Google Sign-In button
            GoogleSignInButton(
                onIdToken = { idToken -> viewModel.signInWithGoogle(idToken) },
                enabled = !isSigningIn && !isSigningUp && lockoutSeconds <= 0,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Dimens.SpacingLg),
            )

            Spacer(modifier = Modifier.height(Dimens.SpacingXxxl))
        }
    }

    // Verification email alert dialog
    if (showVerificationAlert) {
        AlertDialog(
            onDismissRequest = {
                viewModel.dismissVerificationAlert()
                onNavigateBack()
            },
            title = { Text("Check Your Email") },
            text = {
                Text("We've sent a verification link to your email. Please verify your account to continue.")
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.dismissVerificationAlert()
                    onNavigateBack()
                }) {
                    Text("OK")
                }
            },
        )
    }
}

// MARK: - Password Strength Bar

@Composable
private fun PasswordStrengthBar(
    strength: AuthViewModel.PasswordStrength,
    modifier: Modifier = Modifier,
) {
    val progress = when (strength) {
        AuthViewModel.PasswordStrength.NONE -> 0f
        AuthViewModel.PasswordStrength.WEAK -> 0.33f
        AuthViewModel.PasswordStrength.MEDIUM -> 0.66f
        AuthViewModel.PasswordStrength.STRONG -> 1f
    }
    val color = when (strength) {
        AuthViewModel.PasswordStrength.NONE -> Color.Gray
        AuthViewModel.PasswordStrength.WEAK -> MaterialTheme.colorScheme.error
        AuthViewModel.PasswordStrength.MEDIUM -> Color(0xFFF97316) // orange
        AuthViewModel.PasswordStrength.STRONG -> Color(0xFF4CAF50) // green
    }
    val label = when (strength) {
        AuthViewModel.PasswordStrength.NONE -> ""
        AuthViewModel.PasswordStrength.WEAK -> "Weak"
        AuthViewModel.PasswordStrength.MEDIUM -> "Medium"
        AuthViewModel.PasswordStrength.STRONG -> "Strong"
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                contentDescription = "Password strength: $label"
            },
    ) {
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp)),
            color = color,
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
            strokeCap = StrokeCap.Round,
        )
        if (label.isNotEmpty()) {
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Medium,
                color = color,
            )
        }
    }
}

// MARK: - Interests Section

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InterestsSection(
    selectedInterests: Set<String>,
    onToggleInterest: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "What interests you?",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(Dimens.SpacingSm))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(Dimens.SpacingSm),
            verticalArrangement = Arrangement.spacedBy(Dimens.SpacingSm),
        ) {
            AuthViewModel.availableInterests.forEach { interest ->
                val isSelected = interest in selectedInterests
                FilterChip(
                    selected = isSelected,
                    onClick = { onToggleInterest(interest) },
                    label = {
                        Text(
                            text = interest,
                            style = MaterialTheme.typography.labelMedium,
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                        selectedLabelColor = MaterialTheme.colorScheme.primary,
                    ),
                )
            }
        }
    }
}

// MARK: - Google Sign-In Button

@Composable
private fun GoogleSignInButton(
    onIdToken: (String) -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    OutlinedButton(
        onClick = {
            val credentialManager = CredentialManager.create(context)
            val googleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(Config.GOOGLE_WEB_CLIENT_ID)
                .build()
            val request = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()

            val activity = context as? Activity ?: return@OutlinedButton
            scope.launch {
                try {
                    val result = credentialManager.getCredential(activity, request)
                    val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(result.credential.data)
                    onIdToken(googleIdTokenCredential.idToken)
                } catch (_: GetCredentialCancellationException) {
                    // User cancelled — no action needed
                } catch (e: Exception) {
                    android.util.Log.e("AuthScreen", "Google Sign-In failed", e)
                }
            }
        },
        enabled = enabled,
        modifier = modifier.height(Dimens.ButtonHeight),
        shape = RoundedCornerShape(Dimens.CardCornerRadius),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
    ) {
        // Google "G" icon placeholder (text-based since we don't bundle the asset)
        Text(
            text = "G",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = if (enabled) Color(0xFF4285F4) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
        )
        Spacer(modifier = Modifier.width(Dimens.SpacingSm))
        Text(
            text = "Continue with Google",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
        )
    }
}
