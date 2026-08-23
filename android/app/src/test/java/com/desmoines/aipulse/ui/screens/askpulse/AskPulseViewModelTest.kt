package com.desmoines.aipulse.ui.screens.askpulse

import com.desmoines.aipulse.data.model.LatLng
import com.desmoines.aipulse.data.repository.AskPulseRepository
import com.desmoines.aipulse.data.repository.DiscoverChatMessage
import com.desmoines.aipulse.data.repository.DiscoverChatResponse
import com.desmoines.aipulse.data.repository.DiscoverPick
import com.desmoines.aipulse.data.repository.AskPulseUsage
import com.desmoines.aipulse.data.repository.QuotaExceededException
import com.desmoines.aipulse.data.repository.RemainingValue
import com.desmoines.aipulse.util.ShortcutDispatcher
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
class AskPulseViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    private class FakeAskPulseRepository(
        var result: Result<DiscoverChatResponse>,
    ) : AskPulseRepository {
        var lastMessages: List<DiscoverChatMessage> = emptyList()
        override suspend fun discover(
            messages: List<DiscoverChatMessage>,
            location: LatLng?,
        ): Result<DiscoverChatResponse> {
            lastMessages = messages
            return result
        }
    }

    @BeforeEach
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `send populates picks, follow-ups, and assistant summary`() = runTest {
        val repo = FakeAskPulseRepository(
            Result.success(
                DiscoverChatResponse(
                    picks = listOf(DiscoverPick("event", "e1", "Live jazz nearby")),
                    followUpSuggestions = listOf("more like this"),
                ),
            ),
        )
        val vm = AskPulseViewModel(repo, ShortcutDispatcher())
        vm.onInputChange("date night")
        vm.send()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.isLoading)
        assertEquals(1, state.picks.size)
        assertEquals("e1", state.picks.first().itemId)
        assertEquals(listOf("more like this"), state.followUps)
        // user message + assistant summary
        assertEquals(2, state.messages.size)
        assertEquals("user", state.messages.first().role)
        assertEquals("assistant", state.messages.last().role)
        assertEquals("", state.inputText)
    }

    @Test
    fun `empty picks yields a no-match summary`() = runTest {
        val repo = FakeAskPulseRepository(Result.success(DiscoverChatResponse()))
        val vm = AskPulseViewModel(repo, ShortcutDispatcher())
        vm.sendSuggestion("obscure request")
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state.picks.isEmpty())
        assertTrue(state.messages.last().content.contains("couldn't find", ignoreCase = true))
    }

    @Test
    fun `429 sets quotaExceeded with an upgrade message`() = runTest {
        val repo = FakeAskPulseRepository(Result.failure(QuotaExceededException()))
        val vm = AskPulseViewModel(repo, ShortcutDispatcher())
        vm.sendSuggestion("anything")
        advanceUntilIdle()

        val state = vm.uiState.value
        assertTrue(state.quotaExceeded)
        assertFalse(state.isLoading)
        assertTrue(state.errorMessage!!.contains("limit", ignoreCase = true))
    }

    @Test
    fun `generic failure shows a retry message without quota flag`() = runTest {
        val repo = FakeAskPulseRepository(Result.failure(IllegalStateException("boom")))
        val vm = AskPulseViewModel(repo, ShortcutDispatcher())
        vm.sendSuggestion("anything")
        advanceUntilIdle()

        val state = vm.uiState.value
        assertFalse(state.quotaExceeded)
        assertTrue(state.errorMessage!!.contains("went wrong", ignoreCase = true))
    }

    @Test
    fun `blank input does not send`() = runTest {
        val repo = FakeAskPulseRepository(Result.success(DiscoverChatResponse()))
        val vm = AskPulseViewModel(repo, ShortcutDispatcher())
        vm.onInputChange("   ")
        vm.send()
        advanceUntilIdle()
        assertTrue(vm.uiState.value.messages.isEmpty())
    }

    @Test
    fun `reset clears the conversation`() = runTest {
        val repo = FakeAskPulseRepository(
            Result.success(DiscoverChatResponse(picks = listOf(DiscoverPick("event", "e1", "x")))),
        )
        val vm = AskPulseViewModel(repo, ShortcutDispatcher())
        vm.sendSuggestion("hi")
        advanceUntilIdle()
        vm.reset()

        val state = vm.uiState.value
        assertTrue(state.messages.isEmpty())
        assertTrue(state.picks.isEmpty())
        assertTrue(state.isWelcome)
        assertNull(state.errorMessage)
    }

    @Test
    fun `send surfaces the remaining quota reported by the server`() = runTest {
        val repo = FakeAskPulseRepository(
            Result.success(
                DiscoverChatResponse(
                    picks = listOf(DiscoverPick("event", "e1", "x")),
                    usage = AskPulseUsage(remaining = RemainingValue.Count(4), tier = "free"),
                ),
            ),
        )
        val vm = AskPulseViewModel(repo, ShortcutDispatcher())
        vm.sendSuggestion("hi")
        advanceUntilIdle()

        assertEquals(RemainingValue.Count(4), vm.uiState.value.remaining)
    }

    @Test
    fun `nothing is shown before the first response`() = runTest {
        val repo = FakeAskPulseRepository(Result.success(DiscoverChatResponse()))
        val vm = AskPulseViewModel(repo, ShortcutDispatcher())

        // No server has stated a number yet, so there is nothing honest to show.
        assertNull(vm.uiState.value.remaining)
    }

    @Test
    fun `a response without usage keeps the last known count`() = runTest {
        val repo = FakeAskPulseRepository(
            Result.success(
                DiscoverChatResponse(usage = AskPulseUsage(RemainingValue.Count(2), "free")),
            ),
        )
        val vm = AskPulseViewModel(repo, ShortcutDispatcher())
        vm.sendSuggestion("hi")
        advanceUntilIdle()

        repo.result = Result.success(DiscoverChatResponse())
        vm.sendSuggestion("again")
        advanceUntilIdle()

        assertEquals(RemainingValue.Count(2), vm.uiState.value.remaining)
    }

    @Test
    fun `hitting the quota sets remaining to zero`() = runTest {
        val repo = FakeAskPulseRepository(Result.failure(QuotaExceededException()))
        val vm = AskPulseViewModel(repo, ShortcutDispatcher())
        vm.sendSuggestion("hi")
        advanceUntilIdle()

        assertTrue(vm.uiState.value.quotaExceeded)
        assertEquals(RemainingValue.Count(0), vm.uiState.value.remaining)
    }
}
