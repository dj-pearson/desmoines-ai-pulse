package com.desmoines.aipulse.ui.screens.askpulse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.repository.AskPulseRepository
import com.desmoines.aipulse.data.repository.DiscoverChatMessage
import com.desmoines.aipulse.data.repository.DiscoverPick
import com.desmoines.aipulse.data.repository.RemainingValue
import com.desmoines.aipulse.data.repository.QuotaExceededException
import com.desmoines.aipulse.util.ShortcutDispatcher
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** UI state for the Ask Pulse conversational screen. */
data class AskPulseUiState(
    val messages: List<DiscoverChatMessage> = emptyList(),
    val picks: List<DiscoverPick> = emptyList(),
    val followUps: List<String> = emptyList(),
    val inputText: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val quotaExceeded: Boolean = false,
    /**
     * Messages left today, as last reported by discover-chat. Null until the
     * first response - the server is the only thing that knows the number, so
     * there is nothing honest to show before then (XPLAT-009 AC2).
     */
    val remaining: RemainingValue? = null,
) {
    /** Welcome state: nothing sent yet and not mid-request. */
    val isWelcome: Boolean get() = messages.isEmpty() && !isLoading
    val canSend: Boolean get() = inputText.isNotBlank() && !isLoading
}

/**
 * Drives Ask Pulse. Mirrors iOS AskPulseView's view model: keeps a client-side
 * conversation, calls discover-chat, and surfaces picks + follow-up suggestions.
 */
@HiltViewModel
class AskPulseViewModel @Inject constructor(
    private val repository: AskPulseRepository,
    private val shortcutDispatcher: ShortcutDispatcher,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AskPulseUiState())
    val uiState: StateFlow<AskPulseUiState> = _uiState.asStateFlow()

    /** Starter prompts shown in the welcome state. */
    val suggestions: List<String> = listOf(
        "date night, walkable, under $60",
        "live music this weekend",
        "kid-friendly things to do",
        "best patios for brunch",
    )

    init {
        // App Shortcut / Assistant "Ask Pulse" deep link (ANDP-015): pre-fill the
        // query and auto-send once the screen is shown, then consume the payload.
        viewModelScope.launch {
            shortcutDispatcher.pending.collect { pending ->
                if (pending is ShortcutDispatcher.Pending.AskPulse) {
                    shortcutDispatcher.consume()
                    if (pending.query.isNotBlank()) sendSuggestion(pending.query)
                }
            }
        }
    }

    fun onInputChange(text: String) {
        _uiState.update { it.copy(inputText = text) }
    }

    /** Pre-fill the input with [text] and immediately send it. */
    fun sendSuggestion(text: String) {
        _uiState.update { it.copy(inputText = text) }
        send()
    }

    fun send() {
        val text = _uiState.value.inputText.trim()
        if (text.isEmpty() || _uiState.value.isLoading) return

        val history = _uiState.value.messages + DiscoverChatMessage(role = "user", content = text)
        _uiState.update {
            it.copy(
                messages = history,
                inputText = "",
                isLoading = true,
                errorMessage = null,
                quotaExceeded = false,
                picks = emptyList(),
                followUps = emptyList(),
            )
        }

        viewModelScope.launch {
            repository.discover(history)
                .onSuccess { response ->
                    val summary = if (response.picks.isEmpty()) {
                        "I couldn't find a great match. Want to try a different vibe?"
                    } else {
                        "Here are ${response.picks.size} ideas you might like."
                    }
                    _uiState.update {
                        it.copy(
                            messages = it.messages + DiscoverChatMessage(role = "assistant", content = summary),
                            picks = response.picks,
                            followUps = response.followUpSuggestions,
                            isLoading = false,
                            // Keep the last known count when a response omits
                            // usage, rather than blanking the label.
                            remaining = response.usage?.remaining ?: it.remaining,
                        )
                    }
                }
                .onFailure { error ->
                    if (error is QuotaExceededException) {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                quotaExceeded = true,
                                remaining = RemainingValue.Count(0),
                                errorMessage = "You've hit today's Ask Pulse limit. Upgrade for more queries.",
                            )
                        }
                    } else {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = "Something went wrong. Please try again.",
                            )
                        }
                    }
                }
        }
    }

    /** Start a fresh conversation. */
    fun reset() {
        _uiState.value = AskPulseUiState()
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}
