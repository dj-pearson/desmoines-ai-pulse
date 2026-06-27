package com.desmoines.aipulse.ui.screens.askpulse

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.repository.DiscoverPick
import com.desmoines.aipulse.data.remote.SponsoredPickService
import com.desmoines.aipulse.ui.components.ads.SponsoredPickSlot
import com.desmoines.aipulse.ui.components.ChatBubble
import com.desmoines.aipulse.ui.components.ChatRole
import com.desmoines.aipulse.ui.components.SuggestionChipsRow
import com.desmoines.aipulse.ui.components.TypingIndicator

/**
 * Ask Pulse — conversational AI discovery. Mirrors iOS AskPulseView.
 * Stateless: the NavHost supplies state + callbacks from AskPulseViewModel.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AskPulseScreen(
    state: AskPulseUiState,
    suggestions: List<String>,
    onInputChange: (String) -> Unit,
    onSend: () -> Unit,
    onSuggestion: (String) -> Unit,
    onReset: () -> Unit,
    onNavigateBack: () -> Unit,
    onNavigateToPick: (itemType: String, itemId: String) -> Unit,
    onUpgrade: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ask Pulse") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (state.messages.isNotEmpty()) {
                        TextButton(onClick = onReset) { Text("New") }
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            if (state.isWelcome) {
                WelcomeContent(
                    suggestions = suggestions,
                    onSuggestion = onSuggestion,
                    modifier = Modifier.weight(1f),
                )
            } else {
                Conversation(
                    state = state,
                    onSuggestion = onSuggestion,
                    onNavigateToPick = onNavigateToPick,
                    modifier = Modifier.weight(1f),
                )
            }

            // Sponsored pick (ANDP-042) — labeled, free-tier only, above the composer.
            SponsoredPickSlot(
                surface = SponsoredPickService.Surface.ASK_PULSE,
                query = null,
                onOpenItem = onNavigateToPick,
            )

            state.errorMessage?.let { message ->
                ErrorBanner(
                    message = message,
                    showUpgrade = state.quotaExceeded,
                    onUpgrade = onUpgrade,
                )
            }

            InputBar(
                value = state.inputText,
                canSend = state.canSend,
                onValueChange = onInputChange,
                onSend = onSend,
            )
        }
    }
}

@Composable
private fun WelcomeContent(
    suggestions: List<String>,
    onSuggestion: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(56.dp),
        )
        Text(
            text = "Ask Pulse",
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(top = 16.dp),
        )
        Text(
            text = "Describe the vibe and I'll find Des Moines events, dining, and things to do.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
        )
        SuggestionChipsRow(suggestions = suggestions, onSelect = onSuggestion)
    }
}

@Composable
private fun Conversation(
    state: AskPulseUiState,
    onSuggestion: (String) -> Unit,
    onNavigateToPick: (String, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()

    // Auto-scroll to the newest content as the conversation grows.
    LaunchedEffect(state.messages.size, state.picks.size, state.isLoading) {
        val lastIndex = state.messages.size // picks/typing live after the messages
        if (lastIndex > 0) listState.animateScrollToItem(lastIndex)
    }

    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 8.dp),
    ) {
        itemsIndexed(state.messages) { _, message ->
            ChatBubble(
                text = message.content,
                role = if (message.role == "user") ChatRole.USER else ChatRole.ASSISTANT,
            )
        }

        if (state.isLoading) {
            item { TypingIndicator() }
        }

        if (state.picks.isNotEmpty()) {
            item {
                SectionHeader("Pulse picks")
            }
            itemsIndexed(state.picks) { _, pick ->
                PickCard(pick = pick, onClick = { onNavigateToPick(pick.itemType, pick.itemId) })
            }
        }

        if (state.followUps.isNotEmpty()) {
            item { SectionHeader("Want me to try something else?") }
            item { SuggestionChipsRow(suggestions = state.followUps, onSelect = onSuggestion) }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun PickCard(pick: DiscoverPick, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = iconFor(pick.itemType),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp),
            ) {
                Text(
                    text = labelFor(pick.itemType),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                if (pick.reason.isNotBlank()) {
                    Text(
                        text = pick.reason,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            Icon(
                imageVector = Icons.Filled.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ErrorBanner(message: String, showUpgrade: Boolean, onUpgrade: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.errorContainer,
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onErrorContainer,
                modifier = Modifier.weight(1f),
            )
            if (showUpgrade) {
                TextButton(onClick = onUpgrade) { Text("Upgrade") }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InputBar(
    value: String,
    canSend: Boolean,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            placeholder = { Text("date night near downtown…") },
            maxLines = 4,
            shape = CircleShape,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (canSend) onSend() }),
        )
        Spacer(Modifier.size(8.dp))
        IconButton(onClick = onSend, enabled = canSend) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Send,
                contentDescription = "Send",
                tint = if (canSend) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun iconFor(itemType: String): ImageVector = when (itemType.lowercase()) {
    "event" -> Icons.Filled.Event
    "restaurant" -> Icons.Filled.Restaurant
    "attraction" -> Icons.Filled.Place
    else -> Icons.Filled.AutoAwesome
}

private fun labelFor(itemType: String): String = when (itemType.lowercase()) {
    "event" -> "Event"
    "restaurant" -> "Restaurant"
    "attraction" -> "Attraction"
    else -> itemType.replaceFirstChar { it.uppercase() }
}
