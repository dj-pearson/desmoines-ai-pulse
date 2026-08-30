package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.SponsoredPick
import com.desmoines.aipulse.data.model.SponsoredPickResponse
import com.desmoines.aipulse.util.AppLogger
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.functions.functions
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Fetches a labeled sponsored pick for an AI surface via `get-sponsored-pick`.
 * Free tier only: premium tiers short-circuit to null locally (the server also
 * re-checks via the bearer token). Any failure / no inventory returns null.
 * Mirrors iOS SponsoredPickService.
 */
@Singleton
class SponsoredPickService @Inject constructor(
    private val supabaseClient: SupabaseClient?,
    private val billingService: BillingService,
    private val json: Json,
) {
    /** Valid AI surfaces accepted by the edge function. */
    object Surface {
        const val ASK_PULSE = "ask_pulse"
        const val SURPRISE_ME = "surprise_me"
        const val TRIP_PLANNER = "trip_planner"
    }

    suspend fun fetch(surface: String, query: String? = null): SponsoredPick? {
        // Premium users never see sponsored picks — skip the network entirely.
        if (billingService.currentTier.value.isPremium) return null
        val client = supabaseClient ?: return null

        return runCatching {
            val payload = buildJsonObject {
                put("surface", surface)
                query?.trim()?.takeIf { it.isNotEmpty() }?.let { put("query", it) }
            }
            val response = client.functions("get-sponsored-pick", body = payload)
            if (response.status.value !in 200..299) return@runCatching null
            json.decodeFromString(SponsoredPickResponse.serializer(), response.bodyAsText())
                .pick
                ?.takeIf { it.isRenderable }
        }.onFailure { AppLogger.network.warning("get-sponsored-pick failed: ${it.message}") }
            .getOrNull()
    }
}
