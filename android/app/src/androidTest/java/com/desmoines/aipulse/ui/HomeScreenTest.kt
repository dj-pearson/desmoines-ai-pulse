package com.desmoines.aipulse.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.desmoines.aipulse.data.model.DateFilterPreset
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.EventCategory
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.screens.home.HomeScreen
import com.desmoines.aipulse.ui.screens.home.HomeScreenState
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import org.junit.Rule
import org.junit.Test

class HomeScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val defaultState = HomeScreenState(
        events = listOf(Event.preview()),
        featuredEvents = listOf(Event.preview()),
        restaurants = listOf(Restaurant.preview()),
        isLoading = false,
        isLoadingMore = false,
        isRefreshing = false,
        hasMore = false,
        totalCount = 1,
        errorMessage = null,
        searchText = "",
        selectedCategory = null,
        selectedDatePreset = null,
        showFeaturedOnly = false,
        showFreeOnly = false,
        maxDistance = null,
        minRating = null,
        activeFilterCount = 0,
        currentTier = SubscriptionTier.FREE,
        isOffline = false,
    )

    private fun setHomeScreen(state: HomeScreenState = defaultState) {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                HomeScreen(
                    state = state,
                    onEventClick = {},
                    onRestaurantClick = {},
                    onCategorySelected = {},
                    onDatePresetSelected = {},
                    onClearFilters = {},
                    onRefresh = {},
                    onLoadMore = {},
                    onFilterClick = {},
                    onFavoriteClick = {},
                    onNavigateToSubscription = {},
                )
            }
        }
    }

    @Test
    fun home_headerDisplayed() {
        setHomeScreen()
        composeTestRule.onNodeWithText("What's happening in Des Moines", substring = true).assertIsDisplayed()
    }

    @Test
    fun home_categoryChipsDisplayed() {
        setHomeScreen()
        // First few category chips should be visible
        composeTestRule.onNodeWithText("Music").assertIsDisplayed()
    }

    @Test
    fun home_featuredSectionDisplayed() {
        setHomeScreen()
        composeTestRule.onNodeWithText("Featured Events", substring = true).assertIsDisplayed()
    }

    @Test
    fun home_restaurantsSectionDisplayed() {
        setHomeScreen()
        composeTestRule.onNodeWithText("Popular Restaurants", substring = true).assertIsDisplayed()
    }

    @Test
    fun home_loadingStateShowsSkeletons() {
        setHomeScreen(
            defaultState.copy(
                isLoading = true,
                events = emptyList(),
                featuredEvents = emptyList(),
                restaurants = emptyList(),
            )
        )

        composeTestRule.onNodeWithContentDescription("Loading event", substring = true).assertIsDisplayed()
    }

    @Test
    fun home_emptyStateDisplayed() {
        setHomeScreen(
            defaultState.copy(
                events = emptyList(),
                featuredEvents = emptyList(),
                totalCount = 0,
            )
        )

        composeTestRule.onNodeWithText("No events found", substring = true).assertIsDisplayed()
    }

    @Test
    fun home_errorBannerDisplayed() {
        setHomeScreen(defaultState.copy(errorMessage = "Failed to load events"))

        composeTestRule.onNodeWithText("Failed to load events").assertIsDisplayed()
    }

    @Test
    fun home_datePresetsDisplayed() {
        setHomeScreen()
        composeTestRule.onNodeWithText("Today").assertIsDisplayed()
        composeTestRule.onNodeWithText("This Weekend").assertIsDisplayed()
    }
}
