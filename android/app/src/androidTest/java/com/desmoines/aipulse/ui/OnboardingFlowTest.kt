package com.desmoines.aipulse.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.desmoines.aipulse.ui.screens.onboarding.OnboardingScreen
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import org.junit.Rule
import org.junit.Test

class OnboardingFlowTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun onboarding_displaysFirstPage() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                OnboardingScreen(onComplete = {})
            }
        }

        composeTestRule.onNodeWithText("Welcome to Des Moines Insider").assertIsDisplayed()
    }

    @Test
    fun onboarding_skipButtonVisible() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                OnboardingScreen(onComplete = {})
            }
        }

        composeTestRule.onNodeWithText("Skip").assertIsDisplayed()
    }

    @Test
    fun onboarding_nextButtonNavigatesToSecondPage() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                OnboardingScreen(onComplete = {})
            }
        }

        composeTestRule.onNodeWithText("Next").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Save Your Favorites").assertIsDisplayed()
    }

    @Test
    fun onboarding_navigateToThirdPage() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                OnboardingScreen(onComplete = {})
            }
        }

        // Page 1 -> 2
        composeTestRule.onNodeWithText("Next").performClick()
        composeTestRule.waitForIdle()

        // Page 2 -> 3
        composeTestRule.onNodeWithText("Next").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Explore What's Nearby").assertIsDisplayed()
    }

    @Test
    fun onboarding_getStartedOnLastPage() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                OnboardingScreen(onComplete = {})
            }
        }

        // Navigate to page 3
        composeTestRule.onNodeWithText("Next").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Next").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Get Started").assertIsDisplayed()
    }

    @Test
    fun onboarding_skipCallsOnComplete() {
        var completed = false
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                OnboardingScreen(onComplete = { completed = true })
            }
        }

        composeTestRule.onNodeWithText("Skip").performClick()
        composeTestRule.waitForIdle()

        assert(completed) { "onComplete should be called when Skip is tapped" }
    }
}
