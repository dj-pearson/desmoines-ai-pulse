package com.desmoines.aipulse.data.repository

import android.util.Log
import com.desmoines.aipulse.data.model.Attraction
import com.desmoines.aipulse.data.remote.AttractionsQuery
import com.desmoines.aipulse.data.remote.AttractionsRemoteDataSource
import com.desmoines.aipulse.data.remote.AttractionsResponse
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "AttractionsRepository"

/**
 * Repository implementation wrapping [AttractionsRemoteDataSource] with error handling.
 * Returns [Result] types so callers handle success/failure uniformly.
 */
@Singleton
class AttractionsRepositoryImpl @Inject constructor(
    private val remoteDataSource: AttractionsRemoteDataSource,
) : AttractionsRepository {

    override suspend fun fetchAttractions(query: AttractionsQuery): Result<AttractionsResponse> = runCatching {
        remoteDataSource.fetchAttractions(query)
    }.onFailure { Log.e(TAG, "fetchAttractions failed: ${it.message}", it) }

    override suspend fun fetchAttraction(id: String): Result<Attraction> = runCatching {
        remoteDataSource.fetchAttraction(id)
    }.onFailure { Log.e(TAG, "fetchAttraction($id) failed: ${it.message}", it) }

    override suspend fun fetchNearbyAttractions(
        latitude: Double,
        longitude: Double,
        limit: Int,
    ): Result<List<Attraction>> = runCatching {
        remoteDataSource.fetchNearbyAttractions(latitude, longitude, limit)
    }.onFailure { Log.e(TAG, "fetchNearbyAttractions failed: ${it.message}", it) }
}
