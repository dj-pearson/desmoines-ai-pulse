package com.desmoines.aipulse.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.desmoines.aipulse.ui.components.OfflineBanner
import com.desmoines.aipulse.ui.navigation.BottomNavTab
import com.desmoines.aipulse.ui.navigation.MainNavHost
import com.desmoines.aipulse.ui.navigation.Route
import com.desmoines.aipulse.util.DeepLinkHandler
import com.desmoines.aipulse.util.NetworkMonitor

/**
 * Main screen with bottom navigation bar matching iOS MainTabView.swift.
 * 6 tabs: Home, Dining, Search, Map, Saved, Profile.
 * Bottom bar hides on detail screens.
 * Handles deep link navigation via DeepLinkHandler.
 */
@Composable
fun MainScreen(
    networkMonitor: NetworkMonitor,
    deepLinkHandler: DeepLinkHandler
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val haptic = LocalHapticFeedback.current

    // Observe pending deep link destinations
    val pendingDestination by deepLinkHandler.pendingDestination.collectAsState()

    // Consume and navigate to pending deep link destination
    LaunchedEffect(pendingDestination) {
        val destination = deepLinkHandler.consumeDestination() ?: return@LaunchedEffect

        when (destination) {
            is DeepLinkHandler.Destination.Event -> {
                navController.navigate(Route.EventDetail.createRoute(destination.id)) {
                    launchSingleTop = true
                }
            }
            is DeepLinkHandler.Destination.Restaurant -> {
                navController.navigate(Route.RestaurantDetail.createRoute(destination.id)) {
                    launchSingleTop = true
                }
            }
            is DeepLinkHandler.Destination.Attraction -> {
                navController.navigate(Route.AttractionDetail.createRoute(destination.id)) {
                    launchSingleTop = true
                }
            }
            is DeepLinkHandler.Destination.Tab -> {
                val tabRoute = when (destination.tab) {
                    DeepLinkHandler.TabDestination.HOME -> Route.Home.route
                    DeepLinkHandler.TabDestination.DINING -> Route.Dining.route
                    DeepLinkHandler.TabDestination.SEARCH -> Route.Search.route
                    DeepLinkHandler.TabDestination.MAP -> Route.Map.route
                    DeepLinkHandler.TabDestination.SAVED -> Route.Saved.route
                    DeepLinkHandler.TabDestination.PROFILE -> Route.Profile.route
                }
                navController.navigate(tabRoute) {
                    popUpTo(navController.graph.findStartDestination().id) {
                        saveState = true
                    }
                    launchSingleTop = true
                    restoreState = true
                }
            }
        }
    }

    // Routes where the bottom bar should be visible (tab routes only)
    val tabRoutes = BottomNavTab.entries.map { it.route }.toSet()
    val showBottomBar = currentDestination?.route in tabRoutes

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    contentColor = MaterialTheme.colorScheme.onSurface
                ) {
                    val tabs = BottomNavTab.entries
                    tabs.forEachIndexed { index, tab ->
                        val isSelected = currentDestination?.hierarchy?.any {
                            it.route == tab.route
                        } == true

                        NavigationBarItem(
                            selected = isSelected,
                            modifier = Modifier.semantics {
                                contentDescription = "${tab.label}, tab ${index + 1} of ${tabs.size}" +
                                        if (isSelected) ", selected" else ""
                                selected = isSelected
                            },
                            onClick = {
                                if (!isSelected) {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    navController.navigate(tab.route) {
                                        // Pop up to the start destination to avoid building
                                        // up a large stack of destinations on the back stack
                                        popUpTo(navController.graph.findStartDestination().id) {
                                            saveState = true
                                        }
                                        // Avoid multiple copies of the same destination
                                        launchSingleTop = true
                                        // Restore state when re-selecting a previously selected tab
                                        restoreState = true
                                    }
                                }
                            },
                            icon = {
                                Icon(
                                    imageVector = if (isSelected) tab.selectedIcon else tab.unselectedIcon,
                                    contentDescription = tab.label
                                )
                            },
                            label = {
                                Text(
                                    text = tab.label,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                indicatorColor = MaterialTheme.colorScheme.primaryContainer
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        Column(modifier = Modifier.padding(innerPadding)) {
            OfflineBanner(networkMonitor = networkMonitor)
            MainNavHost(
                navController = navController,
                modifier = Modifier.weight(1f)
            )
        }
    }
}
