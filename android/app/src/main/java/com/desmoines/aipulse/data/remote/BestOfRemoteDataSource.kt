package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.Nominee
import com.desmoines.aipulse.data.model.Vote
import com.desmoines.aipulse.data.model.VotingCategory
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
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

    /** A single category by id (for the voting booth header). */
    suspend fun fetchCategory(categoryId: String): VotingCategory? =
        db().from("voting_categories").select {
            filter { eq("id", categoryId) }
            limit(1L)
        }.decodeSingleOrNull<VotingCategory>()

    /** The caller's existing vote in a category, if any. */
    suspend fun fetchUserVote(categoryId: String, userId: String): Vote? =
        db().from("votes").select {
            filter {
                eq("category_id", categoryId)
                eq("user_id", userId)
            }
            limit(1L)
        }.decodeSingleOrNull<Vote>()

    @Serializable
    private data class EntityRow(
        val id: String,
        val name: String? = null,
        val title: String? = null,
        @SerialName("image_url") val imageUrl: String? = null,
    )

    /** Nominee search across restaurants + attractions (5 each), by name. */
    suspend fun searchNominees(query: String): List<Nominee> {
        val term = "%$query%"
        val restaurants = db().from("restaurants").select(Columns.list("id", "name", "image_url")) {
            filter { ilike("name", term) }
            order("name", Order.ASCENDING)
            limit(5L)
        }.decodeList<EntityRow>().map { Nominee(it.id, it.name.orEmpty(), it.imageUrl, "restaurant") }

        val attractions = db().from("attractions").select(Columns.list("id", "name", "image_url")) {
            filter { ilike("name", term) }
            order("name", Order.ASCENDING)
            limit(5L)
        }.decodeList<EntityRow>().map { Nominee(it.id, it.name.orEmpty(), it.imageUrl, "attraction") }

        return restaurants + attractions
    }

    /** Resolves a voted entity's display name from its content table, or null. */
    suspend fun fetchEntityName(entityType: String, entityId: String): String? {
        val (table, column) = when (entityType) {
            "restaurant" -> "restaurants" to "name"
            "attraction" -> "attractions" to "name"
            "event" -> "events" to "title"
            else -> return null
        }
        val row = db().from(table).select(Columns.list("id", column)) {
            filter { eq("id", entityId) }
            limit(1L)
        }.decodeSingleOrNull<EntityRow>()
        return row?.name ?: row?.title
    }

    @Serializable
    private data class VoteUpsert(
        @SerialName("category_id") val categoryId: String,
        @SerialName("entity_type") val entityType: String,
        @SerialName("entity_id") val entityId: String?,
        @SerialName("custom_entry") val customEntry: String?,
        @SerialName("user_id") val userId: String,
    )

    /**
     * Casts or changes the caller's vote with a single atomic upsert on the
     * `(category_id, user_id)` unique constraint — no delete-then-insert, so
     * the live count never dips to zero (mirrors iOS BUG-002).
     */
    suspend fun castVote(
        categoryId: String,
        userId: String,
        entityType: String,
        entityId: String?,
        customEntry: String?,
    ) {
        db().from("votes").upsert(
            VoteUpsert(
                categoryId = categoryId,
                entityType = entityType,
                entityId = entityId,
                customEntry = customEntry,
                userId = userId,
            ),
        ) {
            onConflict = "category_id,user_id"
        }
    }
}
