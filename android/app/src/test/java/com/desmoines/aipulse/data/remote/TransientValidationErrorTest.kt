package com.desmoines.aipulse.data.remote

import kotlinx.coroutines.CancellationException
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.serialization.SerializationException

/**
 * The other half of the receipt-validation decision (AND-AUDIT-022 AC4).
 *
 * validationOutcome decides what a verdict means and is already tested. This
 * decides whether a failure gets another attempt at all, and it was previously
 * made by substring-matching exception messages: "500", "502", "503", "504",
 * "timeout", "network", "connection". That returned false for a null message,
 * turning every retryable failure into an immediate give-up, and it could not
 * see a 429 or a 408 at all.
 */
class TransientValidationErrorTest {

    @ParameterizedTest
    @ValueSource(ints = [500, 502, 503, 504, 599])
    fun `server errors are retried`(status: Int) {
        assertTrue(isTransientValidationError(ReceiptValidationHttpException(status, "")))
    }

    @ParameterizedTest
    @ValueSource(ints = [408, 429])
    fun `back off and try again statuses are retried`(status: Int) {
        // Neither was reachable under the old substring rule: "429" was not in
        // the matched list. Both mean "not now", not "no".
        assertTrue(isTransientValidationError(ReceiptValidationHttpException(status, "")))
    }

    @ParameterizedTest
    @ValueSource(ints = [400, 401, 403, 404, 422])
    fun `client errors are not retried`(status: Int) {
        assertFalse(isTransientValidationError(ReceiptValidationHttpException(status, "")))
    }

    @Test
    fun `a 200 body containing the digits 503 is not a server error`() {
        // The old rule searched the whole message, and the message carried the
        // response body. A rejection reason mentioning an order id with "503"
        // in it would have been retried as though the server had failed.
        val notRetryable = ReceiptValidationHttpException(400, """{"reason":"order 1503 revoked"}""")
        assertFalse(isTransientValidationError(notRetryable))
    }

    @Test
    fun `transport failures are retried`() {
        assertTrue(isTransientValidationError(SocketTimeoutException()))
        assertTrue(isTransientValidationError(UnknownHostException()))
        assertTrue(isTransientValidationError(IOException()))
    }

    @Test
    fun `a transport failure with no message is still retried`() {
        // The regression that motivated this. IOException().message is null, so
        // the old rule returned false on the very failures it existed to catch.
        val noMessage = IOException()
        assertTrue(noMessage.message == null, "precondition: this exception has no message")
        assertTrue(isTransientValidationError(noMessage))
    }

    @Test
    fun `cancellation is never retried`() {
        assertFalse(isTransientValidationError(CancellationException("scope closed")))
    }

    @Test
    fun `a malformed response body is not retried`() {
        // Re-sending the same request produces the same undecodable body.
        assertFalse(isTransientValidationError(SerializationException("unexpected token")))
    }
}
