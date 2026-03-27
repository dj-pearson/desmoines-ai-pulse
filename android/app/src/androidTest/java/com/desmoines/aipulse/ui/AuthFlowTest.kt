package com.desmoines.aipulse.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.desmoines.aipulse.ui.screens.auth.AuthScreen
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import org.junit.Rule
import org.junit.Test

class AuthFlowTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private fun setAuthScreen() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                AuthScreen(
                    isSigningIn = false,
                    isSigningUp = false,
                    errorMessage = null,
                    showVerificationAlert = false,
                    lockoutSecondsRemaining = 0,
                    onSignIn = { _, _ -> },
                    onSignUp = { _, _, _, _, _, _ -> },
                    onSignInWithGoogle = {},
                    onResetPassword = {},
                    onDismissVerification = {},
                    onClearError = {},
                    onNavigateBack = {},
                )
            }
        }
    }

    @Test
    fun auth_signInTabDisplayed() {
        setAuthScreen()
        composeTestRule.onNodeWithText("Sign In").assertIsDisplayed()
    }

    @Test
    fun auth_signUpTabDisplayed() {
        setAuthScreen()
        composeTestRule.onNodeWithText("Sign Up").assertIsDisplayed()
    }

    @Test
    fun auth_emailFieldDisplayed() {
        setAuthScreen()
        composeTestRule.onNodeWithText("Email").assertIsDisplayed()
    }

    @Test
    fun auth_passwordFieldDisplayed() {
        setAuthScreen()
        composeTestRule.onNodeWithText("Password").assertIsDisplayed()
    }

    @Test
    fun auth_switchToSignUpTab() {
        setAuthScreen()

        composeTestRule.onNodeWithText("Sign Up").performClick()
        composeTestRule.waitForIdle()

        // Sign up form should show additional fields
        composeTestRule.onNodeWithText("First Name").assertIsDisplayed()
        composeTestRule.onNodeWithText("Last Name").assertIsDisplayed()
    }

    @Test
    fun auth_forgotPasswordDisplayedOnSignIn() {
        setAuthScreen()
        composeTestRule.onNodeWithText("Forgot Password?").assertIsDisplayed()
    }

    @Test
    fun auth_lockoutMessageDisplayed() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                AuthScreen(
                    isSigningIn = false,
                    isSigningUp = false,
                    errorMessage = null,
                    showVerificationAlert = false,
                    lockoutSecondsRemaining = 45,
                    onSignIn = { _, _ -> },
                    onSignUp = { _, _, _, _, _, _ -> },
                    onSignInWithGoogle = {},
                    onResetPassword = {},
                    onDismissVerification = {},
                    onClearError = {},
                    onNavigateBack = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Too many attempts", substring = true).assertIsDisplayed()
    }
}
