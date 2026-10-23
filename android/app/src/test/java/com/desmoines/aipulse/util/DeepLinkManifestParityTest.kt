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

    /** The intent-filter that declares the https App Links. */
    private fun appLinksFilter(): String {
        val xml = read("src/main/AndroidManifest.xml")
        val filter = Regex("""<intent-filter[\s\S]*?</intent-filter>""").findAll(xml)
            .map { it.value }
            .firstOrNull { it.contains("""android:scheme="https"""") }
        assertTrue(filter != null, "no intent-filter declares the https App Links")
        return filter!!
    }

    @Test
    fun `the App Links filter claims exactly the sections the parser handles`() {
        // AND-OVH-021. A section claimed and unparsed opens the app on a
        // WebView of a page we could have shown natively; a section parsed and
        // unclaimed (the /stay hotel links before this) never reaches the app.
        val prefixes = Regex("""android:pathPrefix="/([a-z0-9-]+)"""").findAll(appLinksFilter())
            .map { it.groupValues[1] }
            .toSet()
        assertEquals(DeepLinkHandler.CLAIMED_WEB_SECTIONS, prefixes)
        assertEquals(
            setOf("events", "restaurants", "attractions", "stay", "articles", "search"),
            prefixes,
        )
    }

    @Test
    fun `the App Links filter declares exactly the hosts the parser trusts`() {
        val hosts = Regex("""android:host="([a-z0-9.-]+)"""").findAll(appLinksFilter())
            .map { it.groupValues[1] }
            .toSet()
        assertEquals(DeepLinkHandler.FIRST_PARTY_HOSTS, hosts)
    }

    @Test
    fun `the parser compares hosts by equality, not substring`() {
        // IOS-DD-PLATFORM-10 on iOS: a contains() check accepted
        // desmoinesinsider.com.evil.io.
        val src = read("src/main/java/com/desmoines/aipulse/util/DeepLinkHandler.kt")
        assertTrue(!src.contains("host.contains") && !src.contains("contains(\"desmoinesinsider"))
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
