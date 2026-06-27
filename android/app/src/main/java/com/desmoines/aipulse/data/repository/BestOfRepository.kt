package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.LeaderboardEntry
import com.desmoines.aipulse.data.model.Nominee
import com.desmoines.aipulse.data.model.Vote
import com.desmoines.aipulse.data.model.VotingCategory
import com.desmoines.aipulse.data.remote.BestOfRemoteDataSource
import com.desmoines.aipulse.util.QueryCache
import kotlinx.serialization.builtins.ListSerializer
import javax.inject.Inject
import javax.inject.Singleton

/** Reads Best Of voting categories + the booth (user vote, nominee search, cast) + leaderboards. */
interface BestOfRepository {
    suspend fun fetchCategories(): Result<List<VotingCategory>>
    suspend fun fetchCategory(categoryId: String): Result<VotingCategory?>
    suspend fun fetchUserVote(categoryId: String, userId: String): Result<Vote?>
    suspend fun searchNominees(query: String): Result<List<Nominee>>
    suspend fun resolveEntityName(entityType: String, entityId: String): String?
    suspend fun fetchResults(categoryId: String): Result<List<LeaderboardEntry>>
    suspend fun fetchWinners(): Map<String, String>
    suspend fun castVote(
        categoryId: String,
        userId: String,
        entityType: String,
        entityId: String?,
        customEntry: String?,
    ): Result<Unit>
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

    override suspend fun fetchCategory(categoryId: String): Result<VotingCategory?> =
        runCatching { remote.fetchCategory(categoryId) }

    override suspend fun fetchUserVote(categoryId: String, userId: String): Result<Vote?> =
        runCatching { remote.fetchUserVote(categoryId, userId) }

    override suspend fun searchNominees(query: String): Result<List<Nominee>> =
        runCatching { remote.searchNominees(query) }

    override suspend fun resolveEntityName(entityType: String, entityId: String): String? =
        runCatching { remote.fetchEntityName(entityType, entityId) }.getOrNull()

    override suspend fun fetchResults(categoryId: String): Result<List<LeaderboardEntry>> =
        runCatching { remote.fetchResults(categoryId) }

    override suspend fun fetchWinners(): Map<String, String> =
        runCatching { remote.fetchWinners() }.getOrDefault(emptyMap())

    override suspend fun castVote(
        categoryId: String,
        userId: String,
        entityType: String,
        entityId: String?,
        customEntry: String?,
    ): Result<Unit> = runCatching {
        remote.castVote(categoryId, userId, entityType, entityId, customEntry)
    }

    private companion object {
        const val CACHE_KEY = "best-of-categories"
    }
}
