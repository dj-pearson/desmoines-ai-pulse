package com.desmoines.aipulse.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import java.io.File
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The Android primary is the iOS accent (AND-OVH-023).
 *
 * iOS tints every control with AccentColor, #FF6B35 light and #FF7A44 dark
 * (ios/DesMoinesInsider/Resources/Assets.xcassets/AccentColor.colorset). Android
 * shipped BrandBlue as primary and had Material You on by default, so on an
 * Android 12+ phone the brand was whatever the wallpaper was. These tests pin
 * the hex values, recompute the WCAG contrast of the label colour on primary,
 * and check nothing turns dynamic colour back on.
 */
class BrandColorTest {

    private fun hex(color: Color): String =
        String.format("#%06X", color.toArgb() and 0xFFFFFF)

    /** WCAG 2.1 relative luminance, computed here rather than trusting Color.luminance(). */
    private fun relativeLuminance(color: Color): Double {
        val argb = color.toArgb()
        fun channel(shift: Int): Double {
            val c = ((argb shr shift) and 0xFF) / 255.0
            return if (c <= 0.04045) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
    }

    private fun contrast(a: Color, b: Color): Double {
        val la = relativeLuminance(a)
        val lb = relativeLuminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    @Test
    fun `primary matches the iOS AccentColor in both appearances`() {
        assertEquals("#FF6B35", hex(PrimaryLight))
        assertEquals("#FF7A44", hex(PrimaryDark))
        assertEquals("#FF6B35", hex(LightColorScheme.primary))
        assertEquals("#FF7A44", hex(DarkColorScheme.primary))
        assertEquals("#FF7A44", hex(OledColorScheme.primary))
    }

    @Test
    fun `labels on primary pass WCAG AA in every scheme`() {
        listOf(
            "light" to LightColorScheme,
            "dark" to DarkColorScheme,
            "oled" to OledColorScheme,
        ).forEach { (name, scheme) ->
            val ratio = contrast(scheme.onPrimary, scheme.primary)
            assertTrue(ratio >= 4.5, "$name onPrimary on primary is ${"%.2f".format(ratio)}:1, below 4.5:1")
        }
    }

    @Test
    fun `white on the light accent fails, which is why onPrimary is dark`() {
        // Records the reason for the dark label. If this ever passes, white is an option again.
        assertTrue(contrast(Color.White, PrimaryLight) < 4.5)
    }

    @Test
    fun `blue moved to secondary and the containers pair with their colours`() {
        assertEquals(hex(BrandBlue), hex(LightColorScheme.secondary))
        fun check(name: String, scheme: ColorScheme) {
            listOf(
                "onSecondary/secondary" to (scheme.onSecondary to scheme.secondary),
                "onTertiary/tertiary" to (scheme.onTertiary to scheme.tertiary),
                "onPrimaryContainer/primaryContainer" to
                    (scheme.onPrimaryContainer to scheme.primaryContainer),
                "onSecondaryContainer/secondaryContainer" to
                    (scheme.onSecondaryContainer to scheme.secondaryContainer),
                "onTertiaryContainer/tertiaryContainer" to
                    (scheme.onTertiaryContainer to scheme.tertiaryContainer),
            ).forEach { (pair, colors) ->
                val ratio = contrast(colors.first, colors.second)
                assertTrue(ratio >= 4.5, "$name $pair is ${"%.2f".format(ratio)}:1")
            }
        }
        check("light", LightColorScheme)
        check("dark", DarkColorScheme)
        check("oled", OledColorScheme)
    }

    @Test
    fun `dynamic colour is off by default and no call site turns it on`() {
        val moduleRoot = generateSequence(File("").absoluteFile) { it.parentFile }
            .first { File(it, "src/main/AndroidManifest.xml").exists() }
        val theme = File(moduleRoot, "src/main/java/com/desmoines/aipulse/ui/theme/Theme.kt").readText()
        assertTrue(theme.contains("dynamicColor: Boolean = false"))
        assertFalse(theme.contains("dynamicColor: Boolean = true"))
        val callers = File(moduleRoot, "src/main/java").walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filter { Regex("""dynamicColor\s*=\s*true""").containsMatchIn(it.readText()) }
            .map { it.name }
            .toList()
        assertFalse(callers.isNotEmpty(), "dynamicColor = true passed in $callers")
    }
}
