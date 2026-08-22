package com.desmoines.aipulse.ui.screens.tripplanner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.PaywallContext
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.data.model.TripBudget
import com.desmoines.aipulse.data.model.TripPace
import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.remote.BillingService
import com.desmoines.aipulse.data.remote.TripPlannerServerError
import com.desmoines.aipulse.data.remote.TripPreferences
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.TripPlannerRepository
import com.desmoines.aipulse.util.NetworkMonitor
import com.desmoines.aipulse.util.SoftPaywallService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

data class TripPlannerUiState(
    val startOffsetDays: Int = 0,
    val lengthDays: Int = 2,
    val startDate: String = "",
    val endDate: String = "",
    val interests: Set<String> = emptySet(),
    val groupSize: Int = 2,
    val hasChildren: Boolean = false,
    val accessibilityNeeds: Set<String> = emptySet(),
    val dietaryRestrictions: Set<String> = emptySet(),
    val budget: TripBudget = TripBudget.ANY,
    val pace: TripPace = TripPace.MODERATE,
    val isGenerating: Boolean = false,
    val errorMessage: String? = null,
    val result: TripPlan? = null,
    val tier: SubscriptionTier = SubscriptionTier.FREE,
    val monthlyUsed: Int = 0,
    val navigateToSubscription: Boolean = false,
) {
    val canGenerate: Boolean get() = interests.isNotEmpty() && !isGenerating
    val quotaLabel: String
        get() = when (tier) {
            SubscriptionTier.VIP -> "Unlimited itineraries"
            SubscriptionTier.INSIDER ->
                "${(INSIDER_MONTHLY_QUOTA - monthlyUsed).coerceAtLeast(0)} of $INSIDER_MONTHLY_QUOTA left this month"
            SubscriptionTier.FREE -> "Insider feature — upgrade to plan trips"
        }

    companion object {
        const val INSIDER_MONTHLY_QUOTA = 5
    }
}

/**
 * Drives the AI Trip Planner form. Mirrors iOS TripPlannerView's view model:
 * builds preferences, gates free users with the soft paywall (hard paywall on
 * cooldown / quota exhaustion), and calls generate-itinerary.
 */
