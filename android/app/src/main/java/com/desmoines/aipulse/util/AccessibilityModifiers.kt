package com.desmoines.aipulse.util

import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Accessibility helpers for the Mobile UI/UX polish audit.
 *
 * These are small, composable modifiers that encode our a11y conventions so
 * screens don't have to reinvent them. Pair with the iOS
 * `View+Accessibility.swift` helpers for parity.
 */

/**
 * Minimum interactive touch-target size (WCAG 2.5.5 / Material Design). The
 * Android floor is 48dp — parity with the iOS 44pt target. Single-sourced so
 * [minHitTarget] and any callsite that needs the value can't drift below it.
 */
val MinTouchTargetDp: Dp = 48.dp

/**
 * Guarantee a minimum 48x48 dp touch target as required by Material Design
 * and WCAG 2.5.5. Apply to any clickable icon-only button.
 */
fun Modifier.minHitTarget(): Modifier =
    this.defaultMinSize(minWidth = MinTouchTargetDp, minHeight = MinTouchTargetDp)

/**
 * Aggregate a card's children into a single accessibility element with the
 * given label, replacing default auto-generated text. Prevents TalkBack from
 * reading every sub-view of a card individually.
 *
 * Usage:
 * ```
 * Card(modifier = Modifier.aggregatedCard(label = event.accessibilityLabel)) {
 *   // children...
 * }
 * ```
 */
@Composable
fun Modifier.aggregatedCard(label: String, onClickRole: Role = Role.Button): Modifier =
    this.clearAndSetSemantics {
        contentDescription = label
        role = onClickRole
    }

/**
 * Build a compound accessibility label from parts, dropping nulls/blanks.
 * Example: `a11yLabel("Jazz in July", "Friday 7 PM", nil, "Western Gateway Park", "free")`
 * → "Jazz in July. Friday 7 PM. Western Gateway Park. free".
 */
fun a11yLabel(vararg parts: String?): String =
    parts.filterNot { it.isNullOrBlank() }.joinToString(separator = ". ")
