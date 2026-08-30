package com.desmoines.aipulse.ui.screens.articles

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.desmoines.aipulse.data.model.Article
import com.desmoines.aipulse.data.remote.ArticlesQuery
import com.desmoines.aipulse.data.repository.ArticlesRepository
import com.desmoines.aipulse.util.PaginationGuard
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@Immutable
data class ArticlesUiState(
    val articles: List<Article> = emptyList(),
    val categories: List<String> = emptyList(),
    /** null = "All". */
    val selectedCategory: String? = null,
    val searchText: String = "",
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val hasMore: Boolean = false,
) {
    val isEmpty: Boolean get() = articles.isEmpty() && !isLoading && errorMessage == null
}

/**
 * Articles hub (ANDP-030): browse + search + paginate published guides, with a
 * category chip bar, debounced search, offline first-page cache, and a retry
 * banner that never clears loaded content. Mirrors iOS ArticlesView.
 */
@HiltViewModel
class ArticlesViewModel @Inject constructor(
    private val repository: ArticlesRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ArticlesUiState())
    val uiState: StateFlow<ArticlesUiState> = _uiState.asStateFlow()

    private var loaded = 0
    private var searchJob: Job? = null

    init {
        loadCategories()
        reload(refresh = false)
    }

    private fun loadCategories() {
        viewModelScope.launch {
            repository.fetchCategories().onSuccess { cats ->
                _uiState.update { it.copy(categories = cats) }
            }
        }
    }

    fun onCategorySelected(category: String?) {
        if (category == _uiState.value.selectedCategory) return
        _uiState.update { it.copy(selectedCategory = category) }
        reload(refresh = false)
    }

    fun onSearchTextChanged(text: String) {
        _uiState.update { it.copy(searchText = text) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            reload(refresh = false)
        }
    }

    fun refresh() = reload(refresh = true)

    fun retry() = reload(refresh = false)

    private fun reload(refresh: Boolean) {
        loaded = 0
        _uiState.update { it.copy(isLoading = !refresh && it.articles.isEmpty(), isRefreshing = refresh, errorMessage = null) }
        viewModelScope.launch {
            repository.fetchArticles(currentQuery(offset = 0))
                .onSuccess { resp ->
                    val check = PaginationGuard.validatePage(resp.articles, PAGE_SIZE, emptySet()) { it.id }
                    if (check is PaginationGuard.Result.Invalid) {
                        _uiState.update { it.copy(isLoading = false, isRefreshing = false, errorMessage = "Couldn't load articles. Tap to retry.") }
                        return@onSuccess
                    }
                    loaded = resp.articles.size
                    _uiState.update {
                        it.copy(articles = resp.articles, hasMore = resp.hasMore, isLoading = false, isRefreshing = false, errorMessage = null)
                    }
                }
                .onFailure {
                    // Keep any already-loaded content; show a retry banner.
                    _uiState.update { it.copy(isLoading = false, isRefreshing = false, errorMessage = "Couldn't load articles. Tap to retry.") }
                }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (!state.hasMore || state.isLoadingMore || state.isLoading) return
        _uiState.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.fetchArticles(currentQuery(offset = loaded))
                .onSuccess { resp ->
                    val existingIds = _uiState.value.articles.mapTo(HashSet()) { it.id }
                    val check = PaginationGuard.validatePage(resp.articles, PAGE_SIZE, existingIds) { it.id }
                    if (check is PaginationGuard.Result.Invalid) {
                        // Halt paging and surface a retry rather than appending corrupt data.
                        _uiState.update { it.copy(isLoadingMore = false, hasMore = false, errorMessage = "Couldn't load more. Tap to retry.") }
                        return@onSuccess
                    }
                    loaded += resp.articles.size
                    _uiState.update { it.copy(articles = it.articles + resp.articles, hasMore = resp.hasMore, isLoadingMore = false) }
                }
                .onFailure {
                    _uiState.update { it.copy(isLoadingMore = false, errorMessage = "Couldn't load more. Tap to retry.") }
                }
        }
    }

    private fun currentQuery(offset: Int): ArticlesQuery = ArticlesQuery(
        searchText = _uiState.value.searchText.trim().ifEmpty { null },
        category = _uiState.value.selectedCategory,
        limit = PAGE_SIZE,
        offset = offset,
    )

    companion object {
        private const val PAGE_SIZE = 20
        private const val SEARCH_DEBOUNCE_MS = 350L
    }
}
