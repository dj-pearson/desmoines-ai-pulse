package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.TripPlan
import com.desmoines.aipulse.data.model.TripPlanItem
import com.desmoines.aipulse.util.Config
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
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

/**
 * Preferences the form collects for generate-itinerary.
 *
 * Carries all ten fields the edge function accepts
 * (generate-itinerary/index.ts:35-52). It previously carried five, so
 * accessibility and dietary requirements were simply unreachable on Android —
 * a user-facing regression against web, not a missing nicety (XPLAT-010).
 *
 * The optional fields default to empty and are omitted from the payload when
 * empty, so a request that does not use them is byte-identical to before.
 */
data class TripPreferences(
    val interests: List<String>,
    val budget: String,
    val pace: String,
    val groupSize: Int,
    val hasChildren: Boolean,
    val childAges: List<Int> = emptyList(),
    val accessibilityNeeds: List<String> = emptyList(),
    val dietaryRestrictions: List<String> = emptyList(),
    val mustSee: List<String> = emptyList(),
    val avoidCategories: List<String> = emptyList(),
)

@Serializable
data class GenerateItineraryResponse(
    val success: Boolean = false,
    val tripPlan: TripPlan? = null,
    val error: String? = null,
)

/**
 * A structured refusal from generate-itinerary (XPLAT-010 AC2).
 *
 * The function answers 403 with {error, code:"upgrade_required"} and 429 with
 * {error, code:"quota_exceeded"}. Android read neither the status nor the code,
 * so a free user who hit the paywall and a user who ran out of monthly trips
 * both got the same generic failure, while web (useTripPlanner.ts:175-185)
 * unpacks the body and shows an upgrade prompt.
 */
class TripPlannerServerError(
    override val message: String,
    val code: String? = null,
) : Exception(message)

@Serializable
internal data class ServerErrorBody(
    val error: String? = null,
    val code: String? = null,
)

/**
 * Maps a generate-itinerary response to a typed error, or null when it is not
 * an error at all.
 *
 * Pure and internal so it can be unit-tested without a Supabase client or an
 * Android Context - the reason the status check was missing in the first place
 * is that everything around it needs both.
 *
 * A non-2xx WITHOUT a parseable body still produces an error: falling through
 * to the normal decode would surface `success:false, error:null` and the user
 * would see nothing at all.
 */
internal fun tripPlannerServerError(
    isSuccessStatus: Boolean,
    statusCode: Int,
    body: String,
    json: Json,
): TripPlannerServerError? {
    if (isSuccessStatus) return null

    val parsed = runCatching {
        json.decodeFromString(ServerErrorBody.serializer(), body)
    }.getOrNull()

    return TripPlannerServerError(
        message = parsed?.error?.takeIf { it.isNotBlank() }
            ?: "Trip planning is unavailable right now (HTTP $statusCode).",
        code = parsed?.code,
    )
}

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
                // Omitted when empty so an unused field never widens the request.
                if (prefs.childAges.isNotEmpty()) {
                    putJsonArray("childAges") { prefs.childAges.forEach { add(it) } }
                }
                if (prefs.accessibilityNeeds.isNotEmpty()) {
                    putJsonArray("accessibilityNeeds") { prefs.accessibilityNeeds.forEach { add(it) } }
                }
                if (prefs.dietaryRestrictions.isNotEmpty()) {
                    putJsonArray("dietaryRestrictions") { prefs.dietaryRestrictions.forEach { add(it) } }
                }
                if (prefs.mustSee.isNotEmpty()) {
                    putJsonArray("mustSee") { prefs.mustSee.forEach { add(it) } }
                }
                if (prefs.avoidCategories.isNotEmpty()) {
                    putJsonArray("avoidCategories") { prefs.avoidCategories.forEach { add(it) } }
                }
            }
        }
        val response = db().functions("generate-itinerary", body = payload)
        val body = response.bodyAsText()

        // Status first. A 403 or 429 carries a structured {error, code} body that
        // decodes cleanly into GenerateItineraryResponse as success:false, so
        // without this check the refusal reason is silently discarded and the
        // caller cannot tell a paywall from a backend fault (XPLAT-010 AC2).
        tripPlannerServerError(response.status.isSuccess(), response.status.value, body, json)
            ?.let { throw it }

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

    /** A single saved trip's header row, for the detail screen (items load separately via RPC). */
    suspend fun fetchTrip(tripId: String): TripPlan =
        db().from("trip_plans").select {
            filter { eq("id", tripId) }
            limit(1L)
        }.decodeSingle<TripPlan>()

    @Serializable
    private data class ItineraryParams(@SerialName("p_trip_id") val tripId: String)

    /** Day-by-day items for a trip via the get_trip_itinerary RPC. */
    suspend fun fetchItems(tripId: String): List<TripPlanItem> =
        db().postgrest.rpc(
            function = "get_trip_itinerary",
            parameters = ItineraryParams(tripId = tripId),
        ).decodeList<TripPlanItem>()

    @Serializable
    private data class OrderUpdate(@SerialName("order_index") val orderIndex: Int)

    /**
     * Persist a new ordering by writing each item's order_index. Returns true only
     * if every write succeeds, so the caller can reconcile with server truth on
     * partial failure (mirrors iOS persistOrder).
     */
    suspend fun persistOrder(items: List<TripPlanItem>): Boolean {
        var allSucceeded = true
        items.forEachIndexed { index, item ->
            val id = item.itemId ?: return@forEachIndexed
            runCatching {
                db().from("trip_plan_items").update(OrderUpdate(orderIndex = index)) {
                    filter { eq("id", id) }
                }
            }.onFailure { allSucceeded = false }
        }
        return allSucceeded
    }
}
