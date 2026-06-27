package com.desmoines.aipulse.ui.navigation

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import com.desmoines.aipulse.ui.theme.PremiumMotion
import com.desmoines.aipulse.data.model.SubscriptionTier
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
import com.desmoines.aipulse.ui.screens.auth.AuthScreen
import com.desmoines.aipulse.ui.screens.eventdetail.EventDetailScreen
import com.desmoines.aipulse.ui.screens.eventdetail.EventDetailViewModel
import com.desmoines.aipulse.ui.screens.attractiondetail.AttractionDetailScreen
import com.desmoines.aipulse.ui.screens.attractiondetail.AttractionDetailViewModel
import com.desmoines.aipulse.ui.screens.restaurantdetail.RestaurantDetailScreen
import com.desmoines.aipulse.ui.screens.restaurantdetail.RestaurantDetailViewModel
import com.desmoines.aipulse.ui.screens.favorites.FavoritesScreen
import com.desmoines.aipulse.ui.screens.favorites.FavoritesViewModel
import com.desmoines.aipulse.ui.screens.home.EventsViewModel
import com.desmoines.aipulse.ui.screens.home.FilterSheet
import com.desmoines.aipulse.ui.screens.home.HomeScreen
import com.desmoines.aipulse.ui.screens.map.MapScreen
import com.desmoines.aipulse.ui.screens.map.MapViewModel
import com.desmoines.aipulse.ui.screens.onboarding.OnboardingScreen
import com.desmoines.aipulse.ui.screens.profile.ProfileScreen
import com.desmoines.aipulse.ui.screens.profile.ProfileViewModel
import com.desmoines.aipulse.ui.screens.profile.SettingsScreen
import com.desmoines.aipulse.ui.screens.restaurants.RestaurantFilterSheet
import com.desmoines.aipulse.ui.screens.restaurants.RestaurantsScreen
import com.desmoines.aipulse.ui.screens.restaurants.RestaurantsViewModel
import com.desmoines.aipulse.ui.components.WebViewScreen
import com.desmoines.aipulse.ui.screens.search.SearchScreen
import com.desmoines.aipulse.ui.screens.search.SearchViewModel
import com.desmoines.aipulse.ui.screens.search.SearchTab
import com.desmoines.aipulse.ui.screens.search.SavedSearchViewModel
import com.desmoines.aipulse.ui.screens.subscription.SubscriptionScreen
import com.desmoines.aipulse.ui.screens.subscription.SubscriptionViewModel
import com.desmoines.aipulse.data.remote.BillingService

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

