package com.desmoines.aipulse.data.repository

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * App-wide store of Best Of winners: entity id → "Best {Category}". Recomputed
 * after a vote is cast or the hub refreshes, and read by award badges on
 * restaurant/attraction/event cards wherever they appear. Mirrors iOS
 * BestOfWinners singleton.
 */
@Singleton
class BestOfWinnersStore @Inject constructor(
    private val repository: BestOfRepository,
) {
    private val _winners = MutableStateFlow<Map<String, String>>(emptyMap())
    val winners: StateFlow<Map<String, String>> = _winners.asStateFlow()

    /** Recomputes winners; tolerant of failures (leaves the prior map). */
    suspend fun refresh() {
        val map = repository.fetchWinners()
        _winners.value = map
    }
}
