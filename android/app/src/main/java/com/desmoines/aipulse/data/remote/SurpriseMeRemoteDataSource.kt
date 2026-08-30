package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.SurprisePick
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Client for the get_surprise_pick RPC + outcome tracking. Mirrors iOS
 * SurpriseMeService. Location is optional (the RPC accepts null lat/lon).
 */
@Singleton
class SurpriseMeRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {
    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    @Serializable
    private data class Params(
        @SerialName("p_user_lat") val lat: Double? = null,
        @SerialName("p_user_lon") val lon: Double? = null,
    )

    /** Fetch a single curated pick, or null if the RPC returns none. */
    suspend fun surprise(lat: Double?, lon: Double?): SurprisePick? =
        db().postgrest.rpc(
            function = "get_surprise_pick",
            parameters = Params(lat = lat, lon = lon),
        ).decodeList<SurprisePick>().firstOrNull()

    @Serializable
    private data class OutcomeRow(
        @SerialName("item_type") val itemType: String,
        @SerialName("item_id") val itemId: String,
        val outcome: String,
        @SerialName("reason_template") val reasonTemplate: String?,
    )

    /** Record an outcome (shown / saved / tried_another / opened) for analytics. */
    suspend fun track(pick: SurprisePick, outcome: String) {
        db().from("surprise_pick_outcomes").insert(
            OutcomeRow(
                itemType = pick.itemType,
                itemId = pick.itemId,
                outcome = outcome,
                reasonTemplate = pick.reasonTemplate,
            ),
        )
    }
}
