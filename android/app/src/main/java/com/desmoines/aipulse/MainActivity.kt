package com.desmoines.aipulse

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import com.desmoines.aipulse.ui.screens.MainScreen
import com.desmoines.aipulse.ui.screens.onboarding.OnboardingScreen
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.util.DeepLinkHandler
import com.desmoines.aipulse.util.NetworkMonitor
import com.desmoines.aipulse.util.OnboardingPreferences
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var networkMonitor: NetworkMonitor

    @Inject
    lateinit var onboardingPreferences: OnboardingPreferences

    @Inject
    lateinit var deepLinkHandler: DeepLinkHandler

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Handle deep link from the launch intent
        handleDeepLinkIntent(intent)

        setContent {
            DesMoinesInsiderTheme {
                val hasCompletedOnboarding by onboardingPreferences.hasCompletedOnboarding
                    .collectAsState(initial = true) // default true to avoid flash

                var isCheckingOnboarding by remember { mutableStateOf(true) }
                var showOnboarding by remember { mutableStateOf(false) }

                LaunchedEffect(Unit) {
                    val completed = onboardingPreferences.hasCompletedOnboarding.first()
                    showOnboarding = !completed
                    isCheckingOnboarding = false
                }

                if (!isCheckingOnboarding) {
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
                            deepLinkHandler = deepLinkHandler
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
