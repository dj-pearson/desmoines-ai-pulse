package com.desmoines.aipulse.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.desmoines.aipulse.ui.screens.search.SearchScreen
import com.desmoines.aipulse.ui.screens.search.SearchScreenState
import com.desmoines.aipulse.ui.screens.search.SearchTab
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import org.junit.Rule
import org.junit.Test

class SearchScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val defaultState = SearchScreenState(
        eventResults = emptyList(),
        restaurantResults = emptyList(),
        attractionResults = emptyList(),
        isSearching = false,
        hasSearched = false,
        searchText = "",
        selectedTab = SearchTab.EVENTS,
    )

    private fun setSearchScreen(state: SearchScreenState = defaultState) {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                SearchScreen(
                    state = state,
                    onSearchTextChanged = {},
                    onTabSelected = {},
                    onClearSearch = {},
                    onNavigateToEventDetail = {},
                    onNavigateToRestaurantDetail = {},
                    onNavigateToAttractionDetail = {},
                )
            }
        }
    }

    @Test
    fun search_searchBarDisplayed() {
        setSearchScreen()
        composeTestRule.onNodeWithText("Search events, restaurants", substring = true).assertIsDisplayed()
    }

    @Test
    fun search_suggestionsDisplayedBeforeSearch() {
        setSearchScreen()
        // Popular categories should be visible before search
        composeTestRule.onNodeWithText("Popular Categories", substring = true).assertIsDisplayed()
    }

    @Test
    fun search_tabsDisplayedAfterSearch() {
        setSearchScreen(defaultState.copy(hasSearched = true, searchText = "test"))
        composeTestRule.onNodeWithText("Events").assertIsDisplayed()
        composeTestRule.onNodeWithText("Restaurants").assertIsDisplayed()
        composeTestRule.onNodeWithText("Attractions").assertIsDisplayed()
    }

    @Test
    fun search_loadingStateDisplayed() {
        setSearchScreen(defaultState.copy(isSearching = true, searchText = "pizza"))
        composeTestRule.onNodeWithText("Searching", substring = true).assertIsDisplayed()
    }

    @Test
    fun search_noResultsDisplayed() {
        setSearchScreen(
            defaultState.copy(
                hasSearched = true,
                searchText = "xyznonexistent",
            )
        )
        composeTestRule.onNodeWithText("No Results", substring = true).assertIsDisplayed()
    }

    @Test
    fun search_tabSwitching() {
        var selectedTab = SearchTab.EVENTS
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                SearchScreen(
                    state = defaultState.copy(hasSearched = true, searchText = "test"),
                    onSearchTextChanged = {},
                    onTabSelected = { selectedTab = it },
                    onClearSearch = {},
                    onNavigateToEventDetail = {},
                    onNavigateToRestaurantDetail = {},
                    onNavigateToAttractionDetail = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Restaurants").performClick()
        composeTestRule.waitForIdle()

        assert(selectedTab == SearchTab.RESTAURANTS)
    }
}
