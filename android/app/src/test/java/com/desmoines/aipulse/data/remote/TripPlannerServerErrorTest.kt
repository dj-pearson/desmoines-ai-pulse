package com.desmoines.aipulse.data.remote

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * XPLAT-010 AC2: generate-itinerary's structured refusals must survive the trip
 * back to Android.
 *
 * The function answers 403 with {error, code:"upgrade_required"} and 429 with
 * {error, code:"quota_exceeded"}. TripPlannerRemoteDataSource read neither the
 * status nor the code, so both a paywalled free user and a user out of monthly
 * trips got the same generic failure, while web unpacks the body and shows an
 * upgrade prompt (useTripPlanner.ts:175-185).
 *
 * WHY THE OLD CODE LOOKED FINE. A 403 body decodes cleanly into
 * GenerateItineraryResponse: `error` matches, `success` defaults to false. So
 * nothing threw, nothing logged, and the refusal reason was simply dropped on
 * the floor. That is why this needed a status check rather than better error
 * handling around the decode.
 */
class TripPlannerServerErrorTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `a 403 carries the upgrade_required code`() {
        val error = tripPlannerServerError(
            isSuccessStatus = false,
            statusCode = 403,
            body = """{"error":"Trip planning is an Insider feature.","code":"upgrade_required"}""",
            json = json,
        )
        assertNotNull(error)
        assertEquals("upgrade_required", error!!.code)
        assertEquals("Trip planning is an Insider feature.", error.message)
    }

    @Test
    fun `a 429 carries the quota_exceeded code and the server's message`() {
        // The server message names the limit and when it resets, so it must reach
        // the user verbatim rather than being replaced by a generic string.
        val error = tripPlannerServerError(
            isSuccessStatus = false,
            statusCode = 429,
            body = """{"error":"You have used all 5 trips this month.","code":"quota_exceeded"}""",
            json = json,
        )
        assertNotNull(error)
        assertEquals("quota_exceeded", error!!.code)
        assertEquals("You have used all 5 trips this month.", error.message)
    }

    @Test
    fun `a 2xx is not an error`() {
        assertNull(
            tripPlannerServerError(
                isSuccessStatus = true,
                statusCode = 200,
                body = """{"success":true}""",
                json = json,
            ),
        )
    }

    @Test
    fun `a 2xx is not an error even when the body looks like one`() {
        // Guards the direction that would break every successful trip: the check
        // keys on the status, not on the presence of an `error` field.
        assertNull(
            tripPlannerServerError(
                isSuccessStatus = true,
                statusCode = 200,
                body = """{"success":false,"error":"model timed out"}""",
                json = json,
            ),
        )
    }

    @Test
    fun `a non-2xx with an unparseable body still produces an error`() {
        // Falling through to the normal decode here would surface
        // success:false with a null message, and the user would see nothing.
        val error = tripPlannerServerError(
            isSuccessStatus = false,
            statusCode = 502,
            body = "<html>Bad Gateway</html>",
            json = json,
        )
        assertNotNull(error)
        assertNull(error!!.code)
        assertTrue(error.message.contains("502"), "the message should name the status: ${error.message}")
    }

    @Test
    fun `a non-2xx with an empty error string falls back rather than showing blank`() {
        val error = tripPlannerServerError(
            isSuccessStatus = false,
            statusCode = 500,
            body = """{"error":"","code":null}""",
            json = json,
        )
        assertNotNull(error)
        assertTrue(error!!.message.isNotBlank())
    }

    @Test
    fun `an unknown code is preserved rather than dropped`() {
        // itinerary_save_failed already exists in the function and more may follow.
        // The mapper must not filter to a known list, or a new server code becomes
        // invisible to Android until someone updates a when-branch.
        val error = tripPlannerServerError(
            isSuccessStatus = false,
            statusCode = 500,
            body = """{"error":"Could not save.","code":"itinerary_save_failed"}""",
            json = json,
        )
        assertEquals("itinerary_save_failed", error!!.code)
    }
}
