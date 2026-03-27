package com.desmoines.aipulse.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import com.desmoines.aipulse.ui.screens.auth.AuthScreen
import com.desmoines.aipulse.ui.screens.favorites.FavoritesScreen
import com.desmoines.aipulse.ui.screens.home.EventsViewModel
import com.desmoines.aipulse.ui.screens.home.FilterSheet
import com.desmoines.aipulse.ui.screens.home.HomeScreen
import com.desmoines.aipulse.ui.screens.map.MapScreen
import com.desmoines.aipulse.ui.screens.onboarding.OnboardingScreen
import com.desmoines.aipulse.ui.screens.profile.ProfileScreen
import com.desmoines.aipulse.ui.screens.restaurants.RestaurantsScreen
import com.desmoines.aipulse.ui.components.WebViewScreen
import com.desmoines.aipulse.ui.screens.search.SearchScreen

/**
 * Main navigation host containing all route destinations.
 * Each tab screen receives navigation callbacks for detail screens.
 */
@Composable
fun MainNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier
) {
    NavHost(
        navController = navController,
        startDestination = Route.Home.route,
        modifier = modifier
    ) {
        // Tab destinations
        addTabDestinations(navController)

        // Detail destinations
        addDetailDestinations(navController)

        // Flow destinations (auth, onboarding, subscription, settings, webview)
        addFlowDestinations(navController)
    }
}

private fun NavGraphBuilder.addTabDestinations(navController: NavHostController) {
    composable(Route.Home.route) {
        val viewModel: EventsViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsState()
        var showFilterSheet by remember { mutableStateOf(false) }

        // Filter state for the sheet
        val showFreeOnly by viewModel.showFreeOnly.collectAsState()
        val maxDistance by viewModel.maxDistance.collectAsState()
        val minRating by viewModel.minRating.collectAsState()

        // Load initial data on first composition
        androidx.compose.runtime.LaunchedEffect(Unit) {
            viewModel.loadInitialData()
        }

        HomeScreen(
            state = state,
            onNavigateToEventDetail = { id ->
                navController.navigate(Route.EventDetail.createRoute(id))
            },
            onNavigateToRestaurantDetail = { id ->
                navController.navigate(Route.RestaurantDetail.createRoute(id))
            },
            onNavigateToSubscription = {
                navController.navigate(Route.Subscription.route)
            },
            onSelectCategory = { category -> viewModel.setSelectedCategory(category) },
            onSelectDatePreset = { preset -> viewModel.setSelectedDatePreset(preset) },
            onShowFilters = { showFilterSheet = true },
            onClearFilters = { viewModel.clearFilters() },
            onRefresh = { viewModel.refresh() },
            onLoadMore = { viewModel.loadMoreIfNeeded(state.events.size - 1) },
            onFavoriteClick = null, // Favorites implemented in AND-024
        )

        if (showFilterSheet) {
            FilterSheet(
                selectedCategory = state.selectedCategory,
                selectedDatePreset = state.selectedDatePreset,
                showFeaturedOnly = state.showFeaturedOnly,
                showFreeOnly = showFreeOnly,
                maxDistance = maxDistance,
                minRating = minRating,
                currentTier = state.currentTier,
                onCategorySelected = { viewModel.setSelectedCategory(it) },
                onDatePresetSelected = { viewModel.setSelectedDatePreset(it) },
                onFeaturedOnlyChanged = { viewModel.setShowFeaturedOnly(it) },
                onFreeOnlyChanged = { viewModel.setShowFreeOnly(it) },
                onMaxDistanceChanged = { viewModel.setMaxDistance(it) },
                onMinRatingChanged = { viewModel.setMinRating(it) },
                onClearFilters = { viewModel.clearFilters() },
                onUpgradeClick = {
                    showFilterSheet = false
                    navController.navigate(Route.Subscription.route)
                },
                onDismiss = { showFilterSheet = false },
            )
        }
    }

    composable(Route.Dining.route) {
        RestaurantsScreen(
            onNavigateToRestaurantDetail = { id ->
                navController.navigate(Route.RestaurantDetail.createRoute(id))
            }
        )
    }

    composable(Route.Search.route) {
        SearchScreen(
            onNavigateToEventDetail = { id ->
                navController.navigate(Route.EventDetail.createRoute(id))
            },
            onNavigateToRestaurantDetail = { id ->
                navController.navigate(Route.RestaurantDetail.createRoute(id))
            },
            onNavigateToAttractionDetail = { id ->
                navController.navigate(Route.AttractionDetail.createRoute(id))
            }
        )
    }

    composable(Route.Map.route) {
        MapScreen(
            onNavigateToEventDetail = { id ->
                navController.navigate(Route.EventDetail.createRoute(id))
            },
            onNavigateToRestaurantDetail = { id ->
                navController.navigate(Route.RestaurantDetail.createRoute(id))
            },
            onNavigateToAttractionDetail = { id ->
                navController.navigate(Route.AttractionDetail.createRoute(id))
            }
        )
    }

    composable(Route.Saved.route) {
        FavoritesScreen(
            onNavigateToEventDetail = { id ->
                navController.navigate(Route.EventDetail.createRoute(id))
            },
            onNavigateToRestaurantDetail = { id ->
                navController.navigate(Route.RestaurantDetail.createRoute(id))
            },
            onNavigateToAuth = {
                navController.navigate(Route.Auth.route)
            }
        )
    }

    composable(Route.Profile.route) {
        ProfileScreen(
            onNavigateToAuth = {
                navController.navigate(Route.Auth.route)
            },
            onNavigateToSettings = {
                navController.navigate(Route.Settings.route)
            },
            onNavigateToSubscription = {
                navController.navigate(Route.Subscription.route)
            }
        )
    }
}

private fun NavGraphBuilder.addDetailDestinations(navController: NavHostController) {
    composable(
        route = Route.EventDetail.route,
        arguments = Route.EventDetail.arguments
    ) { /* EventDetailScreen placeholder — implemented in AND-019 */ }

    composable(
        route = Route.RestaurantDetail.route,
        arguments = Route.RestaurantDetail.arguments
    ) { /* RestaurantDetailScreen placeholder — implemented in AND-021 */ }

    composable(
        route = Route.AttractionDetail.route,
        arguments = Route.AttractionDetail.arguments
    ) { /* AttractionDetailScreen placeholder — implemented in AND-022 */ }
}

private fun NavGraphBuilder.addFlowDestinations(navController: NavHostController) {
    composable(Route.Auth.route) {
        AuthScreen(
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.Onboarding.route) {
        OnboardingScreen(
            onComplete = {
                navController.popBackStack()
            }
        )
    }

    composable(Route.Subscription.route) {
        /* SubscriptionScreen placeholder — implemented in AND-027 */
    }

    composable(Route.Settings.route) {
        /* SettingsScreen placeholder — implemented in AND-026 */
    }

    composable(
        route = Route.WebView.route,
        arguments = Route.WebView.arguments
    ) { backStackEntry ->
        val encodedUrl = backStackEntry.arguments?.getString("url") ?: ""
        val url = java.net.URLDecoder.decode(encodedUrl, "UTF-8")
        WebViewScreen(
            url = url,
            onNavigateBack = { navController.popBackStack() }
        )
    }
}
