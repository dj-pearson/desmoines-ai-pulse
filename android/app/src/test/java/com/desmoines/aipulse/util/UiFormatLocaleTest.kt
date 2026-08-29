package com.desmoines.aipulse.util

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Date text stays English on a non-English device (AND-AUDIT-019 AC5).
 *
 * Eleven display formatters called DateTimeFormatter.ofPattern with no locale
 * while six passed Locale.US, so on any non-English device the app rendered a
 * mix: "Saturday" on the event card and "samedi" on the detail screen, inside a
 * UI that is otherwise entirely English.
 *
 * These run against the same patterns the app uses, with the JVM default locale
 * moved out from under them - which is the only way to see this on a machine
 * with no device.
 */
class UiFormatLocaleTest {

    private val original: Locale = Locale.getDefault()
    private val moment: LocalDateTime = LocalDateTime.of(2026, 8, 29, 19, 30)

    @AfterEach
    fun restore() = Locale.setDefault(original)

    private fun format(pattern: String, locale: Locale?): String =
        moment.format(
            if (locale == null) DateTimeFormatter.ofPattern(pattern)
            else DateTimeFormatter.ofPattern(pattern, locale),
        )

    @Test
    fun `display patterns are stable across device locales`() {
        val patterns = listOf("EEEE, MMMM d", "MMM d, yyyy", "MMM d, h:mm a", "EEE", "MMM", "h:mm a")
        val expected = patterns.associateWith {
            Locale.setDefault(Locale.US)
            format(it, UiFormatLocale)
        }

        for (device in listOf(Locale.FRANCE, Locale.JAPAN, Locale("ar", "EG"), Locale("tr", "TR"))) {
            Locale.setDefault(device)
            for (pattern in patterns) {
                assertEquals(
                    expected.getValue(pattern),
                    format(pattern, UiFormatLocale),
                    "pattern '$pattern' changed under device locale $device",
                )
            }
        }
    }

    @Test
    fun `NEGATIVE CONTROL - without an explicit locale those same patterns do change`() {
        // If this ever stops failing to differ, the test above proves nothing:
        // it would be asserting that a no-op is a no-op.
        Locale.setDefault(Locale.FRANCE)
        assertNotEquals(
            format("EEEE, MMMM d", UiFormatLocale),
            format("EEEE, MMMM d", null),
            "the locale-free formatter should follow the device locale - that is the bug being fixed",
        )
    }

    @Test
    fun `numeric-only patterns are locale-independent, which is why they are left bare`() {
        // Event.kt parses wire-format dates with bare ofPattern calls. Adding a
        // locale there would be noise, and this is the evidence for that claim
        // rather than an assumption about DecimalStyle.
        for (device in listOf(Locale.US, Locale("ar", "EG"), Locale.forLanguageTag("th-TH-u-nu-thai"))) {
            Locale.setDefault(device)
            assertEquals("2026-08-29", format("yyyy-MM-dd", null))
            assertEquals("19:30", format("HH:mm", null))
        }
    }

    @Test
    fun `wire-format parsing survives a non-Latin-digit device locale`() {
        Locale.setDefault(Locale.forLanguageTag("th-TH-u-nu-thai"))
        val parsed = LocalDateTime.parse(
            "2026-08-29T19:00:00",
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss"),
        )
        assertEquals(2026, parsed.year)
    }

    /**
     * The tests above prove the CONSTANT behaves. They say nothing about whether
     * the call sites use it, which is the thing that actually regressed - so this
     * one reads the sources.
     *
     * A text-bearing pattern is any containing MMM, EEE or a standalone `a`;
     * those are the ones the device locale rewrites. Numeric-only patterns are
     * deliberately exempt - see the test above and the doc on UiFormatLocale.
     */
    @Test
    fun `every text-bearing ofPattern call passes an explicit locale`() {
        val main = java.io.File("src/main/java/com/desmoines/aipulse")
        org.junit.jupiter.api.Assumptions.assumeTrue(
            main.isDirectory,
            "source tree not reachable from the test working directory",
        )

        val call = Regex("""ofPattern\(\s*"([^"]*)"([^)]*)\)""")
        val textBearing = Regex("""MMM|EEE|(^|[^a-zA-Z'])a([^a-zA-Z']|$)""")
        val offenders = mutableListOf<String>()

        main.walkTopDown().filter { it.extension == "kt" }.forEach { file ->
            call.findAll(file.readText()).forEach { m ->
                val pattern = m.groupValues[1]
                val rest = m.groupValues[2]
                if (textBearing.containsMatchIn(pattern) && !rest.contains("Locale")) {
                    offenders += "${file.name}: ofPattern(\"$pattern\")"
                }
            }
        }

        assertEquals(
            emptyList<String>(),
            offenders,
            "these render month or day NAMES and would follow the device locale, " +
                "showing e.g. \"samedi\" inside an English screen; pass UiFormatLocale",
        )
    }
}
