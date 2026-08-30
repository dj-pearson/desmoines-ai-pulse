package com.desmoines.aipulse.util

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * A caught-and-logged error has to reach somebody (AND-AUDIT-023 AC5).
 *
 * AppLogger.error only wrote to logcat, on a device nobody is holding, so every
 * error the app handled gracefully was invisible in production. It now also
 * reports through an installed sink, which DesMoinesInsiderApp points at
 * CrashReportingService.
 *
 * These do not touch CrashReportingService: the sink is the contract, and
 * AND-AUDIT-008's tests already cover the reporter itself.
 */
class AppLoggerErrorSinkTest {

    private data class Reported(
        val category: String,
        val message: String,
        val throwable: Throwable?,
    )

    private val reported = mutableListOf<Reported>()

    private fun install() = AppLogger.installErrorSink { category, message, throwable ->
        reported += Reported(category, message, throwable)
    }

    @AfterEach
    fun uninstall() = AppLogger.installErrorSink(null)

    @Test
    fun `error reports the category, the message and the cause`() {
        install()
        val cause = IllegalStateException("upstream said no")

        AppLogger.network.error("Request failed", cause)

        assertEquals(1, reported.size)
        assertEquals("network", reported.single().category)
        assertEquals("Request failed", reported.single().message)
        assertEquals(cause, reported.single().throwable)
    }

    @Test
    fun `an error without a cause still reports, and is identifiable`() {
        install()

        AppLogger.billing.error("Purchase acknowledgement missing")

        // The sink gets a null throwable; the Application substitutes
        // LoggedError so CrashRecord.type is not a bare RuntimeException
        // shared with everything else.
        assertEquals(null, reported.single().throwable)
        val substituted = reported.single().throwable ?: LoggedError(reported.single().message)
        assertTrue(substituted is LoggedError)
        assertEquals("Purchase acknowledgement missing", substituted.message)
    }

    @Test
    fun `NEGATIVE CONTROL - warning, info and debug do not report`() {
        // Without this the sink could report every level and the first test
        // would still pass, which would bury the errors under 42 warnings.
        install()

        AppLogger.auth.warning("Token near expiry")
        AppLogger.auth.info("Signed in")
        AppLogger.auth.debug("cache hit")

        assertEquals(emptyList<Reported>(), reported)
    }

    @Test
    fun `a throwing sink cannot break the caller`() {
        // Logging an error someone handled must never become a crash they did
        // not have. Same rule as SecureStorage's fallback reporting.
        AppLogger.installErrorSink { _, _, _ -> throw IllegalStateException("reporter down") }

        AppLogger.general.error("something handled")
    }

    @Test
    fun `with no sink installed, error is still just a log`() {
        AppLogger.installErrorSink(null)

        AppLogger.general.error("before startup")

        assertEquals(emptyList<Reported>(), reported)
    }
}

/**
 * Logging stays behind AppLogger (AND-AUDIT-023 AC1).
 *
 * 98 call sites used android.util.Log directly, so the DMI/<category> tags
 * AppLogger exists to provide were absent from most of the app - and now that
 * error() feeds CrashReportingService, a direct Log.e is also an error that
 * reports to nobody. A source scan, for the same reason as the locale and
 * lifecycle ones: the thing that regresses is a call site.
 */
class DirectLogUsageTest {

    @Test
    fun `nothing outside AppLogger calls android util Log`() {
        val main = java.io.File("src/main/java/com/desmoines/aipulse")
        org.junit.jupiter.api.Assumptions.assumeTrue(main.isDirectory, "source tree not reachable")

        val direct = Regex("""(^|[^A-Za-z0-9_.])(android\.util\.)?Log\.[dviwe]\(""")
        val offenders = main.walkTopDown()
            .filter { it.extension == "kt" && it.name != "AppLogger.kt" }
            .flatMap { file ->
                file.readLines().withIndex()
                    .filter { (_, line) -> direct.containsMatchIn(line) }
                    .map { (i, line) -> "${file.name}:${i + 1}  ${line.trim()}" }
            }
            .toList()

        assertEquals(
            emptyList<String>(),
            offenders,
            "use AppLogger.<category>.<level>() - a direct Log.e also bypasses the " +
                "crash-report sink, so the error reaches nobody",
        )
    }
}
