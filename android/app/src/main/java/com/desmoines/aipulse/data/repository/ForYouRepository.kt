package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Recommendation
import com.desmoines.aipulse.data.remote.ForYouRemoteDataSource
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
    ): Result<ForYouResult> = runCatching {
        val personalized = userId != null &&
            remote.countRecentSwipes(userId, windowStartIso()) >= ForYouRepository.SWIPE_THRESHOLD

        if (personalized) {
            ForYouResult(ForYouSource.FOR_YOU, remote.fetchPersonalized(lat, lon, ForYouRepository.LIMIT))
        } else {
            ForYouResult(ForYouSource.TRENDING, remote.fetchTrending(ForYouRepository.LIMIT))
        }
    }

    private fun windowStartIso(): String =
        Instant.now().minus(ForYouRepository.WINDOW_DAYS, ChronoUnit.DAYS).toString()
}
