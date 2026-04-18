package com.desmoines.aipulse.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.desmoines.aipulse.data.model.SubscriptionTier
import com.desmoines.aipulse.ui.components.BannerStyle
import com.desmoines.aipulse.ui.components.BrandPrimaryButton
import com.desmoines.aipulse.ui.components.SubscriptionBanner

/**
 * Profile screen matching iOS ProfileView.swift.
 * Shows authenticated user's profile with edit fields, or guest CTA.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProfileScreen(
    isAuthenticated: Boolean = false,
    displayName: String = "Guest",
    initials: String = "?",
    email: String = "",
    firstName: String = "",
    lastName: String = "",
    phone: String = "",
    location: String = "",
    selectedInterests: Set<String> = emptySet(),
    currentTier: SubscriptionTier = SubscriptionTier.FREE,
    isSaving: Boolean = false,
    isDeleting: Boolean = false,
    showSaveSuccess: Boolean = false,
    showDeleteConfirmation: Boolean = false,
    errorMessage: String? = null,
    onFirstNameChanged: (String) -> Unit = {},
    onLastNameChanged: (String) -> Unit = {},
    onPhoneChanged: (String) -> Unit = {},
    onLocationChanged: (String) -> Unit = {},
    onToggleInterest: (String) -> Unit = {},
    onSaveProfile: () -> Unit = {},
    onSignOut: () -> Unit = {},
    onRequestDelete: () -> Unit = {},
    onConfirmDelete: () -> Unit = {},
    onDismissDelete: () -> Unit = {},
    onDismissSaveSuccess: () -> Unit = {},
    onClearError: () -> Unit = {},
    onNavigateToAuth: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    onNavigateToSubscription: () -> Unit = {},
    onVisitWebsite: () -> Unit = {},
) {
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                title = { Text("Profile") },
                scrollBehavior = scrollBehavior,
            )
        }
    ) { padding ->
        if (isAuthenticated) {
            AuthenticatedContent(
                modifier = Modifier.padding(padding),
                displayName = displayName,
                initials = initials,
                email = email,
                firstName = firstName,
                lastName = lastName,
                phone = phone,
                location = location,
                selectedInterests = selectedInterests,
                currentTier = currentTier,
                isSaving = isSaving,
                isDeleting = isDeleting,
                onFirstNameChanged = onFirstNameChanged,
                onLastNameChanged = onLastNameChanged,
                onPhoneChanged = onPhoneChanged,
                onLocationChanged = onLocationChanged,
                onToggleInterest = onToggleInterest,
                onSaveProfile = onSaveProfile,
                onSignOut = onSignOut,
                onRequestDelete = onRequestDelete,
                onNavigateToSettings = onNavigateToSettings,
                onNavigateToSubscription = onNavigateToSubscription,
                onVisitWebsite = onVisitWebsite,
            )
        } else {
            GuestContent(
                modifier = Modifier.padding(padding),
                currentTier = currentTier,
                onNavigateToAuth = onNavigateToAuth,
                onNavigateToSettings = onNavigateToSettings,
                onNavigateToSubscription = onNavigateToSubscription,
            )
        }
    }

    // Save success dialog
    if (showSaveSuccess) {
        AlertDialog(
            onDismissRequest = onDismissSaveSuccess,
            title = { Text("Profile Updated") },
            confirmButton = {
                TextButton(onClick = onDismissSaveSuccess) {
                    Text("OK")
                }
            },
        )
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AuthenticatedContent(
    modifier: Modifier = Modifier,
    displayName: String,
    initials: String,
    email: String,
    firstName: String,
    lastName: String,
    phone: String,
    location: String,
    selectedInterests: Set<String>,
    currentTier: SubscriptionTier,
    isSaving: Boolean,
    isDeleting: Boolean,
    onFirstNameChanged: (String) -> Unit,
    onLastNameChanged: (String) -> Unit,
    onPhoneChanged: (String) -> Unit,
    onLocationChanged: (String) -> Unit,
    onToggleInterest: (String) -> Unit,
    onSaveProfile: () -> Unit,
    onSignOut: () -> Unit,
    onRequestDelete: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToSubscription: () -> Unit,
    onVisitWebsite: () -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        Spacer(modifier = Modifier.height(8.dp))

        // Profile Header
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ),
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Avatar circle with initials
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = initials,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }

                Spacer(modifier = Modifier.width(16.dp))

                Column {
                    Text(
                        text = displayName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (email.isNotEmpty()) {
                        Text(
                            text = email,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Subscription Banner
        SubscriptionBanner(
            currentTier = currentTier,
            style = BannerStyle.FULL,
            onUpgradeClick = onNavigateToSubscription,
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Personal Info Section
        Text(
            text = "Personal Info",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = firstName,
            onValueChange = onFirstNameChanged,
            label = { Text("First Name") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = lastName,
            onValueChange = onLastNameChanged,
            label = { Text("Last Name") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = phone,
            onValueChange = onPhoneChanged,
            label = { Text("Phone") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Phone,
                imeAction = ImeAction.Next,
            ),
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = location,
            onValueChange = onLocationChanged,
            label = { Text("Location") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Interests Section
        Text(
            text = "Interests",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(8.dp))

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ProfileViewModel.availableInterests.forEach { interest ->
                val isSelected = selectedInterests.contains(interest)
                FilterChip(
                    selected = isSelected,
                    onClick = { onToggleInterest(interest) },
                    label = { Text(interest) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                        selectedLabelColor = MaterialTheme.colorScheme.primary,
                    ),
                    modifier = Modifier.semantics {
                        contentDescription = if (isSelected) "$interest, selected" else interest
                    },
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Save Button — migrated to BrandPrimaryButton
        BrandPrimaryButton(
            onClick = onSaveProfile,
            isLoading = isSaving,
            enabled = !isSaving,
            text = "Save Changes",
        )

        Spacer(modifier = Modifier.height(24.dp))

        HorizontalDivider()

        Spacer(modifier = Modifier.height(16.dp))

        // App Section
        TextButton(
            onClick = onNavigateToSettings,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Default.Settings, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Settings")
            Spacer(modifier = Modifier.weight(1f))
        }

        TextButton(
            onClick = onVisitWebsite,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Default.Language, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Visit Full Website")
            Spacer(modifier = Modifier.weight(1f))
        }

        TextButton(
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.textButtonColors(
                contentColor = MaterialTheme.colorScheme.error
            ),
        ) {
            Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Sign Out")
            Spacer(modifier = Modifier.weight(1f))
        }

        TextButton(
            onClick = onRequestDelete,
            modifier = Modifier.fillMaxWidth(),
            enabled = !isDeleting,
            colors = ButtonDefaults.textButtonColors(
                contentColor = MaterialTheme.colorScheme.error
            ),
        ) {
            if (isDeleting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Deleting Account...")
            } else {
                Icon(Icons.Default.Delete, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Delete Account")
            }
            Spacer(modifier = Modifier.weight(1f))
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun GuestContent(
    modifier: Modifier = Modifier,
    currentTier: SubscriptionTier,
    onNavigateToAuth: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToSubscription: () -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spacer(modifier = Modifier.weight(1f))

        Icon(
            imageVector = Icons.Default.Person,
            contentDescription = null,
            modifier = Modifier.size(72.dp),
            tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.5f),
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Welcome to Des Moines Insider",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Sign in to save favorites, customize your experience, and get personalized recommendations.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(24.dp))

        BrandPrimaryButton(
            onClick = onNavigateToAuth,
            text = "Sign In or Create Account",
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Premium teaser for guests
        SubscriptionBanner(
            currentTier = currentTier,
            style = BannerStyle.COMPACT,
            onUpgradeClick = onNavigateToSubscription,
        )

        Spacer(modifier = Modifier.height(16.dp))

        TextButton(onClick = onNavigateToSettings) {
            Icon(Icons.Default.Settings, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text("Settings", style = MaterialTheme.typography.bodyMedium)
        }

        Spacer(modifier = Modifier.weight(1f))
    }
}
