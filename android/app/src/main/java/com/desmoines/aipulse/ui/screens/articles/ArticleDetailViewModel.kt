package com.desmoines.aipulse.ui.screens.articles

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Article
import com.desmoines.aipulse.data.model.RecentItemType
import com.desmoines.aipulse.data.repository.ArticlesRepository
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
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
)

/**
 * Single article reader (ANDP-030; rich markdown rendering lands in ANDP-031).
 * Records a recently-viewed signal so the article surfaces on the Dashboard.
 */
@HiltViewModel
class ArticleDetailViewModel @Inject constructor(
    private val repository: ArticlesRepository,
    private val recentlyViewedService: RecentlyViewedService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ArticleDetailUiState())
    val uiState: StateFlow<ArticleDetailUiState> = _uiState.asStateFlow()

    private var articleId: String? = null

    fun load(id: String) {
        articleId = id
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            repository.fetchById(id)
                .onSuccess { article ->
                    if (article == null) {
                        _uiState.update { it.copy(isLoading = false, errorMessage = "This guide is no longer available.") }
                    } else {
                        _uiState.update { it.copy(article = article, isLoading = false, errorMessage = null) }
                        recentlyViewedService.record(
                            type = RecentItemType.ARTICLE,
                            id = article.id,
                            title = article.title,
                            imageUrl = article.featuredImageUrl,
                        )
                    }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoading = false, errorMessage = "Couldn't load this guide. Try again.") }
                }
        }
    }

    fun retry() {
        articleId?.let { load(it) }
    }
}
