package com.desmoines.aipulse.util

import androidx.compose.ui.unit.dp
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Guards the WCAG 2.5.5 touch-target floor (ANDP-066). minHitTarget() builds on
 * this constant, so pinning it here stops any accidental shrink below 48dp.
 * (Pixel-level snapshot verification needs instrumented/Paparazzi infra the JVM
 * unit suite doesn't have.)
 */
class AccessibilityModifiersTest {

    @Test
    fun `minimum touch target is the 48dp WCAG floor`() {
        assertEquals(48.dp, MinTouchTargetDp)
    }

    @Test
    fun `minimum touch target is never below the 48dp floor`() {
        assertTrue(MinTouchTargetDp >= 48.dp)
    }

    @Test
    fun `compound a11y label drops blank parts and dot-joins the rest`() {
        // Sanity-check the helper screens lean on for aggregated card labels.
        assertEquals(
            "Jazz in July. Friday 7 PM. Western Gateway Park. free",
            a11yLabel("Jazz in July", "Friday 7 PM", null, "Western Gateway Park", "free"),
        )
        assertEquals("", a11yLabel(null, "", "   "))
    }
}
