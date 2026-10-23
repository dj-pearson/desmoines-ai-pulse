package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.remote.TripPlannerRemoteDataSource
import com.desmoines.aipulse.data.remote.TripPlannerServerError
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import java.io.IOException

/**
 * AND-OVH-011: only "no such relation" pauses the planner. Anything else that
 * goes wrong with the probe fails open, so a flaky network never hides a
 * planner that works.
 */
class TripPlannerAvailabilityTest {

    private fun postgrestError(code: String?, status: Int): PostgrestRestException =
        mockk {
            every { this@mockk.code } returns code
            every { statusCode } returns status
            // The store logs the message when the probe fails.
            every { message } returns "PostgREST $code ($status)"
        }

    @Test
    fun `missing relation codes pause`() {
        for (code in listOf("42P01", "PGRST205", "PGRST202")) {
            assertEquals(TripPlannerAvailability.Paused, TripPlannerAvailability.classify(code, 400), code)
        }
    }

    @Test
    fun `a bare 404 pauses`() {
        assertEquals(TripPlannerAvailability.Paused, TripPlannerAvailability.classify(null, 404))
    }

    @Test
    fun `other codes are unknown, not paused`() {
        assertEquals(TripPlannerAvailability.Unknown, TripPlannerAvailability.classify("42703", 400))
        assertEquals(TripPlannerAvailability.Unknown, TripPlannerAvailability.classify("42501", 403))
        assertEquals(TripPlannerAvailability.Unknown, TripPlannerAvailability.classify(null, 500))
        assertEquals(TripPlannerAvailability.Unknown, TripPlannerAvailability.classify(null, null))
    }

    @Test
    fun `postgrest exceptions classify by code and status`() {
        assertEquals(
            TripPlannerAvailability.Paused,
            TripPlannerAvailability.classify(postgrestError("PGRST205", 404)),
        )
        assertEquals(
            TripPlannerAvailability.Paused,
            TripPlannerAvailability.classify(postgrestError("42P01", 400)),
        )
        assertEquals(
            TripPlannerAvailability.Unknown,
            TripPlannerAvailability.classify(postgrestError("42703", 400)),
        )
    }

    @Test
    fun `network and unrelated errors are unknown`() {
        assertEquals(TripPlannerAvailability.Unknown, TripPlannerAvailability.classify(IOException("offline")))
        assertEquals(
            TripPlannerAvailability.Unknown,
            TripPlannerAvailability.classify(IllegalStateException("Supabase client is not configured.")),
        )
    }

    @Test
    fun `generate-itinerary storage refusal pauses`() {
        assertEquals(
            TripPlannerAvailability.Paused,
            TripPlannerAvailability.classify(TripPlannerServerError("paused", "trip_storage_unavailable")),
        )
        assertEquals(
            TripPlannerAvailability.Unknown,
            TripPlannerAvailability.classify(TripPlannerServerError("upgrade", "upgrade_required")),
        )
    }

    @Test
    fun `a successful probe is available`() = runTest {
        val remote = mockk<TripPlannerRemoteDataSource>()
        coEvery { remote.probeStorage() } returns Unit
        val store = TripPlannerAvailabilityStore(remote)

        store.ensureProbed()

        assertEquals(TripPlannerAvailability.Available, store.state.value)
    }

    @Test
    fun `a missing table pauses`() = runTest {
        val remote = mockk<TripPlannerRemoteDataSource>()
        coEvery { remote.probeStorage() } throws postgrestError("PGRST205", 404)
        val store = TripPlannerAvailabilityStore(remote)

        store.ensureProbed()

        assertEquals(TripPlannerAvailability.Paused, store.state.value)
    }

    @Test
    fun `a failing probe fails open`() = runTest {
        val remote = mockk<TripPlannerRemoteDataSource>()
        coEvery { remote.probeStorage() } throws IOException("timeout")
        val store = TripPlannerAvailabilityStore(remote)

        store.ensureProbed()

        assertEquals(TripPlannerAvailability.Unknown, store.state.value)
        assertFalse(store.state.value.isPaused)
    }

    @Test
    fun `the probe runs once per process`() = runTest {
        val remote = mockk<TripPlannerRemoteDataSource>()
        coEvery { remote.probeStorage() } returns Unit
        val store = TripPlannerAvailabilityStore(remote)

        store.ensureProbed()
        store.ensureProbed()
        store.ensureProbed()

        coVerify(exactly = 1) { remote.probeStorage() }
    }

    @Test
    fun `a later missing-storage error pauses, other errors do not`() = runTest {
        val remote = mockk<TripPlannerRemoteDataSource>()
        coEvery { remote.probeStorage() } returns Unit
        val store = TripPlannerAvailabilityStore(remote)
        store.ensureProbed()

        store.report(IOException("offline"))
        assertEquals(TripPlannerAvailability.Available, store.state.value)

        store.report(postgrestError("42P01", 400))
        assertEquals(TripPlannerAvailability.Paused, store.state.value)
    }

    @Test
    fun `share stays off, matching web`() {
        assertFalse(TripPlannerAvailability.TRIP_SHARE_AVAILABLE)
    }
}
