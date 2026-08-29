package com.desmoines.aipulse

import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.ui.window.Dialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Warning
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import com.desmoines.aipulse.ui.components.ForceUpdateScreen
import com.desmoines.aipulse.ui.components.PermissionPrimingCard
import com.desmoines.aipulse.ui.screens.MainScreen
import com.desmoines.aipulse.ui.screens.onboarding.OnboardingScreen
import com.desmoines.aipulse.ui.theme.DesMoinesInsiderTheme
import com.desmoines.aipulse.ui.theme.ThemeCrossfadeContainer
import com.desmoines.aipulse.ui.theme.ThemeMode
import com.desmoines.aipulse.util.BiometricAuthService
import com.desmoines.aipulse.util.DeepLinkHandler
import com.desmoines.aipulse.util.NetworkMonitor
import com.desmoines.aipulse.util.OnboardingPreferences
import com.desmoines.aipulse.util.PushNotificationService
import com.desmoines.aipulse.util.RootDetector
import com.desmoines.aipulse.util.ShortcutDispatcher
import com.desmoines.aipulse.util.VersionCheckService
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
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
    lateinit var shortcutDispatcher: ShortcutDispatcher

    @Inject
    lateinit var biometricAuthService: BiometricAuthService

    @Inject
    lateinit var versionCheckService: VersionCheckService

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Handle deep link from the launch intent
        handleDeepLinkIntent(intent)

        setContent {
            val windowSizeClass = calculateWindowSizeClass(this)

            // TODO: persist ThemeMode to DataStore and read here; defaulting
            // to System preserves existing behavior while the container lets
            // future theme changes crossfade smoothly.
            ThemeCrossfadeContainer(themeMode = ThemeMode.System) { _ ->
                // Launch-time version gate. Fails open; only blocks when the backend
                // explicitly returns forceUpgrade=true.
                val versionState by versionCheckService.state.collectAsStateWithLifecycle()
                LaunchedEffect(Unit) { versionCheckService.check() }
                if (versionState.forceUpgrade) {
                    ForceUpdateScreen(message = versionState.message) {
                        runCatching {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(versionState.storeUrl)))
                        }
                    }
                    return@ThemeCrossfadeContainer
                }

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

                    // Root detection (non-blocking warning). ~30 File.exists()
                    // and canWrite() probes, so it runs off the main thread --
                    // LaunchedEffect dispatches on Main and this sits directly
                    // in the cold-start path.
                    if (withContext(Dispatchers.IO) { RootDetector.isRooted }) {
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

                // Ask for POST_NOTIFICATIONS once the user is past onboarding.
                // Nothing requested it before, so on API 33+ the permission
                // could never be granted and every event reminder and push was
                // dropped by the permission check inside the notification code.
                //
                // AND-AUDIT-017: the system dialog is no longer the first thing
                // the user sees. PermissionPrimingCard was built for exactly this
                // and had no call sites, so the prompt shipped with no explanation
                // of what it was for. Android only presents POST_NOTIFICATIONS a
                // couple of times before it stops asking, so an unexplained prompt
                // is not a neutral default - a decline here is close to permanent.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    var showNotificationPriming by remember { mutableStateOf(false) }
                    val notificationPermission = rememberLauncherForActivityResult(
                        ActivityResultContracts.RequestPermission()
                    ) { /* Declining is fine; reminders stay off until enabled in Settings. */ }

                    LaunchedEffect(isCheckingOnboarding, showOnboarding) {
                        if (!isCheckingOnboarding && !showOnboarding &&
                            !PushNotificationService.hasNotificationPermission(this@MainActivity) &&
                            !onboardingPreferences.hasAnsweredNotificationPriming.first()
                        ) {
                            showNotificationPriming = true
                        }
                    }

                    if (showNotificationPriming) {
                        val scope = rememberCoroutineScope()
                        // Answered either way, so the card does not return on the
                        // next launch. Persisted before the system dialog opens:
                        // the launcher callback does not fire if the process dies
                        // while the dialog is up, and re-priming someone who has
                        // already been asked is the failure worth avoiding.
                        val answer: (Boolean) -> Unit = { grantRequested ->
                            showNotificationPriming = false
                            scope.launch {
                                onboardingPreferences.setNotificationPrimingAnswered()
                            }
                            if (grantRequested) {
                                notificationPermission.launch(
                                    android.Manifest.permission.POST_NOTIFICATIONS
                                )
                            }
                        }
                        Dialog(onDismissRequest = { answer(false) }) {
                            PermissionPrimingCard(
                                icon = Icons.Default.Notifications,
                                title = "Never miss an event",
                                body = "Turn on notifications and we will remind you before " +
                                    "events you save, and tell you when something new lands " +
                                    "in Des Moines.",
                                primaryLabel = "Enable notifications",
                                onPrimary = { answer(true) },
                                onDismiss = { answer(false) },
                            )
                        }
                    }
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
                            shortcutDispatcher = shortcutDispatcher,
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
        // App Shortcut / Assistant deep links take priority (ANDP-015). Clear the
        // data once handled so it isn't re-applied on configuration change.
        if (shortcutDispatcher.handleIntent(intent)) {
            intent.data = null
            return
        }

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
