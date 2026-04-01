package com.desmoines.aipulse.util

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Centralized haptic feedback helper matching iOS UIImpactFeedbackGenerator patterns.
 * Wraps Android Vibrator/VibrationEffect with light and medium impact levels.
 * Respects system haptic feedback settings — no vibration when disabled.
 */
@Singleton
class HapticHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    private val hasAmplitudeControl: Boolean
        get() = vibrator?.hasAmplitudeControl() == true

    /**
     * Whether system haptic feedback setting is enabled.
     * When disabled, all haptic methods become no-ops.
     */
    private val isEnabled: Boolean
        get() {
            val setting = Settings.System.getInt(
                context.contentResolver,
                Settings.System.HAPTIC_FEEDBACK_ENABLED,
                1
            )
            return setting != 0
        }

    /**
     * Light impact feedback — 10ms at low amplitude.
     * Matches iOS UIImpactFeedbackGenerator(style: .light).
     * Used for: tab selection, filter changes, category chip selection, date preset selection.
     */
    fun lightImpact() {
        if (!isEnabled || vibrator == null) return
        if (hasAmplitudeControl) {
            vibrator.vibrate(
                VibrationEffect.createOneShot(10, 50) // 10ms, low amplitude (50/255)
            )
        } else {
            vibrator.vibrate(
                VibrationEffect.createOneShot(10, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        }
    }

    /**
     * Medium impact feedback — 20ms at medium amplitude.
     * Matches iOS UIImpactFeedbackGenerator(style: .medium).
     * Used for: favorite toggle, pull-to-refresh completion, calendar add, reminder toggle.
     */
    fun mediumImpact() {
        if (!isEnabled || vibrator == null) return
        if (hasAmplitudeControl) {
            vibrator.vibrate(
                VibrationEffect.createOneShot(20, 128) // 20ms, medium amplitude (128/255)
            )
        } else {
            vibrator.vibrate(
                VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        }
    }
}

/**
 * Composable-friendly haptic feedback performer that checks system settings.
 * Returns a HapticPerformer that wraps LocalHapticFeedback with the accessibility gate.
 * Usage:
 * ```
 * val haptic = rememberHapticPerformer()
 * haptic.light()   // light impact (tab selection, filter changes)
 * haptic.medium()  // medium impact (favorite toggle, pull-to-refresh)
 * ```
 */
class HapticPerformer(
    private val feedback: HapticFeedback,
    private val enabled: Boolean
) {
    /** Light impact — for selections, filter changes, chip taps. */
    fun light() {
        if (!enabled) return
        feedback.performHapticFeedback(HapticFeedbackType.LongPress)
    }

    /** Medium impact — for favorite toggles, primary actions, pull-to-refresh completion. */
    fun medium() {
        if (!enabled) return
        feedback.performHapticFeedback(HapticFeedbackType.LongPress)
    }
}

/**
 * Remember a [HapticPerformer] that respects the system haptic feedback setting.
 * When system haptic feedback is disabled, all calls become no-ops.
 */
@Composable
fun rememberHapticPerformer(): HapticPerformer {
    val feedback = LocalHapticFeedback.current
    val enabled = rememberIsHapticFeedbackEnabled()
    return remember(feedback, enabled) { HapticPerformer(feedback, enabled) }
}