private fun NavGraphBuilder.addTabDestinations(
    navController: NavHostController,
    scrollToTopTrigger: Int,
    useWideLayout: Boolean,
) {
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
            scrollToTopTrigger = scrollToTopTrigger,
            useWideLayout = useWideLayout,
            onNavigateToEventDetail = { id ->
                navController.navigate(Route.EventDetail.createRoute(id))
            },
            onNavigateToRestaurantDetail = { id ->
                navController.navigate(Route.RestaurantDetail.createRoute(id))
            },
            onNavigateToSubscription = {
                navController.navigate(Route.Subscription.route)
            },
            onNavigateToTripPlanner = {
                navController.navigate(Route.TripPlanner.route)
            },
            onNavigateToDiscover = {
                navController.navigate(Route.Discover.route)
            },
            onNavigateToSurpriseMe = {
                navController.navigate(Route.SurpriseMe.route)
            },
            onNavigateToWeekend = {
                navController.navigate(Route.Weekend.route)
            },
            onNavigateToNeighborhoods = {
                navController.navigate(Route.Neighborhoods.route)
            },
            onNavigateToContentHubs = {
                navController.navigate(Route.ContentHubs.route)
            },
            onSelectCategory = { category -> viewModel.setSelectedCategory(category) },
            onSelectDatePreset = { preset -> viewModel.setSelectedDatePreset(preset) },
            onShowFilters = { showFilterSheet = true },
            onClearFilters = { viewModel.clearFilters() },
            onRefresh = { viewModel.refresh() },
            onLoadMore = { viewModel.loadMoreIfNeeded(state.events.size - 1) },
            onFavoriteClick = null, // Favorites implemented in AND-024
        )

        // Dismiss filter sheet on system back press before navigating away
        BackHandler(enabled = showFilterSheet) {
            showFilterSheet = false
        }

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
        val viewModel: RestaurantsViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsState()
        var showFilterSheet by remember { mutableStateOf(false) }

        androidx.compose.runtime.LaunchedEffect(Unit) {
            viewModel.loadInitialData()
        }

        RestaurantsScreen(
            state = state,
            onNavigateToRestaurantDetail = { id ->
                navController.navigate(Route.RestaurantDetail.createRoute(id))
            },
            onNavigateToSubscription = {
                navController.navigate(Route.Subscription.route)
            },
            onShowFilters = { showFilterSheet = true },
            onSortBySelected = { viewModel.setSortBy(it) },
            onToggleOpenNow = { viewModel.toggleOpenNowOnly() },
            onClearFilters = { viewModel.clearFilters() },
            onRefresh = { viewModel.refresh() },
            onLoadMore = { viewModel.loadMoreIfNeeded(state.restaurants.size - 1) },
            onFavoriteClick = null, // Favorites wired in AND-024
        )

        // Dismiss filter sheet on system back press before navigating away
        BackHandler(enabled = showFilterSheet) {
            showFilterSheet = false
        }

        if (showFilterSheet) {
            RestaurantFilterSheet(
                availableCuisines = state.availableCuisines,
                selectedCuisines = state.selectedCuisines,
                selectedPriceRanges = state.selectedPriceRanges,
                onToggleCuisine = { viewModel.toggleCuisine(it) },
                onTogglePriceRange = { viewModel.togglePriceRange(it) },
                onClearFilters = { viewModel.clearFilters() },
                onDismiss = { showFilterSheet = false },
            )
        }
    }

    composable(Route.Search.route) {
        val viewModel: SearchViewModel = hiltViewModel()
        val savedSearchViewModel: SavedSearchViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsState()
        val savedSearchState by savedSearchViewModel.uiState.collectAsState()

        SearchScreen(
            state = state,
            savedSearches = savedSearchState.searches,
            onSearchTextChanged = viewModel::onSearchTextChanged,
            onTabSelected = viewModel::onTabSelected,
            onClearSearch = viewModel::clearSearch,
            onSaveCurrentSearch = {
                savedSearchViewModel.save(state.searchText, state.selectedTab.displayName)
            },
            onRerunSavedSearch = { search ->
                SearchTab.entries.firstOrNull { it.displayName == search.filters.tab }
                    ?.let { viewModel.onTabSelected(it) }
                viewModel.onSearchTextChanged(search.query)
            },
            onToggleSavedSearchAlerts = savedSearchViewModel::toggleAlerts,
            onDeleteSavedSearch = savedSearchViewModel::delete,
            onNavigateToEventDetail = { id ->
                navController.navigate(Route.EventDetail.createRoute(id))
            },
            onNavigateToRestaurantDetail = { id ->
                navController.navigate(Route.RestaurantDetail.createRoute(id))
            },
            onNavigateToAttractionDetail = { id ->
                navController.navigate(Route.AttractionDetail.createRoute(id))
            },
        )
    }

    composable(Route.Map.route) {
        val viewModel: MapViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsState()

        androidx.compose.runtime.LaunchedEffect(Unit) {
            viewModel.loadNearbyContent()
        }

        MapScreen(
            state = state,
            onSearchTextChanged = viewModel::setSearchText,
            onSearch = viewModel::search,
            onToggleEvents = viewModel::toggleShowEvents,
            onToggleRestaurants = viewModel::toggleShowRestaurants,
            onToggleAttractions = viewModel::toggleShowAttractions,
            onSelectEvent = viewModel::selectEvent,
            onSelectRestaurant = viewModel::selectRestaurant,
            onSelectAttraction = viewModel::selectAttraction,
            onClearSelection = viewModel::clearSelection,
            onRetry = viewModel::retry,
            onNavigateToEventDetail = { id ->
                navController.navigate(Route.EventDetail.createRoute(id))
            },
            onNavigateToRestaurantDetail = { id ->
                navController.navigate(Route.RestaurantDetail.createRoute(id))
            },
            onNavigateToAttractionDetail = { id ->
                navController.navigate(Route.AttractionDetail.createRoute(id))
            },
        )
    }

    composable(Route.Saved.route) {
        val viewModel: FavoritesViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsState()

        androidx.compose.runtime.LaunchedEffect(Unit) {
            viewModel.loadFavorites()
        }

        FavoritesScreen(
            state = state,
            onNavigateToEventDetail = { id ->
                navController.navigate(Route.EventDetail.createRoute(id))
            },
            onNavigateToRestaurantDetail = { id ->
                navController.navigate(Route.RestaurantDetail.createRoute(id))
            },
            onNavigateToAuth = {
                navController.navigate(Route.Auth.route)
            },
            onNavigateToSubscription = {
                navController.navigate(Route.Subscription.route)
            },
            onRemoveEventFavorite = { eventId -> viewModel.removeEventFavorite(eventId) },
            onRemoveRestaurantFavorite = { restaurantId -> viewModel.removeRestaurantFavorite(restaurantId) },
            onRefresh = { viewModel.refresh() },
        )
    }

    composable(Route.Profile.route) {
        val viewModel: ProfileViewModel = hiltViewModel()
        val profileSubscriptionViewModel: SubscriptionViewModel = hiltViewModel()
        val isAuthenticated by viewModel.isAuthenticated.collectAsState()
        val profile by viewModel.profile.collectAsState()
        val firstName by viewModel.firstName.collectAsState()
        val lastName by viewModel.lastName.collectAsState()
        val phone by viewModel.phone.collectAsState()
        val location by viewModel.location.collectAsState()
        val selectedInterests by viewModel.selectedInterests.collectAsState()
        val isSaving by viewModel.isSaving.collectAsState()
        val isDeleting by viewModel.isDeleting.collectAsState()
        val showSaveSuccess by viewModel.showSaveSuccess.collectAsState()
        val showDeleteConfirmation by viewModel.showDeleteConfirmation.collectAsState()
        val errorMessage by viewModel.errorMessage.collectAsState()
        val profileSubState by profileSubscriptionViewModel.uiState.collectAsState()
        val context = androidx.compose.ui.platform.LocalContext.current

        ProfileScreen(
            isAuthenticated = isAuthenticated,
            displayName = viewModel.displayName,
            initials = viewModel.initials,
            email = profile?.email ?: "",
            firstName = firstName,
            lastName = lastName,
            phone = phone,
            location = location,
            selectedInterests = selectedInterests,
            currentTier = profileSubState.currentTier,
            isSaving = isSaving,
            isDeleting = isDeleting,
            showSaveSuccess = showSaveSuccess,
            showDeleteConfirmation = showDeleteConfirmation,
            errorMessage = errorMessage,
            onFirstNameChanged = { viewModel.setFirstName(it) },
            onLastNameChanged = { viewModel.setLastName(it) },
            onPhoneChanged = { viewModel.setPhone(it) },
            onLocationChanged = { viewModel.setLocation(it) },
            onToggleInterest = { viewModel.toggleInterest(it) },
            onSaveProfile = { viewModel.saveProfile() },
            onSignOut = { viewModel.signOut() },
            onRequestDelete = { viewModel.requestDeleteConfirmation() },
            onConfirmDelete = { viewModel.deleteAccount() },
            onDismissDelete = { viewModel.dismissDeleteConfirmation() },
            onDismissSaveSuccess = { viewModel.dismissSaveSuccess() },
            onClearError = { viewModel.clearError() },
            onNavigateToAuth = {
                navController.navigate(Route.Auth.route)
            },
            onNavigateToSettings = {
                navController.navigate(Route.Settings.route)
            },
            onNavigateToSubscription = {
                navController.navigate(Route.Subscription.route)
            },
            onVisitWebsite = {
                val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(com.desmoines.aipulse.util.Config.SITE_URL))
                context.startActivity(intent)
            },
        )
    }
}

