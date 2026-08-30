package com.desmoines.aipulse.ui.navigation

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.content.Intent
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import com.desmoines.aipulse.ui.screens.eventdetail.EventDetailScreen
import com.desmoines.aipulse.ui.screens.eventdetail.EventDetailViewModel
import com.desmoines.aipulse.ui.screens.attractiondetail.AttractionDetailScreen
import com.desmoines.aipulse.ui.screens.attractiondetail.AttractionDetailViewModel
import com.desmoines.aipulse.ui.screens.restaurantdetail.RestaurantDetailScreen
import com.desmoines.aipulse.ui.screens.restaurantdetail.RestaurantDetailViewModel
import com.desmoines.aipulse.ui.screens.subscription.SubscriptionViewModel

/**
 * Entity detail routes - the ones carrying a navArgument. Split out of MainNavHost.kt
 * the file held every route in the app and every navigation change touched it.
 *
 * Pure move: no route string, navArgument or composable body changed. MainNavHost
 * still calls this, and Route (NavGraph.kt) is still the only source of route
 * strings.
 */

internal fun NavGraphBuilder.addDetailDestinations(navController: NavHostController) {
    composable(
        route = Route.EventDetail.route,
        arguments = Route.EventDetail.arguments
    ) { backStackEntry ->
        val eventId = backStackEntry.arguments?.getString("eventId") ?: return@composable
        val viewModel: EventDetailViewModel = hiltViewModel()
        val eventSubViewModel: SubscriptionViewModel = hiltViewModel()
        val event by viewModel.event.collectAsStateWithLifecycle()
        val relatedEvents by viewModel.relatedEvents.collectAsStateWithLifecycle()
        val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
        val isFavorited by viewModel.isFavorited.collectAsStateWithLifecycle()
        val calendarAdded by viewModel.calendarAdded.collectAsStateWithLifecycle()
        val eventSubState by eventSubViewModel.uiState.collectAsStateWithLifecycle()
        val context = androidx.compose.ui.platform.LocalContext.current

        androidx.compose.runtime.LaunchedEffect(eventId) {
            viewModel.loadEvent(eventId)
        }

        // A save can be rejected (signed out, or the free-tier limit reached).
        // Without this the heart just refuses to fill with no explanation.
        val favoriteError by viewModel.favoriteError.collectAsStateWithLifecycle()
        androidx.compose.runtime.LaunchedEffect(favoriteError) {
            favoriteError?.let {
                android.widget.Toast.makeText(context, it, android.widget.Toast.LENGTH_SHORT).show()
                viewModel.clearFavoriteError()
            }
        }

        EventDetailScreen(
            event = event,
            relatedEvents = relatedEvents,
            isLoading = isLoading,
            isFavorited = isFavorited,
            calendarAdded = calendarAdded,
            currentTier = eventSubState.currentTier,
            distanceText = viewModel.formattedDistance(),
            onNavigateBack = { navController.popBackStack() },
            onShare = {
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, viewModel.shareText)
                }
                context.startActivity(Intent.createChooser(shareIntent, "Share Event"))
            },
            onToggleFavorite = { viewModel.toggleFavorite() },
            onAddToCalendar = {
                viewModel.createCalendarIntent()?.let { intent ->
                    // No calendar app resolves this on some tablets and Android
                    // Go devices; an unguarded startActivity there is an
                    // ActivityNotFoundException crash, not a no-op.
                    runCatching { context.startActivity(intent) }
                        .onSuccess { viewModel.setCalendarAdded() }
                        .onFailure {
                            android.widget.Toast.makeText(
                                context,
                                "No calendar app available.",
                                android.widget.Toast.LENGTH_SHORT,
                            ).show()
                        }
                }
            },
            onOpenDirections = {
                // Both hops go through the safe launcher: the old catch block
                // called startActivity again unguarded, so a device with neither
                // Google Maps nor a geo: handler crashed from inside the handler.
                if (!com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createDirectionsIntent())) {
                    com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createDirectionsFallbackIntent())
                }
            },
            onOpenDirectionsFallback = {
                com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createDirectionsFallbackIntent())
            },
            onShowSubscription = {
                navController.navigate(Route.Subscription.route)
            },
            onNavigateToEventDetail = { id ->
                navController.navigate(Route.EventDetail.createRoute(id))
            },
            onOpenSourceUrl = { url ->
                com.desmoines.aipulse.util.SafeLinkLauncher.openUrl(context, url)
            },
            onNavigateToAuth = { navController.navigate(Route.Auth.route) },
        )
    }

    composable(
        route = Route.RestaurantDetail.route,
        arguments = Route.RestaurantDetail.arguments
    ) { backStackEntry ->
        val restaurantId = backStackEntry.arguments?.getString("restaurantId") ?: return@composable
        val viewModel: RestaurantDetailViewModel = hiltViewModel()
        val restSubViewModel: SubscriptionViewModel = hiltViewModel()
        val restaurant by viewModel.restaurant.collectAsStateWithLifecycle()
        val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
        val isFavorited by viewModel.isFavorited.collectAsStateWithLifecycle()
        val restSubState by restSubViewModel.uiState.collectAsStateWithLifecycle()
        val context = androidx.compose.ui.platform.LocalContext.current

        androidx.compose.runtime.LaunchedEffect(restaurantId) {
            viewModel.loadRestaurant(restaurantId)
        }

        // See the event-detail block: a rejected save needs to say why.
        val restaurantFavoriteError by viewModel.favoriteError.collectAsStateWithLifecycle()
        androidx.compose.runtime.LaunchedEffect(restaurantFavoriteError) {
            restaurantFavoriteError?.let {
                android.widget.Toast.makeText(context, it, android.widget.Toast.LENGTH_SHORT).show()
                viewModel.clearFavoriteError()
            }
        }

        RestaurantDetailScreen(
            restaurant = restaurant,
            isLoading = isLoading,
            isFavorited = isFavorited,
            currentTier = restSubState.currentTier,
            distanceText = viewModel.formattedDistance(),
            onNavigateBack = { navController.popBackStack() },
            onShare = {
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, viewModel.shareText)
                }
                context.startActivity(Intent.createChooser(shareIntent, "Share Restaurant"))
            },
            onToggleFavorite = { viewModel.toggleFavorite() },
            onCall = {
                viewModel.createCallIntent()?.let { intent ->
                    // A device with no dialer (most tablets) throws
                    // ActivityNotFoundException here rather than doing nothing.
                    runCatching { context.startActivity(intent) }.onFailure {
                        android.widget.Toast.makeText(
                            context,
                            "No phone app available.",
                            android.widget.Toast.LENGTH_SHORT,
                        ).show()
                    }
                }
            },
            onOpenWebsite = {
                viewModel.createWebsiteIntent()?.let { intent ->
                    runCatching { context.startActivity(intent) }.onFailure {
                        android.widget.Toast.makeText(
                            context,
                            "No browser available.",
                            android.widget.Toast.LENGTH_SHORT,
                        ).show()
                    }
                }
            },
            onOpenDirections = {
                // Both hops go through the safe launcher: the old catch block
                // called startActivity again unguarded, so a device with neither
                // Google Maps nor a geo: handler crashed from inside the handler.
                if (!com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createDirectionsIntent())) {
                    com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createDirectionsFallbackIntent())
                }
            },
            onShowSubscription = {
                navController.navigate(Route.Subscription.route)
            },
            onNavigateToAuth = { navController.navigate(Route.Auth.route) },
        )
    }

    composable(
        route = Route.AttractionDetail.route,
        arguments = Route.AttractionDetail.arguments
    ) { backStackEntry ->
        val attractionId = backStackEntry.arguments?.getString("attractionId") ?: return@composable
        val viewModel: AttractionDetailViewModel = hiltViewModel()
        val attraction by viewModel.attraction.collectAsStateWithLifecycle()
        val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
        val context = androidx.compose.ui.platform.LocalContext.current

        androidx.compose.runtime.LaunchedEffect(attractionId) {
            viewModel.loadAttraction(attractionId)
        }

        AttractionDetailScreen(
            attraction = attraction,
            isLoading = isLoading,
            distanceText = viewModel.formattedDistance(),
            onNavigateBack = { navController.popBackStack() },
            onShare = {
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, viewModel.shareText)
                }
                context.startActivity(Intent.createChooser(shareIntent, "Share Attraction"))
            },
            onOpenWebsite = {
                com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createWebsiteIntent())
            },
            onOpenDirections = {
                // The Google Maps intent is package-pinned, so fall back to any
                // geo: handler. Both hops go through the safe launcher: the old
                // catch block called startActivity again unguarded, so a device
                // with neither handler crashed from inside the handler.
                if (!com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createDirectionsIntent())) {
                    com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createDirectionsFallbackIntent())
                }
            },
            onNavigateToSubscription = { navController.navigate(Route.Subscription.route) },
            onNavigateToAuth = { navController.navigate(Route.Auth.route) },
        )
    }
}
