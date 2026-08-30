package com.desmoines.aipulse.util

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * A launcher shortcut has to survive three files and a hardcoded literal
 * (AND-AUDIT-014 AC4).
 *
 * res/xml/shortcuts.xml declares a URI. AndroidManifest.xml has to have an
 * intent-filter that lets it into the process. ShortcutDispatcher.parse has to
 * recognise its host. Nothing links the three, and each failure is silent in a
 * different way:
 *   a shortcut whose host the manifest omits opens a browser or nothing at all
 *   a shortcut whose host the dispatcher drops opens the app on the wrong screen
 *   a host the dispatcher handles that nothing declares is dead code that reads
 *     as a supported entry point
 *
 * The fourth comparison is against a test rather than the app.
 * ShortcutDispatcherUriTest asserts what the SHIPPED ask-pulse URI decodes to,
 * and it holds that URI as a string literal because an instrumentation test
 * cannot read res/xml as text. A literal copied out of a resource file is the
 * usual way this kind of assertion quietly stops testing the shipped thing, so
 * it is compared here.
 *
 * Reads sources, runs no code. The files are declared as inputs on the Test task
 * in build.gradle.kts - without that, Gradle leaves this suite UP-TO-DATE when
 * one of them changes and the guard goes green on a break.
 */
class ShortcutManifestParityTest {

    private val moduleRoot: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .first { File(it, "src/main/AndroidManifest.xml").exists() }

    private fun read(path: String) = File(moduleRoot, path).readText()

    /** The `android:data` URIs the launcher shortcuts ship. */
    private fun shortcutUris(): List<String> =
        Regex("""android:data="([^"]+)"""").findAll(read("src/main/res/xml/shortcuts.xml"))
            .map { it.groupValues[1] }
            .toList()

    private fun hostOf(uri: String): String =
        Regex("""^[a-z0-9.]+://([a-z0-9-]+)""").find(uri)?.groupValues?.get(1)
            ?: error("shortcuts.xml URI is not scheme://host - $uri")

    /** Hosts ShortcutDispatcher.parse dispatches on. */
    private fun dispatcherHosts(): Set<String> {
        val src = read("src/main/java/com/desmoines/aipulse/util/ShortcutDispatcher.kt")
        val start = src.indexOf("private fun parse(uri: Uri)")
        assertTrue(start != -1, "ShortcutDispatcher.parse is gone - this test needs updating with it")
        return Regex(""""([a-z-]+)"\s*->""").findAll(src.substring(start))
            .map { it.groupValues[1] }
            .toSet()
    }

    /** Hosts declared on the shortcut intent-filter. */
    private fun manifestShortcutHosts(): Set<String> {
        val filter = Regex("""<intent-filter[\s\S]*?</intent-filter>""")
            .findAll(read("src/main/AndroidManifest.xml"))
            .firstOrNull { it.value.contains("""android:host="ask-pulse"""") }
        assertTrue(filter != null, "no intent-filter declares the ask-pulse shortcut host")
        return Regex("""android:host="([a-z0-9-]+)"""").findAll(filter!!.value)
            .map { it.groupValues[1] }
            .toSet()
    }

    @Test
    fun `every shipped shortcut has a host the manifest lets in`() {
        val declared = manifestShortcutHosts()
        val missing = shortcutUris().map(::hostOf).filterNot { it in declared }
        assertTrue(
            missing.isEmpty(),
            "res/xml/shortcuts.xml ships $missing, which no intent-filter declares. Tapping those " +
                "shortcuts does not reach the app.",
        )
    }

    @Test
    fun `every shipped shortcut has a host the dispatcher understands`() {
        val handled = dispatcherHosts()
        val unhandled = shortcutUris().map(::hostOf).filterNot { it in handled }
        assertTrue(
            unhandled.isEmpty(),
            "res/xml/shortcuts.xml ships $unhandled, which ShortcutDispatcher.parse drops. Those " +
                "shortcuts open the app on whatever screen it was already on.",
        )
    }

    @Test
    fun `the dispatcher handles nothing that is not declared somewhere`() {
        val declared = manifestShortcutHosts()
        val orphans = dispatcherHosts() - declared
        assertTrue(
            orphans.isEmpty(),
            "ShortcutDispatcher.parse handles $orphans, which no intent-filter declares. That is " +
                "dead code that reads as a supported entry point.",
        )
    }

    @Test
    fun `the instrumentation test still quotes the shipped ask-pulse URI`() {
        // ShortcutDispatcherUriTest asserts what this exact string decodes to. If
        // the shortcut copy changes and the literal does not, that test keeps
        // passing against a URI the app no longer ships.
        val shipped = shortcutUris().first { hostOf(it) == "ask-pulse" }
        val quoted = read("src/androidTest/java/com/desmoines/aipulse/util/ShortcutDispatcherUriTest.kt")
        assertTrue(
            quoted.contains(shipped),
            "ShortcutDispatcherUriTest no longer quotes the shipped shortcut URI.\n  shipped: $shipped",
        )
    }

    @Test
    fun `the three shortcuts are the ones we expect`() {
        assertEquals(
            listOf("ask-pulse", "find-restaurants", "find-events"),
            shortcutUris().map(::hostOf),
        )
    }
}
