package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.SavedSearch
import com.desmoines.aipulse.data.model.SavedSearchFilters
import com.desmoines.aipulse.data.remote.SavedSearchRemoteDataSource
import com.desmoines.aipulse.util.QueryCache
import kotlinx.serialization.builtins.ListSerializer
import javax.inject.Inject
import javax.inject.Singleton

/** CRUD + offline cache for saved searches. Mirrors iOS SavedSearchService. */
interface SavedSearchRepository {
    /** Fetch own saved searches; falls back to the last-fetched local copy offline. */
    suspend fun fetch(userId: String?): Result<List<SavedSearch>>
    suspend fun create(userId: String, name: String, filters: SavedSearchFilters): Result<Unit>
    suspend fun update(id: String, filters: SavedSearchFilters): Result<Unit>
    suspend fun delete(id: String): Result<Unit>
}

@Singleton
class SavedSearchRepositoryImpl @Inject constructor(
    private val remote: SavedSearchRemoteDataSource,
    private val queryCache: QueryCache,
) : SavedSearchRepository {

    private val serializer = ListSerializer(SavedSearch.serializer())

    override suspend fun fetch(userId: String?): Result<List<SavedSearch>> {
        if (userId == null) return Result.success(emptyList())
        val key = cacheKey(userId)
        val fresh = runCatching { remote.fetch(userId) }.getOrNull()
        if (fresh != null) {
            queryCache.set(key, fresh, serializer)
            return Result.success(fresh)
        }
        // Offline / failure: serve the last-fetched copy if we have one.
        val cached = queryCache.get(key, serializer, allowStale = true)
        return if (cached != null) Result.success(cached)
        else Result.failure(IllegalStateException("Couldn't load saved searches."))
    }

    override suspend fun create(userId: String, name: String, filters: SavedSearchFilters): Result<Unit> =
        runCatching { remote.create(userId, name, filters) }

    override suspend fun update(id: String, filters: SavedSearchFilters): Result<Unit> =
        runCatching { remote.update(id, filters) }

    override suspend fun delete(id: String): Result<Unit> =
        runCatching { remote.delete(id) }

    private fun cacheKey(userId: String) = "saved-searches-$userId"
}
