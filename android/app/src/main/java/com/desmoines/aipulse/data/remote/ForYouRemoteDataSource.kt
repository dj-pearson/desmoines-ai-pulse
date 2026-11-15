package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.Recommendation
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
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

    /**
     * Personalized rows. get_personalized_recommendations_v2 checks the
     * account's "Personalized suggestions" switch
     * (communication_preferences.event_recommendations) server-side and
     * answers no rows unless it is on, so an opt-out made on the web holds here
     * too (XPLAT-016, migration 20261108000105). v1 is the fallback only while
     * v2 does not exist; it is what older binaries call and is never changed
     * (WEB-FEAT-034). An empty answer is the repository's cue to show trending.
     */
    suspend fun fetchPersonalized(lat: Double?, lon: Double?, limit: Int): List<Recommendation> {
        val params = PersonalizedParams(userLat = lat, userLon = lon, limit = limit)
        return try {
            db().postgrest.rpc(function = PERSONALIZED_V2, parameters = params)
                .decodeList<Recommendation>()
        } catch (error: PostgrestRestException) {
            if (!isMissingFunction(error.code)) throw error
            db().postgrest.rpc(function = PERSONALIZED_V1, parameters = params)
                .decodeList<Recommendation>()
        }
    }

    suspend fun fetchTrending(limit: Int): List<Recommendation> =
        db().postgrest.rpc(
            function = "get_trending_events",
            parameters = TrendingParams(limit = limit),
        ).decodeList<Recommendation>()

    companion object {
        const val PERSONALIZED_V2 = "get_personalized_recommendations_v2"
        const val PERSONALIZED_V1 = "get_personalized_recommendations"

        /** PostgREST's "no such function" (PGRST202) or Postgres's (42883). */
        fun isMissingFunction(code: String?): Boolean = code == "PGRST202" || code == "42883"
    }
}
