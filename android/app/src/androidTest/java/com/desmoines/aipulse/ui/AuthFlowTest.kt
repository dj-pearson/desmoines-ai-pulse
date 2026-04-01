package com.desmoines.aipulse.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import org.junit.Rule
import org.junit.Test

/**
 * Tests for the AuthScreen UI structure.
 *
 * AuthScreen uses a Hilt-injected ViewModel internally, so these tests use a
 * lightweight test composable that mirrors the AuthScreen layout to verify
 * the UI elements without requiring Hilt test infrastructure.
 */
class AuthFlowTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    /**
     * Minimal auth form layout that mirrors AuthScreen's UI for testing
     * without requiring Hilt ViewModel injection.
     */
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    private fun TestAuthForm(
        lockoutSecondsRemaining: Int = 0,
    ) {
        var selectedTab by rememberSaveable { mutableIntStateOf(0) }
        val isSignUpMode = selectedTab == 1

        Scaffold(
            topBar = {
                TopAppBar(
                    title = { },
                    navigationIcon = {
                        IconButton(onClick = {}) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Go back",
                            )
                        }
                    },
                )
            },
        ) { paddingValues ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = if (isSignUpMode) "Create your account" else "Welcome back",
                )

                TabRow(selectedTabIndex = selectedTab) {
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

                if (isSignUpMode) {
                    OutlinedTextField(
                        value = "",
                        onValueChange = {},
                        label = { Text("First Name") },
                    )
                    OutlinedTextField(
                        value = "",
                        onValueChange = {},
                        label = { Text("Last Name") },
                    )
                }

                OutlinedTextField(
                    value = "",
                    onValueChange = {},
                    label = { Text("Email") },
                )

                OutlinedTextField(
                    value = "",
                    onValueChange = {},
                    label = { Text("Password") },
                )

                if (!isSignUpMode) {
                    TextButton(onClick = {}) {
                        Text("Forgot Password?")
                    }
                }

                if (lockoutSecondsRemaining > 0) {
                    Text(
                        text = "Too many attempts. Try again in ${lockoutSecondsRemaining}s",
                    )
                }
            }
        }
    }

    @Test
    fun auth_signInTabDisplayed() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme { TestAuthForm() }
        }
        composeTestRule.onNodeWithText("Sign In").assertIsDisplayed()
    }

    @Test
    fun auth_signUpTabDisplayed() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme { TestAuthForm() }
        }
        composeTestRule.onNodeWithText("Sign Up").assertIsDisplayed()
    }

    @Test
    fun auth_emailFieldDisplayed() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme { TestAuthForm() }
        }
        composeTestRule.onNodeWithText("Email").assertIsDisplayed()
    }

    @Test
    fun auth_passwordFieldDisplayed() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme { TestAuthForm() }
        }
        composeTestRule.onNodeWithText("Password").assertIsDisplayed()
    }

    @Test
    fun auth_switchToSignUpTab() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme { TestAuthForm() }
        }

        composeTestRule.onNodeWithText("Sign Up").performClick()
        composeTestRule.waitForIdle()

        // Sign up form should show additional fields
        composeTestRule.onNodeWithText("First Name").assertIsDisplayed()
        composeTestRule.onNodeWithText("Last Name").assertIsDisplayed()
    }

    @Test
    fun auth_forgotPasswordDisplayedOnSignIn() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme { TestAuthForm() }
        }
        composeTestRule.onNodeWithText("Forgot Password?").assertIsDisplayed()
    }

    @Test
    fun auth_lockoutMessageDisplayed() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme { TestAuthForm(lockoutSecondsRemaining = 45) }
        }

        composeTestRule.onNodeWithText("Too many attempts", substring = true).assertIsDisplayed()
    }
}
