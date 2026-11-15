package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Recommendation
import com.desmoines.aipulse.data.remote.ForYouRemoteDataSource
import com.desmoines.aipulse.util.suspendRunCatching
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import javax.inject.Singleton

/** Which feed backs the rail. */
enum class ForYouSource { FOR_YOU, TRENDING }

data class ForYouResult(
    val source: ForYouSource,
    val items: List<Recommendation>,
)

/**
 * Chooses the personalized feed for engaged users and a trending cold-start feed
 * otherwise. Mirrors iOS ForYouService. Free feature — no gating.
 */
interface ForYouRepository {
    /** [userId] null (signed out) always yields the trending feed. */
    suspend fun fetchForYou(
        userId: String?,
        lat: Double? = null,
        lon: Double? = null,
    ): Result<ForYouResult>

    companion object {
        const val SWIPE_THRESHOLD = 5
        const val LIMIT = 12
        const val WINDOW_DAYS = 90L
    }
}

@Singleton
class ForYouRepositoryImpl @Inject constructor(
    private val remote: ForYouRemoteDataSource,
) : ForYouRepository {

    override suspend fun fetchForYou(
        userId: String?,
        lat: Double?,
        lon: Double?,
    ): Result<ForYouResult> = suspendRunCatching {
        val personalized = userId != null &&
            remote.countRecentSwipes(userId, windowStartIso()) >= ForYouRepository.SWIPE_THRESHOLD

        // An empty personalized answer falls back to trending, as on iOS. The
        // server answers empty for an account that has not turned
        // "Personalized suggestions" on (XPLAT-016), so without this an
        // opted-out user would see a blank For You rail.
        val rows = if (personalized) remote.fetchPersonalized(lat, lon, ForYouRepository.LIMIT) else emptyList()
        if (rows.isNotEmpty()) {
            ForYouResult(ForYouSource.FOR_YOU, rows)
        } else {
            ForYouResult(ForYouSource.TRENDING, remote.fetchTrending(ForYouRepository.LIMIT))
        }
    }

    private fun windowStartIso(): String =
        Instant.now().minus(ForYouRepository.WINDOW_DAYS, ChronoUnit.DAYS).toString()
}
