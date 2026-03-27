package com.desmoines.aipulse.data.repository

import android.util.Log
import com.desmoines.aipulse.data.model.Event
import com.desmoines.aipulse.data.remote.EventsQuery
import com.desmoines.aipulse.data.remote.EventsRemoteDataSource
import com.desmoines.aipulse.data.remote.EventsResponse
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "EventsRepository"

/**
 * Repository implementation wrapping [EventsRemoteDataSource] with error handling.
 * Returns [Result] types so callers handle success/failure uniformly.
 */
@Singleton
class EventsRepositoryImpl @Inject constructor(
    private val remoteDataSource: EventsRemoteDataSource,
) : EventsRepository {

    override suspend fun fetchEvents(query: EventsQuery): Result<EventsResponse> = runCatching {
        remoteDataSource.fetchEvents(query)
    }.onFailure { Log.e(TAG, "fetchEvents failed: ${it.message}", it) }

    override suspend fun fetchEvent(id: String): Result<Event> = runCatching {
        remoteDataSource.fetchEvent(id)
    }.onFailure { Log.e(TAG, "fetchEvent($id) failed: ${it.message}", it) }

    override suspend fun fetchFeaturedEvents(limit: Int): Result<List<Event>> = runCatching {
        remoteDataSource.fetchFeaturedEvents(limit)
    }.onFailure { Log.e(TAG, "fetchFeaturedEvents failed: ${it.message}", it) }

    override suspend fun fetchRelatedEvents(
        eventId: String,
        category: String,
        limit: Int,
    ): Result<List<Event>> = runCatching {
        remoteDataSource.fetchRelatedEvents(eventId, category, limit)
    }.onFailure { Log.e(TAG, "fetchRelatedEvents($eventId) failed: ${it.message}", it) }

    override suspend fun fuzzySearchEvents(query: String, limit: Int): Result<List<Event>> = runCatching {
        remoteDataSource.fuzzySearchEvents(query, limit)
    }.onFailure { Log.e(TAG, "fuzzySearchEvents($query) failed: ${it.message}", it) }

    override suspend fun fetchNearbyEvents(
        latitude: Double,
        longitude: Double,
        radiusMiles: Double,
        limit: Int,
    ): Result<List<Event>> = runCatching {
        remoteDataSource.fetchNearbyEvents(latitude, longitude, radiusMiles, limit)
    }.onFailure { Log.e(TAG, "fetchNearbyEvents failed: ${it.message}", it) }
}
