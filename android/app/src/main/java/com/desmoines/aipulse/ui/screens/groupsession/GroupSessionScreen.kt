package com.desmoines.aipulse.ui.screens.groupsession

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupSessionScreen(
    onClose: () -> Unit,
    viewModel: GroupSessionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Group Session") },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.Filled.Close, contentDescription = "Close")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val hosted = state.hostedSession
            if (hosted != null) {
                HostedSessionCard(
                    code = hosted.code,
                    onShare = {
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, "Join my Des Moines swipe session — code ${hosted.code}")
                        }
                        context.startActivity(Intent.createChooser(intent, "Share code"))
                    },
                    onEnd = { viewModel.endHosting() },
                )
            } else {
                IntroBlurb()
                HorizontalDivider()
                HostSection(
                    canHost = state.isAuthenticated,
                    isWorking = state.isWorking,
                    onHost = { viewModel.startHosting() },
                )
                HorizontalDivider()
                JoinSection(
                    code = state.joinCode,
                    onCodeChange = { viewModel.setJoinCode(it) },
                    canJoin = state.joinCode.isNotBlank() && !state.isWorking,
                    onJoin = {
                        viewModel.join { onClose() }
                    },
                )
            }
            state.errorMessage?.let {
                Text(text = it, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun IntroBlurb() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Groups,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(44.dp),
        )
        Text(
            text = "Decide together",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = "Swipe at the same time — when two of you like the same place, it's a match.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun HostSection(canHost: Boolean, isWorking: Boolean, onHost: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = "Start a new session", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Button(
            onClick = onHost,
            enabled = canHost && !isWorking,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (isWorking) "Creating…" else "Host a session")
        }
        if (!canHost) {
            Text(
                "Sign in to host. Anyone can join with a code.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun JoinSection(
    code: String,
    onCodeChange: (String) -> Unit,
    canJoin: Boolean,
    onJoin: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = "Join a session", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        OutlinedTextField(
            value = code,
            onValueChange = onCodeChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("DSM-AB12") },
            singleLine = true,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                autoCorrect = false,
            ),
        )
        OutlinedButton(
            onClick = onJoin,
            enabled = canJoin,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Join with code") }
    }
}

@Composable
private fun HostedSessionCard(code: String, onShare: () -> Unit, onEnd: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Your session is live",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.primaryContainer)
                .padding(horizontal = 18.dp, vertical = 12.dp),
        ) {
            Text(
                text = code,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
        Text(
            "Share this code with friends. Sessions expire after 4 hours.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onShare, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.Share, contentDescription = null)
            Spacer(modifier = Modifier.size(8.dp))
            Text("Share code")
        }
        OutlinedButton(
            onClick = onEnd,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) { Text("End session") }
    }
}
