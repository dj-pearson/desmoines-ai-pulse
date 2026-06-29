package com.desmoines.aipulse.ui.screens.restaurants

import com.desmoines.aipulse.data.model.Restaurant
import com.desmoines.aipulse.data.remote.RestaurantsResponse
import com.desmoines.aipulse.data.repository.RestaurantsRepository
import com.desmoines.aipulse.util.AppSearchService
import com.desmoines.aipulse.util.NetworkMonitor
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * Regression guard for ANDP-061: a slow, superseded fetch must never clobber the
 * result of a newer one. Without the generation guard the late [A] response would
 * overwrite the fresher [B], desyncing the list from the user's latest action.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class RestaurantsViewModelStaleFetchTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: RestaurantsRepository
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var appSearchService: AppSearchService

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        networkMonitor = mockk(relaxed = true)
        appSearchService = mockk(relaxed = true)
        every { networkMonitor.isConnected } returns MutableStateFlow(true)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun restaurant(id: String) = Restaurant(id = id, name = "Restaurant $id")

    private fun response(vararg ids: String) =
        Result.success(RestaurantsResponse(ids.map(::restaurant), ids.size, false))

    private fun vm() = RestaurantsViewModel(repository, networkMonitor, appSearchService)

    @Test
    fun `a slow superseded refresh does not overwrite the latest result`() = runTest(testDispatcher) {
        // First (older) refresh is slow and returns [A]; second (newer) is fast and returns [B].
        val pending = ArrayDeque(listOf(100L to response("A"), 10L to response("B")))
        coEvery { repository.fetchRestaurants(any()) } coAnswers {
            val (delayMs, result) = pending.removeFirst()
            delay(delayMs)
            result
        }

        val viewModel = vm()
        backgroundScope.launch { viewModel.uiState.collect {} }

        viewModel.refresh() // older, slow
        viewModel.refresh() // newer, fast — supersedes
        advanceUntilIdle()

        assertEquals(listOf("B"), viewModel.uiState.value.restaurants.map { it.id })
    }
}
