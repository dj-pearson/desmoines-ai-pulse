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
    @param:ApplicationContext private val context: Context
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
            @Suppress("DEPRECATION")
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
/**
 * Contextual haptic feedback performer with a semantic API that matches
 * iOS `HapticFeedback.swift` one-to-one. Each method maps to a system
 * vibration pattern that best represents the intent on Android.
 *
 * All calls become no-ops when the user has disabled haptic feedback.
 */
class HapticPerformer(
    private val feedback: HapticFeedback,
    private val enabled: Boolean,
    private val vibrator: Vibrator? = null,
) {
    private val hasAmplitudeControl: Boolean
        get() = vibrator?.hasAmplitudeControl() == true

    private fun oneShot(durationMs: Long, amplitude: Int) {
        if (!enabled) return
        val v = vibrator ?: run {
            feedback.performHapticFeedback(HapticFeedbackType.LongPress)
            return
        }
        val amp = if (hasAmplitudeControl) amplitude else VibrationEffect.DEFAULT_AMPLITUDE
        v.vibrate(VibrationEffect.createOneShot(durationMs, amp))
    }

    private fun waveform(timings: LongArray, amplitudes: IntArray) {
        if (!enabled) return
        val v = vibrator ?: run {
            feedback.performHapticFeedback(HapticFeedbackType.LongPress)
            return
        }
        if (hasAmplitudeControl) {
            v.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))
        } else {
            v.vibrate(VibrationEffect.createWaveform(timings, -1))
        }
    }

    // MARK: - Impact

    /** Light impact — selections, filter changes, chip taps. */
    fun light() = oneShot(10, 50)

    /** Medium impact — favorite toggles, primary actions, pull-to-refresh threshold. */
    fun medium() = oneShot(18, 128)

    /** Heavy impact — modal presentation, confirm dialogs. */
    fun heavy() = oneShot(28, 200)

    // MARK: - Notification semantics (match UINotificationFeedbackGenerator)

    /** Success — booking complete, itinerary saved, sign-in success. */
    fun success() = waveform(longArrayOf(0, 12, 60, 18), intArrayOf(0, 90, 0, 180))

    /** Warning — non-blocking validation, rate-limit hit. */
    fun warning() = waveform(longArrayOf(0, 20, 80, 20), intArrayOf(0, 160, 0, 160))

    /** Error — failed auth, failed payment, form validation error. */
    fun error() = waveform(longArrayOf(0, 30, 60, 30, 60, 30), intArrayOf(0, 220, 0, 220, 0, 220))

    // MARK: - Selection

    /** Selection tick — picker / segmented control change. */
    fun selection() = oneShot(5, 40)

    // MARK: - Toggle

    /** Toggle ON — favorite added, filter enabled. */
    fun toggleOn() = oneShot(14, 160)

    /** Toggle OFF — favorite removed, filter disabled. */
    fun toggleOff() = oneShot(10, 80)

    // MARK: - Premium

    /** Premium unlock — subtle double-tap pattern for celebratory moments. */
    fun premiumUnlock() = waveform(
        longArrayOf(0, 15, 40, 25, 40, 35),
        intArrayOf(0, 140, 0, 180, 0, 220)
    )
}

/**
 * Remember a [HapticPerformer] that respects the system haptic feedback setting.
 * When system haptic feedback is disabled, all calls become no-ops.
 */
@Composable
fun rememberHapticPerformer(): HapticPerformer {
    val feedback = LocalHapticFeedback.current
    val enabled = rememberIsHapticFeedbackEnabled()
    val context = LocalContext.current
    val vibrator: Vibrator? = remember(context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)
                ?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }
    return remember(feedback, enabled, vibrator) {
        HapticPerformer(feedback, enabled, vibrator)
    }
}
