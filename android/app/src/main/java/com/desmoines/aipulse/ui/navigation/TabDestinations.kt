package com.desmoines.aipulse.ui.navigation

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import com.desmoines.aipulse.ui.screens.favorites.FavoritesScreen
import com.desmoines.aipulse.ui.screens.favorites.FavoritesViewModel
import com.desmoines.aipulse.ui.screens.home.EventsViewModel
import com.desmoines.aipulse.ui.screens.home.FilterSheet
import com.desmoines.aipulse.ui.screens.home.HomeScreen
import com.desmoines.aipulse.ui.screens.map.MapScreen
import com.desmoines.aipulse.ui.screens.map.MapViewModel
import com.desmoines.aipulse.ui.screens.profile.ProfileScreen
import com.desmoines.aipulse.ui.screens.profile.ProfileViewModel
import com.desmoines.aipulse.ui.screens.restaurants.RestaurantFilterSheet
import com.desmoines.aipulse.ui.screens.restaurants.RestaurantsScreen
import com.desmoines.aipulse.ui.screens.restaurants.RestaurantsViewModel
import com.desmoines.aipulse.ui.screens.search.SearchScreen
import com.desmoines.aipulse.ui.screens.search.SearchViewModel
import com.desmoines.aipulse.ui.screens.search.SearchTab
import com.desmoines.aipulse.ui.screens.search.SavedSearchViewModel
import com.desmoines.aipulse.ui.screens.subscription.SubscriptionViewModel

/**
 * The six bottom-tab destinations. Split out of MainNavHost.kt under AND-AUDIT-021;
 * the file held every route in the app and every navigation change touched it.
 *
 * Pure move: no route string, navArgument or composable body changed. MainNavHost
 * still calls this, and Route (NavGraph.kt) is still the only source of route
 * strings.
 */

internal fun NavGraphBuilder.addTabDestinations(
    navController: NavHostController,
    scrollToTopTrigger: Int,
    useWideLayout: Boolean,
) {
    composable(Route.Home.route) {
        val viewModel: EventsViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()
        var showFilterSheet by remember { mutableStateOf(false) }

        // Filter state for the sheet
        val showFreeOnly by viewModel.showFreeOnly.collectAsStateWithLifecycle()
        val maxDistance by viewModel.maxDistance.collectAsStateWithLifecycle()
        val minRating by viewModel.minRating.collectAsStateWithLifecycle()

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
            onNavigateToDashboard = {
                navController.navigate(Route.Dashboard.route)
            },
            onNavigateToArticles = {
                navController.navigate(Route.Articles.route)
            },
            onNavigateToDeals = {
                navController.navigate(Route.Deals.route)
            },
            onNavigateToHotels = {
                navController.navigate(Route.Hotels.route)
            },
            onNavigateToBestOf = {
                navController.navigate(Route.BestOf.route)
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
                    // Open the contextual soft paywall (ANDP-074); its Subscribe
                    // button routes on to the store screen.
                    viewModel.requestFilterUpgrade()
                },
                onDismiss = { showFilterSheet = false },
            )
        }
    }

    composable(Route.Dining.route) {
        val viewModel: RestaurantsViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()
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
            scrollToTopTrigger = scrollToTopTrigger,
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
        val state by viewModel.uiState.collectAsStateWithLifecycle()
        val savedSearchState by savedSearchViewModel.uiState.collectAsStateWithLifecycle()

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
            onOpenRecent = { item ->
                val route = when (item.type) {
                    com.desmoines.aipulse.data.model.RecentItemType.EVENT -> Route.EventDetail.createRoute(item.id)
                    com.desmoines.aipulse.data.model.RecentItemType.RESTAURANT -> Route.RestaurantDetail.createRoute(item.id)
                    com.desmoines.aipulse.data.model.RecentItemType.ATTRACTION -> Route.AttractionDetail.createRoute(item.id)
                    com.desmoines.aipulse.data.model.RecentItemType.ARTICLE -> Route.ArticleDetail.createRoute(item.id)
                    com.desmoines.aipulse.data.model.RecentItemType.HOTEL -> Route.HotelDetail.createRoute(item.id)
                }
                navController.navigate(route)
            },
            scrollToTopTrigger = scrollToTopTrigger,
        )
    }

    composable(Route.Map.route) {
        val viewModel: MapViewModel = hiltViewModel()
        val state by viewModel.uiState.collectAsStateWithLifecycle()

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
        val state by viewModel.uiState.collectAsStateWithLifecycle()

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
            scrollToTopTrigger = scrollToTopTrigger,
        )
    }

    composable(Route.Profile.route) {
        val viewModel: ProfileViewModel = hiltViewModel()
        val profileSubscriptionViewModel: SubscriptionViewModel = hiltViewModel()
        val isAuthenticated by viewModel.isAuthenticated.collectAsStateWithLifecycle()
        val profile by viewModel.profile.collectAsStateWithLifecycle()
        val firstName by viewModel.firstName.collectAsStateWithLifecycle()
        val lastName by viewModel.lastName.collectAsStateWithLifecycle()
        val phone by viewModel.phone.collectAsStateWithLifecycle()
        val location by viewModel.location.collectAsStateWithLifecycle()
        val selectedInterests by viewModel.selectedInterests.collectAsStateWithLifecycle()
        val isSaving by viewModel.isSaving.collectAsStateWithLifecycle()
        val isDeleting by viewModel.isDeleting.collectAsStateWithLifecycle()
        val showSaveSuccess by viewModel.showSaveSuccess.collectAsStateWithLifecycle()
        val showDeleteConfirmation by viewModel.showDeleteConfirmation.collectAsStateWithLifecycle()
        val errorMessage by viewModel.errorMessage.collectAsStateWithLifecycle()
        val profileSubState by profileSubscriptionViewModel.uiState.collectAsStateWithLifecycle()
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
                com.desmoines.aipulse.util.SafeLinkLauncher.openUrl(context, com.desmoines.aipulse.util.Config.SITE_URL)
            },
        )
    }
}
