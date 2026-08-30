package com.desmoines.aipulse.data.remote

import com.desmoines.aipulse.data.model.Article
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/** Query for the articles hub. */
data class ArticlesQuery(
    val searchText: String? = null,
    val category: String? = null,
    val limit: Int = 20,
    val offset: Int = 0,
)

/** Paginated articles response. */
data class ArticlesResponse(
    val articles: List<Article>,
    val totalCount: Int,
    val hasMore: Boolean,
)

/** Reads published articles. Mirrors iOS ArticlesService. */
@Singleton
class ArticlesRemoteDataSource @Inject constructor(
    private val supabaseClient: SupabaseClient?,
) {
    private fun db(): SupabaseClient =
        supabaseClient ?: throw IllegalStateException("Supabase client is not configured.")

    suspend fun fetchArticles(query: ArticlesQuery = ArticlesQuery()): ArticlesResponse {
        val result = db().from("articles").select {
            count(Count.EXACT)
            filter { eq("status", "published") }
            if (!query.searchText.isNullOrBlank()) {
                filter {
                    or {
                        ilike("title", "%${query.searchText}%")
                        ilike("excerpt", "%${query.searchText}%")
                        ilike("category", "%${query.searchText}%")
                    }
                }
            }
            if (!query.category.isNullOrBlank()) {
                filter { eq("category", query.category) }
            }
            order("published_at", Order.DESCENDING)
            range(query.offset.toLong(), (query.offset + query.limit - 1).toLong())
        }
        val articles = result.decodeList<Article>()
        val total = result.countOrNull()?.toInt() ?: articles.size
        return ArticlesResponse(
            articles = articles,
            totalCount = total,
            hasMore = query.offset + query.limit < total,
        )
    }

    suspend fun fetchById(id: String): Article? =
        db().from("articles").select {
            filter { eq("id", id) }
            limit(1L)
        }.decodeSingleOrNull<Article>()

    @Serializable
    private data class CategoryRow(val category: String? = null)

    /** Distinct published categories, for the chip bar. */
    suspend fun fetchCategories(): List<String> =
        db().from("articles").select(Columns.list("category")) {
            filter { eq("status", "published") }
        }.decodeList<CategoryRow>()
            .mapNotNull { it.category?.trim()?.takeIf { c -> c.isNotEmpty() } }
            .distinct()
            .sorted()
}
