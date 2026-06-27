package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.VotingCategory
import com.desmoines.aipulse.data.remote.BestOfRemoteDataSource
import com.desmoines.aipulse.util.QueryCache
import kotlinx.serialization.builtins.ListSerializer
import javax.inject.Inject
import javax.inject.Singleton

/** Reads Best Of voting categories, caching the list for offline cold-start. */
interface BestOfRepository {
    suspend fun fetchCategories(): Result<List<VotingCategory>>
}

@Singleton
class BestOfRepositoryImpl @Inject constructor(
    private val remote: BestOfRemoteDataSource,
    private val queryCache: QueryCache,
) : BestOfRepository {

    private val serializer = ListSerializer(VotingCategory.serializer())

    override suspend fun fetchCategories(): Result<List<VotingCategory>> {
        val fresh = runCatching { remote.fetchCategories() }.getOrNull()
        if (fresh != null) {
            queryCache.set(CACHE_KEY, fresh, serializer)
            return Result.success(fresh)
        }
        val cached = queryCache.get(CACHE_KEY, serializer, allowStale = true)
        if (cached != null) return Result.success(cached)
        return Result.failure(IllegalStateException("Couldn't load voting categories."))
    }

    private companion object {
        const val CACHE_KEY = "best-of-categories"
    }
}
