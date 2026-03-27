package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.remote.AttractionsQuery
import com.desmoines.aipulse.data.remote.AttractionsResponse

/**
 * Repository interface for attractions.
 * Mirrors iOS AttractionsService actor pattern, wrapping remote calls with error handling.
 */
interface AttractionsRepository {

    /** Fetch attractions with filtering, search, and pagination. */
    suspend fun fetchAttractions(query: AttractionsQuery = AttractionsQuery()): Result<AttractionsResponse>

    /** Fetch a single attraction by ID. */
    suspend fun fetchAttraction(id: String): Result<Attraction>

    /** Fetch nearby attractions using coordinates with client-side distance filtering. */
    suspend fun fetchNearbyAttractions(
        latitude: Double,
        longitude: Double,
        limit: Int = 50,
    ): Result<List<Attraction>>
}
