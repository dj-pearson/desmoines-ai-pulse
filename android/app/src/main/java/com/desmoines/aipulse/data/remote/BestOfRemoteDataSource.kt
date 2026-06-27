package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.VotingCategory
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/** Reads Best Of voting categories + per-category vote counts. Mirrors iOS BestOf service / web useVoting. */
@Singleton
class BestOfRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {
    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    /** Active categories with vote counts injected (counts aggregated client-side, mirroring web). */
    suspend fun fetchCategories(): List<VotingCategory> {
        val categories = db().from("voting_categories").select {
            filter { eq("is_active", true) }
            order("name", Order.ASCENDING)
        }.decodeList<VotingCategory>()

        val counts = fetchVoteCounts()
        return categories.map { it.copy(voteCount = counts[it.id] ?: 0) }
    }

    @Serializable
    private data class CategoryIdRow(@kotlinx.serialization.SerialName("category_id") val categoryId: String? = null)

    /** Vote totals per category, grouped client-side over the votes table (web useVoting parity). */
    private suspend fun fetchVoteCounts(): Map<String, Int> =
        db().from("votes").select(Columns.list("category_id"))
            .decodeList<CategoryIdRow>()
            .mapNotNull { it.categoryId }
            .groupingBy { it }
            .eachCount()
}
