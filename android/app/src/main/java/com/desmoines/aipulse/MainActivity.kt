package com.desmoines.aipulse

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
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
                        MainScreen(networkMonitor = networkMonitor)
                    }
                }
            }
        }
    }
}
