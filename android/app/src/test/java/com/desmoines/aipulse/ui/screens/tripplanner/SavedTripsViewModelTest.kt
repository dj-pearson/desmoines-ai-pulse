package com.desmoines.aipulse.ui.screens.tripplanner

import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.TripPlannerRepository
import io.mockk.coEvery
import io.mockk.every
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
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SavedTripsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: TripPlannerRepository
    private lateinit var authRepository: AuthRepository

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        every { authRepository.currentUserId } returns "u1"
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun vm() = SavedTripsViewModel(repository, authRepository)

    @Test
    fun `load populates trips`() = runTest(testDispatcher) {
        coEvery { repository.fetchSavedTrips("u1") } returns
            Result.success(listOf(TripPlan(id = "t1", title = "A")))
        val viewModel = vm()
        viewModel.load()
        advanceUntilIdle()

        assertEquals(1, viewModel.uiState.value.trips.size)
        assertFalse(viewModel.uiState.value.isLoading)
    }

    @Test
    fun `load failure surfaces an error`() = runTest(testDispatcher) {
        coEvery { repository.fetchSavedTrips(any()) } returns Result.failure(RuntimeException("boom"))
        val viewModel = vm()
        viewModel.load()
        advanceUntilIdle()

        assertNotNull(viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `optimistic delete removes the trip on success`() = runTest(testDispatcher) {
        coEvery { repository.fetchSavedTrips(any()) } returns
            Result.success(listOf(TripPlan(id = "t1"), TripPlan(id = "t2")))
        coEvery { repository.deleteTrip("t1") } returns Result.success(Unit)
        val viewModel = vm()
        viewModel.load()
        advanceUntilIdle()

        viewModel.delete("t1")
        advanceUntilIdle()

        assertEquals(listOf("t2"), viewModel.uiState.value.trips.map { it.id })
    }

    @Test
    fun `delete rolls back when the server fails`() = runTest(testDispatcher) {
        coEvery { repository.fetchSavedTrips(any()) } returns
            Result.success(listOf(TripPlan(id = "t1"), TripPlan(id = "t2")))
        coEvery { repository.deleteTrip("t1") } returns Result.failure(RuntimeException("nope"))
        val viewModel = vm()
        viewModel.load()
        advanceUntilIdle()

        viewModel.delete("t1")
        advanceUntilIdle()

        assertEquals(listOf("t1", "t2"), viewModel.uiState.value.trips.map { it.id })
        assertNotNull(viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `share exposes the returned url`() = runTest(testDispatcher) {
        coEvery { repository.shareTrip("t1") } returns
            Result.success("https://desmoinesinsider.com/trips/shared/abc")
        val viewModel = vm()
        viewModel.share("t1")
        advanceUntilIdle()

        assertEquals("https://desmoinesinsider.com/trips/shared/abc", viewModel.uiState.value.shareUrl)
    }
}
