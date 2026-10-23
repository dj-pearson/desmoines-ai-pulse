package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.model.TripPlanItem
import com.desmoines.aipulse.data.remote.TripPlannerRemoteDataSource
import com.desmoines.aipulse.data.remote.TripPreferences
import com.desmoines.aipulse.util.AppLogger
import com.desmoines.aipulse.util.suspendRunCatching
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

    /** Load a saved trip's header (title, dates, cost) by id. */
    suspend fun fetchTrip(tripId: String): Result<TripPlan>

    /** Day-by-day items for a trip via the get_trip_itinerary RPC. */
    suspend fun fetchItems(tripId: String): Result<List<TripPlanItem>>

    /** Persist a reordering; true only if every item's order_index write succeeded. */
    suspend fun persistOrder(items: List<TripPlanItem>): Boolean
}

@Singleton
class TripPlannerRepositoryImpl @Inject constructor(
    private val remote: TripPlannerRemoteDataSource,
    private val availability: TripPlannerAvailabilityStore,
) : TripPlannerRepository {

    /**
     * Every trip_plans call reports its failure, so a table that disappears
     * after the launch probe still pauses the planner (iOS does the same in
     * TripPlannerService). Only missing-storage errors change anything.
     */
    private fun <T> Result<T>.reportingStorage(): Result<T> =
        onFailure { availability.report(it) }

    override suspend fun generate(
        startDate: String,
        endDate: String,
        prefs: TripPreferences,
    ): Result<TripPlan> = suspendRunCatching {
        val response = remote.generate(startDate, endDate, prefs)
        val plan = response.tripPlan
        when {
            plan != null -> plan
            else -> throw TripPlannerException(
                response.error ?: "Couldn't build your itinerary. Adjust your dates or interests and try again.",
            )
        }
    }.reportingStorage()

    override suspend fun monthlyTripCount(userId: String?): Int {
        if (userId == null) return 0
        return suspendRunCatching { remote.monthlyTripCount(userId) }
            .reportingStorage()
            .onFailure { AppLogger.network.warning("monthlyTripCount failed: ${it.message}") }
            .getOrDefault(0)
    }

    override suspend fun fetchSavedTrips(userId: String?): Result<List<TripPlan>> {
        if (userId == null) return Result.success(emptyList())
        return suspendRunCatching { remote.fetchSavedTrips(userId) }.reportingStorage()
    }

    override suspend fun shareTrip(tripId: String): Result<String> =
        suspendRunCatching { remote.shareTrip(tripId) }

    override suspend fun deleteTrip(tripId: String): Result<Unit> =
        suspendRunCatching { remote.deleteTrip(tripId) }

    override suspend fun fetchTrip(tripId: String): Result<TripPlan> =
        suspendRunCatching { remote.fetchTrip(tripId) }.reportingStorage()

    override suspend fun fetchItems(tripId: String): Result<List<TripPlanItem>> =
        suspendRunCatching { remote.fetchItems(tripId) }.reportingStorage()

    override suspend fun persistOrder(items: List<TripPlanItem>): Boolean =
        suspendRunCatching { remote.persistOrder(items) }
            .onFailure { AppLogger.network.warning("persistOrder failed: ${it.message}") }
            .getOrDefault(false)
}

/** Carries the server's user-facing error message for a failed generation. */
class TripPlannerException(message: String) : Exception(message)
