package com.desmoines.aipulse.util

import android.content.Context
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Centralized accessibility helper matching iOS accessibility support patterns.
 * Provides utilities for checking system accessibility settings and building
 * semantic labels for TalkBack support.
 */
@Singleton
class AccessibilityHelper @Inject constructor(
    @param:ApplicationContext private val context: Context
) {
    private val accessibilityManager: AccessibilityManager? =
        context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager

    /**
     * Whether a screen reader (TalkBack) is currently active.
     */
    val isScreenReaderEnabled: Boolean
        get() = accessibilityManager?.isEnabled == true &&
                accessibilityManager?.isTouchExplorationEnabled == true

    /**
     * Whether the system "reduce animations" / "remove animations" setting is enabled.
     * Checks ANIMATOR_DURATION_SCALE — when set to 0, animations should be disabled.
     */
    val shouldReduceAnimations: Boolean
        get() {
            val scale = Settings.Global.getFloat(
                context.contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1.0f
            )
            return scale == 0f
        }

    /**
     * Whether the system "touch feedback" (haptic) setting is enabled.
     * When disabled, haptic feedback should not be triggered.
     */
    val isHapticFeedbackEnabled: Boolean
        get() {
            @Suppress("DEPRECATION")
            val setting = Settings.System.getInt(
                context.contentResolver,
                Settings.System.HAPTIC_FEEDBACK_ENABLED,
                1
            )
            return setting != 0
        }
}

/**
 * Composable accessor for reduce-animations check without needing Hilt injection.
 * Uses LocalContext to read the system setting directly.
 */
@Composable
fun rememberShouldReduceAnimations(): Boolean {
    val context = LocalContext.current
    return remember {
        val scale = Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1.0f
        )
        scale == 0f
    }
}

/**
 * Composable accessor for screen reader active check.
 */
@Composable
fun rememberIsScreenReaderEnabled(): Boolean {
    val context = LocalContext.current
    return remember {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
        am?.isEnabled == true && am?.isTouchExplorationEnabled == true
    }
}

/**
 * Composable accessor for haptic feedback setting.
 */
@Composable
fun rememberIsHapticFeedbackEnabled(): Boolean {
    val context = LocalContext.current
    return remember {
        @Suppress("DEPRECATION")
        val setting = Settings.System.getInt(
            context.contentResolver,
            Settings.System.HAPTIC_FEEDBACK_ENABLED,
            1
        )
        setting != 0
    }
}

/**
 * Extension to apply heading semantics to section titles.
 * Usage: Modifier.semantics { heading() }
 * This helper just documents the pattern — use semantics { heading() } directly.
 */
fun SemanticsPropertyReceiver.sectionHeading() {
    heading()
}

/**
 * Extension to mark content as a polite live region (announced by TalkBack on change).
 */
fun SemanticsPropertyReceiver.politeLiveRegion() {
    liveRegion = LiveRegionMode.Polite
}

/**
 * Extension to mark content as an assertive live region (interrupts TalkBack).
 */
fun SemanticsPropertyReceiver.assertiveLiveRegion() {
    liveRegion = LiveRegionMode.Assertive
}

/**
 * Builds a rating accessibility string.
 * Example: "4.5 out of 5 stars"
 */
fun ratingAccessibilityLabel(rating: Double?, maxRating: Int = 5): String {
    if (rating == null) return "No rating"
    return "${String.format("%.1f", rating)} out of $maxRating stars"
}

/**
 * Builds a price range accessibility string.
 * Example: "$$ — moderate price range"
 */
fun priceRangeAccessibilityLabel(priceRange: String?): String {
    if (priceRange.isNullOrEmpty()) return "Price not listed"
    return when (priceRange) {
        "$" -> "Dollar sign — budget friendly"
        "$$" -> "Two dollar signs — moderate price range"
        "$$$" -> "Three dollar signs — upscale"
        "$$$$" -> "Four dollar signs — fine dining"
        else -> priceRange
    }
}

/**
 * Builds a filter count accessibility string.
 * Example: "Filters, 3 filters active"
 */
fun filterCountAccessibilityLabel(count: Int): String {
    return if (count > 0) {
        "Filters, $count ${if (count == 1) "filter" else "filters"} active"
    } else {
        "Filters, no active filters"
    }
}

/**
 * Builds a tab position accessibility string.
 * Example: "Home tab, 1 of 6"
 */
fun tabPositionAccessibilityLabel(label: String, index: Int, total: Int, isSelected: Boolean): String {
    return buildString {
        append(label)
        append(", tab ${index + 1} of $total")
        if (isSelected) append(", selected")
    }
}

/**
 * Modifier extension to apply heading semantics to section titles.
 * Usage: Modifier.headingSemantics()
 */
fun Modifier.headingSemantics(): Modifier = this.semantics { heading() }

/**
 * Modifier extension to apply selected semantics to selectable items.
 * Usage: Modifier.selectedSemantics(isSelected = true)
 */
fun Modifier.selectedSemantics(isSelected: Boolean): Modifier = this.semantics {
    selected = isSelected
}
