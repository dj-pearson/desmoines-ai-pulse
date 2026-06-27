package com.desmoines.aipulse.ui.screens.bestof

import com.desmoines.aipulse.data.model.LeaderboardEntry
import com.desmoines.aipulse.data.model.Nominee
import com.desmoines.aipulse.data.model.Vote
import com.desmoines.aipulse.data.model.VotingCategory
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.data.repository.BestOfRepository
import com.desmoines.aipulse.data.repository.BestOfWinnersStore
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
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BestOfCategoryViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var repository: BestOfRepository
    private lateinit var authRepository: AuthRepository
    private lateinit var winnersStore: BestOfWinnersStore

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        repository = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)
        winnersStore = mockk(relaxed = true)
        every { authRepository.currentUserId } returns "u1"
        coEvery { repository.fetchCategory("c1") } returns Result.success(VotingCategory(id = "c1", name = "Best Tacos"))
        coEvery { repository.fetchUserVote(any(), any()) } returns Result.success(null)
        coEvery { repository.fetchResults(any()) } returns Result.success(emptyList())
    }

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun entry(key: String, name: String, votes: Int) =
        LeaderboardEntry(key = key, entityType = "restaurant", entityId = key, customEntry = null, name = name, imageUrl = null, voteCount = votes)

    private fun vm() = BestOfCategoryViewModel(repository, authRepository, winnersStore)

    @Test
    fun `load signed in fetches category and existing custom vote`() = runTest(testDispatcher) {
        coEvery { repository.fetchUserVote("c1", "u1") } returns Result.success(
            Vote(id = "v1", categoryId = "c1", entityType = "custom", customEntry = "Tacos El Rey", userId = "u1"),
        )
        val viewModel = vm()
        viewModel.load("c1")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Best Tacos", state.category?.name)
        assertTrue(state.isAuthenticated)
        assertEquals("Tacos El Rey", state.currentVoteLabel)
    }

    @Test
    fun `load resolves an entity vote name`() = runTest(testDispatcher) {
        coEvery { repository.fetchUserVote("c1", "u1") } returns Result.success(
            Vote(id = "v1", categoryId = "c1", entityType = "restaurant", entityId = "r1", userId = "u1"),
        )
        coEvery { repository.resolveEntityName("restaurant", "r1") } returns "El Bait Shop"
        val viewModel = vm()
        viewModel.load("c1")
        advanceUntilIdle()

        assertEquals("El Bait Shop", viewModel.uiState.value.currentVoteLabel)
    }

    @Test
    fun `signed out shows unauthenticated state`() = runTest(testDispatcher) {
        every { authRepository.currentUserId } returns null
        val viewModel = vm()
        viewModel.load("c1")
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isAuthenticated)
        assertNull(viewModel.uiState.value.currentVoteLabel)
    }

    @Test
    fun `short query clears results, long query searches`() = runTest(testDispatcher) {
        coEvery { repository.searchNominees("tacos") } returns Result.success(
            listOf(Nominee("r1", "Tacos El Rey", null, "restaurant")),
        )
        val viewModel = vm()
        viewModel.load("c1")
        advanceUntilIdle()

        viewModel.onSearchTextChanged("t")
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.results.isEmpty())

        viewModel.onSearchTextChanged("tacos")
        advanceUntilIdle()
        assertEquals(listOf("r1"), viewModel.uiState.value.results.map { it.id })
    }

    @Test
    fun `voteFor casts and updates the current pick`() = runTest(testDispatcher) {
        coEvery { repository.castVote("c1", "u1", "restaurant", "r1", null) } returns Result.success(Unit)
        val viewModel = vm()
        viewModel.load("c1")
        advanceUntilIdle()

        viewModel.voteFor(Nominee("r1", "El Bait Shop", null, "restaurant"))
        advanceUntilIdle()

        coVerify { repository.castVote("c1", "u1", "restaurant", "r1", null) }
        assertEquals("El Bait Shop", viewModel.uiState.value.currentVoteLabel)
        assertTrue(viewModel.uiState.value.searchText.isEmpty())
    }

    @Test
    fun `write-in casts a custom entry`() = runTest(testDispatcher) {
        coEvery { repository.castVote("c1", "u1", "custom", null, "Grandma's Kitchen") } returns Result.success(Unit)
        val viewModel = vm()
        viewModel.load("c1")
        advanceUntilIdle()

        viewModel.toggleWriteIn()
        viewModel.onWriteInChanged("Grandma's Kitchen")
        viewModel.submitWriteIn()
        advanceUntilIdle()

        coVerify { repository.castVote("c1", "u1", "custom", null, "Grandma's Kitchen") }
        assertEquals("Grandma's Kitchen", viewModel.uiState.value.currentVoteLabel)
    }

    @Test
    fun `cast failure surfaces an error`() = runTest(testDispatcher) {
        coEvery { repository.castVote(any(), any(), any(), any(), any()) } returns Result.failure(IllegalStateException("boom"))
        val viewModel = vm()
        viewModel.load("c1")
        advanceUntilIdle()

        viewModel.voteFor(Nominee("r1", "El Bait Shop", null, "restaurant"))
        advanceUntilIdle()

        assertEquals("Couldn't record your vote. Please try again.", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `leaderboard loads with totals`() = runTest(testDispatcher) {
        coEvery { repository.fetchResults("c1") } returns Result.success(
            listOf(entry("a", "Alpha", 3), entry("b", "Beta", 1)),
        )
        val viewModel = vm()
        viewModel.load("c1")
        advanceUntilIdle()

        assertEquals(listOf("a", "b"), viewModel.uiState.value.leaderboard.map { it.key })
        assertEquals(4, viewModel.uiState.value.totalVotes)
    }

    @Test
    fun `cast failure reverts the optimistic leaderboard`() = runTest(testDispatcher) {
        coEvery { repository.fetchResults("c1") } returns Result.success(listOf(entry("a", "Alpha", 1)))
        coEvery { repository.castVote(any(), any(), any(), any(), any()) } returns Result.failure(IllegalStateException("boom"))
        val viewModel = vm()
        viewModel.load("c1")
        advanceUntilIdle()

        viewModel.voteFor(Nominee("b", "Beta", null, "restaurant"))
        advanceUntilIdle()

        // Optimistic "b" is rolled back to the pre-cast snapshot.
        assertEquals(listOf("a"), viewModel.uiState.value.leaderboard.map { it.key })
        assertNull(viewModel.uiState.value.yourPickKey)
        assertEquals("Couldn't record your vote. Please try again.", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `successful cast reconciles board and refreshes winners`() = runTest(testDispatcher) {
        coEvery { repository.fetchResults("c1") } returns Result.success(listOf(entry("a", "Alpha", 2)))
        coEvery { repository.castVote("c1", "u1", "restaurant", "b", null) } returns Result.success(Unit)
        val viewModel = vm()
        viewModel.load("c1")
        advanceUntilIdle()

        // After the cast, the authoritative board includes the new pick.
        coEvery { repository.fetchResults("c1") } returns Result.success(
            listOf(entry("a", "Alpha", 2), entry("b", "Beta", 1)),
        )
        viewModel.voteFor(Nominee("b", "Beta", null, "restaurant"))
        advanceUntilIdle()

        assertEquals("Beta", viewModel.uiState.value.currentVoteLabel)
        assertTrue(viewModel.uiState.value.leaderboard.any { it.key == "b" })
        coVerify { winnersStore.refresh() }
    }
}