@HiltViewModel
class TripPlannerViewModel @Inject constructor(
    private val repository: TripPlannerRepository,
    private val billingService: BillingService,
    private val softPaywallService: SoftPaywallService,
    private val authRepository: AuthRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val isoDate = DateTimeFormatter.ISO_LOCAL_DATE

    private val _uiState = MutableStateFlow(TripPlannerUiState())
    val uiState: StateFlow<TripPlannerUiState> = _uiState.asStateFlow()

    val allInterests = com.desmoines.aipulse.data.model.TRIP_INTERESTS
    val allAccessibilityNeeds = com.desmoines.aipulse.data.model.TRIP_ACCESSIBILITY_NEEDS
    val allDietaryRestrictions = com.desmoines.aipulse.data.model.TRIP_DIETARY_RESTRICTIONS

    init {
        recomputeDates()
        viewModelScope.launch {
            billingService.currentTier.collect { tier ->
                _uiState.update { it.copy(tier = tier) }
            }
        }
        refreshQuota()
    }

    fun setStartOffset(days: Int) {
        _uiState.update { it.copy(startOffsetDays = days.coerceIn(0, 60)) }
        recomputeDates()
    }

    fun setLength(days: Int) {
        _uiState.update { it.copy(lengthDays = days.coerceIn(1, 7)) }
        recomputeDates()
    }

    fun toggleInterest(interest: String) {
        _uiState.update {
            val next = if (interest in it.interests) it.interests - interest else it.interests + interest
            it.copy(interests = next)
        }
    }

    fun toggleAccessibilityNeed(need: String) {
        _uiState.update {
            val next = if (need in it.accessibilityNeeds) {
                it.accessibilityNeeds - need
            } else {
                it.accessibilityNeeds + need
            }
            it.copy(accessibilityNeeds = next)
        }
    }

    fun toggleDietaryRestriction(restriction: String) {
        _uiState.update {
            val next = if (restriction in it.dietaryRestrictions) {
                it.dietaryRestrictions - restriction
            } else {
                it.dietaryRestrictions + restriction
            }
            it.copy(dietaryRestrictions = next)
        }
    }

    fun setGroupSize(size: Int) = _uiState.update { it.copy(groupSize = size.coerceIn(1, 12)) }
    fun setHasChildren(value: Boolean) = _uiState.update { it.copy(hasChildren = value) }
    fun setBudget(budget: TripBudget) = _uiState.update { it.copy(budget = budget) }
    fun setPace(pace: TripPace) = _uiState.update { it.copy(pace = pace) }
    fun clearError() = _uiState.update { it.copy(errorMessage = null) }
    fun consumeNavigation() = _uiState.update { it.copy(navigateToSubscription = false) }

    /** Reset back to the form to plan another trip. */
    fun reset() {
        val current = _uiState.value
        _uiState.value = TripPlannerUiState(tier = current.tier, monthlyUsed = current.monthlyUsed)
        recomputeDates()
    }

    fun generate() {
        val state = _uiState.value
        if (!state.canGenerate) return

        if (!networkMonitor.isConnected.value) {
            _uiState.update { it.copy(errorMessage = "You're offline. Reconnect to plan a trip.") }
            return
        }

        when (state.tier) {
            SubscriptionTier.FREE -> {
                // Soft paywall first; if it's on cooldown/capped, fall through to the hard paywall.
                val shown = softPaywallService.maybePresent(PaywallContext.TRIP_PLANNER)
                if (!shown) _uiState.update { it.copy(navigateToSubscription = true) }
                return
            }
            SubscriptionTier.INSIDER -> {
                if (state.monthlyUsed >= TripPlannerUiState.INSIDER_MONTHLY_QUOTA) {
                    _uiState.update { it.copy(navigateToSubscription = true) }
                    return
                }
            }
            SubscriptionTier.VIP -> Unit
        }

        _uiState.update { it.copy(isGenerating = true, errorMessage = null) }
        viewModelScope.launch {
            val prefs = TripPreferences(
                interests = state.interests.toList(),
                budget = state.budget.value,
                pace = state.pace.value,
                groupSize = state.groupSize,
                hasChildren = state.hasChildren,
                accessibilityNeeds = state.accessibilityNeeds.toList(),
                dietaryRestrictions = state.dietaryRestrictions.toList(),
            )
            repository.generate(state.startDate, state.endDate, prefs)
                .onSuccess { plan ->
                    _uiState.update { it.copy(result = plan, isGenerating = false) }
                    refreshQuota()
                }
                .onFailure { error ->
                    // XPLAT-010 AC2: a 403 upgrade_required is a paywall, not a
                    // fault. Route it to the subscription screen the way web does,
                    // rather than showing "try again" for something retrying cannot
                    // fix. quota_exceeded keeps its server message, which names the
                    // limit and when it resets.
                    val serverError = error as? TripPlannerServerError
                    _uiState.update {
                        it.copy(
                            isGenerating = false,
                            errorMessage = error.message
                                ?: "Couldn't build your itinerary. Try again.",
                            navigateToSubscription = it.navigateToSubscription ||
                                serverError?.code == "upgrade_required",
                        )
                    }
                }
        }
    }

    private fun refreshQuota() {
        viewModelScope.launch {
            val used = repository.monthlyTripCount(authRepository.currentUserId)
            _uiState.update { it.copy(monthlyUsed = used) }
        }
    }

    private fun recomputeDates() {
        val state = _uiState.value
        val start = LocalDate.now().plusDays(state.startOffsetDays.toLong())
        val end = start.plusDays((state.lengthDays - 1).toLong())
        _uiState.update { it.copy(startDate = start.format(isoDate), endDate = end.format(isoDate)) }
    }
}
