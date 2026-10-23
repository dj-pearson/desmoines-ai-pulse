package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.remote.TripPlannerRemoteDataSource
import com.desmoines.aipulse.data.remote.TripPlannerServerError
import com.desmoines.aipulse.util.AppLogger
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Whether the Trip Planner's storage is reachable (AND-OVH-011).
 *
 * trip_plans was missing in production for months, so every generation failed
 * while Home promoted the card and the paywall sold it. There is no remote
 * config to switch it off, so the app asks PostgREST whether the table exists
 * and the UI reads the answer. Mirrors iOS TripPlannerAvailability.swift: it
 * un-pauses by itself once 20261014000001_trip_planner_storage_d1.sql is live,
 * with no new binary.
 */
enum class TripPlannerAvailability {
    /**
     * Not probed yet, or the probe failed for a reason that says nothing about
     * the table (offline, timeout, auth). Treated as available, so a failing
     * probe never hides a feature that works.
     */
    Unknown,
    Available,

    /** The table does not exist. Planning, saved trips and the upsell are off. */
    Paused;

    val isPaused: Boolean get() = this == Paused

    companion object {
        /** Same copy as iOS TripPlannerAvailability.pausedMessage. */
        const val PAUSED_MESSAGE =
            "AI itineraries are paused while we fix saving. Nothing was used from your monthly allowance."

        /**
         * Android's TRIP_SHARE_AVAILABLE (web src/lib/tripPlannerStatus.ts).
         * Stays false: Share publishes to /trips/shared/<code>, which has no
         * route on the web, and trip_plans has no public read path.
         */
        const val TRIP_SHARE_AVAILABLE = false

        /** generate-itinerary's refusal when its storage is missing. */
        const val STORAGE_UNAVAILABLE_CODE = "trip_storage_unavailable"

        /**
         * PostgREST codes that mean "no such relation": 42P01 from Postgres,
         * PGRST205 when the schema cache has no such table, PGRST202 when it
         * has no such function. A missing column (42703) is not one of them.
         */
        private val MISSING_STORAGE_CODES = setOf("42P01", "PGRST205", "PGRST202")

        /**
         * Classify a probe result from its PostgREST code and HTTP status.
         * Pure so the rule can be tested without a Supabase client.
         */
        fun classify(code: String?, httpStatus: Int?): TripPlannerAvailability = when {
            code != null && code in MISSING_STORAGE_CODES -> Paused
            httpStatus == 404 -> Paused
            else -> Unknown
        }

        /** Classify a failure. Anything that is not a PostgREST/REST error is Unknown. */
        fun classify(error: Throwable): TripPlannerAvailability = when (error) {
            is PostgrestRestException -> classify(error.code, error.statusCode)
            is RestException -> classify(null, error.statusCode)
            is TripPlannerServerError ->
                if (error.code == STORAGE_UNAVAILABLE_CODE) Paused else Unknown
            else -> Unknown
        }
    }
}

/**
 * Holds the process-wide [TripPlannerAvailability]. The probe (select id,
 * limit 0 on trip_plans) runs at most once per process; later trip calls that
 * fail with a missing-storage error can still flip it to Paused.
 */
@Singleton
class TripPlannerAvailabilityStore @Inject constructor(
    private val remote: TripPlannerRemoteDataSource,
) {
    private val _state = MutableStateFlow(TripPlannerAvailability.Unknown)
    val state: StateFlow<TripPlannerAvailability> = _state.asStateFlow()

    private val mutex = Mutex()
    private var probed = false

    /** Probe trip_plans unless this process already has. Never throws. */
    suspend fun ensureProbed() {
        mutex.withLock {
            if (probed) return
            probed = true
            val result = try {
                remote.probeStorage()
                TripPlannerAvailability.Available
            } catch (e: Exception) {
                if (e is CancellationException) {
                    probed = false
                    throw e
                }
                AppLogger.network.warning("trip_plans probe failed: ${e.message}")
                TripPlannerAvailability.classify(e)
            }
            // A report() that landed while the probe ran wins over Unknown.
            if (!_state.value.isPaused) _state.value = result
        }
    }

    /** Pause the planner if [error] says its storage is missing; otherwise do nothing. */
    fun report(error: Throwable) {
        if (TripPlannerAvailability.classify(error).isPaused) {
            _state.value = TripPlannerAvailability.Paused
        }
    }
}
