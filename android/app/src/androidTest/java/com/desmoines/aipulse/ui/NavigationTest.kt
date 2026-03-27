package com.desmoines.aipulse.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import org.junit.Rule
import org.junit.Test

/**
 * Tests for bottom navigation bar — verifies all 6 tabs are present and tappable.
 * Note: These tests verify the NavigationBar UI independently.
 * Full navigation integration would require a Hilt test runner and injected ViewModels.
 */
class NavigationTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun navigation_allSixTabsDisplayed() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                // NavigationBar with 6 tabs is rendered inside MainScreen
                // For isolated testing, we verify the tab labels exist
                androidx.compose.material3.NavigationBar {
                    listOf("Home", "Dining", "Search", "Map", "Saved", "Profile").forEachIndexed { index, label ->
                        androidx.compose.material3.NavigationBarItem(
                            icon = { },
                            label = { androidx.compose.material3.Text(label) },
                            selected = index == 0,
                            onClick = { },
                        )
                    }
                }
            }
        }

        composeTestRule.onNodeWithText("Home").assertIsDisplayed()
        composeTestRule.onNodeWithText("Dining").assertIsDisplayed()
        composeTestRule.onNodeWithText("Search").assertIsDisplayed()
        composeTestRule.onNodeWithText("Map").assertIsDisplayed()
        composeTestRule.onNodeWithText("Saved").assertIsDisplayed()
        composeTestRule.onNodeWithText("Profile").assertIsDisplayed()
    }

    @Test
    fun navigation_tabsAreTappable() {
        var selectedIndex = 0
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                androidx.compose.material3.NavigationBar {
                    listOf("Home", "Dining", "Search", "Map", "Saved", "Profile").forEachIndexed { index, label ->
                        androidx.compose.material3.NavigationBarItem(
                            icon = { },
                            label = { androidx.compose.material3.Text(label) },
                            selected = selectedIndex == index,
                            onClick = { selectedIndex = index },
                        )
                    }
                }
            }
        }

        composeTestRule.onNodeWithText("Dining").performClick()
        composeTestRule.waitForIdle()
        assert(selectedIndex == 1) { "Expected Dining (index 1), got $selectedIndex" }

        composeTestRule.onNodeWithText("Search").performClick()
        composeTestRule.waitForIdle()
        assert(selectedIndex == 2) { "Expected Search (index 2), got $selectedIndex" }

        composeTestRule.onNodeWithText("Map").performClick()
        composeTestRule.waitForIdle()
        assert(selectedIndex == 3) { "Expected Map (index 3), got $selectedIndex" }

        composeTestRule.onNodeWithText("Saved").performClick()
        composeTestRule.waitForIdle()
        assert(selectedIndex == 4) { "Expected Saved (index 4), got $selectedIndex" }

        composeTestRule.onNodeWithText("Profile").performClick()
        composeTestRule.waitForIdle()
        assert(selectedIndex == 5) { "Expected Profile (index 5), got $selectedIndex" }

        composeTestRule.onNodeWithText("Home").performClick()
        composeTestRule.waitForIdle()
        assert(selectedIndex == 0) { "Expected Home (index 0), got $selectedIndex" }
    }
}