private fun NavGraphBuilder.addDetailDestinations(navController: NavHostController) {
    composable(
        route = Route.EventDetail.route,
        arguments = Route.EventDetail.arguments
    ) { backStackEntry ->
        val eventId = backStackEntry.arguments?.getString("eventId") ?: return@composable
        val viewModel: EventDetailViewModel = hiltViewModel()
        val eventSubViewModel: SubscriptionViewModel = hiltViewModel()
        val event by viewModel.event.collectAsState()
        val relatedEvents by viewModel.relatedEvents.collectAsState()
        val isLoading by viewModel.isLoading.collectAsState()
        val isFavorited by viewModel.isFavorited.collectAsState()
        val calendarAdded by viewModel.calendarAdded.collectAsState()
        val eventSubState by eventSubViewModel.uiState.collectAsState()
        val context = androidx.compose.ui.platform.LocalContext.current

        androidx.compose.runtime.LaunchedEffect(eventId) {
            viewModel.loadEvent(eventId)
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
                    context.startActivity(intent)
                    viewModel.setCalendarAdded()
                }
            },
            onOpenDirections = {
                viewModel.createDirectionsIntent()?.let { intent ->
                    try {
                        context.startActivity(intent)
                    } catch (_: Exception) {
                        viewModel.createDirectionsFallbackIntent()?.let { fallback ->
                            context.startActivity(fallback)
                        }
                    }
                }
            },
            onOpenDirectionsFallback = {
                viewModel.createDirectionsFallbackIntent()?.let { intent ->
                    context.startActivity(intent)
                }
            },
            onShowSubscription = {
                navController.navigate(Route.Subscription.route)
            },
            onNavigateToEventDetail = { id ->
                navController.navigate(Route.EventDetail.createRoute(id))
            },
            onOpenSourceUrl = { url ->
                val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                context.startActivity(intent)
            },
        )
    }

    composable(
        route = Route.RestaurantDetail.route,
        arguments = Route.RestaurantDetail.arguments
    ) { backStackEntry ->
        val restaurantId = backStackEntry.arguments?.getString("restaurantId") ?: return@composable
        val viewModel: RestaurantDetailViewModel = hiltViewModel()
        val restSubViewModel: SubscriptionViewModel = hiltViewModel()
        val restaurant by viewModel.restaurant.collectAsState()
        val isLoading by viewModel.isLoading.collectAsState()
        val isFavorited by viewModel.isFavorited.collectAsState()
        val restSubState by restSubViewModel.uiState.collectAsState()
        val context = androidx.compose.ui.platform.LocalContext.current

        androidx.compose.runtime.LaunchedEffect(restaurantId) {
            viewModel.loadRestaurant(restaurantId)
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
                    context.startActivity(intent)
                }
            },
            onOpenWebsite = {
                viewModel.createWebsiteIntent()?.let { intent ->
                    context.startActivity(intent)
                }
            },
            onOpenDirections = {
                viewModel.createDirectionsIntent()?.let { intent ->
                    try {
                        context.startActivity(intent)
                    } catch (_: Exception) {
                        viewModel.createDirectionsFallbackIntent()?.let { fallback ->
                            context.startActivity(fallback)
                        }
                    }
                }
            },
            onShowSubscription = {
                navController.navigate(Route.Subscription.route)
            },
        )
    }

    composable(
        route = Route.AttractionDetail.route,
        arguments = Route.AttractionDetail.arguments
    ) { backStackEntry ->
        val attractionId = backStackEntry.arguments?.getString("attractionId") ?: return@composable
        val viewModel: AttractionDetailViewModel = hiltViewModel()
        val attraction by viewModel.attraction.collectAsState()
        val isLoading by viewModel.isLoading.collectAsState()
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
                viewModel.createWebsiteIntent()?.let { intent ->
                    context.startActivity(intent)
                }
            },
            onOpenDirections = {
                viewModel.createDirectionsIntent()?.let { intent ->
                    try {
                        context.startActivity(intent)
                    } catch (_: Exception) {
                        viewModel.createDirectionsFallbackIntent()?.let { fallback ->
                            context.startActivity(fallback)
                        }
                    }
                }
            },
        )
    }
}

