package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.LeaderboardEntry
import com.desmoines.aipulse.data.model.Nominee
import com.desmoines.aipulse.data.model.Vote
import com.desmoines.aipulse.data.model.VotingCategory
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
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
    private data class CategoryTallyRow(
        @SerialName("category_id") val categoryId: String? = null,
        @SerialName("vote_count") val voteCount: Int = 0,
    )

    /**
     * Vote totals per category, aggregated server-side (WEB-SEC-025 step 2).
     *
     * This used to select every row of `votes` and count them in Kotlin, so
     * the device held one row per ballot -- and `votes` carries `user_id`
     * under a SELECT policy of USING (true). The RPC returns counts and
     * nothing else, so the leaderboard stops depending on a read that step 3
     * revokes.
     */
    private suspend fun fetchVoteCounts(): Map<String, Int> =
        db().postgrest.rpc(function = "voting_category_tallies")
            .decodeList<CategoryTallyRow>()
            .mapNotNull { row -> row.categoryId?.let { it to row.voteCount } }
            .toMap()

    @Serializable
    private data class VoteAggRow(
        @SerialName("entity_type") val entityType: String = "",
        @SerialName("entity_id") val entityId: String? = null,
        @SerialName("custom_entry") val customEntry: String? = null,
        @SerialName("vote_count") val voteCount: Int = 0,
    )

    @Serializable
    private data class CategoryIdParams(@SerialName("p_category_id") val categoryId: String)

    /**
     * Category leaderboard: votes aggregated by entity (or custom write-in),
     * descending by count, with names/images batch-enriched per entity type
     * (fail-soft — a failed enrich leaves the raw entry rather than erroring).
     */
    suspend fun fetchResults(categoryId: String): List<LeaderboardEntry> {
        // Aggregated server-side (WEB-SEC-025 step 2). The RPC groups by
        // entity_id, falling back to custom_entry, which is the same grouping
        // this method used to do over the raw ballots -- and it returns no
        // user_id and no vote ids.
        val votes = db().postgrest
            .rpc(function = "voting_results", parameters = CategoryIdParams(categoryId = categoryId))
            .decodeList<VoteAggRow>()

        // One row per entity already; the key is kept so write-ins collapse the
        // same way they did before.
        data class Acc(val type: String, val entityId: String?, val custom: String?, var count: Int)
        val grouped = LinkedHashMap<String, Acc>()
        votes.forEach { v ->
            val key = v.entityId ?: "custom:${v.customEntry?.trim()?.lowercase().orEmpty()}"
            grouped[key] = Acc(v.entityType, v.entityId, v.customEntry, v.voteCount)
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
    private data class WinnerRow(
        @SerialName("entity_id") val entityId: String? = null,
        @SerialName("category_name") val categoryName: String? = null,
    )

    /**
     * Winning entity of every active category, mapped to "Best {Category}" for
     * app-wide award badges. Custom write-ins are excluded -- there is no
     * entity to badge.
     *
     * Server-side since WEB-SEC-025 step 2. This was the widest of the three
     * raw reads: unlike the leaderboard it was not scoped to a category, so it
     * pulled every ballot ever cast, each carrying user_id.
     *
     * Ties now resolve by entity_id in SQL. The previous maxByOrNull resolved
     * them by whichever key the grouping happened to yield first, which was
     * not stable between calls.
     */
    suspend fun fetchWinners(): Map<String, String> =
        db().postgrest.rpc(function = "voting_winners")
            .decodeList<WinnerRow>()
            .mapNotNull { row ->
                val entity = row.entityId ?: return@mapNotNull null
                val name = row.categoryName ?: return@mapNotNull null
                entity to "Best $name"
            }
            .toMap()

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
