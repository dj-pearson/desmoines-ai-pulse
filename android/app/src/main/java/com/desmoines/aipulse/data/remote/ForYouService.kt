package com.desmoines.aipulse.data.remote

import android.util.Log
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.rpc
// Count helpers from postgrest module
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "ForYouService"

/**
 * Client for the For You / Trending Now rails. Mirrors iOS ForYouService.swift.
 * Falls back to "trending" for users with fewer than 5 swipes in last 90 days.
 */
@Singleton
class ForYouService @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {

    enum class Source { FOR_YOU, TRENDING }

    @Serializable
    data class Recommendation(
        val id: String,
        val title: String? = null,
        val date: String? = null,
        val category: String? = null,
        val venue: String? = null,
        @SerialName("image_url") val imageUrl: String? = null,
        @SerialName("is_featured") val isFeatured: Boolean? = null,
        @SerialName("recommendation_score") val recommendationScore: Double? = null,
        @SerialName("recommendation_reason") val recommendationReason: String? = null,
    )

    @Serializable
    private data class PersonalParams(
        val p_user_lat: Double? = null,
        val p_user_lon: Double? = null,
        val p_limit: Int,
    )

    @Serializable
    private data class TrendingParams(val p_limit: Int)

    data class Result(val source: Source, val items: List<Recommendation>)

    suspend fun fetch(limit: Int = 12): Result {
        val client = supabaseClient ?: return Result(Source.TRENDING, emptyList())

        val userId = try {
            client.auth.currentSessionOrNull()?.user?.id
        } catch (_: Exception) {
            null
        }

        // Probe swipe count when authenticated
        val swipeCount = if (userId != null) {
            try {
                val cutoff = Instant.now().minus(90, ChronoUnit.DAYS).toString()
                val response = client.from("swipe_interactions").select {
                    count(Count.EXACT)
                    filter {
                        eq("user_id", userId)
                        gte("created_at", cutoff)
                    }
                    limit(1)
                }
                response.countOrNull()?.toInt() ?: 0
            } catch (e: Exception) {
                Log.w(TAG, "swipe count probe failed: ${e.message}")
                0
            }
        } else 0

        return try {
            if (swipeCount >= 5) {
                val rows = client.postgrest.rpc(
                    function = "get_personalized_recommendations",
                    parameters = PersonalParams(p_limit = limit),
                ).decodeList<Recommendation>()
                Result(Source.FOR_YOU, rows)
            } else {
                val rows = client.postgrest.rpc(
                    function = "get_trending_events",
                    parameters = TrendingParams(p_limit = limit),
                ).decodeList<Recommendation>()
                Result(Source.TRENDING, rows)
            }
        } catch (e: Exception) {
            Log.w(TAG, "For You / Trending fetch failed: ${e.message}")
            Result(Source.TRENDING, emptyList())
        }
    }
}
