package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.SurprisePick
import com.desmoines.aipulse.data.remote.SurpriseMeRemoteDataSource
import com.desmoines.aipulse.util.AppLogger
import javax.inject.Inject
import javax.inject.Singleton

/** Backs the Surprise Me single-pick engine. Mirrors iOS SurpriseMeService. */
interface SurpriseMeRepository {
    /** Roll a curated pick; failure carries a user-facing message. */
    suspend fun surprise(lat: Double? = null, lon: Double? = null): Result<SurprisePick>

    /** Fire-and-forget outcome tracking (shown / saved / tried_another / opened). */
    suspend fun track(pick: SurprisePick, outcome: String)
}

@Singleton
class SurpriseMeRepositoryImpl @Inject constructor(
    private val remote: SurpriseMeRemoteDataSource,
) : SurpriseMeRepository {

    override suspend fun surprise(lat: Double?, lon: Double?): Result<SurprisePick> = runCatching {
        remote.surprise(lat, lon)
            ?: throw SurpriseMeException("No surprise pick available right now. Try again.")
    }

    override suspend fun track(pick: SurprisePick, outcome: String) {
        runCatching { remote.track(pick, outcome) }
            .onFailure { AppLogger.network.warning("surprise track($outcome) failed: ${it.message}") }
    }
}

/** Carries a user-facing message for a failed roll. */
class SurpriseMeException(message: String) : Exception(message)
