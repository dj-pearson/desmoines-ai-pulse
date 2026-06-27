package com.desmoines.aipulse.ui.screens.bestof

import com.desmoines.aipulse.data.model.VotingCategory
import com.desmoines.aipulse.data.repository.BestOfRepository
import com.desmoines.aipulse.data.repository.BestOfWinnersStore
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
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BestOfViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: BestOfRepository
    private lateinit var winnersStore: BestOfWinnersStore

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        winnersStore = mockk(relaxed = true)
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun category(id: String, votes: Int = 0) =
        VotingCategory(id = id, name = "Category $id", voteCount = votes)

    @Test
    fun `load populates categories`() = runTest(testDispatcher) {
        coEvery { repository.fetchCategories() } returns Result.success(
            listOf(category("a", 5), category("b", 0)),
        )
        val viewModel = BestOfViewModel(repository, winnersStore)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(listOf("a", "b"), state.categories.map { it.id })
        assertEquals("5 votes", state.categories.first().voteCountLabel)
        assertFalse(state.isLoading)
    }

    @Test
    fun `empty result yields empty state`() = runTest(testDispatcher) {
        coEvery { repository.fetchCategories() } returns Result.success(emptyList())
        val viewModel = BestOfViewModel(repository, winnersStore)
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.isEmpty)
    }

    @Test
    fun `failure shows a retry message`() = runTest(testDispatcher) {
        coEvery { repository.fetchCategories() } returns Result.failure(IllegalStateException("boom"))
        val viewModel = BestOfViewModel(repository, winnersStore)
        advanceUntilIdle()

        assertEquals("Couldn't load categories. Tap to retry.", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `vote count label singular and zero`() {
        assertEquals("No votes yet", category("z", 0).voteCountLabel)
        assertEquals("1 vote", category("o", 1).voteCountLabel)
        assertEquals("3 votes", category("t", 3).voteCountLabel)
    }
}
