package com.desmoines.aipulse.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Search
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavType
import androidx.navigation.navArgument

/**
 * Route definitions for all screens in the app.
 * Mirrors iOS MainTabView.swift tab structure and navigation destinations.
 */
sealed class Route(val route: String) {
    // Top-level tab routes
    data object Home : Route("home")
    data object Dining : Route("dining")
    data object Search : Route("search")
    data object Map : Route("map")
    data object Saved : Route("saved")
    data object Profile : Route("profile")

    // Detail routes
    data object EventDetail : Route("event_detail/{eventId}") {
        fun createRoute(eventId: String) = "event_detail/$eventId"
        val arguments = listOf(navArgument("eventId") { type = NavType.StringType })
    }

    data object RestaurantDetail : Route("restaurant_detail/{restaurantId}") {
        fun createRoute(restaurantId: String) = "restaurant_detail/$restaurantId"
        val arguments = listOf(navArgument("restaurantId") { type = NavType.StringType })
    }

    data object AttractionDetail : Route("attraction_detail/{attractionId}") {
        fun createRoute(attractionId: String) = "attraction_detail/$attractionId"
        val arguments = listOf(navArgument("attractionId") { type = NavType.StringType })
    }

    // Auth & flow routes
    data object Auth : Route("auth")
    data object Onboarding : Route("onboarding")
    data object Subscription : Route("subscription")
    data object Settings : Route("settings")

    // Discovery flow routes
    data object Discover : Route("discover")
    data object AskPulse : Route("askpulse")
    data object SurpriseMe : Route("surprise_me")
    data object GroupSession : Route("group_session")

    // WebView route
    data object WebView : Route("webview/{url}") {
        fun createRoute(url: String) = "webview/${java.net.URLEncoder.encode(url, "UTF-8")}"
        val arguments = listOf(navArgument("url") { type = NavType.StringType })
    }
}

/**
 * Bottom navigation tab configuration matching iOS MainTabView.swift:
 * Home, Dining, Search, Map, Saved, Profile
 */
enum class BottomNavTab(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
) {
    HOME(
        route = Route.Home.route,
        label = "Home",
        selectedIcon = Icons.Filled.Home,
        unselectedIcon = Icons.Outlined.Home
    ),
    DINING(
        route = Route.Dining.route,
        label = "Dining",
        selectedIcon = Icons.Filled.Restaurant,
        unselectedIcon = Icons.Outlined.Restaurant
    ),
    SEARCH(
        route = Route.Search.route,
        label = "Search",
        selectedIcon = Icons.Filled.Search,
        unselectedIcon = Icons.Outlined.Search
    ),
    MAP(
        route = Route.Map.route,
        label = "Map",
        selectedIcon = Icons.Filled.Map,
        unselectedIcon = Icons.Outlined.Map
    ),
    SAVED(
        route = Route.Saved.route,
        label = "Saved",
        selectedIcon = Icons.Filled.Favorite,
        unselectedIcon = Icons.Outlined.FavoriteBorder
    ),
    PROFILE(
        route = Route.Profile.route,
        label = "Profile",
        selectedIcon = Icons.Filled.Person,
        unselectedIcon = Icons.Outlined.Person
    )
}
