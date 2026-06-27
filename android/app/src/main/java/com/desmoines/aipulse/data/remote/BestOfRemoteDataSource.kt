package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.LeaderboardEntry
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

    @Serializable
    private data class VoteAggRow(
        @SerialName("entity_type") val entityType: String = "",
        @SerialName("entity_id") val entityId: String? = null,
        @SerialName("custom_entry") val customEntry: String? = null,
    )

    /**
     * Category leaderboard: votes aggregated by entity (or custom write-in),
     * descending by count, with names/images batch-enriched per entity type
     * (fail-soft — a failed enrich leaves the raw entry rather than erroring).
     */
    suspend fun fetchResults(categoryId: String): List<LeaderboardEntry> {
        val votes = db().from("votes")
            .select(Columns.list("entity_type", "entity_id", "custom_entry")) {
                filter { eq("category_id", categoryId) }
            }.decodeList<VoteAggRow>()

        // Aggregate by entity id, or a stable key for write-ins.
        data class Acc(val type: String, val entityId: String?, val custom: String?, var count: Int)
        val grouped = LinkedHashMap<String, Acc>()
        votes.forEach { v ->
            val key = v.entityId ?: "custom:${v.customEntry?.trim()?.lowercase().orEmpty()}"
            val acc = grouped.getOrPut(key) { Acc(v.entityType, v.entityId, v.customEntry, 0) }
            acc.count++
        }

        // Batch-enrich names/images per entity type, fail-soft.
        val byType = grouped.values.filter { it.entityId != null }.groupBy({ it.type }, { it.entityId!! })
        val enrich = mutableMapOf<String, EntityRow>()
        byType.forEach { (type, ids) ->
            runCatching { fetchEntities(type, ids) }.getOrNull()?.forEach { enrich[it.id] = it }
        }

        return grouped.entries.map { (key, acc) ->
            val row = acc.entityId?.let { enrich[it] }
            val name = row?.name ?: row?.title ?: acc.custom?.trim().orEmpty().ifEmpty { "Unknown" }
            LeaderboardEntry(
                key = key,
                entityType = acc.type,
                entityId = acc.entityId,
                customEntry = acc.custom,
                name = name,
                imageUrl = row?.imageUrl,
                voteCount = acc.count,
            )
        }.sortedWith(compareByDescending<LeaderboardEntry> { it.voteCount }.thenBy { it.name.lowercase() })
    }

    private suspend fun fetchEntities(entityType: String, ids: List<String>): List<EntityRow> {
        if (ids.isEmpty()) return emptyList()
        val (table, nameCol) = when (entityType) {
            "restaurant" -> "restaurants" to "name"
            "attraction" -> "attractions" to "name"
            "event" -> "events" to "title"
            else -> return emptyList()
        }
        return db().from(table).select(Columns.list("id", nameCol, "image_url")) {
            filter { isIn("id", ids) }
        }.decodeList<EntityRow>()
    }

    @Serializable
    private data class WinnerVoteRow(
        @SerialName("entity_id") val entityId: String? = null,
        @SerialName("category_id") val categoryId: String? = null,
    )

    @Serializable
    private data class CategoryNameRow(val id: String, val name: String)

    /**
     * Computes the current winner (top entity) of every active category and maps
     * the winning entity id → "Best {Category}" for app-wide award badges.
     * Custom write-ins are excluded (no entity to badge).
     */
    suspend fun fetchWinners(): Map<String, String> {
        val votes = db().from("votes")
            .select(Columns.list("entity_id", "category_id"))
            .decodeList<WinnerVoteRow>()
        val categories = db().from("voting_categories")
            .select(Columns.list("id", "name")) { filter { eq("is_active", true) } }
            .decodeList<CategoryNameRow>()
        val categoryName = categories.associate { it.id to it.name }

        val winners = mutableMapOf<String, String>()
        votes.filter { it.entityId != null && it.categoryId != null }
            .groupBy { it.categoryId!! }
            .forEach { (catId, rows) ->
                val topEntity = rows.groupingBy { it.entityId!! }.eachCount().maxByOrNull { it.value }?.key
                val name = categoryName[catId]
                if (topEntity != null && name != null) winners[topEntity] = "Best $name"
            }
        return winners
    }

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
