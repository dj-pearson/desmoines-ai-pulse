package com.desmoines.aipulse.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.screens.favorites.FavoritesScreen
import com.desmoines.aipulse.ui.screens.favorites.FavoritesScreenState
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import org.junit.Rule
import org.junit.Test

class FavoritesScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun favorites_unauthenticatedShowsSignInPrompt() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                FavoritesScreen(
                    state = FavoritesScreenState(
                        isAuthenticated = false,
                        isLoading = false,
                        isRefreshing = false,
                        upcomingEvents = emptyList(),
                        pastEvents = emptyList(),
                        favoriteRestaurants = emptyList(),
                        favoriteEventIds = emptySet(),
                        favoriteRestaurantIds = emptySet(),
                        currentTier = SubscriptionTier.FREE,
                        errorMessage = null,
                    ),
                    onNavigateToAuth = {},
                    onNavigateToEventDetail = {},
                    onNavigateToRestaurantDetail = {},
                    onRemoveEventFavorite = {},
                    onRemoveRestaurantFavorite = {},
                    onRefresh = {},
                    onNavigateToSubscription = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Sign In to Save Items", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("Sign In").assertIsDisplayed()
    }

    @Test
    fun favorites_authenticatedEmptyShowsEmptyState() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                FavoritesScreen(
                    state = FavoritesScreenState(
                        isAuthenticated = true,
                        isLoading = false,
                        isRefreshing = false,
                        upcomingEvents = emptyList(),
                        pastEvents = emptyList(),
                        favoriteRestaurants = emptyList(),
                        favoriteEventIds = emptySet(),
                        favoriteRestaurantIds = emptySet(),
                        currentTier = SubscriptionTier.FREE,
                        errorMessage = null,
                    ),
                    onNavigateToAuth = {},
                    onNavigateToEventDetail = {},
                    onNavigateToRestaurantDetail = {},
                    onRemoveEventFavorite = {},
                    onRemoveRestaurantFavorite = {},
                    onRefresh = {},
                    onNavigateToSubscription = {},
                )
            }
        }

        composeTestRule.onNodeWithText("No Saved Items", substring = true).assertIsDisplayed()
    }

    @Test
    fun favorites_loadingStateDisplayed() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                FavoritesScreen(
                    state = FavoritesScreenState(
                        isAuthenticated = true,
                        isLoading = true,
                        isRefreshing = false,
                        upcomingEvents = emptyList(),
                        pastEvents = emptyList(),
                        favoriteRestaurants = emptyList(),
                        favoriteEventIds = emptySet(),
                        favoriteRestaurantIds = emptySet(),
                        currentTier = SubscriptionTier.FREE,
                        errorMessage = null,
                    ),
                    onNavigateToAuth = {},
                    onNavigateToEventDetail = {},
                    onNavigateToRestaurantDetail = {},
                    onRemoveEventFavorite = {},
                    onRemoveRestaurantFavorite = {},
                    onRefresh = {},
                    onNavigateToSubscription = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Loading saved items", substring = true).assertIsDisplayed()
    }

    @Test
    fun favorites_withEventsShowsSectionHeader() {
        composeTestRule.setContent {
            DesMoinesInsiderTheme {
                FavoritesScreen(
                    state = FavoritesScreenState(
                        isAuthenticated = true,
                        isLoading = false,
                        isRefreshing = false,
                        upcomingEvents = listOf(Event.preview),
                        pastEvents = emptyList(),
                        favoriteRestaurants = emptyList(),
                        favoriteEventIds = setOf(Event.preview.id),
                        favoriteRestaurantIds = emptySet(),
                        currentTier = SubscriptionTier.FREE,
                        errorMessage = null,
                    ),
                    onNavigateToAuth = {},
                    onNavigateToEventDetail = {},
                    onNavigateToRestaurantDetail = {},
                    onRemoveEventFavorite = {},
                    onRemoveRestaurantFavorite = {},
                    onRefresh = {},
                    onNavigateToSubscription = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Upcoming Events", substring = true).assertIsDisplayed()
    }
}
