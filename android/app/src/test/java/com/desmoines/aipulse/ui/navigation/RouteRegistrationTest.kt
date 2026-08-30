package com.desmoines.aipulse.ui.navigation

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Every declared route has to be registered, and every createRoute has to build
 * the pattern it belongs to (AND-AUDIT-014 AC4, navigation).
 *
 * Navigation here is already better defended than most of the app: routes are a
 * sealed class, so `navigate(Route.EventDetail.createRoute(id))` is checked by
 * the compiler and there is not one raw-string navigate() call in the module.
 * Measured before writing this, and it is why these are the two gaps left rather
 * than a device test - there was nothing broken for one to find.
 *
 * WHAT THE COMPILER STILL CANNOT SEE:
 *
 * 1. A route declared and never handed to composable(). navigate() then throws
 *    IllegalArgumentException - "Navigation destination that matches route X
 *    cannot be found" - at the moment the user taps, which is as far from the
 *    mistake as it gets. Adding a Route object is one line and registering it is
 *    a different file.
 *
 * 2. A createRoute that no longer builds its own pattern. Route("event/{id}")
 *    with createRoute returning "event_detail/$id" compiles perfectly and
 *    crashes the same way. The two literals sit four lines apart, which is
 *    exactly close enough to feel checked and far enough to drift.
 *
 * Reads sources, runs no code. NavGraph.kt is declared as a Test task input in
 * build.gradle.kts; without that Gradle leaves this suite UP-TO-DATE when the
 * routes change and the guard passes on a break.
 */
class RouteRegistrationTest {

    private val moduleRoot: File = generateSequence(File("").absoluteFile) { it.parentFile }
        .first { File(it, "src/main/AndroidManifest.xml").exists() }

    private val navGraph = File(moduleRoot, "src/main/java/com/desmoines/aipulse/ui/navigation/NavGraph.kt").readText()

    private val allSources: String = File(moduleRoot, "src/main/java")
        .walkTopDown().filter { it.extension == "kt" }.joinToString("\n") { it.readText() }

    private data class Declared(val name: String, val pattern: String)

    private fun declaredRoutes(): List<Declared> =
        Regex("""data object (\w+)\s*:\s*Route\("([^"]+)"\)""")
            .findAll(navGraph)
            .map { Declared(it.groupValues[1], it.groupValues[2]) }
            .toList()

    private fun registeredRouteNames(): Set<String> =
        Regex("""composable\(\s*(?:route\s*=\s*)?Route\.(\w+)\.route""")
            .findAll(allSources)
            .map { it.groupValues[1] }
            .toSet()

    /**
     * Collapse both a pattern and a createRoute body to the same skeleton.
     *
     * "event_detail/{eventId}" and "event_detail/$eventId" both become
     * "event_detail/<arg>". Handles `${ ... }` too, because WebView's helper
     * URL-encodes inline and a naive replace splits on the comma inside it.
     */
    private fun skeleton(s: String): String {
        val sb = StringBuilder()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            when {
                c == '{' && (i == 0 || s[i - 1] != '$') -> {
                    // A "{name}" hole in the route pattern.
                    val end = s.indexOf('}', i)
                    if (end == -1) { sb.append(c); i++ } else { sb.append("<arg>"); i = end + 1 }
                }
                c == '$' && i + 1 < s.length && s[i + 1] == '{' -> {
                    // A "${ ... }" interpolation, brace-counted so nesting is safe.
                    var depth = 0
                    var j = i + 1
                    while (j < s.length) {
                        if (s[j] == '{') depth++
                        if (s[j] == '}') { depth--; if (depth == 0) break }
                        j++
                    }
                    sb.append("<arg>"); i = j + 1
                }
                c == '$' -> {
                    var j = i + 1
                    while (j < s.length && (s[j].isLetterOrDigit() || s[j] == '_')) j++
                    sb.append("<arg>"); i = j
                }
                else -> { sb.append(c); i++ }
            }
        }
        return sb.toString()
    }

    @Test
    fun `every declared route is registered with a composable`() {
        val registered = registeredRouteNames()
        val missing = declaredRoutes().map { it.name }.filterNot { it in registered }
        assertTrue(
            missing.isEmpty(),
            "Route objects $missing are declared but never passed to composable(). navigate() to one " +
                "throws \"Navigation destination that matches route ... cannot be found\" at tap time.",
        )
    }

    @Test
    fun `every registered composable names a declared route`() {
        val declared = declaredRoutes().map { it.name }.toSet()
        val unknown = registeredRouteNames().filterNot { it in declared }
        assertTrue(unknown.isEmpty(), "composable() registers $unknown, which Route does not declare.")
    }

    @Test
    fun `every createRoute builds its own pattern`() {
        val failures = mutableListOf<String>()
        for (m in Regex("""data object (\w+)\s*:\s*Route\("([^"]+)"\)\s*\{([\s\S]*?)\n {4}\}""").findAll(navGraph)) {
            val (name, pattern, body) = m.destructured
            val built = Regex("""fun createRoute\([^)]*\)\s*=\s*"((?:[^"\\]|\\.|\$\{[^}]*\})*)"""")
                .find(body)?.groupValues?.get(1) ?: continue
            if (skeleton(built) != skeleton(pattern)) {
                failures += "$name: pattern \"$pattern\" -> ${skeleton(pattern)}, createRoute builds ${skeleton(built)}"
            }
        }
        assertTrue(
            failures.isEmpty(),
            "createRoute no longer builds the route it belongs to. navigate() compiles and then " +
                "fails to match at tap time:\n  " + failures.joinToString("\n  "),
        )
    }

    @Test
    fun `parameterised routes declare a navArgument for every hole`() {
        val failures = mutableListOf<String>()
        for (m in Regex("""data object (\w+)\s*:\s*Route\("([^"]+)"\)\s*\{([\s\S]*?)\n {4}\}""").findAll(navGraph)) {
            val (name, pattern, body) = m.destructured
            val holes = Regex("""\{(\w+)\}""").findAll(pattern).map { it.groupValues[1] }.toList()
            val args = Regex("""navArgument\("(\w+)"""").findAll(body).map { it.groupValues[1] }.toList()
            if (holes != args) failures += "$name: pattern holes $holes, navArgument $args"
        }
        assertTrue(
            failures.isEmpty(),
            "A route argument is not declared, or is declared under a different name, so the screen " +
                "reads null for it:\n  " + failures.joinToString("\n  "),
        )
    }

    @Test
    fun `navigation still goes through the sealed class`() {
        // Zero raw-string navigate() calls today. That is what makes route names
        // a compile-time concern, and it is worth keeping true.
        val raw = Regex("""navigate\(\s*"([^"]+)"""").findAll(allSources).map { it.groupValues[1] }.toList()
        assertEquals(
            emptyList<String>(),
            raw,
            "navigate() was called with a raw string. Use Route.X.route or Route.X.createRoute so a " +
                "renamed route is a compile error rather than a crash.",
        )
    }
}
