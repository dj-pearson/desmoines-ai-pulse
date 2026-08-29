package com.desmoines.aipulse.ui.navigation

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.content.Intent
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import com.desmoines.aipulse.ui.screens.askpulse.AskPulseScreen
import com.desmoines.aipulse.ui.screens.askpulse.AskPulseViewModel
import com.desmoines.aipulse.ui.screens.tripplanner.TripPlannerScreen
import com.desmoines.aipulse.ui.screens.tripplanner.TripPlannerViewModel
import com.desmoines.aipulse.ui.screens.tripplanner.SavedTripsScreen
import com.desmoines.aipulse.ui.screens.tripplanner.SavedTripsViewModel
import com.desmoines.aipulse.ui.screens.tripplanner.ItineraryDetailScreen
import com.desmoines.aipulse.ui.screens.tripplanner.ItineraryDetailViewModel
import com.desmoines.aipulse.ui.screens.discover.DiscoverScreen
import com.desmoines.aipulse.ui.screens.discover.DiscoverViewModel
import com.desmoines.aipulse.ui.screens.groupsession.GroupSessionScreen
import com.desmoines.aipulse.ui.screens.groupsession.GroupSessionViewModel
import com.desmoines.aipulse.ui.screens.surpriseme.SurpriseMeScreen
import com.desmoines.aipulse.ui.screens.surpriseme.SurpriseMeViewModel
import com.desmoines.aipulse.ui.screens.weekend.WeekendScreen
import com.desmoines.aipulse.ui.screens.weekend.WeekendViewModel
import com.desmoines.aipulse.ui.screens.neighborhoods.NeighborhoodsHubScreen
import com.desmoines.aipulse.ui.screens.neighborhoods.NeighborhoodDetailScreen
import com.desmoines.aipulse.ui.screens.neighborhoods.NeighborhoodDetailViewModel
import com.desmoines.aipulse.ui.screens.hubs.ContentHubsListScreen
import com.desmoines.aipulse.ui.screens.hubs.ContentHubScreen
import com.desmoines.aipulse.ui.screens.hubs.ContentHubViewModel
import com.desmoines.aipulse.ui.screens.dashboard.DashboardScreen
import com.desmoines.aipulse.ui.screens.dashboard.DashboardViewModel
import com.desmoines.aipulse.ui.screens.articles.ArticlesScreen
import com.desmoines.aipulse.ui.screens.articles.ArticlesViewModel
import com.desmoines.aipulse.ui.screens.articles.ArticleDetailScreen
import com.desmoines.aipulse.ui.screens.articles.ArticleDetailViewModel
import com.desmoines.aipulse.ui.screens.deals.DealsScreen
import com.desmoines.aipulse.ui.screens.deals.DealsViewModel
import com.desmoines.aipulse.ui.screens.hotels.HotelsScreen
import com.desmoines.aipulse.ui.screens.hotels.HotelsViewModel
import com.desmoines.aipulse.ui.screens.hoteldetail.HotelDetailScreen
import com.desmoines.aipulse.ui.screens.hoteldetail.HotelDetailViewModel
import com.desmoines.aipulse.ui.screens.bestof.BestOfScreen
import com.desmoines.aipulse.ui.screens.bestof.BestOfViewModel
import com.desmoines.aipulse.ui.screens.bestof.BestOfCategoryScreen
import com.desmoines.aipulse.ui.screens.bestof.BestOfCategoryViewModel
import com.desmoines.aipulse.ui.screens.auth.AuthScreen
import com.desmoines.aipulse.ui.screens.onboarding.OnboardingScreen
import com.desmoines.aipulse.ui.screens.profile.ProfileViewModel
import com.desmoines.aipulse.ui.screens.profile.SettingsScreen
import com.desmoines.aipulse.ui.components.WebViewScreen
import com.desmoines.aipulse.ui.screens.search.SavedSearchViewModel
import com.desmoines.aipulse.ui.screens.subscription.SubscriptionScreen
import com.desmoines.aipulse.ui.screens.subscription.SubscriptionViewModel

