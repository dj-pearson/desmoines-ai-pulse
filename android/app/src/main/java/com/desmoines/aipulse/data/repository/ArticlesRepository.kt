package com.desmoines.aipulse.data.repository

import com.desmoines.aipulse.data.model.Article
import com.desmoines.aipulse.data.remote.ArticlesQuery
import com.desmoines.aipulse.data.remote.ArticlesRemoteDataSource
import com.desmoines.aipulse.data.remote.ArticlesResponse
import com.desmoines.aipulse.util.QueryCache
import kotlinx.serialization.builtins.ListSerializer
import javax.inject.Inject
import javax.inject.Singleton

/** Reads published articles, caching the first page for offline cold-start. */
interface ArticlesRepository {
    suspend fun fetchArticles(query: ArticlesQuery = ArticlesQuery()): Result<ArticlesResponse>
    suspend fun fetchById(id: String): Result<Article?>
    suspend fun fetchCategories(): Result<List<String>>
}

@Singleton
class ArticlesRepositoryImpl @Inject constructor(
    private val remote: ArticlesRemoteDataSource,
    private val queryCache: QueryCache,
) : ArticlesRepository {

    private val serializer = ListSerializer(Article.serializer())

    override suspend fun fetchArticles(query: ArticlesQuery): Result<ArticlesResponse> {
        val isFirstPage = query.offset == 0 && query.searchText.isNullOrBlank() && query.category.isNullOrBlank()
        val fresh = runCatching { remote.fetchArticles(query) }.getOrNull()
        if (fresh != null) {
            if (isFirstPage) queryCache.set(CACHE_KEY, fresh.articles, serializer)
            return Result.success(fresh)
        }
        if (isFirstPage) {
            val cached = queryCache.get(CACHE_KEY, serializer, allowStale = true)
            if (cached != null) {
                return Result.success(ArticlesResponse(articles = cached, totalCount = cached.size, hasMore = false))
            }
        }
        return Result.failure(IllegalStateException("Couldn't load articles."))
    }

    override suspend fun fetchById(id: String): Result<Article?> =
        runCatching { remote.fetchById(id) }

    override suspend fun fetchCategories(): Result<List<String>> =
        runCatching { remote.fetchCategories() }

    private companion object {
        const val CACHE_KEY = "articles-first-page"
    }
}
