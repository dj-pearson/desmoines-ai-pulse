package com.desmoines.aipulse.data.remote

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.desmoines.aipulse.data.model.CampaignAd
import com.desmoines.aipulse.data.repository.AuthRepository
import com.desmoines.aipulse.util.AdFrequencyGate
import com.desmoines.aipulse.util.AnalyticsService
import com.desmoines.aipulse.util.AppLogger
import com.desmoines.aipulse.util.ConsentService
import com.desmoines.aipulse.util.NetworkMonitor
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private val Context.adEventStore: DataStore<Preferences> by preferencesDataStore(name = "ad_events")

/**
 * Records ad impressions/clicks to `ad_impressions` / `ad_clicks` with a pure
 * in-memory de-dupe + frequency cap, consent gating, and an offline-safe queue
 * that flushes on reconnect. Mirrors iOS AdTrackingService.
 *
 * Ads still render without analytics consent — we just don't persist metrics
 * (and any queued events are dropped if consent is revoked).
 */
@Singleton
class AdTrackingService @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val supabaseClient: SupabaseClient?,
    private val consentService: ConsentService,
    private val analyticsService: AnalyticsService,
    private val networkMonitor: NetworkMonitor,
    private val authRepository: AuthRepository,
    private val json: Json,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val queueKey = stringPreferencesKey("pending_ad_events")
    private val queueSerializer = ListSerializer(PendingAdEvent.serializer())

    private val sessionId: String = UUID.randomUUID().toString()
    private val gate = AdFrequencyGate()
    private val impressionIds = mutableMapOf<String, String>()

    init {
        // Flush whenever connectivity returns; StateFlow replays the current value.
        scope.launch { networkMonitor.isConnected.collect { connected -> if (connected) flush() } }
        // Drop queued events the moment analytics consent is revoked.
        scope.launch { consentService.analyticsConsent.collect { granted -> if (!granted) clearQueue() } }
    }

    /** Frequency cap: whether [campaignId] may still be shown this session. */
    fun canShow(campaignId: String): Boolean = gate.canShow(campaignId)

    /** Logs a viewable impression (deduped per creative/session). No-op on a duplicate. */
    fun recordImpression(ad: CampaignAd, placement: String) {
        if (!gate.registerImpression(ad.campaignId, ad.creativeId)) return
        val impressionId = UUID.randomUUID().toString()
        impressionIds[idKey(ad)] = impressionId

        analyticsService.logEvent(
            EVENT_IMPRESSION,
            mapOf("placement" to placement, "inventory_class" to INVENTORY_CLASS, "campaign_id" to ad.campaignId),
        )
        if (consentService.analyticsConsent.value) {
            enqueue(
                PendingAdEvent(
                    type = TYPE_IMPRESSION,
                    campaignId = ad.campaignId,
                    creativeId = ad.creativeId,
                    placementType = placement,
                    sessionId = sessionId,
                    userId = authRepository.currentUserId,
                    impressionId = impressionId,
                ),
            )
        }
    }

    /** Logs a click, linking to the prior impression id when known. */
    fun recordClick(ad: CampaignAd) {
        analyticsService.logEvent(
            EVENT_CLICK,
            mapOf("inventory_class" to INVENTORY_CLASS, "campaign_id" to ad.campaignId),
        )
        if (consentService.analyticsConsent.value) {
            enqueue(
                PendingAdEvent(
                    type = TYPE_CLICK,
                    campaignId = ad.campaignId,
                    creativeId = ad.creativeId,
                    impressionId = impressionIds[idKey(ad)],
                ),
            )
        }
    }

    private fun idKey(ad: CampaignAd) = "${ad.campaignId}:${ad.creativeId}"

    private fun enqueue(event: PendingAdEvent) {
        scope.launch {
            context.adEventStore.edit { prefs ->
                val queue = decode(prefs[queueKey]) + event
                prefs[queueKey] = json.encodeToString(queueSerializer, queue)
            }
            flush()
        }
    }

    private suspend fun flush() {
        val client = supabaseClient ?: return
        if (!consentService.analyticsConsent.value) { clearQueue(); return }
        if (!networkMonitor.isConnected.value) return

        val queue = decode(context.adEventStore.data.first()[queueKey])
        if (queue.isEmpty()) return

        val remaining = mutableListOf<PendingAdEvent>()
        for (event in queue) {
            val sent = runCatching {
                when (event.type) {
                    TYPE_IMPRESSION -> client.from("ad_impressions").insert(
                        ImpressionInsert(
                            id = event.impressionId,
                            campaignId = event.campaignId,
                            creativeId = event.creativeId,
                            placementType = event.placementType ?: "below_fold",
                            sessionId = event.sessionId ?: sessionId,
                            userId = event.userId,
                        ),
                    )
                    TYPE_CLICK -> client.from("ad_clicks").insert(
                        ClickInsert(
                            campaignId = event.campaignId,
                            creativeId = event.creativeId,
                            impressionId = event.impressionId,
                        ),
                    )
                    else -> Unit
                }
            }.onFailure { AppLogger.network.warning("ad event flush failed: ${it.message}") }.isSuccess
            if (!sent) remaining.add(event)
        }
        saveQueue(remaining)
    }

    private suspend fun saveQueue(events: List<PendingAdEvent>) {
        context.adEventStore.edit { prefs ->
            if (events.isEmpty()) prefs.remove(queueKey)
            else prefs[queueKey] = json.encodeToString(queueSerializer, events)
        }
    }

    private fun clearQueue() {
        scope.launch { context.adEventStore.edit { it.remove(queueKey) } }
    }

    private fun decode(raw: String?): List<PendingAdEvent> =
        if (raw.isNullOrBlank()) emptyList()
        else runCatching { json.decodeFromString(queueSerializer, raw) }.getOrDefault(emptyList())

    @Serializable
    private data class PendingAdEvent(
        val type: String,
        val campaignId: String,
        val creativeId: String,
        val placementType: String? = null,
        val sessionId: String? = null,
        val userId: String? = null,
        val impressionId: String? = null,
    )

    @Serializable
    private data class ImpressionInsert(
        val id: String?,
        @SerialName("campaign_id") val campaignId: String,
        @SerialName("creative_id") val creativeId: String,
        @SerialName("placement_type") val placementType: String,
        @SerialName("session_id") val sessionId: String,
        @SerialName("user_id") val userId: String?,
    )

    @Serializable
    private data class ClickInsert(
        @SerialName("campaign_id") val campaignId: String,
        @SerialName("creative_id") val creativeId: String,
        @SerialName("impression_id") val impressionId: String?,
    )

    private companion object {
        const val TYPE_IMPRESSION = "impression"
        const val TYPE_CLICK = "click"
        const val EVENT_IMPRESSION = "ad_impression"
        const val EVENT_CLICK = "ad_click"
        const val INVENTORY_CLASS = "sponsored"
    }
}