/**
 * Everything that is neither a tab nor an entity detail: auth, discovery, trips,
 * the file held every route in the app and every navigation change touched it.
 *
 * Pure move: no route string, navArgument or composable body changed. MainNavHost
 * still calls this, and Route (NavGraph.kt) is still the only source of route
 * strings.
 */

internal fun NavGraphBuilder.addFlowDestinations(navController: NavHostController) {
    composable(Route.Auth.route) {
        AuthScreen(
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.AskPulse.route) {
        val viewModel: AskPulseViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        AskPulseScreen(
            state = state,
            suggestions = viewModel.suggestions,
            onInputChange = viewModel::onInputChange,
            onSend = viewModel::send,
            onSuggestion = viewModel::sendSuggestion,
            onReset = viewModel::reset,
            onNavigateBack = { navController.popBackStack() },
            onNavigateToPick = { itemType, itemId ->
                when (itemType.lowercase()) {
                    "event" -> navController.navigate(Route.EventDetail.createRoute(itemId))
                    "restaurant" -> navController.navigate(Route.RestaurantDetail.createRoute(itemId))
                    "attraction" -> navController.navigate(Route.AttractionDetail.createRoute(itemId))
                }
            },
            onUpgrade = { navController.navigate(Route.Subscription.route) },
        )
    }

    composable(Route.Discover.route) {
        val viewModel: DiscoverViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        DiscoverScreen(
            state = state,
            onLike = viewModel::onLike,
            onSkip = viewModel::onSkip,
            onBoost = viewModel::onBoost,
            onOpenItem = { item ->
                viewModel.onDetail(item) // weak-positive signal
                when (item.itemType) {
                    com.desmoines.aipulse.data.model.SwipeItemType.EVENT ->
                        navController.navigate(Route.EventDetail.createRoute(item.rawId))
                    com.desmoines.aipulse.data.model.SwipeItemType.RESTAURANT ->
                        navController.navigate(Route.RestaurantDetail.createRoute(item.rawId))
                }
            },
            onReload = viewModel::reload,
            onSelectMode = viewModel::setMode,
            onClearFilter = viewModel::clearFilter,
            onNavigateBack = { navController.popBackStack() },
            onOpenGroupSession = { navController.navigate(Route.GroupSession.route) },
        )
    }

    composable(Route.GroupSession.route) {
        val viewModel: GroupSessionViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        GroupSessionScreen(
            state = state,
            modes = viewModel.modes,
            onModeSelected = viewModel::onModeSelected,
            onJoinCodeChanged = viewModel::onJoinCodeChanged,
            onCreate = viewModel::createSession,
            onJoin = viewModel::joinSession,
            onRefresh = viewModel::refresh,
            onEnd = viewModel::endSession,
            onLeave = viewModel::leaveSession,
            onSwipeNow = { navController.navigate(Route.Discover.route) },
            onOpenMatch = { itemType, itemId ->
                when (itemType) {
                    "restaurant" -> navController.navigate(Route.RestaurantDetail.createRoute(itemId))
                    "attraction" -> navController.navigate(Route.AttractionDetail.createRoute(itemId))
                    "event" -> navController.navigate(Route.EventDetail.createRoute(itemId))
                }
            },
            onClearError = viewModel::clearError,
            onNavigateToAuth = { navController.navigate(Route.Auth.route) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.Deals.route) {
        val viewModel: DealsViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        DealsScreen(
            state = state,
            entityTypes = DealsViewModel.ENTITY_TYPES,
            onSearchTextChanged = viewModel::onSearchTextChanged,
            onEntityTypeSelected = viewModel::onEntityTypeSelected,
            onToggleActiveNow = viewModel::onToggleActiveNow,
            onRetry = viewModel::retry,
            onOpenDeal = { deal ->
                val id = deal.entityId
                if (id != null) {
                    when (deal.entityType) {
                        "restaurant" -> navController.navigate(Route.RestaurantDetail.createRoute(id))
                        "attraction" -> navController.navigate(Route.AttractionDetail.createRoute(id))
                        "event" -> navController.navigate(Route.EventDetail.createRoute(id))
                        // hotel detail lands in ANDP-034 (#290); activity has no detail surface.
                    }
                }
            },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.Hotels.route) {
        val viewModel: HotelsViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        HotelsScreen(
            state = state,
            onSearchTextChanged = viewModel::onSearchTextChanged,
            onToggleArea = viewModel::onToggleArea,
            onTogglePriceRange = viewModel::onTogglePriceRange,
            onSelectMinRating = viewModel::onSelectMinRating,
            onSelectSort = viewModel::onSelectSort,
            onClearFilters = viewModel::clearFilters,
            onLoadMore = viewModel::loadMore,
            onRefresh = viewModel::refresh,
            onRetry = viewModel::retry,
            onOpenHotel = { id -> navController.navigate(Route.HotelDetail.createRoute(id)) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(
        route = Route.HotelDetail.route,
        arguments = Route.HotelDetail.arguments,
    ) { backStackEntry ->
        val hotelId = backStackEntry.arguments?.getString("hotelId") ?: return@composable
        val viewModel: HotelDetailViewModel = hiltViewModel()
        val hotel by viewModel.hotel.collectAsStateWithLifecycle()
        val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
        val errorMessage by viewModel.errorMessage.collectAsStateWithLifecycle()
        val context = androidx.compose.ui.platform.LocalContext.current

        androidx.compose.runtime.LaunchedEffect(hotelId) { viewModel.load(hotelId) }

        HotelDetailScreen(
            hotel = hotel,
            isLoading = isLoading,
            errorMessage = errorMessage,
            distanceText = viewModel.formattedDistance(),
            onNavigateBack = { navController.popBackStack() },
            onShare = {
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, viewModel.shareText)
                }
                context.startActivity(Intent.createChooser(shareIntent, "Share Hotel"))
            },
            onBook = {
                // Safe-link launcher validates the scheme + swallows missing handlers.
                com.desmoines.aipulse.util.SafeLinkLauncher.openUrl(context, viewModel.bookingUrl())
            },
            onCall = {
                com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createCallIntent())
            },
            onOpenDirections = {
                // Both hops go through the safe launcher: the old catch block
                // called startActivity again unguarded, so a device with neither
                // Google Maps nor a geo: handler crashed from inside the handler.
                if (!com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createDirectionsIntent())) {
                    com.desmoines.aipulse.util.SafeLinkLauncher.start(context, viewModel.createDirectionsFallbackIntent())
                }
            },
            onRetry = { viewModel.retry() },
        )
    }

    composable(Route.BestOf.route) {
        val viewModel: BestOfViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        BestOfScreen(
            state = state,
            onOpenCategory = { category -> navController.navigate(Route.BestOfCategory.createRoute(category.id)) },
            onRefresh = viewModel::refresh,
            onRetry = viewModel::retry,
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(
        route = Route.BestOfCategory.route,
        arguments = Route.BestOfCategory.arguments,
    ) { backStackEntry ->
        val categoryId = backStackEntry.arguments?.getString("categoryId") ?: return@composable
        val viewModel: BestOfCategoryViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        androidx.compose.runtime.LaunchedEffect(categoryId) { viewModel.load(categoryId) }

        BestOfCategoryScreen(
            state = state,
            onSearchTextChanged = viewModel::onSearchTextChanged,
            onToggleWriteIn = viewModel::toggleWriteIn,
            onWriteInChanged = viewModel::onWriteInChanged,
            onVoteFor = viewModel::voteFor,
            onSubmitWriteIn = viewModel::submitWriteIn,
            onRetry = viewModel::retry,
            onDismissError = viewModel::consumeError,
            onNavigateToAuth = { navController.navigate(Route.Auth.route) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.Articles.route) {
        val viewModel: ArticlesViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        ArticlesScreen(
            state = state,
            onSearchTextChanged = viewModel::onSearchTextChanged,
            onCategorySelected = viewModel::onCategorySelected,
            onLoadMore = viewModel::loadMore,
            onRefresh = viewModel::refresh,
            onRetry = viewModel::retry,
            onOpenArticle = { id -> navController.navigate(Route.ArticleDetail.createRoute(id)) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(
        route = Route.ArticleDetail.route,
        arguments = Route.ArticleDetail.arguments,
    ) { backStackEntry ->
        val articleId = backStackEntry.arguments?.getString("articleId") ?: return@composable
        val viewModel: ArticleDetailViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        androidx.compose.runtime.LaunchedEffect(articleId) { viewModel.load(articleId) }

        ArticleDetailScreen(
            state = state,
            onRetry = viewModel::retry,
            onToggleSave = viewModel::toggleSave,
            onShared = viewModel::onShared,
            onConsumeToast = viewModel::consumeToast,
            onOpenLink = { url -> navController.navigate(Route.WebView.createRoute(url)) },
            onOpenRelated = { id -> navController.navigate(Route.ArticleDetail.createRoute(id)) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.Dashboard.route) {
        val viewModel: DashboardViewModel = hiltViewModel()
        val savedSearchViewModel: SavedSearchViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()
        val savedSearchState by savedSearchViewModel.uiState.collectAsStateWithLifecycle()

        DashboardScreen(
            state = state,
            savedSearches = savedSearchState.searches,
            onRerunSavedSearch = {
                // Re-run lands on the Search tab (where the saved-search list fully applies).
                navController.navigate(Route.Search.route) { launchSingleTop = true }
            },
            onToggleSavedSearchAlerts = savedSearchViewModel::toggleAlerts,
            onDeleteSavedSearch = savedSearchViewModel::delete,
            onSignIn = { navController.navigate(Route.Auth.route) },
            onUpgrade = { navController.navigate(Route.Subscription.route) },
            onPlanTrip = { navController.navigate(Route.TripPlanner.route) },
            onOpenTrip = { id -> navController.navigate(Route.ItineraryDetail.createRoute(id)) },
            onOpenEvent = { id -> navController.navigate(Route.EventDetail.createRoute(id)) },
            onOpenRestaurant = { id -> navController.navigate(Route.RestaurantDetail.createRoute(id)) },
            onOpenAttraction = { id -> navController.navigate(Route.AttractionDetail.createRoute(id)) },
            onRefresh = viewModel::refresh,
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.ContentHubs.route) {
        ContentHubsListScreen(
            onOpenHub = { id -> navController.navigate(Route.ContentHubDetail.createRoute(id)) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(
        route = Route.ContentHubDetail.route,
        arguments = Route.ContentHubDetail.arguments,
    ) { backStackEntry ->
        val hubId = backStackEntry.arguments?.getString("hubId") ?: return@composable
        val viewModel: ContentHubViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        androidx.compose.runtime.LaunchedEffect(hubId) { viewModel.load(hubId) }

        ContentHubScreen(
            state = state,
            onRetry = viewModel::retry,
            onOpenEvent = { id -> navController.navigate(Route.EventDetail.createRoute(id)) },
            onOpenAttraction = { id -> navController.navigate(Route.AttractionDetail.createRoute(id)) },
            onOpenRestaurant = { id -> navController.navigate(Route.RestaurantDetail.createRoute(id)) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.Neighborhoods.route) {
        NeighborhoodsHubScreen(
            onOpenNeighborhood = { slug -> navController.navigate(Route.NeighborhoodDetail.createRoute(slug)) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(
        route = Route.NeighborhoodDetail.route,
        arguments = Route.NeighborhoodDetail.arguments,
    ) { backStackEntry ->
        val slug = backStackEntry.arguments?.getString("slug") ?: return@composable
        val viewModel: NeighborhoodDetailViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        androidx.compose.runtime.LaunchedEffect(slug) { viewModel.load(slug) }

        NeighborhoodDetailScreen(
            state = state,
            onSortByNearby = viewModel::sortByNearby,
            onOpenRestaurant = { id -> navController.navigate(Route.RestaurantDetail.createRoute(id)) },
            onOpenAttraction = { id -> navController.navigate(Route.AttractionDetail.createRoute(id)) },
            onOpenEvent = { id -> navController.navigate(Route.EventDetail.createRoute(id)) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.Weekend.route) {
        val viewModel: WeekendViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        WeekendScreen(
            state = state,
            onRefresh = viewModel::refresh,
            onOpenEvent = { id -> navController.navigate(Route.EventDetail.createRoute(id)) },
            onOpenRestaurant = { id -> navController.navigate(Route.RestaurantDetail.createRoute(id)) },
            onOpenAttraction = { id -> navController.navigate(Route.AttractionDetail.createRoute(id)) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.SurpriseMe.route) {
        val viewModel: SurpriseMeViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        SurpriseMeScreen(
            state = state,
            onSave = viewModel::save,
            onTryAnother = viewModel::tryAnother,
            onOpen = { pick ->
                viewModel.onOpened()
                if (pick.isEvent) {
                    navController.navigate(Route.EventDetail.createRoute(pick.itemId))
                } else {
                    navController.navigate(Route.RestaurantDetail.createRoute(pick.itemId))
                }
            },
            onRetry = viewModel::roll,
            onNavigateBack = { navController.popBackStack() },
            onOpenSponsored = { itemType, itemId ->
                when (itemType) {
                    "event" -> navController.navigate(Route.EventDetail.createRoute(itemId))
                    "restaurant" -> navController.navigate(Route.RestaurantDetail.createRoute(itemId))
                }
            },
        )
    }

    composable(Route.TripPlanner.route) {
        val viewModel: TripPlannerViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        // Hard paywall: VM requests the Subscription screen (free on cooldown, or quota exhausted).
        androidx.compose.runtime.LaunchedEffect(state.navigateToSubscription) {
            if (state.navigateToSubscription) {
                navController.navigate(Route.Subscription.route)
                viewModel.consumeNavigation()
            }
        }

        TripPlannerScreen(
            state = state,
            allInterests = viewModel.allInterests,
            allAccessibilityNeeds = viewModel.allAccessibilityNeeds,
            allDietaryRestrictions = viewModel.allDietaryRestrictions,
            onSetStartOffset = viewModel::setStartOffset,
            onSetLength = viewModel::setLength,
            onToggleInterest = viewModel::toggleInterest,
            onToggleAccessibilityNeed = viewModel::toggleAccessibilityNeed,
            onToggleDietaryRestriction = viewModel::toggleDietaryRestriction,
            onSetGroupSize = viewModel::setGroupSize,
            onSetHasChildren = viewModel::setHasChildren,
            onSetBudget = viewModel::setBudget,
            onSetPace = viewModel::setPace,
            onGenerate = viewModel::generate,
            onReset = viewModel::reset,
            onClearError = viewModel::clearError,
            onViewSavedTrips = { navController.navigate(Route.SavedTrips.route) },
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.SavedTrips.route) {
        val viewModel: SavedTripsViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        androidx.compose.runtime.LaunchedEffect(Unit) { viewModel.load() }

        SavedTripsScreen(
            state = state,
            onShare = viewModel::share,
            onDelete = viewModel::delete,
            onOpenTrip = { id -> navController.navigate(Route.ItineraryDetail.createRoute(id)) },
            onConsumeShareUrl = viewModel::consumeShareUrl,
            onClearError = viewModel::clearError,
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(
        route = Route.ItineraryDetail.route,
        arguments = Route.ItineraryDetail.arguments,
    ) { backStackEntry ->
        val tripId = backStackEntry.arguments?.getString("tripId") ?: return@composable
        val viewModel: ItineraryDetailViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

        androidx.compose.runtime.LaunchedEffect(tripId) { viewModel.load(tripId) }

        ItineraryDetailScreen(
            state = state,
            onToggleReorder = viewModel::toggleReorderMode,
            onMove = viewModel::move,
            onConsumeMessage = viewModel::consumeMessage,
            onRetry = viewModel::retry,
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
        val subscriptionViewModel: SubscriptionViewModel = hiltViewModel()
        val state by subscriptionViewModel.uiState.collectAsStateWithLifecycle()
        val context = androidx.compose.ui.platform.LocalContext.current

        SubscriptionScreen(
            currentTier = state.currentTier,
            isLoading = state.isLoading,
            errorMessage = state.errorMessage,
            insiderPrice = state.insiderPrice,
            vipPrice = state.vipPrice,
            hasProducts = state.hasProducts,
            selectedTier = state.selectedTier,
            onSelectTier = { subscriptionViewModel.selectTier(it) },
            onPurchase = {
                (context as? android.app.Activity)?.let { activity ->
                    subscriptionViewModel.purchase(activity)
                }
            },
            onRestorePurchases = { subscriptionViewModel.restorePurchases() },
            onNavigateBack = { navController.popBackStack() },
            onNavigateToTerms = {
                navController.navigate(Route.WebView.createRoute("${com.desmoines.aipulse.util.Config.SITE_URL}/terms"))
            },
            onNavigateToPrivacy = {
                navController.navigate(Route.WebView.createRoute("${com.desmoines.aipulse.util.Config.SITE_URL}/privacy-policy"))
            },
        )
    }

    composable(Route.Settings.route) {
        val profileViewModel: ProfileViewModel = hiltViewModel()
        val settingsSubscriptionViewModel: SubscriptionViewModel = hiltViewModel()
        val isAuthenticated by profileViewModel.isAuthenticated.collectAsStateWithLifecycle()
        val isDeleting by profileViewModel.isDeleting.collectAsStateWithLifecycle()
        val showDeleteConfirmation by profileViewModel.showDeleteConfirmation.collectAsStateWithLifecycle()
        val errorMessage by profileViewModel.errorMessage.collectAsStateWithLifecycle()
        val subscriptionState by settingsSubscriptionViewModel.uiState.collectAsStateWithLifecycle()
        val locationConsent by profileViewModel.locationConsent.collectAsStateWithLifecycle()
        val emailConsent by profileViewModel.emailConsent.collectAsStateWithLifecycle()
        val analyticsConsent by profileViewModel.analyticsConsent.collectAsStateWithLifecycle()

        SettingsScreen(
            isAuthenticated = isAuthenticated,
            currentTier = subscriptionState.currentTier,
            isDeleting = isDeleting,
            showDeleteConfirmation = showDeleteConfirmation,
            errorMessage = errorMessage,
            locationConsent = locationConsent,
            emailConsent = emailConsent,
            analyticsConsent = analyticsConsent,
            onToggleLocationConsent = { profileViewModel.setLocationConsent(it) },
            onToggleEmailConsent = { profileViewModel.setEmailConsent(it) },
            onToggleAnalyticsConsent = { profileViewModel.setAnalyticsConsent(it) },
            onNavigateBack = { navController.popBackStack() },
            onNavigateToSubscription = {
                navController.navigate(Route.Subscription.route)
            },
            onNavigateToWebView = { url ->
                navController.navigate(Route.WebView.createRoute(url))
            },
            onRestorePurchases = { settingsSubscriptionViewModel.restorePurchases() },
            onRequestDelete = { profileViewModel.requestDeleteConfirmation() },
            onConfirmDelete = { profileViewModel.deleteAccount() },
            onDismissDelete = { profileViewModel.dismissDeleteConfirmation() },
            onClearError = { profileViewModel.clearError() },
            onResetOnboarding = {
                profileViewModel.resetOnboarding()
                navController.popBackStack()
            },
        )
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
