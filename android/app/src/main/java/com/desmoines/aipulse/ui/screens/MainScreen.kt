package com.desmoines.aipulse.ui.screens

import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.theme.LocalBackdropBlurState
import com.desmoines.aipulse.ui.theme.rememberBackdropBlurScope
import com.desmoines.aipulse.ui.theme.respondsToBackdropBlur
import com.desmoines.aipulse.util.rememberHapticPerformer
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.desmoines.aipulse.ui.components.OfflineBanner
import com.desmoines.aipulse.ui.components.PaywallHost
import com.desmoines.aipulse.ui.components.SessionTimeoutBanner
import com.desmoines.aipulse.ui.components.ads.InterstitialAdView
import com.desmoines.aipulse.ui.components.ads.InterstitialAdViewModel
import com.desmoines.aipulse.ui.components.bestof.BestOfWinnersViewModel
import com.desmoines.aipulse.ui.components.bestof.LocalBestOfAwards
import androidx.hilt.navigation.compose.hiltViewModel
import com.desmoines.aipulse.ui.navigation.BottomNavTab
import com.desmoines.aipulse.ui.navigation.MainNavHost
import com.desmoines.aipulse.ui.navigation.Route
import com.desmoines.aipulse.util.DeepLinkHandler
import com.desmoines.aipulse.util.NetworkMonitor
import com.desmoines.aipulse.util.ShortcutDispatcher

/**
 * Main screen with bottom navigation bar matching iOS MainTabView.swift.
 * 6 tabs: Home, Dining, Search, Map, Saved, Profile.
 * Bottom bar hides on detail screens.
 * Handles deep link navigation via DeepLinkHandler.
 */
