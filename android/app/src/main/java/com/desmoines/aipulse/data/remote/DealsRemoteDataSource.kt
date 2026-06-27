package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.Deal
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/** Reads active deals + best-effort redemption tracking. Mirrors iOS DealsService. */
@Singleton
class DealsRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {
    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    /** Active deals (RLS limits to the current date window), featured first then soonest-ending. */
    suspend fun fetchDeals(entityType: String? = null): List<Deal> =
        db().from("deals").select {
            if (!entityType.isNullOrBlank()) {
                filter { eq("entity_type", entityType) }
            }
            order("is_featured", Order.DESCENDING)
            order("end_date", Order.ASCENDING)
        }.decodeList<Deal>()

    @Serializable
    private data class RedeemParams(@SerialName("deal_id") val dealId: String)

    /** Best-effort redemption increment (parity with the web useClaimDeal RPC). */
    suspend fun claimDeal(id: String) {
        db().postgrest.rpc("increment_deal_redemption", RedeemParams(dealId = id))
    }
}
