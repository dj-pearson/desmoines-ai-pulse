package com.desmoines.aipulse.ui.screens.restaurantdetail

import android.content.Intent
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.FavoritesRepository
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.LocationService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import java.util.Locale

/**
 * ViewModel for the Restaurant Detail screen.
 * Mirrors iOS RestaurantDetailView.swift logic.
 */
@HiltViewModel
class RestaurantDetailViewModel @Inject constructor(
    private val restaurantsRepository: RestaurantsRepository,
    private val locationService: LocationService,
    private val favoritesRepository: FavoritesRepository,
    private val authRepository: AuthRepository,
    private val billingService: BillingService,
) : ViewModel() {

    private val _restaurant = MutableStateFlow<Restaurant?>(null)
    val restaurant: StateFlow<Restaurant?> = _restaurant.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _isFavorited = MutableStateFlow(false)
    val isFavorited: StateFlow<Boolean> = _isFavorited.asStateFlow()

    private val _favoriteError = MutableStateFlow<String?>(null)
    val favoriteError: StateFlow<String?> = _favoriteError.asStateFlow()

    fun loadRestaurant(id: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null

            restaurantsRepository.fetchRestaurant(id)
                .onSuccess {
                    _restaurant.value = it
                    refreshFavoriteState(it.id)
                }
                .onFailure { _errorMessage.value = it.message }

            _isLoading.value = false
        }
    }

    /**
     * Reads the persisted favorite state for [restaurantId].
     *
     * Until this was wired the heart was a local boolean that flipped on tap and
     * reset the moment the screen was reopened, so every save from a detail
     * screen was silently discarded.
     */
    private fun refreshFavoriteState(restaurantId: String) {
        val userId = authRepository.currentUserId
        if (userId == null) {
            _isFavorited.value = false
            return
        }
        viewModelScope.launch {
            favoritesRepository.loadFavorites(userId).onSuccess { state ->
                _isFavorited.value = restaurantId in state.favoriteRestaurantIds
            }
        }
    }

    fun toggleFavorite() {
        val restaurantId = _restaurant.value?.id ?: return
        val userId = authRepository.currentUserId
        if (userId == null) {
            _favoriteError.value = "Sign in to save restaurants."
            return
        }

        viewModelScope.launch {
            val currentIds = if (_isFavorited.value) setOf(restaurantId) else emptySet()
            favoritesRepository.toggleRestaurantFavorite(
                userId = userId,
                restaurantId = restaurantId,
                currentIds = currentIds,
                tier = billingService.currentTier.value,
            )
                .onSuccess { _isFavorited.value = it }
                .onFailure { _favoriteError.value = it.message }
        }
    }

    fun clearFavoriteError() {
        _favoriteError.value = null
    }

    /**
     * Formatted distance from user's location to this restaurant.
     * Returns null if location unavailable or restaurant has no coordinates.
     */
    fun formattedDistance(): String? {
        val coord = _restaurant.value?.coordinate ?: return null
        return locationService.formattedDistance(coord.latitude, coord.longitude)
    }

    // MARK: - Intents

    fun createCallIntent(): Intent? {
        val uri = _restaurant.value?.callUri ?: return null
        return Intent(Intent.ACTION_DIAL, uri)
    }

    fun createWebsiteIntent(): Intent? {
        val uri = _restaurant.value?.websiteUri ?: return null
        return Intent(Intent.ACTION_VIEW, uri)
    }

    fun createDirectionsIntent(): Intent? {
        val coord = _restaurant.value?.coordinate ?: return null
        val name = _restaurant.value?.name?.let {
            Uri.encode(it)
        } ?: ""
        val uri = Uri.parse("google.navigation:q=${coord.latitude},${coord.longitude}&q=$name")
        return Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage("com.google.android.apps.maps")
        }
    }

    fun createDirectionsFallbackIntent(): Intent? {
        val coord = _restaurant.value?.coordinate ?: return null
        val uri = Uri.parse("geo:${coord.latitude},${coord.longitude}?q=${coord.latitude},${coord.longitude}")
        return Intent(Intent.ACTION_VIEW, uri)
    }

    // MARK: - Share

    val shareText: String
        get() {
            val r = _restaurant.value ?: return ""
            val parts = mutableListOf(r.name)
            r.cuisine?.let { parts.add("($it)") }
            parts.add("- ${r.displayLocation}")
            r.rating?.let { parts.add("\u2B50 ${String.format(Locale.US, "%.1f", it)}") }
            return parts.joinToString(" ") + "\n\nFound on Des Moines Insider"
        }

    // MARK: - Dining Tips

    fun getDiningTipText(): String {
        val r = _restaurant.value ?: return ""
        val tips = mutableListOf<String>()

        r.priceRange?.let { price ->
            when (price) {
                "$" -> tips.add("Great value spot! Perfect for a casual meal without breaking the bank.")
                "$$" -> tips.add("Moderately priced with generous portions \u2014 a solid pick for date night or group dinners.")
                "$$$" -> tips.add("Upscale dining experience. Reservations recommended, especially on weekends.")
                "$$$$" -> tips.add("Fine dining at its best. Consider the tasting menu for the full experience.")
            }
        }

        r.cuisine?.let { cuisine ->
            val lower = cuisine.lowercase()
            when {
                lower.contains("italian") || lower.contains("pizza") ->
                    tips.add("Ask about daily pasta specials \u2014 they're often not on the menu.")
                lower.contains("mexican") || lower.contains("taco") ->
                    tips.add("Try the house salsa and ask if they have off-menu specials.")
                lower.contains("bbq") || lower.contains("barbecue") ->
                    tips.add("Get there early \u2014 the best cuts sell out fast!")
                lower.contains("asian") || lower.contains("sushi") || lower.contains("chinese") || lower.contains("thai") ->
                    tips.add("Don't skip the appetizers \u2014 they're often the hidden gems here.")
                lower.contains("breakfast") || lower.contains("brunch") ->
                    tips.add("Weekend brunch gets busy. Arrive before 10 AM or expect a wait.")
            }
        }

        if (tips.isEmpty()) {
            tips.add("Local favorite! Ask your server for their personal recommendation \u2014 you won't be disappointed.")
        }

        return tips.joinToString(" ")
    }
}
