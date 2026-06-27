package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.remote.TripPlannerRemoteDataSource
import com.desmoines.aipulse.data.remote.TripPreferences
import com.desmoines.aipulse.util.AppLogger
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backs the AI Trip Planner. Mirrors iOS TripPlannerService.
 * The generate-itinerary edge function enforces tier + monthly quota server-side;
 * the client mirrors the quota for the meter and gates free users with the soft paywall.
 */
interface TripPlannerRepository {
    /** Generate an itinerary; failure carries the server's user-facing message. */
    suspend fun generate(startDate: String, endDate: String, prefs: TripPreferences): Result<TripPlan>

    /** Number of trips the user has generated this calendar month (0 if signed out). */
    suspend fun monthlyTripCount(userId: String?): Int

    /** The user's saved trips, newest first. */
    suspend fun fetchSavedTrips(userId: String?): Result<List<TripPlan>>

    /** Make a trip public; returns its share URL. */
    suspend fun shareTrip(tripId: String): Result<String>

    /** Delete a saved trip. */
    suspend fun deleteTrip(tripId: String): Result<Unit>
}

@Singleton
class TripPlannerRepositoryImpl @Inject constructor(
    private val remote: TripPlannerRemoteDataSource,
) : TripPlannerRepository {

    override suspend fun generate(
        startDate: String,
        endDate: String,
        prefs: TripPreferences,
    ): Result<TripPlan> = runCatching {
        val response = remote.generate(startDate, endDate, prefs)
        val plan = response.tripPlan
        when {
            plan != null -> plan
            else -> throw TripPlannerException(
                response.error ?: "Couldn't build your itinerary. Adjust your dates or interests and try again.",
            )
        }
    }

    override suspend fun monthlyTripCount(userId: String?): Int {
        if (userId == null) return 0
        return runCatching { remote.monthlyTripCount(userId) }
            .onFailure { AppLogger.network.warning("monthlyTripCount failed: ${it.message}") }
            .getOrDefault(0)
    }

    override suspend fun fetchSavedTrips(userId: String?): Result<List<TripPlan>> {
        if (userId == null) return Result.success(emptyList())
        return runCatching { remote.fetchSavedTrips(userId) }
    }

    override suspend fun shareTrip(tripId: String): Result<String> =
        runCatching { remote.shareTrip(tripId) }

    override suspend fun deleteTrip(tripId: String): Result<Unit> =
        runCatching { remote.deleteTrip(tripId) }
}

/** Carries the server's user-facing error message for a failed generation. */
class TripPlannerException(message: String) : Exception(message)
