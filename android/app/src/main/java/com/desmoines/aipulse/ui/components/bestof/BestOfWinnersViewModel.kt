package com.desmoines.aipulse.ui.components.bestof

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.repository.BestOfWinnersStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Hosts the app-wide Best Of winners map so it can be provided via
 * [LocalBestOfAwards] near the root. Refreshes once on creation; the store is
 * also refreshed after a vote is cast.
 */
@HiltViewModel
class BestOfWinnersViewModel @Inject constructor(
    private val store: BestOfWinnersStore,
) : ViewModel() {

    val winners: StateFlow<Map<String, String>> = store.winners

    init {
        viewModelScope.launch { store.refresh() }
    }
}
