package com.desmoines.aipulse.ui.screens.askpulse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.remote.AskPulseService
import com.desmoines.aipulse.data.remote.AskPulseService.RequestMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AskPulseState(
    val input: String = "",
    val conversation: List<RequestMessage> = emptyList(),
    val picks: List<AskPulseService.Pick> = emptyList(),
    val followUps: List<String> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class AskPulseViewModel @Inject constructor(
    private val service: AskPulseService,
) : ViewModel() {

    private val _state = MutableStateFlow(AskPulseState())
    val state: StateFlow<AskPulseState> = _state.asStateFlow()

    fun setInput(text: String) {
        _state.update { it.copy(input = text) }
    }

    fun reset() {
        _state.value = AskPulseState()
    }

    fun send(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || _state.value.isLoading) return

        val userMsg = RequestMessage(role = "user", content = trimmed)
        _state.update {
            it.copy(
                input = "",
                conversation = it.conversation + userMsg,
                isLoading = true,
                errorMessage = null,
            )
        }

        viewModelScope.launch {
            try {
                val response = service.ask(history = _state.value.conversation)
                val summary = if (response.picks.isEmpty()) {
                    "I couldn't find a great match. Want to try a different vibe?"
                } else {
                    "Here are ${response.picks.size} ideas — see the cards below."
                }
                _state.update {
                    it.copy(
                        conversation = it.conversation + RequestMessage(role = "assistant", content = summary),
                        picks = response.picks,
                        followUps = response.followUpSuggestions,
                        isLoading = false,
                    )
                }
            } catch (q: AskPulseService.AskPulseError.QuotaExceeded) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "You've hit today's Ask Pulse limit. Upgrade for more queries.",
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = e.message ?: "Something went wrong.",
                    )
                }
            }
        }
    }
}
