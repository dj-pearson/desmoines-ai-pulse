package com.desmoines.aipulse.ui.screens.bestof

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.Nominee
import com.desmoines.aipulse.ui.components.CachedAsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BestOfCategoryScreen(
    state: BestOfCategoryUiState,
    onSearchTextChanged: (String) -> Unit,
    onToggleWriteIn: () -> Unit,
    onWriteInChanged: (String) -> Unit,
    onVoteFor: (Nominee) -> Unit,
    onSubmitWriteIn: () -> Unit,
    onRetry: () -> Unit,
    onDismissError: () -> Unit,
    onNavigateToAuth: () -> Unit,
    onNavigateBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.category?.name ?: "Vote") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            state.category?.description?.takeIf { it.isNotBlank() }?.let { desc ->
                Text(desc, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
            }

            if (state.errorMessage != null) {
                ErrorBanner(state.errorMessage, onDismiss = onDismissError)
                Spacer(Modifier.height(12.dp))
            }

            when {
                state.isLoading && state.category == null -> Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator() }

                !state.isAuthenticated -> SignInPrompt(onNavigateToAuth = onNavigateToAuth)

                else -> VotingBooth(
                    state = state,
                    onSearchTextChanged = onSearchTextChanged,
                    onToggleWriteIn = onToggleWriteIn,
                    onWriteInChanged = onWriteInChanged,
                    onVoteFor = onVoteFor,
                    onSubmitWriteIn = onSubmitWriteIn,
                )
            }
        }
    }
}

@Composable
private fun VotingBooth(
    state: BestOfCategoryUiState,
    onSearchTextChanged: (String) -> Unit,
    onToggleWriteIn: () -> Unit,
    onWriteInChanged: (String) -> Unit,
    onVoteFor: (Nominee) -> Unit,
    onSubmitWriteIn: () -> Unit,
) {
    // Current pick status.
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (state.hasVoted) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(10.dp))
            Text(
                text = if (state.hasVoted) {
                    "You voted for ${state.currentVoteLabel} — search or write in to change."
                } else {
                    "Search for a nominee or write in your own pick."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }

    Spacer(Modifier.height(16.dp))

    // Mode toggle: search vs. write-in.
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(selected = !state.isWriteIn, onClick = { if (state.isWriteIn) onToggleWriteIn() }, label = { Text("Search") })
        FilterChip(selected = state.isWriteIn, onClick = { if (!state.isWriteIn) onToggleWriteIn() }, label = { Text("Write in") })
    }

    Spacer(Modifier.height(12.dp))

    if (state.isWriteIn) {
        OutlinedTextField(
            value = state.writeInText,
            onValueChange = onWriteInChanged,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Name your pick") },
            singleLine = true,
            enabled = !state.isCasting,
        )
        Spacer(Modifier.height(12.dp))
        Button(onClick = onSubmitWriteIn, enabled = state.canSubmitWriteIn, modifier = Modifier.fillMaxWidth()) {
            if (state.isCasting) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp))
            } else {
                Text("Cast vote")
            }
        }
    } else {
        OutlinedTextField(
            value = state.searchText,
            onValueChange = onSearchTextChanged,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Search restaurants & attractions") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
        )
        Spacer(Modifier.height(12.dp))

        when {
            state.isSearching -> Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            }
            state.searchText.trim().length >= 2 && state.results.isEmpty() -> Text(
                "No matches. Try a write-in instead.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.results.forEach { nominee ->
                    NomineeRow(nominee = nominee, enabled = !state.isCasting, onClick = { onVoteFor(nominee) })
                }
            }
        }
    }
}

@Composable
private fun NomineeRow(nominee: Nominee, enabled: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            CachedAsyncImage(url = nominee.imageUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
        }
        Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(
                nominee.name,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                nominee.typeLabel,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun SignInPrompt(onNavigateToAuth: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Filled.EmojiEvents,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(48.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text(
            "Sign in to cast your vote",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            "Voting is free — sign in to pick your Des Moines favorites.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        Button(onClick = onNavigateToAuth) { Text("Sign in") }
    }
}

@Composable
private fun ErrorBanner(message: String, onDismiss: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.errorContainer,
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                message,
                color = MaterialTheme.colorScheme.onErrorContainer,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onDismiss) { Text("Dismiss") }
        }
    }
}
