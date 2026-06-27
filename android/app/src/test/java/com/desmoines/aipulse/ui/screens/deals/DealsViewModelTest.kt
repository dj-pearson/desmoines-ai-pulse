package com.desmoines.aipulse.ui.screens.deals

import com.desmoines.aipulse.data.model.Deal
import com.desmoines.aipulse.data.repository.DealsRepository
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DealsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: DealsRepository

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun deal(id: String, entityType: String, title: String = "Deal $id", business: String = "Biz", active: Boolean = true) =
        Deal(
            id = id, title = title, businessName = business, entityType = entityType, dealType = "percentage",
            startDate = "2000-01-01T00:00:00Z",
            endDate = if (active) "2099-01-01T00:00:00Z" else "2000-02-01T00:00:00Z",
        )

    private fun vm() = DealsViewModel(repository)

    @Test
    fun `load shows all deals`() = runTest(testDispatcher) {
        coEvery { repository.fetchDeals(any()) } returns Result.success(
            listOf(deal("a", "restaurant"), deal("b", "event")),
        )
        val viewModel = vm()
        advanceUntilIdle()

        assertEquals(listOf("a", "b"), viewModel.uiState.value.deals.map { it.id })
    }

    @Test
    fun `entity-type chip filters the list`() = runTest(testDispatcher) {
        coEvery { repository.fetchDeals(any()) } returns Result.success(
            listOf(deal("a", "restaurant"), deal("b", "event"), deal("c", "restaurant")),
        )
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.onEntityTypeSelected("restaurant")

        assertEquals(listOf("a", "c"), viewModel.uiState.value.deals.map { it.id })
        assertEquals("restaurant", viewModel.uiState.value.entityType)
    }

    @Test
    fun `active-now toggle drops expired deals`() = runTest(testDispatcher) {
        coEvery { repository.fetchDeals(any()) } returns Result.success(
            listOf(deal("live", "restaurant", active = true), deal("expired", "restaurant", active = false)),
        )
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.onToggleActiveNow()

        assertEquals(listOf("live"), viewModel.uiState.value.deals.map { it.id })
        assertTrue(viewModel.uiState.value.activeNowOnly)
    }

    @Test
    fun `search matches title and business name`() = runTest(testDispatcher) {
        coEvery { repository.fetchDeals(any()) } returns Result.success(
            listOf(
                deal("a", "restaurant", title = "Taco Tuesday", business = "El Bait Shop"),
                deal("b", "event", title = "Concert", business = "Wooly's"),
            ),
        )
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.onSearchTextChanged("taco")
        assertEquals(listOf("a"), viewModel.uiState.value.deals.map { it.id })

        viewModel.onSearchTextChanged("wooly")
        assertEquals(listOf("b"), viewModel.uiState.value.deals.map { it.id })
    }
}
