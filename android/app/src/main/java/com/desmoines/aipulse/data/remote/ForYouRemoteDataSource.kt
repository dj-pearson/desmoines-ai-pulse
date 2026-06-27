package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.Recommendation
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Remote calls behind the For You / Trending rail. Mirrors iOS ForYouService.
 * Uses the shared recommendation RPCs and a lightweight swipe-history count.
 */
@Singleton
class ForYouRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {
    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    /** Count this user's swipe interactions since [sinceIso] (exact count via header; body capped). */
    suspend fun countRecentSwipes(userId: String, sinceIso: String): Int {
        val result = db().from("swipe_interactions").select {
            count(Count.EXACT)
            filter {
                eq("user_id", userId)
                gte("created_at", sinceIso)
            }
            limit(1L)
        }
        return result.countOrNull()?.toInt() ?: 0
    }

    @Serializable
    private data class PersonalizedParams(
        @SerialName("p_user_lat") val userLat: Double? = null,
        @SerialName("p_user_lon") val userLon: Double? = null,
        @SerialName("p_limit") val limit: Int,
    )

    @Serializable
    private data class TrendingParams(
        @SerialName("p_limit") val limit: Int,
    )

    suspend fun fetchPersonalized(lat: Double?, lon: Double?, limit: Int): List<Recommendation> =
        db().postgrest.rpc(
            function = "get_personalized_recommendations",
            parameters = PersonalizedParams(userLat = lat, userLon = lon, limit = limit),
        ).decodeList<Recommendation>()

    suspend fun fetchTrending(limit: Int): List<Recommendation> =
        db().postgrest.rpc(
            function = "get_trending_events",
            parameters = TrendingParams(limit = limit),
        ).decodeList<Recommendation>()
}
