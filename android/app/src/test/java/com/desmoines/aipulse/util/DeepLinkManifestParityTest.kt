package com.desmoines.aipulse.util

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The parser and the manifest have to declare the same hosts (AND-AUDIT-014 AC4).
 *
 * AndroidManifest.xml already states this as a rule - "Every host it accepts
 * must be declared here or the link never reaches the app - the parser was
 * complete but unreachable from outside the process" - and nothing enforced it.
 * That sentence is the record of it having already gone wrong once.
 *
 * IT FAILS IN BOTH DIRECTIONS, because both are real and they fail differently:
 *   a host the parser accepts and the manifest omits never reaches the process
 *     at all. The link opens a browser instead. Nothing in the app runs, so no
 *     device test can see it - which is why this is a source comparison.
 *   a host the manifest declares and the parser drops opens the app and then
 *     does nothing, which is worse to diagnose because it looks like a crash-
 *     free no-op.
 *
 * READS SOURCES, RUNS NO CODE. A JVM test rather than an instrumentation test on
 * purpose: it is comparing two files, and the device version of the same
 * question (DeepLinkHandlerTest.everyCustomSchemeHostTheManifestDeclaresResolves)
 * can only check the hosts someone remembered to list in it.
 */
class DeepLinkManifestParityTest {

    private val moduleRoot: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .first { File(it, "src/main/AndroidManifest.xml").exists() }

    private fun read(path: String) = File(moduleRoot, path).readText()

    /** Hosts named in parseCustomScheme's `host == "..."` branches. */
    private fun parserHosts(): Set<String> {
        val src = read("src/main/java/com/desmoines/aipulse/util/DeepLinkHandler.kt")
        val start = src.indexOf("private fun parseCustomScheme")
        assertTrue(start != -1, "parseCustomScheme is gone - this test needs updating with it")
        val body = src.substring(start)
        return Regex("""host == "([a-z0-9-]+)"""").findAll(body).map { it.groupValues[1] }.toSet()
    }

    /** Hosts in the intent-filter that declares the app's custom scheme. */
    private fun manifestHosts(): Set<String> {
        val xml = read("src/main/AndroidManifest.xml")
        // The filter is identified by the scheme it declares, not by position,
        // so reordering the manifest does not silently empty this set.
        val filters = Regex("""<intent-filter[\s\S]*?</intent-filter>""").findAll(xml)
        val filter = filters.firstOrNull {
            it.value.contains("""android:scheme="com.desmoines.aipulse"""") &&
                it.value.contains("""android:host="event"""")
        }
        assertTrue(filter != null, "no intent-filter declares the com.desmoines.aipulse content scheme")
        return Regex("""android:host="([a-z0-9-]+)"""").findAll(filter!!.value)
            .map { it.groupValues[1] }
            .toSet()
    }

    @Test
    fun `every host the parser accepts is declared in the manifest`() {
        val missing = parserHosts() - manifestHosts()
        assertTrue(
            missing.isEmpty(),
            "DeepLinkHandler.parseCustomScheme accepts $missing, which AndroidManifest.xml does not " +
                "declare. A link to those hosts opens a browser and never reaches the app.",
        )
    }

    @Test
    fun `every host the manifest declares is understood by the parser`() {
        val unhandled = manifestHosts() - parserHosts()
        assertTrue(
            unhandled.isEmpty(),
            "AndroidManifest.xml declares $unhandled, which DeepLinkHandler.parseCustomScheme drops. " +
                "Those links open the app and then do nothing.",
        )
    }

    @Test
    fun `the two lists are the ten hosts we expect`() {
        // A fixed expectation as well as the comparison: without it, deleting a
        // host from BOTH files would leave the two tests above green while the
        // link silently stopped working.
        assertEquals(
            setOf("event", "restaurant", "attraction", "hotel", "home", "dining", "search", "map", "favorites", "profile"),
            parserHosts(),
        )
    }
}