private fun NavGraphBuilder.addFlowDestinations(navController: NavHostController) {
    composable(Route.Auth.route) {
        AuthScreen(
            onNavigateBack = { navController.popBackStack() },
        )
    }

    composable(Route.AskPulse.route) {
        val viewModel: AskPulseViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsState()

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
        val state by viewModel.uiState.collectAsState()

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
        val state by viewModel.uiState.collectAsState()

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
        val state by viewModel.uiState.collectAsState()

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
        val state by viewModel.uiState.collectAsState()

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
        val state by viewModel.uiState.collectAsState()

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
        )
    }

    composable(Route.TripPlanner.route) {
        val viewModel: TripPlannerViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsState()

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
            onSetStartOffset = viewModel::setStartOffset,
            onSetLength = viewModel::setLength,
            onToggleInterest = viewModel::toggleInterest,
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
        val state by viewModel.uiState.collectAsState()

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
        val state by viewModel.uiState.collectAsState()

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
        val state by subscriptionViewModel.uiState.collectAsState()
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
        val isAuthenticated by profileViewModel.isAuthenticated.collectAsState()
        val isDeleting by profileViewModel.isDeleting.collectAsState()
        val showDeleteConfirmation by profileViewModel.showDeleteConfirmation.collectAsState()
        val errorMessage by profileViewModel.errorMessage.collectAsState()
        val subscriptionState by settingsSubscriptionViewModel.uiState.collectAsState()

        SettingsScreen(
            isAuthenticated = isAuthenticated,
            currentTier = subscriptionState.currentTier,
            isDeleting = isDeleting,
            showDeleteConfirmation = showDeleteConfirmation,
            errorMessage = errorMessage,
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
