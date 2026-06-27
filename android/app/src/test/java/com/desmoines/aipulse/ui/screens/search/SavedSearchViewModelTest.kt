package com.desmoines.aipulse.ui.screens.search

import com.desmoines.aipulse.data.model.SavedSearch
import com.desmoines.aipulse.data.model.SavedSearchFilters
import com.desmoines.aipulse.data.remote.SavedSearchRemoteDataSource
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.SavedSearchRepository
import io.mockk.coEvery
import io.mockk.coVerify
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
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SavedSearchViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: SavedSearchRepository
    private lateinit var authRepository: AuthRepository

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        every { authRepository.currentUserId } returns "u1"
        coEvery { repository.fetch(any()) } returns Result.success(emptyList())
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun search(id: String, alerts: Boolean = false) =
        SavedSearch(id = id, name = "Search $id", filters = SavedSearchFilters(query = "q$id", tab = "Events", alertsEnabled = alerts))

    private fun vm() = SavedSearchViewModel(repository, authRepository)

    @Test
    fun `searchType maps the Events tab to the event alert pipeline`() {
        assertEquals("event_list", SavedSearchRemoteDataSource.searchType("Events"))
        assertEquals("advanced", SavedSearchRemoteDataSource.searchType("Restaurants"))
        assertEquals("advanced", SavedSearchRemoteDataSource.searchType(null))
    }

    @Test
    fun `load populates saved searches`() = runTest(testDispatcher) {
        coEvery { repository.fetch("u1") } returns Result.success(listOf(search("a"), search("b")))
        val viewModel = vm()
        advanceUntilIdle()

        assertEquals(listOf("a", "b"), viewModel.uiState.value.searches.map { it.id })
    }

    @Test
    fun `toggleAlerts flips optimistically and persists`() = runTest(testDispatcher) {
        coEvery { repository.fetch("u1") } returns Result.success(listOf(search("a", alerts = false)))
        coEvery { repository.update(any(), any()) } returns Result.success(Unit)
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.toggleAlerts(viewModel.uiState.value.searches.first())
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.searches.first().alertsEnabled)
        coVerify { repository.update("a", match { it.alertsEnabled }) }
    }

    @Test
    fun `toggleAlerts rolls back when the update fails`() = runTest(testDispatcher) {
        coEvery { repository.fetch("u1") } returns Result.success(listOf(search("a", alerts = false)))
        coEvery { repository.update(any(), any()) } returns Result.failure(RuntimeException("nope"))
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.toggleAlerts(viewModel.uiState.value.searches.first())
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.searches.first().alertsEnabled)
        assertNotNull(viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `delete removes optimistically and rolls back on failure`() = runTest(testDispatcher) {
        coEvery { repository.fetch("u1") } returns Result.success(listOf(search("a"), search("b")))
        coEvery { repository.delete("a") } returns Result.failure(RuntimeException("nope"))
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.delete(viewModel.uiState.value.searches.first())
        advanceUntilIdle()

        // Rolled back to both rows.
        assertEquals(listOf("a", "b"), viewModel.uiState.value.searches.map { it.id })
        assertNotNull(viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `delete keeps the row removed on success`() = runTest(testDispatcher) {
        coEvery { repository.fetch("u1") } returns Result.success(listOf(search("a"), search("b")))
        coEvery { repository.delete("a") } returns Result.success(Unit)
        val viewModel = vm()
        advanceUntilIdle()

        viewModel.delete(viewModel.uiState.value.searches.first())
        advanceUntilIdle()

        assertEquals(listOf("b"), viewModel.uiState.value.searches.map { it.id })
    }
}
