package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Deal
import com.desmoines.aipulse.data.remote.DealsRemoteDataSource
import com.desmoines.aipulse.util.AppLogger
import javax.inject.Inject
import javax.inject.Singleton

/** Reads active deals; redemption tracking is best-effort. Mirrors iOS DealsService. */
interface DealsRepository {
    suspend fun fetchDeals(entityType: String? = null): Result<List<Deal>>
    /** Fire-and-forget redemption increment; anon RLS failures are tolerated. */
    suspend fun claimDeal(id: String)
}

@Singleton
class DealsRepositoryImpl @Inject constructor(
    private val remote: DealsRemoteDataSource,
) : DealsRepository {

    override suspend fun fetchDeals(entityType: String?): Result<List<Deal>> =
        runCatching { remote.fetchDeals(entityType) }

    override suspend fun claimDeal(id: String) {
        runCatching { remote.claimDeal(id) }
            .onFailure { AppLogger.network.warning("claimDeal failed: ${it.message}") }
    }
}