@Composable
fun MainScreen(
    networkMonitor: NetworkMonitor,
    deepLinkHandler: DeepLinkHandler,
    shortcutDispatcher: ShortcutDispatcher,
    widthSizeClass: WindowWidthSizeClass = WindowWidthSizeClass.Compact,
) {
    val useNavRail = widthSizeClass != WindowWidthSizeClass.Compact
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val haptic = rememberHapticPerformer()

    // Admin session timeout (AND-AUDIT-006). Navigation is the activity signal:
    // the app is single-Activity Compose, so the service's own
    // onActivityResumed callback only fires on returning to the app and would
    // never see someone who is actively using it.
    val sessionTimeoutViewModel: SessionTimeoutViewModel = hiltViewModel()
    val sessionMinutesRemaining by sessionTimeoutViewModel.minutesRemaining.collectAsStateWithLifecycle()
    val sessionExpired by sessionTimeoutViewModel.expiredNotice.collectAsStateWithLifecycle()
    LaunchedEffect(navBackStackEntry) {
        sessionTimeoutViewModel.recordActivity()
    }

    if (sessionExpired) {
        AlertDialog(
            onDismissRequest = { sessionTimeoutViewModel.acknowledgeExpiry() },
            title = { Text("Signed out") },
            text = {
                Text(
                    "Your admin session timed out, so you have been signed out on " +
                        "this device. Sign in again to continue."
                )
            },
            confirmButton = {
                TextButton(onClick = { sessionTimeoutViewModel.acknowledgeExpiry() }) {
                    Text("OK")
                }
            },
        )
    }

    // Shared backdrop blur state: any screen presenting a sheet can set
    // isBlurred = true and the entire nav host below will pick up a
    // Modifier.glassBackdropBlur on supported devices.
    val backdropBlur = rememberBackdropBlurScope()

    // Counter that increments when the user re-taps the already-selected tab.
    // Screens observe this to scroll their lists back to the top.
    var scrollToTopTrigger by remember { mutableStateOf(0) }

    // Observe pending deep link destinations
    val pendingDestination by deepLinkHandler.pendingDestination.collectAsStateWithLifecycle()

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
            is DeepLinkHandler.Destination.Hotel -> {
                navController.navigate(Route.HotelDetail.createRoute(destination.id)) {
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

    // App Shortcut / Assistant deep links (ANDP-015): route to the host screen.
    // The destination's ViewModel consumes the payload and applies the params,
    // so we only navigate here (no consume) — once consumed, pending goes null.
    val pendingShortcut by shortcutDispatcher.pending.collectAsStateWithLifecycle()
    LaunchedEffect(pendingShortcut) {
        when (pendingShortcut) {
            is ShortcutDispatcher.Pending.AskPulse -> {
                navController.navigate(Route.AskPulse.route) { launchSingleTop = true }
            }
            is ShortcutDispatcher.Pending.FindRestaurants,
            is ShortcutDispatcher.Pending.FindEvents -> {
                navController.navigate(Route.Search.route) {
                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                    launchSingleTop = true
                    restoreState = true
                }
            }
            null -> Unit
        }
    }

    // Routes where the bottom bar should be visible (tab routes only)
    val tabRoutes = BottomNavTab.entries.map { it.route }.toSet()
    val showBottomBar = currentDestination?.route in tabRoutes

    // Launch the Ask Pulse AI discovery surface (single-top so re-taps don't stack).
    val onAskPulseClick: () -> Unit = {
        haptic.light()
        navController.navigate(Route.AskPulse.route) { launchSingleTop = true }
    }

    // Full-screen interstitial (ANDP-044): counts the session on creation and is
    // offered only at a tab switch — a stable boundary, never mid-read/mid-flow.
    val interstitialViewModel: InterstitialAdViewModel = hiltViewModel()
    val pendingInterstitial by interstitialViewModel.pending.collectAsStateWithLifecycle()

    // Shared tab click handler
    val onTabClick: (BottomNavTab, Boolean) -> Unit = { tab, isSelected ->
        if (isSelected) {
            haptic.light()
            scrollToTopTrigger++
        } else {
            haptic.light()
            navController.navigate(tab.route) {
                popUpTo(navController.graph.findStartDestination().id) {
                    saveState = true
                }
                launchSingleTop = true
                restoreState = true
            }
            interstitialViewModel.onBoundary()
        }
    }

    // App-wide Best Of winner badges (ANDP-039): provided once so cards anywhere
    // can show "Best {Category}" without per-screen plumbing.
    val bestOfWinnersViewModel: BestOfWinnersViewModel = hiltViewModel()
    val bestOfAwards by bestOfWinnersViewModel.winners.collectAsStateWithLifecycle()

    CompositionLocalProvider(
        LocalBackdropBlurState provides backdropBlur,
        LocalBestOfAwards provides bestOfAwards,
    ) {
    if (useNavRail) {
        // Tablet / landscape: NavigationRail on the left + content on the right
        Row(modifier = Modifier.fillMaxSize()) {
            if (showBottomBar) {
                NavigationRail(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.72f),
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.fillMaxHeight(),
                    header = {
                        FloatingActionButton(
                            onClick = onAskPulseClick,
                            containerColor = MaterialTheme.colorScheme.primary,
                            contentColor = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.semantics {
                                contentDescription = "Ask Pulse, AI discovery"
                            },
                        ) {
                            Icon(Icons.Filled.AutoAwesome, contentDescription = null)
                        }
                    },
                ) {
                    val tabs = BottomNavTab.entries
                    tabs.forEachIndexed { index, tab ->
                        val isSelected = currentDestination?.hierarchy?.any {
                            it.route == tab.route
                        } == true

                        NavigationRailItem(
                            selected = isSelected,
                            modifier = Modifier.semantics {
                                contentDescription = "${tab.label}, tab ${index + 1} of ${tabs.size}" +
                                        if (isSelected) ", selected" else ""
                                selected = isSelected
                            },
                            onClick = { onTabClick(tab, isSelected) },
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
                            colors = NavigationRailItemDefaults.colors(
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
            Column(modifier = Modifier.weight(1f)) {
                OfflineBanner(networkMonitor = networkMonitor)
                SessionTimeoutBanner(
                    minutesRemaining = sessionMinutesRemaining,
                    onStaySignedIn = { sessionTimeoutViewModel.recordActivity() },
                )
                MainNavHost(
                    navController = navController,
                    scrollToTopTrigger = scrollToTopTrigger,
                    useWideLayout = true,
                    modifier = Modifier
                        .weight(1f)
                        .respondsToBackdropBlur()
                )
            }
        }
    } else {
        // Phone: standard bottom NavigationBar
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            floatingActionButton = {
                if (showBottomBar) {
                    FloatingActionButton(
                        onClick = onAskPulseClick,
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.semantics {
                            contentDescription = "Ask Pulse, AI discovery"
                        },
                    ) {
                        Icon(Icons.Filled.AutoAwesome, contentDescription = null)
                    }
                }
            },
            bottomBar = {
                if (showBottomBar) {
                    NavigationBar(
                        containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.72f),
                        contentColor = MaterialTheme.colorScheme.onSurface,
                        tonalElevation = 0.dp,
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
                                onClick = { onTabClick(tab, isSelected) },
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
                SessionTimeoutBanner(
                    minutesRemaining = sessionMinutesRemaining,
                    onStaySignedIn = { sessionTimeoutViewModel.recordActivity() },
                )
                MainNavHost(
                    navController = navController,
                    scrollToTopTrigger = scrollToTopTrigger,
                    useWideLayout = false,
                    modifier = Modifier
                        .weight(1f)
                        .respondsToBackdropBlur()
                )
            }
        }
    }

        // Soft paywall: shown as a bottom sheet whenever SoftPaywallService has a
        // pending context. Consumers (favorites cap, Trip Planner, etc.) trigger it.
        PaywallHost(
            onNavigateToSubscription = { navController.navigate(Route.Subscription.route) },
        )

        // Frequency-capped full-screen interstitial (ANDP-044), free tier only.
        pendingInterstitial?.let { ad ->
            InterstitialAdView(
                ad = ad,
                onImpression = interstitialViewModel::onImpression,
                onClick = interstitialViewModel::onClick,
                onDismiss = interstitialViewModel::dismiss,
            )
        }
    } // CompositionLocalProvider
}
