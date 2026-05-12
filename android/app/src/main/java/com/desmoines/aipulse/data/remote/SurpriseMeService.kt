package com.desmoines.aipulse.data.remote

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Client for the get_surprise_pick RPC + outcome tracking.
 * Mirrors iOS SurpriseMeService.swift.
 */
@Singleton
class SurpriseMeService @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {

    @Serializable
    data class Pick(
        @SerialName("item_type") val itemType: String,
        @SerialName("item_id") val itemId: String,
        val title: String? = null,
        val description: String? = null,
        @SerialName("image_url") val imageUrl: String? = null,
        val reason: String,
        @SerialName("reason_template") val reasonTemplate: String? = null,
    )

    enum class Outcome(val value: String) {
        SHOWN("shown"),
        SAVED("saved"),
        TRIED_ANOTHER("tried_another"),
        OPENED("opened"),
    }

    @Serializable
    private data class RpcParams(
        val p_user_lat: Double? = null,
        val p_user_lon: Double? = null,
    )

    @Serializable
    private data class OutcomeRow(
        val item_type: String,
        val item_id: String,
        val outcome: String,
        val reason_template: String? = null,
    )

    suspend fun surprise(latitude: Double? = null, longitude: Double? = null): Pick {
        val client = supabaseClient
            ?: throw IllegalStateException("Supabase not configured")
        val rows = client.postgrest.rpc(
            function = "get_surprise_pick",
            parameters = RpcParams(p_user_lat = latitude, p_user_lon = longitude),
        ).decodeList<Pick>()
        val pick = rows.firstOrNull() ?: throw IllegalStateException("No surprise pick available")
        // Fire-and-forget shown event
        runCatching { track(pick, Outcome.SHOWN) }
        return pick
    }

    suspend fun track(pick: Pick, outcome: Outcome) {
        val client = supabaseClient ?: return
        client.from("surprise_pick_outcomes").insert(
            OutcomeRow(
                item_type = pick.itemType,
                item_id = pick.itemId,
                outcome = outcome.value,
                reason_template = pick.reasonTemplate,
            )
        )
    }
}
