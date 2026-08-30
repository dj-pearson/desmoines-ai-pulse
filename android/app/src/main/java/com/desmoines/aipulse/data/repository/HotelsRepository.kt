package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Hotel
import com.desmoines.aipulse.data.remote.HotelsQuery
import com.desmoines.aipulse.data.remote.HotelsRemoteDataSource
import com.desmoines.aipulse.data.remote.HotelsResponse
import com.desmoines.aipulse.util.QueryCache
import kotlinx.serialization.builtins.ListSerializer
import javax.inject.Inject
import javax.inject.Singleton

/** Reads active hotels, caching the unfiltered first page for offline cold-start. */
interface HotelsRepository {
    suspend fun fetchHotels(query: HotelsQuery = HotelsQuery()): Result<HotelsResponse>
    suspend fun fetchById(id: String): Result<Hotel?>
    suspend fun fetchAreas(): Result<List<String>>
}

@Singleton
class HotelsRepositoryImpl @Inject constructor(
    private val remote: HotelsRemoteDataSource,
    private val queryCache: QueryCache,
) : HotelsRepository {

    private val serializer = ListSerializer(Hotel.serializer())

    override suspend fun fetchHotels(query: HotelsQuery): Result<HotelsResponse> {
        val isFirstPage = query.offset == 0 && query.searchText.isNullOrBlank() &&
            query.areas.isEmpty() && query.priceRanges.isEmpty() && query.minRating == null
        val fresh = runCatching { remote.fetchHotels(query) }.getOrNull()
        if (fresh != null) {
            if (isFirstPage) queryCache.set(CACHE_KEY, fresh.hotels, serializer)
            return Result.success(fresh)
        }
        if (isFirstPage) {
            val cached = queryCache.get(CACHE_KEY, serializer, allowStale = true)
            if (cached != null) {
                return Result.success(HotelsResponse(hotels = cached, totalCount = cached.size, hasMore = false))
            }
        }
        return Result.failure(IllegalStateException("Couldn't load hotels."))
    }

    override suspend fun fetchById(id: String): Result<Hotel?> =
        runCatching { remote.fetchById(id) }

    override suspend fun fetchAreas(): Result<List<String>> =
        runCatching { remote.fetchAreas() }

    private companion object {
        const val CACHE_KEY = "hotels-first-page"
    }
}
