package com.desmoines.aipulse.ui.screens.groupsession

import android.content.Intent
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.desmoines.aipulse.data.model.SwipeSessionMatch
import com.desmoines.aipulse.ui.components.CachedAsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupSessionScreen(
    state: GroupSessionUiState,
    modes: List<String>,
    onModeSelected: (String) -> Unit,
    onJoinCodeChanged: (String) -> Unit,
    onCreate: () -> Unit,
    onJoin: () -> Unit,
    onRefresh: () -> Unit,
    onEnd: () -> Unit,
    onLeave: () -> Unit,
    onSwipeNow: () -> Unit,
    onOpenMatch: (String, String) -> Unit,
    onClearError: () -> Unit,
    onNavigateToAuth: () -> Unit,
    onNavigateBack: () -> Unit,
) {
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Group Session") },
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
            if (state.errorMessage != null) {
                ErrorBanner(state.errorMessage, onDismiss = onClearError)
                Spacer(Modifier.height(12.dp))
            }

            when {
                !state.isAuthenticated -> SignInPrompt(onNavigateToAuth)
                !state.inSession -> StartOrJoin(state, modes, onModeSelected, onJoinCodeChanged, onCreate, onJoin)
                state.isEnded -> EndedState(onLeave = onLeave)
                else -> ActiveSession(
                    state = state,
                    onRefresh = onRefresh,
                    onEnd = onEnd,
                    onLeave = onLeave,
                    onSwipeNow = onSwipeNow,
                    onOpenMatch = onOpenMatch,
                    onShare = {
                        val code = state.session?.code ?: return@ActiveSession
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, "Join my Des Moines Insider swipe session — code $code")
                        }
                        context.startActivity(Intent.createChooser(intent, "Share session code"))
                    },
                )
            }
        }
    }
}

@Composable
private fun StartOrJoin(
    state: GroupSessionUiState,
    modes: List<String>,
    onModeSelected: (String) -> Unit,
    onJoinCodeChanged: (String) -> Unit,
    onCreate: () -> Unit,
    onJoin: () -> Unit,
) {
    Text("Swipe together", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    Text(
        "Start a session and share the code, or join a friend's. You'll see everything you both like.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(16.dp))

    Text("What are you deciding on?", style = MaterialTheme.typography.labelLarge)
    Spacer(Modifier.height(8.dp))
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(modes) { mode ->
            FilterChip(
                selected = state.selectedMode == mode,
                onClick = { onModeSelected(mode) },
                label = { Text(mode.replaceFirstChar { it.uppercase() }) },
            )
        }
    }
    Spacer(Modifier.height(12.dp))
    Button(onClick = onCreate, enabled = !state.isCreating, modifier = Modifier.fillMaxWidth()) {
        if (state.isCreating) CircularProgressIndicator(modifier = Modifier.size(18.dp)) else Text("Start a session")
    }

    Spacer(Modifier.height(20.dp))
    HorizontalDivider()
    Spacer(Modifier.height(20.dp))

    Text("Have a code?", style = MaterialTheme.typography.labelLarge)
    Spacer(Modifier.height(8.dp))
    OutlinedTextField(
        value = state.joinCode,
        onValueChange = onJoinCodeChanged,
        modifier = Modifier.fillMaxWidth(),
        placeholder = { Text("DSM-XXXX") },
        singleLine = true,
        enabled = !state.isJoining,
    )
    Spacer(Modifier.height(12.dp))
    OutlinedButton(onClick = onJoin, enabled = state.canJoin, modifier = Modifier.fillMaxWidth()) {
        if (state.isJoining) CircularProgressIndicator(modifier = Modifier.size(18.dp)) else Text("Join session")
    }
}

@Composable
private fun ActiveSession(
    state: GroupSessionUiState,
    onRefresh: () -> Unit,
    onEnd: () -> Unit,
    onLeave: () -> Unit,
    onSwipeNow: () -> Unit,
    onOpenMatch: (String, String) -> Unit,
    onShare: () -> Unit,
) {
    val session = state.session ?: return

    // Code card.
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.primaryContainer,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Session code", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text(
                session.code,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(8.dp))
            Button(onClick = onShare) {
                Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Share code")
            }
        }
    }

    Spacer(Modifier.height(16.dp))
    Button(onClick = onSwipeNow, modifier = Modifier.fillMaxWidth()) { Text("Swipe now") }

    Spacer(Modifier.height(20.dp))

    // Participants.
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Group, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text("In this session (${state.participants.size})", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
    Spacer(Modifier.height(8.dp))
    if (state.participants.isEmpty()) {
        Text("Just you so far — share the code to invite others.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.participants, key = { it.id }) { p ->
                Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Text(p.name, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
                }
            }
        }
    }

    Spacer(Modifier.height(20.dp))

    // Matches.
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("Matches", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
        TextButton(onClick = onRefresh, enabled = !state.isRefreshing) {
            if (state.isRefreshing) CircularProgressIndicator(modifier = Modifier.size(16.dp)) else Text("Refresh")
        }
    }
    Spacer(Modifier.height(8.dp))
    if (state.matches.isEmpty()) {
        Text("No matches yet — keep swiping! Items you both like show up here.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            state.matches.forEach { match ->
                MatchRow(match = match, onClick = { onOpenMatch(match.itemType, match.itemId) })
            }
        }
    }

    Spacer(Modifier.height(24.dp))
    if (state.isHost) {
        Button(
            onClick = onEnd,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer),
        ) { Text("End session") }
        Spacer(Modifier.height(8.dp))
    }
    OutlinedButton(onClick = onLeave, modifier = Modifier.fillMaxWidth()) { Text("Leave") }
}

@Composable
private fun MatchRow(match: SwipeSessionMatch, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(52.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            CachedAsyncImage(url = match.imageUrl, contentDescription = null, modifier = Modifier.fillMaxSize())
        }
        Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(match.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${match.itemType.replaceFirstChar { it.uppercase() }} · ${match.matchLabel}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun EndedState(onLeave: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Filled.Group, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text("This session has ended", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text("Sessions automatically wrap up after 4 hours.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        Button(onClick = onLeave) { Text("Start over") }
    }
}

@Composable
private fun SignInPrompt(onNavigateToAuth: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Filled.Group, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(48.dp))
        Spacer(Modifier.height(12.dp))
        Text("Sign in to swipe together", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text("Group sessions are free — sign in to host or join one.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
            Text(message, color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            TextButton(onClick = onDismiss) { Text("Dismiss") }
        }
    }
}
