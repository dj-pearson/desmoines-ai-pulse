package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.util.Config
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.time.YearMonth
import java.time.ZoneOffset
import javax.inject.Inject
import javax.inject.Singleton

/** Preferences the form collects for generate-itinerary. */
data class TripPreferences(
    val interests: List<String>,
    val budget: String,
    val pace: String,
    val groupSize: Int,
    val hasChildren: Boolean,
)

@Serializable
data class GenerateItineraryResponse(
    val success: Boolean = false,
    val tripPlan: TripPlan? = null,
    val error: String? = null,
)

@Singleton
class TripPlannerRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
    private val json: Json,
) {
    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    /** Call generate-itinerary. The edge function authenticates via the current session. */
    suspend fun generate(startDate: String, endDate: String, prefs: TripPreferences): GenerateItineraryResponse {
        val payload = buildJsonObject {
            put("startDate", startDate)
            put("endDate", endDate)
            putJsonObject("preferences") {
                putJsonArray("interests") { prefs.interests.forEach { add(it) } }
                put("budget", prefs.budget)
                put("pace", prefs.pace)
                put("groupSize", prefs.groupSize)
                put("hasChildren", prefs.hasChildren)
            }
        }
        val response = db().functions("generate-itinerary", body = payload)
        val body = response.bodyAsText()
        return json.decodeFromString(GenerateItineraryResponse.serializer(), body)
    }

    /** Count trip_plans the user created in the current calendar month (for the quota meter). */
    suspend fun monthlyTripCount(userId: String): Int {
        val monthStart = YearMonth.now(ZoneOffset.UTC)
            .atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant().toString()
        val result = db().from("trip_plans").select {
            count(Count.EXACT)
            filter {
                eq("user_id", userId)
                gte("created_at", monthStart)
            }
            limit(1L)
        }
        return result.countOrNull()?.toInt() ?: 0
    }

    /** All of the user's saved trips, newest first. */
    suspend fun fetchSavedTrips(userId: String): List<TripPlan> =
        db().from("trip_plans").select {
            filter { eq("user_id", userId) }
            order("created_at", Order.DESCENDING)
        }.decodeList<TripPlan>()

    @Serializable
    private data class PublicUpdate(@SerialName("is_public") val isPublic: Boolean)

    @Serializable
    private data class ShareCodeRow(@SerialName("share_code") val shareCode: String? = null)

    /** Make the trip public and return its public share URL. */
    suspend fun shareTrip(tripId: String): String {
        db().from("trip_plans").update(PublicUpdate(isPublic = true)) {
            filter { eq("id", tripId) }
        }
        val row = db().from("trip_plans").select(Columns.list("share_code")) {
            filter { eq("id", tripId) }
        }.decodeSingleOrNull<ShareCodeRow>()
        val code = row?.shareCode
            ?: throw IllegalStateException("Share link is not ready yet.")
        return "${Config.SITE_URL}/trips/shared/$code"
    }

    /** Delete a trip (RLS restricts to the owner). */
    suspend fun deleteTrip(tripId: String) {
        db().from("trip_plans").delete { filter { eq("id", tripId) } }
    }
}
