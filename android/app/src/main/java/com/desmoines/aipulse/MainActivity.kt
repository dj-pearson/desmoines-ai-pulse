package com.desmoines.aipulse

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import com.desmoines.aipulse.ui.screens.MainScreen
import com.desmoines.aipulse.ui.screens.onboarding.OnboardingScreen
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.util.BiometricAuthService
import com.desmoines.aipulse.util.DeepLinkHandler
import com.desmoines.aipulse.util.NetworkMonitor
import com.desmoines.aipulse.util.OnboardingPreferences
import com.desmoines.aipulse.util.RootDetector
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : FragmentActivity() {

    @Inject
    lateinit var networkMonitor: NetworkMonitor

    @Inject
    lateinit var onboardingPreferences: OnboardingPreferences

    @Inject
    lateinit var deepLinkHandler: DeepLinkHandler

    @Inject
    lateinit var biometricAuthService: BiometricAuthService

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Handle deep link from the launch intent
        handleDeepLinkIntent(intent)

        setContent {
            val windowSizeClass = calculateWindowSizeClass(this)

            DesMoinesInsiderTheme {
                val hasCompletedOnboarding by onboardingPreferences.hasCompletedOnboarding
                    .collectAsState(initial = true) // default true to avoid flash

                var isCheckingOnboarding by remember { mutableStateOf(true) }
                var showOnboarding by remember { mutableStateOf(false) }

                // Root detection warning
                var showRootWarning by remember { mutableStateOf(false) }
                var rootWarningDismissed by remember { mutableStateOf(false) }

                // Biometric lock screen
                var isBiometricLocked by remember { mutableStateOf(false) }
                var biometricChecked by remember { mutableStateOf(false) }

                // Check onboarding, root detection, and biometric on launch
                LaunchedEffect(Unit) {
                    val completed = onboardingPreferences.hasCompletedOnboarding.first()
                    showOnboarding = !completed
                    isCheckingOnboarding = false

                    // Root detection (non-blocking warning)
                    if (RootDetector.isRooted) {
                        showRootWarning = true
                    }

                    // Biometric lock on launch if enabled
                    if (biometricAuthService.isEnabled && biometricAuthService.isAvailable) {
                        isBiometricLocked = true
                        val success = biometricAuthService.authenticate(
                            activity = this@MainActivity,
                            title = "Unlock Des Moines Insider",
                            subtitle = "Use your fingerprint or face to continue",
                        )
                        if (success) {
                            isBiometricLocked = false
                        }
                        // If failed, user can still dismiss via "Use Password" button
                        // which returns false but we keep locked state for retry
                    }
                    biometricChecked = true
                }

                // Root detection warning dialog (non-blocking)
                if (showRootWarning && !rootWarningDismissed) {
                    AlertDialog(
                        onDismissRequest = { rootWarningDismissed = true },
                        icon = {
                            Icon(
                                Icons.Default.Warning,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                            )
                        },
                        title = { Text("Security Warning") },
                        text = {
                            Text(
                                "This device appears to be rooted. Your account data may be " +
                                "at increased risk. We recommend using an unmodified device " +
                                "for the best security."
                            )
                        },
                        confirmButton = {
                            TextButton(onClick = { rootWarningDismissed = true }) {
                                Text("I Understand")
                            }
                        },
                    )
                }

                // Biometric lock screen overlay
                if (isBiometricLocked && biometricChecked) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        TextButton(
                            onClick = {
                                lifecycleScope.launch {
                                    val success = biometricAuthService.authenticate(
                                        activity = this@MainActivity,
                                    )
                                    if (success) {
                                        isBiometricLocked = false
                                    }
                                }
                            }
                        ) {
                            Text("Tap to unlock with biometrics")
                        }
                    }
                } else if (!isCheckingOnboarding) {
                    if (showOnboarding) {
                        OnboardingScreen(
                            onComplete = {
                                lifecycleScope.launch {
                                    onboardingPreferences.setOnboardingCompleted()
                                }
                                showOnboarding = false
                            }
                        )
                    } else {
                        MainScreen(
                            networkMonitor = networkMonitor,
                            deepLinkHandler = deepLinkHandler,
                            widthSizeClass = windowSizeClass.widthSizeClass
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDeepLinkIntent(intent)
    }

    private fun handleDeepLinkIntent(intent: Intent) {
        // Try notification tap extras first, then URI deep link
        if (!deepLinkHandler.handleIntent(intent)) {
            // If not handled as deep link, let Supabase handle auth callbacks
            intent.data?.let { uri ->
                if (uri.toString().contains("auth-callback")) {
                    // Auth callback - Supabase client handles this via its own intent filter
                    // No additional handling needed here
                }
            }
        }
    }
}
