package com.desmoines.aipulse.ui.screens.articles

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Article
import com.desmoines.aipulse.data.model.RecentItemType
import com.desmoines.aipulse.data.remote.ArticlesQuery
import com.desmoines.aipulse.data.repository.ArticlesRepository
import com.desmoines.aipulse.util.ArticleFavoritesStore
import com.desmoines.aipulse.util.RecentlyViewedService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class ArticleDetailUiState(
    val article: Article? = null,
    val related: List<Article> = emptyList(),
    val isSaved: Boolean = false,
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    /** One-shot toast (save/share confirmations). */
    val toast: String? = null,
)

/**
 * Single article reader (ANDP-031): loads the article, renders markdown,
 * records a recently-viewed signal, exposes save (local bookmark) + share,
 * and a related rail of same-category guides. Mirrors iOS ArticleDetailView.
 */
@HiltViewModel
class ArticleDetailViewModel @Inject constructor(
    private val repository: ArticlesRepository,
    private val recentlyViewedService: RecentlyViewedService,
    private val articleFavoritesStore: ArticleFavoritesStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ArticleDetailUiState())
    val uiState: StateFlow<ArticleDetailUiState> = _uiState.asStateFlow()

    private var articleId: String? = null

    fun load(id: String) {
        articleId = id
        _uiState.update { it.copy(isLoading = true, errorMessage = null, isSaved = articleFavoritesStore.isSaved(id)) }
        viewModelScope.launch {
            repository.fetchById(id)
                .onSuccess { article ->
                    if (article == null) {
                        _uiState.update { it.copy(isLoading = false, errorMessage = "This guide is no longer available.") }
                        return@onSuccess
                    }
                    _uiState.update { it.copy(article = article, isLoading = false, errorMessage = null) }
                    recentlyViewedService.record(
                        type = RecentItemType.ARTICLE,
                        id = article.id,
                        title = article.title,
                        imageUrl = article.featuredImageUrl,
                    )
                    loadRelated(article)
                }
                .onFailure {
                    _uiState.update { it.copy(isLoading = false, errorMessage = "Couldn't load this guide. Try again.") }
                }
        }
    }

    private fun loadRelated(article: Article) {
        val category = article.category ?: return
        viewModelScope.launch {
            repository.fetchArticles(ArticlesQuery(category = category, limit = 6))
                .onSuccess { resp ->
                    val related = resp.articles.filterNot { it.id == article.id }.take(4)
                    _uiState.update { it.copy(related = related) }
                }
        }
    }

    fun toggleSave() {
        val id = articleId ?: return
        viewModelScope.launch {
            val saved = articleFavoritesStore.toggle(id)
            _uiState.update { it.copy(isSaved = saved, toast = if (saved) "Saved" else "Removed") }
        }
    }

    fun onShared() = _uiState.update { it.copy(toast = "Shared") }

    fun consumeToast() = _uiState.update { it.copy(toast = null) }

    fun retry() {
        articleId?.let { load(it) }
    }
}
