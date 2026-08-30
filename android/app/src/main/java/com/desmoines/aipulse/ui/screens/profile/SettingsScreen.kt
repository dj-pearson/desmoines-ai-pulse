package com.desmoines.aipulse.ui.screens.profile

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PrivacyTip
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarRate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.BuildConfig
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.util.Config

/**
 * Settings screen matching iOS SettingsView.swift.
 * Account management, notifications, about, and debug sections.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    isAuthenticated: Boolean = false,
    currentTier: SubscriptionTier = SubscriptionTier.FREE,
    isDeleting: Boolean = false,
    showDeleteConfirmation: Boolean = false,
    errorMessage: String? = null,
    // Biometric auth
    isBiometricAvailable: Boolean = false,
    isBiometricEnabled: Boolean = false,
    onToggleBiometric: (Boolean) -> Unit = {},
    // Consent / Privacy
    locationConsent: Boolean = false,
    emailConsent: Boolean = true,
    emailConsentError: String? = null,
    analyticsConsent: Boolean = false,
    onToggleLocationConsent: (Boolean) -> Unit = {},
    onToggleEmailConsent: (Boolean) -> Unit = {},
    onToggleAnalyticsConsent: (Boolean) -> Unit = {},
    // Navigation
    onNavigateBack: () -> Unit = {},
    onNavigateToSubscription: () -> Unit = {},
    onNavigateToWebView: (String) -> Unit = {},
    onRestorePurchases: () -> Unit = {},
    onRequestDelete: () -> Unit = {},
    onConfirmDelete: () -> Unit = {},
    onDismissDelete: () -> Unit = {},
    onClearError: () -> Unit = {},
    onResetOnboarding: () -> Unit = {},
) {
    val context = LocalContext.current
    val appVersion = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
        ) {
            // Account section (authenticated only)
            if (isAuthenticated) {
                SectionHeader("Account")

                SettingsRow(
                    icon = Icons.Default.Star,
                    title = "Subscription",
                    subtitle = currentTier.displayName,
                    showChevron = true,
                    onClick = onNavigateToSubscription,
                )

                SettingsRow(
                    icon = Icons.Default.Refresh,
                    title = "Restore Purchases",
                    onClick = onRestorePurchases,
                )

                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
            }

            // General
            SectionHeader("General")

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .semantics { contentDescription = "Version $appVersion" },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Default.Info,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text("Version", style = MaterialTheme.typography.bodyLarge)
                Spacer(modifier = Modifier.weight(1f))
                Text(
                    text = appVersion,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

            // Security section
            if (isAuthenticated && isBiometricAvailable) {
                SectionHeader("Security")

                SettingsToggleRow(
                    icon = Icons.Default.Fingerprint,
                    title = "Biometric Unlock",
                    subtitle = if (isBiometricEnabled) "Enabled" else "Disabled",
                    checked = isBiometricEnabled,
                    onCheckedChange = onToggleBiometric,
                )

                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
            }

            // Privacy & Data (consent toggles)
            SectionHeader("Privacy & Data")

            SettingsToggleRow(
                icon = Icons.Default.PrivacyTip,
                title = "Location Data",
                subtitle = "Allow location-based recommendations",
                checked = locationConsent,
                onCheckedChange = onToggleLocationConsent,
            )

            SettingsToggleRow(
                icon = Icons.Default.Email,
                title = "Email Communications",
                subtitle = "Receive event updates and newsletters",
                checked = emailConsent,
                onCheckedChange = onToggleEmailConsent,
            )

            // WEB-LEGAL-012. The toggle rolls back when the write fails, so
            // without this the row simply snaps back with no explanation - which
            // reads as the app ignoring the tap. A consent control is the last
            // place to fail silently.
            if (emailConsentError != null) {
                Text(
                    text = emailConsentError,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(start = 52.dp, end = 16.dp, bottom = 8.dp),
                )
            }

            SettingsToggleRow(
                icon = Icons.Default.Info,
                title = "Analytics",
                subtitle = "Help improve the app with usage data",
                checked = analyticsConsent,
                onCheckedChange = onToggleAnalyticsConsent,
            )

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

            // Notifications
            SectionHeader("Notifications")

            SettingsRow(
                icon = Icons.Default.Notifications,
                title = "Notification Settings",
                onClick = { openNotificationSettings(context) },
            )

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

            // About
            SectionHeader("About")

            SettingsRow(
                icon = Icons.Default.Language,
                title = "Website",
                onClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Config.SITE_URL)))
                },
            )

            SettingsRow(
                icon = Icons.Default.Email,
                title = "Contact Support",
                onClick = {
                    context.startActivity(
                        Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${Config.SUPPORT_EMAIL}"))
                    )
                },
            )

            SettingsRow(
                icon = Icons.Default.Security,
                title = "Privacy Policy",
                onClick = { onNavigateToWebView("${Config.SITE_URL}/privacy-policy") },
            )

            SettingsRow(
                icon = Icons.Default.Description,
                title = "Terms of Service",
                onClick = { onNavigateToWebView("${Config.SITE_URL}/terms") },
            )

            SettingsRow(
                icon = Icons.Default.StarRate,
                title = "Rate Des Moines Insider",
                onClick = { openPlayStore(context) },
            )

            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

            // Danger Zone (authenticated only)
            if (isAuthenticated) {
                SectionHeader("Account Data")

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = !isDeleting) { onRequestDelete() }
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (isDeleting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp,
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            "Deleting Account...",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    } else {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "Delete your account",
                            modifier = Modifier.size(24.dp),
                            tint = MaterialTheme.colorScheme.error,
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            "Delete Account",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }

                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
            }

            // Debug section (debug builds only)
            if (BuildConfig.DEBUG) {
                SectionHeader("Debug")

                SettingsRow(
                    icon = Icons.Default.BugReport,
                    title = "Reset Onboarding",
                    onClick = onResetOnboarding,
                )

                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }

    // Delete confirmation dialog
    if (showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = onDismissDelete,
            title = { Text("Delete Account?") },
            text = {
                Text("This will permanently delete your account, favorites, and all associated data. This action cannot be undone.")
            },
            confirmButton = {
                TextButton(
                    onClick = onConfirmDelete,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    ),
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = onDismissDelete) {
                    Text("Cancel")
                }
            },
        )
    }

    // Error dialog
    if (errorMessage != null) {
        AlertDialog(
            onDismissRequest = onClearError,
            title = { Text("Error") },
            text = { Text(errorMessage) },
            confirmButton = {
                TextButton(onClick = onClearError) {
                    Text("OK")
                }
            },
        )
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

@Composable
private fun SettingsRow(
    icon: ImageVector,
    title: String,
    subtitle: String? = null,
    showChevron: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(24.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(title, style = MaterialTheme.typography.bodyLarge)
        Spacer(modifier = Modifier.weight(1f))
        if (subtitle != null) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.width(4.dp))
        }
        if (showChevron) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
            )
        }
    }
}

@Composable
private fun SettingsToggleRow(
    icon: ImageVector,
    title: String,
    subtitle: String? = null,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(24.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(modifier = Modifier.width(8.dp))
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
        )
    }
}

private fun openNotificationSettings(context: Context) {
    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
        putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    }
    context.startActivity(intent)
}

private fun openPlayStore(context: Context) {
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${context.packageName}"))
        )
    } catch (_: Exception) {
        context.startActivity(
            Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://play.google.com/store/apps/details?id=${context.packageName}")
            )
        )
    }
}
