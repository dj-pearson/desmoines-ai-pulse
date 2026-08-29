package com.desmoines.aipulse.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme

/**
 * The screen shown while the app is locked (AND-AUDIT-007 AC3, AC5).
 *
 * What this replaced was a bare TextButton reading "Tap to unlock with
 * biometrics", centred on an empty Box, with no explanation of why the app was
 * blank and no way off it: a failed unlock left isBiometricLocked true and the
 * button was the only control on the screen. If the sensor had stopped working,
 * that was the end of the app.
 *
 * So there are two ways forward here, not one. [onUnlock] re-presents the system
 * prompt - which on API 30+ offers the device PIN as well. [onSignOut] is the
 * escape: it ends the session, which is the only other honest thing a locked app
 * can do, and it is deliberately styled as the secondary action rather than
 * hidden.
 */
@Composable
fun BiometricLockScreen(
    onUnlock: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
    failureMessage: String? = null,
) {
    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.secondaryContainer,
                modifier = Modifier.size(88.dp),
            ) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Icon(
                        Icons.Default.Fingerprint,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        tint = MaterialTheme.colorScheme.onSecondaryContainer,
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            Text(
                text = "Des Moines Insider is locked",
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurface,
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = "Unlock with your fingerprint, face or device PIN to continue.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                // Tinted from the surface rather than a flat gray, so it stays
                // legible against both themes.
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (failureMessage != null) {
                Spacer(Modifier.height(16.dp))
                Text(
                    text = failureMessage,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { contentDescription = failureMessage },
                )
            }

            Spacer(Modifier.height(32.dp))

            Button(
                onClick = onUnlock,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Unlock")
            }

            Spacer(Modifier.height(8.dp))

            TextButton(
                onClick = onSignOut,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Sign out instead")
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun BiometricLockScreenPreview() {
    DesMoinesInsiderTheme {
        BiometricLockScreen(onUnlock = {}, onSignOut = {})
    }
}

@Preview(showBackground = true, name = "After a failed attempt")
@Composable
private fun BiometricLockScreenFailurePreview() {
    DesMoinesInsiderTheme {
        BiometricLockScreen(
            onUnlock = {},
            onSignOut = {},
            failureMessage = "Too many attempts. Try again later, or sign out and sign back in.",
        )
    }
}
