package com.desmoines.aipulse.ui.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import com.desmoines.aipulse.ui.theme.PremiumMotion

/**
 * Main navigation host containing all route destinations.
 * Each tab screen receives navigation callbacks for detail screens.
 */
@Composable
fun MainNavHost(
    navController: NavHostController,
    scrollToTopTrigger: Int = 0,
    useWideLayout: Boolean = false,
    modifier: Modifier = Modifier
) {
    NavHost(
        navController = navController,
        startDestination = Route.Home.route,
        modifier = modifier,
        // Glassy slide+fade between destinations gives the app a continuous,
        // cinematic feel instead of stock instant swaps. Tab swaps fade only
        // (no slide) since they're not "deeper" navigation.
        enterTransition = {
            val isTabSwap = isTabRoute(initialState.destination.route) &&
                isTabRoute(targetState.destination.route)
            if (isTabSwap) {
                fadeIn(animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs))
            } else {
                slideIntoContainer(
                    towards = AnimatedContentTransitionScope.SlideDirection.Start,
                    animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs)
                ) + fadeIn(animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs))
            }
        },
        exitTransition = {
            val isTabSwap = isTabRoute(initialState.destination.route) &&
                isTabRoute(targetState.destination.route)
            if (isTabSwap) {
                fadeOut(animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs))
            } else {
                slideOutOfContainer(
                    towards = AnimatedContentTransitionScope.SlideDirection.Start,
                    animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs)
                ) + fadeOut(animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs))
            }
        },
        popEnterTransition = {
            slideIntoContainer(
                towards = AnimatedContentTransitionScope.SlideDirection.End,
                animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs)
            ) + fadeIn(animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs))
        },
        popExitTransition = {
            slideOutOfContainer(
                towards = AnimatedContentTransitionScope.SlideDirection.End,
                animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs)
            ) + fadeOut(animationSpec = tween(durationMillis = PremiumMotion.SmoothDurationMs))
        },
    ) {
        // Tab destinations
        addTabDestinations(navController, scrollToTopTrigger, useWideLayout)

        // Detail destinations
        addDetailDestinations(navController)

        // Flow destinations (auth, onboarding, subscription, settings, webview)
        addFlowDestinations(navController)
    }
}

private fun isTabRoute(route: String?): Boolean {
    if (route == null) return false
    return route == Route.Home.route ||
        route == Route.Dining.route ||
        route == Route.Search.route ||
        route == Route.Map.route ||
        route == Route.Saved.route ||
        route == Route.Profile.route
}
